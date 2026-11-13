const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/popup.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../src/popup.html'), 'utf8');

function harness({ storage = {}, authState = 'signed-in', stats = { detected: 10, skipped: 2 } } = {}) {
  const elements = new Map();
  const requests = [];
  const messages = [];
  const writes = [];
  let poll;
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  ids.push('enable-repeat-filter', 'repeat-threshold', 'repeat-filter-controls', 'repeat-filter-error');
  for (const id of [...ids, '.page-toggle-group', '.controls-panel']) {
    const attributes = new Map();
    const classes = new Set();
    const listeners = new Map();
    elements.set(id, {
      value: '', checked: false, disabled: false, hidden: true, textContent: '',
      classList: {
        toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
        contains: name => classes.has(name)
      },
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: name => attributes.delete(name),
      getAttribute: name => attributes.get(name),
      addEventListener: (name, callback) => listeners.set(name, callback),
      change() { listeners.get('change')?.({ target: this }); }
    });
  }
  const runtime = {
    lastError: null,
    sendMessage(message, callback) {
      messages.push(JSON.parse(JSON.stringify(message)));
      if (message.action === 'setRepeatFilter') requests.push({ message, callback });
      else callback?.({ success: true });
    }
  };
  vm.runInNewContext(source, {
    document: {
      getElementById: id => elements.get(id),
      querySelector: selector => elements.get(selector),
      addEventListener: (name, callback) => callback()
    },
    window: { addEventListener() {} },
    chrome: {
      runtime,
      storage: { local: {
        get: (keys, callback) => callback(storage),
        set(values, callback) { writes.push(values); Object.assign(storage, values); callback?.(); }
      } },
      tabs: {
        query: (query, callback) => callback([{ id: 1, url: 'https://www.youtube.com/' }]),
        sendMessage: (id, message, callback) => callback(message.action === 'getAuthState'
          ? { authState } : stats)
      }
    },
    setInterval(callback) { poll = callback; }, clearInterval() {}
  });
  return { elements, requests, messages, writes, runtime,
    field: id => elements.get(id),
    poll: () => poll(),
    setAuth: value => { authState = value; },
    respond(response = { success: true }, error = null) {
      const request = requests.at(-1);
      runtime.lastError = error;
      request.callback(response);
      runtime.lastError = null;
    }
  };
}

test('repeat controls start off with a threshold of three', () => {
  const h = harness();
  assert.equal(h.field('enable-repeat-filter').checked, false);
  assert.equal(h.field('repeat-threshold').value, '3');
  assert.equal(h.field('repeat-threshold').disabled, true);
});

test('saved global, page, threshold, and logging settings survive reopening the popup', () => {
  const h = harness({ storage: {
    filter_threshold: '3months', filter_enabled: false,
    home_filter_enabled: false, watch_filter_enabled: true, logging_enabled: true
  } });
  assert.equal(h.field('threshold-select').value, '3months');
  assert.equal(h.field('enable-filter').checked, false);
  assert.equal(h.field('enable-home-filter').checked, false);
  assert.equal(h.field('enable-watch-filter').checked, true);
  assert.equal(h.field('enable-logging').checked, true);
  assert.equal(h.field('status').textContent, 'Filter Inactive');
  assert.equal(h.field('enable-home-filter').disabled, true);
  assert.equal(h.field('enable-watch-filter').disabled, true);
  assert.equal(h.messages.length, 0);
});

test('each offered upload threshold reaches the background and updates the status', () => {
  const h = harness();
  const options = [...html.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)];
  assert.equal(options.length, 10);
  for (const [, value, label] of options) {
    h.field('threshold-select').value = value;
    h.field('threshold-select').change();
    assert.deepEqual(h.messages.at(-1), { action: 'setThreshold', threshold: value });
    assert.equal(h.field('status').textContent, `Main + Watch · ${label}+`);
  }
  const count = h.messages.length;
  h.field('threshold-select').value = '';
  h.field('threshold-select').change();
  assert.equal(h.messages.length, count);
});

test('global filtering can pause and resume while preserving independent page choices', () => {
  const h = harness({ storage: { home_filter_enabled: false, watch_filter_enabled: true } });
  for (const enabled of [false, true]) {
    h.field('enable-filter').checked = enabled;
    h.field('enable-filter').change();
    assert.deepEqual(h.messages.at(-1), { action: 'setFilterEnabled', enabled });
    assert.equal(h.field('enable-home-filter').checked, false);
    assert.equal(h.field('enable-watch-filter').checked, true);
    assert.equal(h.field('enable-home-filter').disabled, !enabled);
    assert.equal(h.field('enable-watch-filter').disabled, !enabled);
    assert.equal(h.field('status').textContent, enabled ? 'Watch · 1 Month+' : 'Filter Inactive');
  }
});

test('home and watch switches address the correct page independently', () => {
  const h = harness();
  h.field('enable-home-filter').checked = false;
  h.field('enable-home-filter').change();
  assert.deepEqual(h.messages.at(-1), { action: 'setPageFilterEnabled', page: 'home', enabled: false });
  assert.equal(h.field('enable-watch-filter').checked, true);
  assert.equal(h.field('status').textContent, 'Watch · 1 Month+');
  h.field('enable-watch-filter').checked = false;
  h.field('enable-watch-filter').change();
  assert.deepEqual(h.messages.at(-1), { action: 'setPageFilterEnabled', page: 'watch', enabled: false });
  assert.equal(h.field('status').textContent, 'Filter Inactive');
  h.field('enable-home-filter').checked = true;
  h.field('enable-home-filter').change();
  assert.deepEqual(h.messages.at(-1), { action: 'setPageFilterEnabled', page: 'home', enabled: true });
  assert.equal(h.field('enable-watch-filter').checked, false);
  assert.equal(h.field('status').textContent, 'Main · 1 Month+');
});

