import type { KeyboardShortcutsConfig, ShortcutConfig } from './types';
import { executeAction } from './actions';
import { eventToBinding, isInputElement } from './shared-utils';

const registeredShortcuts: Map<string, ShortcutConfig> = new Map();
let listenerAttached = false;
let commandPaletteToggleHandler: (() => void) | null = null;
let lastFiredTime = 0;
const DEBOUNCE_MS = 50;

export function attachKeydownListener(): void {
  if (listenerAttached) return;
  document.addEventListener('keydown', handleKeydown, { capture: true });
  listenerAttached = true;
}

export function detachKeydownListener(): void {
  document.removeEventListener('keydown', handleKeydown, { capture: true });
  listenerAttached = false;
  registeredShortcuts.clear();
}

export function refreshRegisteredShortcuts(config: KeyboardShortcutsConfig): void {
  registeredShortcuts.clear();
  for (const shortcut of config.shortcuts) {
    if (shortcut.enabled && shortcut.keyBinding) {
      registeredShortcuts.set(shortcut.keyBinding, shortcut);
    }
  }
}

export function setCommandPaletteToggleHandler(handler: (() => void) | null): void {
  commandPaletteToggleHandler = handler;
}

function handleKeydown(e: KeyboardEvent): void {
  if (isInputElement(e.target)) return;
  if (e.repeat) return;

  const now = Date.now();
  if (now - lastFiredTime < DEBOUNCE_MS) return;

  const binding = eventToBinding(e);
  const shortcut = registeredShortcuts.get(binding);

  if (!shortcut) return;

  e.preventDefault();

  lastFiredTime = now;

  if (shortcut.action === 'toggle-command-palette') {
    commandPaletteToggleHandler?.();
    return;
  }

  executeAction(shortcut.action).catch((error) => {
    console.warn('Failed to execute shortcut:', binding, error);
  });
}
