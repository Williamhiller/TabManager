import type { ShortcutPreset } from './types';

export const defaultPresets: ShortcutPreset[] = [
  {
    id: 'vim',
    name: 'Vim Mode',
    description: 'Left-hand focused, Vimium-style bindings.',
    shortcuts: [
      { action: 'switch-tab-left', keyBinding: 'Shift+h' },
      { action: 'switch-tab-right', keyBinding: 'Shift+l' },
      { action: 'toggle-pin-tab', keyBinding: 'Mod+Shift+p' },
      { action: 'move-tab-left', keyBinding: 'Mod+Shift+h' },
      { action: 'move-tab-right', keyBinding: 'Mod+Shift+l' },
      { action: 'toggle-command-palette', keyBinding: 'Shift+/' },
    ],
  },
  {
    id: 'full',
    name: 'Full Featured',
    description: 'All shortcuts enabled. For power users who want everything.',
    shortcuts: [
      { action: 'switch-tab-left', keyBinding: 'Alt+ArrowLeft' },
      { action: 'switch-tab-right', keyBinding: 'Alt+ArrowRight' },
      { action: 'close-tabs-left', keyBinding: 'Mod+Shift+Alt+ArrowLeft' },
      { action: 'close-tabs-right', keyBinding: 'Mod+Shift+Alt+ArrowRight' },
      { action: 'close-other-tabs', keyBinding: 'Mod+Shift+Alt+o' },
      { action: 'toggle-pin-tab', keyBinding: 'Mod+Shift+p' },
      { action: 'toggle-mute-tab', keyBinding: 'Mod+Shift+m' },
      { action: 'duplicate-tab', keyBinding: 'Mod+Shift+d' },
      { action: 'move-tab-left', keyBinding: 'Mod+Shift+ArrowLeft' },
      { action: 'move-tab-right', keyBinding: 'Mod+Shift+ArrowRight' },
      { action: 'collapse-all-groups', keyBinding: 'Mod+Shift+ArrowDown' },
      { action: 'toggle-command-palette', keyBinding: 'Mod+Shift+k' },
    ],
  },
];
