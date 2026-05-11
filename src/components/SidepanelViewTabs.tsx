import type { ReactNode } from 'react';

interface SidepanelViewTabsProps {
  activeView: 'tabs' | 'bookmarks';
  tabsCount: number;
  bookmarksCount: number;
  bookmarksLabel: string;
  meta?: string | null;
  bookmarksAction?: ReactNode;
  onSwitch: (nextView: 'tabs' | 'bookmarks') => void;
  tabsLabel: string;
}

export function SidepanelViewTabs({
  activeView,
  tabsCount,
  bookmarksCount,
  bookmarksLabel,
  meta,
  bookmarksAction,
  onSwitch,
  tabsLabel
}: SidepanelViewTabsProps) {
  return (
    <>
      <div className="tm-sidepanel-view-tabs-row">
        <div className="tm-sidepanel-view-tabs" role="tablist" aria-label="Views">
          <button
            className="tm-sidepanel-view-tab"
            data-active={activeView === 'tabs'}
            onClick={() => onSwitch('tabs')}
            role="tab"
            aria-selected={activeView === 'tabs'}
            type="button"
          >
            <span>{tabsLabel}</span>
            <span className="tm-sidepanel-view-tab-count">{tabsCount}</span>
          </button>
          <button
            className="tm-sidepanel-view-tab"
            data-active={activeView === 'bookmarks'}
            onClick={() => onSwitch('bookmarks')}
            role="tab"
            aria-selected={activeView === 'bookmarks'}
            type="button"
          >
            <span>{bookmarksLabel}</span>
            <span className="tm-sidepanel-view-tab-count">{bookmarksCount}</span>
          </button>
        </div>
        {bookmarksAction && activeView === 'bookmarks' ? (
          <div className="tm-sidepanel-view-tabs-actions">{bookmarksAction}</div>
        ) : null}
      </div>
      {meta ? <div className="tm-bookmark-search-meta">{meta}</div> : null}
    </>
  );
}
