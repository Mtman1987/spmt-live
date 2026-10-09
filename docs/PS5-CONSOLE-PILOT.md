# Direct PS5 console pilot

Pilot account: thecaptaindash. Uses the existing public overlay scene and
persistent, account-scoped Restream browser. No YouTube or Remote Play, and
the receiver does not run an encoder.

## User test

1. Save the desired overlays to Public Output in the overlay builder.
2. Open https://spmt.live/ps5-setup.html while signed into thecaptaindash's SPMT
   account, preferably on the PS5 home Wi-Fi. Click Add PS5 to my overlay scene.
   If the browser uses IPv6, supply the home's public IPv4 in the setup page.
3. Set PS5 network Advanced Settings / Manual DNS to the primary IPv4 shown by
   setup, secondary 0.0.0.0. Start Create / Broadcast / Twitch on the PS5.
4. Wait for the setup page to report picture and audio. Check the gameplay
   preview and the complete public scene.
5. In the dedicated Restream browser, sign in and connect Twitch. Add and
   maximize one landscape Browser Source widget with:
   https://spmt.live/tenant/thecaptaindash/public
6. Check the Studio preview and audio, click Go Live, then verify actual Twitch
   output. Closing the SPMT controller leaves the hosted browser running.
7. End the broadcast in Restream and on the console when done. Restore console
   DNS to Automatic to return to normal direct Twitch broadcasting.

A saved public scene can initially be empty even if overlays have been added to
a local builder draft. Save the public output before connecting. After automatic
source insertion, reload the builder before further edits so a stale local draft
does not overwrite the newly added PS5 layer.

## Runtime and isolation

- Fly console: 2 shared CPUs, 512 MB, one machine; no performance CPUs.
- Dedicated IPv4: 137.66.19.212; required for UDP DNS, billed at $2/month.
- UDP 53 binds to fly-global-services; TCP DNS 53 and RTMP 1935 use Fly's
  PROXY protocol to authenticate the original pilot network address.
- HTTPS 4448 serves a capability-based HLS player. MediaMTX's API and HLS
  listener remain on loopback. DNS and RTMP accept only the registered pilot
  IPv4; this is not an open DNS resolver or an unrestricted publish service.
- The allowed network IP persists on the encrypted console_state volume.
  The native Twitch publish path/key stays only in memory, is excluded from
  public URLs/status and logs, and is never persisted.
- MediaMTX 1.21.2 installs at image build with a pinned SHA256. RTMP H264/AAC
  is remuxed to HLS. Internal HLS CDN authorization handles current MediaMTX
  sessions without exposing its private path or credentials.
- The dash host retains its encrypted persistent Chromium profile. Password
  saving is disabled; Restream session cookies persist. No password vault.
- This introduction deploys app,dash,console only. The owner's broadcasting
  xbox/Restream process must not be redeployed.

## Validation and remaining acceptance

CONSOLE_TEST_MEDIAMTX=/path/to/mediamtx npm run test:ps5-console validates
native-style RTMP through the PROXY gate, DNS redirection, source isolation,
H264/AAC playback, and unchanged encoded slices/audio packets after HLS remux.
It checks saved-overlay preservation, idempotent insertion, public URL/key
separation, and forbidden media references.

Actual PS5, home network, and Restream widget audio still require pilot
acceptance. A generated feed is not physical-console acceptance. If the PS5
requires enforced RTMPS for the redirected Twitch hostname, DNS alone cannot
terminate it using our certificate; never disable certificate verification
or claim that the test worked.
