import { RiArticleLine, RiCloseLine, RiFileCopyLine, RiGlobalLine, RiTimeLine } from '@remixicon/react';
import { motion } from 'motion/react';
import { useMemo } from 'react';

import type { TabDetailSnapshot, TabHistoryEvent } from '../lib/contracts';
import { formatDuration, formatRelativeTime } from '../lib/format';
import type { Messages, ResolvedLocale } from '../lib/i18n';
import { Tooltip } from './Tooltip';

export function TabDetailModal({
  detail,
  loading,
  error,
  locale,
  t,
  onCopyUrl,
  onClose
}: {
  detail: TabDetailSnapshot | null;
  loading: boolean;
  error: string | null;
  locale: ResolvedLocale;
  t: Messages;
  onCopyUrl: (url: string) => void;
  onClose: () => void;
}) {
  const tab = detail?.tab ?? null;
  const timelineEvents = useMemo(
    () => getCompactTimelineEvents(detail?.history ?? []),
    [detail?.history]
  );
  const detailTitle = tab?.title ?? t.details;
  const detailSubtitle = tab ? getTabDetailSubtitle(tab.url, tab.hostname) : t.detailSummary;
  const detailChips = tab
    ? [tab.group?.title ?? t.ungrouped, tab.status, ...(tab.pinned ? [t.pin] : []), ...(tab.muted ? [t.mute] : [])]
    : [];
  const detailMetrics = tab
    ? [
        {
          label: t.openedLabel,
          value: formatRelativeTime(tab.telemetry.openedAt ?? tab.telemetry.observedAt, locale)
        },
        {
          label: t.lastActiveLabel,
          value: formatRelativeTime(tab.lastAccessed ?? tab.telemetry.lastActivatedAt, locale)
        },
        {
          label: t.activeTimeLabel,
          value: formatDuration(tab.telemetry.totalActiveMs)
        },
        {
          label: t.eventCountLabel,
          value: String(timelineEvents.length)
        }
      ]
    : [];
  const detailFrameTransition = {
    type: 'spring' as const,
    stiffness: 340,
    damping: 27,
    mass: 0.92
  };
  const detailShellTransition = {
    type: 'spring' as const,
    stiffness: 430,
    damping: 28,
    mass: 0.74
  };
  const detailPanelTransition = {
    type: 'spring' as const,
    stiffness: 480,
    damping: 30,
    mass: 0.8,
    delay: 0.02
  };

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="tm-modal-backdrop tm-detail-modal-backdrop"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <motion.div
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="tm-settings-modal-frame tm-detail-modal-frame"
        exit={{ opacity: 0, y: 28, scale: 0.98 }}
        initial={{ opacity: 0, y: 64, scale: 0.935 }}
        onClick={(event) => event.stopPropagation()}
        transition={detailFrameTransition}
      >
        <motion.div
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="tm-settings-modal-shell tm-detail-modal-shell"
          exit={{ opacity: 0, y: 16, scale: 0.985 }}
          initial={{ opacity: 0.72, y: 18, scale: 0.955 }}
          transition={detailShellTransition}
        />

        <motion.section
          aria-label={t.details}
          aria-modal="true"
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="tm-settings-modal tm-detail-modal"
          exit={{ opacity: 0, y: 10, scale: 0.995 }}
          initial={{ opacity: 0.9, y: 22, scale: 0.988 }}
          role="dialog"
          transition={detailPanelTransition}
        >
          <div className="tm-settings-modal-head tm-detail-modal-head">
            <div className="tm-detail-heading">
              <div className="tm-favicon tm-favicon-detail tm-detail-heading-favicon" aria-hidden="true">
                {tab ? (
                  tab.favIconUrl ? (
                    <img alt="" className="h-full w-full object-cover" src={tab.favIconUrl} />
                  ) : (
                    (tab.hostname || tab.title).slice(0, 1).toUpperCase()
                  )
                ) : (
                  <RiGlobalLine size={16} />
                )}
              </div>
              <div className="tm-settings-modal-title tm-detail-heading-copy">
                <h2 className="tm-detail-heading-title">{detailTitle}</h2>
                {tab?.url ? (
                  <div className="tm-detail-heading-link">
                    <span className="tm-detail-heading-url" title={tab.url}>
                      {detailSubtitle}
                    </span>
                    <Tooltip content={t.copyUrl}>
                      <button
                        aria-label={t.copyUrl}
                        className="tm-detail-copy-button"
                        onClick={() => onCopyUrl(tab.url)}
                        type="button"
                      >
                        <RiFileCopyLine size={12} />
                      </button>
                    </Tooltip>
                  </div>
                ) : (
                  <span className="tm-subtle">{t.detailSummary}</span>
                )}
              </div>
            </div>
            <button className="tm-icon-button" onClick={onClose} title={t.cancel} type="button">
              <RiCloseLine size={13} />
            </button>
          </div>

          <div className="tm-settings-modal-body tm-detail-modal-body tm-scrollbar">
            {loading ? (
              <div className="tm-empty">
                <RiTimeLine size={16} />
                <div>
                  <div className="font-medium">{t.sync}</div>
                </div>
              </div>
            ) : error ? (
              <div className="tm-empty tm-toast-error">
                <RiCloseLine size={16} />
                <div>{error}</div>
              </div>
            ) : !tab ? (
              <div className="tm-empty">
                <RiArticleLine size={16} />
                <div>{t.detailUnavailable}</div>
              </div>
            ) : (
              <>
                <section className="tm-panel-muted tm-detail-summary-card">
                  <div className="tm-detail-chips">
                    {detailChips.map((chip, index) => (
                      <span className="tm-chip" key={`${chip}-${index}`}>
                        {chip}
                      </span>
                    ))}
                  </div>
                  <div className="tm-detail-summary-inline">
                    {detailMetrics.map((metric) => (
                      <span className="tm-detail-summary-item" key={metric.label}>
                        <span className="tm-detail-summary-label">{metric.label}</span>
                        <strong className="tm-detail-summary-value">{metric.value}</strong>
                      </span>
                    ))}
                  </div>
                </section>

                <section className="tm-panel-muted tm-detail-timeline-panel">
                  <div className="tm-detail-section-head">
                    <strong>{t.detailTimeline}</strong>
                    <span className="tm-subtle">
                      {timelineEvents.length > 0 ? `${timelineEvents.length} ${t.eventCountLabel}` : t.detailEmptyHistory}
                    </span>
                  </div>

                  {timelineEvents.length > 0 ? (
                    <div className="tm-detail-timeline">
                      {timelineEvents.map((event) => (
                        <article className="tm-timeline-item" key={event.id}>
                          <div className="tm-timeline-rail">
                            <span className="tm-timeline-dot" />
                          </div>
                          <div className="tm-timeline-card">
                            <div className="tm-timeline-head">
                              <span className="tm-timeline-kind">
                                {getHistoryKindLabel(event.kind, t)}
                              </span>
                              <strong className="tm-timeline-title" title={event.title}>
                                {getTimelineEventTitle(event)}
                              </strong>
                              <span className="tm-timeline-time">{formatTimelineTime(event.at, locale)}</span>
                            </div>
                            <div className="tm-timeline-meta">
                              <span className="tm-timeline-url" title={event.url || event.hostname}>
                                {event.url || event.hostname}
                              </span>
                              {event.url ? (
                                <Tooltip content={t.copyUrl}>
                                  <button
                                    aria-label={t.copyUrl}
                                    className="tm-detail-copy-button"
                                    onClick={() => onCopyUrl(event.url)}
                                    type="button"
                                  >
                                    <RiFileCopyLine size={12} />
                                  </button>
                                </Tooltip>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="tm-empty">
                      <RiTimeLine size={16} />
                      <div>{t.detailEmptyHistory}</div>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </motion.section>
      </motion.div>
    </motion.div>
  );
}

function getTabDetailSubtitle(url: string, hostname: string): string {
  if (hostname) return hostname;

  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function formatTimelineTime(timestamp: number | null | undefined, locale: string): string {
  if (timestamp == null) return 'Unknown';

  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false
  }).format(timestamp);
}

function getHistoryKindLabel(kind: TabHistoryEvent['kind'], t: Messages): string {
  switch (kind) {
    case 'created':
      return t.historyCreated;
    case 'navigated':
      return t.historyNavigated;
    case 'redirected':
      return t.historyRedirected;
    case 'history-state':
      return t.historyStateChanged;
    case 'observed':
      return t.historyObserved;
    default:
      return kind;
  }
}

function getTimelineEventTitle(event: TabHistoryEvent): string {
  if (event.kind === 'redirected') {
    return event.title && event.title !== 'Navigation' ? event.title : 'Redirect';
  }

  return event.hostname || event.title || 'Navigation';
}

function getCompactTimelineEvents(history: TabHistoryEvent[]): TabHistoryEvent[] {
  const sortedHistory = [...history].sort((first, second) => first.at - second.at);
  const compactEvents: TabHistoryEvent[] = [];
  const trackedKinds = new Set<TabHistoryEvent['kind']>([
    'observed',
    'created',
    'navigated',
    'redirected',
    'history-state'
  ]);

  for (const event of sortedHistory) {
    if (!trackedKinds.has(event.kind)) continue;
    if (!event.url) continue;

    const lastEvent = compactEvents.at(-1);
    if (lastEvent?.url === event.url) continue;

    if (
      (event.kind === 'observed' || event.kind === 'created') &&
      compactEvents.some((item) => item.kind === 'observed' || item.kind === 'created')
    ) {
      continue;
    }

    compactEvents.push(event);
  }

  return compactEvents;
}