test('debug logging changes notify the background without changing filtering controls', () => {
  const h = harness();
  for (const enabled of [true, false]) {
    h.field('enable-logging').checked = enabled;
    h.field('enable-logging').change();
    assert.deepEqual(h.messages.at(-1), { action: 'setLoggingEnabled', enabled });
    assert.equal(h.field('enable-filter').checked, true);
    assert.equal(h.field('status').textContent, 'Main + Watch · 1 Month+');
  }
});

test('polling displays current counters and pauses controls after sign-out', () => {
  const stats = { detected: 10, skipped: 2 };
  const h = harness({ stats });
  assert.equal(Number(h.field('detected-count').textContent), 10);
  assert.equal(Number(h.field('skipped-count').textContent), 2);
  Object.assign(stats, { detected: 15, skipped: 4 });
  h.setAuth('signed-out');
  h.poll();
  assert.equal(Number(h.field('detected-count').textContent), 15);
  assert.equal(Number(h.field('skipped-count').textContent), 4);
  assert.equal(h.field('status').textContent, 'Sign in Required');
  assert.equal(h.field('signin-notice').hidden, false);
  for (const id of ['threshold-select', 'enable-filter', 'enable-home-filter', 'enable-watch-filter']) {
    assert.equal(h.field(id).disabled, true, id);
  }
  h.setAuth('signed-in');
  h.poll();
  assert.equal(h.field('signin-notice').hidden, true);
  assert.equal(h.field('enable-filter').disabled, false);
  assert.equal(h.field('status').textContent, 'Main + Watch · 1 Month+');
});

test('saved repeat settings are restored and identified as a home rule', () => {
  const h = harness({ storage: { repeat_filter_enabled: true, repeat_exposure_threshold: 8 } });
  assert.equal(h.field('enable-repeat-filter').checked, true);
  assert.equal(h.field('repeat-threshold').value, '8');
  assert.equal(h.field('repeat-threshold').disabled, false);
  assert.match(h.field('status').textContent, /Home repeats 8\+/);
});

test('enabling and changing the repeat rule save through background only', () => {
  const h = harness();
  h.field('enable-repeat-filter').checked = true;
  h.field('enable-repeat-filter').change();
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].message)), {
    action: 'setRepeatFilter', enabled: true, threshold: 3
  });
  assert.equal(h.field('enable-repeat-filter').disabled, true);
  h.respond();
  h.field('repeat-threshold').value = '5';
  h.field('repeat-threshold').change();
  assert.equal(h.requests[1].message.threshold, 5);
  assert.doesNotMatch(h.field('status').textContent, /Home repeats 5\+/);
  h.respond();
  assert.match(h.field('status').textContent, /Home repeats 5\+/);
  assert.equal(h.writes.length, 0);
});

test('invalid repeat thresholds never reach background', () => {
  const h = harness({ storage: { repeat_filter_enabled: true } });
  for (const value of ['', '1', '2.5', 'NaN', '9007199254740992']) {
    h.field('repeat-threshold').value = value;
    h.field('repeat-threshold').change();
    assert.equal(h.requests.length, 0);
    assert.equal(h.field('repeat-filter-error').hidden, false);
    assert.equal(h.field('repeat-threshold').getAttribute('aria-invalid'), 'true');
  }
});

test('saving failure restores the previous rule and shows an error', () => {
  for (const error of [null, { message: 'Service worker unavailable' }]) {
    const h = harness({ storage: { repeat_filter_enabled: true, repeat_exposure_threshold: 7 } });
    h.field('repeat-threshold').value = '4';
    h.field('repeat-threshold').change();
    h.respond({ success: false, error: 'storage_failed' }, error);
    assert.equal(h.field('repeat-threshold').value, '7');
    assert.equal(h.field('enable-repeat-filter').checked, true);
    assert.equal(h.field('repeat-filter-error').hidden, false);
    assert.match(h.field('status').textContent, /Home repeats 7\+/);
  }
});

test('repeat controls follow global, home, and sign-in availability', () => {
  for (const options of [
    { storage: { filter_enabled: false } },
    { storage: { home_filter_enabled: false } },
    { authState: 'signed-out' }
  ]) {
    const h = harness(options);
    assert.equal(h.field('enable-repeat-filter').disabled, true);
    assert.equal(h.field('repeat-threshold').disabled, true);
  }
  const h = harness({ storage: { repeat_filter_enabled: true } });
  h.field('enable-home-filter').checked = false;
  h.field('enable-home-filter').change();
  assert.equal(h.field('enable-repeat-filter').disabled, true);
  assert.doesNotMatch(h.field('status').textContent, /Home repeats/);
});

test('the repeat rule can still be turned off after invalid input', () => {
  const h = harness({ storage: { repeat_filter_enabled: true, repeat_exposure_threshold: 4 } });
  h.field('repeat-threshold').value = '';
  h.field('repeat-threshold').change();
  h.field('enable-repeat-filter').checked = false;
  h.field('enable-repeat-filter').change();
  assert.equal(h.requests[0].message.enabled, false);
  assert.equal(h.requests[0].message.threshold, 4);
  h.respond();
  assert.equal(h.field('repeat-threshold').value, '4');
  assert.equal(h.field('repeat-threshold').disabled, true);
});
