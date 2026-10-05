import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Loader2, Trash2, Power, PowerOff, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';

type Tracker = {
  id: string;
  propertyId: string;
  propertyName: string;
  name: string;
  metric: string;
  condition: string;
  thresholdValue: number;
  compareWindow: string;
  isActive: boolean;
};

const PER_PAGE_OPTIONS = [5, 10, 25, 50];

const CONDITION_LABELS: Record<string, string> = {
  drops_by: 'Drops by',
  greater_than: 'Greater than',
  less_than: 'Less than'
};

const WINDOW_LABELS: Record<string, string> = {
  previous_day: 'vs Prev Day',
  avg_7_days: 'vs 7d Avg'
};

export function TrackerManager() {
  const { getToken } = useAuth();
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

  const fetchTrackers = async () => {
    try {
      const token = await getToken();
      const res = await fetch('http://localhost:8787/api/trackers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTrackers(data.trackers || []);
      }
    } catch (e) {
      toast.error('Failed to load trackers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchTrackers(); }, [getToken]);

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
    if (!confirm('Are you sure you want to delete this tracker?')) return;
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

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  if (trackers.length === 0) {
    return (
      <div className="text-center p-8 border border-dashed border-border rounded-xl">
        <Activity className="w-8 h-8 text-text-muted mx-auto mb-3" />
        <h3 className="font-semibold">No active trackers</h3>
        <p className="text-sm text-text-muted">Create a tracker to start monitoring your GA4 properties.</p>
      </div>
    );
  }

  // Pagination calculations
  const totalPages = Math.ceil(trackers.length / perPage);
  const startIdx = (currentPage - 1) * perPage;
  const paginated = trackers.slice(startIdx, startIdx + perPage);

  return (
    <div className="space-y-4">
      {/* Tracker rows */}
      {paginated.map(tracker => (
        <div
          key={tracker.id}
          className={`p-4 rounded-xl border transition-all ${
            tracker.isActive
              ? 'bg-surface border-border hover:border-primary/50'
              : 'bg-surface/50 border-border/50 opacity-70'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-base flex items-center gap-2 flex-wrap">
                {tracker.name}
                {!tracker.isActive && (
                  <span className="text-xs bg-border px-2 py-0.5 rounded-full font-medium text-text-muted">Paused</span>
                )}
              </h3>
              <p className="text-sm text-text-muted mt-0.5 truncate">
                {tracker.propertyName}
              </p>
              <div className="flex gap-2 mt-3 flex-wrap">
                <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-md font-medium border border-primary/20">
                  {tracker.metric}
                </span>
                <span className="text-xs bg-border/50 text-text-main px-2.5 py-1 rounded-md font-medium border border-border">
                  {CONDITION_LABELS[tracker.condition] || tracker.condition} {tracker.thresholdValue}%
                </span>
                <span className="text-xs bg-border/30 text-text-muted px-2.5 py-1 rounded-md font-medium border border-border/50">
                  {WINDOW_LABELS[tracker.compareWindow] || tracker.compareWindow}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 flex-shrink-0">
              <button
                onClick={() => toggleTracker(tracker.id, tracker.isActive)}
                className={`p-2 rounded-lg transition-colors flex items-center justify-center cursor-pointer ${
                  tracker.isActive
                    ? 'bg-border/50 hover:bg-border text-text-main'
                    : 'bg-green-500/10 hover:bg-green-500/20 text-green-500'
                }`}
                title={tracker.isActive ? 'Pause Tracker' : 'Activate Tracker'}
              >
                {tracker.isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
              </button>
              <button
                onClick={() => deleteTracker(tracker.id)}
                className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors flex items-center justify-center cursor-pointer"
                title="Delete Tracker"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Pagination controls */}
      {trackers.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <span>Show</span>
            <select
              value={perPage}
              onChange={e => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="bg-background border border-border rounded-md px-2 py-1 text-sm text-text-main outline-none focus:border-primary cursor-pointer"
            >
              {PER_PAGE_OPTIONS.map(n => (
                <option key={n} value={n}>{n} per page</option>
              ))}
            </select>
            <span>{startIdx + 1}–{Math.min(startIdx + perPage, trackers.length)} of {trackers.length}</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-md hover:bg-border/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-7 h-7 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  currentPage === page
                    ? 'bg-primary text-background'
                    : 'hover:bg-border/50 text-text-muted'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-md hover:bg-border/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
