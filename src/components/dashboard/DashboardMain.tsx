import type { DashboardListItem, DashboardMetric } from './types';

type DashboardMainProps = {
  emptyMessage: string;
  items: DashboardListItem[];
  metrics: DashboardMetric[];
  title: string;
};

export function DashboardMain({ emptyMessage, items, metrics, title }: DashboardMainProps) {
  return (
    <main className="tm-dashboard-main">
      <section className="tm-dashboard-section">
        <div className="tm-dashboard-section-head">
          <h1>{title}</h1>
        </div>

        <div className="tm-dashboard-metrics">
          {metrics.map((metric) => (
            <article className="tm-dashboard-metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              {metric.note ? <small>{metric.note}</small> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="tm-dashboard-section">
        <div className="tm-dashboard-list">
          {items.length ? (
            items.map((item) => (
              <article className="tm-dashboard-list-item" key={`${item.title}-${item.meta ?? item.subtitle ?? ''}`}>
                <strong>{item.title}</strong>
                {item.subtitle ? <p>{item.subtitle}</p> : null}
                {item.meta ? <small>{item.meta}</small> : null}
              </article>
            ))
          ) : (
            <div className="tm-dashboard-empty">{emptyMessage}</div>
          )}
        </div>
      </section>
    </main>
  );
}
