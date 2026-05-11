import {
  RiArrowRightUpLine,
  RiGlobalLine,
  RiMoonLine,
  RiSidebarUnfoldLine,
  RiSunLine,
  RiTranslate2
} from '@remixicon/react';
import { useEffect, useState } from 'react';

import type { LocaleMode, ManagerSettings } from '../lib/contracts';
import { getErrorMessage } from '../lib/format';
import { getMessages } from '../lib/i18n';
import { openDashboardPage, openSidePanel } from '../lib/runtime-client';
import { defaultSettings, getSettings, updateSettings } from '../lib/settings';
import { applyTheme } from '../lib/theme';

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
              <button
                className="tm-nav-button"
                data-active={settings.theme === 'dark'}
                onClick={() => void save({ theme: 'dark' })}
                type="button"
              >
                <span className="flex items-center gap-3">
                  <RiMoonLine size={14} />
                  {t.dark}
                </span>
              </button>
              <button
                className="tm-nav-button"
                data-active={settings.theme === 'light'}
                onClick={() => void save({ theme: 'light' })}
                type="button"
              >
                <span className="flex items-center gap-3">
                  <RiSunLine size={14} />
                  {t.light}
                </span>
              </button>
            </div>

            <div className="tm-sidebar-section">
              <p className="tm-section-title">{t.language}</p>
              {(
                [
                  ['system', t.localeAuto],
                  ['en', t.localeEnglish],
                  ['zh-CN', t.localeChinese],
                  ['ja', t.localeJapanese],
                  ['fr', t.localeFrench],
                  ['es', t.localeSpanish],
                  ['ar', t.localeArabic]
                ] as Array<[LocaleMode, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  className="tm-nav-button"
                  data-active={settings.locale === value}
                  onClick={() => void save({ locale: value })}
                  type="button"
                >
                  <span className="flex items-center gap-3">
                    <RiTranslate2 size={14} />
                    {label}
                  </span>
                </button>
              ))}
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
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
