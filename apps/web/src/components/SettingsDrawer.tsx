import { X, Bell, Mail, Hash, Save, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@clerk/clerk-react';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const { getToken } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [enableNotifications, setEnableNotifications] = useState(true);
  const [globalCooldownHours, setGlobalCooldownHours] = useState(4);
  const [alertEmails, setAlertEmails] = useState('');
  const [emailOnWelcome, setEmailOnWelcome] = useState(true);
  const [emailOnGa4Added, setEmailOnGa4Added] = useState(false);
  const [emailOnTrackerAdded, setEmailOnTrackerAdded] = useState(false);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      getToken().then(token => {
        fetch('http://localhost:8787/api/settings', {
          headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
          if (data.settings) {
            setEnableNotifications(data.settings.enableNotifications);
            setGlobalCooldownHours(data.settings.globalCooldownHours);
            setAlertEmails(data.settings.alertEmails || '');
            setEmailOnWelcome(data.settings.emailOnWelcome ?? true);
            setEmailOnGa4Added(data.settings.emailOnGa4Added ?? false);
            setEmailOnTrackerAdded(data.settings.emailOnTrackerAdded ?? false);
            setDiscordWebhookUrl(data.settings.discordWebhookUrl || '');
          }
        })
        .finally(() => setIsLoading(false));
      });
    }
  }, [isOpen, getToken]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const token = await getToken();
      const res = await fetch('http://localhost:8787/api/settings', {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enableNotifications,
          globalCooldownHours,
          alertEmails,
          emailOnWelcome,
          emailOnGa4Added,
          emailOnTrackerAdded,
          discordWebhookUrl
        })
      });

      if (res.ok) {
        toast.success('Notification settings saved successfully!');
        onClose();
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      toast.error('Error saving settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div 
        className={`fixed inset-y-0 right-0 w-full max-w-md bg-surface border-l border-border shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-surface/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-2 text-text-main">
            <Bell className="w-5 h-5" />
            <h2 className="text-xl font-bold">Alert Settings</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-border/50 rounded-lg transition-colors cursor-pointer text-text-muted hover:text-text-main"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <form id="settings-form" onSubmit={handleSave} className="space-y-8">
              
              {/* Global Settings */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider">Global Preferences</h3>
                
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background/50">
                  <div>
                    <p className="font-medium text-text-main">Enable Notifications</p>
                    <p className="text-sm text-text-muted">Master switch for all alerts</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={enableNotifications}
                      onChange={(e) => setEnableNotifications(e.target.checked)}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Alert Cooldown (Hours)</label>
                  <p className="text-xs text-text-muted mb-2">Prevent notification spam for the same incident.</p>
                  <select 
                    value={globalCooldownHours}
                    onChange={(e) => setGlobalCooldownHours(Number(e.target.value))}
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 outline-none focus:border-primary transition-colors cursor-pointer text-sm"
                  >
                    <option value={1}>1 Hour</option>
                    <option value={4}>4 Hours (Recommended)</option>
                    <option value={12}>12 Hours</option>
                    <option value={24}>24 Hours</option>
                  </select>
                </div>
              </div>

              {/* Email Settings */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-text-muted" />
                  <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider">Email Notifications</h3>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Send alerts to:</label>
                  <input 
                    type="text" 
                    value={alertEmails}
                    onChange={(e) => setAlertEmails(e.target.value)}
                    placeholder="marketing@company.com, team@company.com" 
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 outline-none focus:border-primary transition-colors text-sm"
                  />
                  <p className="text-xs text-text-muted mb-4">Separate multiple emails with commas.</p>
                </div>

                <div className="space-y-3 bg-background/50 border border-border rounded-xl p-4">
                  <p className="text-sm font-medium mb-1">Email Event Preferences</p>
                  <p className="text-xs text-text-muted mb-3">Traffic drop alerts are always sent. Choose what else you want to receive:</p>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={emailOnWelcome} onChange={e => setEmailOnWelcome(e.target.checked)} className="accent-primary w-4 h-4" />
                    <span className="text-sm">Welcome & System Connected</span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={emailOnGa4Added} onChange={e => setEmailOnGa4Added(e.target.checked)} className="accent-primary w-4 h-4" />
                    <span className="text-sm">When a new GA4 Property is added</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={emailOnTrackerAdded} onChange={e => setEmailOnTrackerAdded(e.target.checked)} className="accent-primary w-4 h-4" />
                    <span className="text-sm">When a new Tracker is created</span>
                  </label>
                </div>
              </div>

              {/* Discord Settings */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-text-muted" />
                  <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider">Discord Integration</h3>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Webhook URL</label>
                  <p className="text-xs text-text-muted mb-2">Paste your Discord channel Webhook URL to receive alerts.</p>
                  <input 
                    type="url" 
                    value={discordWebhookUrl}
                    onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                    placeholder="https://discord.com/api/webhooks/..." 
                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 outline-none focus:border-primary transition-colors text-sm"
                  />
                </div>
              </div>

            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border bg-surface/50 backdrop-blur-md sticky bottom-0">
          <button 
            form="settings-form"
            type="submit"
            disabled={isSaving || isLoading}
            className="w-full bg-primary text-background font-semibold px-4 py-3 rounded-lg hover:bg-primary-hover transition-colors shadow-[0_0_15px_rgba(var(--color-primary),0.3)] disabled:opacity-70 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
