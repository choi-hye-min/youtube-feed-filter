const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/inject.js'), 'utf8');
const sharedSource = fs.readFileSync(path.join(__dirname, '../../src/content-shared.js'), 'utf8');
const feedback = { feedbackEndpoint: { feedbackToken: 'not-interested' } };
const menuData = () => ({ menu: { items: [{ text: { simpleText: 'Not interested' }, serviceEndpoint: feedback }] } });

function harness(withShared = false) {
  const timers = new Map();
  let now = 0;
  let nextTimer = 0;
  const responses = [];
  const commands = [];
  const errors = [];
  const scrolls = [];
  function events(target) {
    const listeners = new Map();
    target.addEventListener = (name, callback) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    };
    target.removeEventListener = (name, callback) => listeners.get(name)?.delete(callback);
    target.dispatchEvent = (event) => {
      for (const callback of listeners.get(event.type) || []) callback(event);
    };
    return target;
  }
  class Element {
    constructor(kind) {
      this.kind = kind;
      this.children = [];
      this.parentElement = null;
      this.attributes = {};
      this.dataset = {};
      Object.defineProperty(this.dataset, 'youtubeSkipId', {
        get: () => this.getAttribute('data-youtube-skip-id'),
        set: (value) => this.setAttribute('data-youtube-skip-id', value)
      });
      this.visible = true;
      this.textContent = '';
    }
    get isConnected() { return this.root || Boolean(this.parentElement?.isConnected); }
    get offsetWidth() { return this.getClientRects().length ? 100 : 0; }
    get offsetHeight() { return this.getClientRects().length ? 100 : 0; }
    get previousElementSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) - 1] || null; }
    get nextElementSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null; }
    getClientRects() {
      const parentVisible = !this.parentElement || this.parentElement.getClientRects().length > 0;
      return this.visible && this.isConnected && parentVisible ? [1] : [];
    }
    append(child) { child.parentElement = this; this.children.push(child); return child; }
    replaceWith(replacement) {
      const parent = this.parentElement;
      parent.children.splice(parent.children.indexOf(this), 1, replacement);
      replacement.parentElement = parent;
      this.parentElement = null;
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] || null; }
    removeAttribute(name) { delete this.attributes[name]; }
    matches(selector) {
      const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
      if (attribute) return attribute[2] === undefined
        ? Object.hasOwn(this.attributes, attribute[1]) : this.attributes[attribute[1]] === attribute[2];
      if (selector === '.ytDismissibleItemReplacedContent') return this.kind === 'result';
      if (selector.includes('a[href*="/watch?v="]')) return this.kind === 'link';
      if (selector.includes('yt-list-item-view-model')) return this.kind === 'item';
      if (selector.includes('ytd-menu-popup-renderer')) return this.kind === 'popup';
      if (selector.includes('yt-lockup-view-model')) return this.kind === 'card';
      if (selector.includes('button')) return this.kind === 'button';
      return false;
    }
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [
        ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)
      ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    contains(element) { return element === this || this.children.some((child) => child.contains(element)); }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    scrollIntoView() {}
    click() { this.onClick?.(); }
  }
  class HTMLElement extends Element { focus() {} }
  const node = (kind) => new HTMLElement(kind);
  const body = node('body');
  body.root = true;
  const parent = body.append(node('list'));
  const card = parent.append(node('card'));
  const link = card.append(node('link'));
  link.href = 'https://www.youtube.com/watch?v=target';
  card.data = menuData();
  let resolveCommand = () => {};
  const app = { resolveCommand(command) { commands.push(command); return resolveCommand(command); } };
  const document = events({
    querySelector(selector) {
      if (selector === 'ytd-app') return app;
      return body.querySelector(selector);
    },
    querySelectorAll: (selector) => body.querySelectorAll(selector)
  });
  const window = events({
    location: { href: 'https://www.youtube.com/', pathname: '/', origin: 'https://www.youtube.com' },
    scrollX: 0, scrollY: 200,
    scrollTo: (...args) => scrolls.push(args), scrollBy() {}
  });
  const originals = { focus: HTMLElement.prototype.focus, scrollIntoView: Element.prototype.scrollIntoView,
    scrollTo: window.scrollTo, scrollBy: window.scrollBy };
  class Event { constructor(type, init) { this.type = type; Object.assign(this, init); } }
  const context = vm.createContext({
    window, document, Element, HTMLElement, URL, AbortController, CustomEvent: Event, KeyboardEvent: Event,
    chrome: { runtime: { sendMessage() {} } },
    console: { log() {}, error: (...args) => errors.push(args) },
    setTimeout(callback, ms) { const id = ++nextTimer; timers.set(id, { time: now + ms, callback }); return id; },
    clearTimeout: (id) => timers.delete(id), clearInterval: (id) => timers.delete(id)
  });
  vm.runInContext(source, context);
  if (withShared) vm.runInContext(sharedSource, context);
  window.addEventListener('youtube-skip-response', (event) => responses.push(event.detail));
  document.addEventListener('keydown', () => {
    for (const popup of body.querySelectorAll('ytd-menu-popup-renderer')) popup.visible = false;
  });
  async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
  async function advance(ms = 6000) {
    await flush();
    const end = now + ms;
    while (true) {
      const pending = [...timers].filter(([, timer]) => timer.time <= end).sort((a, b) => a[1].time - b[1].time)[0];
      if (!pending) break;
      const [id, timer] = pending;
      now = timer.time;
      timers.delete(id);
      timer.callback();
      await flush();
    }
    now = end;
  }
  function request(videoId = 'request-1', overrides = {}) {
    card.setAttribute('data-youtube-skip-id', videoId);
    window.dispatchEvent(new Event('youtube-skip-action', { detail: {
      videoId, targetVideoId: 'target', pageUrl: window.location.href,
      pageType: window.location.pathname === '/watch' ? 'watch' : 'home', ...overrides
    } }));
  }
  function cancel(videoId = 'request-1') {
    window.dispatchEvent(new Event('youtube-skip-cancel', { detail: { videoId } }));
  }
  function assertRestored() {
    assert.equal(HTMLElement.prototype.focus, originals.focus);
    assert.equal(Element.prototype.scrollIntoView, originals.scrollIntoView);
    assert.equal(window.scrollTo, originals.scrollTo);
    assert.equal(window.scrollBy, originals.scrollBy);
    assert.equal(timers.size, 0);
  }
  function ui(onFeedback = () => {}) {
    card.data = null;
    const button = card.append(node('button'));
    const popup = body.append(node('popup'));
    popup.visible = false;
    const item = popup.append(node('item'));
    item.textContent = 'Not interested';
    let clicks = 0;
    button.onClick = () => { popup.visible = true; };
    item.onClick = () => { clicks++; onFeedback(); popup.visible = false; };
    return { popup, item, clicks: () => clicks };
  }
  function createRuntime() {
    card.setAttribute('aria-label', '2 weeks ago');
    return window.YouTubeSkipShared.createRuntime({
      key: 'home', matchesPath: (pathname) => pathname === '/',
      findCandidates: () => body.querySelectorAll('yt-lockup-view-model'),
      normalizeCandidate: (element) => element, isEligible: () => true,
      extractAge: (element) => window.YouTubeSkipShared.findAgeInElement(element),
      extractTitle: () => 'Target video', getActionDelay: () => 0
    }, { enabled: true, homeEnabled: true, threshold: '1week' });
  }
  return { node, body, parent, card, link, document, window, responses, commands, errors, scrolls,
    request, cancel, advance, assertRestored, ui, createRuntime, setResolver: (resolver) => { resolveCommand = resolver; } };
}

