import { createContext, useContext, useMemo, useState, useSyncExternalStore } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import type { Theme } from '../tokens/index.ts';

export type Appearance = Theme | 'system';
export interface ThemeState {
  appearance: Appearance;
  resolvedTheme: Theme;
  reducedMotion: boolean;
  setAppearance: (appearance: Appearance) => void;
}
const ThemeContext = createContext<ThemeState | null>(null);

function useMedia(query: string): boolean {
  const store = useMemo(() => ({
    subscribe: (notify: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', notify);
      return () => media.removeEventListener('change', notify);
    },
    snapshot: () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  }), [query]);
  return useSyncExternalStore(store.subscribe, store.snapshot, () => false);
}

export interface ThemeProviderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onChange'> {
  children: ReactNode;
  appearance?: Appearance;
  defaultAppearance?: Appearance;
  onAppearanceChange?: (appearance: Appearance) => void;
}

/** Scoped theme, with no persistence or document-global mutation. Surfaces are opaque. */
export function ThemeProvider({ children, appearance: controlled, defaultAppearance = 'system', onAppearanceChange, className = '', ...props }: ThemeProviderProps) {
  const [local, setLocal] = useState(defaultAppearance);
  const appearance = controlled ?? local;
  const systemDark = useMedia('(prefers-color-scheme: dark)');
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const value = useMemo<ThemeState>(() => ({
    appearance,
    resolvedTheme: appearance === 'system' ? systemDark ? 'dark' : 'light' : appearance,
    reducedMotion,
    setAppearance(next) { if (controlled === undefined) setLocal(next); onAppearanceChange?.(next); },
  }), [appearance, controlled, onAppearanceChange, reducedMotion, systemDark]);
  return <ThemeContext.Provider value={value}>
    <div {...props} className={`lc-theme ${className}`} data-lc-theme={value.resolvedTheme} data-lc-motion={reducedMotion ? 'reduced' : 'normal'} data-lc-surface="opaque">{children}</div>
  </ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme requires ThemeProvider');
  return value;
}
