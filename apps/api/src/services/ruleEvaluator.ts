/**
 * Compound Rule Evaluator
 *
 * Evaluates a TrackerRuleDefinition against live GA4 data.
 * Called by the MonitoringEngine for trackers that have a ruleDefinition.
 *
 * Logic:
 *   - Each group is AND-evaluated (all conditions in it must pass).
 *   - Groups are OR-evaluated (any passing group triggers the alert).
 *   - Dimension conditions use GA4 dimension filter API — not post-processed.
 *   - Relative metric conditions (drops_by, spikes_by) fetch baseline separately.
 */

import { GA4Service, GA4DimensionFilter } from './ga4';
import {
  TrackerRuleDefinition,
  ConditionGroup,
  ConditionItem,
  MetricCondition,
  DimensionCondition,
  MetricOperator,
  DimensionOperator,
  CompareWindow,
  ConditionResult,
  RuleEvaluationResult,
} from '../types/rules';

// ─── Date Window Helpers ──────────────────────────────────────────────────────

function getDateRange(window: CompareWindow): { start: string; end: string } {
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString().split('T')[0];

  switch (window) {
    case 'previous_day':
      return { start: daysAgo(2), end: daysAgo(2) };
    case 'avg_7_days':
      return { start: daysAgo(8), end: daysAgo(2) };
    case 'same_day_last_week':
      return { start: daysAgo(7), end: daysAgo(7) };
  }
}

const TODAY = new Date().toISOString().split('T')[0];
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];

// ─── Metric Helpers ───────────────────────────────────────────────────────────

function extractMetricValue(data: any): number {
  const rows = data?.rows || [];
  if (rows.length === 0) return 0;
  // Sum all rows (e.g. when dimension breakdown is returned)
  return rows.reduce(
    (sum: number, row: any) =>
      sum + parseFloat(row.metricValues?.[0]?.value || '0'),
    0
  );
}

function computeBaseline(data: any, window: CompareWindow): number {
  const rows = data?.rows || [];
  if (rows.length === 0) return 0;
  const total = rows.reduce(
    (sum: number, row: any) =>
      sum + parseFloat(row.metricValues?.[0]?.value || '0'),
    0
  );
  // For 7-day average, divide by number of days returned
  if (window === 'avg_7_days') {
    return total / Math.max(rows.length, 1);
  }
  return total;
}

function evaluateMetricOperator(
  op: MetricOperator,
  current: number,
  baseline: number,
  threshold: number
): boolean {
  switch (op) {
    case 'drops_by':
      if (baseline <= 0) return false; // Cannot compute % drop without baseline
      return ((baseline - current) / baseline) * 100 >= threshold;
    case 'spikes_by':
      if (baseline <= 0) return current >= threshold; // If no baseline, treat as absolute
      return ((current - baseline) / baseline) * 100 >= threshold;
    case 'greater_than':
      return current > threshold;
    case 'less_than':
      return current < threshold;
    case 'equals':
      return current === threshold;
    case 'not_equals':
      return current !== threshold;
  }
}

// ─── Dimension Operator → GA4 matchType Mapper ───────────────────────────────

function dimOperatorToGA4(
  op: DimensionOperator,
  value: string
): { ga4Operator: GA4DimensionFilter['operator']; value: string; negate: boolean } {
  switch (op) {
    case 'equals':
      return { ga4Operator: 'EXACT', value, negate: false };
    case 'not_equals':
      return { ga4Operator: 'EXACT', value, negate: true };
    case 'contains':
      return { ga4Operator: 'CONTAINS', value, negate: false };
    case 'does_not_contain':
      return { ga4Operator: 'CONTAINS', value, negate: true };
    case 'starts_with':
      return { ga4Operator: 'BEGINS_WITH', value, negate: false };
    case 'in_list':
      return { ga4Operator: 'IN_LIST', value, negate: false };
  }
}

// ─── Group Evaluator with Dimension-Scoped Metric Queries ────────────────────