test('resolves a labeled feedback command and confirms the target hidden result', async () => {
  const h = harness();
  let result;
  h.setResolver(() => { result = h.card.append(h.node('result')); });
  h.request();
  await h.advance();
  assert.equal(h.commands[0], feedback);
  assert.equal(h.responses[0].success, true);
  assert.equal(h.responses[0].method, 'api');
  assert.equal(result.getAttribute('data-youtube-skip-result-id'), 'request-1');
  h.assertRestored();
});

test('extracts the command from the current list-item renderer context', async () => {
  const h = harness();
  h.card.data = {
    listItemViewModel: {
      title: { content: 'Not interested' },
      rendererContext: { commandContext: { onTap: { innertubeCommand: feedback } } }
    }
  };
  h.setResolver(() => h.card.append(h.node('result')));
  h.request();
  await h.advance();
  assert.equal(h.commands[0], feedback);
  assert.equal(h.responses[0].success, true);
  h.assertRestored();
});

test('label-only and icon-only data fall back to the UI instead of invoking a renderer object', async () => {
  for (const data of [{ title: { content: 'Not interested' } }, { icon: { iconType: 'NOT_INTERESTED' } }]) {
    const h = harness();
    const ui = h.ui(() => h.card.append(h.node('result')));
    h.card.data = data;
    h.request();
    await h.advance();
    assert.equal(h.commands.length, 0);
    assert.equal(ui.clicks(), 1);
    assert.equal(h.responses[0].success, true);
    h.assertRestored();
  }
});

