import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const rootDir = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(rootDir, 'src/lib/auto-group-defaults.ts');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabmanager-auto-groups-'));
const compiledPath = path.join(tempDir, 'auto-group-defaults.mjs');

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

const { matchDefaultAutoGroupPreset, matchesDefaultAutoGroupPresetById } = await import(
  path.toNamespacedPath(compiledPath)
);

const expectedPresetCases = [
  ['https://app.apifox.com/project/1', 'development'],
  ['https://x.com/will', 'social'],
  ['https://mobile.x.com/will', 'social'],
  ['https://v.qq.com/show', 'media'],
  ['https://y.qq.com/music', 'media'],
  ['https://docs.qq.com/doc/abc', 'office'],
  ['https://target.com/p/1', 'shopping'],
  ['https://targetprocess.com/work', null],
  ['https://retargeting.example.com', null],
  ['https://meet.google.com/abc-defg-hij', 'office'],
  ['https://meetup.com/events', null],
  ['https://bankofamerica.com/accounts', 'finance'],
  ['https://banker.example.com', null],
  ['https://news.company.com/story', 'news'],
  ['https://company.com/newsroom', null],
  ['https://leetcode.com/problems/two-sum', 'learning']
];

for (const [url, expected] of expectedPresetCases) {
  const actual = matchDefaultAutoGroupPreset({ url })?.id ?? null;
  assert.equal(actual, expected, `${url} should match ${expected ?? 'no preset'}, got ${actual ?? 'none'}`);
}

const explicitPresetCases = [
  ['https://app.apifox.com/project/1', 'social', false],
  ['https://app.apifox.com/project/1', 'development', true],
  ['https://mobile.x.com/will', 'social', true],
  ['https://targetprocess.com/work', 'shopping', false],
  ['https://meetup.com/events', 'office', false],
  ['https://banker.example.com', 'finance', false],
  ['https://docs.qq.com/doc/abc', 'social', false],
  ['https://docs.qq.com/doc/abc', 'office', true]
];

for (const [url, presetId, expected] of explicitPresetCases) {
  const actual = matchesDefaultAutoGroupPresetById({ url }, presetId);
  assert.equal(actual, expected, `${url} should ${expected ? '' : 'not '}match ${presetId}`);
}

fs.rmSync(tempDir, { recursive: true, force: true });
