import type { ReactNode } from 'react';
import { SegmentedSwitch } from './SegmentedSwitch';

interface SidepanelViewTabsProps {
  activeView: 'tabs' | 'sessions' | 'bookmarks';
  tabsCount: number;
  sessionsCount: number;
  bookmarksCount: number;
  bookmarksLabel: string;
  label: string;
  meta?: string | null;
  bookmarksAction?: ReactNode;
  onSwitch: (nextView: 'tabs' | 'sessions' | 'bookmarks') => void;
  sessionsLabel: string;
  tabsLabel: string;
}

export function SidepanelViewTabs({
  activeView,
  tabsCount,
  sessionsCount,
  bookmarksCount,
  bookmarksLabel,
  label,
  meta,
  bookmarksAction,
  onSwitch,
  sessionsLabel,
  tabsLabel
}: SidepanelViewTabsProps) {
  return (
    <>
      <div className="tm-sidepanel-view-tabs-row">
        <SegmentedSwitch
          ariaLabel={label}
          className="tm-sidepanel-view-tabs"
          onChange={onSwitch}
          optionClassName="tm-sidepanel-view-tab"
          options={[
            { value: 'tabs', label: tabsLabel, meta: tabsCount },
            { value: 'sessions', label: sessionsLabel, meta: sessionsCount },
            { value: 'bookmarks', label: bookmarksLabel, meta: bookmarksCount }
          ]}
          value={activeView}
        />
        {bookmarksAction && activeView === 'bookmarks' ? (
          <div className="tm-sidepanel-view-tabs-actions">{bookmarksAction}</div>
        ) : null}
      </div>
      {meta ? <div className="tm-bookmark-search-meta">{meta}</div> : null}
    </>
  );
}
