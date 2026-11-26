const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeResponseHeaders } = require('../electron/adblock.js');
const {
  isAgendaSportsUrl,
  resolveAgendaServerList,
  initQualityFailover
} = require('../src-modules/quality-failover.js');

function createMockElement(tagName, doc) {
  const listeners = new Map();
  const children = [];
  const classSet = new Set();
  const attrs = new Map();
  const el = {
    tagName: String(tagName || 'DIV').toUpperCase(),
    id: '',
    style: {},
    tabIndex: 0,
    textContent: '',
    _innerHTML: '',
    src: '',
    readyState: 0,
    duration: NaN,
    paused: true,
    ended: false,
    videoWidth: 0,
    videoHeight: 0,
    parentNode: null,
    isConnected: true,
    children,
    classList: {
      add: (...cls) => cls.forEach((c) => classSet.add(c)),
      remove: (...cls) => cls.forEach((c) => classSet.delete(c)),
      contains: (c) => classSet.has(c)
    },
    setAttribute: (k, v) => {
      if (k === 'id') el.id = String(v);
      attrs.set(String(k), String(v));
    },
    getAttribute: (k) => attrs.get(String(k)) || null,
    hasAttribute: (k) => attrs.has(String(k)),
    removeAttribute: (k) => {
      attrs.delete(String(k));
      if (k === 'src') el.src = '';
    },
    appendChild: (child) => {
      if (child) {
        child.parentNode = el;
        children.push(child);
        if (child.id) doc._byId.set(child.id, child);
      }
      return child;
    },
    insertBefore: (child, ref) => {
      if (!child) return child;
      child.parentNode = el;
      const idx = children.indexOf(ref);
      if (idx >= 0) children.splice(idx, 0, child);
      else children.push(child);
      if (child.id) doc._byId.set(child.id, child);
      return child;
    },
    remove: () => {
      if (el.id && doc._byId.get(el.id) === el) doc._byId.delete(el.id);
      if (el.parentNode) {
        const idx = el.parentNode.children.indexOf(el);
        if (idx >= 0) el.parentNode.children.splice(idx, 1);
        el.parentNode = null;
      }
    },
    addEventListener: (ev, fn) => {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev).add(fn);
    },
    removeEventListener: (ev, fn) => {
      if (listeners.has(ev)) listeners.get(ev).delete(fn);
    },
    dispatchEvent: (ev) => {
      const name = typeof ev === 'string' ? ev : ev.type;
      const set = listeners.get(name);
      if (set) {
        for (const fn of Array.from(set)) fn({ type: name });
      }
    },
    querySelector: (sel) => {
      const idM = sel.match(/^#([a-zA-Z0-9_-]+)$/);
      if (idM) {
        const match = children.find((c) => c.id === idM[1]) || doc._byId.get(idM[1]);
        return match || null;
      }
      const clsM = sel.match(/^\.([a-zA-Z0-9_-]+)$/);
      if (clsM) return children.find((c) => c.classList.contains(clsM[1])) || null;
      return null;
    },
    focus: () => {},
    pause: () => { el.paused = true; },
    click: () => {
      if (typeof el.onclick === 'function') el.onclick({ preventDefault() {}, stopPropagation() {} });
    },
    get innerHTML() { return el._innerHTML; },
    set innerHTML(val) {
      el._innerHTML = String(val || '');
      const ids = [...el._innerHTML.matchAll(/id=["']([^"']+)["']/g)].map((m) => m[1]);
      for (const cid of ids) {
        if (!doc._byId.has(cid)) {
          const btn = createMockElement('button', doc);
          btn.id = cid;
          btn.parentNode = el;
          children.push(btn);
          doc._byId.set(cid, btn);
        }
      }
    }
  };
  return el;
}

