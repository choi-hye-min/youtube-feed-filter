const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/content-shared.js'), 'utf8');
const day = 86400000;
const processed = 'data-youtube-skip-home-processed';

function card(id, age) {
  const attributes = new Map();
  return {
    id, age, dataset: {}, isConnected: true, hidden: false,
    offsetWidth: 100, offsetHeight: 100, parentElement: null,
    getClientRects: () => [{}], closest: () => null,
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
    querySelector(selector) {
      if (selector.includes('/watch?v=') && this.id) {
        return { href: `https://www.youtube.com/watch?v=${this.id}` };
      }
      return null;
    }
  };
}

function harness(cards) {
  const listeners = new Map();
  const timers = new Map();
  const results = new Map();
  const actions = [];
  const cancellations = [];
  let timerId = 0;
  let now = 0;
  const window = {
    location: { pathname: '/', href: 'https://www.youtube.com/', origin: 'https://www.youtube.com' },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatchEvent(event) {
      for (const fn of [...(listeners.get(event.type) || [])]) fn(event);
    }
  };
  const document = {
    querySelectorAll: () => cards,
    querySelector: selector => results.get(selector.match(/"([^"]+)"/)?.[1]) || null
  };
  vm.runInNewContext(source, {
    window, document, chrome: { runtime: { sendMessage() {} } }, URL, console,
    CustomEvent: class {
      constructor(type, init) { this.type = type; this.detail = init.detail; }
    },
    setTimeout(fn, delay) {
      const id = ++timerId;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id)
  });
  const state = { threshold: '1week', enabled: true, homeEnabled: true, loggingEnabled: false };
  const adapter = {
    key: 'home', matchesPath: value => value === '/', findCandidates: () => cards,
    normalizeCandidate: element => element, isEligible: () => true,
    extractAge: element => element.age === null ? null : { ms: element.age * day, text: `${element.age} days ago` },
    extractTitle: element => element.id, getActionDelay: () => 0
  };
  const createRuntime = () => window.YouTubeSkipShared.createRuntime(adapter, state);
  const runtime = createRuntime();
  window.addEventListener('youtube-skip-action', event => actions.push(event.detail));
  window.addEventListener('youtube-skip-cancel', event => cancellations.push(event.detail));
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  async function advance(ms) {
    const until = now + ms;
    await flush();
    while (true) {
      const next = [...timers].filter(([, value]) => value.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
      await flush();
    }
    now = until;
  }
  function respond(action, { success = false, method = 'missing_not_interested', hidden = false } = {}) {
    let result;
    if (hidden) {
      result = { querySelectorAll: () => [], setAttribute(name, value) { this[name] = value; } };
      results.set(action.videoId, result);
    }
    window.dispatchEvent({ type: 'youtube-skip-response', detail: { videoId: action.videoId, success, method } });
    return result;
  }
  return { window, runtime, state, actions, cancellations, respond, flush, advance, createRuntime,
    stats: window.YouTubeSkipShared.getStats };
}

test('lowering the threshold re-evaluates checked cards after runtime reset', () => {
  const h = harness([card('two-weeks', 14)]);
  h.state.threshold = '1month';
  h.runtime.apply();
  assert.equal(h.actions.length, 0);
  h.runtime.stop();
  h.runtime.reset();
  h.state.threshold = '1week';
  h.createRuntime().apply();
  assert.equal(h.actions[0].targetVideoId, 'two-weeks');
  assert.equal(h.stats().detected, 1);
});

test('queued cards are checked against the latest threshold before executing', async () => {
  const h = harness([card('first', 14), card('pending', 14)]);
  h.runtime.apply();
  h.state.threshold = '1month';
  h.respond(h.actions[0]);
  await h.flush();
  assert.equal(h.actions.length, 1);
});

test('stop cancels the pending request and prevents retries and delayed applies', async () => {
  const h = harness([card('first', 14)]);
  h.runtime.apply();
  h.runtime.stop();
  h.respond(h.actions[0], { method: 'menu_busy' });
  await h.advance(10000);
  h.runtime.apply();
  assert.equal(h.actions.length, 1);
  assert.equal(h.cancellations[0].videoId, h.actions[0].videoId);
});

test('stopping releases queued cards so they can be processed after re-enabling', async () => {
  const first = card('first', 14);
  const pending = card('pending', 14);
  const h = harness([first, pending]);
  h.runtime.apply();
  h.runtime.stop();
  assert.equal(pending.getAttribute(processed), null);
  first.isConnected = false;
  h.createRuntime().apply();
  await h.flush();
  assert.equal(h.actions[1].targetVideoId, 'pending');
});

test('metadata retries do not inflate detected and late metadata can still trigger filtering', () => {
  const live = card('live', null);
  const h = harness([live]);
  h.runtime.apply();
  h.runtime.apply();
  h.runtime.apply();
  assert.equal(h.stats().detected, 1);
  assert.equal(h.actions.length, 0);
  live.age = 14;
  h.runtime.apply();
  assert.equal(h.actions.length, 1);
  assert.equal(h.stats().detected, 1);
});

test('a recycled queued DOM cannot cause a different video to be filtered', async () => {
  const reused = card('old', 14);
  const h = harness([card('first', 14), reused]);
  h.runtime.apply();
  reused.id = 'new';
  reused.age = 1;
  h.respond(h.actions[0]);
  await h.flush();
  assert.equal(h.actions.length, 1);
  h.runtime.apply();
  assert.equal(reused.getAttribute(processed), 'checked');
});

test('a replacement card with the same video ID is reacquired', async () => {
  const original = card('pending', 14);
  const cards = [card('first', 14), original];
  const h = harness(cards);
  h.runtime.apply();
  original.isConnected = false;
  const replacement = card('pending', 14);
  cards[1] = replacement;
  h.respond(h.actions[0]);
  await h.flush();
  assert.equal(h.actions[1].targetVideoId, 'pending');
  assert.equal(replacement.dataset.youtubeSkipId, h.actions[1].videoId);
});

test('nested candidates for the same video produce one queued request', async () => {
  const h = harness([card('same', 14), card('same', 14)]);
  h.runtime.apply();
  h.respond(h.actions[0]);
  await h.flush();
  assert.equal(h.actions.length, 1);
});

test('only a tagged hidden result increments skipped and receives the reason', async () => {
  const h = harness([card('old', 14)]);
  h.runtime.apply();
  const result = h.respond(h.actions[0], { success: true, method: 'api', hidden: true });
  await h.flush();
  assert.equal(h.stats().skipped, 1);
  assert.equal(result['aria-label'], '[14 days ago 업로드] old');
  h.runtime.stop();
  h.runtime.reset();
  h.createRuntime().apply();
  assert.equal(h.actions.length, 1);
  h.runtime.reset(true);
  h.createRuntime().apply();
  assert.equal(h.actions.length, 2, 'A refreshed home feed can reuse a previously completed card');
});

test('an unconfirmed success response does not count as skipped', async () => {
  const h = harness([card('old', 14)]);
  h.runtime.apply();
  h.respond(h.actions[0], { success: true, method: 'api' });
  await h.flush();
  assert.equal(h.stats().skipped, 0);
  h.runtime.stop();
});

test('a stale target response releases the card for a later scan', async () => {
  const target = card('old', 14);
  const h = harness([target]);
  h.runtime.apply();
  h.respond(h.actions[0], { method: 'stale_target' });
  await h.flush();
  assert.equal(target.getAttribute(processed), null);
  h.runtime.apply();
  assert.equal(h.actions.length, 2);
});

test('same-path navigation stops old queued work', async () => {
  const h = harness([card('first', 14), card('pending', 14)]);
  h.runtime.apply();
  h.window.location.href = 'https://www.youtube.com/?refresh=1';
  h.respond(h.actions[0]);
  await h.advance(1000);
  h.runtime.apply();
  assert.equal(h.actions.length, 1);
});

test('cards without a stable video ID never send feedback actions', () => {
  const h = harness([card(null, 14)]);
  h.runtime.apply();
  assert.equal(h.actions.length, 0);
});
