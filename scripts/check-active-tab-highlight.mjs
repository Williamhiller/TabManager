import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const baseCss = fs.readFileSync(path.join(rootDir, 'src/assets/base.css'), 'utf8');
const dashboardCss = fs.readFileSync(path.join(rootDir, 'src/components/dashboard/dashboard.css'), 'utf8');
const tabRow = fs.readFileSync(path.join(rootDir, 'src/components/SortableTabRow.tsx'), 'utf8');

assert.match(tabRow, /data-active=\{tab\.active\}/, 'tab rows must expose the active tab state');

for (const [name, css] of [
  ['base', baseCss],
  ['dashboard', dashboardCss]
]) {
  assert.match(
    css,
    /\.tm-tab-row\[data-active='true'\]\s+\.tm-tab-sequence\s*\{[^}]*color:\s*var\(--tm-primary-strong\)/s,
    `${name} active tab highlight should emphasize the row number`
  );
  assert.match(
    css,
    /\.tm-tab-row\[data-active='true'\]\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--tm-brand-subtle\)/s,
    `${name} active tab highlight should keep a subtle tinted background`
  );
  assert.doesNotMatch(
    css,
    /\.tm-tab-row\[data-active='true'\]::before/,
    `${name} active tab highlight should not add a left rail`
  );
  assert.doesNotMatch(
    css,
    /\.tm-tab-row::before\s*\{/,
    `${name} active tab highlight should not leave a global tab-row before rail`
  );
}
