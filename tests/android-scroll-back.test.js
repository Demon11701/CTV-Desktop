'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  SCROLL_GUARD_CSS,
  initScrollGuard
} = require('../src-modules/scroll-guard.js');

function createMockElement(tagName, doc) {
  const listeners = { capture: new Map(), bubble: new Map() };
  const children = [];
  const classSet = new Set();
  const attrs = new Map();
  let currentSrc = '';

  const notifyClassObservers = () => {
    if (Array.isArray(el._classObservers)) {
      for (const cb of el._classObservers) {
        cb([{ type: 'attributes', attributeName: 'class', target: el }]);
      }
    }
  };

  const el = {
    nodeType: 1,
    tagName: String(tagName || 'DIV').toUpperCase(),
    id: '',
    style: {},
    offsetHeight: 720,
    scrollTop: 0,
    tabIndex: 0,
    textContent: '',
    parentNode: null,
    isConnected: true,
    children,
    _classObservers: [],
    get src() {
      return currentSrc;
    },
    set src(val) {
      currentSrc = String(val ?? '');
      attrs.set('src', currentSrc);
    },
    classList: {
      add: (...cls) => {
        let changed = false;
        for (const c of cls) {
          if (!classSet.has(c)) {
            classSet.add(c);
            changed = true;
          }
        }
        if (changed) notifyClassObservers();
      },
      remove: (...cls) => {
        let changed = false;
        for (const c of cls) {
          if (classSet.has(c)) {
            classSet.delete(c);
            changed = true;
          }
        }
        if (changed) notifyClassObservers();
      },
      contains: (c) => classSet.has(c)
    },
    setAttribute: (k, v) => {
      const key = String(k);
      const val = String(v);
      if (key === 'id') el.id = val;
      if (key === 'src') currentSrc = val;
      attrs.set(key, val);
    },
    getAttribute: (k) => (attrs.has(String(k)) ? attrs.get(String(k)) : null),
    hasAttribute: (k) => attrs.has(String(k)),
    removeAttribute: (k) => {
      const key = String(k);
      attrs.delete(key);
      if (key === 'src') currentSrc = '';
    },
    appendChild: (child) => {
      if (!child) return child;
      child.parentNode = el;
      child.isConnected = true;
      children.push(child);
      if (child.id) doc._byId.set(child.id, child);
      return child;
    },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx >= 0) children.splice(idx, 1);
      if (child) {
        child.parentNode = null;
        child.isConnected = false;
        if (child.id && doc._byId.get(child.id) === child) doc._byId.delete(child.id);
      }
      return child;
    },
    remove: () => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      } else {
        el.isConnected = false;
        if (el.id && doc._byId.get(el.id) === el) doc._byId.delete(el.id);
      }
    },
    closest: (selector) => {
      const clsMatch = String(selector || '').match(/^\.([a-zA-Z0-9_-]+)$/);
      const idMatch = String(selector || '').match(/^#([a-zA-Z0-9_-]+)$/);
      let cur = el;
      while (cur && cur.nodeType === 1) {
        if (clsMatch && cur.classList.contains(clsMatch[1])) return cur;
        if (idMatch && cur.id === idMatch[1]) return cur;
        cur = cur.parentNode;
      }
      return null;
    },
    querySelector: (selector) => {
      const idMatch = String(selector || '').match(/^#([a-zA-Z0-9_-]+)$/);
      if (idMatch) {
        return children.find((c) => c.id === idMatch[1]) || doc._byId.get(idMatch[1]) || null;
      }
      const clsMatch = String(selector || '').match(/^\.([a-zA-Z0-9_-]+)$/);
      if (clsMatch) {
        return children.find((c) => c.classList.contains(clsMatch[1])) || null;
      }
      return null;
    },
    addEventListener: (type, fn, opts) => {
      const isCap = Boolean(typeof opts === 'boolean' ? opts : opts && opts.capture);
      const bucket = isCap ? listeners.capture : listeners.bubble;
      if (!bucket.has(type)) bucket.set(type, new Set());
      bucket.get(type).add(fn);
    },
    removeEventListener: (type, fn, opts) => {
      const isCap = Boolean(typeof opts === 'boolean' ? opts : opts && opts.capture);
      const bucket = isCap ? listeners.capture : listeners.bubble;
      if (bucket.has(type)) bucket.get(type).delete(fn);
    },
    dispatchEvent: (rawEv) => {
      const ev = typeof rawEv === 'string' ? { type: rawEv } : rawEv;
      let immediateStopped = false;
      let propagationStopped = false;
      ev.stopImmediatePropagation = () => {
        immediateStopped = true;
        propagationStopped = true;
        ev._immediateStopped = true;
      };
      ev.stopPropagation = () => {
        propagationStopped = true;
      };
      ev.preventDefault = ev.preventDefault || (() => { ev.defaultPrevented = true; });

      const capSet = listeners.capture.get(ev.type);
      if (capSet) {
        for (const fn of Array.from(capSet)) {
          fn(ev);
          if (immediateStopped) return !ev.defaultPrevented;
        }
      }
      if (propagationStopped) return !ev.defaultPrevented;
      const bubSet = listeners.bubble.get(ev.type);
      if (bubSet) {
        for (const fn of Array.from(bubSet)) {
          fn(ev);
          if (immediateStopped) return !ev.defaultPrevented;
        }
      }
      return !ev.defaultPrevented;
    },
    focus: () => {
      doc.activeElement = el;
    },
    blur: () => {
      if (doc.activeElement === el) {
        doc.activeElement = doc.body;
      }
    },
    pause: () => {},
    load: () => {},
    scrollIntoView: () => {},
    click: () => {
      if (typeof el.onclick === 'function') {
        el.onclick({ preventDefault() {}, stopPropagation() {} });
      }
    }
  };

  return el;
}

