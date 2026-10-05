import { Bell, Check, CircleAlert, CheckCircle2, Rocket, ExternalLink } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'welcome' | 'ga4_added' | 'tracker_added' | 'alert';
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const { getToken } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const fetchNotifications = async () => {
    try {
      const token = await getToken();
      const res = await fetch('http://localhost:8787/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
      }
    } catch (e) {
      console.error('Failed to fetch notifications');
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [getToken]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id: string) => {
    try {
      const token = await getToken();
      await fetch(`http://localhost:8787/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
    } catch (e) {
      console.error('Failed to mark read');
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'alert': return <CircleAlert className="w-5 h-5 text-red-500" />;
      case 'welcome': return <Rocket className="w-5 h-5 text-primary" />;
      case 'ga4_added': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'tracker_added': return <CheckCircle2 className="w-5 h-5 text-primary" />;
      default: return <Bell className="w-5 h-5 text-text-muted" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-border/50 transition-colors cursor-pointer text-text-muted hover:text-text-main"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse border-2 border-background"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-h-[28rem] bg-surface border border-border rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-top-2 duration-200">
          <div className="p-4 border-b border-border bg-background/50 flex justify-between items-center sticky top-0">
            <h3 className="font-bold text-text-main">Notifications</h3>
            {unreadCount > 0 && (
              <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full font-medium">
                {unreadCount} new
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-text-muted">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map(n => (
                  <div 
                    key={n.id} 
                    className={`p-4 flex gap-3 transition-colors ${!n.isRead ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-background'}`}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {getIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.isRead ? 'font-semibold text-text-main' : 'font-medium text-text-muted'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-text-muted mt-1 break-words">
                        {n.message}
                      </p>
                      <p className="text-[10px] text-text-muted mt-2 uppercase tracking-wide">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {!n.isRead && (
                      <button 
                        onClick={() => markAsRead(n.id)}
                        className="flex-shrink-0 text-text-muted hover:text-primary transition-colors cursor-pointer"
                        title="Mark as read"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
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
