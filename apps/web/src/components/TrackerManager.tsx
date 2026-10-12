import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { 
  Loader2, Trash2, Power, PowerOff, Play, Edit3, 
  CheckCircle2, AlertTriangle, Layers, Globe, Plus, ChevronDown, 
  ChevronUp, Search, BarChart3, ChevronsUpDown, ChevronLeft, ChevronRight,
  Check, X
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export type Tracker = {
  id: string;
  propertyId: string;
  propertyName: string;
  name: string;
  metric: string;
  condition: string;
  thresholdValue: number;
  compareWindow: string;
  ruleDefinition?: string | null;
  isActive: boolean;
};

export type MonitoredProperty = {
  id: string;
  name: string;
  ga4PropertyId?: string;
  domain?: string | null;
};

interface TrackerManagerProps {
  onEditTracker?: (tracker: Tracker) => void;
  onAddTrackerForProperty?: (propertyId: string) => void;
  onAddProperty?: () => void;
  onViewPropertyChart?: (propertyId: string) => void;
  onPropertyDeleted?: () => void;
}

const CONDITION_LABELS: Record<string, string> = {
  drops_by: 'Drops by',
  spikes_by: 'Spikes by',
  greater_than: 'Greater than',
  less_than: 'Less than',
  equals: 'Equals',
  not_equals: 'Not equals',
};

const WINDOW_LABELS: Record<string, string> = {
  previous_day: 'vs Prev Day',
  avg_7_days: 'vs 7d Avg',
  same_day_last_week: 'vs Same Day Last Week',
};

const PROPERTIES_PER_PAGE = 5;
const TRACKERS_PER_PAGE = 5;

function formatRuleSummary(ruleDefinitionJson: string): { totalGroups: number; totalConditions: number; groupsText: string[] } {
  try {
    const rule = JSON.parse(ruleDefinitionJson);
    const groups = rule.groups || [];
    let totalConditions = 0;

    const groupsText = groups.map((g: any, gi: number) => {
      const conds = g.conditions || [];
      totalConditions += conds.length;
      const textArr = conds.map((c: any) => {
        if (c.type === 'metric') {
          const isPct = c.operator === 'drops_by' || c.operator === 'spikes_by';
          return `${c.metric} ${c.operator.replace(/_/g, ' ')} ${c.thresholdValue}${isPct ? '%' : ''}${c.compareWindow ? ` (${WINDOW_LABELS[c.compareWindow] || c.compareWindow})` : ''}`;
        }
        return `${c.dimension} ${c.operator.replace(/_/g, ' ')} "${c.value}"`;
      });
      return `Group ${gi + 1}: ${textArr.join(' AND ')}`;
    });

    return { totalGroups: groups.length, totalConditions, groupsText };
  } catch {
    return { totalGroups: 0, totalConditions: 0, groupsText: [] };
  }
}

export function TrackerManager({ 
  onEditTracker, 
  onAddTrackerForProperty,
  onAddProperty,
  onViewPropertyChart,
  onPropertyDeleted
}: TrackerManagerProps) {
  const { getToken } = useAuth();
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [properties, setProperties] = useState<MonitoredProperty[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter & Pagination state
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [propertyPage, setPropertyPage] = useState<number>(1);
  const [trackerPages, setTrackerPages] = useState<Record<string, number>>({});

  // Accordion state: string (expanded property ID), 'all', 'none', or null (defaults to first property)
  const [expandedPropertyId, setExpandedPropertyId] = useState<string | null>(null);

  // Searchable Property Dropdown state
  const [isPropertyDropdownOpen, setIsPropertyDropdownOpen] = useState(false);
  const [propertySearchQuery, setPropertySearchQuery] = useState('');
  const propertyDropdownRef = useRef<HTMLDivElement>(null);

  // Testing tracker state
  const [testingTrackerId, setTestingTrackerId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [deletingPropertyId, setDeletingPropertyId] = useState<string | null>(null);

  const fetchTrackersAndProperties = async () => {
    try {
      const token = await getToken();
      const res = await fetch('http://localhost:8787/api/trackers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const loadedTrackers = data.trackers || [];
        setTrackers(loadedTrackers);

        if (data.properties && data.properties.length > 0) {
          setProperties(data.properties);
          setExpandedPropertyId(prev => prev ?? data.properties[0].id);
        } else {
          // Fallback: extract distinct properties from trackers
          const propMap = new Map<string, MonitoredProperty>();
          loadedTrackers.forEach((t: Tracker) => {
            if (!propMap.has(t.propertyId)) {
              propMap.set(t.propertyId, { id: t.propertyId, name: t.propertyName });
            }
          });
          const propList = Array.from(propMap.values());
          setProperties(propList);
          setExpandedPropertyId(prev => prev ?? (propList[0]?.id || null));
        }
      }
    } catch {
      toast.error('Failed to load trackers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { 
    fetchTrackersAndProperties(); 
  }, [getToken]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (propertyDropdownRef.current && !propertyDropdownRef.current.contains(event.target as Node)) {
        setIsPropertyDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const togglePropertyAccordion = (propertyId: string, currentIsCollapsed: boolean) => {
    if (currentIsCollapsed) {
      // Expand this property and collapse all other properties (accordion)
      setExpandedPropertyId(propertyId);
    } else {
      // Collapse this property
      setExpandedPropertyId('none');
    }
  };

  const expandAll = () => {
    setExpandedPropertyId('all');
  };

  const collapseAll = () => {
    setExpandedPropertyId('none');
  };

  const toggleTracker = async (trackerId: string, currentState: boolean) => {
    const newState = !currentState;
    setTrackers(prev => prev.map(t => t.id === trackerId ? { ...t, isActive: newState } : t));
    try {
      const token = await getToken();
      const res = await fetch(`http://localhost:8787/api/trackers/${trackerId}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newState })
      });
      if (!res.ok) throw new Error();
      toast.success(`Tracker ${newState ? 'activated' : 'paused'}`);
    } catch {
      toast.error('Failed to update tracker');
      setTrackers(prev => prev.map(t => t.id === trackerId ? { ...t, isActive: currentState } : t));
    }
  };

  const deleteTracker = async (trackerId: string) => {
    if (!confirm('Are you sure you want to delete this tracker rule?')) return;
    const previousTrackers = [...trackers];
    setTrackers(prev => prev.filter(t => t.id !== trackerId));
    try {
      const token = await getToken();
      const res = await fetch(`http://localhost:8787/api/trackers/${trackerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      toast.success('Tracker deleted');
    } catch {
      toast.error('Failed to delete tracker');
      setTrackers(previousTrackers);
    }
  };

  const deleteProperty = async (propertyId: string, propertyName: string) => {
    if (!confirm(`Are you sure you want to delete "${propertyName}"?\n\nThis will remove the property and all of its associated trackers and alert histories.`)) {
      return;
    }

    setDeletingPropertyId(propertyId);
    try {
      const token = await getToken();
      const res = await fetch(`http://localhost:8787/api/google/properties/${propertyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to remove property');
      }
      toast.success(`Removed property "${propertyName}"`);
      await fetchTrackersAndProperties();
      if (onPropertyDeleted) onPropertyDeleted();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete property');
    } finally {
      setDeletingPropertyId(null);
    }
  };

  const testTrackerLive = async (trackerId: string) => {
    setTestingTrackerId(trackerId);
    try {
      const token = await getToken();
      const res = await fetch(`http://localhost:8787/api/trackers/${trackerId}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error || 'Test request failed');

      setTestResults(prev => ({ ...prev, [trackerId]: data.evaluation }));
      if (data.evaluation?.triggered) {
        toast.error(`"${data.evaluation?.summary?.split('\n')[0] || 'Condition triggered'}"`);
      } else {
        toast.success('Tested against live GA4: Normal baseline (safe)');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to test tracker');
    } finally {
      setTestingTrackerId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-sm text-text-muted">Loading properties & trackers...</span>
      </div>
    );
  }

  // Group trackers by propertyId
  const trackersByProperty: Record<string, Tracker[]> = {};
  trackers.forEach(t => {
    const list = trackersByProperty[t.propertyId] || [];
    list.push(t);
    trackersByProperty[t.propertyId] = list;
  });

  // Empty state: No properties at all
  if (properties.length === 0 && trackers.length === 0) {
    return (
      <div className="text-center p-12 border border-dashed border-border/80 rounded-2xl bg-surface/30 space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto">
          <Globe className="w-7 h-7" />
        </div>
        <div className="max-w-md mx-auto space-y-1">
          <h3 className="font-bold text-lg text-text-main">No Properties Monitored</h3>
          <p className="text-sm text-text-muted">
            Connect your Google Analytics account or add a GA4 property to begin monitoring traffic drops, conversion anomalies, and custom triggers.
          </p>
        </div>
        {onAddProperty && (
          <button
            onClick={onAddProperty}
            className="bg-primary text-background font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-hover transition-transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(var(--color-primary),0.3)] cursor-pointer inline-flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" /> Add GA4 Property
          </button>
        )}
      </div>
    );
  }

  // Filter properties based on tab selection
  const displayedProperties = selectedPropertyId === 'all'
    ? properties
    : properties.filter(p => p.id === selectedPropertyId);

  const totalPropertyPages = Math.ceil(displayedProperties.length / PROPERTIES_PER_PAGE);
  const currentPropertyPage = Math.min(Math.max(propertyPage, 1), Math.max(totalPropertyPages, 1));
  const paginatedProperties = displayedProperties.slice(
    (currentPropertyPage - 1) * PROPERTIES_PER_PAGE,
    currentPropertyPage * PROPERTIES_PER_PAGE
  );

  const totalActiveTrackers = trackers.filter(t => t.isActive).length;

  // Effective expanded property ID: defaults to the first property on current page
  const effectiveExpandedId = expandedPropertyId !== null
    ? expandedPropertyId
    : (paginatedProperties[0]?.id || null);

  const areAllCollapsed = effectiveExpandedId === 'none';

  const setPageForProperty = (propId: string, page: number) => {
    setTrackerPages(prev => ({ ...prev, [propId]: page }));
  };

  const currentSelectedProp = properties.find(p => p.id === selectedPropertyId);
  const selectedLabel = selectedPropertyId === 'all' 
    ? 'All Properties' 
    : (currentSelectedProp?.name || 'Selected Property');
  const selectedTrackerCount = selectedPropertyId === 'all'
    ? trackers.length
    : (trackersByProperty[selectedPropertyId]?.length || 0);

  const filteredDropdownProperties = properties.filter(p => {
    if (!propertySearchQuery.trim()) return true;
    const q = propertySearchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.ga4PropertyId && p.ga4PropertyId.includes(q));
  });

  return (
    <div className="space-y-6">
      {/* ─── Top Control Header & Summary Bar ─────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold tracking-tight text-text-main">
              Monitored Properties & Trackers
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {properties.length} {properties.length === 1 ? 'Property' : 'Properties'}
            </span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20">
              {totalActiveTrackers} Active {totalActiveTrackers === 1 ? 'Rule' : 'Rules'}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Each property runs its own isolated tracking rules, alert thresholds, and live evaluation baselines.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onAddProperty && (
            <button
              onClick={onAddProperty}
              className="bg-surface hover:bg-border/60 border border-border px-3.5 py-1.5 rounded-xl text-xs font-semibold text-text-main transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Globe className="w-3.5 h-3.5 text-primary" />
              Add GA4 Property
            </button>
          )}
          {onAddTrackerForProperty && (
            <button
              onClick={() => onAddTrackerForProperty(properties[0]?.id || '')}
              className="bg-primary text-background hover:bg-primary-hover px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Tracker
            </button>
          )}
        </div>
      </div>

      {/* ─── Property Navigation Dropdown & Search Toolbar ─────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface/30 p-2.5 rounded-xl border border-border/50">
        {/* Left: Searchable Property Dropdown Selector */}
        <div className="relative flex-1 sm:max-w-xs" ref={propertyDropdownRef}>
          <button
            type="button"
            onClick={() => setIsPropertyDropdownOpen(prev => !prev)}
            className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl bg-surface hover:bg-border/40 border border-border text-xs font-semibold text-text-main transition-all cursor-pointer shadow-sm hover:border-primary/50 group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Globe className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="truncate">{selectedLabel}</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 flex-shrink-0">
                {selectedTrackerCount}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-text-muted transition-transform duration-200 flex-shrink-0 ${isPropertyDropdownOpen ? 'rotate-180 text-primary' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isPropertyDropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-full sm:w-80 bg-surface/95 backdrop-blur-md border border-border rounded-xl shadow-2xl z-30 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-100">
              {/* Search input inside dropdown */}
              <div className="relative p-1">
                <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={propertySearchQuery}
                  onChange={e => setPropertySearchQuery(e.target.value)}
                  placeholder="Filter properties..."
                  className="w-full bg-background border border-border rounded-lg pl-8 pr-7 py-1.5 text-xs text-text-main outline-none focus:border-primary transition-colors placeholder:text-text-muted"
                  autoFocus
                />
                {propertySearchQuery && (
                  <button
                    type="button"
                    onClick={() => setPropertySearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* All Properties option */}
              <div className="pt-1 border-t border-border/50">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPropertyId('all');
                    setPropertyPage(1);
                    setIsPropertyDropdownOpen(false);
                    setPropertySearchQuery('');
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    selectedPropertyId === 'all'
                      ? 'bg-primary/15 text-primary font-semibold'
                      : 'hover:bg-border/40 text-text-main'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 opacity-80" />
                    <span>All Properties</span>
                    <span className="text-[10px] text-text-muted">({properties.length})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-border/50 text-text-muted">
                      {trackers.length} {trackers.length === 1 ? 'rule' : 'rules'}
                    </span>
                    {selectedPropertyId === 'all' && <Check className="w-3.5 h-3.5 text-primary" />}
                  </div>
                </button>
              </div>

              {/* Property list */}
              <div className="max-h-60 overflow-y-auto space-y-0.5 py-1 scrollbar-thin">
                {filteredDropdownProperties.length === 0 ? (
                  <div className="p-3 text-center text-xs text-text-muted">
                    No property found matching "{propertySearchQuery}"
                  </div>
                ) : (
                  filteredDropdownProperties.map(prop => {
                    const count = trackersByProperty[prop.id]?.length || 0;
                    const isSelected = selectedPropertyId === prop.id;
                    return (
                      <button
                        key={prop.id}
                        type="button"
                        onClick={() => {
                          setSelectedPropertyId(prop.id);
                          setPropertyPage(1);
                          setIsPropertyDropdownOpen(false);
                          setPropertySearchQuery('');
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
                            <div className="truncate font-semibold">{prop.name}</div>
                            {prop.ga4PropertyId && (
                              <div className="text-[10px] text-text-muted font-mono truncate">ID: {prop.ga4PropertyId}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-border/50 text-text-muted">
                            {count} {count === 1 ? 'rule' : 'rules'}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right side: Search in trackers & Collapse/Expand */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPropertyPage(1); }}
              placeholder="Search in trackers..."
              className="w-full bg-surface border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-main outline-none focus:border-primary transition-colors placeholder:text-text-muted"
            />
          </div>

          <button
            onClick={areAllCollapsed ? expandAll : collapseAll}
            className="p-1.5 rounded-lg border border-border bg-surface hover:bg-border/50 text-text-muted hover:text-text-main text-xs transition-colors cursor-pointer flex-shrink-0"
            title={areAllCollapsed ? 'Expand All Properties' : 'Collapse All Properties'}
          >
            <ChevronsUpDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ─── List of Properties (Separate for All) ────────────────────── */}
      <div className="space-y-6">
        {paginatedProperties.map(prop => {
          let propTrackers = trackersByProperty[prop.id] || [];
          const totalInProp = propTrackers.length;
          const activeInProp = propTrackers.filter(t => t.isActive).length;

          // Apply search filter if query entered
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            propTrackers = propTrackers.filter(t => 
              t.name.toLowerCase().includes(q) ||
              t.metric.toLowerCase().includes(q) ||
              t.condition.toLowerCase().includes(q)
            );
          }

          const isCollapsed = effectiveExpandedId !== 'all' && effectiveExpandedId !== prop.id;
          const isDeleting = deletingPropertyId === prop.id;

          // Inner Tracker Pagination
          const totalTrackerPages = Math.ceil(propTrackers.length / TRACKERS_PER_PAGE);
          const currentTrackerPage = Math.min(Math.max(trackerPages[prop.id] || 1, 1), Math.max(totalTrackerPages, 1));
          const paginatedTrackers = propTrackers.slice(
            (currentTrackerPage - 1) * TRACKERS_PER_PAGE,
            currentTrackerPage * TRACKERS_PER_PAGE
          );

          return (
            <div 
              key={prop.id}
              className={`rounded-2xl border bg-surface/40 overflow-hidden shadow-sm transition-all group ${!isCollapsed ? 'border-primary/40' : 'border-border/80 hover:border-primary/40'}`}
            >
              {/* ── Property Header Card ── */}
              <div className="p-4 sm:p-5 bg-surface/80 border-b border-border/60 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary flex-shrink-0 shadow-inner">
                    <Globe className="w-5 h-5" />
                  </div>
                  
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-bold text-base text-text-main truncate">
                        {prop.name}
                      </h3>
                      
                      {prop.ga4PropertyId && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-border/50 text-text-muted border border-border/60">
                          ID: {prop.ga4PropertyId}
                        </span>
                      )}

                      {prop.domain && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-border/40 text-text-muted">
                          {prop.domain}
                        </span>
                      )}

                      {/* Status indicator badge */}
                      {totalInProp === 0 ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-border/40 text-text-muted border border-border/60">
                          No Trackers
                        </span>
                      ) : activeInProp === totalInProp ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/25 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {activeInProp} Active
                        </span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/25 font-semibold flex items-center gap-1">
                          {activeInProp}/{totalInProp} Active
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-text-muted mt-1">
                      {totalInProp} {totalInProp === 1 ? 'tracker rule configured' : 'tracker rules configured'} for this property
                    </p>
                  </div>
                </div>

                {/* Property Action Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* View in Trend Chart */}
                  {onViewPropertyChart && (
                    <button
                      onClick={() => onViewPropertyChart(prop.id)}
                      className="bg-surface hover:bg-border/60 text-text-muted hover:text-text-main border border-border/60 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      title={`View trend chart for ${prop.name}`}
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-primary" />
                      <span className="hidden sm:inline">Trend Chart</span>
                    </button>
                  )}

                  {/* Add Tracker specifically for this property */}
                  {onAddTrackerForProperty && (
                    <button
                      onClick={() => onAddTrackerForProperty(prop.id)}
                      className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                      title={`Add a new tracker specifically for ${prop.name}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Tracker</span>
                    </button>
                  )}

                  {/* Delete / Unlink Property */}
                  <button
                    onClick={() => deleteProperty(prop.id, prop.name)}
                    disabled={isDeleting}
                    className="p-1.5 text-text-muted hover:text-red-500 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors cursor-pointer"
                    title={`Remove ${prop.name} from monitoring`}
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin text-red-500" /> : <Trash2 className="w-4 h-4" />}
                  </button>

                  {/* Collapse / Expand Toggle */}
                  <button
                    onClick={() => togglePropertyAccordion(prop.id, isCollapsed)}
                    className="p-1.5 text-text-muted hover:text-text-main rounded-lg hover:bg-border/50 border border-transparent hover:border-border transition-colors cursor-pointer ml-1"
                    title={isCollapsed ? 'Expand trackers' : 'Collapse trackers'}
                  >
                    {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* ── Inside Property: Trackers List ── */}
              {!isCollapsed && (
                <div className="p-4 sm:p-5 space-y-3 bg-background/20">
                  {propTrackers.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-border/80 rounded-xl bg-background/40 flex flex-col items-center justify-center space-y-2">
                      <Layers className="w-8 h-8 text-text-muted/50" />
                      <p className="text-sm font-semibold text-text-main">
                        {searchQuery 
                          ? `No trackers match "${searchQuery}" in ${prop.name}` 
                          : `No trackers configured for ${prop.name}`}
                      </p>
                      <p className="text-xs text-text-muted max-w-md">
                        {searchQuery 
                          ? 'Try clearing your search query to see all configured trackers for this property.'
                          : 'Set up automated rules to catch sudden traffic drops, self-referral leaks, or zero-conversion spikes.'}
                      </p>
                      {!searchQuery && onAddTrackerForProperty && (
                        <button
                          onClick={() => onAddTrackerForProperty(prop.id)}
                          className="mt-2 bg-primary text-background text-xs font-semibold px-4 py-2 rounded-lg hover:bg-primary-hover transition-transform hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Create First Tracker for {prop.name}
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-3">
                        {paginatedTrackers.map(tracker => {
                        const isCompound = !!tracker.ruleDefinition;
                        const ruleDetails = isCompound ? formatRuleSummary(tracker.ruleDefinition!) : null;
                        const liveResult = testResults[tracker.id];
                        const isTesting = testingTrackerId === tracker.id;

                        return (
                          <div
                            key={tracker.id}
                            className={`p-4 rounded-xl border transition-all ${
                              tracker.isActive
                                ? isCompound
                                  ? 'bg-surface/70 border-border hover:border-violet-500/50 shadow-sm'
                                  : 'bg-surface/70 border-border hover:border-primary/50 shadow-sm'
                                : 'bg-surface/30 border-border/40 opacity-70'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-bold text-sm text-text-main">
                                    {tracker.name}
                                  </h4>
                                  
                                  {isCompound && (
                                    <span className="text-[11px] bg-violet-500/10 text-violet-400 border border-violet-500/30 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                                      <Layers className="w-3 h-3" /> Compound Trigger Rule
                                    </span>
                                  )}

                                  {!tracker.isActive && (
                                    <span className="text-[11px] bg-border/60 px-2 py-0.5 rounded-full font-medium text-text-muted">
                                      Paused
                                    </span>
                                  )}
                                </div>

                                {/* Condition details */}
                                {isCompound && ruleDetails ? (
                                  <div className="mt-2.5 space-y-1.5">
                                    {ruleDetails.groupsText.map((gt, gIdx) => (
                                      <div key={gIdx} className="text-xs bg-violet-500/5 border border-violet-500/20 text-violet-300 rounded-lg px-3 py-1.5 font-mono leading-relaxed">
                                        {gt}
                                      </div>
                                    ))}
                                    {ruleDetails.totalGroups > 1 && (
                                      <p className="text-[10px] text-text-muted italic">Any group match triggers alert (OR logic)</p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex gap-2 mt-2.5 flex-wrap">
                                    <span className="text-xs bg-primary/10 text-primary px-2.5 py-0.5 rounded-md font-medium border border-primary/20">
                                      {tracker.metric}
                                    </span>
                                    <span className="text-xs bg-border/50 text-text-main px-2.5 py-0.5 rounded-md font-medium border border-border">
                                      {CONDITION_LABELS[tracker.condition] || tracker.condition} {tracker.thresholdValue}%
                                    </span>
                                    <span className="text-xs bg-border/30 text-text-muted px-2.5 py-0.5 rounded-md font-medium border border-border/50">
                                      {WINDOW_LABELS[tracker.compareWindow] || tracker.compareWindow}
                                    </span>
                                  </div>
                                )}

                                {/* Live Test Results Card */}
                                {liveResult && (
                                  <div className={`mt-3 p-3 rounded-lg border text-xs space-y-1 transition-all ${
                                    liveResult.triggered
                                      ? 'bg-red-500/10 border-red-500/30 text-red-200'
                                      : 'bg-green-500/10 border-green-500/30 text-green-200'
                                  }`}>
                                    <div className="flex items-center justify-between font-bold">
                                      <span className="flex items-center gap-1.5">
                                        {liveResult.triggered ? (
                                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                        ) : (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                                        )}
                                        {liveResult.triggered ? 'Anomaly detected on live GA4 traffic' : 'Normal / Safe on live GA4 traffic'}
                                      </span>
                                      <button
                                        onClick={() => setTestResults(prev => { const n = { ...prev }; delete n[tracker.id]; return n; })}
                                        className="text-[10px] opacity-70 hover:opacity-100 cursor-pointer"
                                      >
                                        ✕ Close
                                      </button>
                                    </div>
                                    <p className="opacity-90">{liveResult.summary}</p>
                                  </div>
                                )}
                              </div>

                              {/* Tracker Action Buttons */}
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {/* Live test button */}
                                <button
                                  onClick={() => testTrackerLive(tracker.id)}
                                  disabled={isTesting}
                                  className="p-1.5 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 transition-colors flex items-center justify-center cursor-pointer"
                                  title="Test condition against live GA4 data now"
                                >
                                  {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                </button>

                                {/* Edit button */}
                                {onEditTracker && (
                                  <button
                                    onClick={() => onEditTracker(tracker)}
                                    className="p-1.5 rounded-lg bg-surface hover:bg-border text-text-main border border-border transition-colors flex items-center justify-center cursor-pointer"
                                    title="Edit Tracker conditions"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Toggle Active button */}
                                <button
                                  onClick={() => toggleTracker(tracker.id, tracker.isActive)}
                                  className={`p-1.5 rounded-lg transition-colors flex items-center justify-center cursor-pointer border ${
                                    tracker.isActive
                                      ? 'bg-surface hover:bg-border text-text-main border-border'
                                      : 'bg-green-500/10 hover:bg-green-500/20 text-green-500 border-green-500/20'
                                  }`}
                                  title={tracker.isActive ? 'Pause Tracker' : 'Activate Tracker'}
                                >
                                  {tracker.isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                                </button>

                                {/* Delete button */}
                                <button
                                  onClick={() => deleteTracker(tracker.id)}
                                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-colors flex items-center justify-center cursor-pointer"
                                  title="Delete Tracker"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Inner Tracker Pagination Controls */}
                    {totalTrackerPages > 1 && (
                      <div className="flex items-center justify-between pt-3 border-t border-border/50 text-xs text-text-muted mt-2">
                        <div>
                          Showing <span className="font-semibold text-text-main">{(currentTrackerPage - 1) * TRACKERS_PER_PAGE + 1}</span> to{' '}
                          <span className="font-semibold text-text-main">
                            {Math.min(currentTrackerPage * TRACKERS_PER_PAGE, propTrackers.length)}
                          </span>{' '}
                          of <span className="font-semibold text-text-main">{propTrackers.length}</span> trackers
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setPageForProperty(prop.id, currentTrackerPage - 1)}
                            disabled={currentTrackerPage <= 1}
                            className="px-2.5 py-1 rounded-lg border border-border bg-surface hover:bg-border/60 text-text-main disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" /> Prev
                          </button>
                          <span className="px-2 font-mono text-[11px] text-text-main">
                            {currentTrackerPage} / {totalTrackerPages}
                          </span>
                          <button
                            onClick={() => setPageForProperty(prop.id, currentTrackerPage + 1)}
                            disabled={currentTrackerPage >= totalTrackerPages}
                            className="px-2.5 py-1 rounded-lg border border-border bg-surface hover:bg-border/60 text-text-main disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer"
                          >
                            Next <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>

    {/* ─── Outer Property Pagination Controls ─────────────────────────── */}
    {totalPropertyPages > 1 && (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border border-border/70 bg-surface/40 text-xs">
        <div className="text-text-muted">
          Showing properties{' '}
          <span className="font-semibold text-text-main">
            {(currentPropertyPage - 1) * PROPERTIES_PER_PAGE + 1}
          </span>{' '}
          to{' '}
          <span className="font-semibold text-text-main">
            {Math.min(currentPropertyPage * PROPERTIES_PER_PAGE, displayedProperties.length)}
          </span>{' '}
          of <span className="font-semibold text-text-main">{displayedProperties.length}</span>
        </div>
        
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPropertyPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPropertyPage <= 1}
            className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-border/60 text-text-main disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPropertyPages }, (_, i) => i + 1).map(pageNum => (
              <button
                key={pageNum}
                onClick={() => setPropertyPage(pageNum)}
                className={`w-7 h-7 rounded-lg text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer ${
                  pageNum === currentPropertyPage
                    ? 'bg-primary text-background shadow-sm'
                    : 'bg-surface hover:bg-border/60 text-text-muted hover:text-text-main border border-border/50'
                }`}
              >
                {pageNum}
              </button>
            ))}
          </div>

          <button
            onClick={() => setPropertyPage(prev => Math.min(prev + 1, totalPropertyPages))}
            disabled={currentPropertyPage >= totalPropertyPages}
            className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-border/60 text-text-main disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    )}
  </div>
);
}
