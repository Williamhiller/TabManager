import { RiRefreshLine, RiSearchLine } from '@remixicon/react';
import { useState } from 'react';

import { SessionsManagerView } from '../SessionsManagerView';
import { getErrorMessage } from '../../lib/format';

import type { DashboardSnapshotsPanelProps } from './types';

const dashboardSnapshotCopy = {
  en: {
    refresh: 'Refresh snapshots'
  },
  'zh-CN': {
    refresh: '刷新快照'
  },
  ja: {
    refresh: 'スナップショットを更新'
  },
  fr: {
    refresh: 'Actualiser les instantanés'
  },
  es: {
    refresh: 'Actualizar instantáneas'
  },
  ar: {
    refresh: 'تحديث اللقطات'
  },
  ru: {
    refresh: 'Обновить снимки'
  },
  el: {
    refresh: 'Ανανέωση στιγμιότυπων'
  },
  ko: {
    refresh: '스냅샷 새로고침'
  }
} as const;

export function DashboardSnapshotsPanel({
  autoSnapshotsEnabled,
  errorMessage,
  locale,
  onRefreshSessions,
  onToggleAutoSnapshots,
  openUrls,
  sessions,
  t
}: DashboardSnapshotsPanelProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const copy = dashboardSnapshotCopy[locale] ?? dashboardSnapshotCopy.en;

  const handleRefresh = async () => {
    try {
      setStatus(t.sync);
      await onRefreshSessions();
      setStatus(t.refreshed);
      window.setTimeout(() => setStatus((current) => (current === t.refreshed ? null : current)), 1800);
    } catch (nextError) {
      setStatus(getErrorMessage(nextError));
    }
  };

  return (
    <main className="tm-dashboard-main tm-dashboard-main-snapshots">
      <section className="tm-dashboard-snapshots tm-dashboard-snapshots-compact">
        <header className="tm-dashboard-settings-header tm-dashboard-settings-header-inline-switch tm-dashboard-snapshot-header">
          <div>
            <div className="tm-dashboard-settings-title-with-switch">
              <h1>{t.navSnapshots}</h1>
              <button
                aria-label={t.autoSnapshots}
                aria-pressed={autoSnapshotsEnabled}
                className="tm-dashboard-switch tm-dashboard-snapshot-auto-switch"
                data-active={autoSnapshotsEnabled}
                onClick={onToggleAutoSnapshots}
                type="button"
              >
                <span className="tm-dashboard-switch-track">
                  <span className="tm-dashboard-switch-thumb" />
                </span>
                <span className="tm-dashboard-switch-label">
                  {t.autoSnapshots} · {autoSnapshotsEnabled ? t.enabled : t.disabled}
                </span>
              </button>
            </div>
            <p>{t.autoSnapshotsSub}</p>
          </div>
        </header>

        <div className="tm-dashboard-snapshot-toolbar">
          <label className="tm-dashboard-snapshot-search">
            <RiSearchLine size={14} />
            <input
              className="tm-dashboard-automation-input tm-dashboard-snapshot-search-input"
              onChange={(event) => setQuery(event.target.value)}
              onInput={(event) => setQuery(event.currentTarget.value)}
              placeholder={t.searchPlaceholder}
              type="text"
              value={query}
            />
          </label>

          <button
            aria-label={copy.refresh}
            className="tm-dashboard-bookmarks-refresh tm-dashboard-snapshot-refresh"
            onClick={() => void handleRefresh()}
            title={copy.refresh}
            type="button"
          >
            <RiRefreshLine size={14} />
          </button>
        </div>

        <div className="tm-dashboard-snapshot-surface">
          <SessionsManagerView
            isSidepanel={false}
            locale={locale}
            mode="dashboard"
            openUrls={openUrls}
            query={query}
            refreshSessions={onRefreshSessions}
            sessions={sessions?.sessions ?? []}
          />
        </div>

        {status || errorMessage ? (
          <div className={`tm-dashboard-snapshot-status${errorMessage ? ' tm-dashboard-snapshot-status-error' : ''}`}>
            {errorMessage ?? status}
          </div>
        ) : null}
      </section>
    </main>
  );
}
