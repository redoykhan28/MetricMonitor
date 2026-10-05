import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface CreateTrackerFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function CreateTrackerForm({ onSuccess, onCancel }: CreateTrackerFormProps) {
  const { getToken } = useAuth();
  
  // Form State
  const [properties, setProperties] = useState<{ id: string, name: string }[]>([]);
  const [isLoadingProps, setIsLoadingProps] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [propertyId, setPropertyId] = useState('');
  const [name, setName] = useState('');
  const [metric, setMetric] = useState('activeUsers');
  const [condition, setCondition] = useState('drops_by');
  const [thresholdValue, setThresholdValue] = useState(40);
  const [compareWindow, setCompareWindow] = useState('previous_day');

  useEffect(() => {
    getToken().then(token => {
      // We can fetch properties from the dashboard endpoint or a new one.
      // We'll use a specific GET /api/properties if we build one, or just hit /api/dashboard and we need to return properties there.
      // Wait, dashboard doesn't return the list of properties. Let's create a quick fetch to our new /api/trackers endpoint which returns userProperties in the schema?
      // Ah! We don't have a GET /api/properties endpoint. I will just fetch trackers and deduce properties, OR better yet, let's create a small endpoint in dashboard or trackers.
      // Actually, we can fetch from a new endpoint /api/dashboard/properties.
      // Let's assume we'll build GET /api/dashboard/properties next.
      fetch('http://localhost:8787/api/dashboard/properties', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        setProperties(data.properties || []);
        if (data.properties?.length > 0) {
          setPropertyId(data.properties[0].id);
        }
      })
      .finally(() => setIsLoadingProps(false));
    });
  }, [getToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) return toast.error('Please select a property');
    
    setIsSaving(true);
    
    try {
      const token = await getToken();
      const res = await fetch('http://localhost:8787/api/trackers', {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          propertyId,
          name,
          metric,
          condition,
          thresholdValue,
          compareWindow
        })
      });

      if (res.ok) {
        toast.success("New Tracker rule created and saved!");
        onSuccess();
      } else {
        throw new Error('Failed to create tracker');
      }
    } catch {
      toast.error('Failed to create tracker');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingProps) {
    return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium">Select GA4 Property</label>
        <select 
          required
          value={propertyId}
          onChange={e => setPropertyId(e.target.value)}
          className="w-full bg-background border border-border rounded-lg px-4 py-2 outline-none focus:border-primary transition-colors cursor-pointer"
        >
          {properties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Tracker Name</label>
        <input 
          required
          value={name}
          onChange={e => setName(e.target.value)}
          type="text" 
          placeholder="e.g. Sudden Revenue Drop" 
          className="w-full bg-background border border-border rounded-lg px-4 py-2 outline-none focus:border-primary transition-colors"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Select Metric</label>
        <select 
          value={metric}
          onChange={e => setMetric(e.target.value)}
          className="w-full bg-background border border-border rounded-lg px-4 py-2 outline-none focus:border-primary transition-colors cursor-pointer"
        >
          <option value="purchaseRevenue">Total Revenue (purchaseRevenue)</option>
          <option value="activeUsers">Active Users (activeUsers)</option>
          <option value="eventCount">Total Events (eventCount)</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Condition</label>
          <select 
            value={condition}
            onChange={e => setCondition(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-4 py-2 outline-none focus:border-primary transition-colors cursor-pointer"
          >
            <option value="drops_by">Drops By (%)</option>
            <option value="greater_than">Greater Than ({'>'})</option>
            <option value="less_than">Less Than ({'<'})</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Value</label>
          <input 
            required
            type="number" 
            value={thresholdValue}
            onChange={e => setThresholdValue(Number(e.target.value))}
            className="w-full bg-background border border-border rounded-lg px-4 py-2 outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Compare Against</label>
        <select 
          value={compareWindow}
          onChange={e => setCompareWindow(e.target.value)}
          className="w-full bg-background border border-border rounded-lg px-4 py-2 outline-none focus:border-primary transition-colors cursor-pointer"
        >
          <option value="previous_day">Previous Day</option>
          <option value="avg_7_days">Average Last 7 Days</option>
        </select>
      </div>

      {/* Preset Packs */}
      <div className="space-y-3 pt-4 border-t border-border">
        <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Quick Presets</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setName('Revenue Drop Alert'); setMetric('purchaseRevenue'); setCondition('drops_by'); setThresholdValue(30); setCompareWindow('previous_day'); }}
            className="text-left text-xs p-3 rounded-lg border border-border hover:border-primary/50 bg-background/50 hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <span className="font-bold block mb-0.5">🛒 Ecommerce Pack</span>
            <span className="text-text-muted">Revenue drops {'>'} 30%</span>
          </button>
          <button
            type="button"
            onClick={() => { setName('Traffic Drop Alert'); setMetric('activeUsers'); setCondition('drops_by'); setThresholdValue(40); setCompareWindow('avg_7_days'); }}
            className="text-left text-xs p-3 rounded-lg border border-border hover:border-primary/50 bg-background/50 hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <span className="font-bold block mb-0.5">📊 Traffic Pack</span>
            <span className="text-text-muted">Users drop {'>'} 40% vs 7d avg</span>
          </button>
          <button
            type="button"
            onClick={() => { setName('Session Drop Alert'); setMetric('sessions'); setCondition('drops_by'); setThresholdValue(25); setCompareWindow('previous_day'); }}
            className="text-left text-xs p-3 rounded-lg border border-border hover:border-primary/50 bg-background/50 hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <span className="font-bold block mb-0.5">⚡ Session Pack</span>
            <span className="text-text-muted">Sessions drop {'>'} 25% vs prev day</span>
          </button>
          <button
            type="button"
            onClick={() => { setName('Event Spike Alert'); setMetric('eventCount'); setCondition('greater_than'); setThresholdValue(10000); setCompareWindow('previous_day'); }}
            className="text-left text-xs p-3 rounded-lg border border-border hover:border-primary/50 bg-background/50 hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <span className="font-bold block mb-0.5">🔔 Event Spike</span>
            <span className="text-text-muted">Events exceed 10,000/day</span>
          </button>
        </div>
      </div>

      <div className="pt-6 border-t border-border flex justify-end gap-3">
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
          Save Tracker
        </button>
      </div>
    </form>
  );
}