async function evaluateGroup(
  group: ConditionGroup,
  ga4PropertyId: string,
  ga4: GA4Service
): Promise<{ passed: boolean; results: ConditionResult[] }> {
  const results: ConditionResult[] = [];

  const dimConditions = group.conditions.filter((c): c is DimensionCondition => c.type === 'dimension');
  const metricConditions = group.conditions.filter((c): c is MetricCondition => c.type === 'metric');

  // Convert dimension conditions in this group to GA4 dimension filters
  const ga4Filters: GA4DimensionFilter[] = dimConditions.map(dc => {
    const mapped = dimOperatorToGA4(dc.operator, dc.value);
    return {
      fieldName: dc.dimension,
      operator: mapped.ga4Operator,
      value: mapped.value,
      negate: mapped.negate,
    };
  });

  // Case 1: Both dimension and metric conditions exist, OR only metric conditions exist
  if (metricConditions.length > 0) {
    for (const mc of metricConditions) {
      const isRelative = mc.operator === 'drops_by' || mc.operator === 'spikes_by';

      // Query current metric value (under dimension filters if any are defined)
      const currentData = ga4Filters.length > 0
        ? await ga4.getMetricWithDimensionFilter(ga4PropertyId, mc.metric, YESTERDAY, YESTERDAY, ga4Filters)
        : await ga4.getMetric(ga4PropertyId, mc.metric, YESTERDAY, YESTERDAY);
      
      const currentValue = extractMetricValue(currentData);

      let baselineValue = 0;
      if (isRelative && mc.compareWindow) {
        const { start, end } = getDateRange(mc.compareWindow);
        const baselineData = ga4Filters.length > 0
          ? await ga4.getMetricWithDimensionFilter(ga4PropertyId, mc.metric, start, end, ga4Filters)
          : await ga4.getMetric(ga4PropertyId, mc.metric, start, end);
        baselineValue = computeBaseline(baselineData, mc.compareWindow);
      }

      const passed = evaluateMetricOperator(
        mc.operator,
        currentValue,
        baselineValue,
        mc.thresholdValue
      );

      results.push({
        condition: mc,
        actualValue: currentValue,
        baselineValue: isRelative ? baselineValue : undefined,
        passed,
      });

      // AND-logic: if this metric condition fails, the whole group fails immediately
      if (!passed) {
        // Record dimension conditions as unfulfilled or context
        for (const dc of dimConditions) {
          results.push({
            condition: dc,
            actualValue: dc.value,
            passed: false,
          });
        }
        return { passed: false, results };
      }
    }

    // All metric conditions passed! Dimension conditions are satisfied because
    // the query ran with those filters and yielded triggering metric values
    for (const dc of dimConditions) {
      results.push({
        condition: dc,
        actualValue: dc.value,
        passed: true,
      });
    }

    return { passed: true, results };
  }

  // Case 2: Only dimension conditions exist in this group (no metric condition)
  // Check if traffic matching these dimension filters occurred yesterday (sessions > 0)
  if (dimConditions.length > 0) {
    const filterData = await ga4.getMetricWithDimensionFilter(
      ga4PropertyId,
      'sessions',
      YESTERDAY,
      YESTERDAY,
      ga4Filters
    );
    const matchedSessions = extractMetricValue(filterData);
    const passed = matchedSessions > 0;

    for (const dc of dimConditions) {
      results.push({
        condition: dc,
        actualValue: passed ? `${matchedSessions} sessions` : '0 sessions',
        passed,
      });
    }

    return { passed, results };
  }

  return { passed: false, results: [] };
}

// ─── Build Human-Readable Alert Summary ──────────────────────────────────────

function buildAlertSummary(
  trackerName: string,
  results: ConditionResult[]
): string {
  const lines = results.map(r => {
    if (r.condition.type === 'metric') {
      const mc = r.condition as MetricCondition;
      const isRelative = mc.operator === 'drops_by' || mc.operator === 'spikes_by';
      if (isRelative && r.baselineValue !== undefined) {
        const pct = r.baselineValue > 0
          ? Math.round(Math.abs(((r.actualValue as number) - r.baselineValue) / r.baselineValue) * 100)
          : 0;
        return `• ${mc.metric}: current=${(r.actualValue as number).toLocaleString()}, baseline=${r.baselineValue.toLocaleString()} (${pct}% change)`;
      }
      return `• ${mc.metric}: ${(r.actualValue as number).toLocaleString()} (threshold: ${mc.thresholdValue})`;
    } else {
      const dc = r.condition as DimensionCondition;
      return `• ${dc.dimension} ${dc.operator} "${dc.value}": found "${r.actualValue}"`;
    }
  });

  return `Tracker "${trackerName}" triggered:\n${lines.join('\n')}`;
}

// ─── Main Export: evaluateRuleDefinition ─────────────────────────────────────

/**
 * Evaluates a complete TrackerRuleDefinition (OR of AND-groups) against GA4 data.
 * Returns a RuleEvaluationResult with full details for logging and alert dispatch.
 */
export async function evaluateRuleDefinition(
  rule: TrackerRuleDefinition,
  trackerName: string,
  ga4PropertyId: string,
  ga4: GA4Service
): Promise<RuleEvaluationResult> {
  for (const group of rule.groups) {
    const { passed, results } = await evaluateGroup(group, ga4PropertyId, ga4);

    if (passed) {
      return {
        triggered: true,
        triggeringGroupId: group.id,
        conditionResults: results,
        summary: buildAlertSummary(trackerName, results),
      };
    }
  }

  return {
    triggered: false,
    conditionResults: [],
    summary: '',
  };
}

/**
 * Extracts a representative current value from condition results for backwards-compatible
 * storage in the tracker_events table (expectedValue / actualValue columns).
 */
export function extractPrimaryMetricValues(results: ConditionResult[]): {
  actualValue: string;
  expectedValue: string;
} {
  const metricResult = results.find(r => r.condition.type === 'metric');
  if (!metricResult) {
    return { actualValue: 'N/A', expectedValue: 'N/A' };
  }
  return {
    actualValue: String(metricResult.actualValue),
    expectedValue: metricResult.baselineValue !== undefined
      ? String(metricResult.baselineValue)
      : 'N/A',
  };
}
