import { matchesDefaultAutoGroupPresetById } from './auto-group-defaults';
import type { AutoGroupConfig, AutoGroupRule, AutoGroupRuleField } from './contracts';
import { normalizeWebsitePattern } from './shared-utils';

export interface AutoGroupMatchInput {
  hostname?: string;
  pendingUrl?: string;
  pinned?: boolean;
  title?: string | null;
  url?: string;
}

export type AutoGroupMatchStatus = 'match' | 'excluded' | 'protected' | 'none';

export function normalizeAutoGroupRuleValue(field: AutoGroupRuleField, value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';

  return field === 'hostname' ? trimmed.replace(/^www\./, '') : trimmed;
}

export function resolveAutoGroupTargetValue(
  tab: AutoGroupMatchInput,
  field: AutoGroupRuleField
): string {
  const rawUrl = `${tab.url ?? tab.pendingUrl ?? ''}`.trim();
  if (field === 'title') return `${tab.title ?? ''}`.trim().toLowerCase();
  if (field === 'hostname' && tab.hostname) return tab.hostname.replace(/^www\./, '').toLowerCase();
  if (!rawUrl) return '';
  if (field === 'url') return rawUrl.toLowerCase();

  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function matchesAutoGroupRule(tab: AutoGroupMatchInput, rule: AutoGroupRule): boolean {
  const expected = normalizeAutoGroupRuleValue(rule.field, rule.value);
  if (!expected) return false;

  const actual = resolveAutoGroupTargetValue(tab, rule.field);
  if (!actual) return false;
  return rule.operator === 'equals' ? actual === expected : actual.includes(expected);
}

function matchesAnyAutoGroupRule(tab: AutoGroupMatchInput, rules: AutoGroupRule[]): boolean {
  return rules.some((rule) => matchesAutoGroupRule(tab, rule));
}

export function matchesWebsitePattern(tab: AutoGroupMatchInput, value: string): boolean {
  const expected = normalizeWebsitePattern(value);
  if (!expected) return false;

  const hostname = resolveAutoGroupTargetValue(tab, 'hostname');
  return Boolean(hostname && (hostname === expected || hostname.endsWith(`.${expected}`)));
}

export function getAutoGroupConfigMatchStatus(
  tab: AutoGroupMatchInput,
  config: AutoGroupConfig
): AutoGroupMatchStatus {
  if (!config.enabled) return 'none';
  if ((config.excludedWebsites ?? []).some((website) => matchesWebsitePattern(tab, website))) {
    return 'excluded';
  }

  const matches =
    Boolean(config.presetId && matchesDefaultAutoGroupPresetById(tab, config.presetId)) ||
    config.websites.some((website) => matchesWebsitePattern(tab, website)) ||
    matchesAnyAutoGroupRule(tab, config.rules);

  if (!matches) return 'none';
  return tab.pinned ? 'protected' : 'match';
}

export function matchesAutoGroupConfig(tab: AutoGroupMatchInput, config: AutoGroupConfig): boolean {
  const status = getAutoGroupConfigMatchStatus(tab, config);
  // Pinned tabs still belong to a matching configuration for restore and
  // cleanup checks. They are protected by the caller before any move occurs.
  return status === 'match' || status === 'protected';
}
