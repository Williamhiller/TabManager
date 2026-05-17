import { RiArrowDownSLine, RiArrowRightUpLine, RiArticleLine, RiTimeLine } from '@remixicon/react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import type { HistoryTabSnapshot } from '../lib/contracts';
import { formatRelativeTime } from '../lib/format';
import type { Messages, ResolvedLocale } from '../lib/i18n';
import { IconButton } from './IconButton';
import { Tooltip } from './Tooltip';

export function HistoryTabsSection({
  historyTabs,
  defaultExpanded = true,
  collapsible = true,
  locale,
  t,
  onOpenDetail,
  onOpenTab
}: {
  historyTabs: HistoryTabSnapshot[];
  defaultExpanded?: boolean;
  collapsible?: boolean;
  locale: ResolvedLocale;
  t: Messages;
  onOpenDetail: (historyTab: HistoryTabSnapshot) => void;
  onOpenTab: (historyTab: HistoryTabSnapshot) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentVisible = collapsible ? expanded : true;

  return (
    <section className="tm-section-block tm-history-section">
      <button
        className="tm-group-header tm-history-header"
        data-active={contentVisible}
        onClick={() => {
          if (collapsible) setExpanded((current) => !current);
        }}
        type="button"
      >
        <div className="tm-group-title">
          <RiTimeLine size={14} />
          <strong>{t.historyTabs}</strong>
        </div>
        <div className="tm-history-header-meta">
          <span className="tm-subtle">{`${historyTabs.length}`}</span>
          {collapsible ? (
            <span className="tm-group-toggle tm-history-toggle" aria-hidden="true">
              <RiArrowDownSLine size={16} style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
            </span>
          ) : null}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {contentVisible ? (
          <motion.div
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className="tm-section-children tm-section-children-root">
              {historyTabs.map((historyTab) => (
                <div className="tm-history-tab-row" key={historyTab.id}>
                  <button className="tm-history-tab-main" onClick={() => onOpenDetail(historyTab)} type="button">
                    <div className="tm-tab-leading">
                      <div className="tm-tab-sequence tm-history-badge">
                        <RiTimeLine size={12} />
                      </div>
                    </div>
                    {historyTab.favIconUrl ? (
                      <img alt="" className="tm-favicon tm-favicon-small" src={historyTab.favIconUrl} />
                    ) : (
                      <div className="tm-favicon tm-favicon-small">
                        {(historyTab.hostname || historyTab.title).slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <div className="tm-tab-main">
                      <div className="tm-tab-line">
                        <strong className="tm-tab-title">{historyTab.title}</strong>
                      </div>
                      <div className="tm-tab-subline">
                        <span className="tm-tab-subline-primary">{historyTab.hostname || historyTab.url}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatRelativeTime(historyTab.closedAt, locale)}</span>
                      </div>
                    </div>
                  </button>

                  <div className="tm-history-row-actions-overlay" data-tab-action-root="true">
                    <div className="tm-row-actions">
                      <Tooltip content={t.details}>
                        <IconButton
                          icon={RiArticleLine}
                          label={t.details}
                          nativeTitle={false}
                          onClick={() => onOpenDetail(historyTab)}
                        />
                      </Tooltip>
                      <Tooltip content={t.reopenHistoryTab}>
                        <IconButton
                          icon={RiArrowRightUpLine}
                          label={t.reopenHistoryTab}
                          nativeTitle={false}
                          onClick={() => onOpenTab(historyTab)}
                        />
                      </Tooltip>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