function createAndroidWebViewMockEnv({ predefineHandleAppBack = true } = {}) {
  const rafQueue = [];
  let nextRafId = 1;
  const cancelledRafs = new Set();

  class MockMutationObserver {
    constructor(cb) {
      this._cb = cb;
      this._targets = [];
    }
    observe(target, opts) {
      if (target && opts && opts.attributes) {
        target._classObservers.push(this._cb);
        this._targets.push(target);
      }
    }
    disconnect() {
      for (const t of this._targets) {
        const idx = t._classObservers.indexOf(this._cb);
        if (idx >= 0) t._classObservers.splice(idx, 1);
      }
      this._targets = [];
    }
  }

  let exitFullscreenCalls = 0;
  let orientationUnlockCalls = 0;
  let forceCloseCalls = 0;
  let frameStopCalls = 0;

  const docTarget = null;
  const doc = {
    _byId: new Map(),
    head: null,
    documentElement: null,
    body: null,
    activeElement: null,
    hidden: false,
    fullscreenElement: null,
    webkitFullscreenElement: null,
    createElement: (tag) => createMockElement(tag, doc),
    getElementById: (id) => doc._byId.get(String(id)) || null,
    querySelector: (sel) => {
      if (sel === '#filter-modal') return doc.getElementById('filter-modal');
      if (sel === '#adult-modal') return doc.getElementById('adult-modal');
      if (sel === '#movie-grid .card' || sel.includes('.card')) return doc.getElementById('card-1');
      return null;
    },
    exitFullscreen: () => {
      exitFullscreenCalls += 1;
      doc.fullscreenElement = null;
      return Promise.resolve();
    }
  };

  doc.documentElement = createMockElement('html', doc);
  doc.head = createMockElement('head', doc);
  doc.body = createMockElement('body', doc);
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  doc.activeElement = doc.body;

  doc.addEventListener = doc.documentElement.addEventListener;
  doc.removeEventListener = doc.documentElement.removeEventListener;
  doc.dispatchEvent = doc.documentElement.dispatchEvent;

  const content = createMockElement('section', doc);
  content.id = 'content';
  content.classList.add('content');
  doc.body.appendChild(content);

  const card = createMockElement('div', doc);
  card.id = 'card-1';
  card.classList.add('card', 'movie', 'focusable');
  content.appendChild(card);

  const detailModal = createMockElement('div', doc);
  detailModal.id = 'detail-modal';
  detailModal.classList.add('detail-full', 'hidden');
  doc.body.appendChild(detailModal);

  const detailTopback = createMockElement('button', doc);
  detailTopback.id = 'detail-topback';
  detailTopback.classList.add('btn', 'focusable');
  detailModal.appendChild(detailTopback);

  const detailBody = createMockElement('div', doc);
  detailBody.id = 'detail-body';
  detailBody.classList.add('detail-scroll');
  detailModal.appendChild(detailBody);

  const serverModal = createMockElement('div', doc);
  serverModal.id = 'server-modal';
  serverModal.classList.add('modal', 'hidden');
  doc.body.appendChild(serverModal);

  const updateModal = createMockElement('div', doc);
  updateModal.id = 'update-modal';
  updateModal.classList.add('modal', 'hidden');
  doc.body.appendChild(updateModal);

  const playerModal = createMockElement('div', doc);
  playerModal.id = 'player-modal';
  playerModal.classList.add('player', 'hidden');
  doc.body.appendChild(playerModal);

  const playerBar = createMockElement('div', doc);
  playerBar.id = 'player-bar';
  playerBar.classList.add('player-bar');
  playerModal.appendChild(playerBar);

  const playerQualityBtn = createMockElement('button', doc);
  playerQualityBtn.id = 'player-quality';
  playerQualityBtn.classList.add('btn', 'focusable');
  playerBar.appendChild(playerQualityBtn);

  const wakeZone = createMockElement('div', doc);
  wakeZone.id = 'ctv-player-wake-zone';
  wakeZone.classList.add('hidden');
  wakeZone.style.display = 'none';
  wakeZone.style.pointerEvents = 'none';
  playerModal.appendChild(wakeZone);

  const playerFrame = createMockElement('iframe', doc);
  playerFrame.id = 'player-frame';
  playerFrame.classList.add('player-frame', 'hidden');
  playerFrame.src = 'about:blank';
  playerFrame.contentWindow = {
    stop: () => { frameStopCalls += 1; }
  };
  playerModal.appendChild(playerFrame);

  const playerVideo = createMockElement('video', doc);
  playerVideo.id = 'player-video';
  playerVideo.classList.add('player-frame', 'hidden');
  playerModal.appendChild(playerVideo);

  const winEventBus = createMockElement('window', doc);
  const win = {
    document: doc,
    MutationObserver: MockMutationObserver,
    history: {
      state: null,
      pushState(st) { this.state = st; },
      replaceState(st) { this.state = st; }
    },
    screen: {
      orientation: {
        unlock: () => {
          orientationUnlockCalls += 1;
        }
      }
    },
    requestAnimationFrame: (cb) => {
      const id = nextRafId++;
      rafQueue.push({ id, cb });
      return id;
    },
    cancelAnimationFrame: (id) => {
      cancelledRafs.add(id);
    },
    addEventListener: winEventBus.addEventListener,
    removeEventListener: winEventBus.removeEventListener,
    dispatchEvent: winEventBus.dispatchEvent,
    getComputedStyle: (el) => el.style || {}
  };

  const flushAnimationFrames = () => {
    let guard = 0;
    while (rafQueue.length > 0 && guard < 20) {
      guard += 1;
      const batch = rafQueue.splice(0, rafQueue.length);
      for (const item of batch) {
        if (!cancelledRafs.has(item.id)) {
          item.cb(Date.now());
        }
      }
    }
  };

  // Base bundle xm() simulation: hides #detail-modal and focuses .card inside requestAnimationFrame
  const rawXmCloseDetail = () => {
    detailModal.classList.add('hidden');
    win.requestAnimationFrame(() => {
      card.focus();
      card.scrollIntoView({ block: 'nearest' });
    });
  };

  // Base bundle GE() simulation (buggy raw close that sets src="" and skips wakeZone/fullscreen)
  const rawGeClosePlayer = () => {
    playerModal.classList.add('hidden');
    playerFrame.src = '';
    if (typeof win.ctvOnPlayerClose === 'function') win.ctvOnPlayerClose();
  };

  const makeRawHandleAppBack = () => () => {
    if (!playerModal.classList.contains('hidden')) {
      rawGeClosePlayer();
      return 'cerrado';
    }
    if (!detailModal.classList.contains('hidden')) {
      rawXmCloseDetail();
      return 'cerrado';
    }
    if (doc.getElementById('filter-modal')) {
      doc.getElementById('filter-modal').remove();
      return 'cerrado';
    }
    if (doc.getElementById('adult-modal')) {
      doc.getElementById('adult-modal').remove();
      return 'cerrado';
    }
    if (!updateModal.classList.contains('hidden')) {
      updateModal.classList.add('hidden');
      return 'cerrado';
    }
    return 'exit';
  };

  detailTopback.onclick = rawXmCloseDetail;

  if (predefineHandleAppBack) {
    win.handleAppBack = makeRawHandleAppBack();
  }

  // Simulate index-BhZlhT-V.js anonymous bubble popstate listener
  let bubblePopstateClosedDetailCount = 0;
  win.addEventListener('popstate', () => {
    if (!detailModal.classList.contains('hidden') && playerModal.classList.contains('hidden')) {
      bubblePopstateClosedDetailCount += 1;
      rawXmCloseDetail();
    }
  });

  // Production-equivalent ctvForceClosePlayer wired to ctvRestoreScrollAndInput
  win.ctvForceClosePlayer = () => {
    forceCloseCalls += 1;
    playerModal.classList.add('hidden');
    if (playerFrame.src !== 'about:blank') {
      playerFrame.contentWindow.stop();
      playerFrame.src = 'about:blank';
    }
    playerFrame.classList.add('hidden');
    playerVideo.classList.add('hidden');
    if (typeof win.ctvRestoreScrollAndInput === 'function') {
      win.ctvRestoreScrollAndInput({ exitFullscreen: true });
    }
  };

  return {
    win,
    doc,
    content,
    card,
    detailModal,
    detailTopback,
    detailBody,
    serverModal,
    updateModal,
    playerModal,
    playerBar,
    playerQualityBtn,
    wakeZone,
    playerFrame,
    playerVideo,
    rawXmCloseDetail,
    makeRawHandleAppBack,
    flushAnimationFrames,
    getStats: () => ({
      exitFullscreenCalls,
      orientationUnlockCalls,
      forceCloseCalls,
      frameStopCalls,
      bubblePopstateClosedDetailCount
    })
  };
}

