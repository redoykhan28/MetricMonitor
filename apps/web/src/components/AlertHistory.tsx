import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Loader2, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, TrendingDown, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

type AlertEvent = {
  id: string;
  trackerName: string;
  propertyName: string;
  expectedValue: string;
  actualValue: string;
  status: string;
  notifiedVia: string;
  createdAt: string;
};

const PER_PAGE_OPTIONS = [5, 10, 25, 50];

export function AlertHistory() {
  const { getToken } = useAuth();
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(5);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const token = await getToken();
        const res = await fetch('http://localhost:8787/api/alerts', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setAlerts(data.alerts || []);
        }
      } catch (e) {
        console.error('Failed to fetch alerts:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAlerts();
  }, [getToken]);

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  if (alerts.length === 0) {
    return (
      <div className="text-center p-8 border border-dashed border-border rounded-xl">
        <Clock className="w-8 h-8 text-text-muted mx-auto mb-3" />
        <h3 className="font-semibold text-text-main">No incidents yet</h3>
        <p className="text-sm text-text-muted">When a tracker fires, the incident will appear here with full details.</p>
      </div>
    );
  }

  // Pagination
  const totalPages = Math.ceil(alerts.length / perPage);
  const startIdx = (currentPage - 1) * perPage;
  const paginated = alerts.slice(startIdx, startIdx + perPage);

  return (
    <div className="space-y-3">
      {paginated.map(alert => {
        const isExpanded = expandedId === alert.id;
        const expected = parseFloat(alert.expectedValue);
        const actual = parseFloat(alert.actualValue);
        const isResolved = alert.status === 'resolved';
        const dropPct = expected > 0 ? Math.abs(Math.round(((expected - actual) / expected) * 100)) : 0;
        const barWidth = expected > 0 ? Math.min(Math.round((actual / expected) * 100), 100) : 0;

        return (
          <div key={alert.id} className="rounded-xl border border-border bg-surface overflow-hidden">
            {/* Summary Row */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : alert.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-border/20 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isResolved ? 'bg-green-500/10' : 'bg-red-500/10'
                }`}>
                  {isResolved
                    ? <CheckCircle className="w-4 h-4 text-green-500" />
                    : <AlertTriangle className="w-4 h-4 text-red-500" />
                  }
                </div>
                <div>
                  <p className="font-bold text-sm">{alert.trackerName}</p>
                  <p className="text-xs text-text-muted">{alert.propertyName} · {new Date(alert.createdAt).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold px-2 py-0.5 rounded-full text-xs ${
                  isResolved
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-red-500/10 text-red-500'
                }`}>
                  {isResolved ? '✅ Resolved' : `-${dropPct}%`}
                </span>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
              </div>
            </button>

            {/* Drill-Down Detail */}
            {isExpanded && (
              <div className="border-t border-border p-5 bg-background/50 space-y-5">
                {/* Comparison Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border border-border bg-surface">
                    <p className="text-xs text-text-muted mb-1">Expected (Baseline)</p>
                    <p className="text-2xl font-bold">{expected.toLocaleString()}</p>
                  </div>
                  <div className={`p-4 rounded-lg border ${isResolved ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                    <p className="text-xs text-text-muted mb-1">Actual (Current)</p>
                    <p className={`text-2xl font-bold ${isResolved ? 'text-green-500' : 'text-red-500'}`}>
                      {actual.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Visual Bar */}
                {!isResolved && (
                  <div className="space-y-2">
                    <p className="text-xs text-text-muted font-medium">Visual Comparison</p>
                    <div className="relative h-8 bg-border/30 rounded-full overflow-hidden">
                      <div className="absolute inset-0 bg-border/20 rounded-full" />
                      <div
                        className="absolute inset-y-0 left-0 bg-red-500/30 rounded-full transition-all duration-700"
                        style={{ width: `${barWidth}%` }}
                      >
                        <div className="absolute inset-y-0 right-0 w-1 bg-red-500 rounded-full" />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold flex items-center gap-1">
                          <TrendingDown className="w-3 h-3 text-red-500" />
                          {dropPct}% drop from baseline
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className="flex gap-4 flex-wrap text-xs text-text-muted">
                  <span>Status: <span className={`font-medium capitalize ${isResolved ? 'text-green-500' : 'text-red-400'}`}>{alert.status}</span></span>
                  {alert.notifiedVia && (
                    <span>Notified via: <span className="text-text-main font-medium capitalize">{alert.notifiedVia}</span></span>
                  )}
                  <span>Time: <span className="text-text-main font-medium">{new Date(alert.createdAt).toLocaleString()}</span></span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Pagination */}
      {alerts.length > 0 && (
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
            <span>{startIdx + 1}–{Math.min(startIdx + perPage, alerts.length)} of {alerts.length}</span>
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
                  currentPage === page ? 'bg-primary text-background' : 'hover:bg-border/50 text-text-muted'
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
