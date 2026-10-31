const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/popup.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../src/popup.html'), 'utf8');

function harness({ storage = {}, authState = 'signed-in' } = {}) {
  const elements = new Map();
  const requests = [];
  const writes = [];
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
          ? { authState } : { detected: 10, skipped: 2 })
      }
    },
    setInterval() {}, clearInterval() {}
  });
  return { elements, requests, writes, runtime,
    field: id => elements.get(id),
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
