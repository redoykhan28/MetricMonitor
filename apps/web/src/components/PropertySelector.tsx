import { useState, useEffect } from 'react';
import { X, Check, Loader2, Search, Globe } from 'lucide-react';
import { toast } from 'react-hot-toast';

type GA4Property = {
  name: string;
  property: string;
  displayName: string;
};

type AccountSummary = {
  name: string;
  account: string;
  displayName: string;
  propertySummaries?: GA4Property[];
};

interface PropertySelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onPropertyAdded: () => void;
  getToken: () => Promise<string | null>;
}

export function PropertySelector({ isOpen, onClose, onPropertyAdded, getToken }: PropertySelectorProps) {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    setIsLoading(true);
    setError(null);
    
    getToken().then(token => {
      fetch('http://localhost:8787/api/google/properties', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(r => r.json())
      .then((data: any) => {
        if (data.error) {
          setError(data.error);
          setHint(data.hint || null);
        } else {
          setAccounts(data.accounts || []);
        }
      })
      .catch(() => setError('Failed to fetch properties'))
      .finally(() => setIsLoading(false));
    });
  }, [isOpen, getToken]);

  const handleAddProperty = async (property: GA4Property) => {
    const propertyId = property.property.replace('properties/', '');
    setIsAdding(propertyId);

    try {
      const token = await getToken();
      const res = await fetch('http://localhost:8787/api/google/properties/add', {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ga4PropertyId: propertyId,
          name: property.displayName,
        })
      });

      const data = await res.json();

      if (res.status === 409) {
        toast.error('This property is already being monitored.');
      } else if (res.ok) {
        toast.success(`✅ "${property.displayName}" is now being monitored!`);
        onPropertyAdded();
        onClose();
      } else {
        toast.error(data.error || 'Failed to add property.');
      }
    } catch {
      toast.error('Failed to connect. Please try again.');
    } finally {
      setIsAdding(null);
    }
  };

  // Flatten all properties across all accounts for search
  const allProperties = accounts.flatMap(account => 
    (account.propertySummaries || []).map(prop => ({
      ...prop,
      accountName: account.displayName,
    }))
  );

  const filteredProperties = searchQuery 
    ? allProperties.filter(p => 
        p.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.accountName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allProperties;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col pointer-events-auto animate-in fade-in zoom-in-95 duration-200"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div>
              <h2 className="text-xl font-bold">Add GA4 Property</h2>
              <p className="text-sm text-text-muted mt-1">Select a property to start monitoring</p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-border/50 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-6 pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input 
                type="text"
                placeholder="Search properties..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-background border border-border rounded-lg pl-10 pr-4 py-2.5 outline-none focus:border-primary transition-colors text-sm"
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 pt-4">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-border/20">
                    <div className="w-8 h-8 bg-border/40 rounded-lg skeleton" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-36 bg-border/40 rounded skeleton" />
                      <div className="h-3 w-24 bg-border/30 rounded skeleton" />
                    </div>
                    <div className="h-8 w-16 bg-border/40 rounded-lg skeleton" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-10 space-y-4">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                  <Globe className="w-6 h-6 text-red-500" />
                </div>
                <p className="font-semibold text-red-500">{error}</p>
                {hint && (
                  <p className="text-sm text-text-muted max-w-sm mx-auto">{hint}</p>
                )}
                <button
                  onClick={() => { setError(null); setHint(null); setIsLoading(true); }}
                  className="text-sm text-primary hover:underline cursor-pointer"
                >
                  Try reconnecting Google
                </button>
              </div>
            ) : filteredProperties.length === 0 ? (
              <div className="text-center py-10 space-y-4">
                <Globe className="w-12 h-12 text-text-muted mx-auto" />
                <p className="font-medium">No GA4 properties found</p>
                {searchQuery ? (
                  <p className="text-sm text-text-muted">No properties match your search.</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-text-muted max-w-sm mx-auto">
                      The connected Google account has no GA4 properties visible to it. This usually means:
                    </p>
                    <ul className="text-sm text-text-muted text-left space-y-1 max-w-xs mx-auto">
                      <li>• The GA4 property is under a <strong>different Google account</strong></li>
                      <li>• Your account only has <strong>Viewer</strong> access (Editor or above needed)</li>
                      <li>• The <strong>Google Analytics Admin API</strong> is not enabled in GCP</li>
                    </ul>
                    <button
                      onClick={onClose}
                      className="text-sm text-primary hover:underline cursor-pointer font-medium"
                    >
                      → Reconnect with the correct Google account
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredProperties.map(prop => {
                  const propertyId = prop.property.replace('properties/', '');
                  return (
                    <div 
                      key={prop.property}
                      className="flex items-center gap-3 p-4 rounded-xl bg-border/10 hover:bg-border/20 border border-transparent hover:border-border transition-all group"
                    >
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Globe className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{prop.displayName}</p>
                        <p className="text-xs text-text-muted truncate">
                          {prop.accountName} · {propertyId}
                        </p>
                      </div>
                      <button
                        onClick={() => handleAddProperty(prop)}
                        disabled={isAdding === propertyId}
                        className="bg-primary text-background px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                      >
                        {isAdding === propertyId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        {isAdding === propertyId ? 'Adding...' : 'Monitor'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