function createTestEnv() {
  const doc = {
    _byId: new Map(),
    body: null,
    activeElement: null,
    createElement: (tag) => createMockElement(tag, doc),
    getElementById: (id) => doc._byId.get(id) || null,
    querySelector: () => null
  };
  doc.body = createMockElement('body', doc);

  const modal = createMockElement('div', doc);
  modal.id = 'player-modal';
  modal.classList.add('hidden');
  doc.body.appendChild(modal);

  const bar = createMockElement('div', doc);
  bar.id = 'player-bar';
  modal.appendChild(bar);

  const pf = createMockElement('iframe', doc);
  pf.id = 'player-frame';
  pf.classList.add('hidden');
  modal.appendChild(pf);

  const pv = createMockElement('video', doc);
  pv.id = 'player-video';
  pv.classList.add('hidden');
  modal.appendChild(pv);

  const pFav = createMockElement('button', doc);
  pFav.id = 'player-fav';
  bar.appendChild(pFav);

  const win = {
    __ctvPlaySessionId: 0,
    __ctvAgendaEvents: [],
    ctvIcon: (name) => `<svg class="ctv-ic ctv-ic-${name}"></svg>`,
    ctvIsDesktopProxyAvailable: () => true,
    ctvShowToast: () => {},
    ctvForceClosePlayer: () => {
      modal.classList.add('hidden');
    }
  };

  const cleanups = [];
  const registerPlaybackCleanup = (fn) => { if (typeof fn === 'function') cleanups.push(fn); };
  const cleanupAll = () => {
    while (cleanups.length) {
      try { cleanups.pop()(); } catch {}
    }
  };

  return { win, doc, modal, bar, pf, pv, registerPlaybackCleanup, cleanupAll };
}

test('sanitizeResponseHeaders deduplicates case-insensitive CORS headers and strips XFO/CSP sandbox', () => {
  const cleaned = sanitizeResponseHeaders(
    {
      'access-control-allow-origin': ['*'],
      'access-control-allow-headers': ['range'],
      'access-control-allow-methods': ['GET'],
      'x-frame-options': ['SAMEORIGIN'],
      'Content-Security-Policy': ["default-src 'self'; frame-ancestors https://evil.com; sandbox allow-scripts"]
    },
    'https://7.ftlly.com/espn5/mono.m3u8?token=abc'
  );

  const acaoKeys = Object.keys(cleaned).filter((k) => k.toLowerCase() === 'access-control-allow-origin');
  assert.deepEqual(acaoKeys, ['Access-Control-Allow-Origin']);
  assert.deepEqual(cleaned['Access-Control-Allow-Origin'], ['*']);
  assert.equal(cleaned['x-frame-options'], undefined);
  assert.equal(cleaned['Content-Security-Policy'][0], "default-src 'self'");

  const emptyCsp = sanitizeResponseHeaders(
    { 'content-security-policy': ['frame-ancestors *; sandbox'] },
    'https://tvf90.com/1.php?stream=espn5'
  );
  assert.equal(emptyCsp['content-security-policy'], undefined);
});

test('isAgendaSportsUrl & resolveAgendaServerList resolve deduplicated sibling servers', () => {
  assert.equal(isAgendaSportsUrl('agenda-deportiva', 'https://example.com'), true);
  assert.equal(isAgendaSportsUrl('', 'https://futbollibre.ch/hd.php?stream=tntsports'), true);
  assert.equal(isAgendaSportsUrl('', 'https://tvf90.com/1.php?stream=espn5'), true);

  const win = {
    __ctvAgendaEvents: [
      {
        title: 'Partido A',
        servers: [
          { name: 'OP1', url: 'https://futbollibre.ch/hd.php?stream=tntsports', quality: 'HD', baseTitle: 'Partido A' },
          { name: 'OP2', url: 'https://tvf90.com/1.php?stream=tntsports', quality: '', baseTitle: 'Partido A' },
          { name: 'OP2 DUP', url: 'https://tvf90.com/1.php?stream=tntsports', quality: 'HD', baseTitle: 'Partido A' }
        ]
      }
    ]
  };
  const resolved = resolveAgendaServerList(win, 'https://futbollibre.ch/hd.php?stream=tntsports', 'Partido A · OP1', 'OP1');
  assert.equal(resolved.length, 2);
  assert.equal(resolved[0].name, 'OP1');
  assert.equal(resolved[1].name, 'OP2');
});

