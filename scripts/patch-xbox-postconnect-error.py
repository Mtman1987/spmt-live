from pathlib import Path

path = Path('xbox-worker.cjs')
text = path.read_text()
old = """    this.connecting = new Promise((resolve, reject) => {
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
"""
new = """    this.connecting = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try { socket.terminate(); } catch {}
        reject(new Error('CDP websocket timeout'));
      }, 5000);
      const onSocketError = (error) => {
        if (this.ws !== socket) return;
        this.ws = null;
        const failure = error instanceof Error ? error : new Error(String(error || 'CDP connection error'));
        for (const pending of [...this.pending.values()]) pending.reject(failure);
        try { socket.terminate(); } catch {}
      };
      const onOpen = () => {
        clearTimeout(timer);
        socket.off('error', onConnectError);
        socket.on('error', onSocketError);
        resolve();
      };
      const onConnectError = (error) => {
        clearTimeout(timer);
        socket.off('open', onOpen);
        if (this.ws === socket) this.ws = null;
        try { socket.terminate(); } catch {}
        reject(error);
      };
      socket.once('open', onOpen);
      socket.once('error', onConnectError);
    });
"""
if old not in text:
    raise SystemExit('CDP connect handler block not found')
path.write_text(text.replace(old, new, 1))
