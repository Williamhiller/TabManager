const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HTML = path.join(__dirname, 'assets/store/v2/screenshot-global-real.html');
const OUT = path.join(__dirname, 'assets/store/v2/exports');
const SS = path.join(__dirname, 'assets/screenshots');
const ICON = path.join(__dirname, 'src/assets/icons/icon-128.png');

const base = fs.readFileSync(HTML, 'utf-8')
  .replace(/src="[^"]*icon-128\.png"/g, `src="file://${ICON}"`)
  .replace(/'\.\.\/screenshots\//g, `'file://${SS}/`)
  .replace(/"\.\.\/screenshots\//g, `"file://${SS}/`);

const shots = [
  { name: 'tabs', pill: 'Chrome workspace', title: 'Manage tabs from <em>one dashboard.</em>', desc: 'Search, group, dedupe, and restore sessions without losing context.', foot: 'Dashboard', src: 'tabs.png', sw: false },
  { name: 'autogroup', pill: 'Automation rules', title: 'AutoGroup tabs <em>by rules.</em>', desc: 'Route tabs by site type, domain, URL, title, presets, and custom rules.', foot: 'AutoGroup rules', src: 'autoGroup.png', sw: false },
  { name: 'dedup', pill: 'Automatic cleanup', title: 'Remove duplicates <em>automatically.</em>', desc: 'Clean duplicate tabs and control where deduplication should apply.', foot: 'Duplicate cleanup', src: 'deduplicate.png', sw: false },
  { name: 'sidepanel', pill: 'Beside your browser', title: 'Manage tabs <em>while you work.</em>', desc: 'Keep TabFriday in reach with a focused side panel workspace.', foot: 'Side panel', src: 'sidepanel.png', sw: false },
  { name: 'switcher', pill: 'Keyboard workflow', title: 'Find any tab <em>instantly.</em>', desc: 'Search tabs and jump back to work without leaving the keyboard.', foot: 'Tab switcher', src: 'tab-switcher.png', sw: true },
];

for (const s of shots) {
  let html = base
    .replace("pill: 'Chrome workspace'", `pill: '${s.pill}'`)
    .replace("title: 'Manage tabs from <em>one dashboard.</em>'", `title: '${s.title}'`)
    .replace("desc: 'Search, group, dedupe, and restore sessions without losing context.'", `desc: '${s.desc}'`)
    .replace("foot: 'Dashboard'", `foot: '${s.foot}'`)
    .replace(`'file://${SS}/tabs.png'`, `'file://${SS}/${s.src}'`)
    .replace(`"file://${SS}/tabs.png"`, `"file://${SS}/${s.src}"`);

  if (s.sw) {
    html = html.replace(/key === 'switcher'/g, 'true');
  }

  const tmp = path.join(os.tmpdir(), `sg-${s.name}.html`);
  fs.writeFileSync(tmp, html);

  try {
    execSync(`"${CHROME}" --headless --disable-gpu --window-size=1280,800 --screenshot="${OUT}/global-real-${s.name}.png" "file://${tmp}"`, { timeout: 20000, stdio: 'pipe' });
    console.log(`✓ ${s.name}.png`);
  } catch (e) {
    console.error(`✗ ${s.name}: ${e.message}`);
  }

  fs.unlinkSync(tmp);
}
