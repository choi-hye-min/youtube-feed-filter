const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/background.js'), 'utf8');
const historyKey = 'home_exposure_history';

function harness(storage = { repeat_filter_enabled: true }) {
  const listeners = {};
  const broadcasts = [];
  const reads = [];
  let readFailure = false;
  let writeFailure = false;
  let writes = 0;
  const runtime = {
    onInstalled: { addListener: callback => { listeners.installed = callback; } },
    onStartup: { addListener: callback => { listeners.startup = callback; } },
    onMessage: { addListener: callback => { listeners.message = callback; } }
  };
  function complete(callback, value, failure) {
    queueMicrotask(() => {
      if (failure) runtime.lastError = { message: 'Storage unavailable' };
      callback?.(value);
      delete runtime.lastError;
    });
  }
  vm.runInNewContext(source, {
    console: { log() {} },
    chrome: {
      runtime,
      storage: { local: {
        get(keys, callback) {
          reads.push([...keys]);
          const value = Object.fromEntries(keys.filter(key => Object.hasOwn(storage, key))
            .map(key => [key, structuredClone(storage[key])]));
          complete(callback, value, readFailure);
          readFailure = false;
        },
        set(values, callback) {
          writes++;
          const failure = writeFailure;
          writeFailure = false;
          if (!failure) Object.assign(storage, structuredClone(values));
          complete(callback, undefined, failure);
        }
      } },
      tabs: {
        query: (query, callback) => callback([{ id: 1 }, { id: 2 }]),
        sendMessage: (tabId, message) => {
          broadcasts.push({ tabId, action: message.action });
          return Promise.resolve();
        },
        onRemoved: { addListener: callback => { listeners.removed = callback; } }
      }
    }
  });
  function send(request, tabId = 1, documentId = 'document-1') {
    return new Promise(resolve => {
      const retained = listeners.message(request, { tab: { id: tabId }, documentId }, response => resolve(structuredClone(response)));
      if (retained !== true) resolve(undefined);
    });
  }
  return {
    storage, broadcasts, reads, listeners, send,
    begin: (visitId, tabId, documentId) => send({ action: 'beginHomeVisit', visitId }, tabId, documentId),
    end: (visitId, tabId, documentId) => send({ action: 'endHomeVisit', visitId }, tabId, documentId),
    record: (visitId, videoId = 'video-a', tabId, documentId) => send({ action: 'recordHomeExposure', visitId, videoId }, tabId, documentId),
    failRead: () => { readFailure = true; },
    failWrite: () => { writeFailure = true; },
    writes: () => writes
  };
}

test('repeat settings default to OFF and three without returning exposure history', async () => {
  const h = harness({ [historyKey]: { counts: { 'video-a': 9 }, visits: {} } });
  const state = await h.send({ action: 'getState' });
  assert.equal(state.repeatEnabled, false);
  assert.equal(state.repeatThreshold, 3);
  assert.equal(Object.hasOwn(state, historyKey), false);
  assert.ok(h.reads.every(keys => !keys.includes(historyKey)));
});

test('installation initializes new settings without overwriting settings or cumulative history', async () => {
  const storage = { [historyKey]: { counts: { 'video-a': 9 }, visits: {} } };
  const h = harness(storage);
  h.listeners.installed();
  await new Promise(setImmediate);
  assert.equal(storage.repeat_filter_enabled, false);
  assert.equal(storage.repeat_exposure_threshold, 3);
  storage.repeat_filter_enabled = true;
  storage.repeat_exposure_threshold = 7;
  h.listeners.installed();
  await new Promise(setImmediate);
  assert.equal(storage.repeat_filter_enabled, true);
  assert.equal(storage.repeat_exposure_threshold, 7);
  assert.equal(storage[historyKey].counts['video-a'], 9);
});

test('repeat settings validate both fields and broadcast only after a successful save', async () => {
  const h = harness();
  for (const threshold of [undefined, '', '3', 1, 0, -1, 2.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await h.send({ action: 'setRepeatFilter', enabled: true, threshold })).success, false);
  }
  assert.equal((await h.send({ action: 'setRepeatFilter', enabled: 'true', threshold: 3 })).success, false);
  assert.equal(h.writes(), 0);
  assert.equal(h.broadcasts.length, 0);
  assert.equal((await h.send({ action: 'setRepeatFilter', enabled: false, threshold: 5 })).success, true);
  const state = await h.send({ action: 'getState' });
  assert.equal(state.repeatEnabled, false);
  assert.equal(state.repeatThreshold, 5);
  assert.deepEqual(h.broadcasts, [{ tabId: 1, action: 'applyFilter' }, { tabId: 2, action: 'applyFilter' }]);
  h.failWrite();
  assert.equal((await h.send({ action: 'setRepeatFilter', enabled: true, threshold: 2 })).success, false);
  assert.equal(h.storage.repeat_exposure_threshold, 5);
  assert.equal(h.broadcasts.length, 2);
});

