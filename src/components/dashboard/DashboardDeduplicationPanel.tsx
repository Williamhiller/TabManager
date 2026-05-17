import { RiGlobalLine, RiSparklingLine } from '@remixicon/react';

import { DashboardDropdown } from './DashboardDropdown';
import type { DashboardDeduplicationPanelProps } from './types';

export function DashboardDeduplicationPanel({
  busy,
  onDeduplicationScopeChange,
  onDeduplicationSitesChange,
  onToggleAutoDeduplicateTabs,
  settings,
  t
}: DashboardDeduplicationPanelProps) {
  const siteListTitle =
    settings.autoDeduplicationScope === 'listed-only'
      ? t.autoDeduplicationIncludedSites
      : t.autoDeduplicationExcludedSites;
  const siteListDescription =
    settings.autoDeduplicationScope === 'listed-only'
      ? t.autoDeduplicationIncludedSitesSub
      : t.autoDeduplicationExcludedSitesSub;
  const siteListPlaceholder =
    settings.autoDeduplicationScope === 'listed-only'
      ? t.autoDeduplicationIncludedSitesPlaceholder
      : t.autoDeduplicationExcludedSitesPlaceholder;

  return (
    <main className="tm-dashboard-main tm-dashboard-main-automation">
      <section className="tm-dashboard-automation">
        <div className="tm-dashboard-dedup-layout">
          <section className="tm-dashboard-dedup-card tm-dashboard-dedup-card-hero">
            <div className="tm-dashboard-dedup-card-head">
              <span className="tm-dashboard-setting-icon tm-dashboard-setting-icon-featured">
                <RiSparklingLine size={14} />
              </span>
              <div>
                <h2>
                  {t.autoDeduplicateTabs}
                  <span className="tm-dashboard-dedup-badge">{t.featuredCapability}</span>
                </h2>
                <p>{t.autoDeduplicateTabsSub}</p>
              </div>
            </div>

            <div className="tm-dashboard-dedup-card-body">
              <div className="tm-dashboard-dedup-actions">
                <button
                  aria-pressed={settings.autoDeduplicateTabs}
                  className="tm-dashboard-switch"
                  data-active={settings.autoDeduplicateTabs}
                  disabled={busy}
                  onClick={onToggleAutoDeduplicateTabs}
                  type="button"
                >
                  <span className="tm-dashboard-switch-track">
                    <span className="tm-dashboard-switch-thumb" />
                  </span>
                  <span className="tm-dashboard-switch-label">
                    {settings.autoDeduplicateTabs ? t.enabled : t.disabled}
                  </span>
                </button>
              </div>
            </div>
          </section>

          <section className="tm-dashboard-dedup-card">
            <div className="tm-dashboard-dedup-card-body tm-dashboard-dedup-card-body-stack">
              <section className="tm-dashboard-dedup-section">
                <div className="tm-dashboard-dedup-card-head">
                  <span className="tm-dashboard-setting-icon">
                    <RiGlobalLine size={14} />
                  </span>
                  <div>
                    <h3>{t.behavior}</h3>
                    <p>
                      {settings.autoDeduplicationScope === 'listed-only'
                        ? t.autoDeduplicationModeListedOnly
                        : t.autoDeduplicationModeGlobalExceptListed}
                    </p>
                  </div>
                </div>

                <div className="tm-dashboard-dedup-card-body">
                  <DashboardDropdown
                    ariaLabel={t.behavior}
                    className="tm-dashboard-language tm-dashboard-dedup-dropdown"
                    onChange={(value) =>
                      onDeduplicationScopeChange(value as typeof settings.autoDeduplicationScope)
                    }
                    options={[
                      {
                        label: t.autoDeduplicationModeGlobalExceptListed,
                        value: 'global-except-listed'
                      },
                      {
                        label: t.autoDeduplicationModeListedOnly,
                        value: 'listed-only'
                      }
                    ]}
                    value={settings.autoDeduplicationScope}
                  />
                </div>
              </section>

              <section className="tm-dashboard-dedup-section">
                <div className="tm-dashboard-dedup-card-head">
                  <span className="tm-dashboard-setting-icon">
                    <RiGlobalLine size={14} />
                  </span>
                  <div>
                    <h3>{siteListTitle}</h3>
                    <p>{siteListDescription}</p>
                  </div>
                </div>

                <div className="tm-dashboard-dedup-card-body">
                  <textarea
                    aria-label={siteListTitle}
                    className="tm-dashboard-automation-input tm-dashboard-automation-textarea tm-dashboard-setting-textarea"
                    defaultValue={settings.autoDeduplicationSites.join('\n')}
                    disabled={!settings.autoDeduplicateTabs}
                    key={`dedupe-sites-panel:${settings.autoDeduplicationSites.join('|')}:${settings.autoDeduplicationScope}`}
                    onBlur={(event) => {
                      const entries = event.target.value
                        .split('\n')
                        .map((entry) => entry.trim())
                        .filter(Boolean);
                      const normalized = entries.join('\n');
                      if (normalized !== event.target.value.trim()) {
                        event.target.value = normalized;
                      }
                      onDeduplicationSitesChange(entries);
                    }}
                    placeholder={siteListPlaceholder}
                  />
                </div>
              </section>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
