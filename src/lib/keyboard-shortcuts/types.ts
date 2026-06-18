export type ShortcutAction =
  | 'switch-tab-left'
  | 'switch-tab-right'
  | 'close-tabs-left'
  | 'close-tabs-right'
  | 'close-other-tabs'
  | 'toggle-pin-tab'
  | 'toggle-mute-tab'
  | 'duplicate-tab'
  | 'move-tab-left'
  | 'move-tab-right'
  | 'collapse-all-groups'
  | 'toggle-command-palette';

export interface ShortcutConfig {
  id: string;
  action: ShortcutAction;
  enabled: boolean;
  keyBinding: string | null;
}

export interface ShortcutPreset {
  id: string;
  name: string;
  description: string;
  shortcuts: Array<{
    action: ShortcutAction;
    keyBinding: string;
  }>;
}

export interface KeyboardShortcutsConfig {
  version: 1;
  shortcuts: ShortcutConfig[];
  enabledPresetId: string | null;
}

export interface ShortcutActionMeta {
  action: ShortcutAction;
  label: string;
  category: 'tab-switch' | 'tab-close' | 'tab-operation' | 'tab-move' | 'tab-group' | 'ui';
  description: string;
}
