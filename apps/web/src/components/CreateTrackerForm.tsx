import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Loader2, Settings2, CheckCircle2, AlertTriangle, Globe, Search, ChevronDown, Check, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ConditionBuilderDrawer, type TrackerRuleDefinition } from './ConditionBuilderDrawer';

interface CreateTrackerFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  initialTracker?: any | null;
  initialPropertyId?: string;
}

// ─── Human-readable rule summary for the form badge ──────────────────────────
function summariseRule(rule: TrackerRuleDefinition): string {
  const groupSummaries = rule.groups.map((g) => {
    const condSummaries = g.conditions.map(c => {
      if (c.type === 'metric') {
        return `${c.metric} ${c.operator.replace(/_/g, ' ')} ${c.thresholdValue}${
          c.operator === 'drops_by' || c.operator === 'spikes_by' ? '%' : ''
        }`;
      }
      return `${c.dimension} ${c.operator.replace(/_/g, ' ')} "${c.value}"`;
    });
    return `(${condSummaries.join(' AND ')})`;
  });
  return groupSummaries.join(' OR ');
}

export function CreateTrackerForm({ onSuccess, onCancel, initialTracker, initialPropertyId }: CreateTrackerFormProps) {
  const { getToken } = useAuth();
  
  // Basic form state
  const [properties, setProperties] = useState<{ id: string, name: string }[]>([]);
  const [isLoadingProps, setIsLoadingProps] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  
  const [propertyId, setPropertyId] = useState(initialPropertyId || initialTracker?.propertyId || '');
  const [name, setName] = useState(initialTracker?.name || '');

  // Legacy single-metric fields (used when no ruleDefinition set)
  const [metric, setMetric] = useState(initialTracker?.metric || 'activeUsers');
  const [condition, setCondition] = useState(initialTracker?.condition || 'drops_by');
  const [thresholdValue, setThresholdValue] = useState(initialTracker?.thresholdValue ?? 40);
  const [compareWindow, setCompareWindow] = useState(initialTracker?.compareWindow || 'previous_day');

  // Compound rule state
  const [ruleDefinition, setRuleDefinition] = useState<TrackerRuleDefinition | null>(() => {
    if (initialTracker?.ruleDefinition) {
      try {
        return typeof initialTracker.ruleDefinition === 'string'
          ? JSON.parse(initialTracker.ruleDefinition)
          : initialTracker.ruleDefinition;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [isConditionBuilderOpen, setIsConditionBuilderOpen] = useState(false);

  // Searchable property dropdown state
  const [isPropDropdownOpen, setIsPropDropdownOpen] = useState(false);
  const [propSearchQuery, setPropSearchQuery] = useState('');
  const propDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside handler for property dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (propDropdownRef.current && !propDropdownRef.current.contains(e.target as Node)) {
        setIsPropDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasCompoundRule = ruleDefinition !== null && ruleDefinition.groups.length > 0;

  // Fetch available properties
  useEffect(() => {
    getToken().then(token => {
      fetch('http://localhost:8787/api/dashboard/properties', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        setProperties(data.properties || []);
        if (initialPropertyId) {
          setPropertyId(initialPropertyId);
        } else if (data.properties?.length > 0 && !propertyId) {
          setPropertyId(data.properties[0].id);
        }
      })
      .finally(() => setIsLoadingProps(false));
    });
  }, [getToken, propertyId, initialPropertyId]);

  const handleTestRule = async () => {
    if (!propertyId) return toast.error('Please select a property first');
    setIsTesting(true);
    setTestResult(null);

    try {
      const token = await getToken();
      const currentRule = hasCompoundRule
        ? ruleDefinition
        : {
            groups: [{
              id: 'group_simple',
              conditions: [{
                id: 'c1',
                type: 'metric' as const,
                metric,
                operator: condition as any,
                thresholdValue,
                compareWindow: compareWindow as any,
              }]
            }]
          };

      const res = await fetch('http://localhost:8787/api/trackers/test-rule', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          propertyId,
          name: name || 'Test Tracker',
          ruleDefinition: currentRule,
        })
      });

      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error || 'Test failed');

      setTestResult(data.evaluation);
      if (data.evaluation?.triggered) {
        toast.error('Alert would trigger under current live traffic!');
      } else {
        toast.success('Condition evaluated: Normal baseline (safe)');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to test rule');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) return toast.error('Please select a property');
    if (!name.trim()) return toast.error('Please enter a tracker name');

    // If compound rule is set, validate it has at least one condition
    if (hasCompoundRule) {
      const totalConds = ruleDefinition!.groups.reduce((s, g) => s + g.conditions.length, 0);
      if (totalConds === 0) return toast.error('Add at least one condition to your rule');
    }
    
    setIsSaving(true);
    
    try {
      const token = await getToken();

      const payload: any = {
        propertyId,
        name,
        // Always send legacy fields (API requires them for backwards compat)
        metric,
        condition,
        thresholdValue,
        compareWindow,
      };

      // Attach compound rule if set — this overrides the legacy fields in the monitor engine
      if (hasCompoundRule) {
        payload.ruleDefinition = ruleDefinition;
      } else {
        payload.ruleDefinition = null;
      }

      const isEdit = !!initialTracker?.id;
      const url = isEdit
        ? `http://localhost:8787/api/trackers/${initialTracker.id}`
        : 'http://localhost:8787/api/trackers';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success(isEdit ? '✅ Tracker updated!' : (hasCompoundRule ? '🎯 Compound tracker created!' : 'New Tracker rule created!'));
        onSuccess();
      } else {
        const err = await res.json().catch(() => ({})) as any;
        throw new Error(err.error || 'Failed to save tracker');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save tracker');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingProps) {
    return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Property selector — searchable dropdown */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Select GA4 Property</label>
          <div className="relative" ref={propDropdownRef}>
            <button
              type="button"
              onClick={() => setIsPropDropdownOpen(prev => !prev)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-background border text-sm font-medium text-text-main transition-all cursor-pointer shadow-sm ${isPropDropdownOpen ? 'border-primary/40' : 'border-border hover:border-primary/60'}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Globe className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="truncate">
                  {propertyId
                    ? (properties.find(p => p.id === propertyId)?.name || 'Unknown Property')
                    : 'Select a property...'}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-text-muted flex-shrink-0 transition-transform duration-200 ${isPropDropdownOpen ? 'rotate-180 text-primary' : ''}`} />
            </button>

            {isPropDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-full bg-surface/98 backdrop-blur-md border border-primary/40 rounded-xl shadow-2xl z-50 p-1.5 space-y-1">
                {/* Search input */}
                <div className="relative p-1">
                  <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={propSearchQuery}
                    onChange={e => setPropSearchQuery(e.target.value)}
                    placeholder="Search properties..."
                    className="w-full bg-background border border-border rounded-lg pl-8 pr-7 py-1.5 text-xs text-text-main outline-none focus:border-primary transition-colors placeholder:text-text-muted"
                    autoFocus
                  />
                  {propSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setPropSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Property list */}
                <div className="max-h-52 overflow-y-auto space-y-0.5 py-1">
                  {(() => {
                    const filteredProperties = properties.filter(p => {
                      if (!propSearchQuery.trim()) return true;
                      const q = propSearchQuery.toLowerCase();
                      return p.name.toLowerCase().includes(q) || (p as any).ga4PropertyId?.toLowerCase().includes(q);
                    });
                    return filteredProperties.length === 0 ? (
                      <div className="p-3 text-center text-xs text-text-muted">
                        No property matching "{propSearchQuery}"
                      </div>
                    ) : (
                      filteredProperties.map(p => {
                        const isSelected = propertyId === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setPropertyId(p.id);
                              setIsPropDropdownOpen(false);
                              setPropSearchQuery('');
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-primary/15 text-primary font-semibold'
                                : 'hover:bg-border/40 text-text-main'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <Globe className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />
                              <div className="text-left min-w-0">
                                <div className="truncate font-semibold">{p.name}</div>
                                {(p as any).ga4PropertyId && (
                                  <div className="text-[10px] text-text-muted font-mono truncate">ID: {(p as any).ga4PropertyId}</div>
                                )}
                              </div>
                            </div>
                            {isSelected && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                          </button>
                        );
                      })
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tracker name */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Tracker Name</label>
          <input 
            required
            value={name}
            onChange={e => setName(e.target.value)}
            type="text" 
            placeholder="e.g. Self-Referral Leak Alert" 
            className="w-full bg-background border border-border rounded-lg px-4 py-2 outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* ── Compound Condition Builder Section ── */}
        <div className="space-y-3 p-4 rounded-xl border border-border bg-surface/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Alert Trigger Conditions</p>
              <p className="text-xs text-text-muted mt-0.5">
                {hasCompoundRule
                  ? `${ruleDefinition!.groups.reduce((s, g) => s + g.conditions.length, 0)} conditions across ${ruleDefinition!.groups.length} group(s)`
                  : 'Using simple single-metric rule (or configure advanced conditions below)'
                }
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsConditionBuilderOpen(true)}
              className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border transition-all cursor-pointer ${
                hasCompoundRule
                  ? 'bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20'
                  : 'bg-background border-border text-text-muted hover:border-primary/50 hover:text-text-main'
              }`}
            >
              <Settings2 className="w-4 h-4" />
              {hasCompoundRule ? 'Edit Conditions' : 'Advanced Conditions'}
            </button>
          </div>

          {/* Compound rule summary badge */}
          {hasCompoundRule && (
            <div className="flex items-start gap-2 p-3 bg-violet-500/5 border border-violet-500/20 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-violet-400 mb-0.5">Compound Rule Active</p>
                <p className="text-xs text-text-muted break-words leading-relaxed">
                  {summariseRule(ruleDefinition!)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRuleDefinition(null)}
                className="text-xs text-text-muted hover:text-red-400 transition-colors cursor-pointer flex-shrink-0"
                title="Remove compound rule (revert to simple mode)"
              >
                ✕
              </button>
            </div>
          )}

          {/* Legacy simple-mode fields — shown when no compound rule is set */}
          {!hasCompoundRule && (
            <div className="space-y-3 pt-1">
              <div className="space-y-2">
                <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Metric</label>
                <select 
                  value={metric}
                  onChange={e => setMetric(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 outline-none focus:border-primary transition-colors cursor-pointer text-sm"
                >
                  <option value="purchaseRevenue">Total Revenue (purchaseRevenue)</option>
                  <option value="activeUsers">Active Users (activeUsers)</option>
                  <option value="sessions">Sessions</option>
                  <option value="eventCount">Total Events (eventCount)</option>
                  <option value="screenPageViews">Page Views</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Condition</label>
                  <select 
                    value={condition}
                    onChange={e => setCondition(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2 outline-none focus:border-primary transition-colors cursor-pointer text-sm"
                  >
                    <option value="drops_by">Drops By (%)</option>
                    <option value="greater_than">Greater Than ({'>'}) </option>
                    <option value="less_than">Less Than ({'<'})</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Threshold Value</label>
                  <input 
                    required
                    type="number" 
                    value={thresholdValue}
                    onChange={e => setThresholdValue(Number(e.target.value))}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2 outline-none focus:border-primary transition-colors text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Compare Against</label>
                <select 
                  value={compareWindow}
                  onChange={e => setCompareWindow(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 outline-none focus:border-primary transition-colors cursor-pointer text-sm"
                >
                  <option value="previous_day">Previous Day</option>
                  <option value="avg_7_days">Average Last 7 Days</option>
                  <option value="same_day_last_week">Same Day Last Week</option>
                </select>
              </div>

              {/* Tip callout */}
              <div className="flex gap-2 p-2.5 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-500/80">
                  Use <strong>Advanced Conditions</strong> above to build compound AND/OR rules — e.g. detect cross-domain tracking breaks, payment gateway hijacks, or consent mode failures.
                </p>
              </div>
            </div>
          )}

          {/* Test Rule Against Live Traffic Action */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleTestRule}
              disabled={isTesting || !propertyId}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-surface border border-violet-500/30 hover:border-violet-500/60 text-violet-300 hover:text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            >
              {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" /> : <span>⚡</span>}
              {isTesting ? 'Testing on Live GA4 Data...' : 'Test Rule on Live GA4 Data'}
            </button>
          </div>

          {/* Test Result Inspection Card */}
          {testResult && (
            <div className={`p-3.5 rounded-lg border text-xs space-y-1.5 transition-all ${
              testResult.triggered
                ? 'bg-red-500/10 border-red-500/30 text-red-200'
                : 'bg-green-500/10 border-green-500/30 text-green-200'
            }`}>
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5">
                  {testResult.triggered ? '🚨 Anomaly Detected in Live Traffic' : '✅ Safe Baseline (No Anomaly)'}
                </span>
                <span className="text-[10px] opacity-75">{new Date().toLocaleTimeString()}</span>
              </div>
              <p className="opacity-90 leading-relaxed">{testResult.summary}</p>
              {testResult.conditionResults && testResult.conditionResults.length > 0 && (
                <div className="pt-1.5 border-t border-white/10 space-y-1">
                  {testResult.conditionResults.map((cr: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-[11px] opacity-80">
                      <span>{cr.condition?.type === 'metric' ? cr.condition.metric : cr.condition.dimension}</span>
                      <span className="font-mono">Actual: {String(cr.actualValue)} {cr.passed ? '✓ met' : '✗ not met'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Preset Packs */}
        <div className="space-y-3 pt-2 border-t border-border">
          <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Quick Simple Presets</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setName('Revenue Drop Alert'); setMetric('purchaseRevenue'); setCondition('drops_by'); setThresholdValue(30); setCompareWindow('previous_day'); setRuleDefinition(null); setTestResult(null); }}
              className="text-left text-xs p-3 rounded-lg border border-border hover:border-primary/50 bg-background/50 hover:bg-primary/5 transition-colors cursor-pointer"
            >
              <span className="font-bold block mb-0.5">🛒 Ecommerce Pack</span>
              <span className="text-text-muted">Revenue drops {'>'} 30%</span>
            </button>
            <button
              type="button"
              onClick={() => { setName('Traffic Drop Alert'); setMetric('activeUsers'); setCondition('drops_by'); setThresholdValue(40); setCompareWindow('avg_7_days'); setRuleDefinition(null); setTestResult(null); }}
              className="text-left text-xs p-3 rounded-lg border border-border hover:border-primary/50 bg-background/50 hover:bg-primary/5 transition-colors cursor-pointer"
            >
              <span className="font-bold block mb-0.5">📊 Traffic Pack</span>
              <span className="text-text-muted">Users drop {'>'} 40% vs 7d avg</span>
            </button>
            <button
              type="button"
              onClick={() => { setName('Session Drop Alert'); setMetric('sessions'); setCondition('drops_by'); setThresholdValue(25); setCompareWindow('previous_day'); setRuleDefinition(null); setTestResult(null); }}
              className="text-left text-xs p-3 rounded-lg border border-border hover:border-primary/50 bg-background/50 hover:bg-primary/5 transition-colors cursor-pointer"
            >
              <span className="font-bold block mb-0.5">⚡ Session Pack</span>
              <span className="text-text-muted">Sessions drop {'>'} 25% vs prev day</span>
            </button>
            <button
              type="button"
              onClick={() => { setName('Event Spike Alert'); setMetric('eventCount'); setCondition('greater_than'); setThresholdValue(10000); setCompareWindow('previous_day'); setRuleDefinition(null); setTestResult(null); }}
              className="text-left text-xs p-3 rounded-lg border border-border hover:border-primary/50 bg-background/50 hover:bg-primary/5 transition-colors cursor-pointer"
            >
              <span className="font-bold block mb-0.5">🔔 Event Spike</span>
              <span className="text-text-muted">Events exceed 10,000/day</span>
            </button>
          </div>
        </div>

        {/* Submit */}
        <div className="pt-4 border-t border-border flex justify-end gap-3">
          <button 
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg font-medium hover:bg-border/50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button 
            type="submit"
            disabled={isSaving}
            className="bg-primary text-background px-6 py-2 rounded-lg font-semibold hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {initialTracker?.id ? 'Update Tracker' : 'Save Tracker'}
          </button>
        </div>
      </form>

      {/* Level 2: Condition Builder Drawer — stacks on top of this form's drawer */}
      <ConditionBuilderDrawer
        isOpen={isConditionBuilderOpen}
        onClose={() => setIsConditionBuilderOpen(false)}
        initialRule={ruleDefinition}
        onApply={(rule) => {
          setRuleDefinition(rule);
          setIsConditionBuilderOpen(false);
        }}
      />
    </>
  );
}
