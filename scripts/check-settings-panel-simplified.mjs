import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const settingsPanelPath = path.join(rootDir, 'src/components/dashboard/DashboardSettingsPanel.tsx');
const snapshotsPanelPath = path.join(rootDir, 'src/components/dashboard/DashboardSnapshotsPanel.tsx');
const dashboardPagePath = path.join(rootDir, 'src/components/DashboardPage.tsx');
const optionsPagePath = path.join(rootDir, 'src/components/OptionsPage.tsx');
const i18nPath = path.join(rootDir, 'src/lib/i18n.ts');

const settingsPanelSource = fs.readFileSync(settingsPanelPath, 'utf8');
const snapshotsPanelSource = fs.readFileSync(snapshotsPanelPath, 'utf8');
const dashboardPageSource = fs.readFileSync(dashboardPagePath, 'utf8');
const optionsPageSource = fs.readFileSync(optionsPagePath, 'utf8');
const i18nSource = fs.readFileSync(i18nPath, 'utf8');

for (const source of [settingsPanelSource, dashboardPageSource, i18nSource]) {
  assert.doesNotMatch(
    source,
    /sidepanelViews|sidepanelShowSnapshots|sidepanelShowBookmarks|onToggleSidepanelShow/,
    'settings panel should not expose sidepanel view visibility controls'
  );
}

assert.doesNotMatch(
  settingsPanelSource,
  /onToggleAutoGroup|settings\.autoGroupEnabled|autoGroupEnabledHint|autoGroupDisabledHint/,
  'settings panel should not expose the auto-group feature toggle'
);

for (const source of [settingsPanelSource, dashboardPageSource, optionsPageSource]) {
  assert.doesNotMatch(
    source,
    /showHistory|onToggleShowHistory/,
    'settings surfaces should not expose the show-history feature toggle'
  );
}

assert.doesNotMatch(
  i18nSource,
  /showHistory|showHistorySub|展示历史记录|Show history/,
  'removed show-history settings copy should not remain in i18n'
);

assert.doesNotMatch(
  settingsPanelSource,
  /autoSnapshotsEnabled|onToggleAutoSnapshots|autoSnapshotsSub/,
  'settings panel should not expose the auto-snapshot backup toggle'
);

assert.match(
  snapshotsPanelSource,
  /autoSnapshotsEnabled[\s\S]*onToggleAutoSnapshots|onToggleAutoSnapshots[\s\S]*autoSnapshotsEnabled/,
  'snapshots panel should expose the auto-snapshot backup toggle'
);
