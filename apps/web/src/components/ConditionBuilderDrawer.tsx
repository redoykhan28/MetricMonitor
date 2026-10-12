/**
 * GTM-Style Condition Builder Drawer (Level 2)
 *
 * Slides in on top of the CreateTrackerForm drawer. Lets users build
 * compound AND/OR condition groups — exactly like Google Tag Manager triggers.
 *
 * State structure mirrors TrackerRuleDefinition from the API types.
 * Groups are ORed at root; conditions within each group are ANDed.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, ChevronRight, Zap } from 'lucide-react';

// ─── Types (mirrors API types/rules.ts) ──────────────────────────────────────

export type MetricOperator = 'drops_by' | 'spikes_by' | 'greater_than' | 'less_than' | 'equals' | 'not_equals';
export type DimensionOperator = 'equals' | 'not_equals' | 'contains' | 'does_not_contain' | 'starts_with' | 'in_list';
export type CompareWindow = 'previous_day' | 'avg_7_days' | 'same_day_last_week';

export interface MetricCondition {
  id: string;
  type: 'metric';
  metric: string;
  operator: MetricOperator;
  thresholdValue: number;
  compareWindow?: CompareWindow;
}

export interface DimensionCondition {
  id: string;
  type: 'dimension';
  dimension: string;
  operator: DimensionOperator;
  value: string;
}

export type ConditionItem = MetricCondition | DimensionCondition;

export interface ConditionGroup {
  id: string;
  conditions: ConditionItem[];
}

export interface TrackerRuleDefinition {
  groups: ConditionGroup[];
}

// ─── Static data for dropdowns ────────────────────────────────────────────────

const METRICS = [
  { value: 'activeUsers',            label: 'Active Users' },
  { value: 'sessions',               label: 'Sessions' },
  { value: 'purchaseRevenue',        label: 'Total Revenue' },
  { value: 'eventCount',             label: 'Event Count' },
  { value: 'screenPageViews',        label: 'Page Views' },
  { value: 'engagementRate',         label: 'Engagement Rate' },
  { value: 'bounceRate',             label: 'Bounce Rate' },
  { value: 'conversions',            label: 'Conversions' },
  { value: 'averageSessionDuration', label: 'Avg. Session Duration' },
  { value: 'newUsers',               label: 'New Users' },
];

const DIMENSIONS = [
  { value: 'sessionSource',               label: 'Session Source' },
  { value: 'sessionMedium',              label: 'Session Medium' },
  { value: 'sessionCampaignName',        label: 'Campaign Name' },
  { value: 'sessionDefaultChannelGroup', label: 'Channel Group' },
  { value: 'pagePath',                   label: 'Page Path' },
  { value: 'country',                    label: 'Country' },
  { value: 'deviceCategory',            label: 'Device Category' },
];

const METRIC_OPERATORS = [
  { value: 'drops_by',    label: 'Drops By (%)' },
  { value: 'spikes_by',   label: 'Spikes By (%)' },
  { value: 'greater_than', label: 'Greater Than (>)' },
  { value: 'less_than',   label: 'Less Than (<)' },
  { value: 'equals',      label: 'Equals (=)' },
  { value: 'not_equals',  label: 'Not Equals (≠)' },
];

const DIMENSION_OPERATORS = [
  { value: 'equals',           label: 'Equals' },
  { value: 'not_equals',       label: 'Does Not Equal' },
  { value: 'contains',         label: 'Contains' },
  { value: 'does_not_contain', label: 'Does Not Contain' },
  { value: 'starts_with',      label: 'Starts With' },
  { value: 'in_list',          label: 'Is In List (comma-separated)' },
];

const COMPARE_WINDOWS = [
  { value: 'previous_day',       label: 'Previous Day' },
  { value: 'avg_7_days',         label: 'Average Last 7 Days' },
  { value: 'same_day_last_week', label: 'Same Day Last Week' },
];

// ─── Anomaly Preset Packs ─────────────────────────────────────────────────────

const PRESETS: Array<{
  icon: string;
  name: string;
  description: string;
  rule: TrackerRuleDefinition;
}> = [
  {
    icon: '🔗',
    name: 'Self-Referral / Cross-Domain Break',
    description: 'Your own domain appears as a traffic source — cross-domain tracking is broken',
    rule: {
      groups: [{
        id: 'g1',
        conditions: [
          { id: 'c1', type: 'dimension', dimension: 'sessionSource', operator: 'contains', value: 'your-domain.com' },
          { id: 'c2', type: 'dimension', dimension: 'sessionMedium', operator: 'equals', value: 'referral' },
          { id: 'c3', type: 'metric', metric: 'sessions', operator: 'spikes_by', thresholdValue: 100, compareWindow: 'avg_7_days' },
        ],
      }],
    },
  },
  {
    icon: '💳',
    name: 'Payment Gateway Attribution Hijack',
    description: 'PayPal / Stripe / Klarna is stealing revenue attribution',
    rule: {
      groups: [{
        id: 'g1',
        conditions: [
          { id: 'c1', type: 'dimension', dimension: 'sessionSource', operator: 'in_list', value: 'paypal.com, stripe.com, klarna.com' },
          { id: 'c2', type: 'metric', metric: 'purchaseRevenue', operator: 'greater_than', thresholdValue: 0 },
        ],
      }],
    },
  },
  {
    icon: '🍪',
    name: 'Cookie Consent / Zero Conversions',
    description: 'Sessions firing but no conversion events — consent banner blocking tags',
    rule: {
      groups: [{
        id: 'g1',
        conditions: [
          { id: 'c1', type: 'metric', metric: 'sessions', operator: 'greater_than', thresholdValue: 50 },
          { id: 'c2', type: 'metric', metric: 'eventCount', operator: 'equals', thresholdValue: 0 },
        ],
      }],
    },
  },
  {
    icon: '📊',
    name: 'Unassigned UTM / Broken Campaign Tags',
    description: '"Unassigned" channel surges — UTM parameters stripped by redirect',
    rule: {
      groups: [{
        id: 'g1',
        conditions: [
          { id: 'c1', type: 'dimension', dimension: 'sessionDefaultChannelGroup', operator: 'equals', value: 'Unassigned' },
          { id: 'c2', type: 'metric', metric: 'sessions', operator: 'spikes_by', thresholdValue: 150, compareWindow: 'avg_7_days' },
        ],
      }],
    },
  },
  {
    icon: '⚡',
    name: 'Double-Tracking Tag Detection',
    description: 'Engagement rate near 100% — GA4 tag firing twice',
    rule: {
      groups: [{
        id: 'g1',
        conditions: [
          { id: 'c1', type: 'metric', metric: 'engagementRate', operator: 'greater_than', thresholdValue: 95 },
          { id: 'c2', type: 'metric', metric: 'sessions', operator: 'greater_than', thresholdValue: 100 },
        ],
      }],
    },
  },
  {
    icon: '🛒',
    name: 'Silent Checkout Crash',
    description: 'Site traffic normal but confirmation/thank-you page views collapsed',
    rule: {
      groups: [{
        id: 'g1',
        conditions: [
          { id: 'c1', type: 'dimension', dimension: 'pagePath', operator: 'contains', value: '/thank-you' },
          { id: 'c2', type: 'metric', metric: 'screenPageViews', operator: 'drops_by', thresholdValue: 80, compareWindow: 'previous_day' },
        ],
      }],
    },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function newMetricCondition(): MetricCondition {
  return { id: newId(), type: 'metric', metric: 'sessions', operator: 'drops_by', thresholdValue: 30, compareWindow: 'previous_day' };
}

function newDimensionCondition(): DimensionCondition {
  return { id: newId(), type: 'dimension', dimension: 'sessionSource', operator: 'contains', value: '' };
}

// Placeholder hint rendered inside the condition value input for self-referral preset
// Users must replace 'your-domain.com' with their actual domain.

function newGroup(): ConditionGroup {
  return { id: newId(), conditions: [newMetricCondition()] };
}

function isRelativeMetric(op: MetricOperator) {
  return op === 'drops_by' || op === 'spikes_by';
}

const SELECT_CLS = 'bg-[#0f0f12] border border-[#27272a] rounded-lg px-3 py-1.5 text-sm text-[#e4e4e7] outline-none focus:border-violet-500 transition-colors cursor-pointer';
const INPUT_CLS  = 'bg-[#0f0f12] border border-[#27272a] rounded-lg px-3 py-1.5 text-sm text-[#e4e4e7] outline-none focus:border-violet-500 transition-colors w-full';

// ─── Condition Row ────────────────────────────────────────────────────────────

function ConditionRow({
  cond, groupId, isLast, onUpdate, onRemove,
}: {
  cond: ConditionItem;
  groupId: string;
  isLast: boolean;
  onUpdate: (groupId: string, condId: string, updated: Partial<ConditionItem>) => void;
  onRemove: (groupId: string, condId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 p-3 bg-[#0f0f12] rounded-lg border border-[#27272a]">
        {/* Type selector */}
        <select
          value={cond.type}
          onChange={e => {
            if (e.target.value === 'metric') {
              onUpdate(groupId, cond.id, { type: 'metric', metric: 'sessions', operator: 'drops_by', thresholdValue: 30, compareWindow: 'previous_day' } as any);
            } else {
              onUpdate(groupId, cond.id, { type: 'dimension', dimension: 'sessionSource', operator: 'contains', value: '' } as any);
            }
          }}
          className={SELECT_CLS}
        >
          <option value="metric">Metric</option>
          <option value="dimension">Dimension</option>
        </select>

        {cond.type === 'metric' ? (
          <>
            {/* Metric selector */}
            <select
              value={(cond as MetricCondition).metric}
              onChange={e => onUpdate(groupId, cond.id, { metric: e.target.value })}
              className={SELECT_CLS}
            >
              {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>

            {/* Operator */}
            <select
              value={(cond as MetricCondition).operator}
              onChange={e => onUpdate(groupId, cond.id, { operator: e.target.value as MetricOperator })}
              className={SELECT_CLS}
            >
              {METRIC_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Threshold value */}
            <input
              type="number"
              min={0}
              value={(cond as MetricCondition).thresholdValue}
              onChange={e => onUpdate(groupId, cond.id, { thresholdValue: Number(e.target.value) })}
              className={`${INPUT_CLS} w-24`}
              placeholder="Value"
            />

            {/* Compare window (only for relative operators) */}
            {isRelativeMetric((cond as MetricCondition).operator) && (
              <select
                value={(cond as MetricCondition).compareWindow || 'previous_day'}
                onChange={e => onUpdate(groupId, cond.id, { compareWindow: e.target.value as CompareWindow })}
                className={SELECT_CLS}
              >
                {COMPARE_WINDOWS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            )}
          </>
        ) : (
          <>
            {/* Dimension selector */}
            <select
              value={(cond as DimensionCondition).dimension}
              onChange={e => onUpdate(groupId, cond.id, { dimension: e.target.value })}
              className={SELECT_CLS}
            >
              {DIMENSIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>

            {/* Operator */}
            <select
              value={(cond as DimensionCondition).operator}
              onChange={e => onUpdate(groupId, cond.id, { operator: e.target.value as DimensionOperator })}
              className={SELECT_CLS}
            >
              {DIMENSION_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Value input */}
            <input
              type="text"
              value={(cond as DimensionCondition).value}
              onChange={e => onUpdate(groupId, cond.id, { value: e.target.value })}
              placeholder={(cond as DimensionCondition).operator === 'in_list' ? 'paypal.com, stripe.com' : 'Enter value...'}
              className={`${INPUT_CLS} flex-1 min-w-[120px]`}
            />
          </>
        )}

        {/* Remove condition */}
        <button
          onClick={() => onRemove(groupId, cond.id)}
          className="ml-auto p-1.5 rounded-md hover:bg-red-500/10 text-[#52525b] hover:text-red-400 transition-colors cursor-pointer flex-shrink-0"
          title="Remove condition"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* AND label between conditions */}
      {!isLast && (
        <div className="flex items-center gap-2 pl-3">
          <div className="h-px flex-1 bg-[#27272a]" />
          <span className="text-xs font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded">AND</span>
          <div className="h-px flex-1 bg-[#27272a]" />
        </div>
      )}
    </div>
  );
}