test('Test 1: Normal UI close (2 levels: Serie #detail-body -> #player-modal -> close player -> close detail) restores scroll & prevents touch card focus', () => {
  const env = createAndroidWebViewMockEnv();
  const {
    win,
    doc,
    content,
    card,
    detailModal,
    detailTopback,
    detailBody,
    playerModal,
    wakeZone,
    playerFrame,
    flushAnimationFrames,
    getStats
  } = env;

  initScrollGuard(win, doc);

  // Simulate touch user on Android mobile
  win.dispatchEvent({ type: 'touchstart' });
  assert.equal(win.__ctvLastInputWasTouch, true);

  // Level 1: Open Serie detail view with episodes inside #detail-body
  win.history.pushState({ view: 'serie-detail', slug: 'serie-prueba' }, '');
  detailModal.classList.remove('hidden');
  detailBody.scrollTop = 280;

  // Level 2: Open Player with active wake-zone, failover pill, resume prompt, fullscreen & locked inline styles
  playerModal.classList.remove('hidden');
  win.ctvSyncPlayerWakeZone(doc);
  assert.equal(wakeZone.classList.contains('hidden'), false);
  assert.equal(wakeZone.style.display, 'block');
  assert.equal(wakeZone.style.pointerEvents, 'auto');

  const failoverPill = doc.createElement('div');
  failoverPill.id = 'ctv-failover-pill';
  failoverPill.style.display = 'flex';
  failoverPill.style.pointerEvents = 'auto';
  playerModal.appendChild(failoverPill);

  const resumePrompt = doc.createElement('div');
  resumePrompt.id = 'ctv-resume-prompt';
  resumePrompt.style.display = 'flex';
  resumePrompt.style.pointerEvents = 'auto';
  playerModal.appendChild(resumePrompt);

  playerFrame.classList.remove('hidden');
  playerFrame.src = 'https://embed-cdn.example/player/ep1';
  playerFrame.focus();
  doc.fullscreenElement = playerModal;

  // Simulate locked inline residue on html, body, and #detail-body
  doc.documentElement.style.overflow = 'hidden';
  doc.documentElement.style.touchAction = 'none';
  doc.body.style.overflowY = 'hidden';
  doc.body.style.position = 'fixed';
  doc.body.style.pointerEvents = 'none';
  doc.body.setAttribute('inert', '');
  detailBody.style.overflowY = 'hidden';
  detailBody.style.pointerEvents = 'none';
  detailBody.style.touchAction = 'none';
  detailBody.setAttribute('inert', '');

  // Close Level 2 (#player-modal) via ctvForceClosePlayer()
  win.ctvForceClosePlayer();
  flushAnimationFrames();

  assert.equal(playerModal.classList.contains('hidden'), true);
  assert.equal(playerFrame.src, 'about:blank');
  assert.notEqual(doc.activeElement, playerFrame);

  // Wake zone & floating overlays neutralized
  assert.equal(wakeZone.classList.contains('hidden'), true);
  assert.equal(wakeZone.style.display, 'none');
  assert.equal(wakeZone.style.pointerEvents, 'none');
  assert.equal(failoverPill.style.display, 'none');
  assert.equal(failoverPill.style.pointerEvents, 'none');
  assert.equal(doc.getElementById('ctv-failover-pill'), null);
  assert.equal(resumePrompt.style.display, 'none');
  assert.equal(resumePrompt.style.pointerEvents, 'none');
  assert.equal(doc.getElementById('ctv-resume-prompt'), null);

  // Fullscreen & orientation unlocked
  assert.ok(getStats().exitFullscreenCalls >= 1);
  assert.ok(getStats().orientationUnlockCalls >= 1);

  // #detail-body restored and scrollable with preserved scrollTop
  assert.equal(detailBody.hasAttribute('inert'), false);
  assert.equal(detailBody.style.overflowY, 'auto');
  assert.equal(detailBody.style.overflowX, 'hidden');
  assert.equal(detailBody.style.pointerEvents, 'auto');
  assert.equal(detailBody.style.touchAction, 'pan-y');
  assert.equal(detailBody.scrollTop, 280);
  assert.equal(doc.documentElement.style.overflow, '');
  assert.equal(doc.body.style.overflowY, '');
  assert.equal(doc.body.style.position, '');
  assert.equal(doc.body.style.pointerEvents, '');
  assert.equal(doc.body.hasAttribute('inert'), false);

  // Now close Level 1 (#detail-modal) via #detail-topback click (triggers xm() + MutationObserver)
  content.style.overflowY = 'hidden';
  content.style.pointerEvents = 'none';
  content.style.touchAction = 'none';
  content.scrollTop = 420;

  detailTopback.click();
  flushAnimationFrames();

  assert.equal(detailModal.classList.contains('hidden'), true);
  assert.equal(content.style.overflowY, 'auto');
  assert.equal(content.style.overflowX, 'hidden');
  assert.equal(content.style.pointerEvents, 'auto');
  assert.equal(content.style.touchAction, 'pan-y');
  assert.equal(content.scrollTop, 420);
  assert.notEqual(doc.activeElement, card, '.card must NOT stay focused after closing detail in touch mode');
  assert.equal(win.history.state && win.history.state.view, undefined, 'residual serie-detail history.state must be cleaned');
});

