import type { DashboardNavItemView, DashboardViewId } from './types';

type DashboardSidebarProps = {
  activeView: DashboardViewId;
  items: DashboardNavItemView[];
  onViewSelect: (viewId: DashboardViewId) => void;
};

export function DashboardSidebar({ activeView, items, onViewSelect }: DashboardSidebarProps) {
  return (
    <aside className="tm-dashboard-sidebar">
      <nav className="tm-dashboard-nav" aria-label="Primary">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              className="tm-dashboard-nav-item"
              data-active={activeView === item.id}
              onClick={() => onViewSelect(item.id)}
              type="button"
            >
              <span className="tm-dashboard-nav-icon">
                <Icon size={15} />
              </span>
              <span className="tm-dashboard-nav-copy">
                <strong>{item.label}</strong>
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
