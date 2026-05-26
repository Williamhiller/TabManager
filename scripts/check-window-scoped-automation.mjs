import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const rootDir = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(rootDir, 'src/lib/window-scope.ts');
const backgroundSourcePath = path.join(rootDir, 'src/lib/background-service.ts');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabmanager-window-scope-'));
const compiledPath = path.join(tempDir, 'window-scope.mjs');

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

const { filterSameWindowTabs, findSameWindowGroup } = await import(path.toNamespacedPath(compiledPath));

const groups = [
  { id: 1, windowId: 1, title: 'Social' },
  { id: 2, windowId: 2, title: 'Social' },
  { id: 3, windowId: 2, title: 'Work' }
];

assert.equal(findSameWindowGroup(groups, 2, (group) => group.title === 'Social')?.id, 2);
assert.equal(findSameWindowGroup(groups, 3, (group) => group.title === 'Social'), undefined);

const tabs = [
  { id: 1, windowId: 1 },
  { id: 2, windowId: 2 },
  { id: 3, windowId: 2 }
];

assert.deepEqual(filterSameWindowTabs(tabs, 2).map((tab) => tab.id), [2, 3]);

const backgroundSource = fs.readFileSync(backgroundSourcePath, 'utf8');
assert.match(
  backgroundSource,
  /findSameWindowGroup\(\s*effectiveGroups,/,
  'auto grouping should only reuse groups from the current window'
);
assert.match(
  backgroundSource,
  /findSameWindowGroup\(\s*groups,/,
  'auto grouping should only reuse configured-title groups from the current window'
);
assert.match(
  backgroundSource,
  /chrome\.tabs\.query\(\{\s*windowId:\s*tab\.windowId\s*\}\)/,
  'auto deduplication should only inspect tabs in the current window'
);
assert.doesNotMatch(
  backgroundSource,
  /target\.windowId\s*!==\s*tab\.windowId/,
  'auto deduplication should not focus or switch to another window'
);

fs.rmSync(tempDir, { recursive: true, force: true });
