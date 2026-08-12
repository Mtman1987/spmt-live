# Cloud Xbox Source test

Overlay Bay owns one **Xbox browser source** with interchangeable modes:

- **Cloud Gaming** — use now as the test feed at `https://play.xbox.com/`
- **Remote Play** — later use the same source against `https://www.xbox.com/remoteplay`

The rest of the scene does not care which Xbox mode produced the media.

## What this proof tests

The SPMT Fly machine launches Chromium on the server, not on the user's computer. A per-user Chromium profile is stored under the persistent `/data` volume so the Microsoft/Xbox browser session can survive browser restarts without SPMT storing the user's Microsoft password.

Overlay Bay displays authenticated screenshots from that cloud browser inside the saved Xbox source. Mouse clicks, keyboard input, and scrolling are forwarded back to Chromium so Microsoft/Xbox sign-in and normal browser menus can be completed from Overlay Bay.

The backend also inspects only the page's media summary and reports whether live `video` and `audio` MediaStream tracks are present, plus video width/height/frame rate when exposed. It does not return track IDs, authorization headers, cookies, SDP, ICE addresses, or media packets.

## Test steps

1. Sign into SPMT and open **Overlay Bay**.
2. Add an **Xbox** source if the scene does not already have one.
3. In the Xbox source choose **Cloud Gaming**.
4. Click **Start cloud browser**.
5. Wait for the Xbox/Microsoft page to appear inside the Xbox source.
6. Click directly in that preview and sign into Microsoft/Xbox. Keyboard input is sent to the cloud browser when the preview has focus.
7. Start any Xbox Cloud Gaming title. Controller/gameplay input is not required for this proof; the goal is to get a live Xbox browser feed.
8. Watch the Xbox source status. When Xbox exposes the browser media objects it should change from `waiting for Xbox A/V` to a video resolution/frame-rate and `+ audio` when an audio track is present.
9. Add or position an Image, Text, Web source, and SpaceMountain Alerts above the Xbox source.
10. Use the Overlay Bay alert tester. The alert should appear over the cloud Xbox preview in the same scene.
11. Switch away from SPMT briefly and return. The server-side browser should continue running; the profile and session are not tied to the local page being focused.
12. Use **Stop** when finished. The Chromium process stops, while the per-user browser profile remains on persistent SPMT storage for the next test.

## Current proof boundary

This test uses authenticated JPEG snapshots of the cloud Chromium page as the interactive Overlay Bay preview. It is intended to prove the server-side browser, Xbox sign-in/session, visible game feed, input forwarding, persistent browser profile, MediaStream A/V detection, and Overlay Bay composition.

It does **not yet relay the cloud browser's audio to the viewer** and it does not yet forward a physical gamepad into cloud Chromium. Those are transport/input layers after this proof. The Xbox source contract already keeps Cloud Gaming and Remote Play behind the same adapter so either mode can use those additions later.
