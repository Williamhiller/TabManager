export const AUTO_GROUP_MIN_TAB_COUNT = 2;

export interface AutoGroupPolicyTab {
  groupId?: number | null;
  id?: number | null;
  pinned?: boolean;
  windowId: number;
}

function isUngroupedTab(tab: AutoGroupPolicyTab): tab is AutoGroupPolicyTab & { id: number } {
  return tab.id != null && !tab.pinned && (tab.groupId ?? -1) < 0;
}

export function collectCreateableAutoGroupTabIds<T extends AutoGroupPolicyTab>(
  sourceTab: T,
  tabs: readonly T[],
  options: {
    isTabExempt?: (tab: T) => boolean;
    matchesTab: (tab: T) => boolean;
    minTabCount?: number;
  }
): number[] {
  if (!isUngroupedTab(sourceTab)) return [];

  const isTabExempt = options.isTabExempt ?? (() => false);
  if (!options.matchesTab(sourceTab) || isTabExempt(sourceTab)) return [];

  const minTabCount = options.minTabCount ?? AUTO_GROUP_MIN_TAB_COUNT;
  const allTabs = tabs.some((tab) => tab.id != null && tab.id === sourceTab.id)
    ? tabs
    : [sourceTab, ...tabs];
  const tabIds: number[] = [];

  for (const tab of allTabs) {
    if (!isUngroupedTab(tab)) continue;
    if (tab.windowId !== sourceTab.windowId) continue;
    if (!options.matchesTab(tab)) continue;
    if (isTabExempt(tab)) continue;
    tabIds.push(tab.id);
  }

  const uniqueTabIds = Array.from(new Set(tabIds));
  return uniqueTabIds.length >= minTabCount ? uniqueTabIds : [];
}

export function shouldCleanupSingleTabAutoGroup(tabCount: number): boolean {
  return tabCount === 1;
}
