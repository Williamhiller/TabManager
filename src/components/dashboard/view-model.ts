import type { Messages, ResolvedLocale } from '../../lib/i18n';
import { resolveTheme } from '../../lib/theme';

import type {
  DashboardData,
  DashboardListItem,
  DashboardMetric,
  DashboardViewId,
  DashboardViewModel
} from './types';

type BuildDashboardViewModelInput = {
  activeView: DashboardViewId;
  activeViewLabel: string;
  data: DashboardData;
  languageLabel: string;
  locale: ResolvedLocale;
  t: Messages;
};

function formatDateTime(timestamp: number, locale: ResolvedLocale) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short'
  }).format(timestamp);
}

function makeMetric(label: string, value: string, note?: string): DashboardMetric {
  return { label, note, value };
}

function makeItem(title: string, subtitle?: string, meta?: string): DashboardListItem {
  return { meta, subtitle, title };
}

export function buildDashboardViewModel({
  activeView,
  activeViewLabel,
  data,
  languageLabel,
  locale,
  t
}: BuildDashboardViewModelInput): DashboardViewModel {
  const { bookmarks, overview, sessions, settings } = data;
  const resolvedTheme = resolveTheme(settings.theme);
  const autoSessions = sessions?.sessions.filter((session) => session.source === 'auto') ?? [];
  const manualSessions = sessions?.sessions.filter((session) => session.source === 'manual') ?? [];
  const enabledRules = settings.autoGroupConfigs.filter((config) => config.enabled);

  if (activeView === 'tabs') {
    const sortedTabs =
      overview?.tabs
        .slice()
        .sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))
        .slice(0, 6) ?? [];

    const historyItems =
      overview?.historyTabs.slice(0, 6).map((tab) =>
        makeItem(tab.title || tab.hostname, tab.hostname, formatDateTime(tab.closedAt, locale))
      ) ?? [];

    return {
      title: activeViewLabel,
      metrics: [
        makeMetric(t.tabsOpen, String(overview?.stats.totalTabs ?? 0)),
        makeMetric(t.grouped, String(overview?.stats.groupedTabs ?? 0)),
        makeMetric(t.sleeping, String(overview?.stats.sleepingTabs ?? 0)),
        makeMetric(t.audible, String(overview?.stats.audibleTabs ?? 0))
      ],
      items: sortedTabs.map((tab) =>
        makeItem(
          tab.title || tab.hostname,
          tab.hostname,
          tab.group?.title ?? (tab.pinned ? t.pinned : tab.active ? t.currentView : t.tabs)
        )
      ),
      asideTitle: t.historyTabs,
      asideItems: historyItems
    };
  }

  if (activeView === 'snapshots') {
    return {
      title: activeViewLabel,
      metrics: [
        makeMetric(t.navSnapshots, String(autoSessions.length)),
        makeMetric(t.selectedItems, String(sessions?.totalSessions ?? 0), t.settingsSummary),
        makeMetric(
          t.tabs,
          String(autoSessions.reduce((total, session) => total + session.stats.tabCount, 0))
        ),
        makeMetric(t.updated, autoSessions[0] ? formatDateTime(autoSessions[0].updatedAt, locale) : '-')
      ],
      items: autoSessions.slice(0, 6).map((session) =>
        makeItem(session.title, `${session.stats.tabCount} ${t.tabs}`, formatDateTime(session.updatedAt, locale))
      ),
      asideTitle: t.details,
      asideItems: manualSessions.slice(0, 6).map((session) =>
        makeItem(session.title, `${session.stats.windowCount} ${t.group}`, formatDateTime(session.updatedAt, locale))
      )
    };
  }

  if (activeView === 'bookmarks') {
    const rootItems = bookmarks?.roots.slice(0, 6) ?? [];

    return {
      title: activeViewLabel,
      metrics: [
        makeMetric(t.navBookmarks, String(bookmarks?.totalBookmarks ?? 0)),
        makeMetric(t.group, String(bookmarks?.totalFolders ?? 0)),
        makeMetric(t.selectedItems, String(bookmarks?.roots.length ?? 0), t.rootUngrouped),
        makeMetric(t.updated, rootItems[0]?.dateGroupModified ? formatDateTime(rootItems[0].dateGroupModified, locale) : '-')
      ],
      items: rootItems.map((node) =>
        makeItem(
          node.title || t.navBookmarks,
          node.url ?? `${node.children.length} ${t.tabs}`,
          node.dateGroupModified ? formatDateTime(node.dateGroupModified, locale) : undefined
        )
      ),
      asideTitle: t.details,
      asideItems: rootItems
        .flatMap((root) => root.children.slice(0, 2))
        .slice(0, 6)
        .map((node) =>
          makeItem(
            node.title || node.url || t.navBookmarks,
            node.url ?? undefined,
            node.dateAdded ? formatDateTime(node.dateAdded, locale) : undefined
          )
        )
    };
  }

  if (activeView === 'automation') {
    return {
      title: activeViewLabel,
      metrics: [
        makeMetric(t.autoGroup, settings.autoGroupEnabled ? t.enabled : t.disabled),
        makeMetric(t.manageGroupsRules, String(settings.autoGroupConfigs.length)),
        makeMetric(t.selectedItems, String(enabledRules.length), t.enabled),
        makeMetric(t.redirectTracking, settings.redirectTrackingEnabled ? t.enabled : t.disabled)
      ],
      items: settings.autoGroupConfigs.slice(0, 6).map((config) =>
        makeItem(
          config.title,
          `${config.websites.length} ${t.websiteType} · ${config.rules.length} ${t.autoGroupRules}`,
          config.enabled ? t.enabled : t.disabled
        )
      ),
      asideTitle: t.behavior,
      asideItems: [
        makeItem(t.autoRefresh, settings.autoRefreshSeconds === 0 ? t.manualOnly : `${settings.autoRefreshSeconds}s`),
        makeItem(
          t.autoCollapseInactiveGroups,
          settings.autoCollapseInactiveGroupsMinutes === 0
            ? t.never
            : `${settings.autoCollapseInactiveGroupsMinutes} ${t.minutesShort}`
        ),
        makeItem(
          t.autoSleepInactiveTabs,
          settings.autoSleepInactiveTabsMinutes === 0
            ? t.never
            : `${settings.autoSleepInactiveTabsMinutes} ${t.minutesShort}`
        ),
        makeItem(
          t.autoCloseInactiveTabs,
          settings.autoCloseInactiveTabsMinutes === 0
            ? t.never
            : `${settings.autoCloseInactiveTabsMinutes} ${t.minutesShort}`
        ),
        makeItem(t.redirectTracking, settings.redirectTrackingEnabled ? t.enabled : t.disabled)
      ]
    };
  }

  if (activeView === 'deduplication') {
    const siteListTitle =
      settings.autoDeduplicationScope === 'listed-only'
        ? t.autoDeduplicationIncludedSites
        : t.autoDeduplicationExcludedSites;
    const siteListDescription =
      settings.autoDeduplicationScope === 'listed-only'
        ? t.autoDeduplicationIncludedSitesSub
        : t.autoDeduplicationExcludedSitesSub;

    return {
      title: activeViewLabel,
      metrics: [
        makeMetric(t.autoDeduplicateTabs, settings.autoDeduplicateTabs ? t.enabled : t.disabled),
        makeMetric(siteListTitle, String(settings.autoDeduplicationSites.length)),
        makeMetric(t.autoGroup, settings.autoGroupEnabled ? t.enabled : t.disabled),
        makeMetric(t.redirectTracking, settings.redirectTrackingEnabled ? t.enabled : t.disabled)
      ],
      items: [
        makeItem(t.autoDeduplicateTabs, settings.autoDeduplicateTabs ? t.enabled : t.disabled),
        makeItem(
          siteListTitle,
          settings.autoDeduplicationSites.length === 0
            ? t.disabled
            : `${settings.autoDeduplicationSites.length} ${t.selectedItems}`
        )
      ],
      asideTitle: t.behavior,
      asideItems: [
        makeItem(t.autoDeduplicateTabs, t.autoDeduplicateTabsSub),
        makeItem(siteListTitle, siteListDescription),
        makeItem(t.autoGroup, settings.autoGroupEnabled ? t.enabled : t.disabled)
      ]
    };
  }

  return {
    title: activeViewLabel,
    metrics: [
      makeMetric(t.theme, resolvedTheme === 'dark' ? t.dark : t.light),
      makeMetric(t.language, languageLabel),
      makeMetric(t.launchSurface, settings.launchSurface === 'dashboard' ? t.dashboard : t.sidePanel),
      makeMetric(t.autoRefresh, settings.autoRefreshSeconds === 0 ? t.manualOnly : `${settings.autoRefreshSeconds}s`)
    ],
    items: [
      makeItem(t.theme, settings.theme === 'system' ? `${t.system} · ${resolvedTheme === 'dark' ? t.dark : t.light}` : resolvedTheme === 'dark' ? t.dark : t.light),
      makeItem(t.language, languageLabel),
      makeItem(t.launchSurface, settings.launchSurface === 'dashboard' ? t.dashboard : t.sidePanel),
      makeItem(t.autoGroup, settings.autoGroupEnabled ? t.enabled : t.disabled)
    ],
    asideTitle: t.workspaceSettings,
    asideItems: [
      makeItem(t.interfacePreferences, t.interfacePreferencesSub),
      makeItem(t.settingsSummary, `${t.theme} · ${t.language}`),
      makeItem(t.behavior, `${t.autoRefresh} · ${t.autoCollapseInactiveGroups}`)
    ]
  };
}
