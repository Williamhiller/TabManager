const IS_MAC = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

export function eventToBinding(e: KeyboardEvent): string {
  const parts: string[] = [];
  const modPressed = IS_MAC ? e.metaKey : e.ctrlKey;
  if (modPressed) parts.push('Mod');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toLowerCase();
  if (key === 'ArrowLeft') key = 'ArrowLeft';
  if (key === 'ArrowRight') key = 'ArrowRight';
  if (key === 'ArrowUp') key = 'ArrowUp';
  if (key === 'ArrowDown') key = 'ArrowDown';

  parts.push(key);
  return parts.join('+');
}

export function isInputElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    el.isContentEditable ||
    el.closest('[data-shortcut-recorder="true"]') != null
  );
}

const RESERVED_BINDINGS: ReadonlySet<string> = new Set([
  'Mod+t',
  'Mod+w',
  'Mod+Shift+t',
  'Mod+Tab',
  'Mod+Shift+Tab',
  'Mod+1', 'Mod+2', 'Mod+3', 'Mod+4', 'Mod+5',
  'Mod+6', 'Mod+7', 'Mod+8', 'Mod+9',
  'Mod+l',
  'Mod+d',
  'Mod+h',
  'Mod+j',
  'Mod+n',
  'Mod+Shift+n',
  'Mod+r',
  'Mod+Shift+r',
  'Mod+=',
  'Mod+-',
  'Mod+0',
  'Mod+Shift+c',
  'Mod+Shift+i',
  'Mod+Shift+j',
  'F5',
  'F11',
  'F12',
  'Alt+Tab',
  'Alt+F4',
  ...(IS_MAC ? [
    'Mod+Space',
    'Mod+q',
    'Mod+m',
    'Mod+,',
  ] : []),
]);

export function isReservedBinding(binding: string): boolean {
  return RESERVED_BINDINGS.has(binding.toLowerCase());
}