test('Test 2: Android Back Gesture via window.handleAppBack() (CTV.apk MainActivity.onBackPressed real path)', () => {
  const env = createAndroidWebViewMockEnv();
  const {
    win,
    doc,
    content,
    detailModal,
    detailBody,
    playerModal,
    wakeZone,
    playerFrame,
    flushAnimationFrames,
    getStats
  } = env;

  initScrollGuard(win, doc);
  win.__ctvLastInputWasTouch = true;

  // Open detail-modal + player-modal + #ctv-quality-modal on top
  win.history.pushState({ view: 'movie-detail', slug: 'pelicula-prueba' }, '');
  detailModal.classList.remove('hidden');
  playerModal.classList.remove('hidden');
  win.ctvSyncPlayerWakeZone(doc);
  playerFrame.classList.remove('hidden');
  playerFrame.src = 'https://embed-cdn.example/movie/123';
  doc.fullscreenElement = playerModal;

  const qualityModal = doc.createElement('div');
  qualityModal.id = 'ctv-quality-modal';
  qualityModal.classList.add('modal');
  playerModal.appendChild(qualityModal);

  // 1st handleAppBack(): closes ONLY #ctv-quality-modal and returns 'cerrado', keeping player alive
  const res1 = win.handleAppBack();
  assert.equal(res1, 'cerrado');
  assert.equal(doc.getElementById('ctv-quality-modal'), null);
  assert.equal(qualityModal.style.display, 'none');
  assert.equal(qualityModal.style.pointerEvents, 'none');
  assert.equal(playerModal.classList.contains('hidden'), false, 'player must stay open after closing quality submodal');
  assert.equal(playerFrame.src, 'https://embed-cdn.example/movie/123');
  assert.equal(getStats().forceCloseCalls, 0);

  // 2nd handleAppBack(): atomically closes player via ctvForceClosePlayer() + ctvRestoreScrollAndInput()
  const res2 = win.handleAppBack();
  flushAnimationFrames();
  assert.equal(res2, 'cerrado');
  assert.equal(getStats().forceCloseCalls, 1);
  assert.equal(playerModal.classList.contains('hidden'), true);
  assert.equal(playerFrame.src, 'about:blank');
  assert.ok(getStats().frameStopCalls >= 1);
  assert.ok(getStats().exitFullscreenCalls >= 1);
  assert.ok(getStats().orientationUnlockCalls >= 1);
  assert.equal(wakeZone.classList.contains('hidden'), true);
  assert.equal(wakeZone.style.display, 'none');
  assert.equal(wakeZone.style.pointerEvents, 'none');
  assert.equal(detailModal.classList.contains('hidden'), false, '#detail-modal must stay open after closing player');
  assert.equal(detailBody.style.overflowY, 'auto');
  assert.equal(detailBody.style.pointerEvents, 'auto');
  assert.equal(detailBody.style.touchAction, 'pan-y');

  // 3rd handleAppBack(): closes #detail-modal, cleans history.state, restores #content scroll
  const res3 = win.handleAppBack();
  flushAnimationFrames();
  assert.equal(res3, 'cerrado');
  assert.equal(detailModal.classList.contains('hidden'), true);
  assert.equal(content.style.overflowY, 'auto');
  assert.equal(content.style.pointerEvents, 'auto');
  assert.equal(content.style.touchAction, 'pan-y');
  assert.equal(win.history.state && win.history.state.view, undefined);

  // 4th handleAppBack() at root catalog without open modals: returns 'exit'
  const res4 = win.handleAppBack();
  assert.equal(res4, 'exit');
});

