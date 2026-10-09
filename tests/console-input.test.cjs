'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spmt-console-'));
process.env.DATABASE_PATH=path.join(dir,'test.db');process.env.SPMT_TENANT_SCENE_ROOT=path.join(dir,'scenes');process.env.JWT_SECRET='console-input-test-only';
const Database=require('better-sqlite3'),jwt=require('jsonwebtoken'),express=require('express');
const db=new Database(process.env.DATABASE_PATH);db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT);INSERT INTO users VALUES('one','captain_one'),('two','captain_two');");db.close();
const {youtubeId,readInput,installConsoleRoutes}=require('../console-input.cjs');
const {authUser}=require('../cloud-xbox-bootstrap.cjs');
const {setConsoleGameplaySource}=require('../tenant-overlay-bootstrap.cjs');
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
test('only specific HTTPS YouTube broadcast links are accepted',()=>{
 for(const url of ['https://youtu.be/aB_cD-eF123','https://www.youtube.com/watch?v=aB_cD-eF123&other=1','https://youtube.com/live/aB_cD-eF123','https://m.youtube.com/watch?v=aB_cD-eF123','aB_cD-eF123'])assert.equal(youtubeId(url),'aB_cD-eF123');
 for(const url of ['https://youtube.com.evil.test/watch?v=aB_cD-eF123','https://youtube.com@evil.test/watch?v=aB_cD-eF123','http://youtube.com/watch?v=aB_cD-eF123','https://youtube.com/channel/aB_cD-eF123','javascript:alert(1)','https://youtube.com:444/watch?v=aB_cD-eF123','https://youtu.be/too-short'])assert.throws(()=>youtubeId(url));
});
test('saving and disconnecting preserve unrelated scene layers and placement',()=>{
 fs.mkdirSync(process.env.SPMT_TENANT_SCENE_ROOT,{recursive:true});
 const initial={outputs:{public:{enabled:true,widgets:[{id:'cam',kind:'screen',x:12,y:15,width:500,height:300,zIndex:2},{id:'alert',kind:'alert',x:0,y:0,width:400,height:200,zIndex:10}],workflows:[{id:'workflow'}]},personal:{widgets:[]},lounge:{widgets:[]}}};
 const file=path.join(process.env.SPMT_TENANT_SCENE_ROOT,'captain_one.json');fs.writeFileSync(file,JSON.stringify(initial));
 setConsoleGameplaySource({id:'one',username:'captain_one'},true);
 let saved=JSON.parse(fs.readFileSync(file));assert.equal(saved.outputs.public.widgets.length,3);const source=saved.outputs.public.widgets.find(w=>w.id==='spmt-console-gameplay');
 assert.ok(source.zIndex>2 && source.zIndex<10);assert.equal(source.x,12);assert.equal(source.width,500);assert.match(source.url,/tenant=captain_one$/);assert.equal(source.kind,'embed');assert.equal(saved.outputs.public.workflows[0].id,'workflow');
 setConsoleGameplaySource({id:'one',username:'captain_one'},true);saved=JSON.parse(fs.readFileSync(file));assert.equal(saved.outputs.public.widgets.length,3);
 setConsoleGameplaySource({id:'one',username:'captain_one'},false);saved=JSON.parse(fs.readFileSync(file));assert.equal(saved.outputs.public.widgets.length,2);assert.equal(saved.outputs.public.widgets[1].id,'alert');
});
test('HTTP controls require auth/origin and use the signed-in account, not a body tenant',async()=>{
 const app=express();
 function auth(req,res,next){const user=authUser(req);if(!user)return res.status(401).json({error:'auth'});req.streamUserId=user.id;next();}
 function origin(req,res,next){if(req.headers.origin && req.headers.origin!=='https://spmt.live')return res.status(403).json({error:'origin'});next();}
 function tenant(id){const d=new Database(process.env.DATABASE_PATH);try{return {user:d.prepare('SELECT * FROM users WHERE id=?').get(id)};}finally{d.close();}}
 installConsoleRoutes(app,express,auth,origin,tenant);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const headers={'content-type':'application/json',authorization:'Bearer '+jwt.sign({id:'one'},process.env.JWT_SECRET)};
 try{
  assert.equal((await fetch(base+'/api/stream-setup/console',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({url:'aB_cD-eF123'})})).status,401);
  assert.equal((await fetch(base+'/api/stream-setup/console',{method:'PUT',headers:{...headers,origin:'https://evil.test'},body:JSON.stringify({url:'aB_cD-eF123'})})).status,403);
  const saved=await fetch(base+'/api/stream-setup/console',{method:'PUT',headers,body:JSON.stringify({url:'aB_cD-eF123',userId:'two',tenant:'captain_two'})});assert.equal(saved.status,200);
  assert.equal(readInput('one').video_id,'aB_cD-eF123');assert.equal(readInput('two'),null);
  assert.equal((await (await fetch(base+'/api/console-input/captain_two')).json()).configured,false);
  assert.equal((await (await fetch(base+'/api/console-input/captain_one')).json()).videoId,'aB_cD-eF123');
  assert.equal((await fetch(base+'/api/stream-setup/console',{method:'PUT',headers,body:JSON.stringify({url:'https://evil.test/'})})).status,400);
  assert.equal(readInput('one').video_id,'aB_cD-eF123');
  assert.equal((await fetch(base+'/api/stream-setup/console',{method:'DELETE',headers})).status,200);assert.equal(readInput('one'),null);
 }finally{await new Promise(r=>server.close(r));}
});
test('player tries sound, retains current stream through polls, stops at end, and reports blocked autoplay',async()=>{
 const {JSDOM}=require('jsdom');
 const dom=new JSDOM('<div id="player"></div><div id="waiting"><h1 id="headline"></h1><p id="detail"></p></div><button id="sound"></button>',{url:'https://spmt.live/console-gameplay.html?tenant=captain_one',runScripts:'outside-only'});
 const w=dom.window;let config;const calls=[];let poll;
 w.AbortSignal.timeout=()=>undefined;w.setInterval=fn=>{poll=fn;};w.fetch=async()=>({ok:true,json:async()=>({configured:true,videoId:'aB_cD-eF123'})});
 const fake={unMute:()=>calls.push('unmute'),setVolume:n=>calls.push('volume:'+n),setPlaybackRate:n=>calls.push('rate:'+n),playVideo:()=>calls.push('play'),isMuted:()=>false,stopVideo:()=>calls.push('stop'),loadVideoById:id=>calls.push('load:'+id)};
 w.YT={Player:function(id,c){config=c;return fake;},PlayerState:{PLAYING:1,BUFFERING:3,ENDED:0}};
 w.eval(fs.readFileSync(path.join(__dirname,'../public/shared/console-gameplay.js'),'utf8'));
 await new Promise(r=>setImmediate(r));w.onYouTubeIframeAPIReady();config.events.onReady();
 assert.deepEqual(calls,['unmute','volume:100','rate:1','play']);
 await poll();assert.equal(calls.filter(x=>x.startsWith('load:')).length,0);
 config.events.onAutoplayBlocked();assert.equal(w.document.getElementById('sound').hidden,false);
 w.document.getElementById('sound').click();assert.equal(calls.at(-1),'play');
 config.events.onStateChange({data:1});assert.equal(w.document.getElementById('waiting').hidden,true);
 config.events.onStateChange({data:0});assert.equal(calls.at(-1),'stop');await poll();assert.equal(calls.at(-1),'stop');assert.match(w.document.getElementById('headline').textContent,/ended/);
 config.events.onError({data:150});assert.match(w.document.getElementById('detail').textContent,/embedding is disabled/);
 dom.window.close();
});
