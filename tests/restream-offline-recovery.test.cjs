'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const source = fs.readFileSync('xbox-worker.cjs', 'utf8');
const begin = source.indexOf('async function runRecoverableRestreamStart(');
const end = source.indexOf('async function controlledRestreamStart(', begin);
assert.ok(begin >= 0 && end > begin);
function recovery(outcomes, twitch) {
  let starts = 0, reconnects = 0, stops = 0, probes = 0;
  const session = { mode:'restream', cdp:{close(){reconnects++}}, targetId:'existing' };
  const context = {
    Error, String, console:{warn(){}},
    runControlledRestreamStart:async()=>{const result=outcomes[starts++];if(result instanceof Error)throw result;return result},
    sessionForUser:()=>session,
    stopSession:async(current)=>{assert.equal(current,session);stops++},
    require:()=>({twitchLiveState:async()=>{probes++;return twitch}}),
  };
  vm.runInNewContext(source.slice(begin,end)+'\nglobalThis.run=runRecoverableRestreamStart;',context);
  return {run:()=>context.run('owner'),counts:()=>({starts,reconnects,stops,probes})};
}
const timeout=()=>new Error('Runtime.evaluate timed out');
test('healthy existing host does not reconnect or restart',async()=>{
  const r=recovery([{ok:true,state:'live'}],{ok:true,isLive:true});
  assert.equal((await r.run()).state,'live');
  assert.deepEqual(r.counts(),{starts:1,reconnects:0,stops:0,probes:0});
});
test('a stale control connection is repaired without stopping Chromium',async()=>{
  const r=recovery([timeout(),{ok:true,state:'live'}],{ok:true,isLive:true});
  assert.equal((await r.run()).state,'live');
  assert.deepEqual(r.counts(),{starts:2,reconnects:1,stops:0,probes:0});
});
test('unresponsive live host must never be stopped',async()=>{
  const r=recovery([timeout(),timeout()],{ok:true,isLive:true});
  await assert.rejects(r.run(),/Runtime.evaluate timed out/);
  assert.deepEqual(r.counts(),{starts:2,reconnects:1,stops:0,probes:1});
});
test('failed Twitch verification must never stop the host',async()=>{
  const r=recovery([timeout(),timeout()],{ok:false});
  await assert.rejects(r.run(),/Runtime.evaluate timed out/);
  assert.equal(r.counts().stops,0);
});
test('confirmed offline host is replaced once and uses the same start action',async()=>{
  const r=recovery([timeout(),timeout(),{ok:true,state:'live'}],{ok:true,isLive:false});
  assert.equal((await r.run()).state,'live');
  assert.deepEqual(r.counts(),{starts:3,reconnects:1,stops:1,probes:1});
});
test('login failure does not restart the host',async()=>{
  const r=recovery([new Error('Restream persistent browser requires login')],{ok:true,isLive:false});
  await assert.rejects(r.run(),/requires login/);
  assert.deepEqual(r.counts(),{starts:1,reconnects:0,stops:0,probes:0});
});
test('a failing replacement does not create an unbounded restart loop',async()=>{
  const r=recovery([timeout(),timeout(),timeout()],{ok:true,isLive:false});
  await assert.rejects(r.run(),/Runtime.evaluate timed out/);
  assert.equal(r.counts().stops,1);
  assert.equal(r.counts().starts,3);
});
