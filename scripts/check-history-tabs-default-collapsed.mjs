import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const historyTabsSection = fs.readFileSync(path.join(rootDir, 'src/components/HistoryTabsSection.tsx'), 'utf8');
const overviewPage = fs.readFileSync(path.join(rootDir, 'src/components/OverviewPage.tsx'), 'utf8');

assert.match(
  historyTabsSection,
  /defaultExpanded\s*=\s*false/,
  'HistoryTabsSection should be collapsed by default when it is collapsible'
);

assert.match(
  historyTabsSection,
  /const\s+\[expanded,\s*setExpanded\]\s*=\s*useState\(defaultExpanded\)/,
  'HistoryTabsSection should initialize expansion from defaultExpanded'
);

assert.match(
  overviewPage,
  /dashboardTabsSubView\s*===\s*'history'[\s\S]*?<HistoryTabsSection[\s\S]*?collapsible=\{false\}/,
  'The dedicated dashboard history view should stay non-collapsible'
);
