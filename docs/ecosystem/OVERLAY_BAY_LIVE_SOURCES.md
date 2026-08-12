# Overlay Bay live sources

Overlay Bay remains the canonical SPMT-owned scene workspace. This increment adds browser-side source adapters without moving scene ownership out of SPMT.

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

The SpaceMountain default alert is replaceable: saved widget data owns its image URL, duration, accepted event types, and text templates. StreamWeaver can later become the event producer without becoming the scene owner.

## Xbox bridge model

The Xbox source is a bridge adapter rather than an iframe. The live browser flow is:

```text
Xbox WebRTC remote MediaStreamTrack
  -> clone()
  -> Xbox Bridge video element
  -> SPMT Overlay Bay runtime iframe
  -> browser/broadcaster captures the finished tab/window
```

The bridge runtime is stored at `public/shared/xbox-bridge-runtime.js`. It expects Xbox Cloud Gaming to already have a live `video.srcObject` MediaStream.

The Overlay Bay runtime URL used by the bridge is:

```text
/embed/overlays?mode=overlay&app=xbox-bridge&bridge=1
```

In bridge runtime mode the saved Xbox placeholder is transparent so the cloned Xbox video supplied by the parent page remains the base picture.

## Manual validation

1. Open SPMT Worktray and choose **Open Overlay Bay**.
2. Add **Xbox**, **Image**, **Text**, and **Alert** sources.
3. Use **SpaceMountain defaults** to add the default generic alert and LIVE badge if desired.
4. Use the alert tester buttons to confirm follow/sub/raid/cheer/gift/custom rendering.
5. Add a Camera source and press **Connect camera**.
6. Add a Screen source and press **Share screen / window**.
7. Save the overlay workspace.
8. Start Xbox Cloud Gaming, then run the local Xbox Bridge test helper. The Xbox page should keep focus while the cloned game video and saved SPMT Overlay Bay are layered together.

## Ownership rule

SPMT owns scene/layout data. Overlay Bay edits it. Host apps and StreamWeaver may supply media or events, but they do not fork the canonical scene.
