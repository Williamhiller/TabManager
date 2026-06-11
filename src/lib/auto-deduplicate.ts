export interface AutoDeduplicateCurrentTab {
  id: number;
  active?: boolean;
  pinned?: boolean;
}

export interface AutoDeduplicateCandidateTab {
  id: number;
  active?: boolean;
  pinned?: boolean;
  lastActivityAt?: number | null;
}

export type AutoDeduplicateKeepStrategy = 'newest' | 'existing';

export type AutoDeduplicatePlan =
  | { kind: 'none' }
  | { kind: 'keepCurrent'; closeTabIds: number[] }
  | { kind: 'keepExisting'; targetTabId: number; closeTabIds: number[] };

function sortByRecentActivity(
  first: AutoDeduplicateCandidateTab,
  second: AutoDeduplicateCandidateTab
): number {
  const firstActive = first.active ? 1 : 0;
  const secondActive = second.active ? 1 : 0;
  if (firstActive !== secondActive) return secondActive - firstActive;
  return (second.lastActivityAt ?? 0) - (first.lastActivityAt ?? 0);
}

export function planAutoDeduplication(
  currentTab: AutoDeduplicateCurrentTab,
  duplicateTabs: AutoDeduplicateCandidateTab[],
  keepStrategy: AutoDeduplicateKeepStrategy = 'newest'
): AutoDeduplicatePlan {
  const closeableDuplicates = duplicateTabs.filter((tab) => tab.id !== currentTab.id);
  if (closeableDuplicates.length === 0) return { kind: 'none' };

  const pinnedDuplicates = closeableDuplicates.filter((tab) => tab.pinned);
  if (pinnedDuplicates.length > 0 && !currentTab.pinned) {
    const [target] = [...pinnedDuplicates].sort(sortByRecentActivity);
    if (!target) return { kind: 'none' };

    return {
      kind: 'keepExisting',
      targetTabId: target.id,
      closeTabIds: [currentTab.id, ...closeableDuplicates.filter((tab) => !tab.pinned).map((tab) => tab.id)]
    };
  }

  if (keepStrategy === 'existing' && !currentTab.pinned) {
    const [target] = [...closeableDuplicates].sort(sortByRecentActivity);
    if (!target) return { kind: 'none' };

    return {
      kind: 'keepExisting',
      targetTabId: target.id,
      closeTabIds: [
        currentTab.id,
        ...closeableDuplicates.filter((tab) => !tab.pinned && tab.id !== target.id).map((tab) => tab.id)
      ]
    };
  }

  return {
    kind: 'keepCurrent',
    closeTabIds: closeableDuplicates.filter((tab) => !tab.pinned).map((tab) => tab.id)
  };
}
