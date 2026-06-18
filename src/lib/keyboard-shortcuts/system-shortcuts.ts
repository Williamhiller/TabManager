const IS_MAC = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

export interface SystemShortcut {
  label: string;
  binding: string;
  category: 'tab' | 'navigation' | 'page' | 'extension';
}

function mod(key: string): string {
  return IS_MAC ? `Cmd+${key}` : `Ctrl+${key}`;
}

function modShift(key: string): string {
  return IS_MAC ? `Cmd+Shift+${key}` : `Ctrl+Shift+${key}`;
}

export const systemShortcuts: SystemShortcut[] = [
  { label: 'New tab', binding: mod('T'), category: 'tab' },
  { label: 'Close tab', binding: mod('W'), category: 'tab' },
  { label: 'Reopen closed tab', binding: modShift('T'), category: 'tab' },
  { label: 'New window', binding: mod('N'), category: 'tab' },
  { label: 'New incognito window', binding: modShift('N'), category: 'tab' },
  { label: 'Next tab', binding: mod('Tab'), category: 'tab' },
  { label: 'Previous tab', binding: modShift('Tab'), category: 'tab' },
  { label: 'Switch to tab 1–9', binding: mod('1') + ' … ' + mod('9'), category: 'tab' },

  { label: 'Find on page', binding: mod('F'), category: 'navigation' },
  { label: 'Focus address bar', binding: mod('L'), category: 'navigation' },
  { label: 'Bookmark this page', binding: mod('D'), category: 'navigation' },
  { label: 'Show history', binding: mod('H'), category: 'navigation' },
  { label: 'Show downloads', binding: mod('J'), category: 'navigation' },

  { label: 'Reload', binding: mod('R'), category: 'page' },
  { label: 'Hard reload', binding: modShift('R'), category: 'page' },
  { label: 'Zoom in', binding: mod('='), category: 'page' },
  { label: 'Zoom out', binding: mod('-'), category: 'page' },
  { label: 'Reset zoom', binding: mod('0'), category: 'page' },
  { label: 'Print', binding: mod('P'), category: 'page' },
  { label: 'Save page as', binding: mod('S'), category: 'page' },
  { label: 'View source', binding: mod('U'), category: 'page' },

  { label: 'Developer tools', binding: 'F12', category: 'extension' },
  { label: 'Console', binding: modShift('J'), category: 'extension' },
  { label: 'Inspect element', binding: modShift('C'), category: 'extension' },
  { label: 'Open side panel', binding: modShift('B'), category: 'extension' },
  { label: 'Command palette', binding: modShift('K'), category: 'extension' },
];

export const systemShortcutCategories = [
  { id: 'tab', label: 'Tab management' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'page', label: 'Page actions' },
  { id: 'extension', label: 'Extension' },
] as const;
