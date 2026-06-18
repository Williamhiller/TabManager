import { useCallback, useEffect, useRef, useState } from 'react';

import { eventToBinding as rawEventToBinding, isReservedBinding } from '../../lib/keyboard-shortcuts/shared-utils';

interface ShortcutRecorderProps {
  value: string | null;
  onChange: (binding: string | null) => void;
  disabled?: boolean;
}

const IS_MAC = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

function eventToBinding(e: KeyboardEvent): string | null {
  const binding = rawEventToBinding(e);
  const modifierOnly = ['Control', 'Shift', 'Alt', 'Meta'];
  if (modifierOnly.includes(e.key)) return null;
  if (e.key === 'Escape') return null;
  return binding;
}

function formatBinding(binding: string | null): string {
  if (!binding) return 'Not set';
  return binding
    .replace(/Mod/g, IS_MAC ? 'Cmd' : 'Ctrl')
    .replace(/\+/g, ' + ')
    .replace(/Alt/g, 'Alt')
    .replace(/Shift/g, 'Shift')
    .replace(/ArrowLeft/g, 'Left')
    .replace(/ArrowRight/g, 'Right')
    .replace(/ArrowUp/g, 'Up')
    .replace(/ArrowDown/g, 'Down');
}

export function ShortcutRecorder({ value, onChange, disabled }: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();

      const binding = eventToBinding(e);
      if (!binding) return;

      if (isReservedBinding(binding)) {
        setError('This shortcut is reserved by the browser or system');
        setRecording(false);
        setTimeout(() => setError(null), 2000);
        return;
      }

      setError(null);
      onChange(binding);
      setRecording(false);
    },
    [recording, onChange]
  );

  useEffect(() => {
    if (!recording) return;
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [recording, handleKeyDown]);

  useEffect(() => {
    if (!recording) return;
    const handleClick = () => setRecording(false);
    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, [recording]);

  return (
    <div className="tm-shortcut-recorder-wrapper">
      <button
        ref={buttonRef}
        className={`tm-shortcut-recorder${recording ? ' tm-shortcut-recording' : ''}${error ? ' tm-shortcut-recorder-error' : ''}`}
        data-shortcut-recorder={recording ? 'true' : undefined}
        disabled={disabled}
        onClick={() => { setRecording(!recording); setError(null); }}
        type="button"
      >
        {recording ? 'Press keys…' : formatBinding(value)}
      </button>
      {error && <span className="tm-shortcut-recorder-error-text">{error}</span>}
    </div>
  );
}
