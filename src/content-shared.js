(function() {
  const THRESHOLD_PRESETS = {
    '1day': 1 * 24 * 60 * 60 * 1000,
    '2days': 2 * 24 * 60 * 60 * 1000,
    '3days': 3 * 24 * 60 * 60 * 1000,
    '4days': 4 * 24 * 60 * 60 * 1000,
    '5days': 5 * 24 * 60 * 60 * 1000,
    '1week': 7 * 24 * 60 * 60 * 1000,
    '2weeks': 14 * 24 * 60 * 60 * 1000,
    '1month': 30 * 24 * 60 * 60 * 1000,
    '3months': 90 * 24 * 60 * 60 * 1000,
    '6months': 180 * 24 * 60 * 60 * 1000
  };

  const stats = { detected: 0, skipped: 0 };
  const detectedCards = new WeakMap();

  function updateBadge() {
    chrome.runtime.sendMessage({
      action: 'updateBadge',
      detected: stats.detected,
      skipped: stats.skipped
    });
  }

  function findAgeInText(text) {
    if (!text) return null;
    const match = text.match(/(\d+)\s*(minute|hour|day|week|month|year|시간|분|일|주|달|월|년|개월)s?\s*(ago|전)/i);
    if (!match) return null;

    const unitMap = {
      '분': 'minute', '시간': 'hour', '일': 'day', '주': 'week',
      '달': 'month', '월': 'month', '개월': 'month', '년': 'year'
    };
    const unitLabelMap = {
      minute: '분',
      hour: '시간',
      day: '일',
      week: '주',
      month: '개월',
      year: '년'
    };
    const unitToMs = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000
    };
    const value = Number.parseInt(match[1], 10);
    const unit = unitMap[match[2].toLowerCase()] || match[2].toLowerCase();
    return {
      ms: value * unitToMs[unit],
      text: match[0],
      displayText: `${value}${unitLabelMap[unit] || match[2]}전`
    };
  }

  function findAgeInElement(element, selectors = []) {
    const ariaAge = findAgeInText(element.getAttribute('aria-label') || '');
    if (ariaAge) return ariaAge;

    for (const selector of selectors) {
      for (const node of element.querySelectorAll(selector)) {
        const age = findAgeInText(node.getAttribute('aria-label') || node.textContent || '');
        if (age) return age;
      }
    }

    return findAgeInText(element.innerText || element.textContent || '');
  }

  function getVideoId(element) {
    const link = element.querySelector('a[href*="/watch?v="]');
    if (!link) return null;
    return new URL(link.href, window.location.origin).searchParams.get('v');
  }

  function firstText(element, selectors) {
    for (const selector of selectors) {
      const node = element.querySelector(selector);
      const text = node?.getAttribute('title') || node?.getAttribute('aria-label') || node?.textContent;
      if (text?.trim()) return text.trim();
    }
    return '알 수 없는 제목';
  }

  function installStyles() {
    if (document.getElementById('youtube-skip-styles')) return;
    const style = document.createElement('style');
    style.id = 'youtube-skip-styles';
    style.textContent = `
      .youtube-skip-signin-notice { position:fixed; left:16px; bottom:16px; z-index:2147483647; max-width:min(360px, calc(100vw - 32px)); padding:12px 14px; border-radius:8px; background:var(--yt-spec-raised-background,#fff); border:1px solid rgba(0,0,0,.14); box-shadow:0 6px 18px rgba(0,0,0,.18); color:var(--yt-spec-text-primary,#0f0f0f); font:500 13px/1.4 Roboto,Arial,sans-serif; }
      .youtube-skip-signin-notice-title { margin-bottom:3px; font-size:14px; font-weight:700; }
      .youtube-skip-signin-notice-body { color:var(--yt-spec-text-secondary,#606060); font-weight:400; }
      html[dark] .youtube-skip-signin-notice, [dark] .youtube-skip-signin-notice { background:var(--yt-spec-raised-background,#212121); border-color:rgba(255,255,255,.18); color:var(--yt-spec-text-primary,#f1f1f1); }
      html[dark] .youtube-skip-signin-notice-body, [dark] .youtube-skip-signin-notice-body { color:var(--yt-spec-text-secondary,#aaa); }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function showSignInNotice() {
    installStyles();
    if (document.getElementById('youtube-skip-signin-notice')) return;

    const notice = document.createElement('div');
    notice.id = 'youtube-skip-signin-notice';
    notice.className = 'youtube-skip-signin-notice';
    notice.setAttribute('role', 'status');
    notice.innerHTML = [
      '<div class="youtube-skip-signin-notice-title">YouTube 로그인이 필요합니다</div>',
      '<div class="youtube-skip-signin-notice-body">로그인한 사용자에게만 자동 관심없음 필터링이 작동합니다.</div>'
    ].join('');
    document.body?.appendChild(notice);
  }

  function hideSignInNotice() {
    document.getElementById('youtube-skip-signin-notice')?.remove();
  }

  function createRuntime(adapter, filterState) {
    const processedVideos = new Set();
    const queuedVideos = new Set();
    const queue = [];
    const pageUrl = window.location.href;
    let processing = false;
    let currentItem = null;
    let activeRequest = null;
    let observer = null;
    let intervalId = null;
    let scrollTimer = null;
    let stopped = false;

    const attribute = (name) => `data-youtube-skip-${adapter.key}-${name}`;
    const debugLog = (...args) => {
      if (filterState.loggingEnabled) console.log(`[youtube_skip:${adapter.key}]`, ...args);
    };

    function isActive() {
      return !stopped && filterState.enabled &&
        filterState[`${adapter.key}Enabled`] !== false &&
        adapter.matchesPath(window.location.pathname) && window.location.href === pageUrl;
    }

    function setHiddenResultReason(result, videoInfo) {
      if (!result) return;
      const uploadAge = videoInfo.ageText || '기준 초과';
      const title = videoInfo.title || '알 수 없는 제목';
      const ariaLabel = `[${uploadAge} 업로드] ${title}`;
      const textNodes = Array.from(result.querySelectorAll('yt-formatted-string, h1, h2, h3, span'))
        .filter((node) =>
          !node.closest('button, tp-yt-paper-button, a') &&
          /동영상 숨김|Video hidden/i.test(node.textContent?.trim() || '')
        );
      const target = textNodes[0];
      if (target) {
        const lineBreak = document.createElement('br');
        target.replaceChildren(
          document.createTextNode(`[${uploadAge} 업로드]`),
          lineBreak,
          document.createTextNode(title)
        );
        target.setAttribute('aria-label', ariaLabel);
      } else {
        result.setAttribute('aria-label', ariaLabel);
      }
    }

    function isProcessableElement(element) {
      return Boolean(
        element &&
        element.isConnected &&
        !element.hidden &&
        element.getClientRects().length > 0 &&
        element.offsetWidth > 0 &&
        element.offsetHeight > 0 &&
        !element.closest('.ytDismissibleItemReplacedContent') &&
        !element.querySelector('.ytDismissibleItemReplacedContent')
      );
    }

    function reset(clearCompleted = false) {
      processedVideos.clear();
      const runtimeSelector = [
        `[${attribute('processed')}]`,
        `[${attribute('video-id')}]`
      ].join(', ');
      for (const element of document.querySelectorAll(runtimeSelector)) {
        if (!clearCompleted && element.getAttribute(attribute('processed')) === 'done') continue;
        element.removeAttribute(attribute('processed'));
        element.removeAttribute(attribute('video-id'));
        element.removeAttribute('data-youtube-skip-id');
      }
    }

    function performAction(element, videoId) {
      return new Promise((resolve) => {
        const requestId = `yt-skip-${adapter.key}-${Math.random().toString(36).slice(2, 11)}`;
        element.dataset.youtubeSkipId = requestId;
        const timeout = setTimeout(() => cancel('timeout'), 8000);
        let finished = false;

        function finish(success, method) {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          window.removeEventListener('youtube-skip-response', onResponse);
          activeRequest = null;
          resolve({ success, method, requestId });
        }
        function cancel(method = 'cancelled') {
          finish(false, method);
          window.dispatchEvent(new CustomEvent('youtube-skip-cancel', {
            detail: { videoId: requestId }
          }));
        }
        function onResponse(event) {
          if (event.detail.videoId === requestId) {
            finish(event.detail.success, event.detail.method);
          }
        }

        activeRequest = { cancel };
        window.addEventListener('youtube-skip-response', onResponse);
        window.dispatchEvent(new CustomEvent('youtube-skip-action', {
          detail: {
            videoId: requestId,
            targetVideoId: videoId,
            pageType: adapter.key,
            pageUrl,
            loggingEnabled: filterState.loggingEnabled
          }
        }));
      });
    }

    async function processQueue() {
      if (processing) return;
      processing = true;
      while (queue.length && isActive()) {
        const item = queue.shift();
        currentItem = item;
        let actionMethod = null;
        try {
          let success = false;
          let hiddenResult = null;

          for (let attempt = 0; attempt < 3 && !success && isActive(); attempt++) {
            const element = findCurrentElement(item.videoId);
            if (!element || processedVideos.has(item.videoId)) break;
            const age = adapter.extractAge(element);
            const thresholdMs = THRESHOLD_PRESETS[filterState.threshold];
            if (!age || !thresholdMs || age.ms < thresholdMs) break;

            item.element = element;
            item.videoInfo = { ageText: age.displayText || age.text, title: adapter.extractTitle(element) };
            element.setAttribute(attribute('processed'), 'queued');
            const result = await performAction(element, item.videoId);
            if (!isActive()) break;
            hiddenResult = result.success
              ? document.querySelector(`[data-youtube-skip-result-id="${result.requestId}"]`)
              : null;
            success = Boolean(hiddenResult);
            actionMethod = result.method;
            if (!success && ['missing_not_interested', 'cancelled', 'stale_page', 'stale_target'].includes(actionMethod)) break;
            if (!success) await new Promise((resolve) => setTimeout(resolve, 500));
          }

          if (!isActive()) break;
          if (success) {
            processedVideos.add(item.videoId);
            stats.skipped++;
            updateBadge();
            setHiddenResultReason(hiddenResult, item.videoInfo);
            if (item.element.isConnected) {
              item.element.setAttribute(attribute('processed'), 'done');
              item.element.setAttribute(attribute('video-id'), item.videoId);
            }
          } else if (getVideoId(item.element) === item.videoId) {
            if (actionMethod && !['menu_busy', 'action_busy', 'cancelled', 'stale_page', 'stale_target'].includes(actionMethod)) {
              item.element.setAttribute(attribute('processed'), 'failed');
              debugLog('Failed after retries', item.videoId);
            } else {
              item.element.removeAttribute(attribute('processed'));
            }
          }
        } catch (error) {
          console.error(`[youtube_skip:${adapter.key}] Queue error`, error);
        } finally {
          queuedVideos.delete(item.videoId);
          currentItem = null;
        }
        const actionDelay = adapter.getActionDelay?.(actionMethod) ?? 700;
        if (actionDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, actionDelay));
        }
      }
      processing = false;
    }

    function queueAction(element, videoInfo, videoId) {
      const state = element.getAttribute(attribute('processed'));
      if (!videoId || queuedVideos.has(videoId) || state === 'queued' || state === 'done') return;
      element.setAttribute(attribute('processed'), 'queued');
      queuedVideos.add(videoId);
      queue.push({ element, videoInfo, videoId });
      processQueue();
    }

    function findCurrentElement(videoId) {
      if (!videoId) return null;
      for (const candidate of adapter.findCandidates(document)) {
        const element = adapter.normalizeCandidate(candidate);
        if (element && adapter.isEligible(element) && isProcessableElement(element) && getVideoId(element) === videoId) {
          return element;
        }
      }
      return null;
    }

    function apply() {
      if (!isActive()) return;
      const thresholdMs = THRESHOLD_PRESETS[filterState.threshold];
      if (!thresholdMs) return;

      for (const candidate of adapter.findCandidates(document)) {
        const element = adapter.normalizeCandidate(candidate);
        if (!element || !adapter.isEligible(element)) continue;
        if (!isProcessableElement(element)) continue;
        const videoId = getVideoId(element);
        const previousId = element.getAttribute(attribute('video-id'));
        if (videoId && previousId && videoId !== previousId) {
          element.removeAttribute(attribute('processed'));
        }
        if (videoId) element.setAttribute(attribute('video-id'), videoId);

        if (videoId && processedVideos.has(videoId)) {
          element.setAttribute(attribute('processed'), 'done');
          continue;
        }

        const state = element.getAttribute(attribute('processed'));
        if (['queued', 'done', 'checked', 'failed'].includes(state)) continue;
        if (!detectedCards.has(element) || detectedCards.get(element) !== videoId) {
          detectedCards.set(element, videoId);
          stats.detected++;
          updateBadge();
        }
        element.setAttribute(attribute('processed'), 'detected');

        const age = adapter.extractAge(element);
        if (!age) continue;
        if (age.ms >= thresholdMs) {
          queueAction(element, { ageText: age.displayText || age.text, title: adapter.extractTitle(element) }, videoId);
        } else {
          element.setAttribute(attribute('processed'), 'checked');
        }
      }
    }

    function onScroll() {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(apply, 500);
    }

    function start() {
      stopped = false;
      installStyles();
      const target = adapter.getObserverRoot(document) || document.querySelector('ytd-app') || document.body;
      observer = new MutationObserver((mutations) => {
        if (adapter.shouldReapply(mutations)) setTimeout(apply, 200);
      });
      observer.observe(target, { childList: true, subtree: true });
      window.addEventListener('scroll', onScroll, { passive: true });
      intervalId = setInterval(apply, 3000);
      debugLog('Started');
      apply();
    }

    function stop() {
      stopped = true;
      activeRequest?.cancel();
      observer?.disconnect();
      clearInterval(intervalId);
      clearTimeout(scrollTimer);
      window.removeEventListener('scroll', onScroll);
      for (const item of [...queue, currentItem].filter(Boolean)) {
        if (item.element.getAttribute(attribute('processed')) === 'queued') {
          item.element.removeAttribute(attribute('processed'));
        }
      }
      queue.length = 0;
      queuedVideos.clear();
      debugLog('Stopped');
    }

    return { start, stop, apply, reset };
  }

  window.YouTubeSkipShared = {
    createRuntime,
    findAgeInElement,
    firstText,
    showSignInNotice,
    hideSignInNotice,
    getStats: () => ({ ...stats })
  };
})();