test('missing visits do not reset the cumulative count and a visit records a video once', async () => {
  const h = harness();
  await h.begin('visit-1');
  assert.equal((await h.record('visit-1')).count, 1);
  const writes = h.writes();
  assert.equal((await h.record('visit-1')).count, 1);
  await h.begin('visit-1');
  assert.equal((await h.record('visit-1')).count, 1);
  assert.equal(h.writes(), writes, 'Duplicate registration and exposure should not write again');
  await h.begin('visit-2');
  assert.equal((await h.record('visit-2')).count, 2);
  await h.begin('visit-3');
  await h.record('visit-3', 'another-video');
  await h.begin('visit-4');
  assert.equal((await h.record('visit-4')).count, 3);
  assert.equal(h.storage[historyKey].counts['video-a'], 3);
});

test('worker restart and a lost response cannot count a retried exposure twice', async () => {
  const first = harness();
  await first.begin('visit-1');
  await first.record('visit-1');
  const restarted = harness(first.storage);
  await restarted.begin('visit-1');
  assert.equal((await restarted.record('visit-1')).count, 1);
  assert.equal(restarted.writes(), 0);
  await restarted.begin('visit-2');
  assert.equal((await restarted.record('visit-2')).count, 2);
});

test('tabs share cumulative counts without lost updates or A-B-A duplicate increments', async () => {
  const h = harness();
  await Promise.all([h.begin('visit-a', 1), h.begin('visit-b', 2)]);
  const results = await Promise.all([h.record('visit-a', 'video-a', 1), h.record('visit-b', 'video-a', 2)]);
  assert.deepEqual(results.map(result => result.count), [1, 2]);
  assert.equal((await h.record('visit-a', 'video-a', 1)).count, 2);
  assert.equal(h.storage[historyKey].counts['video-a'], 2);
});

test('ending or replacing a visit rejects old requests without affecting the new visit', async () => {
  const h = harness();
  await h.begin('old');
  await h.record('old');
  await h.begin('new');
  await h.end('old');
  assert.equal((await h.record('old')).success, false);
  assert.equal((await h.record('new')).count, 2);
  assert.equal((await h.record('new', 'video-a', 1, 'other-document')).success, false);
  await h.end('new');
  assert.equal((await h.record('new')).success, false);
  assert.equal(h.storage[historyKey].counts['video-a'], 2);
});

test('invalid visit and video IDs cannot create exposure history', async () => {
  const h = harness();
  assert.equal((await h.begin('')).success, false);
  assert.equal((await h.begin(12)).success, false);
  assert.equal(h.writes(), 0);
  await h.begin('visit-1');
  for (const videoId of ['', null, 'watch?v=a']) {
    assert.equal((await h.record('visit-1', videoId)).success, false);
  }
  assert.equal(h.writes(), 1);
  assert.deepEqual(h.storage[historyKey].counts, {});
});

test('OFF settings stop recording and re-enabling preserves the same visit deduplication', async () => {
  const h = harness();
  await h.begin('visit-1');
  await h.record('visit-1');
  for (const key of ['filter_enabled', 'home_filter_enabled', 'repeat_filter_enabled']) {
    h.storage[key] = false;
    assert.equal((await h.record('visit-1', 'video-b')).success, false);
    h.storage[key] = true;
  }
  assert.equal((await h.record('visit-1')).count, 1);
  assert.equal((await h.record('visit-1', 'video-b')).count, 1);
});

test('failed storage operations do not acknowledge or deduplicate an uncommitted count', async () => {
  const h = harness();
  await h.begin('visit-1');
  h.failRead();
  assert.equal((await h.record('visit-1')).success, false);
  h.failWrite();
  assert.equal((await h.record('visit-1')).success, false);
  assert.equal(h.storage[historyKey].counts['video-a'], undefined);
  assert.equal((await h.record('visit-1')).count, 1);
  assert.equal((await h.record('visit-1')).count, 1);
});

test('tab close and browser startup discard visits while preserving cumulative history', async () => {
  const h = harness();
  await h.begin('visit-a', 1);
  await h.begin('visit-b', 2);
  await h.record('visit-a', 'video-a', 1);
  h.listeners.removed(1);
  assert.equal((await h.record('visit-a', 'video-a', 1)).success, false);
  assert.equal((await h.record('visit-b', 'video-a', 2)).count, 2);
  h.listeners.startup();
  assert.equal((await h.record('visit-b', 'video-a', 2)).success, false);
  await h.begin('visit-c', 1);
  assert.equal((await h.record('visit-c', 'video-a', 1)).count, 3);
});
