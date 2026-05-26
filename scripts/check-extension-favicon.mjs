import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const rootDir = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(rootDir, 'src/lib/favicon.ts');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabmanager-favicon-'));
const compiledPath = path.join(tempDir, 'favicon.mjs');

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

const runtime = {
  id: 'idbfedgdiachhchjgcelgobamccikaog',
  getURL: (pathValue) => `chrome-extension://idbfedgdiachhchjgcelgobamccikaog/${pathValue}`
};
globalThis.chrome = { runtime };

const { resolveFavIconUrl } = await import(path.toNamespacedPath(compiledPath));

assert.equal(
  resolveFavIconUrl(null, 'chrome-extension://idbfedgdiachhchjgcelgobamccikaog/dashboard.html', null, runtime),
  'chrome-extension://idbfedgdiachhchjgcelgobamccikaog/icons/icon-32.png'
);
assert.equal(
  resolveFavIconUrl(null, 'https://example.com/path', null, runtime),
  'chrome-extension://idbfedgdiachhchjgcelgobamccikaog/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2Fpath&size=32'
);
assert.equal(
  resolveFavIconUrl(null, 'chrome-extension://otherextensionid/dashboard.html', null, runtime),
  null
);
assert.equal(
  resolveFavIconUrl('https://example.com/favicon.ico', 'chrome-extension://idbfedgdiachhchjgcelgobamccikaog/dashboard.html', null, runtime),
  'https://example.com/favicon.ico'
);

fs.rmSync(tempDir, { recursive: true, force: true });
