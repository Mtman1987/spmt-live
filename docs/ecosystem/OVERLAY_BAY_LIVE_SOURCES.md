# Overlay Bay live sources

Overlay Bay remains the canonical SPMT-owned scene workspace. This increment adds browser-side source adapters without moving scene ownership out of SPMT.

## Canonical entry points

- Full editor: `/overlay-bay.html`
- Shared surface: `/embed/overlays?mode=full&app=spmt`
- Transparent runtime: `/embed/overlays?mode=overlay&app=xbox-bridge&bridge=1`
- Worktray: open the **Overlay Bay** shared surface from SPMT Worktray

## Source types

The editor can add:

- Xbox Cloud Gaming bridge source
- Camera (`getUserMedia`)
- Screen/window (`getDisplayMedia`)
- Image URL
- Web/overlay URL
- Text
- Generic alert source

Camera and screen streams are intentionally session-local. Their saved widgets persist layout/settings, but the user grants capture permission again when a browser session starts.

## SpaceMountain defaults

A brand-new Overlay Bay workspace starts with two replaceable defaults:

- **SpaceMountain Alerts** — a generic alert widget with SpaceMountain styling
- **LIVE Badge** — a simple text source

Existing workspaces are not forcibly overwritten. The **SpaceMountain defaults** button adds the default alert/LIVE sources non-destructively when needed.

## Generic alert contract

Any host/app can send the overlay runtime a browser message shaped like:

```js
{
  type: 'spmt.overlay.alert',
  eventType: 'follow',
  user: 'ViewerName',
  count: 1,
  amount: 0,
  months: 0,
  headline: '',
  message: '',
  imageUrl: ''
}
```

Default supported `eventType` values are `follow`, `sub`, `resub`, `gift`, `raid`, `cheer`, and `custom`.

The SpaceMountain default alert is replaceable. Saved widget data owns its image URL, accent, duration, accepted event types, and text templates. The widget can also be removed and replaced by a web/embed alert source later. StreamWeaver can become the event producer without becoming the scene owner.

## Xbox bridge model

The Xbox source is a bridge adapter rather than an iframe. The live browser flow is:

```text
Xbox WebRTC remote MediaStreamTrack
  -> clone()
  -> Xbox Bridge video element
  -> saved SPMT Overlay Bay layout
  -> native Xbox-page Overlay Bay renderer
  -> browser/broadcaster captures the finished tab/window
```

The bridge runtime is stored at `public/shared/xbox-bridge-runtime.js`. It expects Xbox Cloud Gaming to already have a live `video.srcObject` MediaStream.

The Windows test launcher first opens SPMT and Xbox in one reusable Edge profile. After the user saves Overlay Bay and starts gameplay, the launcher reads only the saved overlay layout from the authenticated top-level SPMT tab and injects that layout plus the bridge runtime into the Xbox tab.

The saved scene is rendered directly by the bridge inside the Xbox page. The Xbox base source is skipped because the cloned WebRTC video already supplies the base picture. Saved Text, Image, Web/embed, Alert, Camera, and Screen widgets are drawn above it. This avoids depending on a cross-site SPMT scene iframe inside `play.xbox.com`, which proved unreliable during live testing.

The bridge keeps controls inside the Xbox page for **Overlay**, **Test follow**, **Test raid**, Camera/Screen session connections, **Collapse**, and **Exit**. Collapse leaves a compact **SPMT controls** pill so the controls are always recoverable. While active the bridge suppresses Xbox element-fullscreen requests so the injected overlay remains visible. Exiting restores the normal `requestFullscreen` implementation.

Live testing also showed that browser focus is not a hard bridge requirement once the injected bridge is active. The test flow therefore does not rely on keeping Xbox focused; if Xbox itself pauses because of a future visibility/focus policy, that is treated as a host behavior rather than a bridge requirement.

## Manual validation

1. Open `https://spmt.live/overlay-bay.html` after the feature is deployed.
2. Add **Xbox** as the base source.
3. Add any easy test sources: **Text**, **Image**, **Web**, and **Alert**.
4. Use the alert tester buttons to confirm follow/sub/resub/raid/cheer/gift/custom rendering in Overlay Bay.
5. Add a Camera source and press **Connect camera**.
6. Add a Screen source and press **Share screen / window**.
7. Drag/resize sources, use **Front**, **Lock**, **Hide**, and save the workspace.
8. Download `/downloads/RUN_XBOX_OVERLAY_BAY_TEST.bat` from Overlay Bay.
9. Run it. The reusable Edge profile opens SPMT and Xbox.
10. Sign into SPMT/Xbox in that test profile if needed, then start Xbox Cloud Gaming.
11. When gameplay is live, press Enter in the launcher once.
12. Verify the cloned game is moving underneath the saved SPMT overlays.
13. Use **Test follow** and **Test raid** inside the Xbox page to prove the native generic alerts fire over gameplay.
14. If the scene contains Camera or Screen widgets, use their in-page buttons to grant the current-session capture permissions.
15. Use **Overlay** to hide/show the whole saved SPMT layer.
16. Use **Collapse**, then click the **SPMT controls** pill to restore the full controls.
17. Use **Exit** to remove the bridge and restore normal fullscreen behavior.

## Ownership rule

SPMT owns scene/layout data. Overlay Bay edits it. Host apps and StreamWeaver may supply media or events, but they do not fork the canonical scene.
