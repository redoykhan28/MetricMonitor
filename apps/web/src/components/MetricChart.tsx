import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@clerk/clerk-react";
import { useState, useEffect, useCallback } from "react";
import { Loader2, Calendar } from "lucide-react";

type ChartPoint = { date: string; activeUsers: number; sessions: number };

type RangeOption = { label: string; days: number | null };

const RANGE_OPTIONS: RangeOption[] = [
  { label: 'Last 7 Days',   days: 7   },
  { label: 'Last 14 Days',  days: 14  },
  { label: 'Last 30 Days',  days: 30  },
  { label: 'Last 60 Days',  days: 60  },
  { label: 'Last 90 Days',  days: 90  },
  { label: 'Custom Range',  days: null },
];

const formatDate = (d: Date) => d.toISOString().split('T')[0];

export function MetricChart() {
  const { getToken } = useAuth();
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [propertyName, setPropertyName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Range state
  const [selectedRange, setSelectedRange] = useState<RangeOption>(RANGE_OPTIONS[0]);
  const [showCustom, setShowCustom] = useState(false);
  const today = formatDate(new Date());
  const [customStart, setCustomStart] = useState(formatDate(new Date(Date.now() - 6 * 86400000)));
  const [customEnd, setCustomEnd] = useState(today);

  const fetchChart = useCallback(async (startDate: string, endDate: string) => {
    setIsLoading(true);
    setError('');
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `http://localhost:8787/api/dashboard/chart-data?startDate=${startDate}&endDate=${endDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        setChartData(data.chartData || []);
        setPropertyName(data.propertyName || '');
        if (data.error) setError(data.error);
      }
    } catch (e) {
      setError('Failed to load chart data');
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  // Fetch whenever range changes (not custom until user applies)
  useEffect(() => {
    if (selectedRange.days === null) return; // custom — wait for Apply
    const end = new Date();
    const start = new Date(Date.now() - (selectedRange.days - 1) * 86400000);
    fetchChart(formatDate(start), formatDate(end));
  }, [selectedRange, fetchChart]);

  const handleApplyCustom = () => {
    if (customStart && customEnd) {
      fetchChart(customStart, customEnd);
      setShowCustom(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex flex-col">
          <h2 className="text-xl font-bold">Revenue & Traffic Trend</h2>
          {propertyName && (
            <p className="text-xs text-text-muted mt-1">
              {propertyName}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile Dropdown (Hidden on Desktop) */}
          <div className="md:hidden">
            <select
              value={selectedRange.label}
              onChange={(e) => {
                const opt = RANGE_OPTIONS.find(r => r.label === e.target.value)!;
                setSelectedRange(opt);
                setShowCustom(opt.days === null);
              }}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-primary transition-colors cursor-pointer"
            >
              {RANGE_OPTIONS.map(range => (
                <option key={range.label} value={range.label}>
                  {range.label}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop Buttons (Hidden on Mobile) */}
          <div className="hidden md:flex items-center gap-2">
            <div className="flex items-center gap-1 bg-background rounded-lg border border-border p-1">
              {RANGE_OPTIONS.filter(r => r.days !== null).map(range => (
                <button
                  key={range.label}
                  onClick={() => { setSelectedRange(range); setShowCustom(false); }}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    selectedRange.label === range.label && !showCustom
                      ? 'bg-primary text-background'
                      : 'text-text-muted hover:text-text-main'
                  }`}
                >
                  {range.label.replace('Last ', '').replace(' Days', 'd')}
                </button>
              ))}
            </div>

            <button
              onClick={() => { setShowCustom(!showCustom); setSelectedRange({ label: 'Custom Range', days: null }); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                showCustom
                  ? 'bg-primary text-background border-primary'
                  : 'border-border text-text-muted hover:text-text-main hover:border-primary/50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Custom
            </button>
          </div>
        </div>
      </div>

      {/* Custom Date Picker */}
      {showCustom && (
        <div className="flex items-end gap-3 mb-4 p-4 bg-background/50 rounded-xl border border-border">
          <div className="space-y-1">
            <label className="text-xs text-text-muted font-medium">Start Date</label>
            <input
              type="date"
              value={customStart}
              max={customEnd}
              onChange={e => setCustomStart(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary transition-colors cursor-pointer"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-muted font-medium">End Date</label>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              max={today}
              onChange={e => setCustomEnd(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary transition-colors cursor-pointer"
            />
          </div>
          <button
            onClick={handleApplyCustom}
            className="bg-primary text-background px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors cursor-pointer"
          >
            Apply
          </button>
        </div>
      )}

      {/* Chart */}
      <div className="h-[300px] w-full">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-text-muted text-sm">
            {error || 'No data available for this date range.'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="date" stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: '8px', fontSize: '13px' }}
                itemStyle={{ color: 'var(--color-text-main)' }}
              />
              <Area type="monotone" dataKey="activeUsers" name="Active Users" stroke="var(--color-primary)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorUsers)" />
              <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorSessions)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
