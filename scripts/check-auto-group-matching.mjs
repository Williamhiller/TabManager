import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const rootDir = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(rootDir, 'src/lib/auto-group-matcher.ts');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabfriday-auto-group-matching-'));
const compiledPath = path.join(tempDir, 'auto-group-matcher.mjs');

const source = fs.readFileSync(sourcePath, 'utf8');
const testSource = source
  .replace(
    /import \{ matchesDefaultAutoGroupPresetById \} from '\.\/auto-group-defaults';/,
    'const matchesDefaultAutoGroupPresetById = () => false;'
  )
  .replace(
    /import \{ normalizeWebsitePattern \} from '\.\/shared-utils';/,
    "const normalizeWebsitePattern = (value) => value.trim().toLowerCase().replace(/^https?:\\/\\//, '').replace(/^www\\./, '').split('/')[0];"
  );
const compiled = ts.transpileModule(testSource, {
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

const { getAutoGroupConfigMatchStatus, matchesAutoGroupConfig } = await import(
  path.toNamespacedPath(compiledPath)
);

const config = {
  id: 'work',
  title: 'Work',
  color: 'blue',
  enabled: true,
  websites: ['google.com'],
  excludedWebsites: ['docs.google.com'],
  rules: []
};

assert.equal(
  getAutoGroupConfigMatchStatus({ hostname: 'docs.google.com', url: 'https://docs.google.com/a' }, config),
  'excluded',
  'an excluded subdomain should win over an included parent domain'
);
assert.equal(
  getAutoGroupConfigMatchStatus({ hostname: 'mail.google.com', url: 'https://mail.google.com/' }, config),
  'match',
  'included sites should continue to match subdomains'
);
assert.equal(
  getAutoGroupConfigMatchStatus({ hostname: 'mail.google.com', pinned: true }, config),
  'protected',
  'matching pinned tabs should remain protected'
);
assert.equal(
  matchesAutoGroupConfig({ hostname: 'docs.google.com' }, config),
  false,
  'excluded tabs must not pass the background grouping matcher'
);
assert.equal(
  matchesAutoGroupConfig({ hostname: 'mail.google.com', pinned: true }, config),
  true,
  'pinned tabs should remain configuration matches for non-mutation checks'
);

const backgroundSource = fs.readFileSync(path.join(rootDir, 'src/lib/background-service.ts'), 'utf8');
assert.match(
  backgroundSource,
  /import \{[\s\S]*?matchesAutoGroupConfig[\s\S]*?\} from '\.\/auto-group-matcher';/,
  'the background service should use the shared matcher'
);
assert.match(
  backgroundSource,
  /matchesAutoGroupConfig\(candidateTab, target\.config\)/,
  'new groups should only collect tabs that pass the same matcher'
);

fs.rmSync(tempDir, { recursive: true, force: true });
