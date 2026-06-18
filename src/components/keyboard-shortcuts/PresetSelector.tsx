import { Dropdown } from '../Dropdown';
import type { ShortcutPreset } from '../../lib/keyboard-shortcuts/types';

interface PresetSelectorProps {
  activePresetId: string | null;
  disabled?: boolean;
  onReset: () => void;
  onSelect: (presetId: string) => void;
  presets: ShortcutPreset[];
}

export function PresetSelector({
  activePresetId,
  disabled,
  onReset,
  onSelect,
  presets
}: PresetSelectorProps) {
  return (
    <div className="tm-preset-selector">
      <Dropdown
        disabled={disabled}
        onChange={(v) => onSelect(v)}
        options={presets.map((p) => ({
          label: `${p.name} (${p.shortcuts.length})`,
          value: p.id
        }))}
        placeholder="Select preset..."
        value={activePresetId ?? ''}
      />
      <button
        className="tm-shortcuts-action-btn"
        disabled={disabled}
        onClick={onReset}
        type="button"
      >
        Reset
      </button>
    </div>
  );
}
