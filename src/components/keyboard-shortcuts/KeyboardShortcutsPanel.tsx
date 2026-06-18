import { RiKeyboardLine } from '@remixicon/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  KeyboardShortcutsConfig,
  ShortcutConfig,
} from '../../lib/keyboard-shortcuts/types';
import {
  actionCategories,
  allActions,
  detectConflicts,
  getDefaultConfig,
} from '../../lib/keyboard-shortcuts/config';
import { defaultPresets } from '../../lib/keyboard-shortcuts/presets';
import {
  getKeyboardShortcutConfig,
  saveKeyboardShortcutConfig,
  updateKeyboardShortcut
} from '../../lib/runtime-client';
import {
  systemShortcuts,
  systemShortcutCategories,
} from '../../lib/keyboard-shortcuts/system-shortcuts';
import { ConflictBadge } from './ConflictBadge';
import { PresetSelector } from './PresetSelector';
import { ShortcutRecorder } from './ShortcutRecorder';

const IS_MAC = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

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

export function KeyboardShortcutsPanel() {
  const [config, setConfig] = useState<KeyboardShortcutsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await getKeyboardShortcutConfig();
        setConfig(loaded);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const conflicts = useMemo(
    () => (config ? detectConflicts(config.shortcuts) : new Map()),
    [config]
  );

  const shortcutLabels = useMemo(() => {
    const map = new Map<string, string>();
    if (!config) return map;
    for (const s of config.shortcuts) {
      const meta = allActions.find((a) => a.action === s.action);
      map.set(s.id, meta?.label ?? s.action);
    }
    return map;
  }, [config]);

  const shortcutsByCategory = useMemo(() => {
    if (!config) return [];
    return actionCategories
      .map((cat) => ({
        ...cat,
        shortcuts: config.shortcuts.filter((s) => {
          const meta = allActions.find((a) => a.action === s.action);
          return meta?.category === cat.id;
        }),
      }))
      .filter((cat) => cat.shortcuts.length > 0);
  }, [config]);

  const handleUpdate = useCallback(
    async (shortcutId: string, patch: Partial<ShortcutConfig>) => {
      if (busy) return;
      setBusy(true);
      try {
        const nextConfig = await updateKeyboardShortcut(shortcutId, patch);
        setConfig(nextConfig);
      } finally {
        setBusy(false);
      }
    },
    [busy]
  );

  const handlePresetSelect = useCallback(async (presetId: string) => {
    const preset = defaultPresets.find((p) => p.id === presetId);
    if (!preset) return;

    const newShortcuts: ShortcutConfig[] = preset.shortcuts.map((s, i) => ({
      id: `preset-${presetId}-${i}`,
      action: s.action,
      enabled: true,
      keyBinding: s.keyBinding,
    }));

    const newConfig: KeyboardShortcutsConfig = {
      ...config!,
      shortcuts: newShortcuts,
      enabledPresetId: presetId,
    };

    setConfig(newConfig);
    await saveKeyboardShortcutConfig(newConfig);
  }, [config]);

  const handleReset = useCallback(async () => {
    const nextConfig = getDefaultConfig();
    setConfig(nextConfig);
    await saveKeyboardShortcutConfig(nextConfig);
  }, []);

  if (loading) {
    return <div className="tm-loading">Loading shortcuts…</div>;
  }

  if (!config) {
    return <div className="tm-error">Failed to load shortcut configuration</div>;
  }

  const isDisabled = loading || busy;

  return (
    <div className="tm-keyboard-shortcuts-panel">
      <div className="tm-shortcuts-header">
        <div className="tm-shortcuts-header-left">
          <RiKeyboardLine size={16} />
          <h3 className="tm-shortcuts-title">Keyboard Shortcuts</h3>
        </div>
        <div className="tm-shortcuts-header-right">
          <PresetSelector
            activePresetId={config.enabledPresetId}
            disabled={isDisabled}
            onReset={() => void handleReset()}
            onSelect={handlePresetSelect}
            presets={defaultPresets}
          />
        </div>
      </div>

      {conflicts.size > 0 && (
        <div className="tm-conflicts-warning">
          <span className="tm-conflicts-count">{conflicts.size}</span>
          shortcut(s) have conflicting key bindings
        </div>
      )}

      <div className="tm-shortcuts-section">
        <div className="tm-shortcuts-section-header">
          <span className="tm-shortcuts-section-badge tm-shortcuts-section-badge-custom">Custom</span>
          <span className="tm-shortcuts-section-desc">These shortcuts can be toggled and rebound</span>
        </div>
        <div className="tm-shortcuts-list">
          {shortcutsByCategory.map((cat) => (
            <div key={cat.id} className="tm-shortcuts-category">
              <h4 className="tm-shortcuts-category-title">{cat.label}</h4>
              {cat.shortcuts.map((shortcut) => {
                const meta = allActions.find((a) => a.action === shortcut.action);
                const conflictIds = conflicts.get(shortcut.id) ?? [];

                return (
                  <div
                    key={shortcut.id}
                    className={`tm-shortcut-row ${!shortcut.enabled ? 'tm-shortcut-disabled' : ''}`}
                  >
                    <button
                      aria-pressed={shortcut.enabled}
                      className={`tm-toggle ${shortcut.enabled ? 'tm-toggle-on' : ''}`}
                      disabled={busy}
                      onClick={() => handleUpdate(shortcut.id, { enabled: !shortcut.enabled })}
                      type="button"
                    >
                      <span className="tm-toggle-thumb" />
                    </button>

                    <div className="tm-shortcut-row-info">
                      <div className="tm-shortcut-row-title">
                        <span className="tm-shortcut-row-label">{meta?.label ?? shortcut.action}</span>
                      </div>
                    </div>

                    {conflictIds.length > 0 && (
                      <ConflictBadge conflictingIds={conflictIds} shortcutLabels={shortcutLabels} />
                    )}

                    <div className="tm-shortcut-row-actions">
                      <ShortcutRecorder
                        disabled={!shortcut.enabled}
                        onChange={(binding) => handleUpdate(shortcut.id, { keyBinding: binding })}
                        value={shortcut.keyBinding}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="tm-shortcuts-section">
        <div className="tm-shortcuts-section-header">
          <span className="tm-shortcuts-section-badge tm-shortcuts-section-badge-system">System</span>
          <span className="tm-shortcuts-section-desc">Built-in browser shortcuts (not editable)</span>
        </div>
        <div className="tm-shortcuts-list">
          {systemShortcutCategories.map((cat) => {
            const items = systemShortcuts.filter((s) => s.category === cat.id);
            if (items.length === 0) return null;
            return (
              <div key={cat.id} className="tm-shortcuts-category">
                <h4 className="tm-shortcuts-category-title">{cat.label}</h4>
                {items.map((shortcut) => (
                  <div key={shortcut.label} className="tm-shortcut-row tm-shortcut-system">
                    <div className="tm-shortcut-row-info">
                      <div className="tm-shortcut-row-title">
                        <span className="tm-shortcut-row-label">{shortcut.label}</span>
                      </div>
                    </div>
                    <div className="tm-shortcut-row-actions">
                      <span className="tm-shortcut-binding-display">
                        {formatBinding(shortcut.binding)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
