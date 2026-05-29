import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const componentPath = path.join(rootDir, 'src/components/TabDetailModal.tsx');
const cssPath = path.join(rootDir, 'src/assets/base.css');

const componentSource = fs.readFileSync(componentPath, 'utf8');
const cssSource = fs.readFileSync(cssPath, 'utf8');

assert.match(
  componentSource,
  /const detailSubtitle = tab \? getTabDetailSubtitle\(tab\.url, tab\.hostname\) : t\.detailSummary;/,
  'tab detail subtitle should show the domain instead of the full URL'
);
assert.match(
  componentSource,
  /<span className="tm-detail-heading-url" title=\{tab\.url\}>\s*\{detailSubtitle\}\s*<\/span>/s,
  'tab detail subtitle should display the computed domain while preserving full URL as title'
);
assert.match(
  componentSource,
  /function getTabDetailSubtitle\(url: string, hostname: string\): string \{/,
  'tab detail subtitle should use a small helper for domain fallback'
);
assert.match(
  cssSource,
  /\.tm-detail-heading-title\s*\{[^}]*line-clamp-2/s,
  'tab detail title should be clamped to two lines'
);
assert.match(
  cssSource,
  /\.tm-detail-heading-url\s*\{[^}]*line-clamp-2/s,
  'tab detail subtitle should be clamped to two lines'
);
assert.doesNotMatch(
  cssSource,
  /\.tm-detail-heading-title\s*\{[^}]*letter-spacing:\s*-/s,
  'tab detail title should not use negative letter spacing'
);
