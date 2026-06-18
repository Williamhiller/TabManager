import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

const backgroundService = read('src/lib/background-service.ts');
const runtimeClient = read('src/lib/runtime-client.ts');
const backgroundEntrypoint = read('src/entrypoints/background.ts');
const shortcutsProviderPath = path.join(
  rootDir,
  'src/components/keyboard-shortcuts/KeyboardShortcutsProvider.tsx'
);
const dashboardEntrypoint = read('src/entrypoints/dashboard/main.tsx');
const sidepanelEntrypoint = read('src/entrypoints/sidepanel/main.tsx');
const popupEntrypoint = read('src/entrypoints/popup/main.tsx');

assert.equal(
  fs.existsSync(shortcutsProviderPath),
  true,
  'extension UI entries should share a keyboard shortcuts provider'
);

const shortcutsProvider = fs.existsSync(shortcutsProviderPath)
  ? read('src/components/keyboard-shortcuts/KeyboardShortcutsProvider.tsx')
  : '';

assert.match(
  shortcutsProvider,
  /<TabSwitcher\b/,
  'shortcuts provider should render the tab switcher'
);
assert.match(
  shortcutsProvider,
  /tmToggleTabSwitcher/,
  'shortcuts provider should listen for session storage toggle signal'
);

for (const [name, source] of [
  ['dashboard', dashboardEntrypoint],
  ['sidepanel', sidepanelEntrypoint],
  ['popup', popupEntrypoint]
]) {
  assert.match(
    source,
    /KeyboardShortcutsProvider/,
    `${name} entrypoint should mount KeyboardShortcutsProvider`
  );
}

assert.match(
  backgroundEntrypoint,
  /chrome\.storage\.session\.set\(\{ tmToggleTabSwitcher/,
  'Chrome command should signal extension UIs via session storage'
);

assert.match(
  backgroundService,
  /case 'tab-manager\/get-tabs'/,
  'background service should handle get-tabs'
);
assert.match(
  backgroundService,
  /case 'tab-manager\/focus-tab'/,
  'background service should handle focus-tab'
);
