'use strict';
// Dedicated single-account PS5 pilot. Native console encoding -> RTMP -> HLS
// remux. No ffmpeg, screenshot capture, or video encoder runs in this process.
const http = require('node:http');
const net = require('node:net');
const dgram = require('node:dgram');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream');
const { Readable } = require('node:stream');
const { DASH_USER_ID } = require('./stream-worker-scope.cjs');

function equal(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}
function ipv4(value) {
  const ip = String(value || '').replace(/^::ffff:/, '');
  return net.isIP(ip) === 4 ? ip : '';
}
function ingestName(name) {
  return /^live[a-z0-9-]*\.twitch\.tv$/i.test(name)
    || /^[a-z0-9.-]+\.(?:global-)?contribute\.live-video\.net$/i.test(name);
}
function question(packet) {
  if (!Buffer.isBuffer(packet) || packet.length < 17 || packet.length > 1232
    || packet.readUInt16BE(2) & 0xf800 || packet.readUInt16BE(4) !== 1) return null;
  let at = 12; const labels = [];
  while (at < packet.length) {
    const len = packet[at++];
    if (len === 0) break;
    if (len > 63 || at + len > packet.length || labels.length >= 127) return null;
    const label = packet.subarray(at, at + len).toString('ascii');
    if (!/^[a-z0-9_-]+$/i.test(label)) return null;
    labels.push(label); at += len;
  }
  if (!labels.length || at + 4 > packet.length || at > 267) return null;
  return { name: labels.join('.').toLowerCase(), type: packet.readUInt16BE(at),
    class: packet.readUInt16BE(at + 2), end: at + 4 };
}
function dnsAnswer(packet, q, ip) {
  // Intercept only ingest A records; AAAA/HTTPS/SVCB receive an empty answer
  // so the console cannot bypass the IPv4 receiver.
  const hasA = q.type === 1 && q.class === 1;
  const header = Buffer.alloc(12);
  packet.copy(header, 0, 0, 2);
  header.writeUInt16BE(0x8080 | (packet.readUInt16BE(2) & 0x0100), 2);
  header.writeUInt16BE(1, 4); header.writeUInt16BE(hasA ? 1 : 0, 6);
  const out = [header, packet.subarray(12, q.end)];
  if (hasA) {
    const rr = Buffer.alloc(16);
    rr.writeUInt16BE(0xc00c, 0); rr.writeUInt16BE(1, 2); rr.writeUInt16BE(1, 4);
    rr.writeUInt32BE(30, 6); rr.writeUInt16BE(4, 10);
    ip.split('.').forEach((v, i) => rr[12 + i] = Number(v));
    out.push(rr);
  }
  return Buffer.concat(out);
}
function mediaFile(value) {
  return /^(?:[a-zA-Z0-9_-]+\.(?:m3u8|mp4|m4s|ts))$/.test(value);
}
function cleanPlaylist(text) {
  const uri = value => {
    if (!mediaFile(value)) throw new Error('Invalid media reference');
    return value;
  };
  return text.split('\n').map(line => {
    if (!line.trim()) return line;
    if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, value) => 'URI="' + uri(value) + '"');
    return uri(line.trim());
  }).join('\n');
}
function readProxy(socket, ready) {
  let data = Buffer.alloc(0);
  socket.setTimeout(5000, () => socket.destroy());
  const onData = chunk => {
    data = Buffer.concat([data, chunk]);
    const end = data.indexOf('\r\n');
    if (end < 0) { if (data.length > 108) socket.destroy(); return; }
    if (end > 106) { socket.destroy(); return; }
    const match = /^PROXY TCP4 (\S+) (\S+) (\d{1,5}) (\d{1,5})$/.exec(data.subarray(0, end).toString('ascii'));
    if (!match || !ipv4(match[1]) || !ipv4(match[2]) || Number(match[3]) > 65535 || Number(match[4]) > 65535) {
      socket.destroy(); return;
    }
    socket.removeListener('data', onData);
    socket.pause(); socket.setTimeout(0);
    ready(match[1], data.subarray(end + 2));
  };
  socket.on('data', onData);
}
function json(res, code, value) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function body(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 4096) throw new Error('Request too large');
  }
  return JSON.parse(data || '{}');
}
function createReceiver(options = {}) {
  const cfg = {
    secret: options.secret || process.env.CLOUD_XBOX_WORKER_SECRET || process.env.JWT_SECRET,
    userId: DASH_USER_ID,
    root: process.env.CONSOLE_STATE_ROOT || '/var/lib/spmt-console',
    port: Number(process.env.CONSOLE_WORKER_PORT || 3004),
    rtmpPort: Number(process.env.CONSOLE_RTMP_PORT || 1935),
    mediaPort: Number(process.env.CONSOLE_MEDIA_RTMP_PORT || 1936),
    hlsPort: Number(process.env.CONSOLE_HLS_PORT || 8888),
    apiPort: Number(process.env.CONSOLE_API_PORT || 9997),
    dnsPort: Number(process.env.CONSOLE_DNS_PORT || 53),
    dnsBind: process.env.FLY_APP_NAME ? 'fly-global-services' : '127.0.0.1',
    publicIp: process.env.CONSOLE_PUBLIC_IPV4 || '',
    publicOrigin: process.env.CONSOLE_PUBLIC_ORIGIN || 'https://spmt-live.fly.dev:4448',
    binary: process.env.CONSOLE_MEDIAMTX_PATH || '/usr/local/bin/mediamtx',
    ...options,
  };
  if (!cfg.secret) throw new Error('Console worker authentication is missing');
  const viewer = crypto.createHmac('sha256', cfg.secret).update('spmt:ps5:viewer:' + cfg.userId).digest('hex');
  const mediaCdnSecret = crypto.createHmac('sha256', cfg.secret).update('spmt:ps5:internal-hls:' + cfg.userId).digest('hex');
  let pilotIp = '', publishPath = '', media = null, stopping = false, ready = false, tracks = [];
  let counters = { dnsRequests: 0, ingestDnsRequests: 0, acceptedConnections: 0, rejectedConnections: 0 };
  let lastIngestDnsAt = null, lastConnectionAt = null;
  fs.mkdirSync(cfg.root, { recursive: true, mode: 0o700 });
  const registry = path.join(cfg.root, 'pilot.json');
  try { pilotIp = ipv4(JSON.parse(fs.readFileSync(registry, 'utf8')).ip); } catch {}
  const sockets = new Set(), upstreamDns = new Set();
  let dnsWindowAt = 0, dnsWindowCount = 0;
  const base = '/ps5/' + viewer;
  const isControl = req => equal(req.headers['x-spmt-worker-secret'], cfg.secret)
    && equal(req.headers['x-spmt-user-id'], cfg.userId);
  const local = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const allowed = ip => Boolean(pilotIp) && ipv4(ip) === pilotIp;
  const publicState = () => ({ registered: Boolean(pilotIp), running: ready,
    tracks, picture: ready && tracks.some(x => /^H264$/i.test(x)),
    audio: ready && tracks.some(x => /MPEG-4\s*Audio|AAC/i.test(x)),
    dnsIpv4: cfg.publicIp, dnsReady: ipv4(cfg.publicIp) !== '', lastIngestDnsAt,
    lastConnectionAt, counters: { ...counters }, encoding: false,
    playerUrl: cfg.publicOrigin + base + '/player.html' });
  async function updateStatus() {
    try {
      const response = await fetch('http://127.0.0.1:' + cfg.apiPort + '/v3/paths/list',
        { signal: AbortSignal.timeout(2000) });
      if (!response.ok) throw new Error('Media status unavailable');
      const data = await response.json();
      const current = data.items?.find(p => p.name === publishPath && p.ready);
      ready = Boolean(current); tracks = current?.tracks || [];
    } catch { ready = false; tracks = []; }
  }
  async function proxyHls(req, res, file) {
    if (!publishPath) return json(res, 404, { error: 'Waiting for PS5 gameplay' });
    if (!mediaFile(file)) return json(res, 404, { error: 'Media not found' });
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    res.on('close', () => { clearTimeout(timer); ctl.abort(); });
    try {
      const encoded = publishPath.split('/').map(encodeURIComponent).join('/');
      const upstream = await fetch('http://127.0.0.1:' + cfg.hlsPort + '/' + encoded + '/' + file,
        { signal: ctl.signal, redirect: 'error', headers: { Authorization: 'Bearer ' + mediaCdnSecret } });
      if (!upstream.ok) { clearTimeout(timer); return json(res, upstream.status, { error: 'Waiting for gameplay' }); }
      if (file.endsWith('.m3u8')) {
        const text = cleanPlaylist(await upstream.text());
        clearTimeout(timer);
        res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-store' });
        return res.end(text);
      }
      res.writeHead(200, { 'content-type': upstream.headers.get('content-type') || 'video/mp4',
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      pipeline(Readable.fromWeb(upstream.body), res, () => { clearTimeout(timer); ctl.abort(); });
    } catch { clearTimeout(timer); if (!res.headersSent) json(res, 503, { error: 'Gameplay is reconnecting' }); else res.destroy(); }
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, media && media.exitCode === null ? 200 : 503, { ok: Boolean(media && media.exitCode === null) });
      }
      if (url.pathname === '/internal/media-auth') {
        if (req.method !== 'POST' || !local(req)) return json(res, 403, { error: 'Denied' });
        const b = await body(req);
        if (b.action === 'api' && ipv4(b.ip) === '127.0.0.1') return json(res, 200, {});
        if (b.action === 'read' && b.protocol === 'hls' && ipv4(b.ip) === '127.0.0.1'
          && b.path === publishPath) return json(res, 200, {});
        if (b.action !== 'publish' || b.protocol !== 'rtmp' || ipv4(b.ip) !== '127.0.0.1'
          || !pilotIp || !/^(?:[a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_-]{8,256}$/.test(b.path || '')) return json(res, 403, {});
        await updateStatus();
        if (ready && publishPath !== b.path) return json(res, 409, {});
        // Native Twitch key stays only in memory. Never log/persist it or put it
        // in a browser URL. Public HLS uses the independent viewer capability.
        publishPath = b.path;
        return json(res, 200, {});
      }
      if (url.pathname.startsWith('/v1/')) {
        if (!isControl(req)) return json(res, 403, { error: 'This receiver belongs to the PS5 pilot account.' });
        if (req.method === 'GET' && url.pathname === '/v1/status') {
          await updateStatus(); return json(res, 200, publicState());
        }
        if (req.method === 'POST' && url.pathname === '/v1/register') {
          const b = await body(req); const ip = ipv4(b.ip);
          if (!ip || !ipv4(cfg.publicIp)) return json(res, 400, { error: 'Connect from the PS5 home network using IPv4.' });
          await updateStatus();
          if (ready && pilotIp && pilotIp !== ip) return json(res, 409, { error: 'End the PS5 broadcast before changing its network.' });
          pilotIp = ip;
          fs.writeFileSync(registry + '.tmp', JSON.stringify({ ip }), { mode: 0o600 });
          fs.renameSync(registry + '.tmp', registry);
          return json(res, 200, publicState());
        }
        return json(res, 404, { error: 'Not found' });
      }
      if (req.method !== 'GET' || !url.pathname.startsWith(base + '/')) return json(res, 404, { error: 'Not found' });
      const rest = url.pathname.slice(base.length + 1);
      if (rest === 'player.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
          'referrer-policy': 'no-referrer', 'permissions-policy': 'autoplay=*' });
        return res.end(fs.readFileSync(path.join(__dirname, 'public', 'ps5-player.html')));
      }
      if (rest === 'hls.min.js') {
        res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'public, max-age=31536000, immutable' });
        return fs.createReadStream(path.join(__dirname, 'node_modules', 'hls.js', 'dist', 'hls.min.js')).pipe(res);
      }
      if (rest.startsWith('media/')) return await proxyHls(req, res, rest.slice(6));
      return json(res, 404, { error: 'Not found' });
    } catch { if (!res.headersSent) json(res, 400, { error: 'Request failed' }); else res.destroy(); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.maxConnections = 64;
  const rtmp = net.createServer(socket => {
    if (sockets.size >= 8) return socket.destroy();
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    readProxy(socket, (ip, first) => {
      if (!allowed(ip)) { counters.rejectedConnections++; return socket.destroy(); }
      counters.acceptedConnections++; lastConnectionAt = Date.now();
      const target = net.connect(cfg.mediaPort, '127.0.0.1');
      target.on('error', () => socket.destroy()); socket.on('error', () => target.destroy());
      target.on('close', () => socket.destroy()); socket.on('close', () => target.destroy());
      target.on('connect', () => {
        if (first.length) target.write(first);
        socket.pipe(target); target.pipe(socket); socket.resume();
      });
    });
  });
  function dnsResponse(packet, ip, respond, tcp = false) {
    if (!allowed(ip)) return; // No response to arbitrary internet resolver clients.
    const q = question(packet); if (!q) return;
    const now = Date.now();
    if (now - dnsWindowAt >= 1000) { dnsWindowAt = now; dnsWindowCount = 0; }
    if (++dnsWindowCount > 40 || upstreamDns.size >= 32) return;
    counters.dnsRequests++;
    if (ingestName(q.name)) {
      counters.ingestDnsRequests++; lastIngestDnsAt = now;
      respond(dnsAnswer(packet, q, cfg.publicIp)); return;
    }
    if (tcp) {
      const upstream = net.connect(53, '1.1.1.1');
      upstreamDns.add(upstream); let pending = Buffer.alloc(0);
      const close = () => { upstreamDns.delete(upstream); upstream.destroy(); };
      upstream.setTimeout(2000, close); upstream.on('error', close); upstream.on('close', () => upstreamDns.delete(upstream));
      upstream.on('connect', () => { const size = Buffer.alloc(2); size.writeUInt16BE(packet.length); upstream.write(Buffer.concat([size, packet])); });
      upstream.on('data', chunk => {
        pending = Buffer.concat([pending, chunk]);
        if (pending.length < 2) return;
        const size = pending.readUInt16BE(0);
        if (size > 8192 || size < 12 || pending.length > 8194) return close();
        if (pending.length < size + 2) return;
        const answer = pending.subarray(2, size + 2);
        if (answer.readUInt16BE(0) === packet.readUInt16BE(0) && answer.readUInt16BE(2) & 0x8000) respond(answer);
        close();
      });
      return;
    }
    const upstream = dgram.createSocket('udp4');
    upstreamDns.add(upstream);
    const timer = setTimeout(close, 2000);
    function close() { clearTimeout(timer); upstreamDns.delete(upstream); try { upstream.close(); } catch {} }
    upstream.on('error', close);
    upstream.on('message', (answer, source) => {
      if (source.address !== '1.1.1.1' || source.port !== 53 || answer.length > 1232
        || answer.length < 12 || answer.readUInt16BE(0) !== packet.readUInt16BE(0)
        || !(answer.readUInt16BE(2) & 0x8000)) return;
      respond(answer); close();
    });
    upstream.send(packet, 53, '1.1.1.1', error => { if (error) close(); });
  }
  const udp = dgram.createSocket('udp4');
  udp.on('message', (packet, source) => dnsResponse(packet, source.address, answer => udp.send(answer, source.port, source.address)));
  const tcpDns = net.createServer(socket => {
    if (sockets.size >= 24) return socket.destroy();
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    readProxy(socket, (ip, first) => {
      if (!allowed(ip)) return socket.destroy();
      let pending = first;
      socket.setTimeout(10000, () => socket.destroy());
      function accept(chunk) {
        pending = Buffer.concat([pending, chunk]);
        if (pending.length > 8192) return socket.destroy();
        while (pending.length >= 2) {
          const size = pending.readUInt16BE(0);
          if (size > 1232 || size < 17) return socket.destroy();
          if (pending.length < size + 2) break;
          const packet = pending.subarray(2, size + 2); pending = pending.subarray(size + 2);
          dnsResponse(packet, ip, answer => {
            if (socket.destroyed) return;
            const prefix = Buffer.alloc(2); prefix.writeUInt16BE(answer.length);
            socket.write(Buffer.concat([prefix, answer]));
          }, true);
        }
      }
      socket.on('data', accept); accept(Buffer.alloc(0)); socket.resume();
    });
  });
  tcpDns.maxConnections = 16;
  let statusTimer;
  function config() {
    return { logLevel: 'error', logDestinations: ['stdout'], readTimeout: '10s', writeTimeout: '10s',
      authMethod: 'http', authHTTPAddress: 'http://127.0.0.1:' + cfg.port + '/internal/media-auth', authHTTPExclude: [],
      api: true, apiAddress: '127.0.0.1:' + cfg.apiPort, rtsp: false, rtmp: true,
      rtmpAddress: '127.0.0.1:' + cfg.mediaPort, rtmpEncryption: 'no', hls: true,
      hlsAddress: '127.0.0.1:' + cfg.hlsPort, hlsCDNSecret: mediaCdnSecret, hlsAlwaysRemux: false, hlsVariant: 'fmp4',
      hlsSegmentCount: 7, hlsSegmentDuration: '1s', hlsSegmentMaxSize: '8M', hlsMuxerCloseAfter: '30s',
      webrtc: false, srt: false, moq: false, playback: false, metrics: false, pprof: false,
      pathDefaults: { source: 'publisher', overridePublisher: false, maxReaders: 12, record: false },
      paths: { all_others: {} } };
  }
  async function listen(service, port, host) {
    await new Promise((resolve, reject) => { service.once('error', reject); service.listen(port, host, resolve); });
  }
  async function start() {
    await listen(server, cfg.port, '0.0.0.0');
    const file = path.join(cfg.root, 'mediamtx.json');
    fs.writeFileSync(file, JSON.stringify(config()), { mode: 0o600 });
    // Media server diagnostics contain native stream paths. Never pipe them to
    // Fly logs; publish only generic supervisor/status messages.
    media = spawn(cfg.binary, [file], { stdio: 'ignore' });
    media.on('error', () => { console.error('[PS5] Media process could not start'); if (!stopping) void close().then(() => { process.exitCode = 1; }); });
    media.on('exit', () => { ready = false; if (!stopping) { console.error('[PS5] Media process exited'); void close().then(() => { process.exitCode = 1; }); } });
    await listen(rtmp, cfg.rtmpPort, '0.0.0.0');
    await listen(tcpDns, cfg.dnsPort, '0.0.0.0');
    await new Promise((resolve, reject) => { udp.once('error', reject); udp.bind(cfg.dnsPort, cfg.dnsBind, resolve); });
    statusTimer = setInterval(updateStatus, 3000); statusTimer.unref();
    console.log('[PS5] Isolated DNS/RTMP/HLS receiver ready; waiting for pilot registration');
  }
  async function close() {
    if (stopping) return;
    stopping = true; clearInterval(statusTimer);
    for (const socket of sockets) socket.destroy();
    for (const socket of upstreamDns) { try { if (socket.destroy) socket.destroy(); else socket.close(); } catch {} }
    await Promise.all([server, rtmp, tcpDns].map(service => new Promise(resolve => {
      service.close(resolve); service.closeAllConnections?.();
    })));
    try { udp.close(); } catch {}
    if (media?.exitCode === null) media.kill('SIGTERM');
    publishPath = ''; ready = false; tracks = [];
  }
  return { start, close, status: publicState, config };
}
if (require.main === module) {
  const receiver = createReceiver();
  receiver.start().catch(() => { console.error('[PS5] Receiver could not start'); void receiver.close().then(() => { process.exitCode = 1; }); });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => receiver.close());
}
module.exports = { createReceiver, ingestName, question, dnsAnswer, mediaFile, cleanPlaylist, ipv4, readProxy };
