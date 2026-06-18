import type {
  ShortcutAction,
  ShortcutConfig,
  ShortcutActionMeta,
  KeyboardShortcutsConfig
} from './types';

export const STORAGE_KEY = 'keyboard-shortcuts-config';

export const allActions: ShortcutActionMeta[] = [
  { action: 'switch-tab-left', label: 'Switch tab left', category: 'tab-switch', description: 'Activate the tab to the left' },
  { action: 'switch-tab-right', label: 'Switch tab right', category: 'tab-switch', description: 'Activate the tab to the right' },
  { action: 'close-tabs-left', label: 'Close tabs to the left', category: 'tab-close', description: 'Close all tabs to the left of the active tab' },
  { action: 'close-tabs-right', label: 'Close tabs to the right', category: 'tab-close', description: 'Close all tabs to the right of the active tab' },
  { action: 'close-other-tabs', label: 'Close other tabs', category: 'tab-close', description: 'Close all tabs except the active tab' },
  { action: 'toggle-pin-tab', label: 'Pin/unpin tab', category: 'tab-operation', description: 'Toggle pin state of the active tab' },
  { action: 'toggle-mute-tab', label: 'Mute/unmute tab', category: 'tab-operation', description: 'Toggle mute state of the active tab' },
  { action: 'duplicate-tab', label: 'Duplicate tab', category: 'tab-operation', description: 'Duplicate the active tab' },
  { action: 'move-tab-left', label: 'Move tab left', category: 'tab-move', description: 'Move the active tab one position to the left' },
  { action: 'move-tab-right', label: 'Move tab right', category: 'tab-move', description: 'Move the active tab one position to the right' },
  { action: 'collapse-all-groups', label: 'Collapse all groups', category: 'tab-group', description: 'Collapse all tab groups in the current window' },
  { action: 'toggle-command-palette', label: 'Command palette', category: 'ui', description: 'Open the command palette' },
];

export const actionCategories = [
  { id: 'tab-switch', label: 'Tab switching' },
  { id: 'tab-close', label: 'Tab closing' },
  { id: 'tab-operation', label: 'Tab operations' },
  { id: 'tab-move', label: 'Tab movement' },
  { id: 'tab-group', label: 'Tab groups' },
  { id: 'ui', label: 'UI' },
] as const;

let idCounter = 0;

function generateId(): string {
  return `shortcut-${Date.now()}-${++idCounter}`;
}

export function createShortcut(action: ShortcutAction, keyBinding: string | null = null): ShortcutConfig {
  return {
    id: generateId(),
    action,
    enabled: true,
    keyBinding,
  };
}

export function getDefaultShortcuts(): ShortcutConfig[] {
  return [
    createShortcut('switch-tab-left', 'Alt+ArrowLeft'),
    createShortcut('switch-tab-right', 'Alt+ArrowRight'),
    createShortcut('toggle-pin-tab', 'Mod+Shift+p'),
    createShortcut('move-tab-left', 'Mod+Shift+ArrowLeft'),
    createShortcut('move-tab-right', 'Mod+Shift+ArrowRight'),
    createShortcut('toggle-command-palette', 'Mod+Shift+k'),
  ];
}

export function getDefaultConfig(): KeyboardShortcutsConfig {
  return {
    version: 1,
    shortcuts: getDefaultShortcuts(),
    enabledPresetId: null,
  };
}

export async function getShortcutConfig(): Promise<KeyboardShortcutsConfig> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY] as KeyboardShortcutsConfig | undefined;
    if (stored && stored.version === 1) {
      return stored;
    }
  } catch {
    // fallback
  }
  return getDefaultConfig();
}

export async function saveShortcutConfig(
  config: KeyboardShortcutsConfig
): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: config });
}

export async function updateShortcutConfig(
  patch: Partial<KeyboardShortcutsConfig>
): Promise<KeyboardShortcutsConfig> {
  const current = await getShortcutConfig();
  const next = { ...current, ...patch };
  await saveShortcutConfig(next);
  return next;
}

export async function updateSingleShortcut(
  shortcutId: string,
  patch: Partial<ShortcutConfig>
): Promise<KeyboardShortcutsConfig> {
  const config = await getShortcutConfig();
  const shortcuts = config.shortcuts.map((s) =>
    s.id === shortcutId ? { ...s, ...patch } : s
  );
  return updateShortcutConfig({ shortcuts });
}

export function detectConflicts(
  shortcuts: ShortcutConfig[]
): Map<string, string[]> {
  const conflicts = new Map<string, string[]>();
  const bindingMap = new Map<string, string[]>();

  for (const s of shortcuts) {
    if (!s.enabled || !s.keyBinding) continue;
    const existing = bindingMap.get(s.keyBinding) ?? [];
    existing.push(s.id);
    bindingMap.set(s.keyBinding, existing);
  }

  for (const [, ids] of bindingMap) {
    if (ids.length > 1) {
      for (const id of ids) {
        conflicts.set(id, ids.filter((other) => other !== id));
      }
    }
  }

  return conflicts;
}
