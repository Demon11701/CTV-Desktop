'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

let electronApp = null;
try {
  const electronMod = require('electron');
  if (electronMod && typeof electronMod === 'object' && electronMod.app) {
    electronApp = electronMod.app;
  }
} catch {}

const MAX_STATE_BODY_BYTES = 256 * 1024; // 256 KB límite estricto para /__ctv_state
const MAX_WATCH_PROGRESS_ENTRIES = 60;
const MAX_SERVER_SCORES_ENTRIES = 80;

const ALLOWED_STATE_KEYS = new Set([
  'favMovies',
  'favSeries',
  'favTvSlugs',
  'watched',
  'userPrefs',
  'watchProgress',
  'serverScores',
  'dismissedUpdateTag',
  'updatedAt'
]);

const RESERVED_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype'
]);

const IGNORED_SERVER_HOST_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '127.0.0.1',
  'localhost',
  'about:blank'
]);

/**
 * Guarantees a stable %APPDATA%\CTV userData path on Windows Portable builds
 * so cache and user state never land in ephemeral NSIS/TEMP folders.
 */
function configureStableUserDataPath(appRef = electronApp) {
  try {
    if (process.platform === 'win32' && appRef && typeof appRef.setPath === 'function') {
      const appDataBase = process.env.APPDATA || appRef.getPath('appData');
      if (appDataBase) {
        const stableDir = path.join(appDataBase, 'CTV');
        fs.mkdirSync(stableDir, { recursive: true });
        appRef.setPath('userData', stableDir);
      }
    }
  } catch {}
}

function getPersistentStateFilePath(pathOrOpts, appRef = electronApp) {
  if (typeof pathOrOpts === 'string' && pathOrOpts.trim()) {
    return pathOrOpts.trim();
  }
  if (pathOrOpts && typeof pathOrOpts === 'object' && typeof pathOrOpts.stateFilePath === 'string' && pathOrOpts.stateFilePath.trim()) {
    return pathOrOpts.stateFilePath.trim();
  }
  if (appRef && typeof appRef.getPath === 'function') {
    return path.join(appRef.getPath('userData'), 'ctv-user-state.json');
  }
  return path.join(os.tmpdir(), 'ctv-user-state.json');
}

function normalizeArrayBySlug(arr) {
  if (!Array.isArray(arr)) return [];
  const map = new Map();
  for (const item of arr) {
    if (item && typeof item === 'object' && item.slug) {
      map.set(String(item.slug), item);
    }
  }
  return Array.from(map.values());
}

function normalizeStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  return Array.from(new Set(arr.map((x) => String(x || '').trim()).filter(Boolean)));
}

function clampInt(n, maxVal) {
  const v = Math.floor(Number(n) || 0);
  return Number.isFinite(v) ? Math.max(0, Math.min(maxVal, v)) : 0;
}

function normalizeServerScoresMap(rawMap) {
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return {};
  const entries = [];
  for (const [rawKey, val] of Object.entries(rawMap)) {
    const key = typeof rawKey === 'string' ? rawKey.trim().toLowerCase() : '';
    if (!key || key.length > 180 || IGNORED_SERVER_HOST_KEYS.has(key)) {
      continue;
    }
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    const updatedAt = Number(val.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) continue;
    entries.push([
      key,
      {
        ok: clampInt(val.ok, 100000),
        fail: clampInt(val.fail, 100000),
        timeouts: clampInt(val.timeouts, 100000),
        redirects: clampInt(val.redirects, 100000),
        avgMs: clampInt(val.avgMs, 600000),
        maxH: clampInt(val.maxH, 8640),
        consecFail: clampInt(val.consecFail, 1000),
        updatedAt
      }
    ]);
  }
  entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  const out = {};
  for (const [key, cleanVal] of entries.slice(0, MAX_SERVER_SCORES_ENTRIES)) {
    out[key] = cleanVal;
  }
  return out;
}