test('does not select an unlabeled deep feedback command or an ambiguous remove icon', async () => {
  for (const ambiguous of [feedback, { icon: { iconType: 'REMOVE_CIRCLE_OUTLINE' }, serviceEndpoint: feedback }]) {
    const h = harness();
    h.card.data = ambiguous;
    for (let depth = 0; depth < 15; depth++) h.card.data = { content: h.card.data };
    h.request();
    await h.advance();
    assert.equal(h.commands.length, 0);
    assert.equal(h.responses[0].success, false);
    h.assertRestored();
  }
});

test('rejects stale request URLs and target IDs before invoking a command', async () => {
  for (const overrides of [{ pageUrl: 'https://www.youtube.com/watch?v=old' }, { targetVideoId: 'old' }]) {
    const h = harness();
    h.request('request-1', overrides);
    await h.advance();
    assert.equal(h.commands.length, 0);
    assert.equal(h.responses[0].success, false);
    h.assertRestored();
  }
});

test('a resolver call without a hidden result fails and remains retryable', async () => {
  const h = harness();
  h.request();
  await h.advance();
  assert.equal(h.responses[0].method, 'result_timeout');
  assert.equal(h.responses[0].success, false);
  h.setResolver(() => h.card.append(h.node('result')));
  h.request('request-2');
  await h.advance();
  assert.equal(h.responses[1].success, true);
  h.assertRestored();
});

test('rejects an overlapping action and restores global methods after cancellation', async () => {
  const h = harness();
  h.request();
  h.request('request-2');
  assert.equal(h.responses[0].method, 'action_busy');
  assert.equal(h.commands.length, 1);
  h.cancel();
  await h.advance();
  assert.equal(h.responses[1].method, 'cancelled');
  h.assertRestored();
});

test('cancellation while a menu is opening prevents the feedback click', async () => {
  const h = harness();
  const ui = h.ui();
  h.request();
  h.cancel();
  await h.advance();
  assert.equal(ui.clicks(), 0);
  assert.equal(ui.popup.visible, false);
  assert.equal(h.responses[0].method, 'cancelled');
  h.assertRestored();
});

test('same-path watch navigation cancels a pending menu before clicking', async () => {
  const h = harness();
  h.window.location.pathname = '/watch';
  h.window.location.href = 'https://www.youtube.com/watch?v=first';
  const ui = h.ui();
  h.request();
  h.window.location.href = 'https://www.youtube.com/watch?v=second';
  await h.advance();
  assert.equal(ui.clicks(), 0);
  assert.equal(h.responses[0].method, 'stale_page');
  assert.equal(h.scrolls.length, 0);
  h.assertRestored();
});

test('navigation start cancels pending work even before the URL changes', async () => {
  const h = harness();
  const ui = h.ui();
  h.request();
  h.document.dispatchEvent({ type: 'yt-navigate-start' });
  await h.advance();
  assert.equal(ui.clicks(), 0);
  assert.equal(h.responses[0].method, 'stale_page');
  h.assertRestored();
});

test('rejects a reused card before clicking its pending menu', async () => {
  const h = harness();
  const ui = h.ui();
  h.request();
  h.link.href = 'https://www.youtube.com/watch?v=replacement';
  await h.advance();
  assert.equal(ui.clicks(), 0);
  assert.equal(h.responses[0].method, 'stale_target');
  h.assertRestored();
});

test('confirms only a new hidden result within the target or its exact replacement slot', async () => {
  const h = harness();
  const before = h.parent.append(h.node('result'));
  h.setResolver(() => h.parent.append(h.node('result')));
  h.request();
  await h.advance();
  assert.equal(h.responses[0].success, false);
  assert.equal(before.getAttribute('data-youtube-skip-result-id'), null);
  let replacement;
  h.setResolver(() => {
    replacement = h.node('result');
    h.card.replaceWith(replacement);
  });
  h.request('request-2');
  await h.advance();
  assert.equal(h.responses[1].success, true);
  assert.equal(replacement.getAttribute('data-youtube-skip-result-id'), 'request-2');
  h.assertRestored();
});

