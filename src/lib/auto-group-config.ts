import type { AutoGroupConfig, TabGroupColor, TabSnapshot } from './contracts';
import { normalizeHostname } from './shared-utils';

function createConfigId(): string {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return `custom:${id}`;
}

export function getAutoGroupWebsitesFromTabs(tabs: TabSnapshot[]): string[] {
  return Array.from(new Set(tabs.map((tab) => normalizeHostname(tab.hostname)).filter(Boolean)));
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;

  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

export function findAutoGroupConfigForGroup(
  configs: AutoGroupConfig[],
  title: string,
  tabs: TabSnapshot[]
): AutoGroupConfig | null {
  const normalizedTitle = normalizeTitle(title);
  const websites = getAutoGroupWebsitesFromTabs(tabs);

  if (!normalizedTitle || websites.length === 0) return null;

  return (
    configs.find((config) => {
      if (config.presetId) return false;
      if (normalizeTitle(config.title) !== normalizedTitle) return false;
      return sameStringSet(config.websites.map(normalizeHostname).filter(Boolean), websites);
    }) ?? null
  );
}

export function createAutoGroupConfig(
  title: string,
  options: {
    color?: TabGroupColor;
    tabs?: TabSnapshot[];
  } = {}
): AutoGroupConfig {
  const websites = getAutoGroupWebsitesFromTabs(options.tabs ?? []);

  return {
    id: createConfigId(),
    title,
    color: options.color ?? 'blue',
    enabled: true,
    websites,
    excludedWebsites: [],
    rules: []
  };
}
