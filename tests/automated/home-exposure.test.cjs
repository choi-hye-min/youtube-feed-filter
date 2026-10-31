const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/content-home.js'), 'utf8');

function card(id = 'video') {
  return {
    id, isConnected: true, hidden: false, hiddenAncestor: false,
    inHome: true, hasLayout: true, visibility: 'visible', rectReads: 0,
    rect: { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 },
    closest(selector) {
      if (selector === '[hidden]') return this.hiddenAncestor ? {} : null;
      return this.inHome ? {} : null;
    },
    getClientRects() { return this.hasLayout ? [this.rect] : []; },
    getBoundingClientRect() {
      this.rectReads++;
      return this.rect;
    }
  };
}

function harness() {
  const listeners = new Map();
  const exposures = [];
  let intersection;
  const document = {
    visibilityState: 'visible',
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    }
  };
  const window = {
    YouTubeSkipShared: {}, innerWidth: 1000, innerHeight: 1000,
    getComputedStyle: element => ({ visibility: element.visibility })
  };
  class IntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.elements = new Set();
      this.observeCalls = 0;
      this.disconnected = false;
      intersection = this;
    }
    observe(element) { this.elements.add(element); this.observeCalls++; }
    unobserve(element) { this.elements.delete(element); }
    disconnect() { this.elements.clear(); this.disconnected = true; }
  }
  vm.runInNewContext(source, { window, document, IntersectionObserver });
  const observer = window.YouTubeSkipHome.createExposureObserver(element => exposures.push(element.id));
  return {
    observer, intersection, exposures, document, listeners,
    intersect(element, ratio, isIntersecting = ratio > 0) {
      intersection.callback([{ target: element, intersectionRatio: ratio, isIntersecting }]);
    },
    visibility(state) {
      document.visibilityState = state;
      listeners.get('visibilitychange')?.();
    }
  };
}

test('records a home card only when at least half intersects the viewport', () => {
  const h = harness();
  const target = card();
  h.observer.observe(target);
  h.intersect(target, 0);
  h.intersect(target, 0.49);
  h.intersect(target, 1, false);
  assert.deepEqual(h.exposures, []);
  h.intersect(target, 0.5);
  assert.deepEqual(h.exposures, ['video']);
  assert.equal(h.intersection.options.threshold, 0.5);
});

test('refresh checks current bounds without scanning offscreen card rectangles', () => {
  const h = harness();
  const target = card();
  const offscreen = card('offscreen');
  h.observer.observe(target);
  h.observer.observe(offscreen);
  h.intersect(target, 1);
  target.rect = { left: 0, top: -51, right: 100, bottom: 49, width: 100, height: 100 };
  h.observer.refresh();
  assert.deepEqual(h.exposures, ['video']);
  target.rect.top = -50;
  target.rect.bottom = 50;
  h.observer.refresh();
  assert.deepEqual(h.exposures, ['video', 'video']);
  assert.equal(offscreen.rectReads, 0);
});

test('hidden cards and cached page DOM never report exposure', () => {
  for (const change of [
    target => { target.hidden = true; },
    target => { target.hiddenAncestor = true; },
    target => { target.hasLayout = false; },
    target => { target.visibility = 'hidden'; },
    target => { target.inHome = false; }
  ]) {
    const h = harness();
    const target = card();
    change(target);
    h.observer.observe(target);
    h.intersect(target, 1);
    h.observer.refresh();
    assert.deepEqual(h.exposures, []);
  }
});

test('a card moved outside the home is excluded on refresh', () => {
  const h = harness();
  const target = card();
  h.observer.observe(target);
  h.intersect(target, 1);
  target.inHome = false;
  h.observer.refresh();
  assert.deepEqual(h.exposures, ['video']);
});

test('a hidden tab reports its visible card when the tab becomes visible', () => {
  const h = harness();
  const target = card();
  h.visibility('hidden');
  h.observer.observe(target);
  h.intersect(target, 1);
  h.observer.refresh();
  assert.deepEqual(h.exposures, []);
  h.visibility('visible');
  assert.deepEqual(h.exposures, ['video']);
});

test('refresh reports a recycled visible card without observing it twice', () => {
  const h = harness();
  const target = card('first');
  h.observer.observe(target);
  h.intersect(target, 1);
  target.id = 'second';
  h.observer.observe(target);
  h.observer.refresh();
  assert.deepEqual(h.exposures, ['first', 'second']);
  assert.equal(h.intersection.observeCalls, 1);
});

test('detached cards are released even if they were never visible', () => {
  const h = harness();
  const target = card();
  h.observer.observe(target);
  target.isConnected = false;
  h.observer.refresh();
  h.intersect(target, 1);
  assert.equal(h.intersection.elements.size, 0);
  assert.deepEqual(h.exposures, []);
});

test('disconnect removes listeners and prevents pending or future callbacks', () => {
  const h = harness();
  const target = card();
  h.observer.observe(target);
  h.intersect(target, 1);
  h.observer.disconnect();
  h.intersect(target, 1);
  h.observer.refresh();
  h.visibility('visible');
  h.observer.observe(card('later'));
  assert.deepEqual(h.exposures, ['video']);
  assert.equal(h.intersection.disconnected, true);
  assert.equal(h.intersection.elements.size, 0);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.intersection.observeCalls, 1);
});
