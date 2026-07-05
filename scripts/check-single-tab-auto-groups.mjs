import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const rootDir = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(rootDir, 'src/lib/auto-group-tab-policy.ts');
const backgroundSourcePath = path.join(rootDir, 'src/lib/background-service.ts');
const i18nSourcePath = path.join(rootDir, 'src/lib/i18n.ts');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabmanager-single-tab-auto-groups-'));
const compiledPath = path.join(tempDir, 'auto-group-tab-policy.mjs');

assert.equal(
  packageJson.scripts['check:single-tab-auto-groups'],
  'node scripts/check-single-tab-auto-groups.mjs',
  'single-tab auto group regression check should be wired into package scripts'
);

const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    strict: true
  },
  fileName: sourcePath
}).outputText;

fs.writeFileSync(compiledPath, compiled, 'utf8');

const {
  AUTO_GROUP_MIN_TAB_COUNT,
  collectCreateableAutoGroupTabIds,
  shouldCleanupSingleTabAutoGroup
} = await import(path.toNamespacedPath(compiledPath));

assert.equal(AUTO_GROUP_MIN_TAB_COUNT, 2);

const tabs = [
  { id: 1, windowId: 100, groupId: -1, pinned: false, hostname: 'amazon.com' },
  { id: 2, windowId: 100, groupId: -1, pinned: false, hostname: 'ebay.com' },
  { id: 3, windowId: 100, groupId: -1, pinned: true, hostname: 'target.com' },
  { id: 4, windowId: 100, groupId: 55, pinned: false, hostname: 'walmart.com' },
  { id: 5, windowId: 200, groupId: -1, pinned: false, hostname: 'etsy.com' },
  { id: 6, windowId: 100, groupId: -1, pinned: false, hostname: 'news.example' }
];

assert.deepEqual(
  collectCreateableAutoGroupTabIds(tabs[0], [tabs[0]], {
    matchesTab: (tab) => tab.hostname !== 'news.example'
  }),
  [],
  'a single matching tab should remain ungrouped'
);

assert.deepEqual(
  collectCreateableAutoGroupTabIds(tabs[0], tabs, {
    matchesTab: (tab) => tab.hostname !== 'news.example'
  }),
  [1, 2],
  'a new auto group should be created only from two or more eligible tabs in the same window'
);

assert.deepEqual(
  collectCreateableAutoGroupTabIds(tabs[0], tabs, {
    matchesTab: (tab) => tab.hostname !== 'news.example',
    isTabExempt: (tab) => tab.id === 2
  }),
  [],
  'exempt matching tabs should not count toward the minimum group size'
);

assert.equal(shouldCleanupSingleTabAutoGroup(0), false);
assert.equal(shouldCleanupSingleTabAutoGroup(1), true);
assert.equal(shouldCleanupSingleTabAutoGroup(2), false);

const backgroundSource = fs.readFileSync(backgroundSourcePath, 'utf8');
const i18nSource = fs.readFileSync(i18nSourcePath, 'utf8');
assert.match(
  backgroundSource,
  /collectCreateableAutoGroupTabIds/,
  'background auto grouping should use the shared single-tab creation policy'
);
assert.match(
  backgroundSource,
  /cleanupSingleTabAutoGroups/,
  'background service should clean auto groups that shrink to one tab'
);
assert.match(
  backgroundSource,
  /getBoundAutoGroupConfigId\(group\.id,\s*settings\)/,
  'single-tab cleanup should only affect groups bound to an auto group config'
);
assert.match(
  backgroundSource,
  /metadata\.autoGroupCreated/,
  'single-tab cleanup should only affect groups originally created by automatic grouping'
);
assert.match(
  backgroundSource,
  /autoGroupCreated:\s*true[\s\S]*autoGroupConfigId:\s*options\.autoGroupConfigId/,
  'new groups created by automatic grouping should be marked for single-tab cleanup'
);
assert.match(
  backgroundSource,
  /chrome\.tabs\.onRemoved\.addListener\([\s\S]*?cleanupSingleTabAutoGroups/,
  'closing a tab should trigger single-tab auto group cleanup'
);
assert.match(
  i18nSource,
  /manageGroupsRulesSub: 'Tabs that match these rules[\s\S]*?at least two matching tabs/,
  'English automation copy should explain the two-tab minimum'
);
assert.match(
  i18nSource,
  /manageGroupsRulesSub: '符合这些规则[\s\S]*?至少两个标签页/,
  'Chinese automation copy should explain the two-tab minimum'
);

fs.rmSync(tempDir, { recursive: true, force: true });
