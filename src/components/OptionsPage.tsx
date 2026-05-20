import {
  RiArrowRightUpLine,
  RiCloseCircleLine,
  RiFileCopyLine,
  RiFolderReduceLine,
  RiGlobalLine,
  RiHistoryLine,
  RiMoonLine,
  RiSidebarUnfoldLine,
} from '@remixicon/react';
import { useEffect, useState } from 'react';

import type {
  AutoCloseInactiveTabsMinutes,
  AutoCollapseInactiveGroupsMinutes,
  AutoSleepInactiveTabsMinutes,
  LocaleMode,
  ManagerSettings,
  ThemeMode
} from '../lib/contracts';
import { getErrorMessage } from '../lib/format';
import { getMessages } from '../lib/i18n';
import { openDashboardPage, openSidePanel } from '../lib/runtime-client';
import {
  autoInactiveMinuteChoices,
  defaultSettings,
  getSettings,
  updateSettings
} from '../lib/settings';
import { applyTheme } from '../lib/theme';
import { TagListEditor } from './TagListEditor';

const refreshChoices = [0, 15, 30, 60];

export function OptionsPage() {
  const [settings, setSettings] = useState<ManagerSettings>(defaultSettings);
  const [status, setStatus] = useState('Loading…');
  const [busy, setBusy] = useState(true);
  const t = getMessages(settings.locale);

  useEffect(() => {
    void (async () => {
      try {
        const next = await getSettings();
        setSettings(next);
        applyTheme(next.theme);
        setStatus(t.statusReady);
      } catch (error) {
        setStatus(getErrorMessage(error));
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  const save = async (patch: Partial<ManagerSettings>) => {
    setBusy(true);

    try {
      const next = await updateSettings(patch);
      setSettings(next);
      applyTheme(next.theme);
      setStatus(t.save);
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tm-shell">
      <div className="tm-app" data-mode="dashboard">
        <header className="tm-panel tm-topbar">
          <div>
            <h1 className="tm-title">{t.workspaceSettings}</h1>
            <p className="tm-subtle">{t.workspaceSettingsSub}</p>
          </div>
          <div className="tm-toolbar-controls">
            <button className="tm-button" onClick={() => void openDashboardPage()} type="button">
              <RiArrowRightUpLine size={14} />
              {t.dashboard}
            </button>
            <button
              className="tm-button-primary"
              disabled={busy}
              onClick={() => void openSidePanel()}
              type="button"
            >
              <RiSidebarUnfoldLine size={14} />
              {t.sidePanel}
            </button>
          </div>
        </header>

        <section className="tm-layout">
          <div className="tm-panel tm-sidebar">
            <div className="tm-sidebar-section">
              <p className="tm-section-title">{t.theme}</p>
              <select
                aria-label={t.theme}
                className="tm-select tm-settings-select"
                onChange={(event) => void save({ theme: event.target.value as ThemeMode })}
                value={settings.theme}
              >
                <option value="system">{t.system}</option>
                <option value="light">{t.light}</option>
                <option value="dark">{t.dark}</option>
              </select>
            </div>

            <div className="tm-sidebar-section">
              <p className="tm-section-title">{t.language}</p>
              <select
                aria-label={t.language}
                className="tm-select tm-settings-select"
                onChange={(event) => void save({ locale: event.target.value as LocaleMode })}
                value={settings.locale}
              >
                <option value="system">{t.localeAuto}</option>
                <option value="en">{t.localeEnglish}</option>
                <option value="zh-CN">{t.localeChinese}</option>
                <option value="ja">{t.localeJapanese}</option>
                <option value="fr">{t.localeFrench}</option>
                <option value="es">{t.localeSpanish}</option>
                <option value="ar">{t.localeArabic}</option>
              </select>
            </div>

            <div className="tm-sidebar-section">
              <p className="tm-section-title">{t.launchSurface}</p>
              <button
                className="tm-nav-button"
                data-active={settings.launchSurface === 'sidepanel'}
                onClick={() => void save({ launchSurface: 'sidepanel' })}
                type="button"
              >
                {t.sidePanel}
              </button>
              <button
                className="tm-nav-button"
                data-active={settings.launchSurface === 'dashboard'}
                onClick={() => void save({ launchSurface: 'dashboard' })}
                type="button"
              >
                {t.dashboard}
              </button>
            </div>
          </div>

          <div className="tm-panel tm-main">
            <div className="tm-main-header">
              <h2 className="text-sm font-semibold">{t.behavior}</h2>
              <p className="tm-subtle">{status}</p>
            </div>

            <div className="flex flex-col gap-2 p-3">
              <div className="tm-panel-muted p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <RiGlobalLine size={14} />
                    <h3 className="text-sm font-semibold">{t.autoRefresh}</h3>
                  </div>
                  <div className="tm-toolbar-controls">
                    {refreshChoices.map((seconds) => (
                      <button
                        key={seconds}
                        className={settings.autoRefreshSeconds === seconds ? 'tm-button-primary' : 'tm-button'}
                        onClick={() => void save({ autoRefreshSeconds: seconds })}
                        type="button"
                      >
                        {seconds === 0 ? t.manualOnly : `${seconds}s`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="tm-panel-muted p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <RiHistoryLine size={14} />
                    <h3 className="text-sm font-semibold">{t.showHistory}</h3>
                  </div>
                  <p className="tm-subtle">{t.showHistorySub}</p>
                  <button
                    aria-pressed={settings.showHistory}
                    className={settings.showHistory ? 'tm-button-primary' : 'tm-button'}
                    disabled={busy}
                    onClick={() => void save({ showHistory: !settings.showHistory })}
                    type="button"
                  >
                    {settings.showHistory ? t.enabled : t.disabled}
                  </button>
                </div>
              </div>

              <div className="tm-panel-muted p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <RiFolderReduceLine size={14} />
                    <h3 className="text-sm font-semibold">{t.autoCollapseInactiveGroups}</h3>
                  </div>
                  <p className="tm-subtle">{t.autoCollapseInactiveGroupsSub}</p>
                  <select
                    aria-label={t.autoCollapseInactiveGroups}
                    className="tm-select tm-settings-select"
                    onChange={(event) =>
                      void save({
                        autoCollapseInactiveGroupsMinutes: Number(
                          event.target.value
                        ) as AutoCollapseInactiveGroupsMinutes
                      })
                    }
                    value={settings.autoCollapseInactiveGroupsMinutes}
                  >
                    {autoInactiveMinuteChoices.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes === 0 ? t.never : `${minutes} ${t.minutesShort}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="tm-panel-muted p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <RiMoonLine size={14} />
                    <h3 className="text-sm font-semibold">{t.autoSleepInactiveTabs}</h3>
                  </div>
                  <p className="tm-subtle">{t.autoSleepInactiveTabsSub}</p>
                  <select
                    aria-label={t.autoSleepInactiveTabs}
                    className="tm-select tm-settings-select"
                    onChange={(event) =>
                      void save({
                        autoSleepInactiveTabsMinutes: Number(
                          event.target.value
                        ) as AutoSleepInactiveTabsMinutes
                      })
                    }
                    value={settings.autoSleepInactiveTabsMinutes}
                  >
                    {autoInactiveMinuteChoices.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes === 0 ? t.never : `${minutes} ${t.minutesShort}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="tm-panel-muted p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <RiFileCopyLine size={14} />
                    <h3 className="text-sm font-semibold">{t.autoDeduplicateTabs}</h3>
                  </div>
                  <p className="tm-subtle">{t.autoDeduplicateTabsSub}</p>
                  <button
                    aria-pressed={settings.autoDeduplicateTabs}
                    className={settings.autoDeduplicateTabs ? 'tm-button-primary' : 'tm-button'}
                    disabled={busy}
                    onClick={() => void save({ autoDeduplicateTabs: !settings.autoDeduplicateTabs })}
                    type="button"
                  >
                    {settings.autoDeduplicateTabs ? t.enabled : t.disabled}
                  </button>
                  {settings.autoDeduplicateTabs ? (
                    <>
                      <select
                        aria-label={t.behavior}
                        className="tm-select tm-settings-select"
                        disabled={busy}
                        onChange={(event) =>
                          void save({
                            autoDeduplicationScope: event.target.value as typeof settings.autoDeduplicationScope
                          })
                        }
                        value={settings.autoDeduplicationScope}
                      >
                        <option value="global-except-listed">
                          {t.autoDeduplicationModeGlobalExceptListed}
                        </option>
                        <option value="listed-only">{t.autoDeduplicationModeListedOnly}</option>
                      </select>
                      <TagListEditor
                        ariaLabel={
                          settings.autoDeduplicationScope === 'listed-only'
                            ? t.autoDeduplicationIncludedSites
                            : t.autoDeduplicationExcludedSites
                        }
                        disabled={busy}
                        onChange={(entries) => {
                          void save({ autoDeduplicationSites: entries });
                        }}
                        placeholder={
                          settings.autoDeduplicationScope === 'listed-only'
                            ? t.autoDeduplicationIncludedSitesPlaceholder
                            : t.autoDeduplicationExcludedSitesPlaceholder
                        }
                        removeLabel={t.removeCondition}
                        value={settings.autoDeduplicationSites}
                      />
                    </>
                  ) : null}
                </div>
              </div>

              <div className="tm-panel-muted p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <RiGlobalLine size={14} />
                    <h3 className="text-sm font-semibold">{t.autoCleanupWhitelist}</h3>
                  </div>
                  <p className="tm-subtle">{t.autoCleanupWhitelistSub}</p>
                  <TagListEditor
                    ariaLabel={t.autoCleanupWhitelist}
                    disabled={busy}
                    onChange={(entries) => {
                      void save({ autoCleanupWhitelist: entries });
                    }}
                    placeholder={t.autoCleanupWhitelistPlaceholder}
                    removeLabel={t.removeCondition}
                    value={settings.autoCleanupWhitelist}
                  />
                </div>
              </div>

              <div className="tm-panel-muted p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <RiCloseCircleLine size={14} />
                    <h3 className="text-sm font-semibold">{t.autoCloseInactiveTabs}</h3>
                  </div>
                  <p className="tm-subtle">{t.autoCloseInactiveTabsSub}</p>
                  <select
                    aria-label={t.autoCloseInactiveTabs}
                    className="tm-select tm-settings-select"
                    onChange={(event) =>
                      void save({
                        autoCloseInactiveTabsMinutes: Number(
                          event.target.value
                        ) as AutoCloseInactiveTabsMinutes
                      })
                    }
                    value={settings.autoCloseInactiveTabsMinutes}
                  >
                    {autoInactiveMinuteChoices.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes === 0 ? t.never : `${minutes} ${t.minutesShort}`}
                      </option>
                    ))}
                  </select>
                  <button
                    aria-pressed={settings.autoCloseCondition === 'sleeping-only'}
                    className={settings.autoCloseCondition === 'sleeping-only' ? 'tm-button-primary' : 'tm-button'}
                    onClick={() =>
                      void save({
                        autoCloseCondition:
                          settings.autoCloseCondition === 'sleeping-only' ? 'deep-idle' : 'sleeping-only'
                      })
                    }
                    type="button"
                  >
                    {t.closeSleepingOnly}
                  </button>
                </div>
              </div>

            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
