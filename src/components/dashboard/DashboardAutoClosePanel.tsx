import { RiCloseCircleLine, RiGlobalLine } from '@remixicon/react';

import type { AutoCloseInactiveTabsMinutes, ManagerSettings } from '../../lib/contracts';
import { TagListEditor } from '../TagListEditor';
import { DashboardDropdown } from './DashboardDropdown';

interface DashboardAutoClosePanelProps {
  autoCloseChoices: readonly AutoCloseInactiveTabsMinutes[];
  busy: boolean;
  onAutoCloseChange: (minutes: AutoCloseInactiveTabsMinutes) => void;
  onAutoCloseDomainModeChange: (mode: ManagerSettings['autoCloseDomainMode']) => void;
  onAutoCleanupWhitelistChange: (entries: string[]) => void;
  onToggleAutoClose: () => void;
  settings: ManagerSettings;
  t: Record<string, string>;
}

export function DashboardAutoClosePanel({
  autoCloseChoices,
  busy,
  onAutoCloseChange,
  onAutoCloseDomainModeChange,
  onAutoCleanupWhitelistChange,
  onToggleAutoClose,
  settings,
  t
}: DashboardAutoClosePanelProps) {
  const enabled = settings.autoCloseInactiveTabsMinutes > 0;

  return (
    <main className="tm-dashboard-main tm-dashboard-main-automation">
      <section className="tm-dashboard-automation">
        <div className="tm-dashboard-dedup-layout">
          <section className="tm-dashboard-dedup-card tm-dashboard-dedup-card-hero">
            <div className="tm-dashboard-dedup-card-head">
              <span className="tm-dashboard-setting-icon tm-dashboard-setting-icon-featured">
                <RiCloseCircleLine size={14} />
              </span>
              <div>
                <h2>{t.autoCloseInactiveTabs}</h2>
                <p>{t.autoCloseInactiveTabsSub}</p>
              </div>
            </div>

            <div className="tm-dashboard-dedup-card-body">
              <div className="tm-dashboard-dedup-actions">
                <button
                  aria-pressed={enabled}
                  className="tm-dashboard-switch"
                  data-active={enabled}
                  disabled={busy}
                  onClick={onToggleAutoClose}
                  type="button"
                >
                  <span className="tm-dashboard-switch-track">
                    <span className="tm-dashboard-switch-thumb" />
                  </span>
                  <span className="tm-dashboard-switch-label">
                    {enabled ? t.enabled : t.disabled}
                  </span>
                </button>
              </div>
            </div>
          </section>

          {enabled ? (
            <section className="tm-dashboard-dedup-card">
              <div className="tm-dashboard-dedup-card-body tm-dashboard-dedup-card-body-stack">
                <section className="tm-dashboard-dedup-section">
                  <div className="tm-dashboard-dedup-card-head">
                    <span className="tm-dashboard-setting-icon">
                      <RiCloseCircleLine size={14} />
                    </span>
                    <div>
                      <h3>{t.autoCloseInactiveTabs}</h3>
                      <p>{t.autoCloseInactiveTabsSub}</p>
                    </div>
                  </div>

                  <div className="tm-dashboard-dedup-card-body">
                    <DashboardDropdown
                      ariaLabel={t.autoCloseInactiveTabs}
                      className="tm-dashboard-language tm-dashboard-dedup-dropdown"
                      onChange={(value) => onAutoCloseChange(Number(value) as AutoCloseInactiveTabsMinutes)}
                      options={autoCloseChoices.filter((m) => m > 0).map((minutes) => ({
                        label: `${minutes} ${t.minutesShort}`,
                        value: String(minutes)
                      }))}
                      value={String(settings.autoCloseInactiveTabsMinutes)}
                    />
                  </div>
                </section>

                <section className="tm-dashboard-dedup-section">
                  <div className="tm-dashboard-dedup-card-head">
                    <span className="tm-dashboard-setting-icon">
                      <RiGlobalLine size={14} />
                    </span>
                    <div>
                      <h3>{t.autoCloseDomainMode}</h3>
                      <p>{t.autoCloseDomainModeSub}</p>
                    </div>
                  </div>

                  <div className="tm-dashboard-dedup-card-body">
                    <DashboardDropdown
                      ariaLabel={t.autoCloseDomainMode}
                      className="tm-dashboard-language tm-dashboard-dedup-dropdown"
                      onChange={(value) =>
                        onAutoCloseDomainModeChange(value as ManagerSettings['autoCloseDomainMode'])
                      }
                      options={[
                        { label: t.autoCloseDomainModeExclude, value: 'exclude' },
                        { label: t.autoCloseDomainModeInclude, value: 'include' },
                        { label: t.autoCloseDomainModeAll, value: 'all' }
                      ]}
                      value={settings.autoCloseDomainMode}
                    />
                  </div>
                </section>

                {settings.autoCloseDomainMode !== 'all' ? (
                  <section className="tm-dashboard-dedup-section">
                    <div className="tm-dashboard-dedup-card-head">
                      <span className="tm-dashboard-setting-icon">
                        <RiGlobalLine size={14} />
                      </span>
                      <div>
                        <h3>{t.autoCleanupWhitelist}</h3>
                        <p>{t.autoCleanupWhitelistSub}</p>
                      </div>
                    </div>

                    <div className="tm-dashboard-dedup-card-body">
                      <TagListEditor
                        addLabel={t.addCondition}
                        ariaLabel={t.autoCleanupWhitelist}
                        disabled={busy}
                        layout="separated"
                        onChange={onAutoCleanupWhitelistChange}
                        placeholder={t.autoCleanupWhitelistPlaceholder}
                        removeLabel={t.removeCondition}
                        value={settings.autoCleanupWhitelist}
                      />
                    </div>
                  </section>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
