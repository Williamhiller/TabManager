import { useEffect, useMemo, useRef, useState } from 'react';

import { allActions } from '../../lib/keyboard-shortcuts/config';
import type { ShortcutAction } from '../../lib/keyboard-shortcuts/types';
import {
  systemShortcuts,
  systemShortcutCategories,
} from '../../lib/keyboard-shortcuts/system-shortcuts';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  shortcutBindings: Map<ShortcutAction, string>;
}

const IS_MAC = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

interface PaletteItem {
  label: string;
  section: string;
  binding: string;
  system: boolean;
}

function fuzzyMatch(query: string, text: string): boolean {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();

  if (lowerText.includes(lowerQuery)) return true;

  let queryIndex = 0;
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === lowerQuery.length;
}

function formatBinding(binding: string | null): string {
  if (!binding) return '';
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

function buildAllItems(shortcutBindings: Map<ShortcutAction, string>): PaletteItem[] {
  const items: PaletteItem[] = [];

  for (const action of allActions) {
    items.push({
      label: action.label,
      section: '',
      binding: formatBinding(shortcutBindings.get(action.action) ?? null),
      system: false,
    });
  }

  for (const cat of systemShortcutCategories) {
    const catItems = systemShortcuts.filter((s) => s.category === cat.id);
    for (const s of catItems) {
      items.push({
        label: s.label,
        section: cat.label,
        binding: formatBinding(s.binding),
        system: true,
      });
    }
  }

  return items;
}

export function CommandPalette({ open, onClose, shortcutBindings }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allItems = useMemo(() => buildAllItems(shortcutBindings), [shortcutBindings]);

  const filteredItems = useMemo(() => {
    if (!query) return allItems;
    return allItems.filter(
      (item) => fuzzyMatch(query, item.label) || fuzzyMatch(query, item.section)
    );
  }, [query, allItems]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
      return;
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = filteredItems[selectedIndex];
        if (item && !item.system) {
          const action = allActions.find((a) => a.label === item.label);
          if (action) {
            chrome.runtime.sendMessage({ type: 'tab-manager/execute-action', action: action.action });
            onClose();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [open, filteredItems, selectedIndex, onClose]);

  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement;
    if (item) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!open) return null;

  let lastSection = '';

  return (
    <div className="tm-command-palette-overlay" onClick={onClose}>
      <div className="tm-command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="tm-command-palette-input"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command…"
          type="text"
          value={query}
        />
        <div ref={listRef} className="tm-command-palette-list">
          {filteredItems.map((item, index) => {
            const showSection = item.section && item.section !== lastSection;
            if (showSection) lastSection = item.section;

            return (
              <button
                key={`${item.label}-${item.system ? 'sys' : 'ext'}`}
                className={[
                  'tm-command-palette-item',
                  index === selectedIndex ? 'tm-command-palette-item-selected' : '',
                  item.system ? 'tm-command-palette-item-system' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => {
                  if (!item.system) {
                    const action = allActions.find((a) => a.label === item.label);
                    if (action) {
                      chrome.runtime.sendMessage({ type: 'tab-manager/execute-action', action: action.action });
                      onClose();
                    }
                  }
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                type="button"
              >
                {showSection && (
                  <span className="tm-command-palette-section">{item.section}</span>
                )}
                <span className="tm-command-palette-item-label">{item.label}</span>
                <span className="tm-command-palette-item-binding">
                  {item.binding}
                </span>
              </button>
            );
          })}
          {filteredItems.length === 0 && (
            <div className="tm-command-palette-empty">No matching commands</div>
          )}
        </div>
      </div>
    </div>
  );
}
