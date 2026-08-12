(() => {
  if (window.__spmtCloudXboxRecoveryInstalled) return;
  window.__spmtCloudXboxRecoveryInstalled = true;

  const style = document.createElement('style');
  style.textContent = `
    .cloud-xbox-frame{opacity:0;transition:opacity .12s ease}
    .cloud-xbox-frame.cloud-xbox-frame-ready{opacity:1}
    .cloud-xbox-diag{margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.06);font:600 10px/1.35 ui-monospace,monospace;color:#b9c5d8;max-width:520px;white-space:pre-wrap;word-break:break-word}
  `;
  document.head.append(style);

  async function diagnostics() {
    try {
      const response = await fetch('/api/cloud-xbox/diagnostics', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  function diagnosticBody(payload) {
    if (!payload) return null;
    if (payload.diagnostics && typeof payload.diagnostics === 'object') {
      return { ...payload.diagnostics, resources: payload.resources || null, active: Boolean(payload.running) };
    }
    return payload;
  }

  function firstUsefulLine(text) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/DevTools listening on/i.test(line));
    return lines.slice(-3).join('\n').slice(0, 900);
  }

  function summary(payload) {
    const diag = diagnosticBody(payload);
    if (!diag) return 'The Xbox worker did not produce a readable diagnostic yet.';
    const parts = [];
    if (diag.lastError) parts.push(diag.lastError);
    else if (diag.exitSignal) parts.push(`Chromium exited via ${diag.exitSignal}.`);
    else if (diag.exitCode !== null && diag.exitCode !== undefined) parts.push(`Chromium exited with code ${diag.exitCode}.`);
    if (diag.vmMemoryMb) parts.push(`Fly VM memory: ${diag.vmMemoryMb} MB.`);
    const resources = diag.resources || {};
    if (resources.systemTotalMb) {
      const free = resources.systemFreeMb !== null && resources.systemFreeMb !== undefined
        ? `, ${resources.systemFreeMb} MB free`
        : '';
      parts.push(`Xbox worker memory: ${resources.systemTotalMb} MB total${free}.`);
    }
    if (resources.workerRssMb) parts.push(`Worker RSS: ${resources.workerRssMb} MB.`);
    if (resources.chromiumParentRssMb) parts.push(`Chromium parent RSS: ${resources.chromiumParentRssMb} MB.`);
    const tail = firstUsefulLine(diag.stderrTail);
    if (tail && !parts.some((part) => tail.includes(part))) parts.push(tail);
    return parts.join('\n') || (diag.active ? 'Chromium is still starting.' : 'Xbox worker Chromium is not running.');
  }

  function showMessage(root, title, detail) {
    const empty = root.querySelector('[data-cloud-xbox-empty]');
    if (!empty) return;
    empty.innerHTML = '';
    const box = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = title;
    const span = document.createElement('span');
    span.textContent = detail || '';
    box.append(strong, span);
    empty.append(box);
    empty.style.display = 'grid';
  }

  async function showFailure(root) {
    const payload = await diagnostics();
    const diag = diagnosticBody(payload);
    const text = summary(payload);
    showMessage(root, 'Xbox worker stopped', text);
    const status = root.querySelector('[data-cloud-xbox-status]');
    if (status && !diag?.active) {
      status.textContent = diag?.exitSignal
        ? `Chromium ${diag.exitSignal}`
        : Number.isInteger(diag?.exitCode)
          ? `Chromium exit ${diag.exitCode}`
          : 'Xbox worker stopped';
      status.style.color = '#ff9caa';
    }
  }

  function bind(root) {
    if (!root || root.dataset.cloudXboxRecovery === '1') return;
    root.dataset.cloudXboxRecovery = '1';
    const image = root.querySelector('[data-cloud-xbox-frame]');
    const status = root.querySelector('[data-cloud-xbox-status]');

    if (image) {
      image.classList.remove('cloud-xbox-frame-ready');
      image.addEventListener('load', () => {
        image.classList.add('cloud-xbox-frame-ready');
      });
      image.addEventListener('error', async () => {
        image.classList.remove('cloud-xbox-frame-ready');
        const current = String(status?.textContent || '').toLowerCase();
        if (current.includes('stopped') || current.includes('exit') || current.includes('unavailable') || current.includes('worker')) {
          await showFailure(root);
        } else {
          showMessage(root, 'Starting Xbox worker…', 'Waiting for the first usable Chromium frame. The browser is running on its own Fly Machine, not inside the SPMT web server.');
        }
      });
    }

    if (status) {
      const observer = new MutationObserver(() => {
        const text = String(status.textContent || '').toLowerCase();
        if (text.includes('stopped') || text.includes('unavailable') || text.includes('chromium exit') || text.includes('worker timed out')) {
          showFailure(root);
        }
      });
      observer.observe(status, { childList: true, characterData: true, subtree: true });
    }
  }

  function bindAll() {
    document.querySelectorAll('[data-cloud-xbox-widget]').forEach(bind);
  }

  const observer = new MutationObserver(bindAll);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(bindAll, 0);
  setTimeout(bindAll, 800);
})();
