const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = (name) => fs.readFileSync(path.join(__dirname, '../../src', name), 'utf8');

function createHarness({ auth = 'signed-in', url = 'https://www.youtube.com/' } = {}) {
  const documentEvents = new Map();
  const windowEvents = new Map();
  const stateRequests = [];
  const runtimes = [];
  const scripts = [];
  const state = { threshold: '1month', enabled: true, homeEnabled: true, watchEnabled: true, loggingEnabled: false };
  let authObserver;
  let contentListener;
  let backgroundListener;
  const window = {
    location: new URL(url),
    addEventListener: (name, callback) => windowEvents.set(name, callback),
    YouTubeSkipHome: { key: 'home', matchesPath: (pathname) => pathname === '/' },
    YouTubeSkipWatch: { key: 'watch', matchesPath: (pathname) => pathname === '/watch' },
    YouTubeSkipShared: {
      showSignInNotice() {},
      hideSignInNotice() {},
      getStats: () => ({ detected: 0, skipped: 0 }),
      createRuntime(adapter, filterState, visit) {
        const runtime = { key: adapter.key, state: filterState, visit, calls: [] };
        for (const method of ['start', 'stop', 'reset', 'apply']) {
          runtime[method] = () => runtime.calls.push(method);
        }
        runtimes.push(runtime);
        return runtime;
      }
    }
  };
  const document = {
    readyState: 'complete',
    documentElement: {},
    head: { appendChild: (script) => scripts.push(script) },
    createElement: () => ({ remove() {} }),
    addEventListener: (name, callback) => documentEvents.set(name, callback),
    querySelector(selector) {
      if (selector.startsWith('ytd-masthead')) return auth === 'signed-in' ? {} : null;
      return auth === 'signed-out' ? {} : null;
    }
  };
  const chrome = { runtime: {
    getURL: (name) => name,
    onMessage: { addListener: (listener) => { contentListener = listener; } },
    sendMessage(message, callback) {
      if (backgroundListener) backgroundListener(message, { tab: { id: 1 } }, callback);
      else if (message.action === 'getState') stateRequests.push(callback);
    }
  } };
  vm.runInNewContext(source('content-script.js'), {
    window, document, chrome, crypto: require('node:crypto'),
    MutationObserver: class {
      constructor(callback) { authObserver = callback; }
      observe() {}
    }
  });
  const harness = {
    runtimes,
    loadScript: () => scripts[0].onload(),
    mutate: () => authObserver([]),
    setAuth: (value) => { auth = value; },
    setUrl: (value) => { window.location = new URL(value); },
    event: (name) => (documentEvents.get(name) || windowEvents.get(name))(),
    receive: (message) => contentListener(message, {}, () => {}),
    connectBackground: (listener) => { backgroundListener = listener; },
    respondState(values = {}) {
      Object.assign(state, values);
      assert.ok(stateRequests.length, 'A state request must be pending');
      stateRequests.shift()({ ...state });
    },
    applyState(values = {}) {
      harness.receive({ action: 'applyFilter' });
      harness.respondState(values);
    }
  };
  return harness;
}

function startHarness(options) {
  const harness = createHarness(options);
  harness.respondState();
  harness.loadScript();
  return harness;
}

test('DOM mutations cannot start filtering before the saved OFF state arrives', () => {
  const harness = createHarness();
  harness.loadScript();
  harness.mutate();
  assert.equal(harness.runtimes.length, 0);
  harness.respondState({ enabled: false });
  harness.mutate();
  assert.equal(harness.runtimes.length, 0);
});

test('filtering waits for the injected script to load', () => {
  const harness = createHarness();
  harness.respondState();
  harness.mutate();
  assert.equal(harness.runtimes.length, 0);
  harness.loadScript();
  assert.deepEqual(harness.runtimes[0].calls, ['start']);
});

test('unknown and signed-out authentication cannot start filtering', () => {
  for (const auth of ['unknown', 'signed-out']) {
    const harness = startHarness({ auth });
    harness.mutate();
    assert.equal(harness.runtimes.length, 0);
    harness.setAuth('signed-in');
    harness.mutate();
    assert.equal(harness.runtimes.length, 1);
  }
});

test('threshold changes stop and reset the old runtime before reevaluating', () => {
  const harness = startHarness();
  harness.applyState({ threshold: '1week' });
  assert.deepEqual(harness.runtimes[0].calls, ['start', 'stop', 'reset']);
  assert.deepEqual(harness.runtimes[1].calls, ['start']);
  harness.applyState();
  assert.equal(harness.runtimes.length, 2);
  assert.deepEqual(harness.runtimes[1].calls, ['start', 'apply']);
});

test('popup authentication polling also stops a runtime after sign-out', () => {
  const harness = startHarness();
  harness.setAuth('signed-out');
  harness.receive({ action: 'getAuthState' });
  harness.mutate();
  assert.deepEqual(harness.runtimes[0].calls, ['start', 'stop', 'reset']);
  harness.setAuth('signed-in');
  harness.receive({ action: 'getAuthState' });
  assert.equal(harness.runtimes.length, 2);
});