function normalizeWatchProgressMap(rawMap) {
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return {};
  const entries = [];
  for (const [rawKey, val] of Object.entries(rawMap)) {
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!key || key.length > 180 || RESERVED_KEYS.has(key)) {
      continue;
    }
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    if (typeof val.t !== 'number' || !Number.isFinite(val.t) || val.t < 5) continue;
    if (typeof val.d !== 'number' || !Number.isFinite(val.d) || val.d <= 0) continue;
    if (typeof val.updatedAt !== 'number' || !Number.isFinite(val.updatedAt) || val.updatedAt <= 0) continue;
    entries.push([
      key,
      {
        t: val.t,
        d: val.d,
        title: typeof val.title === 'string' ? val.title.slice(0, 160) : '',
        poster: typeof val.poster === 'string' ? val.poster.slice(0, 320) : '',
        type: val.type === 'serie' ? 'serie' : 'movie',
        slug: typeof val.slug === 'string' ? val.slug.slice(0, 140) : '',
        ep: typeof val.ep === 'string' ? val.ep.slice(0, 24) : '',
        updatedAt: val.updatedAt
      }
    ]);
  }
  entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  const out = {};
  for (const [key, cleanVal] of entries.slice(0, MAX_WATCH_PROGRESS_ENTRIES)) {
    out[key] = cleanVal;
  }
  return out;
}

function createDefaultState() {
  return {
    favMovies: [],
    favSeries: [],
    favTvSlugs: [],
    watched: [],
    userPrefs: {},
    watchProgress: {},
    serverScores: {},
    dismissedUpdateTag: '',
    updatedAt: 0
  };
}

function readPersistentState(pathOrOpts) {
  const defaultState = createDefaultState();
  const fsImpl = (pathOrOpts && typeof pathOrOpts === 'object' && pathOrOpts.fsModule) || fs;
  try {
    const filePath = getPersistentStateFilePath(pathOrOpts);
    if (!fsImpl.existsSync(filePath)) return defaultState;
    const raw = JSON.parse(fsImpl.readFileSync(filePath, 'utf-8'));
    if (!raw || typeof raw !== 'object') return defaultState;
    return {
      favMovies: normalizeArrayBySlug(raw.favMovies),
      favSeries: normalizeArrayBySlug(raw.favSeries),
      favTvSlugs: normalizeStringArray(raw.favTvSlugs),
      watched: normalizeStringArray(raw.watched),
      userPrefs: raw.userPrefs && typeof raw.userPrefs === 'object' && !Array.isArray(raw.userPrefs) ? raw.userPrefs : {},
      watchProgress: normalizeWatchProgressMap(raw.watchProgress),
      serverScores: normalizeServerScoresMap(raw.serverScores),
      dismissedUpdateTag: typeof raw.dismissedUpdateTag === 'string' ? raw.dismissedUpdateTag : '',
      updatedAt: Number(raw.updatedAt) || 0
    };
  } catch {
    return defaultState;
  }
}

function sleepSyncMs(ms) {
  try {
    if (typeof SharedArrayBuffer === 'function' && typeof Atomics === 'object') {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
      return;
    }
  } catch {}
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Brief non-blocking fallback when Atomics is unavailable
  }
}

function cleanupOrphanedStateTempFiles(pathOrOpts) {
  const fsImpl = (pathOrOpts && typeof pathOrOpts === 'object' && pathOrOpts.fsModule) || fs;
  try {
    const filePath = getPersistentStateFilePath(pathOrOpts);
    const dirPath = path.dirname(filePath);
    const baseName = path.basename(filePath);
    if (!fsImpl.existsSync(dirPath)) return;
    const entries = fsImpl.readdirSync(dirPath);
    for (const entry of entries) {
      if (entry.startsWith(baseName + '.') && entry.endsWith('.tmp')) {
        try {
          fsImpl.unlinkSync(path.join(dirPath, entry));
        } catch {}
      }
    }
  } catch {}
}

function isValidStatePatchObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  if (obj.watchProgress !== undefined && (!obj.watchProgress || typeof obj.watchProgress !== 'object' || Array.isArray(obj.watchProgress))) {
    return false;
  }
  if (obj.serverScores !== undefined && (!obj.serverScores || typeof obj.serverScores !== 'object' || Array.isArray(obj.serverScores))) {
    return false;
  }
  return Object.keys(obj).every((k) => ALLOWED_STATE_KEYS.has(k));
}

