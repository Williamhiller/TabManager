import type { ManagerSettings, OverviewSnapshot } from '../../lib/contracts';
import { OverviewPage } from '../OverviewPage';

type DashboardTabsPanelProps = {
  errorMessage: string | null;
  onRefreshOverview: () => Promise<void>;
  overview: OverviewSnapshot | null;
  settings: ManagerSettings;
};

export function DashboardTabsPanel({
  errorMessage,
  onRefreshOverview,
  overview,
  settings
}: DashboardTabsPanelProps) {
  return (
    <main className="tm-dashboard-main tm-dashboard-main-tabs">
      <section className="tm-dashboard-tabs-panel">
        <OverviewPage
          embedded
          errorMessage={errorMessage}
          mode="dashboard"
          onRefreshOverview={onRefreshOverview}
          overview={overview}
          settings={settings}
        />
      </section>
    </main>
  );
}