test('global and page switches reset pending work when filtering stops', () => {
  for (const [url, key] of [
    ['https://www.youtube.com/', 'enabled'],
    ['https://www.youtube.com/', 'homeEnabled'],
    ['https://www.youtube.com/watch?v=one', 'watchEnabled']
  ]) {
    const harness = startHarness({ url });
    harness.applyState({ [key]: false });
    assert.deepEqual(harness.runtimes[0].calls, ['start', 'stop', 'reset']);
    harness.applyState({ [key]: true });
    assert.equal(harness.runtimes.length, 2);
  }
});

test('navigation blocks old home and watch runtimes until the next page finishes', () => {
  for (const url of ['https://www.youtube.com/', 'https://www.youtube.com/watch?v=one']) {
    const harness = startHarness({ url });
    harness.event('yt-navigate-start');
    assert.deepEqual(harness.runtimes[0].calls, ['start', 'stop', 'reset']);
    harness.setAuth('unknown');
    harness.mutate();
    harness.setAuth('signed-in');
    harness.mutate();
    harness.applyState({ threshold: '1week' });
    assert.equal(harness.runtimes.length, 1);
    harness.setUrl('https://www.youtube.com/watch?v=two');
    harness.event('yt-navigate-finish');
    assert.equal(harness.runtimes.length, 2);
    assert.equal(harness.runtimes[1].key, 'watch');
  }
});

test('popstate waits for YouTube navigation completion before recreating its runtime', () => {
  const harness = startHarness({ url: 'https://www.youtube.com/watch?v=one' });
  harness.setUrl('https://www.youtube.com/watch?v=two');
  harness.event('popstate');
  assert.deepEqual(harness.runtimes[0].calls, ['start', 'stop', 'reset']);
  assert.equal(harness.runtimes.length, 1);
  harness.event('yt-navigate-finish');
  assert.equal(harness.runtimes.length, 2);
});

test('background logging changes immediately reach the active content runtime', () => {
  const harness = startHarness();
  const storage = {};
  const broadcasts = [];
  let backgroundListener;
  vm.runInNewContext(source('background.js'), {
    console: { log() {} },
    chrome: {
      runtime: {
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} },
        onMessage: { addListener: (listener) => { backgroundListener = listener; } }
      },
      storage: { local: {
        get: (keys, callback) => callback({ ...storage }),
        set: (values, callback) => { Object.assign(storage, values); callback(); }
      } },
      tabs: {
        onRemoved: { addListener() {} },
        query: (query, callback) => callback([{ id: 1 }]),
        sendMessage(id, message) {
          broadcasts.push(message.action);
          harness.receive(message);
          return Promise.resolve();
        }
      }
    }
  });
  harness.connectBackground(backgroundListener);
  for (const enabled of [true, false]) {
    backgroundListener({ action: 'setLoggingEnabled', enabled }, {}, () => {});
    assert.equal(storage.logging_enabled, enabled);
    assert.equal(harness.runtimes[0].state.loggingEnabled, enabled);
  }
  assert.deepEqual(broadcasts, ['applyFilter', 'applyFilter']);
  assert.equal(harness.runtimes.length, 1);
});


test('home visit survives setting changes and toggles but changes on real navigation', () => {
  const h = startHarness();
  const first = h.runtimes[0].visit;
  assert.ok(first?.id);
  h.applyState({ repeatEnabled: true, repeatThreshold: 3 });
  h.applyState({ repeatThreshold: 5 });
  h.applyState({ homeEnabled: false });
  h.applyState({ homeEnabled: true });
  assert.equal(h.runtimes.at(-1).visit, first);
  h.event('yt-navigate-start');
  h.event('yt-navigate-start');
  h.event('popstate');
  assert.equal(h.runtimes.at(-1).visit, first, 'popstate cannot finish a pending navigation');
  h.event('yt-navigate-finish');
  const next = h.runtimes.at(-1).visit;
  assert.notEqual(next.id, first.id);
  assert.equal(first.closed, true);
  h.event('yt-navigate-finish');
  h.event('popstate');
  assert.equal(h.runtimes.at(-1).visit, next);
});

test('home to watch to home starts a fresh visit and watch has no exposure context', () => {
  const h = startHarness();
  const first = h.runtimes[0].visit;
  h.event('yt-navigate-start');
  h.setUrl('https://www.youtube.com/watch?v=video');
  h.event('yt-navigate-finish');
  assert.equal(h.runtimes.at(-1).visit, null);
  h.setUrl('https://www.youtube.com/');
  h.event('popstate');
  h.event('yt-navigate-start');
  const runtimeCount = h.runtimes.length;
  h.event('yt-navigate-finish');
  h.event('popstate');
  h.event('yt-navigate-finish');
  assert.equal(h.runtimes.length, runtimeCount + 1);
  assert.notEqual(h.runtimes.at(-1).visit.id, first.id);
});