function mergeServerScoresByUpdatedAt(baseMap, incomingMap) {
  const cleanBase = normalizeServerScoresMap(baseMap);
  const cleanIncoming = normalizeServerScoresMap(incomingMap);
  const merged = { ...cleanBase };
  for (const [host, val] of Object.entries(cleanIncoming)) {
    if (!merged[host] || val.updatedAt >= merged[host].updatedAt) {
      merged[host] = val;
    }
  }
  return normalizeServerScoresMap(merged);
}

let atomicWriteSeq = 0;
let atomicWriteInProgress = false;
const pendingStatePatchQueue = [];

/**
 * Serialized atomic state writer with Windows AV/defender EPERM/EBUSY retry
 * and copyFile/direct-write fallback.
 */
function writePersistentStateAtomic(patch = {}, opts = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return readPersistentState(opts);
  }
  pendingStatePatchQueue.push({ patch, opts });
  if (atomicWriteInProgress) {
    return readPersistentState(opts);
  }
  atomicWriteInProgress = true;
  let lastSaved = null;
  let lastOpts = opts;
  try {
    while (pendingStatePatchQueue.length > 0) {
      const entry = pendingStatePatchQueue.shift();
      const curPatch = entry.patch;
      const curOpts = entry.opts || {};
      lastOpts = curOpts;
      const fsImpl = curOpts.fsModule || fs;
      const sleepFn = typeof curOpts.sleepFn === 'function' ? curOpts.sleepFn : sleepSyncMs;
      const filePath = getPersistentStateFilePath(curOpts);
      const current = (lastSaved && curOpts.stateFilePath === opts.stateFilePath) ? lastSaved : readPersistentState(curOpts);

      const next = {
        favMovies: Array.isArray(curPatch.favMovies) ? normalizeArrayBySlug(curPatch.favMovies) : current.favMovies,
        favSeries: Array.isArray(curPatch.favSeries) ? normalizeArrayBySlug(curPatch.favSeries) : current.favSeries,
        favTvSlugs: Array.isArray(curPatch.favTvSlugs) ? normalizeStringArray(curPatch.favTvSlugs) : current.favTvSlugs,
        watched: Array.isArray(curPatch.watched) ? normalizeStringArray(curPatch.watched) : current.watched,
        userPrefs:
          curPatch.userPrefs && typeof curPatch.userPrefs === 'object' && !Array.isArray(curPatch.userPrefs)
            ? { ...current.userPrefs, ...curPatch.userPrefs }
            : current.userPrefs,
        watchProgress:
          curPatch.watchProgress && typeof curPatch.watchProgress === 'object' && !Array.isArray(curPatch.watchProgress)
            ? normalizeWatchProgressMap(curPatch.watchProgress)
            : (current.watchProgress || {}),
        serverScores:
          curPatch.serverScores && typeof curPatch.serverScores === 'object' && !Array.isArray(curPatch.serverScores)
            ? mergeServerScoresByUpdatedAt(current.serverScores, curPatch.serverScores)
            : (current.serverScores || {}),
        dismissedUpdateTag:
          typeof curPatch.dismissedUpdateTag === 'string'
            ? curPatch.dismissedUpdateTag
            : current.dismissedUpdateTag,
        updatedAt: Date.now()
      };

      const dirPath = path.dirname(filePath);
      fsImpl.mkdirSync(dirPath, { recursive: true });
      const tmpPath = `${filePath}.${process.pid}.${++atomicWriteSeq}.tmp`;
      const serialized = JSON.stringify(next, null, 2);
      fsImpl.writeFileSync(tmpPath, serialized, 'utf-8');

      let renamed = false;
      for (let attempt = 1; attempt <= 3 && !renamed; attempt++) {
        try {
          fsImpl.renameSync(tmpPath, filePath);
          renamed = true;
        } catch (err) {
          const code = (err && err.code) || '';
          if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < 3) {
            sleepFn(15 * attempt);
          } else {
            break;
          }
        }
      }

      if (!renamed) {
        try {
          fsImpl.copyFileSync(tmpPath, filePath);
        } catch {
          try {
            fsImpl.writeFileSync(filePath, serialized, 'utf-8');
          } catch {}
        }
        try {
          if (fsImpl.existsSync(tmpPath)) fsImpl.unlinkSync(tmpPath);
        } catch {}
      }

      lastSaved = next;
    }
    return lastSaved || readPersistentState(lastOpts);
  } catch {
    return readPersistentState(lastOpts);
  } finally {
    atomicWriteInProgress = false;
    cleanupOrphanedStateTempFiles(lastOpts);
  }
}

