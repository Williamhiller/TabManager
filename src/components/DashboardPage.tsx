import { useEffect, useMemo, useState } from 'react';

import {
  DashboardAside,
  DashboardAutoGroupPanel,
  DashboardBookmarksPanel,
  DashboardDeduplicationPanel,
  DashboardHeader,
  DashboardMain,
  DashboardSettingsPanel,
  DashboardSnapshotsPanel,
  DashboardTabsPanel,
  DashboardSidebar,
  DASHBOARD_DEFAULT_VIEW,
  DASHBOARD_LANGUAGE_OPTIONS,
  DASHBOARD_NAV_ITEMS,
  buildDashboardViewModel
} from './dashboard';
import { createAutoGroupRule } from './tab-tree-helpers';
import type { DashboardData, DashboardViewId } from './dashboard';
import type { AutoGroupConfig, AutoGroupRule, ManagerSettings, ThemeMode } from '../lib/contracts';
import { createAutoGroupConfig } from '../lib/auto-group-config';
import { getErrorMessage } from '../lib/format';
import { getMessages, resolveLocale } from '../lib/i18n';
import {
  getBookmarks,
  getOverview,
  getRedirectTrackingPermissionState,
  getSessions,
  refreshRedirectTracking,
  removeRedirectTrackingPermission,
  requestRedirectTrackingPermission,
  subscribeToBookmarksUpdates,
  subscribeToOverviewUpdates,
  subscribeToSessionsUpdates
} from '../lib/runtime-client';
import { defaultSettings, getSettings, updateSettings } from '../lib/settings';
import { autoInactiveMinuteChoices } from '../lib/settings';
import { applyTheme, resolveTheme } from '../lib/theme';

const STORE_SHARE_URL = 'https://chromewebstore.google.com/detail/auto-tab-groups-tab-bookm/mnimeepnfdjhdkigakdfknjmcblpolga?authuser=0&hl=zh-CN';

function getInitialDashboardView(): DashboardViewId {
  if (typeof window === 'undefined') return DASHBOARD_DEFAULT_VIEW;

  const view = new URLSearchParams(window.location.search).get('view');
  return DASHBOARD_NAV_ITEMS.some((item) => item.id === view)
    ? (view as DashboardViewId)
    : DASHBOARD_DEFAULT_VIEW;
}

function getInitialAutoGroupConfigId(): string | null {
  if (typeof window === 'undefined') return null;

  return new URLSearchParams(window.location.search).get('autoGroupConfig');
}

