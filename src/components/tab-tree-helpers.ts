import type { AutoGroupRule, TabGroupColor } from '../lib/contracts';
import type { DefaultAutoGroupPreset } from '../lib/auto-group-defaults';
import { groupColorTokens } from '../lib/theme';

export function blockDrag(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

export function createAutoGroupRule(): AutoGroupRule {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    field: 'url',
    operator: 'contains',
    value: ''
  };
}

export function normalizeDraftRule(rule: Partial<AutoGroupRule>): AutoGroupRule {
  return {
    id: rule.id || createAutoGroupRule().id,
    field: rule.field ?? 'url',
    operator: rule.operator ?? 'contains',
    value: rule.value ?? ''
  };
}

export function getPresetPatternLabels(preset: DefaultAutoGroupPreset): string[] {
  const { matchers } = preset;
  return [
    ...(matchers.domains ?? []),
    ...(matchers.hostLabels ?? []),
    ...(matchers.paths ?? []),
    ...(matchers.keywords ?? [])
  ];
}

export function groupChipStyle(color: TabGroupColor): {
  backgroundColor: string;
  borderColor: string;
  color: string;
} {
  return {
    backgroundColor: groupColorTokens[color].soft,
    borderColor: groupColorTokens[color].ring,
    color: groupColorTokens[color].solid
  };
}
