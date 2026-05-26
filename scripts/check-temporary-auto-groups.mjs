import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const backgroundSource = fs.readFileSync(path.join(rootDir, 'src/lib/background-service.ts'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

assert.equal(
  packageJson.scripts['check:temporary-auto-groups'],
  'node scripts/check-temporary-auto-groups.mjs',
  'temporary auto group regression check should be wired into package scripts'
);

assert.match(
  backgroundSource,
  /async function cleanupRestoredAutoGroups\(\): Promise<void>/,
  'background service should expose a cleanup path for restored temporary auto groups'
);

assert.match(
  backgroundSource,
  /chrome\.runtime\.onStartup\.addListener\(/,
  'restored temporary auto groups should be cleaned during Chrome startup'
);

assert.match(
  backgroundSource,
  /chrome\.tabs\.ungroup\(nonEmptyTabIds\)/,
  'cleanup should remove matching restored auto groups from the browser tab strip'
);

assert.match(
  backgroundSource,
  /matchesAutoGroupConfig\(tab,\s*config\)/,
  'title fallback cleanup should only ungroup tabs that still match the auto group config'
);

assert.match(
  backgroundSource,
  /isDefaultAutoGroupPresetTitle\(preset,\s*group\.title\)/,
  'title fallback cleanup should only target default preset group titles'
);

assert.doesNotMatch(
  backgroundSource,
  /startAutoSessionSnapshots\(\);[\s\S]{0,360}?maybeAutoGroupTabs\(\)/,
  'background service startup should not auto group all restored tabs'
);
