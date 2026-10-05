import { useState, useEffect } from 'react';
import { Palette } from 'lucide-react';

const THEMES = [
  { name: 'Teal', primary: '#4FF8D2', hover: '#88FFE4' },
  { name: 'Emerald', primary: '#10B981', hover: '#34D399' },
  { name: 'Cyan', primary: '#06B6D4', hover: '#22D3EE' },
  { name: 'Blue', primary: '#3B82F6', hover: '#60A5FA' },
  { name: 'Indigo', primary: '#6366F1', hover: '#818CF8' },
  { name: 'Purple', primary: '#A855F7', hover: '#C084FC' },
  { name: 'Pink', primary: '#EC4899', hover: '#F472B6' },
  { name: 'Rose', primary: '#F43F5E', hover: '#FB7185' },
  { name: 'Orange', primary: '#F97316', hover: '#FB923C' },
  { name: 'Amber', primary: '#F59E0B', hover: '#FBBF24' },
];

export function ColorPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTheme, setActiveTheme] = useState(THEMES[0].name);

  useEffect(() => {
    const savedTheme = localStorage.getItem('metric-monitor-theme');
    if (savedTheme) {
      const theme = THEMES.find(t => t.name === savedTheme);
      if (theme) {
        applyTheme(theme);
      }
    }
  }, []);

  const applyTheme = (theme: typeof THEMES[0]) => {
    const root = document.documentElement;
    
    // We only update the dynamic theme colors if we are in dark mode, or we can just override the primary color
    // For simplicity, let's just override the primary CSS variables directly on the root element
    root.style.setProperty('--color-primary', theme.primary);
    root.style.setProperty('--color-primary-hover', theme.hover);
    
    setActiveTheme(theme.name);
    localStorage.setItem('metric-monitor-theme', theme.name);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-full hover:bg-border/50 transition-colors cursor-pointer group"
        title="Change Theme Color"
      >
        <Palette className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 p-3 bg-surface border border-border rounded-xl shadow-xl z-50 min-w-[120px]">
            <p className="text-xs font-semibold text-text-muted mb-2 px-1">Theme Color</p>
            <div className="flex flex-col gap-1">
              {THEMES.map((theme) => (
                <button
                  key={theme.name}
                  onClick={() => {
                    applyTheme(theme);
                    setIsOpen(false);
                  }}
                  className={`flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-border/50 transition-colors cursor-pointer ${activeTheme === theme.name ? 'bg-border/30' : ''}`}
                >
                  <span 
                    className="w-4 h-4 rounded-full shadow-sm"
                    style={{ backgroundColor: theme.primary }}
                  />
                  <span className="text-sm font-medium">{theme.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
