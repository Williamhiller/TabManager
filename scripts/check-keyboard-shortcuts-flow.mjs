import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

const backgroundService = read('src/lib/background-service.ts');
const backgroundEntrypoint = read('src/entrypoints/background.ts');
const contracts = read('src/lib/contracts.ts');
const dashboardConfig = read('src/components/dashboard/config.ts');
const dashboardHeader = read('src/components/dashboard/DashboardHeader.tsx');
const dashboardPage = read('src/components/DashboardPage.tsx');
const runtimeClient = read('src/lib/runtime-client.ts');
const wxtConfig = read('wxt.config.ts');
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
  backgroundEntrypoint,
  /chrome\.commands\.getAll\(\)/,
  'background should inspect active browser command shortcuts'
);
assert.match(
  backgroundEntrypoint,
  /tmShortcutSetupPromptedVersion/,
  'update migration should remember shortcut setup prompts by version'
);
assert.match(
  backgroundEntrypoint,
  /shortcutSetup=1/,
  'update migration should request a header shortcut setup prompt'
);
assert.doesNotMatch(
  backgroundEntrypoint,
  /view=shortcuts/,
  'update migration should not open the hidden shortcuts dashboard view'
);

assert.match(
  wxtConfig,
  /'toggle-command-palette':\s*\{\s*suggested_key:\s*\{\s*default:\s*'Ctrl\+Shift\+K',\s*mac:\s*'Command\+Shift\+K'/s,
  'Chrome command should declare its default shortcut with suggested_key'
);
assert.doesNotMatch(
  wxtConfig,
  /'toggle-command-palette':\s*\{[^}]*\bkey:/s,
  'Chrome commands manifest entries should not use the unsupported key field'
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
assert.match(
  backgroundService,
  /case 'tab-manager\/get-browser-command-shortcut'/,
  'background service should expose browser command shortcut status'
);
assert.match(
  contracts,
  /BrowserCommandShortcutState/,
  'contracts should define browser command shortcut state'
);
assert.match(
  contracts,
  /tab-manager\/get-browser-command-shortcut/,
  'contracts should include the browser command shortcut request'
);
assert.match(
  runtimeClient,
  /getBrowserCommandShortcutState/,
  'runtime client should expose browser command shortcut status'
);
assert.match(
  dashboardPage,
  /shortcutSetup.*=== '1'/s,
  'dashboard should read the shortcut setup prompt URL flag'
);
assert.match(
  dashboardPage,
  /getBrowserCommandShortcutState/,
  'dashboard should load browser shortcut status for the header'
);
assert.match(
  dashboardHeader,
  /browserShortcutState/,
  'dashboard header should render browser shortcut status'
);
assert.match(
  dashboardHeader,
  /chrome:\/\/extensions\/shortcuts/,
  'dashboard header should link users to Chrome extension shortcuts'
);
assert.doesNotMatch(
  dashboardConfig,
  /id: 'shortcuts'/,
  'dashboard should not expose the shortcuts page in navigation'
);
assert.doesNotMatch(
  dashboardPage,
  /KeyboardShortcutsPanel/,
  'dashboard should not render the hidden keyboard shortcuts page'
);
