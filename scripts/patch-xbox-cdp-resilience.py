from pathlib import Path

path = Path('xbox-worker.cjs')
text = path.read_text()
old = """class CdpClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    this.ws = new WebSocket(this.url, { origin: 'http://127.0.0.1' });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP websocket timeout')), 5000);
      this.ws.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    this.ws.on('message', (raw) => {
      let message;
      try { message = JSON.parse(String(raw)); } catch { return; }
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'CDP error'));
      else pending.resolve(message.result || {});
    });
    this.ws.on('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('CDP connection closed'));
      this.pending.clear();
    });
  }

  async call(method, params = {}, timeoutMs = 10000) {
    await this.connect();
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
    });
    this.ws.send(JSON.stringify({ id, method, params }));
    return await promise;
  }

  close() {
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }
}
"""
new = """class CdpClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.connecting = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connecting) return await this.connecting;

    const socket = new WebSocket(this.url, { origin: 'http://127.0.0.1' });
    this.ws = socket;
    this.connecting = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try { socket.terminate(); } catch {}
        reject(new Error('CDP websocket timeout'));
      }, 5000);
      const onOpen = () => {
        clearTimeout(timer);
        socket.off('error', onError);
        resolve();
      };
      const onError = (error) => {
        clearTimeout(timer);
        socket.off('open', onOpen);
        reject(error);
      };
      socket.once('open', onOpen);
      socket.once('error', onError);
    });

    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }

    socket.on('message', (raw) => {
      let message;
      try { message = JSON.parse(String(raw)); } catch { return; }
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      if (message.error) pending.reject(new Error(message.error.message || 'CDP error'));
      else pending.resolve(message.result || {});
    });
    socket.on('close', () => {
      if (this.ws === socket) this.ws = null;
      for (const pending of [...this.pending.values()]) pending.reject(new Error('CDP connection closed'));
    });
  }

  async call(method, params = {}, timeoutMs = 10000) {
    await this.connect();
    const id = this.nextId++;
    let timer = null;
    let settled = false;
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      this.pending.delete(id);
      handler(value);
    };
    const pending = {
      resolve: (value) => finish(resolvePromise, value),
      reject: (error) => finish(rejectPromise, error instanceof Error ? error : new Error(String(error || 'CDP request failed'))),
    };
    this.pending.set(id, pending);
    timer = setTimeout(() => pending.reject(new Error(`${method} timed out`)), timeoutMs);

    try {
      this.ws.send(JSON.stringify({ id, method, params }), (error) => {
        if (error) pending.reject(error);
      });
    } catch (error) {
      pending.reject(error);
    }
    return await promise;
  }

  close() {
    const socket = this.ws;
    this.ws = null;
    try { socket?.close(); } catch {}
    for (const pending of [...this.pending.values()]) pending.reject(new Error('CDP connection closed'));
  }
}
"""
if old not in text:
    raise SystemExit('CdpClient block not found')
path.write_text(text.replace(old, new, 1))
