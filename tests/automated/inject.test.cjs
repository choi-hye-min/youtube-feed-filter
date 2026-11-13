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
      if (selector === '#content') return this.getAttribute('id') === 'content';
      if (selector === 'yt-lockup-metadata-view-model button, ytd-menu-renderer button') {
        return this.kind === 'button' && ['metadata', 'menu'].includes(this.parentElement?.kind);
      }
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
    scrollIntoView() { window.scrollTo(0, 1000); }
    click() { this.onClick?.(); }
  }
  class HTMLElement extends Element {
    focus(options) {
      document.activeElement = this;
      document.dispatchEvent({ type: 'focusin', target: this, isTrusted: true });
      if (!options?.preventScroll) this.scrollIntoView();
    }
  }
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
    activeElement: body,
    querySelector(selector) {
      if (selector === 'ytd-app') return app;
      return body.querySelector(selector);
    },
    querySelectorAll: (selector) => body.querySelectorAll(selector)
  });
  const window = events({
    location: { href: 'https://www.youtube.com/', pathname: '/', origin: 'https://www.youtube.com' },
    scrollX: 0, scrollY: 200,
    scrollTo(x, y) { scrolls.push([x, y]); this.scrollX = x; this.scrollY = y; },
    scrollBy(x, y) { this.scrollTo(this.scrollX + x, this.scrollY + y); }
  });
  const nativeMethods = { focus: HTMLElement.prototype.focus, scrollIntoView: Element.prototype.scrollIntoView,
    scrollTo: window.scrollTo, scrollBy: window.scrollBy };
  class Event { constructor(type, init) { this.type = type; Object.assign(this, init); } }
  const context = vm.createContext({
    window, document, Element, HTMLElement, URL, AbortController, CustomEvent: Event,
    chrome: { runtime: { sendMessage() {} } },
    console: { log() {}, error: (...args) => errors.push(args) },
    setTimeout(callback, ms) { const id = ++nextTimer; timers.set(id, { time: now + ms, callback }); return id; },
    clearTimeout: (id) => timers.delete(id), clearInterval: (id) => timers.delete(id)
  });
  vm.runInContext(source, context);
  const guardedMethods = { focus: HTMLElement.prototype.focus, scrollIntoView: Element.prototype.scrollIntoView };
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
  function assertMethodsRestored() {
    assert.equal(HTMLElement.prototype.focus, guardedMethods.focus);
    assert.equal(Element.prototype.scrollIntoView, guardedMethods.scrollIntoView);
    assert.equal(window.scrollTo, nativeMethods.scrollTo);
    assert.equal(window.scrollBy, nativeMethods.scrollBy);
  }
  function assertRestored() {
    assertMethodsRestored();
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
    let menuClicks = 0;
    button.onClick = () => { menuClicks++; popup.visible = true; };
    item.onClick = () => { clicks++; onFeedback(); popup.visible = false; };
    return { popup, item, clicks: () => clicks, menuClicks: () => menuClicks };
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
  return { node, body, parent, card, link, document, window, app, responses, commands, errors, scrolls, nativeMethods,
    request, cancel, advance, assertRestored, assertMethodsRestored, ui, createRuntime,
    setResolver: (resolver) => { resolveCommand = resolver; } };
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

test('reads current view-model signals and dispatches the exact labeled command with its menu context', async () => {
  for (const page of ['home', 'watch']) {
    for (const property of ['rawProps', 'componentProps']) {
      for (const label of ['관심 없음', 'Not interested']) {
        const h = harness();
        h.card.data = null;
        if (page === 'watch') {
          h.window.location.pathname = '/watch';
          h.window.location.href = 'https://www.youtube.com/watch?v=playing';
        }
        const renderer = page === 'home' ? h.card.append(h.node('card')) : h.card;
        const item = (title, command) => ({ listItemViewModel: {
          title: { content: title },
          rendererContext: { commandContext: { onTap: { innertubeCommand: command } } }
        } });
        renderer[property] = { data: () => ({ metadata: { lockupMetadataViewModel: {
          menuButton: { buttonViewModel: { onTap: { innertubeCommand: { showSheetCommand: {
            panelLoadingStrategy: { inlineContent: { sheetViewModel: { content: { listViewModel: {
              listItems: [item('채널 추천 안함', { feedbackEndpoint: { feedbackToken: 'block-channel' } }),
                item(label, feedback)]
            } } } } }
          } } } } }
        } } }) };
        const thumbnailButton = renderer.append(h.node('button'));
        const menuButton = renderer.append(h.node('metadata')).append(h.node('button'));
        thumbnailButton.onClick = menuButton.onClick = () => assert.fail('Card controls must not be clicked');
        h.app.resolveCommand = undefined;
        let calls = 0;
        h.app.handleCommandWithCommandHandler = function(command, target) {
          assert.equal(arguments.length, 2);
          assert.equal(this, h.app);
          assert.equal(command, feedback);
          assert.equal(target, menuButton);
          calls++;
          h.card.append(h.node('result'));
        };
        h.request();
        await h.advance();
        assert.equal(calls, 1);
        assert.equal(h.responses[0].success, true);
        assert.equal(h.responses[0].method, 'api');
        h.assertRestored();
      }
    }
  }
});

test('the current command handler waits for a real hidden result and restores browsing methods immediately', async () => {
  for (const resultAppears of [false, true]) {
    const h = harness();
    const input = h.body.append(h.node('input'));
    input.focus({ preventScroll: true });
    const menuButton = h.card.append(h.node('menu')).append(h.node('button'));
    h.app.resolveCommand = null;
    let calls = 0;
    h.app.handleCommandWithCommandHandler = function(command, target) {
      assert.equal(command, feedback);
      assert.equal(target, menuButton);
      calls++;
      target.focus();
      target.scrollIntoView();
      h.window.scrollTo(0, 500);
      h.window.scrollBy(0, 300);
    };
    h.request();
    h.assertMethodsRestored();
    assert.equal(h.document.activeElement, input);
    assert.equal(h.window.scrollY, 200);
    assert.deepEqual(h.scrolls, []);
    assert.equal(h.responses.length, 0);
    const otherInput = h.body.append(h.node('input'));
    otherInput.focus({ preventScroll: true });
    h.window.scrollTo(0, 650);
    if (resultAppears) h.card.append(h.node('result'));
    await h.advance();
    assert.equal(calls, 1);
    assert.equal(h.responses[0].success, resultAppears);
    assert.equal(h.responses[0].method, resultAppears ? 'api' : 'result_timeout');
    assert.equal(h.document.activeElement, otherInput);
    assert.equal(h.window.scrollY, 650);
    h.assertRestored();
  }
});

test('the current command handler receives the card when no menu button is present', async () => {
  const h = harness();
  h.card.data = null;
  h.card.rawProps = { data: menuData() };
  h.app.resolveCommand = {};
  h.app.resolve = null;
  h.app.handleCommandWithCommandHandler = function(command, target) {
    assert.equal(command, feedback);
    assert.equal(target, h.card);
    h.card.append(h.node('result'));
  };
  h.request();
  await h.advance();
  assert.equal(h.responses[0].success, true);
  h.assertRestored();
});

test('keeps looking through existing data sources when outer card data has no command', async () => {
  for (const attach of [
    (h) => { h.card.__data = { data: menuData() }; },
    (h) => { h.card.__data = menuData(); },
    (h) => { h.card.append(h.node('card')).data = menuData(); },
    (h) => { h.card.append(h.node('card')).__data = { data: menuData() }; },
    (h) => {
      const content = h.card.append(h.node('content'));
      content.setAttribute('id', 'content');
      content.data = menuData();
    }
  ]) {
    const h = harness();
    h.card.data = { title: 'Outer metadata only' };
    attach(h);
    h.setResolver(() => h.card.append(h.node('result')));
    h.request();
    await h.advance();
    assert.equal(h.commands[0], feedback);
    assert.equal(h.responses[0].success, true);
    h.assertRestored();
  }
});

test('missing or non-callable resolvers never fall back to menu clicks', async () => {
  for (const resolver of [undefined, null, {}]) {
    const h = harness();
    const ui = h.ui();
    h.card.data = menuData();
    h.app.resolveCommand = resolver;
    h.app.resolve = resolver;
    h.request();
    await h.advance();
    assert.equal(h.responses[0].method, 'missing_resolver');
    assert.equal(h.responses[0].success, false);
    assert.equal(ui.menuClicks(), 0);
    assert.equal(ui.clicks(), 0);
    assert.equal(ui.popup.visible, false);
    h.assertRestored();
  }
});

test('uses the callable resolve alternative when resolveCommand is unavailable', async () => {
  const h = harness();
  h.app.resolveCommand = {};
  h.app.resolve = function(command) {
    assert.equal(this, h.app);
    assert.equal(command, feedback);
    h.card.append(h.node('result'));
  };
  h.request();
  await h.advance();
  assert.equal(h.responses[0].success, true);
  h.assertRestored();
});

test('legacy resolvers retain their one-argument contract when the current handler is also available', async () => {
  for (const method of ['resolveCommand', 'resolve']) {
    const h = harness();
    h.app.resolveCommand = undefined;
    h.card.append(h.node('metadata')).append(h.node('button'));
    h.app.handleCommandWithCommandHandler = () => assert.fail('Do not submit the same feedback twice');
    h.app[method] = function(command) {
      assert.equal(arguments.length, 1);
      assert.equal(command, feedback);
      assert.equal(this, h.app);
      h.card.append(h.node('result'));
    };
    h.request();
    await h.advance();
    assert.equal(h.responses[0].success, true);
    h.assertRestored();
  }
});

test('command execution preserves focus and scroll on both home and watch', async () => {
  for (const page of ['home', 'watch']) {
    const h = harness();
    if (page === 'watch') {
      h.window.location.pathname = '/watch';
      h.window.location.href = 'https://www.youtube.com/watch?v=playing';
    }
    const input = h.body.append(h.node('input'));
    input.focus({ preventScroll: true });
    h.setResolver(() => {
      h.card.focus();
      h.card.scrollIntoView();
      h.window.scrollTo(0, 500);
      h.window.scrollBy(0, 300);
      h.card.append(h.node('result'));
    });
    h.request();
    h.assertMethodsRestored();
    await h.advance();
    assert.equal(h.responses[0].success, true);
    assert.equal(h.document.activeElement, input);
    assert.equal(h.window.scrollY, 200);
    assert.deepEqual(h.scrolls, []);
    h.assertRestored();
  }
});

test('waiting and finishing never overwrite the users latest focus or scroll position', async () => {
  for (const outcome of ['success', 'result_timeout', 'cancelled', 'stale_page']) {
    const h = harness();
    h.request();
    h.assertMethodsRestored();
    const input = h.body.append(h.node('input'));
    input.focus({ preventScroll: true });
    h.window.scrollTo(0, 650);
    h.window.scrollBy(0, 50);
    if (outcome === 'success') h.card.append(h.node('result'));
    if (outcome === 'cancelled') h.cancel();
    if (outcome === 'stale_page') h.document.dispatchEvent({ type: 'yt-navigate-start' });
    await h.advance();
    assert.equal(h.responses[0].success, outcome === 'success');
    assert.equal(h.responses[0].method, outcome === 'success' ? 'api' : outcome);
    assert.equal(h.document.activeElement, input);
    assert.equal(h.window.scrollY, 700);
    assert.deepEqual(h.scrolls, [[0, 650], [0, 700]]);
    h.assertRestored();
  }
});

test('late automatic result focus and scrolling cannot steal input before confirmation or after completion', async () => {
  for (const position of ['inside', 'replacement', 'before', 'after']) {
    const h = harness();
    const boundary = h.node('card');
    boundary.parentElement = h.parent;
    h.parent.children.unshift(boundary);
    h.parent.append(h.node('card'));
    const input = h.body.append(h.node('input'));
    input.focus({ preventScroll: true });
    h.request();
    const result = h.node('result');
    if (position === 'inside') h.card.append(result);
    else if (position === 'replacement') h.card.replaceWith(result);
    else {
      h.card.visible = false;
      result.parentElement = h.parent;
      h.parent.children.splice(h.parent.children.indexOf(h.card) + (position === 'before' ? 0 : 1), 0, result);
    }
    const undo = result.append(h.node('button'));
    undo.focus();
    undo.scrollIntoView();
    result.scrollIntoView();
    assert.equal(h.responses.length, 0);
    assert.equal(h.document.activeElement, input);
    assert.equal(h.window.scrollY, 200);
    assert.deepEqual(h.scrolls, []);
    await h.advance();
    assert.equal(h.responses[0].success, true);
    h.window.scrollTo(0, 650);
    undo.focus();
    result.scrollIntoView();
    assert.equal(h.document.activeElement, input);
    assert.equal(h.window.scrollY, 650);
    assert.deepEqual(h.scrolls, [[0, 650]]);
    h.assertRestored();
  }
});

test('unrelated focus and scroll keep native behavior while a feedback result is pending', async () => {
  const h = harness();
  h.request();
  const input = h.body.append(h.node('input'));
  input.focus({ preventScroll: true });
  assert.equal(h.document.activeElement, input);
  assert.equal(h.window.scrollY, 200);
  const player = h.body.append(h.node('player'));
  player.focus();
  assert.equal(h.document.activeElement, player);
  assert.equal(h.window.scrollY, 1000);
  h.window.scrollTo(0, 300);
  input.scrollIntoView();
  assert.equal(h.window.scrollY, 1000);
  h.window.scrollBy(0, 25);
  assert.equal(h.window.scrollY, 1025);
  assert.deepEqual(h.scrolls, [[0, 1000], [0, 300], [0, 1000], [0, 1025]]);
  h.cancel();
  await h.advance();
  h.assertRestored();
});

test('manual existing results and another cards results retain native focus and scrolling', async () => {
  for (const placement of ['existing', 'neighbor']) {
    const h = harness();
    const neighbor = h.parent.append(h.node('card'));
    const result = placement === 'existing' ? h.card.append(h.node('result')) : h.node('result');
    h.request();
    if (placement === 'neighbor') neighbor.append(result);
    const undo = result.append(h.node('button'));
    undo.focus();
    assert.equal(h.document.activeElement, undo);
    assert.equal(h.window.scrollY, 1000);
    h.window.scrollTo(0, 300);
    result.scrollIntoView();
    assert.equal(h.window.scrollY, 1000);
    h.cancel();
    await h.advance();
    h.assertRestored();
  }
});

test('trusted result interaction releases protection for that action even before first registration', async () => {
  for (const interaction of ['pointerdown', 'keydown', 'native-focus']) {
    for (const alreadyProtected of [false, true]) {
      const h = harness();
      const input = h.body.append(h.node('input'));
      input.focus({ preventScroll: true });
      h.request();
      const result = h.card.append(h.node('result'));
      const undo = result.append(h.node('button'));
      if (alreadyProtected) {
        undo.focus();
        assert.equal(h.document.activeElement, input);
      }
      if (interaction === 'native-focus') h.nativeMethods.focus.call(undo, { preventScroll: true });
      else h.document.dispatchEvent({ type: interaction, target: undo, isTrusted: true });
      input.focus({ preventScroll: true });
      undo.focus();
      assert.equal(h.document.activeElement, undo);
      assert.equal(h.window.scrollY, 1000);
      input.focus({ preventScroll: true });
      h.window.scrollTo(0, 650);
      await h.advance();
      assert.equal(h.responses[0].success, true);
      undo.scrollIntoView();
      undo.focus();
      assert.equal(h.document.activeElement, undo);
      assert.equal(h.window.scrollY, 1000);
      h.assertRestored();
    }
  }
});

test('a later automatic action protects a previously released and reused hidden result', async () => {
  const h = harness();
  const input = h.body.append(h.node('input'));
  input.focus({ preventScroll: true });
  let result;
  h.setResolver(() => { result = h.card.append(h.node('result')); });
  h.request();
  await h.advance();
  const undo = result.append(h.node('button'));
  h.document.dispatchEvent({ type: 'pointerdown', target: undo, isTrusted: true });
  result.visible = false;
  h.link.href = 'https://www.youtube.com/watch?v=replacement';
  input.focus({ preventScroll: true });
  h.window.scrollTo(0, 650);
  h.setResolver(() => { result.visible = true; });
  h.request('request-2', { targetVideoId: 'replacement' });
  undo.focus();
  assert.equal(h.document.activeElement, input);
  assert.equal(h.window.scrollY, 650);
  await h.advance();
  assert.equal(h.responses[1].success, true);
  assert.equal(result.getAttribute('data-youtube-skip-result-id'), 'request-2');
  undo.focus();
  result.scrollIntoView();
  assert.equal(h.document.activeElement, input);
  assert.equal(h.window.scrollY, 650);
  h.assertRestored();
});

test('untrusted events cannot release automatic result protection', async () => {
  const h = harness();
  const input = h.body.append(h.node('input'));
  input.focus({ preventScroll: true });
  h.request();
  const result = h.card.append(h.node('result'));
  const undo = result.append(h.node('button'));
  for (const type of ['pointerdown', 'keydown', 'focusin']) {
    h.document.dispatchEvent({ type, target: undo, isTrusted: false });
    undo.focus();
    undo.scrollIntoView();
    assert.equal(h.document.activeElement, input);
    assert.equal(h.window.scrollY, 200);
  }
  await h.advance();
  assert.equal(h.responses[0].success, true);
  h.assertRestored();
});

test('a reused card does not gain automatic result protection for its replacement video', async () => {
  const h = harness();
  h.request();
  h.link.href = 'https://www.youtube.com/watch?v=replacement';
  const result = h.card.append(h.node('result'));
  const undo = result.append(h.node('button'));
  undo.focus();
  assert.equal(h.document.activeElement, undo);
  assert.equal(h.window.scrollY, 1000);
  await h.advance();
  assert.equal(h.responses[0].method, 'stale_target');
  h.assertRestored();
});

test('missing, label-only and icon-only commands leave the card and menus untouched', async () => {
  for (const data of [null, { title: { content: 'Not interested' } }, { icon: { iconType: 'NOT_INTERESTED' } }]) {
    const h = harness();
    const ui = h.ui(() => h.card.append(h.node('result')));
    h.card.data = data;
    h.request();
    await h.advance();
    assert.equal(h.commands.length, 0);
    assert.equal(ui.menuClicks(), 0);
    assert.equal(ui.clicks(), 0);
    assert.equal(ui.popup.visible, false);
    assert.equal(h.responses[0].success, false);
    assert.equal(h.responses[0].method, 'missing_command');
    assert.equal(h.card.querySelector('.ytDismissibleItemReplacedContent'), null);
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

test('a resolver call without a hidden result fails and releases the action lock', async () => {
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

test('cancellation while waiting for a command result does not confirm success', async () => {
  const h = harness();
  h.request();
  h.cancel();
  await h.advance();
  assert.equal(h.commands.length, 1);
  assert.equal(h.responses[0].success, false);
  assert.equal(h.responses[0].method, 'cancelled');
  h.assertRestored();
});

test('same-path watch navigation stops waiting for the old command result', async () => {
  const h = harness();
  h.window.location.pathname = '/watch';
  h.window.location.href = 'https://www.youtube.com/watch?v=first';
  h.request();
  h.window.location.href = 'https://www.youtube.com/watch?v=second';
  await h.advance();
  assert.equal(h.commands.length, 1);
  assert.equal(h.responses[0].method, 'stale_page');
  assert.equal(h.scrolls.length, 0);
  h.assertRestored();
});

test('navigation start cancels pending work even before the URL changes', async () => {
  const h = harness();
  h.request();
  h.document.dispatchEvent({ type: 'yt-navigate-start' });
  await h.advance();
  assert.equal(h.commands.length, 1);
  assert.equal(h.responses[0].method, 'stale_page');
  h.assertRestored();
});

test('rejects a reused card while waiting for the original command result', async () => {
  const h = harness();
  h.request();
  h.link.href = 'https://www.youtube.com/watch?v=replacement';
  await h.advance();
  assert.equal(h.commands.length, 1);
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
  h.card.data = menuData();
  ui.popup.visible = true;
  h.request();
  await h.advance();
  assert.equal(h.responses[0].method, 'menu_busy');
  assert.equal(h.commands.length, 0);
  assert.equal(ui.clicks(), 0);
  assert.equal(ui.popup.visible, true);
  h.assertRestored();
});

test('resolver failures restore patches without leaving an unhandled rejection', async () => {
  for (const resolver of [() => { throw new Error('failed'); }, () => Promise.reject(new Error('failed'))]) {
    const h = harness();
    h.setResolver(resolver);
    h.request();
    await h.advance();
    assert.equal(h.responses[0].success, false);
    assert.equal(h.responses[0].method, 'command_failed');
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

test('shared runtime never resubmits an unconfirmed or rejected command automatically', async () => {
  for (const resolver of [() => {}, () => Promise.reject(new Error('rejected'))]) {
    const h = harness(true);
    h.setResolver(resolver);
    const runtime = h.createRuntime();
    runtime.apply();
    await h.advance(10000);
    runtime.apply();
    await h.advance();
    assert.equal(h.commands.length, 1);
    assert.equal(h.window.YouTubeSkipShared.getStats().skipped, 0);
    assert.equal(h.card.getAttribute('data-youtube-skip-home-processed'), 'failed');
    h.assertRestored();
  }
});

test('shared runtime stop cancels the MAIN-world result wait without counting a skip', async () => {
  const h = harness(true);
  const runtime = h.createRuntime();
  runtime.apply();
  runtime.stop();
  await h.advance();
  assert.equal(h.commands.length, 1);
  assert.equal(h.responses[0].method, 'cancelled');
  assert.equal(h.window.YouTubeSkipShared.getStats().skipped, 0);
  assert.equal(h.card.getAttribute('data-youtube-skip-home-processed'), null);
  assert.equal(h.errors.length, 0);
  h.assertRestored();
});
