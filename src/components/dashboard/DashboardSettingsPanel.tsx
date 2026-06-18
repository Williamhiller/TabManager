import {
  RiDashboardLine,
  RiFolderReduceLine,
  RiGlobalLine,
  RiLayoutRightLine,
  RiMoonLine,
  RiSidebarUnfoldLine,
  RiWindowLine,
  RiRadarLine,
} from '@remixicon/react';

import type {
  AutoCollapseInactiveGroupsMinutes,
  AutoSleepInactiveTabsMinutes,
  LocaleMode,
  ManagerSettings,
  RedirectTrackingPermissionState
} from '../../lib/contracts';
import { DashboardDropdown } from './DashboardDropdown';
import type { DashboardLocaleOptionView } from './types';
import { SegmentedSwitch } from '../SegmentedSwitch';

type DashboardSettingsPanelProps = {
  autoCollapseChoices: readonly AutoCollapseInactiveGroupsMinutes[];
  autoSleepChoices: readonly AutoSleepInactiveTabsMinutes[];
  busy: boolean;
  languageOptions: DashboardLocaleOptionView[];
  onAutoCollapseChange: (minutes: AutoCollapseInactiveGroupsMinutes) => void;
  onAutoSleepChange: (minutes: AutoSleepInactiveTabsMinutes) => void;
  onLocaleChange: (locale: LocaleMode) => void;
  onRedirectTrackingToggle: () => void;
  onToggleBlockChromeAutoGroup: () => void;
  onToggleLaunchSurface: (surface: ManagerSettings['launchSurface']) => void;
  redirectTrackingBusy: boolean;
  redirectTrackingPermission: RedirectTrackingPermissionState | null;
  settings: ManagerSettings;
  t: Record<string, string>;
};

function getRedirectTrackingDescription(
  enabled: boolean,
  permission: RedirectTrackingPermissionState | null,
  t: Record<string, string>
) {
  if (!enabled) return t.redirectTrackingOff;
  if (permission?.granted) return t.redirectTrackingGranted;
  return t.redirectTrackingDenied;
}