test('Agenda sports auto-failover jumps from dead server to working sibling server', async (t) => {
  const env = createTestEnv();
  t.after(env.cleanupAll);
  const { win, doc, modal, pv } = env;
  win.__ctvAgendaEvents = [
    {
      title: 'Liga · Equipo A vs Equipo B',
      servers: [
        { name: 'OP1', url: 'https://futbollibre.ch/hd.php?stream=tntsports', quality: 'HD', baseTitle: 'Liga · Equipo A vs Equipo B' },
        { name: 'OP2', url: 'https://tvf90.com/1.php?stream=tntsports', quality: '', baseTitle: 'Liga · Equipo A vs Equipo B' }
      ]
    }
  ];

  const playedUrls = [];
  let loaderShown = false;
  let loaderRemoved = false;

  win.__ctvPlayHls = (hlsUrl) => {
    playedUrls.push(hlsUrl);
    pv.classList.remove('hidden');
  };

  const api = initQualityFailover({
    win,
    doc,
    ctvOpenModalSafe: () => { modal.classList.remove('hidden'); },
    registerPlaybackCleanup: env.registerPlaybackCleanup,
    showPlayerLoader: () => { loaderShown = true; },
    removePlayerLoader: () => { loaderRemoved = true; },
    isExtractableServer: () => true,
    extractDirectStream: async (u) => {
      if (u.includes('futbollibre.ch')) return null;
      return { url: 'https://13.ftlly.com/tntsports/mono.m3u8', type: 'hls', isLive: true, tracks: [] };
    }
  });

  api.playSmartEmbed('https://futbollibre.ch/hd.php?stream=tntsports', 'Liga · Equipo A vs Equipo B · OP1', 'OP1', 'agenda-deportiva');
  assert.equal(loaderShown, true);
  assert.equal(doc.getElementById('player-next-srv').classList.contains('hidden'), false);

  // Trigger iframe-error for dead OP1 fallback -> must show failover pill and hop to OP2
  await new Promise((r) => setTimeout(r, 20));
  if (typeof win.__ctvActiveSubframeErrorCb === 'function') {
    win.__ctvActiveSubframeErrorCb({ url: 'https://futbollibre.ch/hd.php?stream=tntsports' });
  }
  await new Promise((r) => setTimeout(r, 1100));

  assert.equal(playedUrls.length, 1);
  assert.equal(playedUrls[0], 'https://13.ftlly.com/tntsports/mono.m3u8');
  pv.readyState = 4;
  pv.dispatchEvent('playing');
  assert.equal(loaderRemoved, true);
});

test('Agenda sports shows clean no-signal overlay with no Unicode emojis when all servers fail', async (t) => {
  const env = createTestEnv();
  t.after(env.cleanupAll);
  const { win, doc, modal } = env;
  win.__ctvAgendaEvents = [
    {
      title: 'Evento Offline',
      servers: [
        { name: 'OP1', url: 'https://futbollibre.ch/hd.php?stream=dead', quality: 'HD', baseTitle: 'Evento Offline' }
      ]
    }
  ];

  const api = initQualityFailover({
    win,
    doc,
    ctvOpenModalSafe: () => { modal.classList.remove('hidden'); },
    registerPlaybackCleanup: env.registerPlaybackCleanup,
    isExtractableServer: () => true,
    extractDirectStream: async () => null
  });

  api.playSmartEmbed('https://futbollibre.ch/hd.php?stream=dead', 'Evento Offline · OP1', 'OP1', 'agenda-deportiva');
  await new Promise((r) => setTimeout(r, 20));
  if (typeof win.__ctvActiveSubframeErrorCb === 'function') {
    win.__ctvActiveSubframeErrorCb({ url: 'https://futbollibre.ch/hd.php?stream=dead' });
  }

  const statusBox = doc.getElementById('ctv-agenda-status');
  assert.ok(statusBox, 'expected #ctv-agenda-status overlay to render');
  assert.match(statusBox.innerHTML, /Servidor sin señal en este momento/);
  assert.match(statusBox.innerHTML, /Reintentar/);
  assert.match(statusBox.innerHTML, /Volver/);
  assert.equal(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(statusBox.innerHTML), false);
});

