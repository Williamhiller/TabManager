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
  }
} as const;

export function DashboardSnapshotsPanel({
  errorMessage,
  locale,
  onRefreshSessions,
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
