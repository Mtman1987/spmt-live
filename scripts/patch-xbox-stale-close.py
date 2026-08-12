from pathlib import Path

path = Path('xbox-worker.cjs')
text = path.read_text()

old = """  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
"""
new = """  rejectPendingForSocket(socket, error) {
    for (const pending of [...this.pending.values()]) {
      if (pending.socket === socket) pending.reject(error);
    }
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
"""
if old not in text:
    raise SystemExit('connect entry not found')
text = text.replace(old, new, 1)

old = """      const onSocketError = (error) => {
        if (this.ws !== socket) return;
        this.ws = null;
        const failure = error instanceof Error ? error : new Error(String(error || 'CDP connection error'));
        for (const pending of [...this.pending.values()]) pending.reject(failure);
        try { socket.terminate(); } catch {}
      };
"""
new = """      const onSocketError = (error) => {
        const failure = error instanceof Error ? error : new Error(String(error || 'CDP connection error'));
        if (this.ws === socket) this.ws = null;
        this.rejectPendingForSocket(socket, failure);
        try { socket.terminate(); } catch {}
      };
"""
if old not in text:
    raise SystemExit('post-connect error block not found')
text = text.replace(old, new, 1)

old = """      const pending = this.pending.get(message.id);
      if (!pending) return;
      if (message.error) pending.reject(new Error(message.error.message || 'CDP error'));
"""
new = """      const pending = this.pending.get(message.id);
      if (!pending || pending.socket !== socket) return;
      if (message.error) pending.reject(new Error(message.error.message || 'CDP error'));
"""
if old not in text:
    raise SystemExit('message pending block not found')
text = text.replace(old, new, 1)

old = """    socket.on('close', () => {
      if (this.ws === socket) this.ws = null;
      for (const pending of [...this.pending.values()]) pending.reject(new Error('CDP connection closed'));
    });
"""
new = """    socket.on('close', () => {
      if (this.ws === socket) this.ws = null;
      this.rejectPendingForSocket(socket, new Error('CDP connection closed'));
    });
"""
if old not in text:
    raise SystemExit('socket close block not found')
text = text.replace(old, new, 1)

old = """  async call(method, params = {}, timeoutMs = 10000) {
    await this.connect();
    const id = this.nextId++;
"""
new = """  async call(method, params = {}, timeoutMs = 10000) {
    await this.connect();
    const socket = this.ws;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('CDP connection is not open');
    const id = this.nextId++;
"""
if old not in text:
    raise SystemExit('call entry not found')
text = text.replace(old, new, 1)

old = """    const pending = {
      resolve: (value) => finish(resolvePromise, value),
      reject: (error) => finish(rejectPromise, error instanceof Error ? error : new Error(String(error || 'CDP request failed'))),
    };
"""
new = """    const pending = {
      socket,
      resolve: (value) => finish(resolvePromise, value),
      reject: (error) => finish(rejectPromise, error instanceof Error ? error : new Error(String(error || 'CDP request failed'))),
    };
"""
if old not in text:
    raise SystemExit('pending block not found')
text = text.replace(old, new, 1)

old = """      this.ws.send(JSON.stringify({ id, method, params }), (error) => {
        if (error) pending.reject(error);
      });
"""
new = """      socket.send(JSON.stringify({ id, method, params }), (error) => {
        if (error) pending.reject(error);
      });
"""
if old not in text:
    raise SystemExit('socket send block not found')
text = text.replace(old, new, 1)

old = """  close() {
    const socket = this.ws;
    this.ws = null;
    try { socket?.close(); } catch {}
    for (const pending of [...this.pending.values()]) pending.reject(new Error('CDP connection closed'));
  }
"""
new = """  close() {
    const socket = this.ws;
    this.ws = null;
    if (!socket) return;
    try { socket.close(); } catch {}
    this.rejectPendingForSocket(socket, new Error('CDP connection closed'));
  }
"""
if old not in text:
    raise SystemExit('close method not found')
text = text.replace(old, new, 1)

path.write_text(text)
