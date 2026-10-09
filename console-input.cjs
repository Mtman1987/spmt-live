'use strict';
const Database = require('better-sqlite3');
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
function youtubeId(value) {
  const text = String(value || '').trim();
  if (VIDEO_ID.test(text)) return text;
  let url;
  try { url = new URL(text); } catch { throw new Error('Paste the YouTube broadcast link from your PS5.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Use an HTTPS YouTube broadcast link.');
  const host = url.hostname.toLowerCase();
  let id = '';
  if (host === 'youtu.be') id = url.pathname.slice(1);
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
    else id = /^\/(?:live|embed)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] || '';
  }
  if (!VIDEO_ID.test(id)) throw new Error('Use a specific YouTube watch or live broadcast link, not a channel link.');
  return id;
}
function database() {
  const db = new Database(process.env.DATABASE_PATH || '/data/spmt.db', { fileMustExist: true });
  db.exec('CREATE TABLE IF NOT EXISTS console_broadcast_inputs (user_id TEXT PRIMARY KEY REFERENCES users(id), video_id TEXT NOT NULL, updated_at TEXT NOT NULL)');
  return db;
}
function readInput(userId) {
  const db = database();
  try { return db.prepare('SELECT video_id, updated_at FROM console_broadcast_inputs WHERE user_id = ?').get(userId) || null; }
  finally { db.close(); }
}
function saveInput(userId, videoId) {
  const db = database();
  try {
    if (videoId) db.prepare('INSERT INTO console_broadcast_inputs(user_id,video_id,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET video_id=excluded.video_id, updated_at=excluded.updated_at').run(userId, videoId, new Date().toISOString());
    else db.prepare('DELETE FROM console_broadcast_inputs WHERE user_id = ?').run(userId);
  } finally { db.close(); }
}
function installConsoleRoutes(app, express, auth, sameOrigin, readTenant) {
  const json = (res, code, body) => res.status(code).set('cache-control', 'private, no-store').json(body);
  app.get('/api/stream-setup/console', auth, (req,res) => {
    try { const input = readInput(req.streamUserId); return json(res,200,{configured: !!input, videoId: input?.video_id || null, acceptanceRequired: true}); }
    catch { return json(res,503,{error:'Console input settings are unavailable.'}); }
  });
  app.put('/api/stream-setup/console', auth, sameOrigin, express.json({limit:'4kb'}), (req,res) => {
    let id;
    try { id = youtubeId(req.body?.url); } catch(error) { return json(res,400,{error:error.message}); }
    try {
      const {user} = readTenant(req.streamUserId);
      if (!user) return json(res,404,{error:'SPMT account not found.'});
      const previous = readInput(user.id);
      saveInput(user.id,id);
      try { require('./tenant-overlay-bootstrap.cjs').setConsoleGameplaySource(user,true); }
      catch(error) { saveInput(user.id,previous?.video_id || null); throw error; }
      return json(res,200,{configured:true,browserSourceUrl:'https://spmt.live/tenant/'+encodeURIComponent(user.username)+'/public', acceptanceRequired:true});
    } catch { return json(res,503,{error:'Could not save the console input. Your previous input has been retained.'}); }
  });
  app.delete('/api/stream-setup/console', auth, sameOrigin, (req,res) => {
    try {
      const {user} = readTenant(req.streamUserId);
      if (!user) return json(res,404,{error:'SPMT account not found.'});
      require('./tenant-overlay-bootstrap.cjs').setConsoleGameplaySource(user,false);
      saveInput(user.id,null);
      return json(res,200,{configured:false});
    } catch { return json(res,503,{error:'Could not disconnect the console input.'}); }
  });
  app.get('/api/console-input/:tenant', (req,res) => {
    const tenant = String(req.params.tenant || '').toLowerCase();
    if (!/^[a-z0-9_]{3,25}$/.test(tenant)) return json(res,404,{error:'Tenant not found.'});
    let db;
    try {
      db = database();
      const user = db.prepare('SELECT id FROM users WHERE lower(username)=? LIMIT 1').get(tenant);
      if (!user) return json(res,404,{error:'Tenant not found.'});
      const input = db.prepare('SELECT video_id FROM console_broadcast_inputs WHERE user_id=?').get(user.id);
      return json(res,200,{configured:!!input,videoId:input?.video_id || null});
    } catch { return json(res,503,{error:'Console input is temporarily unavailable.'}); }
    finally { db?.close(); }
  });
}
module.exports = {youtubeId,readInput,saveInput,installConsoleRoutes};
