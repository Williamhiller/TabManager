import type { TabGroupColor, ThemeMode } from './contracts';

export type ResolvedTheme = 'light' | 'dark';

export const allGroupColors: TabGroupColor[] = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange'
];

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
}
