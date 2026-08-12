(() => {
  if (window.__spmtCloudXboxSourceInstalled) return;
  window.__spmtCloudXboxSourceInstalled = true;

  const overlayRuntime = typeof mode !== 'undefined' && mode === 'overlay';
  if (overlayRuntime) return;

  const controllers = new Map();
  const VIEWPORT = { width: 1280, height: 720 };

  const style = document.createElement('style');
  style.textContent = `
    .cloud-xbox-ui{position:relative;width:100%;height:100%;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:#05070e;color:#e8edf7;font-family:system-ui,sans-serif;overflow:hidden}
    .cloud-xbox-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:7px;background:rgba(5,7,14,.96);border-bottom:1px solid rgba(255,255,255,.12);pointer-events:auto;z-index:3}
    .cloud-xbox-bar select,.cloud-xbox-bar button{border:1px solid rgba(255,255,255,.16);border-radius:8px;background:#111725;color:#fff;padding:6px 8px;font:700 10px system-ui,sans-serif;cursor:pointer}
    .cloud-xbox-bar button.primary{background:#1677ff}
    .cloud-xbox-bar button.danger{background:#3b1520}
    .cloud-xbox-status{margin-left:auto;font:800 9px ui-monospace,monospace;color:#b9c5d8;white-space:nowrap}
    .cloud-xbox-preview{position:relative;min-height:0;background:#000;outline:none;pointer-events:auto;cursor:crosshair;overflow:hidden}
    .cloud-xbox-preview:focus{box-shadow:inset 0 0 0 2px rgba(83,160,255,.8)}
    .cloud-xbox-frame{display:block;width:100%;height:100%;object-fit:contain;background:#000;user-select:none;-webkit-user-drag:none}
    .cloud-xbox-empty{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:22px;color:#d5deed;background:radial-gradient(circle at 50% 40%,rgba(22,119,255,.16),transparent 44%),#05070e;pointer-events:none}
    .cloud-xbox-empty strong{display:block;font-size:18px;margin-bottom:6px}.cloud-xbox-empty span{display:block;font-size:11px;color:#98a7bd;max-width:430px}
    .cloud-xbox-help{padding:6px 8px;background:rgba(5,7,14,.96);border-top:1px solid rgba(255,255,255,.1);font:700 9px system-ui,sans-serif;color:#93a3bb;pointer-events:none}
    .cloud-xbox-live-dot{display:inline-block;width:7px;height:7px;border-radius:999px;background:#33d17a;margin-right:5px;box-shadow:0 0 10px rgba(51,209,122,.8)}
  `;
  document.head.append(style);

  function currentWidget(id) {
    try {
      return state?.overlay?.widgets?.find((item) => item.id === id) || null;
    } catch {
      return null;
    }
  }

  function markDirty() {
    try { state.overlayDirty = true; } catch {}
  }

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) throw new Error(data?.error || `Cloud Xbox request failed (${response.status})`);
    return data;
  }

  function modifierMask(event) {
    return (event.altKey ? 1 : 0)
      | (event.ctrlKey ? 2 : 0)
      | (event.metaKey ? 4 : 0)
      | (event.shiftKey ? 8 : 0);
  }

  function createController(widgetId) {
    const controller = {
      widgetId,
      running: false,
      mode: 'cloud-gaming',
      viewport: { ...VIEWPORT },
      media: { videoTracks: 0, audioTracks: 0 },
      statusTimer: null,
      frameTimer: null,
      destroyed: false,
      lastStatus: null,
    };

    async function sendInput(payload) {
      if (!controller.running) return;
      try {
        await jsonFetch('/api/cloud-xbox/input', { method: 'POST', body: JSON.stringify(payload) });
      } catch (error) {
        updateStatusText(error.message, true);
      }
    }

    function root() {
      return document.querySelector(`[data-cloud-xbox-widget="${CSS.escape(widgetId)}"]`);
    }

    function updateStatusText(text, error = false) {
      const el = root()?.querySelector('[data-cloud-xbox-status]');
      if (!el) return;
      el.textContent = text;
      el.style.color = error ? '#ff9caa' : '#b9c5d8';
    }

    function setEmpty(message, subtext = '') {
      const empty = root()?.querySelector('[data-cloud-xbox-empty]');
      if (!empty) return;
      empty.innerHTML = `<div><strong>${escapeHtml(message)}</strong><span>${escapeHtml(subtext)}</span></div>`;
      empty.style.display = 'grid';
    }

    function hideEmpty() {
      const empty = root()?.querySelector('[data-cloud-xbox-empty]');
      if (empty) empty.style.display = 'none';
    }

    async function refreshStatus() {
      try {
        const data = await jsonFetch('/api/cloud-xbox/status');
        controller.lastStatus = data;
        controller.running = Boolean(data?.running);
        controller.mode = data?.mode || controller.mode;
        controller.viewport = data?.viewport || controller.viewport;
        controller.media = data?.media || controller.media;

        const select = root()?.querySelector('[data-cloud-xbox-mode]');
        if (select && document.activeElement !== select) select.value = controller.mode;

        if (!controller.running) {
          updateStatusText('cloud browser stopped');
          setEmpty('Xbox cloud browser is stopped', 'Choose Cloud Gaming or Remote Play, then press Start cloud browser.');
          return;
        }

        const media = controller.media || {};
        if (media.videoTracks > 0 || media.audioTracks > 0) {
          const size = media.width && media.height ? `${media.width}×${media.height}` : 'video';
          const fps = media.frameRate ? ` @ ${Math.round(media.frameRate)}fps` : '';
          const audio = media.audioTracks > 0 ? ' + audio' : '';
          updateStatusText(`${size}${fps}${audio}`);
        } else {
          updateStatusText('browser live · waiting for Xbox A/V');
        }
        hideEmpty();
      } catch (error) {
        controller.running = false;
        updateStatusText(error.message, true);
        setEmpty('Cloud browser unavailable', error.message);
      }
    }

    function refreshFrame() {
      if (!controller.running) return;
      const image = root()?.querySelector('[data-cloud-xbox-frame]');
      if (!image) return;
      const next = `/api/cloud-xbox/frame?t=${Date.now()}`;
      image.onload = () => hideEmpty();
      image.onerror = () => {};
      image.src = next;
    }

    async function start(mode) {
      updateStatusText('starting cloud browser…');
      try {
        const data = await jsonFetch('/api/cloud-xbox/session', {
          method: 'POST',
          body: JSON.stringify({ mode }),
        });
        controller.running = true;
        controller.mode = data?.mode || mode;
        controller.viewport = data?.viewport || controller.viewport;
        controller.media = data?.media || controller.media;
        hideEmpty();
        await refreshStatus();
        refreshFrame();
      } catch (error) {
        updateStatusText(error.message, true);
        setEmpty('Could not start cloud browser', error.message);
      }
    }

    async function navigate(mode) {
      if (!controller.running) return start(mode);
      updateStatusText(`opening ${mode === 'remote-play' ? 'Remote Play' : 'Cloud Gaming'}…`);
      try {
        await jsonFetch('/api/cloud-xbox/navigate', {
          method: 'POST',
          body: JSON.stringify({ mode }),
        });
        controller.mode = mode;
        setTimeout(refreshFrame, 500);
        setTimeout(refreshStatus, 900);
      } catch (error) {
        updateStatusText(error.message, true);
      }
    }

    async function stop() {
      try {
        await jsonFetch('/api/cloud-xbox/session', { method: 'DELETE' });
      } catch {}
      controller.running = false;
      updateStatusText('cloud browser stopped');
      setEmpty('Xbox cloud browser is stopped', 'Your Microsoft/Xbox browser profile stays saved on SPMT for the next session.');
    }

    async function reload() {
      if (!controller.running) return;
      try {
        await jsonFetch('/api/cloud-xbox/reload', { method: 'POST' });
        updateStatusText('reloading…');
        setTimeout(refreshFrame, 700);
      } catch (error) {
        updateStatusText(error.message, true);
      }
    }

    function bind(container) {
      const widget = currentWidget(widgetId);
      controller.mode = widget?.browserMode === 'remote-play' ? 'remote-play' : 'cloud-gaming';
      const select = container.querySelector('[data-cloud-xbox-mode]');
      select.value = controller.mode;

      select.addEventListener('change', () => {
        const next = select.value === 'remote-play' ? 'remote-play' : 'cloud-gaming';
        controller.mode = next;
        const activeWidget = currentWidget(widgetId);
        if (activeWidget) {
          activeWidget.browserMode = next;
          activeWidget.title = next === 'remote-play' ? 'Xbox Remote Play' : 'Xbox Cloud Gaming';
          markDirty();
        }
        if (controller.running) navigate(next);
      });

      container.querySelector('[data-cloud-xbox-start]').addEventListener('click', (event) => {
        event.stopPropagation();
        start(select.value);
      });
      container.querySelector('[data-cloud-xbox-reload]').addEventListener('click', (event) => {
        event.stopPropagation();
        reload();
      });
      container.querySelector('[data-cloud-xbox-stop]').addEventListener('click', (event) => {
        event.stopPropagation();
        stop();
      });

      const preview = container.querySelector('[data-cloud-xbox-preview]');
      preview.addEventListener('mousedown', (event) => {
        event.stopPropagation();
        preview.focus();
        if (!controller.running) return;
        const rect = preview.getBoundingClientRect();
        const viewport = controller.viewport || VIEWPORT;
        const scale = Math.min(rect.width / viewport.width, rect.height / viewport.height);
        const drawnWidth = viewport.width * scale;
        const drawnHeight = viewport.height * scale;
        const offsetX = (rect.width - drawnWidth) / 2;
        const offsetY = (rect.height - drawnHeight) / 2;
        const localX = event.clientX - rect.left - offsetX;
        const localY = event.clientY - rect.top - offsetY;
        if (localX < 0 || localY < 0 || localX > drawnWidth || localY > drawnHeight) return;
        sendInput({
          type: 'click',
          x: localX / scale,
          y: localY / scale,
          button: event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left',
        });
      });
      preview.addEventListener('contextmenu', (event) => event.preventDefault());
      preview.addEventListener('wheel', (event) => {
        if (!controller.running) return;
        event.preventDefault();
        const rect = preview.getBoundingClientRect();
        sendInput({
          type: 'wheel',
          x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * controller.viewport.width,
          y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * controller.viewport.height,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
        });
      }, { passive: false });
      preview.addEventListener('keydown', (event) => {
        if (!controller.running) return;
        if (['F5', 'F11', 'F12'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
        sendInput({
          type: 'key',
          key: event.key,
          code: event.code,
          text: printable ? event.key : '',
          modifiers: modifierMask(event),
        });
      });

      refreshStatus();
      if (!controller.statusTimer) controller.statusTimer = setInterval(refreshStatus, 1500);
      if (!controller.frameTimer) controller.frameTimer = setInterval(refreshFrame, 500);
    }

    controller.bind = bind;
    controller.refreshStatus = refreshStatus;
    return controller;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    }[char]));
  }

  function upgradeXboxSection(section) {
    const widgetId = section.dataset.overlayWidget;
    if (!widgetId) return;
    const body = section.querySelector('.obv2-source-body');
    if (!body || body.querySelector('[data-cloud-xbox-widget]')) return;
    const widget = currentWidget(widgetId);
    if (!widget || widget.kind !== 'xbox') return;
    if (!widget.browserMode) widget.browserMode = 'cloud-gaming';

    body.innerHTML = `
      <div class="cloud-xbox-ui" data-cloud-xbox-widget="${escapeHtml(widgetId)}">
        <div class="cloud-xbox-bar">
          <select data-cloud-xbox-mode aria-label="Xbox browser source mode">
            <option value="cloud-gaming">Cloud Gaming</option>
            <option value="remote-play">Remote Play</option>
          </select>
          <button type="button" class="primary" data-cloud-xbox-start>Start cloud browser</button>
          <button type="button" data-cloud-xbox-reload>Reload</button>
          <button type="button" class="danger" data-cloud-xbox-stop>Stop</button>
          <span class="cloud-xbox-status" data-cloud-xbox-status>checking cloud browser…</span>
        </div>
        <div class="cloud-xbox-preview" data-cloud-xbox-preview tabindex="0" title="Click here, then type to control the cloud browser">
          <img class="cloud-xbox-frame" data-cloud-xbox-frame alt="Live SPMT cloud Xbox browser preview">
          <div class="cloud-xbox-empty" data-cloud-xbox-empty>
            <div><strong>Xbox cloud browser</strong><span>Start the SPMT-hosted browser, then sign into Xbox directly through this preview. Click the picture and type normally.</span></div>
          </div>
        </div>
        <div class="cloud-xbox-help"><span class="cloud-xbox-live-dot"></span>SPMT cloud session · clicks, keyboard and scrolling are forwarded to the remote browser · Xbox A/V detection appears at top right</div>
      </div>`;

    let controller = controllers.get(widgetId);
    if (!controller) {
      controller = createController(widgetId);
      controllers.set(widgetId, controller);
    }
    controller.bind(body.querySelector('[data-cloud-xbox-widget]'));
  }

  function upgradeAll() {
    document.querySelectorAll('.overlay-widget.kind-xbox:not(.obv2-runtime-xbox)').forEach(upgradeXboxSection);
  }

  const observer = new MutationObserver(() => upgradeAll());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(upgradeAll, 0);
  setTimeout(upgradeAll, 600);
})();
