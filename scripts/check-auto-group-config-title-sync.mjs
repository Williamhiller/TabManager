import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const rootDir = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(rootDir, 'src/lib/auto-group-config-sync.ts');
const backgroundSourcePath = path.join(rootDir, 'src/lib/background-service.ts');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabmanager-auto-group-title-sync-'));
const compiledPath = path.join(tempDir, 'auto-group-config-sync.mjs');

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

const { updateAutoGroupConfigTitleFromGroup } = await import(path.toNamespacedPath(compiledPath));

const configs = [
  {
    id: 'preset:social',
    presetId: 'social',
    title: 'Social',
    color: 'pink',
    enabled: true,
    websites: [],
    rules: []
  },
  {
    id: 'custom:work',
    title: 'Work',
    color: 'blue',
    enabled: true,
    websites: ['linear.app'],
    rules: []
  }
];

const renamed = updateAutoGroupConfigTitleFromGroup(configs, 'preset:social', 'Feeds');
assert.ok(renamed, 'bound config should be renamed');
assert.equal(renamed[0].title, 'Feeds');
assert.equal(renamed[1], configs[1], 'unrelated configs should keep identity');

assert.equal(updateAutoGroupConfigTitleFromGroup(configs, null, 'Feeds'), null);
assert.equal(updateAutoGroupConfigTitleFromGroup(configs, 'missing', 'Feeds'), null);
assert.equal(updateAutoGroupConfigTitleFromGroup(configs, 'preset:social', 'Social'), null);
assert.equal(updateAutoGroupConfigTitleFromGroup(configs, 'preset:social', '  '), null);

const backgroundSource = fs.readFileSync(backgroundSourcePath, 'utf8');
const settingsSource = fs.readFileSync(path.join(rootDir, 'src/lib/settings.ts'), 'utf8');
assert.doesNotMatch(
  backgroundSource,
  /ensureAutoGroupConfigBindingForGroup/,
  'auto group title sync should not infer config bindings from plain group titles'
);
assert.match(
  backgroundSource,
  /getGroupMetadata\(group\.id\)\.autoGroupConfigId\s*===\s*matchingConfig\.id/,
  'auto grouping should reuse same-window groups that are already bound to the matching config'
);
assert.match(
  backgroundSource,
  /isDefaultAutoGroupPresetTitle\(preset,\s*config\.title\)/,
  'locale title sync should only translate preset groups while the bound config still uses a default preset title'
);
assert.match(
  backgroundSource,
  /observedGroupTitles\.set\(groupId,\s*options\.title\s*\?\?\s*''\)/,
  'newly created groups should seed the title cache before later rename detection'
);
assert.match(
  backgroundSource,
  /const\s+titleChanged\s*=/,
  'group rename sync should only run after detecting a title change'
);
assert.match(
  backgroundSource,
  /if\s*\(titleChanged\)\s*\{[\s\S]*?syncAutoGroupConfigTitleFromGroup\(group\)/,
  'non-title tab group updates should not write group titles back into auto group configs'
);
assert.match(
  backgroundSource,
  /if\s*\(boundConfig\)\s*return\s+boundConfig/,
  'learning from a bound default preset group should update that preset config instead of creating a duplicate custom group'
);
assert.match(
  backgroundSource,
  /isDefaultAutoGroupPresetTitle\(preset,\s*title\)/,
  'learning from an unbound group with a default preset title should resolve to the preset config'
);
assert.match(
  backgroundSource,
  /resolveSingleDefaultPresetIdForTabs\(tabs\)/,
  'learning from an unbound group whose tabs all match one default preset should not create a site-named custom group'
);
assert.match(
  backgroundSource,
  /tabs\.length\s*<\s*AUTO_GROUP_MIN_TAB_COUNT/,
  'single-tab groups should not be learned into auto-group configs'
);
assert.match(
  backgroundSource,
  /shouldPreservePresetStyleFromLearnedGroup/,
  'external site-named groups should not overwrite preset titles or colors when merged into a default preset'
);
assert.match(
  settingsSource,
  /foldDefaultTitleCustomAutoGroupConfigs\(next\)/,
  'stored duplicate custom groups with default preset titles should be folded back into their preset configs'
);

fs.rmSync(tempDir, { recursive: true, force: true });
