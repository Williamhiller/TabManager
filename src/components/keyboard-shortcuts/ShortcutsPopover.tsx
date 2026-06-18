import { RiKeyboardLine } from '@remixicon/react';
import { useRef, useState } from 'react';
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';

const IS_MAC = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

const MOD = IS_MAC ? 'Cmd' : 'Ctrl';

const shortcuts = [
  { category: 'Tab', items: [
    { label: 'Switch left/right', keys: [`Alt + Left/Right`] },
    { label: 'Close tab', keys: [`${MOD} + W`] },
    { label: 'New tab', keys: [`${MOD} + T`] },
    { label: 'Reopen closed', keys: [`${MOD} + Shift + T`] },
    { label: 'Switch tab 1–9', keys: [`${MOD} + 1~9`] },
  ]},
  { category: 'Extension', items: [
    { label: 'Pin/unpin tab', keys: [`${MOD} + Shift + P`] },
    { label: 'Move tab left/right', keys: [`${MOD} + Shift + Left/Right`] },
    { label: 'Command palette', keys: [`${MOD} + Shift + K`] },
    { label: 'Side panel', keys: [`${MOD} + Shift + B`] },
  ]},
  { category: 'Page', items: [
    { label: 'Find on page', keys: [`${MOD} + F`] },
    { label: 'Reload', keys: [`${MOD} + R`] },
    { label: 'Zoom in/out', keys: [`${MOD} + +/-`] },
  ]},
];

export function ShortcutsPopover() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top-end',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  return (
    <>
      <button
        ref={(node) => {
          refs.setReference(node);
          (triggerRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
        }}
        className="tm-sidepanel-dashboard-shortcut tm-sidepanel-dashboard-shortcut-icon"
        title="Keyboard shortcuts"
        type="button"
        {...getReferenceProps()}
      >
        <RiKeyboardLine size={12} />
      </button>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="tm-shortcuts-popover"
            {...getFloatingProps()}
          >
            {shortcuts.map((group) => (
              <div key={group.category} className="tm-shortcuts-popover-group">
                <div className="tm-shortcuts-popover-category">{group.category}</div>
                {group.items.map((item) => (
                  <div key={item.label} className="tm-shortcuts-popover-row">
                    <span className="tm-shortcuts-popover-label">{item.label}</span>
                    <span className="tm-shortcuts-popover-keys">
                      {item.keys.map((k, i) => (
                        <kbd key={i} className="tm-shortcuts-popover-kbd">{k}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
