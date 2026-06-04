import type { TabGroupColor, ThemeMode } from './contracts';
import { allGroupColors } from './shared-utils';

export type ResolvedTheme = 'light' | 'dark';

export { allGroupColors };

export const groupColorTokens: Record<
  TabGroupColor,
  { solid: string; soft: string; ring: string }
> = {
  grey: {
    solid: '#64748b',
    soft: 'rgba(100, 116, 139, 0.16)',
    ring: 'rgba(100, 116, 139, 0.28)'
  },
  blue: {
    solid: '#2563eb',
    soft: 'rgba(37, 99, 235, 0.14)',
    ring: 'rgba(37, 99, 235, 0.28)'
  },
  red: {
    solid: '#dc2626',
    soft: 'rgba(220, 38, 38, 0.14)',
    ring: 'rgba(220, 38, 38, 0.28)'
  },
  yellow: {
    solid: '#ca8a04',
    soft: 'rgba(202, 138, 4, 0.14)',
    ring: 'rgba(202, 138, 4, 0.28)'
  },
  green: {
    solid: '#16a34a',
    soft: 'rgba(22, 163, 74, 0.14)',
    ring: 'rgba(22, 163, 74, 0.28)'
  },
  pink: {
    solid: '#db2777',
    soft: 'rgba(219, 39, 119, 0.14)',
    ring: 'rgba(219, 39, 119, 0.28)'
  },
  purple: {
    solid: '#7c3aed',
    soft: 'rgba(124, 58, 237, 0.14)',
    ring: 'rgba(124, 58, 237, 0.28)'
  },
  cyan: {
    solid: '#0891b2',
    soft: 'rgba(8, 145, 178, 0.14)',
    ring: 'rgba(8, 145, 178, 0.28)'
  },
  orange: {
    solid: '#ea580c',
    soft: 'rgba(234, 88, 12, 0.14)',
    ring: 'rgba(234, 88, 12, 0.28)'
  }
};

export function resolveTheme(theme: ThemeMode): ResolvedTheme {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return theme;
}

export function applyTheme(theme: ThemeMode): void {
  const resolvedTheme = resolveTheme(theme);
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
  try {
    localStorage.setItem('tm-theme', theme);
  } catch {
    // localStorage may be unavailable in some contexts; ignore silently
  }
}

let systemThemeCleanup: (() => void) | null = null;

/**
 * Subscribe to OS-level theme changes so the UI reacts in real time
 * when the user's system switches between light and dark mode.
 * Only effective when the active theme is "system".
 * Returns an unsubscribe function.
 */
export function watchSystemThemeChanges(getTheme: () => ThemeMode): () => void {
  // Clean up any previous listener
  systemThemeCleanup?.();
  systemThemeCleanup = null;

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handler = () => {
    if (getTheme() === 'system') {
      applyTheme('system');
    }
  };

  mediaQuery.addEventListener('change', handler);
  systemThemeCleanup = () => mediaQuery.removeEventListener('change', handler);

  return systemThemeCleanup;
}
