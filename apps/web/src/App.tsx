import { SignedIn, SignedOut, SignInButton, UserButton, useAuth } from "@clerk/clerk-react";
import { Activity, LayoutDashboard, Plus, AlertTriangle, ArrowRight, CheckCircle2, Link, Bell, Settings } from "lucide-react";
import { useState, useEffect } from "react";
import { Toaster, toast } from "react-hot-toast";
import { ThemeToggle } from "./components/ThemeToggle";
import { GTMDrawer } from "./components/GTMDrawer";
import { MetricChart } from "./components/MetricChart";
import { ColorPalette } from "./components/ColorPalette";
import { PropertySelector } from "./components/PropertySelector";
import { NotificationBell } from "./components/NotificationBell";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { CreateTrackerForm } from "./components/CreateTrackerForm";
import { TrackerManager } from "./components/TrackerManager";
import { AlertHistory } from "./components/AlertHistory";

export default function App() {
  const { getToken } = useAuth();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPropertySelectorOpen, setIsPropertySelectorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [stats, setStats] = useState({ activeTrackers: 0, monitoredProperties: 0, recentAlerts: 0 });

  // Fetch real dashboard stats from the API
  const fetchDashboard = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('http://localhost:8787/api/dashboard', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setIsGoogleConnected(data.isGoogleConnected);
      }
    } catch (e) {
      console.error("Failed to fetch dashboard stats", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [getToken]);

  // Listen for the OAuth success message sent from the popup window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'http://localhost:5173') return;
      if (event.data?.type === 'GA4_CONNECTED') {
        toast.success('🎉 Google Analytics connected!');
        setIsGoogleConnected(true);
        // Automatically open the Property Selector after connection
        setTimeout(() => setIsPropertySelectorOpen(true), 500);
        fetchDashboard();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [getToken]);

  const handleConnectGoogle = async () => {
    try {
      const token = await getToken();
      toast.success("Opening Google Analytics connection...");
      
      const res = await fetch('http://localhost:8787/api/google/connect-url', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const { url } = await res.json();
      
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      window.open(url, "GA4_Connect", `width=${width},height=${height},left=${left},top=${top}`);
    } catch (e) {
      toast.error("Failed to initiate connection.");
    }
  };

  const handleAddProperty = () => {
    if (!isGoogleConnected) {
      handleConnectGoogle();
    } else {
      setIsPropertySelectorOpen(true);
    }
  };

  // trackerKey is used to force re-render TrackerManager after creation
  const [trackerKey, setTrackerKey] = useState(0);

  const handleTrackerCreated = () => {
    setIsDrawerOpen(false);
    setTrackerKey(k => k + 1);
    fetchDashboard();
  };

  return (
    <div className="min-h-screen bg-background text-text-main flex flex-col transition-colors duration-300">
      <Toaster 
        position="bottom-left" 
        toastOptions={{ 
          className: 'bg-surface text-text-main border border-border shadow-lg font-sans',
          style: { background: 'var(--color-surface)', color: 'var(--color-text-main)' }
        }} 
      />

      <header className="border-b border-border bg-surface/50 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer">
          <Activity className="text-primary h-6 w-6" />
          <span className="font-bold text-xl tracking-tight">MetricMonitor</span>
        </div>
        
        <div className="flex items-center gap-4">
          <NotificationBell />
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-text-muted hover:text-text-main transition-colors cursor-pointer"
          >
            <Settings className="w-5 h-5" />
          </button>
          <div className="h-6 w-px bg-border mx-1"></div>
          <ColorPalette />
          <ThemeToggle />
          <SignedOut>
            <SignInButton mode="modal">
              <button className="bg-primary text-background font-semibold px-5 py-2.5 rounded-full hover:bg-primary-hover transition-colors cursor-pointer">
                Log In
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton appearance={{ elements: { avatarBox: "h-9 w-9 cursor-pointer" } }} />
          </SignedIn>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-10">
        <SignedOut>
          <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight">
              Smart GA4 Alerting for <span className="text-primary">Pro Teams</span>
            </h1>
            <p className="text-text-muted text-lg max-w-2xl">
              Never miss a sudden traffic drop again. Build powerful, Tag Manager-style rules to monitor your most critical Google Analytics 4 properties on autopilot.
            </p>
            <SignInButton mode="modal">
              <button className="bg-primary text-background font-bold text-lg px-8 py-4 rounded-full hover:bg-primary-hover transition-transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(var(--color-primary),0.3)] cursor-pointer">
                Start Monitoring Free
              </button>
            </SignInButton>
          </div>
        </SignedOut>

        <SignedIn>
          {isLoading ? (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="flex items-center justify-between">
                <div className="h-10 w-64 bg-border/40 rounded-lg skeleton"></div>
                <div className="flex gap-3">
                  <div className="h-10 w-32 bg-border/40 rounded-lg skeleton"></div>
                  <div className="h-10 w-32 bg-primary/20 rounded-lg skeleton"></div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => (
                  <div key={i} className="glass-panel p-6 flex flex-col gap-3">
                    <div className="h-5 w-24 bg-border/40 rounded skeleton"></div>
                    <div className="h-10 w-16 bg-border/60 rounded skeleton"></div>
                  </div>
                ))}
              </div>

              <div className="glass-panel p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="h-7 w-48 bg-border/40 rounded skeleton"></div>
                  <div className="h-8 w-32 bg-border/40 rounded skeleton"></div>
                </div>
                <div className="h-[300px] w-full bg-border/20 rounded-lg skeleton"></div>
              </div>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in duration-500">
              {/* Header Row */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h1 className="text-3xl font-bold">Workspace Overview</h1>
                  {isGoogleConnected && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-green-500 font-medium">Google Analytics Connected</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  {!isGoogleConnected ? (
                    <button 
                      onClick={handleConnectGoogle}
                      className="bg-primary text-background px-4 py-2 rounded-lg transition-colors font-semibold flex items-center gap-2 cursor-pointer hover:bg-primary-hover"
                    >
                      <Link className="h-4 w-4" />
                      Connect Google Account
                    </button>
                  ) : (
                    <>
                      <button 
                        onClick={handleAddProperty}
                        className="bg-surface border border-border hover:border-primary/50 px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2 cursor-pointer"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        Add GA4 Property
                      </button>
                      <button 
                        onClick={() => setIsDrawerOpen(true)}
                        className="bg-primary text-background px-4 py-2 rounded-lg transition-colors font-semibold flex items-center gap-2 cursor-pointer hover:bg-primary-hover disabled:opacity-50"
                        disabled={stats.monitoredProperties === 0}
                      >
                        <Plus className="h-4 w-4" />
                        Create Tracker
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel p-6 flex flex-col gap-2 hover:border-primary/30 transition-colors cursor-pointer group">
                  <span className="text-text-muted text-sm font-medium group-hover:text-text-main transition-colors">Active Trackers</span>
                  <span className="text-4xl font-bold">{stats.activeTrackers}</span>
                </div>
                <div className="glass-panel p-6 flex flex-col gap-2 hover:border-primary/30 transition-colors cursor-pointer group">
                  <span className="text-text-muted text-sm font-medium group-hover:text-text-main transition-colors">Properties Monitored</span>
                  <span className="text-4xl font-bold">{stats.monitoredProperties}</span>
                </div>
                <div className="glass-panel p-6 flex flex-col gap-2 hover:border-primary/30 transition-colors cursor-pointer group">
                  <span className="text-text-muted text-sm font-medium group-hover:text-text-main transition-colors">Alerts (Last 7d)</span>
                  <div className="flex items-center gap-2">
                    <span className="text-4xl font-bold text-primary">{stats.recentAlerts}</span>
                    {stats.recentAlerts > 0 && <AlertTriangle className="h-5 w-5 text-primary" />}
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="glass-panel p-6 relative">
                
                {stats.monitoredProperties === 0 && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface/50 backdrop-blur-sm rounded-xl">
                    <p className="font-semibold text-lg mb-4">No data to display</p>
                    <button 
                      onClick={handleAddProperty}
                      className="bg-primary text-background font-semibold px-5 py-2.5 rounded-full hover:bg-primary-hover transition-colors cursor-pointer flex items-center gap-2 shadow-[0_0_20px_rgba(var(--color-primary),0.3)]"
                    >
                      {isGoogleConnected ? 'Add a GA4 property' : 'Connect Google to get started'} <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
                
                <MetricChart />
              </div>

              {/* Tracker Manager */}
              <div className="glass-panel p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold">Your Trackers</h2>
                  <button 
                    onClick={() => setIsDrawerOpen(true)}
                    className="text-sm text-primary hover:text-primary-hover font-medium transition-colors cursor-pointer flex items-center gap-1"
                    disabled={stats.monitoredProperties === 0}
                  >
                    <Plus className="w-4 h-4" /> Add New
                  </button>
                </div>
                <TrackerManager key={trackerKey} />
              </div>

              {/* Alert / Incident History */}
              <div className="glass-panel p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold">Incident History</h2>
                </div>
                <AlertHistory />
              </div>
            </div>
          )}
        </SignedIn>
      </main>

      {/* Property Selector Modal */}
      <PropertySelector 
        isOpen={isPropertySelectorOpen}
        onClose={() => setIsPropertySelectorOpen(false)}
        onPropertyAdded={() => fetchDashboard()}
        getToken={getToken}
      />

      <GTMDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)}
        title="Create New Tracker"
      >
        <CreateTrackerForm 
          onSuccess={handleTrackerCreated}
          onCancel={() => setIsDrawerOpen(false)}
        />
      </GTMDrawer>

      {/* Settings Drawer */}
      <SettingsDrawer 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
}
