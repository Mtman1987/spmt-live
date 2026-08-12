# Overlay Bay acceptance checklist

After deployment:

1. Sign into `https://spmt.live` and open **Overlay Bay** from the sidebar or Dashboard card.
2. Confirm a new workspace shows **SpaceMountain Alerts** and the **LIVE Badge** defaults.
3. Add and save an **Xbox** base source.
4. Add a **Text** source and change its text by double-clicking it.
5. Add an **Image** URL and confirm it renders.
6. Add a **Web** source and confirm its page/overlay renders when the remote site permits framing.
7. Add a **Camera** source and click **Connect camera**.
8. Add a **Screen** source and click **Share screen / window**.
9. Test follow, sub, resub, gift, raid, cheer, and custom alerts from the Alert tester.
10. Use **Front**, **Lock**, **Hide**, drag, and resize, then save and refresh to confirm layout persistence.
11. Download and run `/downloads/RUN_XBOX_OVERLAY_BAY_TEST.bat`.
12. Start Xbox Cloud Gaming and inject the bridge once. The bridge should continue unless Xbox itself pauses; browser focus is not treated as a requirement.
13. Confirm moving Xbox gameplay stays underneath the saved Overlay Bay scene and that the scene is rendered directly in the Xbox bridge rather than through a cross-site SPMT scene iframe.
14. Use **Test follow** and **Test raid** inside Xbox and confirm alerts appear over gameplay.
15. If Camera or Screen sources are in the saved scene, use their in-page SPMT control buttons to grant/connect them for the current browser session.
16. Click **Collapse** and confirm the compact **SPMT controls** pill remains visible; click it to restore the full controls.
17. Confirm the repeated Xbox element-fullscreen prompt is suppressed while the bridge is active.
18. Click **Exit** and confirm the bridge is removed and normal fullscreen behavior is restored.
