from pathlib import Path

path = Path('xbox-worker.cjs')
text = path.read_text()
old = """  close() {
    const socket = this.ws;
    this.ws = null;
    if (!socket) return;
    try { socket.close(); } catch {}
    this.rejectPendingForSocket(socket, new Error('CDP connection closed'));
  }
"""
new = """  close() {
    const socket = this.ws;
    this.ws = null;
    try { socket?.close(); } catch {}
    const failure = new Error('CDP connection closed');
    for (const pending of [...this.pending.values()]) pending.reject(failure);
  }
"""
if old not in text:
    raise SystemExit('CdpClient close block not found')
path.write_text(text.replace(old, new, 1))
