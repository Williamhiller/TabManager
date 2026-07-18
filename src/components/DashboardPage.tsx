import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DashboardAside,
  DashboardAutoClosePanel,
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
import type {
  AutoGroupConfig,
  AutoGroupRule,
  AutoCloseInactiveTabsMinutes,
  BrowserCommandShortcutState,
  ManagerSettings,
  ThemeMode
} from '../lib/contracts';
import { createAutoGroupConfig } from '../lib/auto-group-config';
import { getErrorMessage } from '../lib/format';
import { getMessages, resolveLocale } from '../lib/i18n';
import {
  getBrowserCommandShortcutState,
  getBookmarks,
  getOverview,
  getRedirectTrackingPermissionState,
  getSessions,
  refreshRedirectTracking,
  removeRedirectTrackingPermission,
  requestRedirectTrackingPermission,
  subscribeToBookmarksUpdates,
  subscribeToOverviewUpdates,
  subscribeToSessionsUpdates,
  syncActionPopupForLaunchSurface
} from '../lib/runtime-client';
import { defaultSettings, getSettings, updateSettings } from '../lib/settings';
import { autoInactiveMinuteChoices } from '../lib/settings';
import { applyTheme, resolveTheme } from '../lib/theme';

const STORE_SHARE_URL = 'https://chromewebstore.google.com/detail/auto-tab-groups-tab-bookm/mnimeepnfdjhdkigakdfknjmcblpolga';
const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdtLzy85a3JHn3ynbEjY0JmR6PPSdXYtWtzFHNPEQ4eHcQq3Q/viewform';

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

function shouldHighlightShortcutSetup(): boolean {
  if (typeof window === 'undefined') return false;

  return new URLSearchParams(window.location.search).get('shortcutSetup') === '1';
}