// ─── Group Card ───────────────────────────────────────────────────────────────

function GroupCard({
  group, groupIndex, isLast, totalGroups,
  onUpdateCondition, onRemoveCondition, onAddCondition, onRemoveGroup,
}: {
  group: ConditionGroup;
  groupIndex: number;
  isLast: boolean;
  totalGroups: number;
  onUpdateCondition: (groupId: string, condId: string, updated: Partial<ConditionItem>) => void;
  onRemoveCondition: (groupId: string, condId: string) => void;
  onAddCondition: (groupId: string, type: 'metric' | 'dimension') => void;
  onRemoveGroup: (groupId: string) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Group header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#52525b] uppercase tracking-wider">
            Group {groupIndex + 1}
          </span>
          <span className="text-xs text-[#3f3f46] bg-[#18181b] border border-[#27272a] px-2 py-0.5 rounded">
            All conditions must match (AND)
          </span>
        </div>
        {totalGroups > 1 && (
          <button
            onClick={() => onRemoveGroup(group.id)}
            className="p-1 rounded hover:bg-red-500/10 text-[#52525b] hover:text-red-400 transition-colors cursor-pointer"
            title="Remove group"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Conditions */}
      <div className="pl-3 border-l-2 border-violet-500/30 space-y-2">
        {group.conditions.map((cond, idx) => (
          <ConditionRow
            key={cond.id}
            cond={cond}
            groupId={group.id}
            isLast={idx === group.conditions.length - 1}
            onUpdate={onUpdateCondition}
            onRemove={onRemoveCondition}
          />
        ))}

        {/* Add condition buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onAddCondition(group.id, 'metric')}
            className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 border border-violet-500/20 hover:border-violet-500/40 bg-violet-500/5 hover:bg-violet-500/10 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" /> Add Metric Condition
          </button>
          <button
            onClick={() => onAddCondition(group.id, 'dimension')}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 border border-blue-500/20 hover:border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" /> Add Dimension Filter
          </button>
        </div>
      </div>

      {/* OR divider between groups */}
      {!isLast && (
        <div className="flex items-center gap-3 py-2">
          <div className="h-px flex-1 bg-[#27272a]" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">OR</span>
          </div>
          <div className="h-px flex-1 bg-[#27272a]" />
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ConditionBuilderDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialRule?: TrackerRuleDefinition | null;
  onApply: (rule: TrackerRuleDefinition) => void;
}

export function ConditionBuilderDrawer({
  isOpen, onClose, initialRule, onApply,
}: ConditionBuilderDrawerProps) {
  const [groups, setGroups] = useState<ConditionGroup[]>(
    initialRule?.groups || [newGroup()]
  );
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [showPresets, setShowPresets] = useState(true);

  // ── Reset when drawer opens with new initial value ──
  const handleOpen = () => {
    setGroups(initialRule?.groups || [newGroup()]);
    setActivePreset(null);
  };

  // ── Apply Preset ──
  const applyPreset = (idx: number) => {
    const preset = PRESETS[idx];
    // Deep clone IDs to prevent conflicts
    const cloned: ConditionGroup[] = preset.rule.groups.map(g => ({
      id: newId(),
      conditions: g.conditions.map(c => ({ ...c, id: newId() })),
    }));
    setGroups(cloned);
    setActivePreset(idx);
    setShowPresets(false);
  };

  // ── Group operations ──
  const addGroup = () => setGroups(prev => [...prev, newGroup()]);
  const removeGroup = (groupId: string) =>
    setGroups(prev => prev.filter(g => g.id !== groupId));

  // ── Condition operations ──
  const addCondition = (groupId: string, type: 'metric' | 'dimension') => {
    setGroups(prev => prev.map(g =>
      g.id !== groupId ? g : {
        ...g,
        conditions: [...g.conditions, type === 'metric' ? newMetricCondition() : newDimensionCondition()],
      }
    ));
  };

  const removeCondition = (groupId: string, condId: string) => {
    setGroups(prev => prev.map(g =>
      g.id !== groupId ? g : {
        ...g,
        conditions: g.conditions.filter(c => c.id !== condId),
      }
    ).filter(g => g.conditions.length > 0));
  };

  const updateCondition = (groupId: string, condId: string, updated: Partial<ConditionItem>) => {
    setGroups(prev => prev.map(g =>
      g.id !== groupId ? g : {
        ...g,
        conditions: g.conditions.map(c =>
          c.id !== condId ? c : { ...c, ...updated } as ConditionItem
        ),
      }
    ));
  };

  // ── Validate & Apply ──
  const handleApply = () => {
    // Validate: no empty dimension values
    for (const group of groups) {
      for (const cond of group.conditions) {
        if (cond.type === 'dimension' && !(cond as DimensionCondition).value.trim()) {
          alert('Please fill in all dimension values before applying.');
          return;
        }
      }
    }
    onApply({ groups });
    onClose();
  };

  const totalConditions = groups.reduce((sum, g) => sum + g.conditions.length, 0);

  return (
    <AnimatePresence onExitComplete={() => {}}>
      {isOpen && (
        <>
          {/* Backdrop — slightly darker to stack on the Level 1 drawer backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] cursor-pointer"
          />

          {/* Drawer — Level 2, wider than Level 1 */}
          <motion.div
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.5 }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            onAnimationComplete={(def) => { if (def === 'animate') handleOpen(); }}
            className="fixed top-0 right-0 h-full w-full max-w-2xl bg-[#09090b] border-l border-[#27272a] shadow-2xl z-[111] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#27272a] bg-[#0f0f12]/80 backdrop-blur-sm flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded">CONDITION BUILDER</span>
                  <ChevronRight className="w-3 h-3 text-[#52525b]" />
                </div>
                <h2 className="text-lg font-bold text-[#e4e4e7] mt-1">
                  Alert Trigger Conditions
                </h2>
                <p className="text-xs text-[#71717a] mt-0.5">
                  {totalConditions} condition{totalConditions !== 1 ? 's' : ''} across {groups.length} group{groups.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-[#27272a] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-[#71717a]" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Anomaly Preset Pack Panel */}
              <div className="px-6 pt-5 pb-4 border-b border-[#27272a]">
                <button
                  onClick={() => setShowPresets(p => !p)}
                  className="flex items-center gap-2 text-sm font-semibold text-[#a1a1aa] hover:text-[#e4e4e7] transition-colors cursor-pointer w-full"
                >
                  <Zap className="w-4 h-4 text-amber-400" />
                  Anomaly Preset Packs
                  <span className="ml-auto text-xs text-[#52525b]">{showPresets ? 'Hide ▴' : 'Show ▾'}</span>
                </button>

                <AnimatePresence>
                  {showPresets && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                        {PRESETS.map((preset, idx) => (
                          <button
                            key={idx}
                            onClick={() => applyPreset(idx)}
                            className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                              activePreset === idx
                                ? 'border-violet-500 bg-violet-500/10'
                                : 'border-[#27272a] hover:border-violet-500/40 bg-[#0f0f12] hover:bg-violet-500/5'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-xl flex-shrink-0">{preset.icon}</span>
                              <div>
                                <p className="text-xs font-bold text-[#e4e4e7] leading-tight">{preset.name}</p>
                                <p className="text-xs text-[#71717a] mt-0.5 leading-tight">{preset.description}</p>
                              </div>
                            </div>
                            {activePreset === idx && (
                              <div className="mt-2 text-xs text-violet-400 font-medium">✓ Applied</div>
                            )}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Rule Builder */}
              <div className="px-6 py-5 space-y-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-[#a1a1aa] uppercase tracking-wider">Rule Logic</h3>
                  <div className="text-xs text-[#52525b] bg-[#18181b] border border-[#27272a] px-2 py-1 rounded">
                    Any group triggers alert (OR)
                  </div>
                </div>

                {groups.map((group, idx) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    groupIndex={idx}
                    isLast={idx === groups.length - 1}
                    totalGroups={groups.length}
                    onUpdateCondition={updateCondition}
                    onRemoveCondition={removeCondition}
                    onAddCondition={addCondition}
                    onRemoveGroup={removeGroup}
                  />
                ))}

                {/* Add Group button */}
                <button
                  onClick={addGroup}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-amber-500/30 hover:border-amber-500/60 text-amber-400 hover:text-amber-300 text-sm font-medium bg-amber-500/5 hover:bg-amber-500/10 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add OR Group
                </button>

                {/* Logic explanation */}
                <div className="rounded-xl bg-[#0f0f12] border border-[#27272a] p-4 text-xs text-[#52525b] space-y-1">
                  <p className="font-bold text-[#71717a]">How this works:</p>
                  <p>• <span className="text-violet-400 font-semibold">AND</span> — all conditions in a group must be true simultaneously</p>
                  <p>• <span className="text-amber-400 font-semibold">OR</span> — if any group fires, the alert is sent</p>
                  <p>• The monitoring engine runs daily via Cloudflare Cron and checks each rule</p>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#27272a] bg-[#0f0f12]/80 backdrop-blur-sm flex-shrink-0">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-[#a1a1aa] hover:text-[#e4e4e7] hover:bg-[#27272a] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
              >
                Apply Conditions →
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
