import base64
import json
import os
import secrets
import socket
import struct
import subprocess
import time
import traceback
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

PORT = 9226
BASE = f"http://127.0.0.1:{PORT}"
LOCALAPPDATA = os.environ.get("LOCALAPPDATA", str(Path.home()))
PROFILE = Path(LOCALAPPDATA) / "SpaceMountain" / "XboxOverlayBayBridgeProfile"
RUNTIME_URL = "https://spmt.live/shared/xbox-bridge-runtime.js"
SPMT_URL = "https://spmt.live/overlay-bay.html"
XBOX_URL = "https://play.xbox.com/"


def http_json(path):
    with urlopen(BASE + path, timeout=3) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def find_edge():
    roots = [os.environ.get("PROGRAMFILES(X86)", ""), os.environ.get("PROGRAMFILES", ""), os.environ.get("LOCALAPPDATA", "")]
    for root in roots:
        if not root:
            continue
        candidate = Path(root) / "Microsoft" / "Edge" / "Application" / "msedge.exe"
        if candidate.exists():
            return str(candidate)
    return None


class SimpleWebSocket:
    def __init__(self, url, timeout=3):
        parsed = urlsplit(url)
        if parsed.scheme != "ws":
            raise RuntimeError("Expected local ws:// DevTools endpoint")
        self.host = parsed.hostname or "127.0.0.1"
        self.port = parsed.port or 80
        self.path = parsed.path or "/"
        if parsed.query:
            self.path += "?" + parsed.query
        self.sock = socket.create_connection((self.host, self.port), timeout=timeout)
        self.sock.settimeout(timeout)
        self._handshake()
        self.next_id = 1

    def _handshake(self):
        key = base64.b64encode(secrets.token_bytes(16)).decode("ascii")
        request = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            f"Origin: http://127.0.0.1:{PORT}\r\n\r\n"
        ).encode("ascii")
        self.sock.sendall(request)
        data = b""
        while b"\r\n\r\n" not in data:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError("DevTools WebSocket closed during handshake")
            data += chunk
        if b" 101 " not in data.split(b"\r\n", 1)[0]:
            raise RuntimeError("DevTools WebSocket handshake failed")

    def _recv_exact(self, count):
        parts = []
        while count:
            chunk = self.sock.recv(count)
            if not chunk:
                raise ConnectionError("WebSocket closed")
            parts.append(chunk)
            count -= len(chunk)
        return b"".join(parts)

    def _send_frame(self, payload):
        if isinstance(payload, str):
            payload = payload.encode("utf-8")
        mask = secrets.token_bytes(4)
        length = len(payload)
        header = bytearray([0x81])
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", length))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", length))
        header.extend(mask)
        masked = bytes(value ^ mask[index % 4] for index, value in enumerate(payload))
        self.sock.sendall(bytes(header) + masked)

    def _recv_text(self):
        fragments = []
        while True:
            b1, b2 = self._recv_exact(2)
            fin = bool(b1 & 0x80)
            opcode = b1 & 0x0F
            masked = bool(b2 & 0x80)
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack("!H", self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self._recv_exact(8))[0]
            mask = self._recv_exact(4) if masked else None
            payload = self._recv_exact(length) if length else b""
            if mask:
                payload = bytes(value ^ mask[index % 4] for index, value in enumerate(payload))
            if opcode == 0x8:
                return None
            if opcode == 0x9:
                continue
            if opcode in (0x1, 0x0):
                fragments.append(payload)
                if fin:
                    return b"".join(fragments).decode("utf-8", errors="replace")

    def call(self, method, params=None):
        command_id = self.next_id
        self.next_id += 1
        payload = {"id": command_id, "method": method}
        if params is not None:
            payload["params"] = params
        self._send_frame(json.dumps(payload))
        deadline = time.time() + 15
        while time.time() < deadline:
            raw = self._recv_text()
            if raw is None:
                raise RuntimeError("DevTools connection closed")
            message = json.loads(raw)
            if message.get("id") == command_id:
                if "error" in message:
                    raise RuntimeError(str(message["error"]))
                return message.get("result", {})
        raise TimeoutError(f"Timed out waiting for {method}")

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass


