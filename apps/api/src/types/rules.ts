/**
 * Compound Rule Engine — Type Definitions
 * Shared across the monitor service, API routes, and DB layer.
 */

// ─── Operators ────────────────────────────────────────────────────────────────

/** Metric operators: work on numeric GA4 metric values */
export type MetricOperator =
  | 'drops_by'      // % drop vs compare window: (baseline - current) / baseline * 100 >= threshold
  | 'spikes_by'     // % increase vs compare window: (current - baseline) / baseline * 100 >= threshold
  | 'greater_than'  // absolute: current > threshold
  | 'less_than'     // absolute: current < threshold
  | 'equals'        // absolute: current === threshold (e.g. equals 0 → zero-conversion alert)
  | 'not_equals';   // absolute: current !== threshold

/** Dimension operators: work on string GA4 dimension values */
export type DimensionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'does_not_contain'
  | 'starts_with'
  | 'in_list';     // value is a comma-separated list, e.g. "paypal.com,stripe.com"

/** Baseline comparison windows for relative (drops_by / spikes_by) conditions */
export type CompareWindow =
  | 'previous_day'        // yesterday vs day before yesterday
  | 'avg_7_days'          // yesterday vs rolling 7-day average
  | 'same_day_last_week'; // yesterday vs same weekday one week ago (catches Tue ≠ Sat)

// ─── Condition Items ──────────────────────────────────────────────────────────

/** A condition that evaluates a numeric GA4 metric */
export interface MetricCondition {
  id: string;
  type: 'metric';
  /** GA4 metric name — e.g. "sessions", "purchaseRevenue", "eventCount", "engagementRate" */
  metric: string;
  operator: MetricOperator;
  thresholdValue: number;
  /** Required for drops_by / spikes_by operators */
  compareWindow?: CompareWindow;
}

/** A condition that filters/evaluates a GA4 dimension value */
export interface DimensionCondition {
  id: string;
  type: 'dimension';
  /** GA4 dimension name — e.g. "sessionSource", "sessionMedium", "sessionDefaultChannelGroup", "pagePath" */
  dimension: string;
  operator: DimensionOperator;
  /** The value to match against. For in_list: comma-separated, e.g. "paypal.com,stripe.com" */
  value: string;
}

export type ConditionItem = MetricCondition | DimensionCondition;

// ─── Rule Structure ───────────────────────────────────────────────────────────

/**
 * A group of conditions joined by AND.
 * Multiple groups are joined at the root level by the rootConjunction (OR).
 *
 * UI: One horizontal band in the condition builder panel.
 * Logic: ALL conditions within the group must be true for the group to be true.
 */
export interface ConditionGroup {
  id: string;
  /** All conditions in this group are ANDed together */
  conditions: ConditionItem[];
}

/**
 * The top-level rule definition stored as JSON in the trackers.rule_definition column.
 * Evaluated as: group1 OR group2 OR group3 (any group triggers the alert).
 *
 * Design rationale: AND-within-group / OR-between-groups maps directly to
 * Google Tag Manager's trigger condition UX. It's powerful enough to cover
 * all known analytics anomaly patterns without arbitrary nesting complexity.
 */
export interface TrackerRuleDefinition {
  /** Multiple groups are ORed — if ANY group evaluates true, the alert fires */
  groups: ConditionGroup[];
}

// ─── Evaluation Result ────────────────────────────────────────────────────────

/** Result of evaluating a single condition item during a monitoring run */
export interface ConditionResult {
  condition: ConditionItem;
  /** The actual value fetched from GA4 for this condition */
  actualValue: number | string;
  /** The baseline value (only applicable for metric relative conditions) */
  baselineValue?: number;
  /** Whether this specific condition evaluated to true */
  passed: boolean;
}

/** Result of evaluating a full rule definition */
export interface RuleEvaluationResult {
  /** Whether the overall rule triggered (true = alert should fire) */
  triggered: boolean;
  /** Which group caused the trigger (if triggered) */
  triggeringGroupId?: string;
  /** Detailed per-condition results for the triggering group */
  conditionResults: ConditionResult[];
  /** Human-readable summary for alert email body */
  summary: string;
}

// ─── Available GA4 Metrics & Dimensions (for UI dropdowns) ───────────────────

export const AVAILABLE_METRICS = [
  { value: 'activeUsers',             label: 'Active Users' },
  { value: 'sessions',                label: 'Sessions' },
  { value: 'purchaseRevenue',         label: 'Total Revenue' },
  { value: 'eventCount',              label: 'Event Count' },
  { value: 'screenPageViews',         label: 'Page Views' },
  { value: 'engagementRate',          label: 'Engagement Rate' },
  { value: 'bounceRate',              label: 'Bounce Rate' },
  { value: 'conversions',             label: 'Conversions' },
  { value: 'averageSessionDuration',  label: 'Avg. Session Duration (s)' },
  { value: 'newUsers',                label: 'New Users' },
] as const;

export const AVAILABLE_DIMENSIONS = [
  { value: 'sessionSource',                label: 'Session Source' },
  { value: 'sessionMedium',               label: 'Session Medium' },
  { value: 'sessionCampaignName',         label: 'Campaign Name' },
  { value: 'sessionDefaultChannelGroup',  label: 'Channel Group' },
  { value: 'pagePath',                    label: 'Page Path' },
  { value: 'country',                     label: 'Country' },
  { value: 'deviceCategory',              label: 'Device Category' },
] as const;

export const METRIC_OPERATORS: { value: MetricOperator; label: string }[] = [
  { value: 'drops_by',    label: 'Drops By (%)' },
  { value: 'spikes_by',   label: 'Spikes By (%)' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than',   label: 'Less Than' },
  { value: 'equals',      label: 'Equals (=)' },
  { value: 'not_equals',  label: 'Not Equals (≠)' },
];

export const DIMENSION_OPERATORS: { value: DimensionOperator; label: string }[] = [
  { value: 'equals',            label: 'Equals' },
  { value: 'not_equals',        label: 'Does Not Equal' },
  { value: 'contains',          label: 'Contains' },
  { value: 'does_not_contain',  label: 'Does Not Contain' },
  { value: 'starts_with',       label: 'Starts With' },
  { value: 'in_list',           label: 'Is In List (comma-separated)' },
];

export const COMPARE_WINDOWS: { value: CompareWindow; label: string }[] = [
  { value: 'previous_day',        label: 'Previous Day' },
  { value: 'avg_7_days',          label: 'Average Last 7 Days' },
  { value: 'same_day_last_week',  label: 'Same Day Last Week' },
];
