import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const rootDir = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(rootDir, 'src/lib/i18n.ts');
const localeSourcePath = path.join(rootDir, 'src/lib/locale.ts');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabmanager-locale-'));
const compiledPath = path.join(tempDir, 'i18n.mjs');
const compiledLocalePath = path.join(tempDir, 'locale.mjs');

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
}).outputText.replace("from './locale'", "from './locale.mjs'");
const localeSource = fs.readFileSync(localeSourcePath, 'utf8');
const compiledLocale = ts.transpileModule(localeSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    strict: true
  },
  fileName: localeSourcePath
}).outputText;

fs.writeFileSync(compiledPath, compiled, 'utf8');
fs.writeFileSync(compiledLocalePath, compiledLocale, 'utf8');

globalThis.chrome = {
  i18n: {
    getUILanguage: () => 'zh-CN'
  }
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    language: 'en-US'
  }
});

const { getMessages, resolveLocale } = await import(path.toNamespacedPath(compiledPath));

assert.equal(resolveLocale('system'), 'zh-CN');
assert.equal(getMessages('system').localeAuto, '跟随浏览器');

fs.rmSync(tempDir, { recursive: true, force: true });
