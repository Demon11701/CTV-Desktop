#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const MODULES_DIR = path.join(ROOT_DIR, 'src-modules');
const TEMPLATES_DIR = path.join(MODULES_DIR, 'templates');

const OTA_REV = 21;

function resolveAppVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
    if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
      return pkg.version.trim();
    }
  } catch {}
  return '1.6.2';
}

const APP_VERSION = resolveAppVersion();
const OTA_VERSION = `${APP_VERSION}-ota.${OTA_REV}`;

const MODULE_NAMES = [
  'icons',
  'scoring',
  'stealth',
  'quality-failover',
  'updater'
];

const UNICODE_EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u2B50\u25B6\u25C0\u2714\u2715\u26A1]/gu;

function extractBrowserModuleCode(moduleName, indentPrefix = '') {
  const filePath = path.join(MODULES_DIR, `${moduleName}.js`);
  let src = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');

  // Remove Node CommonJS exports block
  src = src.replace(/\n?\s*\/\* @ctv-node-exports-start \*\/[\s\S]*?\/\* @ctv-node-exports-end \*\//g, '');

  // Unwrap @ctv-browser-boot-start/end so zero references to CommonJS `exports` remain
  src = src.replace(
    /\/\* @ctv-browser-boot-start \*\/[\s\S]*?if\s*\(\s*typeof exports === 'undefined'[^)]*\)\s*\{\s*\n([\s\S]*?)\n\s*\}\s*\n?\s*\/\* @ctv-browser-boot-end \*\//g,
    '$1'
  );

  src = src.trim();
  if (!indentPrefix) return src;
  return src
    .split('\n')
    .map((line) => (line ? indentPrefix + line : ''))
    .join('\n');
}

function buildTargetBundle(templateName) {
  const tplPath = path.join(TEMPLATES_DIR, templateName);
  let output = fs.readFileSync(tplPath, 'utf-8').replace(/\r\n/g, '\n');

  for (const modName of MODULE_NAMES) {
    const markerRe = new RegExp(`^([ \\t]*)/\\* @CTV_MODULE:${modName} \\*/$`, 'gm');
    let matched = false;
    output = output.replace(markerRe, (_full, indent) => {
      matched = true;
      return extractBrowserModuleCode(modName, indent || '');
    });
    if (!matched) {
      throw new Error(`Missing @CTV_MODULE:${modName} marker in ${templateName}`);
    }
  }

  output = output
    .replace(/__CTV_OTA_VERSION__/g, OTA_VERSION)
    .replace(/__CTV_OTA_REV__/g, String(OTA_REV));

  if (!output.endsWith('\n')) output += '\n';
  return output;
}

function validateBundle(name, code, expectedKind) {
  const errors = [];

  if (/@CTV_MODULE:|__CTV_OTA_VERSION__|__CTV_OTA_REV__/.test(code)) {
    errors.push(`${name}: unresolved template placeholder detected`);
  }

  try {
    new vm.Script(code, { filename: name });
  } catch (err) {
    errors.push(`${name}: syntax error (${err.message})`);
  }

  if (/\brequire\s*\(/.test(code)) {
    errors.push(`${name}: contains require() call`);
  }
  if (/(?:^|\n)\s*(?:import|export)\s+/.test(code)) {
    errors.push(`${name}: contains ES import/export statement`);
  }
  if (/\bmodule\.exports\b|\btypeof exports\b/.test(code)) {
    errors.push(`${name}: contains CommonJS exports artifact`);
  }
  if (/setAttribute\s*\(\s*['"]sandbox['"]/i.test(code) || /<iframe[^>]*\bsandbox\b/i.test(code)) {
    errors.push(`${name}: contains forbidden iframe sandbox attribute`);
  }
  UNICODE_EMOJI_RE.lastIndex = 0;
  if (UNICODE_EMOJI_RE.test(code)) {
    errors.push(`${name}: contains raw Unicode emoji literal`);
  }

  if (!code.includes(`window.__ctvHlsHookVersion = ${OTA_REV};`)) {
    errors.push(`${name}: missing window.__ctvHlsHookVersion = ${OTA_REV};`);
  }
  if (!code.includes(`'${OTA_VERSION}'`)) {
    errors.push(`${name}: missing OTA version '${OTA_VERSION}'`);
  }
  if (expectedKind === 'ui' && !code.includes(`var BUILTIN_OTA_REV = ${OTA_REV};`)) {
    errors.push(`${name}: missing var BUILTIN_OTA_REV = ${OTA_REV};`);
  }
  if (expectedKind === 'ota' && !code.includes(`window.CTV_OTA_VERSION = '${OTA_VERSION}';`)) {
    errors.push(`${name}: missing window.CTV_OTA_VERSION = '${OTA_VERSION}';`);
  }

  return errors;
}

function syncOrCheck({ checkOnly = false } = {}) {
  const targets = [
    { kind: 'ui', fileName: 'ctv-ui.js', templateName: 'ui-template.js', outPath: path.join(SRC_DIR, 'ctv-ui.js') },
    { kind: 'ota', fileName: 'ctv-ota.js', templateName: 'ota-template.js', outPath: path.join(SRC_DIR, 'ctv-ota.js') }
  ];

  const allErrors = [];

  for (const t of targets) {
    const generated = buildTargetBundle(t.templateName);
    const validationErrors = validateBundle(t.fileName, generated, t.kind);
    if (validationErrors.length) {
      allErrors.push(...validationErrors);
      continue;
    }

    if (checkOnly) {
      if (!fs.existsSync(t.outPath)) {
        allErrors.push(`${t.fileName}: output file does not exist on disk`);
        continue;
      }
      const existing = fs.readFileSync(t.outPath, 'utf-8').replace(/\r\n/g, '\n');
      if (existing !== generated) {
        allErrors.push(`${t.fileName}: out of sync with src-modules/ (run npm run sync:ota)`);
      }
    } else {
      fs.writeFileSync(t.outPath, generated, 'utf-8');
    }
  }

  return {
    ok: allErrors.length === 0,
    appVersion: APP_VERSION,
    otaRev: OTA_REV,
    otaVersion: OTA_VERSION,
    errors: allErrors
  };
}

if (require.main === module) {
  const checkOnly = process.argv.includes('--check');
  const result = syncOrCheck({ checkOnly });
  if (!result.ok) {
    for (const err of result.errors) {
      console.error('[sync-web-ota] ERROR:', err);
    }
    process.exit(1);
  }
  const modeLabel = checkOnly ? 'VERIFIED' : 'GENERATED';
  console.log(`[sync-web-ota] ${modeLabel} src/ctv-ui.js & src/ctv-ota.js (${result.otaVersion}, rev ${result.otaRev})`);
}

module.exports = {
  APP_VERSION,
  OTA_REV,
  OTA_VERSION,
  MODULE_NAMES,
  extractBrowserModuleCode,
  buildTargetBundle,
  validateBundle,
  syncOrCheck
};
