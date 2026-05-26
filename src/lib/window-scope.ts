export interface WindowScopedGroup {
  id: number;
  windowId: number;
  title?: string;
}

export interface WindowScopedTab {
  id?: number;
  windowId: number;
}

export function findSameWindowGroup<TGroup extends WindowScopedGroup>(
  groups: TGroup[],
  windowId: number,
  predicate: (group: TGroup) => boolean
): TGroup | undefined {
  return groups.find((group) => group.windowId === windowId && predicate(group));
}

export function filterSameWindowTabs<TTab extends WindowScopedTab>(
  tabs: TTab[],
  windowId: number
): TTab[] {
  return tabs.filter((tab) => tab.windowId === windowId);
}
