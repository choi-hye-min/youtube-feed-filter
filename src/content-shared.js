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

  const THRESHOLD_LABELS = {
    '1day': '1 Day', '2days': '2 Days', '3days': '3 Days',
    '4days': '4 Days', '5days': '5 Days', '1week': '1 Week',
    '2weeks': '2 Weeks', '1month': '1 Month', '3months': '3 Months',
    '6months': '6 Months'
  };

  const stats = { detected: 0, skipped: 0 };

  function findAgeInText(text) {
    if (!text) return null;
    const match = text.match(/(\d+)\s*(minute|hour|day|week|month|year|시간|분|일|주|달|월|년|개월)s?\s*(ago|전)/i);
    if (!match) return null;

    const unitMap = {
      '분': 'minute', '시간': 'hour', '일': 'day', '주': 'week',
      '달': 'month', '월': 'month', '개월': 'month', '년': 'year'
    };
    const unitToMs = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000
    };
    const unit = unitMap[match[2].toLowerCase()] || match[2].toLowerCase();
    return { ms: Number.parseInt(match[1], 10) * unitToMs[unit], text: match[0] };
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
      const text = node?.getAttribute('title') || node?.textContent;
      if (text?.trim()) return text.trim();
    }
    return '알 수 없는 제목';
  }

  function installStyles() {
    if (document.getElementById('youtube-skip-styles')) return;
    const style = document.createElement('style');
    style.id = 'youtube-skip-styles';
    style.textContent = `
      .youtube-skip-placeholder { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; width:100%; min-height:96px; border-radius:12px; background:rgba(15,15,15,.06); color:var(--yt-spec-text-secondary,#606060); font:500 14px Roboto,Arial,sans-serif; box-sizing:border-box; text-align:center; }
      .youtube-skip-placeholder-title { color:var(--yt-spec-text-primary,#0f0f0f); font-size:15px; font-weight:600; }
      .youtube-skip-placeholder-video-title { max-width:90%; color:var(--yt-spec-text-primary,#0f0f0f); font-size:13px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
      .youtube-skip-placeholder-reason { max-width:92%; font-size:12px; font-weight:400; line-height:1.35; overflow-wrap:anywhere; }
      .youtube-skip-placeholder--watch { min-height:94px; border-radius:8px; overflow-anchor:none; }
      html[dark] .youtube-skip-placeholder, [dark] .youtube-skip-placeholder { background:rgba(255,255,255,.08); color:var(--yt-spec-text-secondary,#aaa); }
      html[dark] .youtube-skip-placeholder-title, [dark] .youtube-skip-placeholder-title, html[dark] .youtube-skip-placeholder-video-title, [dark] .youtube-skip-placeholder-video-title { color:var(--yt-spec-text-primary,#f1f1f1); }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function createRuntime(adapter, filterState) {
    const processedVideos = new Map();
    const queue = [];
    let processing = false;
    let observer = null;
    let intervalId = null;
    let scrollTimer = null;
    let stopped = false;

    const attribute = (name) => `data-youtube-skip-${adapter.key}-${name}`;
    const debugLog = (...args) => {
      if (filterState.loggingEnabled) console.log(`[youtube_skip:${adapter.key}]`, ...args);
    };

    function renderPlaceholder(element, videoInfo) {
      if (element.getAttribute(attribute('placeholder')) === 'true') return;
      const placeholder = document.createElement('div');
      placeholder.className = `youtube-skip-placeholder youtube-skip-placeholder--${adapter.key}`;
      placeholder.setAttribute('role', 'status');
      placeholder.setAttribute('aria-label', '관심없음 처리됨');
      placeholder.innerHTML = '<div class="youtube-skip-placeholder-title">관심없음</div>';

      const title = document.createElement('div');
      title.className = 'youtube-skip-placeholder-video-title';
      title.textContent = videoInfo?.title || '알 수 없는 제목';
      placeholder.appendChild(title);

      const reason = document.createElement('div');
      reason.className = 'youtube-skip-placeholder-reason';
      reason.textContent = `업로드: ${videoInfo?.ageText || '기준 초과'} / 기준: ${THRESHOLD_LABELS[filterState.threshold] || filterState.threshold} 이상`;
      placeholder.appendChild(reason);

      const height = element.offsetHeight;
      if (height > 0) {
        if (adapter.key === 'watch') {
          placeholder.style.height = `${height}px`;
          placeholder.style.minHeight = `${height}px`;
          placeholder.style.overflow = 'hidden';
        } else {
          placeholder.style.minHeight = `${Math.max(height, 94)}px`;
        }
      }
      element.setAttribute(attribute('placeholder'), 'true');
      element.replaceChildren(placeholder);
    }

    function performAction(element) {
      return new Promise((resolve) => {
        const requestId = `yt-skip-${adapter.key}-${Math.random().toString(36).slice(2, 11)}`;
        element.dataset.youtubeSkipId = requestId;
        const timeout = setTimeout(() => finish(false, 'timeout'), 8000);

        function finish(success, method) {
          clearTimeout(timeout);
          window.removeEventListener('youtube-skip-response', onResponse);
          resolve({ success, method });
        }
        function onResponse(event) {
          if (event.detail.videoId === requestId) {
            finish(event.detail.success, event.detail.method);
          }
        }

        window.addEventListener('youtube-skip-response', onResponse);
        window.dispatchEvent(new CustomEvent('youtube-skip-action', {
          detail: { videoId: requestId, pageType: adapter.key }
        }));
      });
    }

    async function processQueue() {
      if (processing) return;
      processing = true;
      while (queue.length && !stopped) {
        const item = queue.shift();
        let actionMethod = null;
        try {
          let success = false;
          let element = item.element;

          for (let attempt = 0; attempt < 3 && !success; attempt++) {
            element = findCurrentElement(item.videoId) || element;
            if (!element?.isConnected) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              continue;
            }

            element.setAttribute(attribute('processed'), 'queued');
            const result = await performAction(element);
            success = result.success;
            actionMethod = result.method;
            if (!success) await new Promise((resolve) => setTimeout(resolve, 500));
          }

          if (success && !stopped) {
            if (item.videoId) processedVideos.set(item.videoId, item.videoInfo);
            stats.skipped++;
            chrome.runtime.sendMessage({ action: 'updateBadge', count: stats.skipped });
            element.setAttribute(attribute('processed'), 'done');
            if (element.isConnected) renderPlaceholder(element, item.videoInfo);
          } else if (element?.isConnected) {
            element.setAttribute(attribute('processed'), 'failed');
            console.error(`[youtube_skip:${adapter.key}] Failed after retries`, item.videoId);
          }
        } catch (error) {
          console.error(`[youtube_skip:${adapter.key}] Queue error`, error);
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
      if (state === 'queued' || state === 'done') return;
      element.setAttribute(attribute('processed'), 'queued');
      queue.push({ element, videoInfo, videoId });
      processQueue();
    }

    function findCurrentElement(videoId) {
      if (!videoId) return null;
      for (const candidate of adapter.findCandidates(document)) {
        const element = adapter.normalizeCandidate(candidate);
        if (element && adapter.isEligible(element) && getVideoId(element) === videoId) {
          return element;
        }
      }
      return null;
    }

    function apply() {
      if (!filterState.enabled || !adapter.matchesPath(window.location.pathname)) return;
      const thresholdMs = THRESHOLD_PRESETS[filterState.threshold];
      if (!thresholdMs) return;

      for (const candidate of adapter.findCandidates(document)) {
        const element = adapter.normalizeCandidate(candidate);
        if (!element || !adapter.isEligible(element)) continue;
        const videoId = getVideoId(element);
        const previousId = element.getAttribute(attribute('video-id'));
        if (videoId && previousId && videoId !== previousId) {
          element.removeAttribute(attribute('processed'));
          element.removeAttribute(attribute('placeholder'));
        }
        if (videoId) element.setAttribute(attribute('video-id'), videoId);

        if (videoId && processedVideos.has(videoId)) {
          renderPlaceholder(element, processedVideos.get(videoId));
          continue;
        }

        const state = element.getAttribute(attribute('processed'));
        if (['queued', 'done', 'checked', 'failed'].includes(state)) continue;
        stats.detected++;
        element.setAttribute(attribute('processed'), 'detected');

        const age = adapter.extractAge(element);
        if (!age) continue;
        if (age.ms >= thresholdMs) {
          queueAction(element, { title: adapter.extractTitle(element), ageText: age.text }, videoId);
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
      observer?.disconnect();
      clearInterval(intervalId);
      clearTimeout(scrollTimer);
      window.removeEventListener('scroll', onScroll);
      queue.length = 0;
      debugLog('Stopped');
    }

    return { start, stop, apply };
  }

  window.YouTubeSkipShared = {
    createRuntime,
    findAgeInElement,
    firstText,
    getStats: () => ({ ...stats })
  };
})();