export function DashboardPage() {
  const [activeView, setActiveView] = useState<DashboardViewId>(() => getInitialDashboardView());
  const [data, setData] = useState<DashboardData>({
    bookmarks: null,
    overview: null,
    redirectTrackingPermission: null,
    sessions: null,
    settings: defaultSettings
  });
  const [error, setError] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [redirectTrackingBusy, setRedirectTrackingBusy] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [selectedAutoGroupConfigId, setSelectedAutoGroupConfigId] = useState<string | null>(
    () => getInitialAutoGroupConfigId()
  );
  const locale = resolveLocale(data.settings.locale);
  const t = getMessages(data.settings.locale);
  const resolvedTheme = resolveTheme(data.settings.theme);

  const refreshSessions = async () => {
    try {
      const sessions = await getSessions();
      setData((current) => ({ ...current, sessions }));
      setError(null);
    } catch (nextError) {
      const message = getErrorMessage(nextError);
      setError(message);
      throw nextError;
    }
  };

  useEffect(() => {
    applyTheme(data.settings.theme);
  }, [data.settings.theme]);

  useEffect(() => {
    if (!shareFeedback) return;
    const timer = window.setTimeout(() => setShareFeedback(null), 2400);
    return () => window.clearTimeout(timer);
  }, [shareFeedback]);

  useEffect(() => {
    const load = async () => {
      try {
        const [overview, settings, bookmarks, sessions, redirectTrackingPermission] = await Promise.all([
          getOverview(),
          getSettings(),
          getBookmarks(),
          getSessions(),
          getRedirectTrackingPermissionState()
        ]);

        setData({ bookmarks, overview, redirectTrackingPermission, sessions, settings });
        setSettingsLoaded(true);
        setError(null);
      } catch (nextError) {
        setError(getErrorMessage(nextError));
      }
    };

    const refreshOverview = async () => {
      try {
        const overview = await getOverview();
        setData((current) => ({ ...current, overview }));
        setError(null);
      } catch (nextError) {
        setError(getErrorMessage(nextError));
        throw nextError;
      }
    };

    const refreshBookmarks = async () => {
      try {
        const bookmarks = await getBookmarks();
        setData((current) => ({ ...current, bookmarks }));
        setError(null);
      } catch (nextError) {
        setError(getErrorMessage(nextError));
      }
    };

    void load();

    const unsubscribeOverview = subscribeToOverviewUpdates(() => {
      void refreshOverview();
    });
    const unsubscribeBookmarks = subscribeToBookmarksUpdates(() => {
      void refreshBookmarks();
    });
    const unsubscribeSessions = subscribeToSessionsUpdates(() => {
      void refreshSessions();
    });

    const handleStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== 'sync' || !changes['manager-settings']) return;
      void (async () => {
        try {
          const settings = await getSettings();
          setData((current) => ({ ...current, settings }));
          setSettingsLoaded(true);
          setError(null);
        } catch (nextError) {
          setError(getErrorMessage(nextError));
        }
      })();
    };

    chrome.storage.onChanged.addListener(handleStorageChanged);

    return () => {
      unsubscribeOverview();
      unsubscribeBookmarks();
      unsubscribeSessions();
      chrome.storage.onChanged.removeListener(handleStorageChanged);
    };
  }, []);

  useEffect(() => {
    if (activeView !== 'automation' || !settingsLoaded) return;

    const selectedExists = data.settings.autoGroupConfigs.some((config) => config.id === selectedAutoGroupConfigId);
    if (!selectedExists) {
      setSelectedAutoGroupConfigId(data.settings.autoGroupConfigs[0]?.id ?? null);
    }
  }, [activeView, data.settings.autoGroupConfigs, selectedAutoGroupConfigId, settingsLoaded]);

  const navItems = useMemo(
    () =>
      DASHBOARD_NAV_ITEMS.map((item) => ({
        ...item,
        label: t[item.labelKey]
      })),
    [t]
  );

  const languageOptions = useMemo(
    () =>
      DASHBOARD_LANGUAGE_OPTIONS.map((option) => ({
        value: option.value,
        label: t[option.labelKey]
      })),
    [t]
  );

  const activeViewLabel = navItems.find((item) => item.id === activeView)?.label ?? t.dashboard;
  const launchSurfaceTargetLabel =
    data.settings.launchSurface === 'dashboard' ? t.sidePanel : t.dashboard;
  const languageLabel =
    languageOptions.find((option) => option.value === data.settings.locale)?.label ?? t.localeAuto;
  const viewModel = buildDashboardViewModel({
    activeView,
    activeViewLabel,
    data,
    languageLabel,
    locale,
    t
  });

  const saveSettings = async (patch: Partial<ManagerSettings>) => {
    try {
      const settings = await updateSettings(patch);
      setData((current) => ({ ...current, settings }));
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  };

  const toggleRedirectTracking = async () => {
    if (redirectTrackingBusy) return;

    setRedirectTrackingBusy(true);
    try {
      if (data.settings.redirectTrackingEnabled) {
        const settings = await updateSettings({ redirectTrackingEnabled: false });
        await removeRedirectTrackingPermission();
        const redirectTrackingPermission = await refreshRedirectTracking();
        setData((current) => ({
          ...current,
          redirectTrackingPermission,
          settings
        }));
        setError(null);
        return;
      }

      const granted = await requestRedirectTrackingPermission();
      if (!granted) {
        const settings = await updateSettings({ redirectTrackingEnabled: false });
        setData((current) => ({
          ...current,
          redirectTrackingPermission: { granted: false },
          settings
        }));
        setError(null);
        return;
      }

      const settings = await updateSettings({ redirectTrackingEnabled: true });
      const redirectTrackingPermission = await refreshRedirectTracking();
      setData((current) => ({
        ...current,
        redirectTrackingPermission,
        settings
      }));
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setRedirectTrackingBusy(false);
    }
  };

  const handleThemeToggle = () => {
    const nextTheme: ThemeMode =
      resolvedTheme === 'dark'
        ? 'light'
        : 'dark';
    void saveSettings({ theme: nextTheme });
  };

  const copySharePayload = async (payload: string, feedback: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        setShareFeedback(feedback);
        setError(null);
        return;
      }

      throw new Error(t.shareUnsupported);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  };

  const handleCopyShareLink = async () => {
    await copySharePayload(STORE_SHARE_URL, t.shareCopied);
  };

  const handleCopyShareText = async () => {
    await copySharePayload(`${t.shareText}\n${STORE_SHARE_URL}`, t.shareTextCopied);
  };

  const handleOpenStore = () => {
    window.open(STORE_SHARE_URL, '_blank', 'noopener,noreferrer');
  };

  const saveAutoGroupConfigs = async (configs: AutoGroupConfig[]) => {
    await saveSettings({ autoGroupConfigs: configs });
  };

  const addAutoGroupConfig = async () => {
    const nextConfig = createAutoGroupConfig(t.newGroup);
    setSelectedAutoGroupConfigId(nextConfig.id);
    await saveAutoGroupConfigs([...data.settings.autoGroupConfigs, nextConfig]);
  };

  const deleteAutoGroupConfig = async (configId: string) => {
    await saveAutoGroupConfigs(data.settings.autoGroupConfigs.filter((config) => config.id !== configId));
  };

  const reorderAutoGroupConfig = async (activeConfigId: string, overConfigId: string) => {
    const currentIndex = data.settings.autoGroupConfigs.findIndex((config) => config.id === activeConfigId);
    const nextIndex = data.settings.autoGroupConfigs.findIndex((config) => config.id === overConfigId);
    if (currentIndex < 0 || nextIndex < 0 || currentIndex === nextIndex) return;

    const nextConfigs = [...data.settings.autoGroupConfigs];
    const [moved] = nextConfigs.splice(currentIndex, 1);
    nextConfigs.splice(nextIndex, 0, moved);
    await saveAutoGroupConfigs(nextConfigs);
  };

  const updateAutoGroupConfig = async (configId: string, patch: Partial<AutoGroupConfig>) => {
    await saveAutoGroupConfigs(
      data.settings.autoGroupConfigs.map((config) =>
        config.id === configId
          ? {
              ...config,
              ...patch,
              title: typeof patch.title === 'string' ? patch.title : config.title,
              websites: patch.websites ?? config.websites,
              rules: patch.rules ?? config.rules
            }
          : config
      )
    );
  };

  const updateAutoGroupRule = async (configId: string, ruleId: string, patch: Partial<AutoGroupRule>) => {
    const config = data.settings.autoGroupConfigs.find((item) => item.id === configId);
    if (!config) return;

    await updateAutoGroupConfig(configId, {
      rules: config.rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule))
    });
  };

  const addAutoGroupRule = async (configId: string) => {
    const config = data.settings.autoGroupConfigs.find((item) => item.id === configId);
    if (!config) return;

    await updateAutoGroupConfig(configId, {
      rules: [...config.rules, createAutoGroupRule()]
    });
  };

  const deleteAutoGroupRule = async (configId: string, ruleId: string) => {
    const config = data.settings.autoGroupConfigs.find((item) => item.id === configId);
    if (!config) return;

    await updateAutoGroupConfig(configId, {
      rules: config.rules.filter((rule) => rule.id !== ruleId)
    });
  };

  return (
    <div className="tm-shell tm-dashboard-shell">
      <div className="tm-dashboard-page">
        <DashboardHeader
          launchSurface={data.settings.launchSurface}
          launchSurfaceToggleLabel={t.switchLaunchSurface.replace('{surface}', launchSurfaceTargetLabel)}
          onCopyShareLink={() => void handleCopyShareLink()}
          onCopyShareText={() => void handleCopyShareText()}
          onLaunchSurfaceToggle={() =>
            void saveSettings({
              launchSurface: data.settings.launchSurface === 'dashboard' ? 'sidepanel' : 'dashboard'
            })
          }
          onOpenStore={handleOpenStore}
          shareCta={t.shareCta}
          shareCopyLabel={t.copyStoreLink}
          shareCopyTextLabel={t.copyShareText}
          shareFeedback={shareFeedback}
          shareLabel={t.shareApp}
          shareOpenStoreLabel={t.openStorePage}
          tagline={`· ${t.appTagline}`}
          onThemeToggle={handleThemeToggle}
          themeChoice={resolvedTheme}
          themeLabel={t.theme}
          title="TabWise"
        />

        <div
          className={
            activeView === 'tabs' ||
            activeView === 'settings' ||
            activeView === 'automation' ||
            activeView === 'deduplication' ||
            activeView === 'bookmarks' ||
            activeView === 'snapshots'
              ? 'tm-dashboard-frame tm-dashboard-frame-settings'
              : 'tm-dashboard-frame'
          }
        >
          <DashboardSidebar activeView={activeView} items={navItems} onViewSelect={setActiveView} />
          {activeView === 'tabs' ? (
            <DashboardTabsPanel
              errorMessage={error}
              onRefreshOverview={async () => {
                try {
                  const overview = await getOverview();
                  setData((current) => ({ ...current, overview }));
                  setError(null);
                } catch (nextError) {
                  setError(getErrorMessage(nextError));
                  throw nextError;
                }
              }}
              overview={data.overview}
              settings={data.settings}
            />
          ) : activeView === 'settings' ? (
            <DashboardSettingsPanel
              autoCloseChoices={autoInactiveMinuteChoices}
              autoCollapseChoices={autoInactiveMinuteChoices}
              autoSleepChoices={autoInactiveMinuteChoices}
              busy={false}
              languageOptions={languageOptions}
              onAutoCleanupWhitelistChange={(entries) => void saveSettings({ autoCleanupWhitelist: entries })}
              onCloseSleepingOnlyChange={(value) =>
                void saveSettings({ autoCloseCondition: value ? 'sleeping-only' : 'deep-idle' })
              }
              onAutoCloseChange={(minutes) => void saveSettings({ autoCloseInactiveTabsMinutes: minutes })}
              onAutoCollapseChange={(minutes) => void saveSettings({ autoCollapseInactiveGroupsMinutes: minutes })}
              onAutoSleepChange={(minutes) => void saveSettings({ autoSleepInactiveTabsMinutes: minutes })}
              onLocaleChange={(localeMode) => void saveSettings({ locale: localeMode })}
              onRedirectTrackingToggle={() => void toggleRedirectTracking()}
              onToggleAutoGroup={() => void saveSettings({ autoGroupEnabled: !data.settings.autoGroupEnabled })}
              onToggleShowHistory={() => void saveSettings({ showHistory: !data.settings.showHistory })}
              onToggleAutoSnapshots={() =>
                void saveSettings({ autoSnapshotsEnabled: !data.settings.autoSnapshotsEnabled })
              }
              onToggleLaunchSurface={(surface) => void saveSettings({ launchSurface: surface })}
              redirectTrackingBusy={redirectTrackingBusy}
              redirectTrackingPermission={data.redirectTrackingPermission}
              settings={data.settings}
              t={t}
            />
          ) : activeView === 'automation' ? (
            <DashboardAutoGroupPanel
              autoGroupEnabled={data.settings.autoGroupEnabled}
              configs={data.settings.autoGroupConfigs}
              locale={locale}
              onAddConfig={() => void addAutoGroupConfig()}
              onAddRule={(configId) => void addAutoGroupRule(configId)}
              onDeleteConfig={(configId) => void deleteAutoGroupConfig(configId)}
              onDeleteRule={(configId, ruleId) => void deleteAutoGroupRule(configId, ruleId)}
              onReorderConfigs={(activeConfigId, overConfigId) =>
                void reorderAutoGroupConfig(activeConfigId, overConfigId)
              }
              onSelectConfig={setSelectedAutoGroupConfigId}
              onToggleAutoGroup={() => void saveSettings({ autoGroupEnabled: !data.settings.autoGroupEnabled })}
              onToggleConfig={(configId) => {
                const config = data.settings.autoGroupConfigs.find((item) => item.id === configId);
                if (!config) return;
                void updateAutoGroupConfig(configId, { enabled: !config.enabled });
              }}
              onUpdateConfig={(configId, patch) => void updateAutoGroupConfig(configId, patch)}
              onUpdateRule={(configId, ruleId, patch) => void updateAutoGroupRule(configId, ruleId, patch)}
              selectedConfigId={selectedAutoGroupConfigId}
              t={t}
            />
          ) : activeView === 'deduplication' ? (
            <DashboardDeduplicationPanel
              busy={false}
              onDeduplicationScopeChange={(scope) =>
                void saveSettings({ autoDeduplicationScope: scope })
              }
              onDeduplicationSitesChange={(entries) =>
                void saveSettings({ autoDeduplicationSites: entries })
              }
              onToggleAutoDeduplicateTabs={() =>
                void saveSettings({ autoDeduplicateTabs: !data.settings.autoDeduplicateTabs })
              }
              settings={data.settings}
              t={t}
            />
          ) : activeView === 'bookmarks' ? (
            <DashboardBookmarksPanel
              bookmarks={data.bookmarks}
              error={error}
              locale={locale}
              onRefreshBookmarks={async () => {
                try {
                  const bookmarks = await getBookmarks();
                  setData((current) => ({ ...current, bookmarks }));
                  setError(null);
                } catch (nextError) {
                  const message = getErrorMessage(nextError);
                  setError(message);
                  throw nextError;
                }
              }}
              t={t}
            />
          ) : activeView === 'snapshots' ? (
            <DashboardSnapshotsPanel
              errorMessage={error}
              locale={locale}
              onRefreshSessions={refreshSessions}
              openUrls={data.overview?.tabs.map((tab) => tab.url) ?? []}
              sessions={data.sessions}
              t={t}
            />
          ) : (
            <>
              <DashboardMain
                emptyMessage={error ?? t.noMatch}
                items={viewModel.items}
                metrics={viewModel.metrics}
                title={viewModel.title}
              />
              <DashboardAside
                emptyMessage={error ?? t.noMatchHint}
                items={viewModel.asideItems}
                title={viewModel.asideTitle}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
