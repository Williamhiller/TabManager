const DASHBOARD_ENTRY_PATHS = ['/dashboard.html', '/options.html'] as const;

function isDashboardTabUrl(url?: string): boolean {
  if (!url) return false;

  return DASHBOARD_ENTRY_PATHS.some((path) => url.startsWith(chrome.runtime.getURL(path)));
}

function isDashboardTab(tab: chrome.tabs.Tab): boolean {
  return isDashboardTabUrl(tab.url) || isDashboardTabUrl(tab.pendingUrl);
}

export async function openOrRefreshDashboardTab(path = '/dashboard.html'): Promise<void> {
  const targetUrl = chrome.runtime.getURL(path.startsWith('/') ? path : `/${path}`);
  const existingTabs = await chrome.tabs.query({});
  const existingTab = existingTabs.find(isDashboardTab);

  if (existingTab?.id != null) {
    const isAtTargetUrl = existingTab.url === targetUrl;
    const isLoadingTargetUrl = existingTab.pendingUrl === targetUrl;
    await chrome.tabs.update(
      existingTab.id,
      isAtTargetUrl || isLoadingTargetUrl ? { active: true } : { active: true, url: targetUrl }
    );

    if (existingTab.windowId != null) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }

    if (isAtTargetUrl) {
      await chrome.tabs.reload(existingTab.id);
    }
    return;
  }

  await chrome.tabs.create({ url: targetUrl });
}
