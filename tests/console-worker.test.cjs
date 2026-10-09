'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const dgram = require('node:dgram');
const { spawn, execFileSync, execFile } = require('node:child_process');
const execFileAsync = require('node:util').promisify(execFile);
const { createReceiver, question, ingestName, dnsAnswer, cleanPlaylist } = require('../console-worker.cjs');
const { DASH_USER_ID } = require('../stream-worker-scope.cjs');

function query(name, type = 1) {
 const labels = name.split('.').map(label => Buffer.concat([Buffer.from([label.length]), Buffer.from(label)]));
 const header = Buffer.alloc(12);header.writeUInt16BE(0x1234,0);header.writeUInt16BE(0x0100,2);header.writeUInt16BE(1,4);
 const tail = Buffer.alloc(5);tail.writeUInt16BE(type,1);tail.writeUInt16BE(1,3);
 return Buffer.concat([header,...labels,tail]);
}
test('DNS redirects only Twitch ingestion and retains the original question',()=>{
 for (const name of ['live.twitch.tv','live-lax.twitch.tv','ingest.global-contribute.live-video.net','abc.contribute.live-video.net']) {
  // Twitch uses both global-contribute and regional contribute names.
  const packet=query(name),q=question(packet);
  assert.ok(q);assert.equal(ingestName(name),true);
  const answer=dnsAnswer(packet,q,'203.0.113.22');
  assert.equal(answer.readUInt16BE(0),0x1234);assert.deepEqual(answer.subarray(12,q.end),packet.subarray(12,q.end));
  assert.deepEqual([...answer.subarray(-4)],[203,0,113,22]);
 }
 for (const name of ['twitch.tv','api.twitch.tv','live.twitch.tv.evil.com','evilcontribute.live-video.net','liveevil.twitch.tv.evil.com'])assert.equal(ingestName(name),false);
 const packet=query('live.twitch.tv',28);assert.equal(dnsAnswer(packet,question(packet),'203.0.113.22').readUInt16BE(6),0);
 const malformed=query('live.twitch.tv');malformed[12]=0xc0;assert.equal(question(malformed),null);
 const many=query('live.twitch.tv');many.writeUInt16BE(2,4);assert.equal(question(many),null);
});
test('HLS public manifests reject paths, traversal, external hosts, and secret URLs',()=>{
 assert.equal(cleanPlaylist('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\nseg1.mp4\n'),'#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\nseg1.mp4\n');
 for(const uri of ['../key/init.mp4','/app/secret/init.mp4','https://evil/seg.mp4','seg.mp4?key=secret'])assert.throws(()=>cleanPlaylist('#EXTM3U\n'+uri+'\n'));
 assert.throws(()=>cleanPlaylist('#EXT-X-MAP:URI="/app/secret/init.mp4"'));
});
async function port() { const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const value=server.address().port;await new Promise(r=>server.close(r));return value; }
async function until(callback, timeout=15000) {
 const end=Date.now()+timeout;while(Date.now()<end){const value=await callback();if(value)return value;await new Promise(r=>setTimeout(r,200));}throw Error('Test deadline exceeded');
}
test('real native-style RTMP keeps encoded video/audio and hides the native key',
 {skip:!process.env.CONSOLE_TEST_MEDIAMTX,timeout:55000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spmt-console-test-'));
 const ports=await Promise.all(Array.from({length:6},port));
 const [control,rtmp,media,hls,api,dns]=ports;
 const receiver=createReceiver({root,secret:'test-only-secret',port:control,rtmpPort:rtmp,mediaPort:media,hlsPort:hls,apiPort:api,dnsPort:dns,dnsBind:'127.0.0.1',publicIp:'203.0.113.22',binary:process.env.CONSOLE_TEST_MEDIAMTX,publicOrigin:'https://spmt-live.fly.dev:4448'});
 const url='http://127.0.0.1:'+control;
 const headers={'x-spmt-worker-secret':'test-only-secret','x-spmt-user-id':DASH_USER_ID,'content-type':'application/json'};
 let publisher,bridge;const bridgeSockets=new Set();
 try{
  await receiver.start();
  await until(async()=> (await fetch(url+'/health')).ok);
  assert.equal((await fetch(url+'/v1/status')).status,403);
  assert.equal((await fetch(url+'/v1/status',{headers:{...headers,'x-spmt-user-id':'other-tenant'}})).status,403);
  const registration=await fetch(url+'/v1/register',{method:'POST',headers,body:JSON.stringify({ip:'127.0.0.1'})});
  assert.equal(registration.status,200);
  const setup=await registration.json();assert.equal(setup.encoding,false);
  const udp=dgram.createSocket('udp4');
  const dnsReply=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{udp.close();reject(Error('DNS timed out'))},2000);
   udp.on('message',packet=>{clearTimeout(timer);udp.close();resolve(packet)});
   udp.send(query('live-lax.twitch.tv'),dns,'127.0.0.1');
  });
  assert.deepEqual([...dnsReply.subarray(-4)],[203,0,113,22]);
  const rejected=net.connect(rtmp,'127.0.0.1');
  await new Promise((resolve,reject)=>{rejected.on('error',reject);rejected.on('connect',()=>rejected.write('PROXY TCP4 203.0.113.99 203.0.113.22 12345 1935\r\n'));rejected.on('close',resolve)});
  const fixture=path.join(root,'fixture.mp4');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:size=320x180:rate=10','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','16','-c:v','libx264','-threads','1','-preset','ultrafast','-pix_fmt','yuv420p','-g','10','-bf','0','-c:a','aac','-b:a','96k','-y',fixture],{timeout:20000});
  bridge=net.createServer(client=>{
   bridgeSockets.add(client);client.on('close',()=>bridgeSockets.delete(client));
   const upstream=net.connect(rtmp,'127.0.0.1');bridgeSockets.add(upstream);upstream.on('close',()=>bridgeSockets.delete(upstream));
   upstream.on('connect',()=>{upstream.write('PROXY TCP4 127.0.0.1 203.0.113.22 12345 1935\r\n');client.pipe(upstream);upstream.pipe(client)});
   client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy());client.on('close',()=>upstream.destroy());upstream.on('close',()=>client.destroy());
  });
  await new Promise(r=>bridge.listen(0,'127.0.0.1',r));
  const nativeKey='live_fixture_not_a_real_twitch_key';
  publisher=spawn('ffmpeg',['-hide_banner','-loglevel','error','-re','-stream_loop','-1','-i',fixture,'-c','copy','-f','flv','rtmp://127.0.0.1:'+bridge.address().port+'/app/'+nativeKey],{stdio:'ignore'});
  const state=await until(async()=>{const r=await fetch(url+'/v1/status',{headers});const s=await r.json();return s.picture&&s.audio?s:null;});
  assert.equal(state.picture,true);assert.equal(state.audio,true);assert.equal(state.encoding,false);
  assert.ok(!JSON.stringify(state).includes(nativeKey));
  const playback=url+new URL(state.playerUrl).pathname.replace('/player.html','/media/index.m3u8');
  const manifest=await until(async()=>{const r=await fetch(playback);return r.ok?await r.text():null;});
  assert.ok(manifest.startsWith('#EXTM3U'));assert.ok(!manifest.includes(nativeKey));
  const baseline=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_packets','-show_data_hash','sha256','-show_data','-of','json',fixture],{maxBuffer:4000000,timeout:10000}).toString());
  const output=JSON.parse((await execFileAsync('ffprobe',['-v','error','-read_intervals','%+3','-show_streams','-show_packets','-show_data_hash','sha256','-show_data','-of','json',playback],{maxBuffer:4000000,timeout:15000})).stdout);

  function slices(packet) {
   const hex=packet.data.split('\n').filter(line=>/^[0-9a-f]{8}:/.test(line))
     .map(line=>line.slice(10,49).replace(/\s/g,'')).join('');
   const data=Buffer.from(hex,'hex');const hashes=[];let at=0;
   while(at+4<=data.length){
    const size=data.readUInt32BE(at);at+=4;
    assert.ok(size>0&&at+size<=data.length,'Invalid AVC packet');
    const nal=data.subarray(at,at+size),type=nal[0]&31;at+=size;
    if(type===1||type===5)hashes.push(require('node:crypto').createHash('sha256').update(nal).digest('hex'));
   }
   assert.ok(hashes.length>0,'Missing encoded H264 slice');
   return hashes;
  }
  for(const codec of ['h264','aac']){

   const src=baseline.streams.find(s=>s.codec_name===codec),dst=output.streams.find(s=>s.codec_name===codec);
   assert.ok(src&&dst,'Missing '+codec);
   const sourcePackets=baseline.packets.filter(p=>p.stream_index===src.index);
   const hashes=new Set(sourcePackets.flatMap(p=>codec==='h264'?slices(p):[p.data_hash]));
   const packets=output.packets.filter(p=>p.stream_index===dst.index);
   assert.ok(packets.length>5,'Missing '+codec+' packets');
   assert.ok(packets.every(p=>(codec==='h264'?slices(p):[p.data_hash]).every(hash=>hashes.has(hash))),codec+' encoded data was changed instead of remuxed');
  }
  assert.equal((await fetch(url+'/v1/register',{method:'POST',headers,body:JSON.stringify({ip:'203.0.113.3'})})).status,409);
  publisher.kill('SIGTERM');await until(async()=>{const r=await fetch(url+'/v1/status',{headers});return !(await r.json()).running;});
  assert.equal(receiver.status().counters.rejectedConnections,1);
  const saved=fs.readFileSync(path.join(root,'pilot.json'),'utf8');assert.ok(!saved.includes(nativeKey));
 }finally{
  publisher?.kill('SIGKILL');for(const socket of bridgeSockets)socket.destroy();
  if(bridge)await new Promise(r=>bridge.close(r));
  await receiver.close();fs.rmSync(root,{recursive:true,force:true});
 }
});
test('adding PS5 preserves saved overlays and repeated connection preserves gameplay placement',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spmt-console-scene-'));
 const Database=require('better-sqlite3');const dbFile=path.join(root,'test.db');
 const db=new Database(dbFile);db.exec('CREATE TABLE users(id TEXT,username TEXT)');db.prepare('INSERT INTO users VALUES (?,?)').run(DASH_USER_ID,'thecaptaindash');db.close();
 const oldDb=process.env.DATABASE_PATH,oldRoot=process.env.SPMT_TENANT_SCENE_ROOT;
 process.env.DATABASE_PATH=dbFile;process.env.SPMT_TENANT_SCENE_ROOT=root;
 const modulePath=require.resolve('../tenant-overlay-bootstrap.cjs');delete require.cache[modulePath];
 try{
  const mod=require(modulePath);const widgets=[mod._test.normalizeWidget({id:'my-alerts',title:'Alerts',kind:'embed',url:'https://spmt.live/example',x:11,y:13,width:400,height:120,zIndex:9})];
  const layout={...mod._test.emptyLayout(),widgets};const personal={...mod._test.emptyLayout(),widgets:[mod._test.normalizeWidget({id:'personal-only',kind:'text',text:'keep'})]};
  const record={tenant:'thecaptaindash',userId:DASH_USER_ID,outputs:{public:layout,personal,lounge:mod._test.emptyLayout()},outputUpdatedAt:{}};
  fs.writeFileSync(path.join(root,'thecaptaindash.json'),JSON.stringify(record));
  const url='https://spmt-live.fly.dev:4448/ps5/'+'a'.repeat(64)+'/player.html';
  const result=mod.addConsoleGameplay(DASH_USER_ID,url);
  assert.deepEqual(result.layout.widgets.filter(w=>w.id!=='spmt-ps5-gameplay'),widgets);
  assert.equal(result.urls.public,'https://spmt.live/tenant/thecaptaindash/public');
  const file=path.join(root,'thecaptaindash.json'),saved=JSON.parse(fs.readFileSync(file));
  assert.deepEqual(saved.outputs.personal,personal);
  saved.outputs.public.widgets[0].x=17;saved.outputs.public.widgets[0].audioVolume=35;
  fs.writeFileSync(file,JSON.stringify(saved));
  const second=mod.addConsoleGameplay(DASH_USER_ID,url);
  assert.equal(second.layout.widgets.filter(w=>w.id==='spmt-ps5-gameplay').length,1);
  assert.equal(second.layout.widgets[0].x,17);assert.equal(second.layout.widgets[0].audioVolume,35);
  assert.throws(()=>mod.addConsoleGameplay('other',url));
  assert.throws(()=>mod.addConsoleGameplay(DASH_USER_ID,'https://evil.test/player.html'));
 }finally{
  if(oldDb===undefined)delete process.env.DATABASE_PATH;else process.env.DATABASE_PATH=oldDb;
  if(oldRoot===undefined)delete process.env.SPMT_TENANT_SCENE_ROOT;else process.env.SPMT_TENANT_SCENE_ROOT=oldRoot;
  delete require.cache[modulePath];fs.rmSync(root,{recursive:true,force:true});
 }
});
