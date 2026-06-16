# Signed-in Required

## Signed Out

1. Open YouTube in a signed-out Chrome profile or signed-out window.
2. Load `src/` as an unpacked extension and open the YouTube home page.
3. Confirm a sign-in notice appears on the page.
4. Open the extension popup.
5. Confirm the status shows `Sign in Required`.
6. Confirm filtering controls are disabled and Detected/Skipped counts do not increase.
7. Confirm the browser console has no extension errors.

## Signed In

1. Sign in to YouTube and reload the active YouTube tab.
2. Open the extension popup.
3. Confirm the sign-in notice is gone and filtering controls are available.
4. Choose a threshold that matches visible recommendations.
5. Confirm matched home or watch recommendations are processed normally.
6. Confirm the browser console has no extension errors.
