const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync('xbox-worker.cjs', 'utf8');
const classStart = source.indexOf('class CdpClient {');
const classEnd = source.indexOf('\nasync function pageTargets', classStart);
assert.ok(classStart >= 0 && classEnd > classStart, 'CdpClient source block should be present');
const cdpSource = `${source.slice(classStart, classEnd)}\nglobalThis.CdpClient = CdpClient;`;

function loadCdpClient(FakeWebSocket) {
  const context = {
    WebSocket: FakeWebSocket,
    setTimeout,
    clearTimeout,
    Error,
    String,
  };
  vm.runInNewContext(cdpSource, context, { filename: 'xbox-worker-cdp-client.vm.js' });
  return context.CdpClient;
}

test('synchronous CDP send failure cannot leave an orphan timeout rejection', async () => {
  class FakeWebSocket extends EventEmitter {
    static OPEN = 1;

    constructor() {
      super();
      this.readyState = 0;
      queueMicrotask(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.emit('open');
      });
    }

    send() {
      throw new Error('socket closed during send');
    }

    close() {
      this.readyState = 3;
      this.emit('close');
    }

    terminate() {
      this.close();
    }
  }

  const CdpClient = loadCdpClient(FakeWebSocket);
  const client = new CdpClient('ws://fake');
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await assert.rejects(client.call('Runtime.evaluate', {}, 20), /socket closed during send/);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
    client.close();
  }
});

test('CDP request timeout is settled by the tracked pending request', async () => {
  class FakeWebSocket extends EventEmitter {
    static OPEN = 1;

    constructor() {
      super();
      this.readyState = 0;
      queueMicrotask(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.emit('open');
      });
    }

    send(_payload, callback) {
      if (callback) callback();
    }

    close() {
      this.readyState = 3;
      this.emit('close');
    }

    terminate() {
      this.close();
    }
  }

  const CdpClient = loadCdpClient(FakeWebSocket);
  const client = new CdpClient('ws://fake');
  await assert.rejects(client.call('Runtime.evaluate', {}, 20), /Runtime\.evaluate timed out/);
  assert.equal(client.pending.size, 0);
  client.close();
});

test('post-connect CDP socket errors reject requests instead of becoming unhandled EventEmitter errors', async () => {
  class FakeWebSocket extends EventEmitter {
    static OPEN = 1;

    constructor() {
      super();
      this.readyState = 0;
      queueMicrotask(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.emit('open');
      });
    }

    send(_payload, callback) {
      if (callback) callback();
    }

    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.emit('close');
    }

    terminate() {
      this.close();
    }
  }

  const CdpClient = loadCdpClient(FakeWebSocket);
  const client = new CdpClient('ws://fake');
  await client.connect();
  const socket = client.ws;
  assert.ok(socket.listenerCount('error') >= 1, 'connected socket should retain an error listener');

  const callPromise = client.call('Runtime.evaluate', {}, 1000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.doesNotThrow(() => socket.emit('error', new Error('post-connect CDP failure')));
  await assert.rejects(callPromise, /post-connect CDP failure/);
  assert.equal(client.ws, null);
  assert.equal(client.pending.size, 0);
});

test('a delayed close from a failed socket cannot reject requests on a recovered socket', async () => {
  class FakeWebSocket extends EventEmitter {
    static OPEN = 1;
    static instances = [];

    constructor() {
      super();
      this.readyState = 0;
      this.sent = [];
      FakeWebSocket.instances.push(this);
      queueMicrotask(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.emit('open');
      });
    }

    send(payload, callback) {
      this.sent.push(String(payload));
      if (callback) callback();
    }

    close() {
      this.readyState = 3;
      this.emit('close');
    }

    terminate() {
      // Model a real socket where close can arrive on a later turn.
      this.readyState = 3;
    }
  }

  const CdpClient = loadCdpClient(FakeWebSocket);
  const client = new CdpClient('ws://fake');
  await client.connect();
  const oldSocket = client.ws;

  const oldCall = client.call('Runtime.evaluate', {}, 1000);
  await new Promise((resolve) => setImmediate(resolve));
  oldSocket.emit('error', new Error('old socket failed'));
  await assert.rejects(oldCall, /old socket failed/);
  assert.equal(client.ws, null);

  await client.connect();
  const recoveredSocket = client.ws;
  assert.notEqual(recoveredSocket, oldSocket);
  const recoveredCall = client.call('Runtime.evaluate', {}, 1000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(client.pending.size, 1);

  oldSocket.emit('close');
  assert.equal(client.ws, recoveredSocket);
  assert.equal(client.pending.size, 1, 'stale close must not reject the recovered request');

  const request = JSON.parse(recoveredSocket.sent.at(-1));
  recoveredSocket.emit('message', JSON.stringify({ id: request.id, result: { ok: true } }));
  const result = await recoveredCall;
  assert.equal(result.ok, true);
  assert.equal(client.pending.size, 0);
  client.close();
});

test('explicit client close rejects pending requests from every socket generation', async () => {
  class FakeWebSocket extends EventEmitter {
    static OPEN = 1;

    constructor() {
      super();
      this.readyState = 0;
      queueMicrotask(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.emit('open');
      });
    }

    send(_payload, callback) {
      if (callback) callback();
    }

    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.emit('close');
    }

    terminate() {
      this.readyState = 3;
    }
  }

  const CdpClient = loadCdpClient(FakeWebSocket);
  const client = new CdpClient('ws://fake');
  await client.connect();
  const oldSocket = client.ws;
  const oldCall = client.call('Runtime.evaluate', {}, 1000);
  await new Promise((resolve) => setImmediate(resolve));

  // Simulate a socket that has stopped being OPEN but has not emitted close yet.
  oldSocket.readyState = 3;
  const newCall = client.call('Runtime.evaluate', {}, 1000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.notEqual(client.ws, oldSocket);
  assert.equal(client.pending.size, 2);

  const oldRejected = assert.rejects(oldCall, /CDP connection closed/);
  const newRejected = assert.rejects(newCall, /CDP connection closed/);
  client.close();
  await Promise.all([oldRejected, newRejected]);
  assert.equal(client.ws, null);
  assert.equal(client.pending.size, 0);
});

test('connect timeout terminates its stale socket before rejecting', () => {
  const classSource = source.slice(classStart, classEnd);
  const terminateAt = classSource.indexOf('socket.terminate()');
  const timeoutRejectAt = classSource.indexOf("reject(new Error('CDP websocket timeout'))");
  assert.ok(terminateAt >= 0, 'connect timeout should terminate the socket');
  assert.ok(timeoutRejectAt > terminateAt, 'socket termination should happen before timeout rejection');
});
