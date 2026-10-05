import { useState, useRef, useEffect } from 'react';
import { Bell, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';

interface NotificationCenterProps {
  recentAlerts: number;
}

type AlertEvent = {
  id: string;
  trackerName: string;
  propertyName: string;
  expectedValue: string;
  actualValue: string;
  status: string;
  createdAt: string;
};

export function NotificationCenter({ recentAlerts }: NotificationCenterProps) {
  const { getToken } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch real alerts when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      getToken().then(token => {
        fetch('http://localhost:8787/api/alerts', {
          headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => setAlerts(data.alerts || []))
        .catch(() => setAlerts([]))
        .finally(() => setIsLoading(false));
      });
    }
  }, [isOpen, getToken]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg transition-colors cursor-pointer ${
          isOpen ? 'bg-border/50 text-text-main' : 'text-text-muted hover:text-text-main'
        }`}
      >
        <Bell className="w-5 h-5" />
        {recentAlerts > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]"></span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-surface border border-border rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-bold">Notifications</h3>
            {alerts.length > 0 && (
              <span className="text-xs text-text-muted">{alerts.length} alert{alerts.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-border/20 flex items-center justify-center">
                  <Check className="w-6 h-6 text-text-muted" />
                </div>
                <p className="text-sm text-text-muted">You're all caught up! No recent alerts.</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {alerts.map(alert => (
                  <div key={alert.id} className="p-4 border-b border-border hover:bg-border/20 transition-colors flex gap-3 cursor-pointer group">
                    <div className="mt-1 flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-main">{alert.trackerName}</p>
                      <p className="text-sm text-text-muted mt-0.5">
                        {alert.propertyName}: Expected {alert.expectedValue}, got {alert.actualValue}
                      </p>
                      <p className="text-xs text-text-muted mt-2">
                        {new Date(alert.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
