import assert from 'node:assert';
import { evaluateRuleDefinition } from './src/services/ruleEvaluator';
import { TrackerRuleDefinition } from './src/types/rules';

console.log('🧪 Starting Rule Evaluator Test Suite...\n');

// ── Mock GA4Service ─────────────────────────────────────────────────────────
function createMockGA4(responses: {
  metricWithFilter?: (metric: string, filters: any[], start: string, end: string) => any;
  metric?: (metric: string, start: string, end: string) => any;
}) {
  return {
    getMetricWithDimensionFilter: async (_propId: string, metric: string, start: string, end: string, filters: any[]) => {
      if (responses.metricWithFilter) {
        return responses.metricWithFilter(metric, filters, start, end);
      }
      return { rows: [] };
    },
    getMetric: async (_propId: string, metric: string, start: string, end: string) => {
      if (responses.metric) {
        return responses.metric(metric, start, end);
      }
      return { rows: [] };
    },
    getDimensionValues: async () => [],
  } as any;
}

// ── Test 1: Cross-Domain / Self-Referral Leak ───────────────────────────────
async function testCrossDomain() {
  const rule: TrackerRuleDefinition = {
    groups: [{
      id: 'grp_cross_domain',
      conditions: [
        { id: 'c1', type: 'dimension', dimension: 'sessionSource', operator: 'contains', value: 'agency.com' },
        { id: 'c2', type: 'dimension', dimension: 'sessionMedium', operator: 'equals', value: 'referral' },
        { id: 'c3', type: 'metric', metric: 'sessions', operator: 'spikes_by', thresholdValue: 100, compareWindow: 'avg_7_days' },
      ],
    }],
  };

  // Case 1A: Spike detected (yesterday = 84, baseline avg = 2 -> +4100% spike)
  const triggeringGA4 = createMockGA4({
    metricWithFilter: (metric, filters, start, end) => {
      assert.strictEqual(metric, 'sessions');
      assert.strictEqual(filters.length, 2);
      assert.strictEqual(filters[0].fieldName, 'sessionSource');
      assert.strictEqual(filters[0].operator, 'CONTAINS');
      assert.strictEqual(filters[1].fieldName, 'sessionMedium');
      assert.strictEqual(filters[1].operator, 'EXACT');

      if (start === end) {
        // Current day (yesterday)
        return { rows: [{ metricValues: [{ value: '84' }] }] };
      } else {
        // 7-day baseline: 7 days with 2 sessions each = 14 total / 7 = 2
        return {
          rows: Array(7).fill({ metricValues: [{ value: '2' }] }),
        };
      }
    },
  });

  const res1 = await evaluateRuleDefinition(rule, 'Cross-Domain Watchdog', '123456', triggeringGA4);
  assert.strictEqual(res1.triggered, true, 'Scenario A should trigger when referral spike occurs');
  assert.strictEqual(res1.triggeringGroupId, 'grp_cross_domain');
  console.log('✅ Test 1A Passed: Self-Referral Leak alert triggered accurately');

  // Case 1B: No spike (baseline = 2, yesterday = 2) -> NO FALSE POSITIVE!
  const normalGA4 = createMockGA4({
    metricWithFilter: (metric, _filters, start, end) => {
      if (start === end) {
        return { rows: [{ metricValues: [{ value: '2' }] }] };
      } else {
        return { rows: Array(7).fill({ metricValues: [{ value: '2' }] }) };
      }
    },
  });

  const res2 = await evaluateRuleDefinition(rule, 'Cross-Domain Watchdog', '123456', normalGA4);
  assert.strictEqual(res2.triggered, false, 'Scenario A should NOT trigger when traffic is normal');
  console.log('✅ Test 1B Passed: No false positive on normal cross-domain traffic');
}

// ── Test 2: Payment Gateway Attribution Hijack ──────────────────────────────
async function testPaymentGatewayHijack() {
  const rule: TrackerRuleDefinition = {
    groups: [{
      id: 'grp_payment',
      conditions: [
        { id: 'p1', type: 'dimension', dimension: 'sessionSource', operator: 'in_list', value: 'paypal.com, stripe.com' },
        { id: 'p2', type: 'metric', metric: 'purchaseRevenue', operator: 'greater_than', thresholdValue: 0 },
      ],
    }],
  };

  // Case 2A: Revenue hijacked by PayPal ($1,420)
  const hijackedGA4 = createMockGA4({
    metricWithFilter: (metric, filters) => {
      assert.strictEqual(metric, 'purchaseRevenue');
      assert.strictEqual(filters[0].operator, 'IN_LIST');
      assert.strictEqual(filters[0].value, 'paypal.com, stripe.com');
      return { rows: [{ metricValues: [{ value: '1420' }] }] };
    },
  });

  const res1 = await evaluateRuleDefinition(rule, 'Payment Gateway Hijack', '123456', hijackedGA4);
  assert.strictEqual(res1.triggered, true, 'Scenario B should trigger when PayPal steals revenue');
  console.log('✅ Test 2A Passed: Payment Gateway alert triggered when revenue > 0');

  // Case 2B: $0 revenue from payment gateways -> NO FALSE POSITIVE
  const safeGA4 = createMockGA4({
    metricWithFilter: () => {
      return { rows: [{ metricValues: [{ value: '0' }] }] };
    },
  });

  const res2 = await evaluateRuleDefinition(rule, 'Payment Gateway Hijack', '123456', safeGA4);
  assert.strictEqual(res2.triggered, false, 'Scenario B should NOT trigger when revenue = 0');
  console.log('✅ Test 2B Passed: No false positive when payment gateway revenue is 0');
}