test('Test 3: Back gesture via popstate in capture phase preempts bubble listener and restores scroll', async () => {
  const env = createAndroidWebViewMockEnv();
  const {
    win,
    doc,
    detailModal,
    detailBody,
    playerModal,
    wakeZone,
    playerFrame,
    flushAnimationFrames,
    getStats
  } = env;

  initScrollGuard(win, doc);
  win.__ctvLastInputWasTouch = true;

  detailModal.classList.remove('hidden');
  playerModal.classList.remove('hidden');
  win.ctvSyncPlayerWakeZone(doc);
  playerFrame.classList.remove('hidden');
  playerFrame.src = 'https://embed-cdn.example/live/ch1';

  const agendaStatus = doc.createElement('div');
  agendaStatus.id = 'ctv-agenda-status';
  agendaStatus.style.display = 'flex';
  agendaStatus.style.pointerEvents = 'auto';
  playerModal.appendChild(agendaStatus);

  const popEv = { type: 'popstate', state: { view: 'serie-detail', slug: 'serie-x' } };
  win.dispatchEvent(popEv);
  await new Promise((r) => setTimeout(r, 15));
  flushAnimationFrames();

  assert.equal(popEv._immediateStopped, true, 'popstate capture must call stopImmediatePropagation()');
  assert.equal(getStats().bubblePopstateClosedDetailCount, 0, 'base bundle bubble popstate must NOT close #detail-modal at the same time');
  assert.equal(getStats().forceCloseCalls, 1);
  assert.equal(playerModal.classList.contains('hidden'), true);
  assert.equal(playerFrame.src, 'about:blank');
  assert.equal(agendaStatus.style.display, 'none');
  assert.equal(agendaStatus.style.pointerEvents, 'none');
  assert.equal(wakeZone.style.display, 'none');
  assert.equal(detailModal.classList.contains('hidden'), false);
  assert.equal(detailBody.style.overflowY, 'auto');
  assert.equal(detailBody.style.pointerEvents, 'auto');
  assert.equal(detailBody.style.touchAction, 'pan-y');
});

