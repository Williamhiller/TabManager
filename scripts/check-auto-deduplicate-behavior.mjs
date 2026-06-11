import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const rootDir = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(rootDir, 'src/lib/auto-deduplicate.ts');
const backgroundSourcePath = path.join(rootDir, 'src/lib/background-service.ts');

assert.equal(
  fs.existsSync(sourcePath),
  true,
  'auto deduplication should have a tested decision planner'
);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabmanager-auto-deduplicate-'));
const compiledPath = path.join(tempDir, 'auto-deduplicate.mjs');

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

const { planAutoDeduplication } = await import(path.toNamespacedPath(compiledPath));

assert.deepEqual(
  planAutoDeduplication(
    { id: 3, active: true, pinned: false },
    [
      { id: 1, active: false, pinned: false, lastActivityAt: 100 },
      { id: 2, active: false, pinned: false, lastActivityAt: 200 }
    ]
  ),
  { kind: 'keepCurrent', closeTabIds: [1, 2] },
  'newly opened duplicate should stay active while older duplicates close'
);

assert.deepEqual(
  planAutoDeduplication(
    { id: 3, active: true, pinned: false },
    [
      { id: 1, active: false, pinned: false, lastActivityAt: 100 },
      { id: 2, active: false, pinned: false, lastActivityAt: 200 }
    ],
    'newest'
  ),
  { kind: 'keepCurrent', closeTabIds: [1, 2] },
  'newest strategy should keep the newly opened duplicate active'
);

assert.deepEqual(
  planAutoDeduplication(
    { id: 3, active: true, pinned: false },
    [
      { id: 1, active: false, pinned: false, lastActivityAt: 100 },
      { id: 2, active: false, pinned: false, lastActivityAt: 200 }
    ],
    'existing'
  ),
  { kind: 'keepExisting', targetTabId: 2, closeTabIds: [3, 1] },
  'existing strategy should focus the most recently used existing duplicate'
);

assert.deepEqual(
  planAutoDeduplication(
    { id: 3, active: true, pinned: false },
    [
      { id: 1, active: false, pinned: true, lastActivityAt: 100 },
      { id: 2, active: false, pinned: false, lastActivityAt: 200 }
    ],
    'newest'
  ),
  { kind: 'keepExisting', targetTabId: 1, closeTabIds: [3, 2] },
  'an existing pinned duplicate should be preserved and focused even with newest strategy'
);

assert.deepEqual(
  planAutoDeduplication(
    { id: 4, active: true, pinned: false },
    [
      { id: 1, active: false, pinned: true, lastActivityAt: 100 },
      { id: 2, active: false, pinned: true, lastActivityAt: 200 },
      { id: 3, active: false, pinned: false, lastActivityAt: 300 }
    ]
  ),
  { kind: 'keepExisting', targetTabId: 2, closeTabIds: [4, 3] },
  'all existing pinned duplicates should stay protected'
);

assert.deepEqual(
  planAutoDeduplication(
    { id: 3, active: true, pinned: true },
    [
      { id: 1, active: false, pinned: true, lastActivityAt: 100 },
      { id: 2, active: false, pinned: false, lastActivityAt: 200 }
    ]
  ),
  { kind: 'keepCurrent', closeTabIds: [2] },
  'a pinned current tab should not be closed automatically'
);

assert.deepEqual(
  planAutoDeduplication({ id: 3, active: true, pinned: false }, []),
  { kind: 'none' },
  'no duplicates should produce no action'
);

const backgroundSource = fs.readFileSync(backgroundSourcePath, 'utf8');
const onCreatedBody =
  backgroundSource.match(
    /chrome\.tabs\.onCreated\.addListener\(\(tab\) => \{(?<body>[\s\S]*?)^\s*\}\);/m
  )?.groups?.body ?? '';

assert.match(
  onCreatedBody,
  /autoDeduplicationPendingFromCreate\s*=\s*true/,
  'new tabs should remain pending for auto deduplication until their first trackable URL'
);
assert.match(
  onCreatedBody,
  /maybeAutoDeduplicateTab\(tab\)/,
  'auto deduplication should run for tabs that are created with an initial trackable URL'
);

const maybeAutoDeduplicateBody =
  backgroundSource.match(
    /async function maybeAutoDeduplicateTab\(tab: chrome\.tabs\.Tab\): Promise<boolean> \{(?<body>[\s\S]*?)^\}/m
  )?.groups?.body ?? '';

const pendingClearIndex = maybeAutoDeduplicateBody.indexOf(
  'state.autoDeduplicationPendingFromCreate = false'
);
const settingsGateIndex = maybeAutoDeduplicateBody.indexOf('if (!settings.autoDeduplicateTabs)');
const candidatesIndex = maybeAutoDeduplicateBody.indexOf('const candidates =');
assert.ok(
  pendingClearIndex > settingsGateIndex && pendingClearIndex > candidatesIndex,
  'auto deduplication should keep pending state until settings and duplicate candidates are confirmed'
);

const onUpdatedBody =
  backgroundSource.match(
    /chrome\.tabs\.onUpdated\.addListener\(\(_tabId, changeInfo, tab\) => \{(?<body>[\s\S]*?)^\s*\}\);/m
  )?.groups?.body ?? '';
assert.match(
  onUpdatedBody,
  /changeInfo\.url !== undefined \|\| changeInfo\.status === 'complete'/,
  'auto deduplication should retry when a newly opened tab finishes loading'
);
assert.doesNotMatch(
  backgroundSource,
  /await\s+chrome\.tabs\.update\(target\.id,\s*\{\s*active:\s*true\s*\}\);\s*await\s+chrome\.tabs\.remove\(tab\.id\)/s,
  'auto deduplication should not always jump to the old tab and close the current tab'
);
assert.match(
  backgroundSource,
  /planAutoDeduplication/,
  'background auto deduplication should use the tested decision planner'
);

fs.rmSync(tempDir, { recursive: true, force: true });