// ── Test 3: Cookie Consent Drop / Zero Conversions ──────────────────────────
async function testCookieConsentDrop() {
  const rule: TrackerRuleDefinition = {
    groups: [{
      id: 'grp_consent',
      conditions: [
        { id: 'c1', type: 'metric', metric: 'sessions', operator: 'greater_than', thresholdValue: 50 },
        { id: 'c2', type: 'metric', metric: 'eventCount', operator: 'equals', thresholdValue: 0 },
      ],
    }],
  };

  // Case 3A: 200 sessions, 0 conversion events -> TRIGGER ALERT
  const zeroEventGA4 = createMockGA4({
    metric: (metric) => {
      if (metric === 'sessions') return { rows: [{ metricValues: [{ value: '200' }] }] };
      if (metric === 'eventCount') return { rows: [{ metricValues: [{ value: '0' }] }] };
      return { rows: [] };
    },
  });

  const res1 = await evaluateRuleDefinition(rule, 'Consent Anomaly', '123456', zeroEventGA4);
  assert.strictEqual(res1.triggered, true, 'Scenario C should trigger when sessions > 50 and events = 0');
  console.log('✅ Test 3A Passed: Zero Conversions alert triggered');

  // Case 3B: 200 sessions, 45 conversion events -> NORMAL (NO FALSE POSITIVE)
  const normalEventGA4 = createMockGA4({
    metric: (metric) => {
      if (metric === 'sessions') return { rows: [{ metricValues: [{ value: '200' }] }] };
      if (metric === 'eventCount') return { rows: [{ metricValues: [{ value: '45' }] }] };
      return { rows: [] };
    },
  });

  const res2 = await evaluateRuleDefinition(rule, 'Consent Anomaly', '123456', normalEventGA4);
  assert.strictEqual(res2.triggered, false, 'Scenario C should NOT trigger when events > 0');
  console.log('✅ Test 3B Passed: No false positive when conversions are firing normally');
}

// ── Test 4: OR Conjunction Across Multiple Groups ────────────────────────────
async function testMultiGroupOr() {
  const rule: TrackerRuleDefinition = {
    groups: [
      {
        id: 'group_1_failing',
        conditions: [
          { id: 'g1_m', type: 'metric', metric: 'sessions', operator: 'drops_by', thresholdValue: 90, compareWindow: 'previous_day' },
        ],
      },
      {
        id: 'group_2_triggering',
        conditions: [
          { id: 'g2_m', type: 'metric', metric: 'bounceRate', operator: 'greater_than', thresholdValue: 80 },
        ],
      },
    ],
  };

  const ga4 = createMockGA4({
    metric: (metric, start, end) => {
      if (metric === 'sessions') {
        // 5% drop only, does NOT reach 90%
        if (start === end) return { rows: [{ metricValues: [{ value: '95' }] }] };
        return { rows: [{ metricValues: [{ value: '100' }] }] };
      }
      if (metric === 'bounceRate') {
        // 88% > 80% threshold -> PASSES!
        return { rows: [{ metricValues: [{ value: '88' }] }] };
      }
      return { rows: [] };
    },
  });

  const res = await evaluateRuleDefinition(rule, 'Multi-Group Tracker', '123456', ga4);
  assert.strictEqual(res.triggered, true, 'Multi-group OR should trigger if ANY group passes');
  assert.strictEqual(res.triggeringGroupId, 'group_2_triggering');
  console.log('✅ Test 4 Passed: OR Conjunction across groups functions correctly');
}

async function runAll() {
  await testCrossDomain();
  await testPaymentGatewayHijack();
  await testCookieConsentDrop();
  await testMultiGroupOr();
  console.log('\n🎉 ALL 4 SCENARIOS PASSED WITH ZERO FALSE POSITIVES!\n');
}

runAll().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
