const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/content-shared.js'), 'utf8'), { window });
for (const name of ['content-home.js', 'content-watch.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src', name), 'utf8'), { window });
}
const { findAgeInElement } = window.YouTubeSkipShared;
const day = 24 * 60 * 60 * 1000;

function element(text = '', ariaLabel = '', children = []) {
  return {
    textContent: text,
    getAttribute: (name) => name === 'aria-label' ? ariaLabel : null,
    querySelectorAll: () => children
  };
}

test('English and Korean upload ages produce the same duration and reason label', () => {
  for (const [english, korean, ms, displayText] of [
    ['1 minute ago', '1분 전', 60000, '1분전'],
    ['12 minutes ago', '12분 전', 720000, '12분전'],
    ['1 hour ago', '1시간 전', 3600000, '1시간전'],
    ['23 hours ago', '23시간 전', 23 * 3600000, '23시간전'],
    ['1 day ago', '1일 전', day, '1일전'],
    ['5 days ago', '5일 전', 5 * day, '5일전'],
    ['1 week ago', '1주 전', 7 * day, '1주전'],
    ['2 weeks ago', '2주 전', 14 * day, '2주전'],
    ['1 month ago', '1개월 전', 30 * day, '1개월전'],
    ['3 months ago', '3개월 전', 90 * day, '3개월전'],
    ['6 months ago', '6개월 전', 180 * day, '6개월전'],
    ['1 year ago', '1년 전', 365 * day, '1년전'],
    ['2 years ago', '2년 전', 730 * day, '2년전']
  ]) {
    for (const text of [english, korean]) {
      const age = findAgeInElement(element(text));
      assert.equal(age?.ms, ms, text);
      assert.equal(age?.displayText, displayText, text);
    }
  }
});

test('published stream and premiere metadata is recognized without treating future or live labels as old uploads', () => {
  for (const text of ['Streamed 2 weeks ago', '스트리밍 시간: 2주 전', 'Premiered 2 weeks ago', '최초 공개: 2주 전']) {
    assert.equal(findAgeInElement(element(text))?.ms, 14 * day, text);
  }
  for (const text of ['', 'LIVE', '실시간', 'Scheduled for 2 days from now', '2일 후 최초 공개', '1.2M views', '조회수 120만회']) {
    assert.equal(findAgeInElement(element(text)), null, text);
  }
});

test('card and metadata accessibility labels are read, with metadata preferred over incidental age text in the title', () => {
  assert.equal(findAgeInElement(element('', 'A video, 2 weeks ago, 10K views'))?.ms, 14 * day);
  const metadata = element('조회수 1만회', '3개월 전');
  const card = element('I tried this 2 years ago\n조회수 1만회\n3개월 전', '', [metadata]);
  assert.equal(findAgeInElement(card, ['#metadata-line span'])?.ms, 90 * day);
  assert.equal(findAgeInElement(element('', '', [element('6 months ago')]), ['#metadata-line span'])?.ms, 180 * day);
});

test('home and watch titles use the heading title without the accessible playback duration', () => {
  for (const [title, ariaLabel] of [
    ['클로드 사용법', '클로드 사용법 24분'],
    ['Claude tutorial', 'Claude tutorial 24 minutes']
  ]) {
    // Current YouTube markup: h3[title] contains a title link whose aria-label adds duration.
    const heading = { textContent: title, getAttribute: name => name === 'title' ? title : null };
    const link = { textContent: title, getAttribute: name => name === 'aria-label' ? ariaLabel : null };
    const nodes = new Map([
      ['.ytLockupMetadataViewModelHeadingReset[title]', heading],
      ['.ytLockupMetadataViewModelTitle', link],
      ['a[href*="/watch?v="][aria-label]', link]
    ]);
    const card = { querySelector: selector => nodes.get(selector) || null };
    for (const adapter of [window.YouTubeSkipHome, window.YouTubeSkipWatch]) {
      assert.equal(adapter.extractTitle(card), title, adapter.key);
    }
  }
});

test('home and watch retain legacy title and accessible-link fallbacks without a modern heading', () => {
  for (const [selector, attributes, text, expected] of [
    ['#video-title', { title: 'Legacy video', 'aria-label': 'Legacy video 24 minutes' }, 'Legacy video', 'Legacy video'],
    ['#video-title', {}, 'Text-only title', 'Text-only title'],
    ['a[href*="/watch?v="][aria-label]', { 'aria-label': 'Accessible video title' }, '', 'Accessible video title']
  ]) {
    const node = { textContent: text, getAttribute: name => attributes[name] || null };
    const card = { querySelector: candidate => candidate === selector ? node : null };
    for (const adapter of [window.YouTubeSkipHome, window.YouTubeSkipWatch]) {
      assert.equal(adapter.extractTitle(card), expected, adapter.key);
    }
  }
});

test('home excludes sponsored ad slots at both outer-card and nested-renderer levels without excluding ordinary recommendations', () => {
  function node(tagName, parent = null, id = '') {
    const current = {
      tagName: tagName.toUpperCase(), parentElement: parent, children: [],
      matches(selector) {
        return selector.split(',').some(part => {
          const value = part.trim();
          return value.startsWith('#') ? id === value.slice(1) : value === tagName;
        });
      },
      closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; },
      querySelector(selector) {
        for (const child of this.children) {
          if (child.matches(selector)) return child;
          const descendant = child.querySelector(selector);
          if (descendant) return descendant;
        }
        return null;
      }
    };
    parent?.children.push(current);
    return current;
  }
  const home = node('ytd-browse');
  const sponsored = node('ytd-rich-item-renderer', home);
  const adSlot = node('ytd-ad-slot-renderer', sponsored);
  const adVideo = node('yt-lockup-view-model', adSlot);
  const ordinary = node('ytd-rich-item-renderer', home);
  const ordinaryVideo = node('yt-lockup-view-model', ordinary);
  const secondary = node('div', home, 'secondary');
  const watchVideo = node('yt-lockup-view-model', secondary);
  const adapter = window.YouTubeSkipHome;
  for (const candidate of [sponsored, adSlot, adVideo]) {
    assert.equal(adapter.isEligible(candidate), false, candidate.tagName);
    assert.equal(adapter.isEligible(adapter.normalizeCandidate(candidate)), false, `normalized ${candidate.tagName}`);
  }
  for (const candidate of [ordinary, ordinaryVideo]) {
    assert.equal(adapter.isEligible(candidate), true, candidate.tagName);
    assert.equal(adapter.isEligible(adapter.normalizeCandidate(candidate)), true, `normalized ${candidate.tagName}`);
  }
  assert.equal(adapter.isEligible(watchVideo), false);
});
