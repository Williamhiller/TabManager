import { RiBookmarkLine, RiFolderLine, RiRefreshLine, RiSearchLine } from '@remixicon/react';
import { useMemo, useState } from 'react';

import { BookmarksManagerView } from '../BookmarksManagerView';
import { getErrorMessage } from '../../lib/format';
import type { BookmarkNodeSnapshot, BookmarkTreeSnapshot } from '../../lib/contracts';
import type { Messages, ResolvedLocale } from '../../lib/i18n';

type DashboardBookmarksPanelProps = {
  bookmarks: BookmarkTreeSnapshot | null;
  error: string | null;
  locale: ResolvedLocale;
  onRefreshBookmarks: () => Promise<void>;
  t: Messages;
};

const dashboardBookmarkCopy = {
  en: {
    refresh: 'Refresh bookmarks'
  },
  'zh-CN': {
    refresh: '刷新书签'
  },
  ja: {
    refresh: 'ブックマークを更新'
  },
  fr: {
    refresh: 'Actualiser les favoris'
  },
  es: {
    refresh: 'Actualizar marcadores'
  },
  ar: {
    refresh: 'تحديث الإشارات'
  },
  ru: {
    refresh: 'Обновить закладки'
  },
  el: {
    refresh: 'Ανανέωση σελιδοδεικτών'
  },
  ko: {
    refresh: '북마크 새로고침'
  }
} as const;

function countMatchedBookmarks(nodes: BookmarkNodeSnapshot[], query: string): number {
  if (!query) {
    return nodes.reduce(
      (total, node) => total + (node.url ? 1 : 0) + countMatchedBookmarks(node.children, ''),
      0
    );
  }

  return nodes.reduce((total, node) => {
    const childrenCount = countMatchedBookmarks(node.children, query);
    const haystacks = [node.title, node.url ?? '', node.url ? getDomainLabel(node.url) : ''];
    const selfMatches = node.url != null && haystacks.some((value) => value.toLowerCase().includes(query));
    return total + childrenCount + (selfMatches ? 1 : 0);
  }, 0);
}

function getDomainLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function DashboardBookmarksPanel({
  bookmarks,
  error,
  locale,
  onRefreshBookmarks,
  t
}: DashboardBookmarksPanelProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const copy = dashboardBookmarkCopy[locale] ?? dashboardBookmarkCopy.en;
  const roots = bookmarks?.roots ?? [];
  const matchedCount = useMemo(
    () => countMatchedBookmarks(roots, normalizedQuery),
    [normalizedQuery, roots]
  );

  const handleRefresh = async () => {
    try {
      setStatus(t.sync);
      await onRefreshBookmarks();
      setStatus(t.refreshed);
      window.setTimeout(() => setStatus((current) => (current === t.refreshed ? null : current)), 1800);
    } catch (nextError) {
      setStatus(getErrorMessage(nextError));
    }
  };

  return (
    <main className="tm-dashboard-main tm-dashboard-main-bookmarks">
      <section className="tm-dashboard-bookmarks">
        <section className="tm-dashboard-bookmarks-toolbar">
          <label className="tm-dashboard-bookmarks-search">
            <RiSearchLine size={16} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              onInput={(event) => setQuery(event.currentTarget.value)}
              placeholder={t.searchPlaceholder}
              type="text"
              value={query}
            />
          </label>

          <div className="tm-dashboard-bookmarks-toolbar-actions">
            <span className="tm-dashboard-bookmarks-meta-pill">
              <RiFolderLine size={14} />
              {bookmarks?.totalFolders ?? 0}
            </span>
            <span className="tm-dashboard-bookmarks-meta-pill">
              <RiBookmarkLine size={14} />
              {matchedCount}
            </span>
            <button
              aria-label={copy.refresh}
              className="tm-dashboard-bookmarks-refresh"
              onClick={() => void handleRefresh()}
              title={copy.refresh}
              type="button"
            >
              <RiRefreshLine size={16} />
            </button>
          </div>
        </section>

        {status || error ? (
          <div className={`tm-dashboard-bookmarks-status${error ? ' tm-dashboard-bookmarks-status-error' : ''}`}>
            {error ?? status}
          </div>
        ) : null}

        <BookmarksManagerView
          bookmarks={roots}
          isSidepanel={false}
          locale={locale}
          query={normalizedQuery}
          refreshBookmarks={onRefreshBookmarks}
          surface="dashboard"
        />
      </section>
    </main>
  );
}