def target_for(predicate):
    for target in http_json("/json/list"):
        if target.get("type") == "page" and predicate((target.get("url") or "").lower()):
            return target
    return None


def evaluate(target, expression):
    ws = SimpleWebSocket(target["webSocketDebuggerUrl"])
    try:
        ws.call("Runtime.enable")
        result = ws.call("Runtime.evaluate", {
            "expression": expression,
            "awaitPromise": True,
            "returnByValue": True,
            "userGesture": True,
        })
        return ((result.get("result") or {}).get("value"))
    finally:
        ws.close()


def load_saved_layout(spmt_target):
    expression = """
      (async () => {
        try {
          const response = await fetch('/api/overlay-workspace', { credentials: 'include' });
          if (!response.ok) return { ok: false, status: response.status };
          const data = await response.json();
          return { ok: true, layout: data.layout || null };
        } catch (error) {
          return { ok: false, error: String(error) };
        }
      })()
    """
    return evaluate(spmt_target, expression)


def main():
    print("=" * 72)
    print("SpaceMountain / SPMT Xbox Overlay Bay Live Test")
    print("=" * 72)
    print()

    edge = find_edge()
    if not edge:
        raise RuntimeError("Microsoft Edge was not found")

    PROFILE.mkdir(parents=True, exist_ok=True)
    subprocess.Popen([
        edge,
        f"--remote-debugging-port={PORT}",
        "--remote-allow-origins=*",
        f"--user-data-dir={PROFILE}",
        "--no-first-run",
        "--new-window",
        SPMT_URL,
        XBOX_URL,
    ])

    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            http_json("/json/version")
            break
        except Exception:
            time.sleep(0.5)
    else:
        raise RuntimeError("Could not connect to Edge DevTools on localhost:9226")

    print("Two Edge tabs opened in the reusable SpaceMountain test profile.")
    print()
    print("1. In the SPMT tab, sign in if needed.")
    print("2. In Overlay Bay, add/save the sources you want to test.")
    print("   Easy test choices: Text, Image, Web, Alert, plus an Xbox base source.")
    print("3. Switch to Xbox, start Cloud Gaming, and wait for live gameplay.")
    print("4. Return here once and press ENTER. After injection, stay in Xbox.")
    print()
    input("Press ENTER when the live Xbox game is visible... ")

    spmt_target = target_for(lambda url: "spmt.live" in url)
    xbox_target = target_for(lambda url: "play.xbox.com" in url or "xbox.com/play" in url)
    if not spmt_target:
        raise RuntimeError("Could not find the SPMT tab")
    if not xbox_target:
        raise RuntimeError("Could not find the Xbox tab")

    saved = load_saved_layout(spmt_target)
    if not saved or not saved.get("ok"):
        status = saved.get("status") if isinstance(saved, dict) else None
        if status == 401:
            raise RuntimeError("SPMT is not signed in in this Edge profile. Sign in, save Overlay Bay, then rerun the test")
        raise RuntimeError(f"Could not read the saved Overlay Bay layout: {saved}")

    with urlopen(RUNTIME_URL, timeout=15) as response:
        runtime = response.read().decode("utf-8", errors="replace")

    layout_json = json.dumps(saved.get("layout"), separators=(",", ":"))
    evaluate(xbox_target, f"window.__SPMT_XBOX_BRIDGE_LAYOUT__ = {layout_json}; true")
    evaluate(xbox_target, runtime)

    print()
    print("Bridge injected successfully.")
    print("Click back into the Xbox tab now. From this point, use the controls INSIDE Xbox:")
    print("  Overlay      - show/hide your saved Overlay Bay")
    print("  Test follow  - fire the generic follow alert")
    print("  Test raid    - fire the generic raid alert")
    print("  Hide controls")
    print("  Exit")
    print()
    print("The bridge blocks Xbox element-fullscreen requests while active so the")
    print("SpaceMountain overlay remains visible. Exit restores normal fullscreen behavior.")
    print()
    input("After you finish testing, press ENTER here to close this launcher... ")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCancelled")
    except Exception as exc:
        print()
        print("THE TEST HIT AN ERROR")
        print("-" * 72)
        print("".join(traceback.format_exception(type(exc), exc, exc.__traceback__)))
    finally:
        print()
        input("Press ENTER to close... ")
