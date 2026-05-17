import type { DashboardListItem } from './types';

type DashboardAsideProps = {
  emptyMessage: string;
  items: DashboardListItem[];
  title: string;
};

export function DashboardAside({ emptyMessage, items, title }: DashboardAsideProps) {
  return (
    <aside aria-label={title} className="tm-dashboard-aside">
      <section className="tm-dashboard-aside-section">
        <div className="tm-dashboard-section-head">
          <h2>{title}</h2>
        </div>

        <div className="tm-dashboard-list tm-dashboard-list-compact">
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
    </aside>
  );
}
