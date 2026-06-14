# Placeholder Glass Flash

## Setup

1. Load `src/` as an unpacked extension and enable filtering.
2. Choose a threshold that will match visible recommendations.

## Home and Watch Pages

1. Open the YouTube home page and wait for a matched card to be processed.
2. Confirm a single diagonal highlight sweeps across the new placeholder.
3. Confirm the placeholder text remains readable and the card size does not jump.
4. Repeat on the `/watch` recommendation list in light and dark themes.

## Reduced Motion

1. Enable the operating system's reduced-motion preference.
2. Reload the extension and YouTube page.
3. Confirm placeholders appear without the highlight animation.

## Watch Navigation Race

1. Enable filtering on both the home and watch pages with several matching recommendations visible.
2. Navigate from the home page to a video while home recommendations are still being processed.
3. Confirm no `firstElementChild` error appears after the `/watch` page loads.
4. Confirm matched watch recommendations still become placeholders without console errors.