export function DashboardSettingsPanel({
  autoCollapseChoices,
  autoSleepChoices,
  busy,
  languageOptions,
  onAutoCollapseChange,
  onAutoSleepChange,
  onLocaleChange,
  onRedirectTrackingToggle,
  onToggleBlockChromeAutoGroup,
  onToggleLaunchSurface,
  redirectTrackingBusy,
  redirectTrackingPermission,
  settings,
  t
}: DashboardSettingsPanelProps) {
  const redirectTrackingDescription = getRedirectTrackingDescription(
    settings.redirectTrackingEnabled,
    redirectTrackingPermission,
    t
  );

  return (
    <main className="tm-dashboard-main tm-dashboard-main-settings">
      <section className="tm-dashboard-settings">
        <header className="tm-dashboard-settings-header">
          <h1>{t.settings}</h1>
        </header>

        <div className="tm-dashboard-settings-list">
          <section className="tm-dashboard-setting-row">
            <div className="tm-dashboard-setting-copy">
              <span className="tm-dashboard-setting-icon">
                <RiSidebarUnfoldLine size={14} />
              </span>
              <div>
                <strong>{t.launchSurface}</strong>
                <p>{t.openWorkspace}</p>
              </div>
            </div>
            <div className="tm-dashboard-setting-control tm-dashboard-setting-surface-options">
              <SegmentedSwitch
                ariaLabel={t.launchSurface}
                className="tm-dashboard-setting-surface-switch"
                onChange={onToggleLaunchSurface}
                optionClassName="tm-dashboard-setting-surface-option"
                options={[
                  { value: 'sidepanel', label: t.sidePanel, disabled: busy, icon: RiLayoutRightLine },
                  { value: 'popup', label: t.popup, disabled: busy, icon: RiWindowLine },
                  { value: 'dashboard', label: t.dashboard, disabled: busy, icon: RiDashboardLine }
                ]}
                value={settings.launchSurface}
              />
            </div>
          </section>

          <section className="tm-dashboard-setting-row">
            <div className="tm-dashboard-setting-copy">
              <span className="tm-dashboard-setting-icon">
                <RiWindowLine size={14} />
              </span>
              <div>
                <strong>{t.blockChromeAutoGroup}</strong>
                <p>{t.blockChromeAutoGroupSub}</p>
              </div>
            </div>
            <div className="tm-dashboard-setting-control">
              <button
                aria-pressed={settings.blockChromeAutoGroup}
                className="tm-dashboard-switch"
                data-active={settings.blockChromeAutoGroup}
                disabled={busy}
                onClick={onToggleBlockChromeAutoGroup}
                type="button"
              >
                <span className="tm-dashboard-switch-track">
                  <span className="tm-dashboard-switch-thumb" />
                </span>
                <span className="tm-dashboard-switch-label">
                  {settings.blockChromeAutoGroup ? t.enabled : t.disabled}
                </span>
              </button>
            </div>
          </section>

          <section className="tm-dashboard-setting-row">
            <div className="tm-dashboard-setting-copy">
              <span className="tm-dashboard-setting-icon">
                <RiRadarLine size={14} />
              </span>
              <div>
                <strong>{t.redirectTracking}</strong>
                <p>{redirectTrackingDescription}</p>
              </div>
            </div>
            <div className="tm-dashboard-setting-control">
              <button
                aria-pressed={settings.redirectTrackingEnabled}
                className="tm-dashboard-switch"
                data-active={settings.redirectTrackingEnabled}
                disabled={busy || redirectTrackingBusy}
                onClick={onRedirectTrackingToggle}
                type="button"
              >
                <span className="tm-dashboard-switch-track">
                  <span className="tm-dashboard-switch-thumb" />
                </span>
                <span className="tm-dashboard-switch-label">
                  {settings.redirectTrackingEnabled ? t.enabled : t.disabled}
                </span>
              </button>
            </div>
          </section>

          <section className="tm-dashboard-setting-row">
            <div className="tm-dashboard-setting-copy">
              <span className="tm-dashboard-setting-icon">
                <RiFolderReduceLine size={14} />
              </span>
              <div>
                <strong>{t.autoCollapseInactiveGroups}</strong>
                <p>{t.autoCollapseInactiveGroupsSub}</p>
              </div>
            </div>
            <div className="tm-dashboard-setting-control">
              <DashboardDropdown
                ariaLabel={t.autoCollapseInactiveGroups}
                className="tm-dashboard-language tm-dashboard-setting-dropdown"
                onChange={(value) => onAutoCollapseChange(Number(value) as AutoCollapseInactiveGroupsMinutes)}
                options={autoCollapseChoices.map((minutes) => ({
                  label: minutes === 0 ? t.never : `${minutes} ${t.minutesShort}`,
                  value: String(minutes)
                }))}
                value={String(settings.autoCollapseInactiveGroupsMinutes)}
              />
            </div>
          </section>

          <section className="tm-dashboard-setting-row">
            <div className="tm-dashboard-setting-copy">
              <span className="tm-dashboard-setting-icon">
                <RiMoonLine size={14} />
              </span>
              <div>
                <strong>{t.autoSleepInactiveTabs}</strong>
                <p>{t.autoSleepInactiveTabsSub}</p>
              </div>
            </div>
            <div className="tm-dashboard-setting-control">
              <DashboardDropdown
                ariaLabel={t.autoSleepInactiveTabs}
                className="tm-dashboard-language tm-dashboard-setting-dropdown"
                onChange={(value) => onAutoSleepChange(Number(value) as AutoSleepInactiveTabsMinutes)}
                options={autoSleepChoices.map((minutes) => ({
                  label: minutes === 0 ? t.never : `${minutes} ${t.minutesShort}`,
                  value: String(minutes)
                }))}
                value={String(settings.autoSleepInactiveTabsMinutes)}
              />
            </div>
          </section>

          <section className="tm-dashboard-setting-row">
            <div className="tm-dashboard-setting-copy">
              <span className="tm-dashboard-setting-icon">
                <RiGlobalLine size={14} />
              </span>
              <div>
                <strong>{t.language}</strong>
                <p>{t.interfacePreferencesSub}</p>
              </div>
            </div>
            <div className="tm-dashboard-setting-control">
              <DashboardDropdown
                ariaLabel={t.language}
                className="tm-dashboard-language tm-dashboard-setting-dropdown"
                onChange={(value) => onLocaleChange(value as LocaleMode)}
                options={languageOptions.map((option) => ({ label: option.label, value: option.value }))}
                value={settings.locale}
              />
            </div>
          </section>

        </div>
      </section>
    </main>
  );
}