test('DASH playback keeps loader until playing and fails over on __ctvActiveDashFailCb', async (t) => {
  const env = createTestEnv();
  t.after(env.cleanupAll);
  const { win, doc, modal, pv } = env;
  win.__ctvAgendaEvents = [
    {
      title: 'DSports',
      servers: [
        { name: 'DSports DRM', url: 'https://tv-90.com/drm/dsports.php', quality: 'HD', baseTitle: 'DSports' },
        { name: 'DSports HLS', url: 'https://tvf90.com/plus1.php?stream=dsports', quality: '', baseTitle: 'DSports' }
      ]
    }
  ];

  let loaderRemoved = false;
  const hlsPlayed = [];
  win.__ctvPlayDash = async () => {
    pv.classList.remove('hidden');
  };
  win.__ctvPlayHls = (u) => {
    hlsPlayed.push(u);
    pv.classList.remove('hidden');
  };

  const api = initQualityFailover({
    win,
    doc,
    ctvOpenModalSafe: () => { modal.classList.remove('hidden'); },
    registerPlaybackCleanup: env.registerPlaybackCleanup,
    removePlayerLoader: () => { loaderRemoved = true; },
    isExtractableServer: () => true,
    extractDirectStream: async (u) => {
      if (u.includes('drm/dsports')) {
        return { url: 'https://akamaized.net/cenc.mpd', keyId: 'aa', key: 'bb', type: 'dash', isLive: true, tracks: [] };
      }
      return { url: 'https://12.ftlly.com/dsports/mono.m3u8', type: 'hls', isLive: true, tracks: [] };
    }
  });

  api.playSmartEmbed('https://tv-90.com/drm/dsports.php', 'DSports · DRM', 'DSports DRM', 'agenda-deportiva');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(loaderRemoved, false, 'loader must remain visible until video actually plays');

  assert.equal(typeof win.__ctvActiveDashFailCb, 'function');
  win.__ctvActiveDashFailCb(new Error('403'));
  await new Promise((r) => setTimeout(r, 1100));

  assert.equal(hlsPlayed.length, 1);
  assert.equal(hlsPlayed[0], 'https://12.ftlly.com/dsports/mono.m3u8');
});

test('Direct Live TV monitor shows loader and replaces silent black screen on DASH failure', async (t) => {
  const env = createTestEnv();
  t.after(env.cleanupAll);
  const { win, doc, modal, pv } = env;
  let loaderShown = false;

  const api = initQualityFailover({
    win,
    doc,
    ctvOpenModalSafe: () => { modal.classList.remove('hidden'); },
    registerPlaybackCleanup: env.registerPlaybackCleanup,
    showPlayerLoader: () => { loaderShown = true; },
    removePlayerLoader: () => {}
  });

  modal.classList.remove('hidden');
  pv.classList.remove('hidden');
  api.monitorDirectLivePlayback('ESPN');
  assert.equal(loaderShown, true);
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(typeof win.__ctvActiveDashFailCb, 'function');
  win.__ctvActiveDashFailCb(new Error('timeout'));

  const statusBox = doc.getElementById('ctv-agenda-status');
  assert.ok(statusBox, 'expected #ctv-agenda-status for failed Live TV DASH channel');
  assert.match(statusBox.innerHTML, /Servidor sin señal en este momento/);
  assert.match(statusBox.innerHTML, /Reintentar/);
  assert.match(statusBox.innerHTML, /Volver/);
});
