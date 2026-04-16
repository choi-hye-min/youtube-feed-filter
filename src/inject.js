/**
 * inject.js
 * Runs in the MAIN world to access YouTube internal objects.
 */
(function() {
  window.addEventListener('youtube-skip-action', function(e) {
    const { videoId } = e.detail;
    const videoElement = document.querySelector(`[data-youtube-skip-id="${videoId}"]`);
    
    if (!videoElement) return;

    try {
      const data = videoElement.data || 
                   (videoElement.__data && videoElement.__data.data) || 
                   (videoElement.hostElement && videoElement.hostElement.data);

      if (!data) return;

      let notInterestedEndpoint = null;
      const menuItems = data.menu?.menuRenderer?.items || [];
      
      for (const item of menuItems) {
        const renderer = item.menuServiceItemRenderer || item.menuNavigationItemRenderer;
        if (renderer && (
            renderer.icon?.iconType === 'NOT_INTERESTED' ||
            renderer.text?.simpleText === 'Not interested' ||
            renderer.text?.runs?.[0]?.text === '관심 없음'
        )) {
          notInterestedEndpoint = renderer.serviceEndpoint || renderer.command;
          break;
        }
      }

      if (notInterestedEndpoint) {
        const event = new CustomEvent('yt-action', {
          detail: {
            actionName: 'yt-service-request',
            optionalAction: false,
            returnValue: [],
            args: [{ command: notInterestedEndpoint, args: [notInterestedEndpoint] }, videoElement]
          },
          bubbles: true,
          composed: true
        });
        videoElement.dispatchEvent(event);
      }
    } catch (err) {
      console.error('[youtube_skip] Injection error:', err);
    }
  });
})();