export function DashboardPage() {
  const [activeView, setActiveView] = useState<DashboardViewId>(() => getInitialDashboardView());
  const [highlightShortcutSetup] = useState(() => shouldHighlightShortcutSetup());
  const [browserShortcutState, setBrowserShortcutState] = useState<BrowserCommandShortcutState | null>(null);
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

  const refreshSessions = useCallback(async () => {
    try {
      const sessions = await getSessions();
      setData((current) => ({ ...current, sessions }));
      setError(null);
    } catch (nextError) {
      const message = getErrorMessage(nextError);
      setError(message);
      throw nextError;
    }
  }, []);

  useEffect(() => {
    applyTheme(data.settings.theme);
  }, [data.settings.theme]);

  useEffect(() => {
    if (data.settings.theme !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => applyTheme('system');

    syncTheme();
    media.addEventListener('change', syncTheme);
    return () => media.removeEventListener('change', syncTheme);
  }, [data.settings.theme]);

  useEffect(() => {
    if (!shareFeedback) return;
    const timer = window.setTimeout(() => setShareFeedback(null), 2400);
    return () => window.clearTimeout(timer);
  }, [shareFeedback]);

  useEffect(() => {
    let mounted = true;

    const loadOverview = async () => {
      try {
        const overview = await getOverview();
        if (!mounted) return;
        setData((current) => ({ ...current, overview }));
        setError(null);
      } catch (nextError) {
        if (mounted) setError(getErrorMessage(nextError));
      }
    };

    const loadBookmarks = async () => {
      try {
        const bookmarks = await getBookmarks();
        if (!mounted) return;
        setData((current) => ({ ...current, bookmarks }));
      } catch (nextError) {
        if (mounted) setError(getErrorMessage(nextError));
      }
    };

    const loadSessions = async () => {
      try {
        const sessions = await getSessions();
        if (!mounted) return;
        setData((current) => ({ ...current, sessions }));
      } catch (nextError) {
        if (mounted) setError(getErrorMessage(nextError));
      }
    };

    const loadRedirectPermission = async () => {
      try {
        const redirectTrackingPermission = await getRedirectTrackingPermissionState();
        if (!mounted) return;
        setData((current) => ({ ...current, redirectTrackingPermission }));
      } catch (nextError) {
        if (mounted) setError(getErrorMessage(nextError));
      }
    };

    const loadBrowserShortcutState = async () => {
      try {
        const shortcutState = await getBrowserCommandShortcutState();
        if (!mounted) return;
        setBrowserShortcutState(shortcutState);
      } catch (nextError) {
        if (mounted) setError(getErrorMessage(nextError));
      }
    };

    const load = async () => {
      try {
        const settings = await getSettings();
        if (!mounted) return;
        setData((current) => ({ ...current, settings }));
        setSettingsLoaded(true);
        setError(null);
      } catch (nextError) {
        if (mounted) setError(getErrorMessage(nextError));
      }

      void loadOverview();
      void loadBookmarks();
      void loadSessions();
      void loadRedirectPermission();
      void loadBrowserShortcutState();
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
      const isSettingsChange =
        (areaName === 'sync' && changes['manager-settings']) ||
        (areaName === 'local' && changes['tab-manager/settings-fallback']);
      if (!isSettingsChange) return;
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
      mounted = false;
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
  const nextLaunchSurface =
    data.settings.launchSurface === 'dashboard'
      ? 'sidepanel'
      : data.settings.launchSurface === 'sidepanel'
        ? 'popup'
        : 'dashboard';
  const launchSurfaceTargetLabel =
    nextLaunchSurface === 'sidepanel'
      ? t.sidePanel
      : nextLaunchSurface === 'popup'
        ? t.popup
        : t.dashboard;
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

  const saveSettings = useCallback(async (patch: Partial<ManagerSettings>) => {
    try {
      const settings = await updateSettings(patch);
      if (patch.launchSurface) {
        void syncActionPopupForLaunchSurface(settings.launchSurface).catch((error) => {
          console.warn('Failed to sync action behavior for launch surface change.', error);
        });
      }
      setData((current) => ({ ...current, settings }));
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  }, []);

  const toggleRedirectTracking = useCallback(async () => {
    if (redirectTrackingBusy) return;

    setRedirectTrackingBusy(true);
    try {
      // Read the current setting from storage instead of relying on the
      // closure value, which may be stale if a previous toggle triggered
      // a re-render while this callback was still being created.
      const currentSettings = await getSettings();

      if (currentSettings.redirectTrackingEnabled) {
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
  }, [redirectTrackingBusy]);

  const handleThemeToggle = useCallback(() => {
    const nextTheme: ThemeMode =
      resolvedTheme === 'dark'
        ? 'light'
        : 'dark';
    void saveSettings({ theme: nextTheme });
  }, [resolvedTheme, saveSettings]);

  const copySharePayload = useCallback(async (payload: string, feedback: string) => {
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
  }, [t.shareUnsupported]);

  const handleCopyShareLink = async () => {
    await copySharePayload(STORE_SHARE_URL, t.shareCopied);
  };

  const handleCopyShareText = async () => {
    await copySharePayload(`${t.shareText}\n${STORE_SHARE_URL}`, t.shareTextCopied);
  };

  const handleShareTwitter = () => {
    const tweetText = encodeURIComponent(`${t.shareText}\n\n${STORE_SHARE_URL}`);
    window.open(`https://twitter.com/intent/tweet?text=${tweetText}`, '_blank', 'noopener,noreferrer,width=600,height=400');
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent('TabFriday - Tab Manager Extension');
    const body = encodeURIComponent(`${t.shareText}\n\n${STORE_SHARE_URL}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
  };

  const handleOpenStore = () => {
    window.open(STORE_SHARE_URL, '_blank', 'noopener,noreferrer');
  };

  const handleFeedback = () => {
    window.open(FEEDBACK_FORM_URL, '_blank', 'noopener,noreferrer');
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
          feedbackLabel={t.feedback}
          launchSurface={data.settings.launchSurface}
          launchSurfaceCurrentLabel={
            data.settings.launchSurface === 'sidepanel'
              ? t.sidePanel
              : data.settings.launchSurface === 'popup'
                ? t.popup
                : t.dashboard
          }
          launchSurfaceToggleLabel={t.switchLaunchSurface.replace('{surface}', launchSurfaceTargetLabel)}
          onCopyShareLink={() => void handleCopyShareLink()}
          onCopyShareText={() => void handleCopyShareText()}
          onShareTwitter={handleShareTwitter}
          onShareEmail={handleShareEmail}
          onFeedback={handleFeedback}
          onLaunchSurfaceToggle={() =>
            void saveSettings({
              launchSurface: nextLaunchSurface
            })
          }
          onOpenStore={handleOpenStore}
          browserShortcutState={browserShortcutState}
          highlightBrowserShortcutSetup={highlightShortcutSetup}
          shareCta={t.shareCta}
          shareCopyLabel={t.copyStoreLink}
          shareCopyTextLabel={t.copyShareText}
          shareEmailLabel={t.shareEmail}
          shareFeedback={shareFeedback}
          shareLabel={t.shareApp}
          shareOpenStoreLabel={t.openStorePage}
          shareTwitterLabel={t.shareTwitter}
          tagline={`· ${t.appTagline}`}
          onThemeToggle={handleThemeToggle}
          themeChoice={resolvedTheme}
          themeLabel={t.theme}
          title="TabFriday"
        />

        <div
          className={
            activeView === 'tabs' ||
            activeView === 'settings' ||
            activeView === 'automation' ||
            activeView === 'deduplication' ||
            activeView === 'autoclose' ||
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
              autoCollapseChoices={autoInactiveMinuteChoices}
              autoSleepChoices={autoInactiveMinuteChoices}
              busy={false}
              languageOptions={languageOptions}
              onAutoCollapseChange={(minutes) => void saveSettings({ autoCollapseInactiveGroupsMinutes: minutes })}
              onAutoSleepChange={(minutes) => void saveSettings({ autoSleepInactiveTabsMinutes: minutes })}
              onLocaleChange={(localeMode) => void saveSettings({ locale: localeMode })}
              onRedirectTrackingToggle={() => void toggleRedirectTracking()}
              onToggleBlockChromeAutoGroup={() =>
                void saveSettings({ blockChromeAutoGroup: !data.settings.blockChromeAutoGroup })
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
              autoGroupLearningSensitivity={data.settings.autoGroupLearningSensitivity}
              configs={data.settings.autoGroupConfigs}
              locale={locale}
              tabs={data.overview?.tabs ?? []}
              onAddConfig={() => void addAutoGroupConfig()}
              onAddRule={(configId) => void addAutoGroupRule(configId)}
              onDeleteConfig={(configId) => void deleteAutoGroupConfig(configId)}
              onDeleteRule={(configId, ruleId) => void deleteAutoGroupRule(configId, ruleId)}
              onReorderConfigs={(activeConfigId, overConfigId) =>
                void reorderAutoGroupConfig(activeConfigId, overConfigId)
              }
              onSelectConfig={setSelectedAutoGroupConfigId}
              onToggleAutoGroup={() => void saveSettings({ autoGroupEnabled: !data.settings.autoGroupEnabled })}
              onToggleAutoGroupLearning={() =>
                void saveSettings({
                  autoGroupLearningSensitivity:
                    data.settings.autoGroupLearningSensitivity === 'off' ? 'high' : 'off'
                })
              }
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
              onDeduplicationKeepChange={(keep) =>
                void saveSettings({ autoDeduplicationKeep: keep })
              }
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
          ) : activeView === 'autoclose' ? (
            <DashboardAutoClosePanel
              autoCloseChoices={autoInactiveMinuteChoices}
              busy={false}
              onAutoCloseChange={(minutes) => void saveSettings({ autoCloseInactiveTabsMinutes: minutes })}
              onAutoCloseDomainModeChange={(mode) => void saveSettings({ autoCloseDomainMode: mode })}
              onAutoCleanupWhitelistChange={(entries) => void saveSettings({ autoCleanupWhitelist: entries })}
              onToggleAutoClose={() => {
                const next = data.settings.autoCloseInactiveTabsMinutes > 0 ? 0 : 30;
                void saveSettings({ autoCloseInactiveTabsMinutes: next as AutoCloseInactiveTabsMinutes });
              }}
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
              autoSnapshotsEnabled={data.settings.autoSnapshotsEnabled}
              errorMessage={error}
              locale={locale}
              onRefreshSessions={refreshSessions}
              onToggleAutoSnapshots={() =>
                void saveSettings({ autoSnapshotsEnabled: !data.settings.autoSnapshotsEnabled })
              }
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