test('accepts a pre-rendered result only when it becomes visible for this action', async () => {
  for (const initiallyVisible of [true, false]) {
    const h = harness();
    const result = h.card.append(h.node('result'));
    result.visible = initiallyVisible;
    h.setResolver(() => { result.visible = true; });
    h.request();
    await h.advance();
    assert.equal(h.responses[0].success, !initiallyVisible);
    h.assertRestored();
  }
});

test('confirms a new immediate result beside a hidden card while preserving both slot boundaries', async () => {
  for (const before of [true, false]) {
    const h = harness();
    h.parent.append(h.node('card'));
    let result;
    h.setResolver(() => {
      h.card.visible = false;
      result = h.node('result');
      result.parentElement = h.parent;
      h.parent.children.splice(h.parent.children.indexOf(h.card) + (before ? 0 : 1), 0, result);
    });
    h.request();
    await h.advance();
    assert.equal(h.responses[0].success, true);
    assert.equal(result.getAttribute('data-youtube-skip-result-id'), 'request-1');
    h.assertRestored();
  }
});

test('does not use an adjacent card result when the hidden target has no result of its own', async () => {
  const h = harness();
  const neighbor = h.parent.append(h.node('card'));
  let otherResult;
  h.setResolver(() => {
    h.card.visible = false;
    otherResult = neighbor.append(h.node('result'));
  });
  h.request();
  await h.advance();
  assert.equal(h.responses[0].success, false);
  assert.equal(otherResult.getAttribute('data-youtube-skip-result-id'), null);
  h.assertRestored();
});

test('leaves an already-open user menu untouched', async () => {
  const h = harness();
  const ui = h.ui();
  ui.popup.visible = true;
  h.request();
  await h.advance();
  assert.equal(h.responses[0].method, 'menu_busy');
  assert.equal(ui.clicks(), 0);
  assert.equal(ui.popup.visible, true);
  h.assertRestored();
});

test('a UI click also requires a visible target result', async () => {
  const h = harness();
  const ui = h.ui();
  h.request();
  await h.advance();
  assert.equal(ui.clicks(), 1);
  assert.equal(h.responses[0].method, 'result_timeout');
  assert.equal(h.responses[0].success, false);
  h.assertRestored();
});

test('UI feedback marks the confirmed result with its request ID', async () => {
  const h = harness();
  let result;
  h.ui(() => { result = h.card.append(h.node('result')); });
  h.request();
  await h.advance();
  assert.equal(h.responses[0].success, true);
  assert.equal(h.responses[0].method, 'ui');
  assert.equal(result.getAttribute('data-youtube-skip-result-id'), 'request-1');
  h.assertRestored();
});

test('resolver failures restore patches without leaving an unhandled rejection', async () => {
  for (const resolver of [() => { throw new Error('failed'); }, () => Promise.reject(new Error('failed'))]) {
    const h = harness();
    h.setResolver(resolver);
    h.request();
    await h.advance();
    assert.equal(h.responses[0].success, false);
    h.assertRestored();
  }
});

test('shared runtime and MAIN world confirm one skipped card and annotate its result', async () => {
  const h = harness(true);
  let result;
  h.setResolver(() => { result = h.card.append(h.node('result')); });
  const runtime = h.createRuntime();
  runtime.apply();
  await h.advance();
  assert.equal(h.commands.length, 1);
  assert.equal(h.responses[0].success, true);
  assert.equal(h.window.YouTubeSkipShared.getStats().skipped, 1);
  assert.equal(result.getAttribute('aria-label'), '[2주전 업로드] Target video');
  assert.equal(result.getAttribute('data-youtube-skip-result-id'), h.responses[0].videoId);
  assert.equal(h.errors.length, 0);
  h.assertRestored();
});

test('shared runtime stop cancels the real MAIN-world menu wait without counting a skip', async () => {
  const h = harness(true);
  const ui = h.ui(() => h.card.append(h.node('result')));
  const runtime = h.createRuntime();
  runtime.apply();
  runtime.stop();
  await h.advance();
  assert.equal(ui.clicks(), 0);
  assert.equal(ui.popup.visible, false);
  assert.equal(h.responses[0].method, 'cancelled');
  assert.equal(h.window.YouTubeSkipShared.getStats().skipped, 0);
  assert.equal(h.card.getAttribute('data-youtube-skip-home-processed'), null);
  assert.equal(h.errors.length, 0);
  h.assertRestored();
});
