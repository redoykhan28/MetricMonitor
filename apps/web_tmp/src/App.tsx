import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { Activity, Bell, Settings, LayoutDashboard } from "lucide-react";

export default function App() {
  return (
    <div className="min-h-screen bg-background text-text-main flex flex-col">
      <header className="border-b border-border bg-surface/50 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Activity className="text-primary h-6 w-6" />
          <span className="font-bold text-xl tracking-tight">MetricMonitor</span>
        </div>
        
        <div>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="bg-primary text-background font-semibold px-5 py-2.5 rounded-full hover:bg-primary-hover transition-colors">
                Log In
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton appearance={{ elements: { avatarBox: "h-9 w-9" } }} />
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
              <button className="bg-primary text-background font-bold text-lg px-8 py-4 rounded-full hover:bg-primary-hover transition-transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(79,248,210,0.3)]">
                Start Monitoring Free
              </button>
            </SignInButton>
          </div>
        </SignedOut>

        <SignedIn>
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold">Workspace Overview</h1>
              <button className="bg-surface border border-border hover:border-primary/50 px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                Add GA4 Property
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Placeholder Stat Cards */}
              <div className="glass-panel p-6 flex flex-col gap-2">
                <span className="text-text-muted text-sm font-medium">Active Trackers</span>
                <span className="text-4xl font-bold">0</span>
              </div>
              <div className="glass-panel p-6 flex flex-col gap-2">
                <span className="text-text-muted text-sm font-medium">Properties Monitored</span>
                <span className="text-4xl font-bold">0</span>
              </div>
              <div className="glass-panel p-6 flex flex-col gap-2">
                <span className="text-text-muted text-sm font-medium">Alerts (Last 7d)</span>
                <span className="text-4xl font-bold text-primary">0</span>
              </div>
            </div>

            <div className="glass-panel p-10 flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-16 w-16 bg-surface border border-border rounded-full flex items-center justify-center mb-2">
                <Bell className="h-8 w-8 text-text-muted" />
              </div>
              <h3 className="text-xl font-semibold">No Properties Connected</h3>
              <p className="text-text-muted max-w-md">Connect your first Google Analytics 4 property to start building your custom monitoring trackers.</p>
              <button className="bg-primary text-background font-semibold px-6 py-3 rounded-full hover:bg-primary-hover transition-colors mt-4">
                Connect Google Account
              </button>
            </div>
          </div>
        </SignedIn>
      </main>
    </div>
  );
}