function isLoopbackAddress(remoteAddress) {
  const addr = String(remoteAddress || '');
  return addr === '127.0.0.1' || addr === '::ffff:127.0.0.1' || addr === '::1';
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

/**
 * Handles GET/POST/OPTIONS on /__ctv_state with strict loopback, Origin/Referer/X-CTV-Local,
 * 256 KB limit, and schema validation.
 */
function handleStateEndpoint(req, res, opts = {}) {
  const activePort = Number(opts.activePort) || 45780;
  const expectedOrigin = `http://127.0.0.1:${activePort}`;
  const remoteAddr = req && req.socket ? req.socket.remoteAddress : '';
  const originHdr = String((req && req.headers && req.headers.origin) || '').trim();
  const refererHdr = String((req && req.headers && req.headers.referer) || '').trim();
  const localTokenHdr = String((req && req.headers && req.headers['x-ctv-local']) || '').trim();

  const originForbidden = Boolean(originHdr && originHdr !== expectedOrigin);
  const refererForbidden = Boolean(
    refererHdr && refererHdr !== expectedOrigin && !refererHdr.startsWith(expectedOrigin + '/')
  );
  const hasTrustedContext =
    originHdr === expectedOrigin ||
    refererHdr === expectedOrigin ||
    refererHdr.startsWith(expectedOrigin + '/') ||
    localTokenHdr === '1';

  if (!isLoopbackAddress(remoteAddr) || originForbidden || refererForbidden || !hasTrustedContext) {
    sendJson(res, 403, { ok: false, error: 'Forbidden: untrusted origin' });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': expectedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-CTV-Local',
      'Vary': 'Origin'
    });
    res.end();
    return;
  }

  const stateOpts = opts.stateFilePath ? { stateFilePath: opts.stateFilePath } : undefined;

  if (req.method === 'POST') {
    const contentLen = parseInt((req.headers && req.headers['content-length']) || '0', 10) || 0;
    if (contentLen > MAX_STATE_BODY_BYTES) {
      req.resume();
      sendJson(res, 413, { ok: false, error: 'Payload Too Large (max 256 KB)' });
      return;
    }
    const chunks = [];
    let bytes = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_STATE_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        sendJson(res, 413, { ok: false, error: 'Payload Too Large (max 256 KB)' });
        return;
      }
      let parsed = null;
      try {
        const bodyStr = Buffer.concat(chunks).toString('utf-8');
        parsed = JSON.parse(bodyStr || '{}');
      } catch {
        parsed = null;
      }
      if (!isValidStatePatchObject(parsed)) {
        sendJson(res, 400, { ok: false, error: 'Invalid state payload' });
        return;
      }
      const saved = writePersistentStateAtomic(parsed, stateOpts);
      sendJson(res, 200, { ok: true, state: saved }, { 'Access-Control-Allow-Origin': expectedOrigin });
    });
    return;
  }

  sendJson(
    res,
    200,
    { ok: true, state: readPersistentState(stateOpts) },
    { 'Access-Control-Allow-Origin': expectedOrigin }
  );
}

module.exports = {
  MAX_STATE_BODY_BYTES,
  MAX_WATCH_PROGRESS_ENTRIES,
  MAX_SERVER_SCORES_ENTRIES,
  ALLOWED_STATE_KEYS,
  configureStableUserDataPath,
  getPersistentStateFilePath,
  normalizeArrayBySlug,
  normalizeStringArray,
  normalizeServerScoresMap,
  normalizeWatchProgressMap,
  isValidStatePatchObject,
  mergeServerScoresByUpdatedAt,
  readPersistentState,
  writePersistentStateAtomic,
  cleanupOrphanedStateTempFiles,
  isLoopbackAddress,
  handleStateEndpoint
};
