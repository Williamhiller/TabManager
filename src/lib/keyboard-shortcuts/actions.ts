import type { ShortcutAction } from './types';

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function getAllTabsInWindow(): Promise<chrome.tabs.Tab[]> {
  return chrome.tabs.query({ currentWindow: true });
}

export async function executeAction(action: ShortcutAction): Promise<boolean> {
  const activeTab = await getActiveTab();

  switch (action) {
    case 'switch-tab-left':
      return switchTab('left');
    case 'switch-tab-right':
      return switchTab('right');
    case 'close-tabs-left':
      return closeTabsDirection(activeTab, 'left');
    case 'close-tabs-right':
      return closeTabsDirection(activeTab, 'right');
    case 'close-other-tabs':
      return closeOtherTabs(activeTab);
    case 'toggle-pin-tab':
      return togglePin(activeTab);
    case 'toggle-mute-tab':
      return toggleMute(activeTab);
    case 'duplicate-tab':
      return duplicateTab(activeTab);
    case 'move-tab-left':
      return moveTab(activeTab, -1);
    case 'move-tab-right':
      return moveTab(activeTab, 1);
    case 'collapse-all-groups':
      return collapseAllGroups();
    case 'toggle-command-palette':
      return true;
    default:
      return false;
  }
}

async function switchTab(direction: 'left' | 'right'): Promise<boolean> {
  const tabs = await getAllTabsInWindow();
  const active = tabs.findIndex((t) => t.active);
  if (active === -1) return false;

  const next =
    direction === 'left'
      ? (active - 1 + tabs.length) % tabs.length
      : (active + 1) % tabs.length;

  await chrome.tabs.update(tabs[next].id!, { active: true });
  return true;
}

async function closeTabsDirection(
  tab: chrome.tabs.Tab | null,
  direction: 'left' | 'right'
): Promise<boolean> {
  if (!tab) return false;

  const tabs = await getAllTabsInWindow();
  const currentIndex = tabs.findIndex((t) => t.id === tab.id);
  if (currentIndex === -1) return false;

  const toClose = tabs
    .filter((t) => {
      if (t.active) return false;
      if (direction === 'left') return t.index < currentIndex;
      return t.index > currentIndex;
    })
    .map((t) => t.id!)
    .filter((id) => id != null);

  if (toClose.length === 0) return false;

  await chrome.tabs.remove(toClose);
  return true;
}

async function closeOtherTabs(tab: chrome.tabs.Tab | null): Promise<boolean> {
  if (!tab) return false;

  const tabs = await getAllTabsInWindow();
  const toClose = tabs
    .filter((t) => !t.active)
    .map((t) => t.id!)
    .filter((id) => id != null);

  if (toClose.length === 0) return false;

  await chrome.tabs.remove(toClose);
  return true;
}

async function togglePin(tab: chrome.tabs.Tab | null): Promise<boolean> {
  if (!tab?.id) return false;

  await chrome.tabs.update(tab.id, { pinned: !tab.pinned });
  return true;
}

async function toggleMute(tab: chrome.tabs.Tab | null): Promise<boolean> {
  if (!tab?.id) return false;

  const tabAny = tab as chrome.tabs.Tab & { muted?: boolean };
  await chrome.tabs.update(tab.id, { muted: !tabAny.muted });
  return true;
}

async function duplicateTab(tab: chrome.tabs.Tab | null): Promise<boolean> {
  if (!tab?.id) return false;

  await chrome.tabs.duplicate(tab.id);
  return true;
}

async function moveTab(
  tab: chrome.tabs.Tab | null,
  offset: number
): Promise<boolean> {
  if (!tab?.id) return false;

  const tabs = await getAllTabsInWindow();
  const currentIndex = tabs.findIndex((t) => t.id === tab.id);
  if (currentIndex === -1) return false;

  const newIndex = currentIndex + offset;
  if (newIndex < 0 || newIndex >= tabs.length) return false;

  await chrome.tabs.move(tab.id, { index: newIndex });
  return true;
}

async function collapseAllGroups(): Promise<boolean> {
  const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  for (const group of groups) {
    if (!group.collapsed) {
      await chrome.tabGroups.update(group.id, { collapsed: true });
    }
  }
  return true;
}


