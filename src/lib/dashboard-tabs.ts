const DASHBOARD_ENTRY_PATHS = ['/dashboard.html', '/options.html'] as const;

function isDashboardTabUrl(url?: string): boolean {
  if (!url) return false;

  return DASHBOARD_ENTRY_PATHS.some((path) => url.startsWith(chrome.runtime.getURL(path)));
}

function isDashboardTab(tab: chrome.tabs.Tab): boolean {
  return isDashboardTabUrl(tab.url) || isDashboardTabUrl(tab.pendingUrl);
}

// Guard against concurrent calls that could both create a new tab when none
// exists yet (e.g. install handler + icon click firing simultaneously).
let openDashboardInFlight: Promise<void> | null = null;

export async function openOrRefreshDashboardTab(path = '/dashboard.html'): Promise<void> {
  if (openDashboardInFlight) {
    await openDashboardInFlight;
    // After the first call finishes, a dashboard tab now exists — just re-invoke
    // to focus/reload it.
    return openOrRefreshDashboardTab(path);
  }

  openDashboardInFlight = (async () => {
    try {
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
    } finally {
      openDashboardInFlight = null;
    }
  })();

  await openDashboardInFlight;
}
