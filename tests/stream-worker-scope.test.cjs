'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), crypto=require('node:crypto');
const {DASH_USER_ID,workerUrlForUser,mayStopIdleWorker}=require('../stream-worker-scope.cjs');
test('thecaptaindash routes to his own Studio while other accounts retain their host',()=>{
 assert.equal(workerUrlForUser(DASH_USER_ID,{}),'https://spmt-live.fly.dev:4447');
 assert.equal(workerUrlForUser('another-user',{}),'http://xbox.process.spmt-live.internal:3003');
 assert.equal(workerUrlForUser('thecaptaindash',{}),'http://xbox.process.spmt-live.internal:3003');
 assert.equal(workerUrlForUser(DASH_USER_ID,{DASH_STUDIO_WORKER_URL:'https://pilot.test/'}),'https://pilot.test');
});
test('idle shutdown requires no session, no pending start, and five minutes without control traffic',()=>{
 const state={enabled:true,activeSessions:0,pendingStarts:0,lastControlAt:0,now:300000,idleMs:300000};
 assert.equal(mayStopIdleWorker(state),true);
 for(const patch of [{activeSessions:1},{pendingStarts:1},{now:299999},{enabled:false}])assert.equal(mayStopIdleWorker({...state,...patch}),false);
});
test('actual worker auth rejects another account on the dedicated host even with valid service auth',()=>{
 const source=fs.readFileSync('xbox-worker.cjs','utf8');
 const snippet=source.slice(source.indexOf('function secretsMatch'),source.indexOf('function userKey'));
 const env={CLOUD_XBOX_ALLOWED_USER_ID:DASH_USER_ID};
 const context=vm.createContext({crypto,Buffer,Date,process:{env},WORKER_SECRET:'fixture-secret',lastControlAt:0});
 vm.runInContext(snippet,context);
 function call(userId,secret='fixture-secret'){
  const result={status:0,next:false};
  const req={get:name=>({'x-spmt-worker-secret':secret,'x-spmt-user-id':userId}[name])};
  const res={status(code){result.status=code;return this;},json(body){result.body=body;return this;}};
  context.req=req;context.res=res;context.next=()=>{result.next=true};
  vm.runInContext('requireWorkerAuth(req,res,next)',context);
  return result;
 }
 assert.equal(call('another-user').status,403);
 assert.equal(call(DASH_USER_ID,'bad').status,401);
 assert.equal(call(DASH_USER_ID).next,true);
});
