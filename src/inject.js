/**
 * inject.js
 * Runs in the MAIN world to access YouTube internal objects.
 */
(function() {
  window.addEventListener('youtube-skip-action', function(e) {
    const { videoId } = e.detail;
    // Find the element by the unique ID assigned by content-script
    const videoElement = document.querySelector(`[data-youtube-skip-id="${videoId}"]`);
    
    if (!videoElement) return;

    try {
      // YouTube's internal data can be in several places depending on the element type
      let data = videoElement.data || 
                 (videoElement.__data && videoElement.__data.data) || 
                 (videoElement.hostElement && videoElement.hostElement.data);
      
      // For newer view-model elements, data might be nested or in a different property
      if (!data && videoElement.controller) {
        data = videoElement.controller.data;
      }

      if (!data) {
        // Fallback: try to find data in common child/parent if needed
        const viewModel = videoElement.querySelector('yt-lockup-metadata-view-model');
        if (viewModel && viewModel.data) {
          data = viewModel.data;
        }
      }

      if (!data) return;

      let notInterestedEndpoint = null;
      
      // 1. Try to find in standard menu items
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

      // 2. Try newer view-model menu structure if not found
      if (!notInterestedEndpoint && data.menu?.menuViewModel) {
        const vmItems = data.menu.menuViewModel.menuItems || [];
        for (const item of vmItems) {
          const renderer = item.menuItemViewModel;
          if (renderer && (
            renderer.icon === 'NOT_INTERESTED' ||
            renderer.title === 'Not interested' ||
            renderer.title === '관심 없음'
          )) {
            notInterestedEndpoint = renderer.onTap?.innertubeServiceEndpoint || renderer.onTap?.command;
            break;
          }
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