test('Test 4: Late assignment of window.handleAppBack by index-BhZlhT-V.js after guard init remains wrapped & protected', () => {
  const env = createAndroidWebViewMockEnv({ predefineHandleAppBack: false });
  const {
    win,
    doc,
    detailModal,
    playerModal,
    playerFrame,
    makeRawHandleAppBack,
    flushAnimationFrames,
    getStats
  } = env;

  assert.equal(win.handleAppBack, undefined);

  // Guard initializes FIRST (as ctv-ui.js does before module index-BhZlhT-V.js executes)
  initScrollGuard(win, doc);

  // Base bundle assigns window.handleAppBack LATER
  const rawFn = makeRawHandleAppBack();
  win.handleAppBack = rawFn;

  assert.equal(typeof win.handleAppBack, 'function');
  assert.notEqual(win.handleAppBack, rawFn, 'assigned handleAppBack must be wrapped automatically via setter trap');
  assert.equal(win.handleAppBack.__ctvWrapperTag, true);

  // Verify wrapped behavior protects against raw GE() src="" bug
  detailModal.classList.remove('hidden');
  playerModal.classList.remove('hidden');
  playerFrame.src = 'https://embed-cdn.example/movie/late';

  const r1 = win.handleAppBack();
  flushAnimationFrames();
  assert.equal(r1, 'cerrado');
  assert.equal(getStats().forceCloseCalls, 1);
  assert.equal(playerFrame.src, 'about:blank', 'must route through ctvForceClosePlayer instead of raw GE() src=""');

  // Even a second late assignment remains wrapped
  const rawFn2 = makeRawHandleAppBack();
  win.handleAppBack = rawFn2;
  assert.equal(win.handleAppBack.__ctvWrapperTag, true);

  const r2 = win.handleAppBack();
  flushAnimationFrames();
  assert.equal(r2, 'cerrado');
  assert.equal(detailModal.classList.contains('hidden'), true);

  const r3 = win.handleAppBack();
  assert.equal(r3, 'exit');
});

