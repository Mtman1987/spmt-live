# Overlay Bay acceptance checklist

After deployment:

1. Sign into `https://spmt.live` and open **Overlay Bay** from the sidebar or Dashboard card.
2. Confirm a new workspace shows **SpaceMountain Alerts** and the **LIVE Badge** defaults.
3. Add and save an **Xbox** base source.
4. In that source confirm the mode selector offers **Cloud Gaming** and **Remote Play**. Use **Cloud Gaming** for the current proof.
5. Click **Start cloud browser** and confirm the Xbox/Microsoft browser appears inside the Xbox source without running a helper on the local computer.
6. Click the cloud-browser preview and sign into Xbox. Confirm mouse, keyboard, and scrolling work for browser/login interaction.
7. Start an Xbox Cloud Gaming title and confirm moving Xbox video becomes visible in the Xbox source.
8. Confirm the source status eventually reports a live video resolution/frame rate and `+ audio` when Xbox exposes its live browser audio track.
9. Add a **Text** source and change its text by double-clicking it.
10. Add an **Image** URL and confirm it renders above the Xbox source.
11. Add a **Web** source and confirm its page/overlay renders when the remote site permits framing.
12. Test follow, sub, resub, gift, raid, cheer, and custom alerts from the Alert tester and confirm they render over the cloud Xbox preview.
13. Use **Front**, **Lock**, **Hide**, drag, and resize, then save and refresh to confirm layout persistence.
14. Switch away from SPMT and return. Confirm the server-side Xbox browser is still running; local browser focus is not required.
15. Stop the cloud browser and start it again. Confirm the SPMT-hosted browser profile persists so the Microsoft/Xbox browser session can be reused when Microsoft permits it.
16. Switch the Xbox source to **Remote Play** and confirm the same source navigates to the Remote Play browser path. A connected physical Xbox is required to complete that mode.
17. Camera and Screen remain local browser sources for now; use **Connect camera** and **Share screen / window** separately when testing those source types.

The downloadable local Xbox bridge remains a debugging fallback, not the primary product flow. The cloud acceptance path is SPMT-hosted Chromium -> Xbox browser -> Overlay Bay preview/compositor.
