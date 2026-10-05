import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('metric-monitor-mode');
      if (savedMode) return savedMode === 'dark';
    }
    return true; // Default to dark mode
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('metric-monitor-mode', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('metric-monitor-mode', 'light');
    }
  }, [isDark]);

  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className="p-2 rounded-full hover:bg-border/50 transition-colors cursor-pointer"
      title="Toggle Theme"
    >
      {isDark ? <Sun className="w-5 h-5 text-primary" /> : <Moon className="w-5 h-5 text-primary" />}
    </button>
  );
}