test('Generated ctv-ui.js and ctv-ota.js include scroll-guard CSS rules and OTA rev 23', () => {
  assert.match(SCROLL_GUARD_CSS, /\.content\{[^}]*touch-action:pan-y!important/);
  assert.match(SCROLL_GUARD_CSS, /\.detail-scroll,#detail-body\{[^}]*min-height:0!important/);
  assert.match(SCROLL_GUARD_CSS, /\.carousel,\.filter-bar,\.season-strip,\.season-tabs\{overflow-y:hidden!important;touch-action:pan-x pan-y\}/);

  const rootDir = path.resolve(__dirname, '..');
  const uiCode = fs.readFileSync(path.join(rootDir, 'src', 'ctv-ui.js'), 'utf-8');
  const otaCode = fs.readFileSync(path.join(rootDir, 'src', 'ctv-ota.js'), 'utf-8');

  for (const [label, code] of [['ctv-ui.js', uiCode], ['ctv-ota.js', otaCode]]) {
    assert.ok(code.includes('1.6.3-ota.23'), `${label} must embed OTA version 1.6.3-ota.23`);
    assert.ok(code.includes('window.__ctvHlsHookVersion = 23;'), `${label} must set __ctvHlsHookVersion = 23`);
    assert.ok(code.includes('ctvRestoreScrollAndInput'), `${label} must define ctvRestoreScrollAndInput`);
    assert.ok(code.includes("installLateSafeWrapper(win, 'handleAppBack'"), `${label} must wrap handleAppBack`);
    assert.ok(code.includes('.detail-scroll,#detail-body{flex:1 1 auto!important;min-height:0!important'), `${label} must include #detail-body scroll CSS`);
  }
});
