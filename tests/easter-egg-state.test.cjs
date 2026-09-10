const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { reconcileEasterEggs, discoveryStatus, mergeEasterEggData, claimDiscordRewards, acknowledgeDiscordReward } = require('../easter-egg-state.cjs');

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY, discord_id TEXT);
    CREATE TABLE app_state_records(user_id TEXT, app_id TEXT, namespace TEXT, schema_version INTEGER, revision INTEGER,
      data_json TEXT, created_at TEXT, updated_at TEXT, UNIQUE(user_id, app_id, namespace));
    CREATE TABLE user_discoveries(user_id TEXT, discovery_id TEXT, discovered_at TEXT);
    CREATE TABLE notifications(id TEXT PRIMARY KEY, user_id TEXT, type TEXT, title TEXT, body TEXT, source_app TEXT, link_url TEXT, created_at TEXT);
    INSERT INTO users VALUES ('tenant-a', '111111111111111111'), ('tenant-b', NULL), ('mtman1987', NULL);`);
  return db;
}
function state(db, namespace, data, user = 'tenant-a') {
  db.prepare('INSERT INTO app_state_records VALUES (?, ?, ?, 1, 3, ?, ?, ?)')
    .run(user, 'spacemountain-live', namespace, JSON.stringify(data), '2026-08-18', '2026-08-18');
}
function legacy(db, id, user = 'tenant-a') {
  db.prepare('INSERT INTO user_discoveries VALUES (?, ?, ?)').run(user, id, '2026-08-17');
}
const allEggs = { rocket: { completed: true }, blackHole: { completed: true }, signal: { completed: true } };

test('three canonical eggs yield the same Voidwalker title and 3/3 UI without legacy rows', (t) => {
  const db = fixture(t);
  state(db, 'easter-eggs', { eggs: allEggs });
  assert.equal(reconcileEasterEggs(db, 'tenant-a').title, 'Voidwalker');
  const status = discoveryStatus(db, 'tenant-a');
  assert.equal(status.discoveredCount, 3);
  assert.equal(status.reward.title, 'Voidwalker');
  assert.equal(status.reward.chatbotPersonality.name, 'The Count');
  assert.equal(status.reward.chatbotPersonality.id, 'count-puzzle');
});

test('all three original discoveries backfill canonical credit without replaying puzzles', (t) => {
  const db = fixture(t);
  for (const id of ['battle-arena', 'cosmo-black-hole', 'commlink-constellation']) legacy(db, id);
  const first = reconcileEasterEggs(db, 'tenant-a');
  assert.deepEqual(first.eggs, { rocket: true, blackHole: true, signal: true });
  assert.equal(first.title, 'Voidwalker');
  const second = reconcileEasterEggs(db, 'tenant-a');
  assert.equal(second.revision, first.revision);
  assert.equal(second.data.eggs.rocket.discoveredAt, '2026-08-17');
});

test('existing Arena state recovers a missing rocket receipt and preserves other egg metadata', (t) => {
  const db = fixture(t);
  state(db, 'arena', { inventory: { bullets: 8 } });
  state(db, 'easter-eggs', { custom: 'keep', eggs: { blackHole: { completed: true }, signal: { completed: true, wins: 8 } } });
  const result = reconcileEasterEggs(db, 'tenant-a');
  assert.equal(result.title, 'Voidwalker');
  assert.equal(result.data.custom, 'keep');
  assert.equal(result.data.eggs.signal.wins, 8);
  assert.equal(result.data.eggs.rocket.source, 'account-arena-state');
});

test('repeated reads and rocket retries issue exactly one reward and do not bump revisions', (t) => {
  const db = fixture(t);
  state(db, 'easter-eggs', { eggs: { blackHole: allEggs.blackHole, signal: allEggs.signal } });
  const first = reconcileEasterEggs(db, 'tenant-a', { egg: 'rocket' });
  for (let i = 0; i < 5; i++) {
    assert.equal(reconcileEasterEggs(db, 'tenant-a', { egg: 'rocket' }).revision, first.revision);
    discoveryStatus(db, 'tenant-a');
  }
  assert.equal(db.prepare('SELECT count(*) AS n FROM notifications').get().n, 1);
});

test('partial credit and legacy evidence never leak between tenants or grant the owner a shortcut', (t) => {
  const db = fixture(t);
  legacy(db, 'battle-arena'); legacy(db, 'cosmo-black-hole');
  legacy(db, 'commlink-constellation', 'tenant-b');
  assert.equal(discoveryStatus(db, 'tenant-a').discoveredCount, 2);
  assert.equal(discoveryStatus(db, 'tenant-b').discoveredCount, 1);
  assert.equal(discoveryStatus(db, 'tenant-a').reward, null);
  assert.equal(discoveryStatus(db, 'mtman1987').discoveredCount, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM notifications').get().n, 0);
});

test('partial app-state writes cannot erase previously earned eggs or lower signal wins', () => {
  const before = { eggs: { rocket: { completed: true, discoveredAt: 'original' }, signal: { completed: true, wins: 5 } }, custom: 1 };
  const after = mergeEasterEggData(before, { eggs: { rocket: { completed: false, discoveredAt: 'new' }, signal: { wins: 1 }, blackHole: { completed: true } } });
  assert.equal(after.eggs.rocket.completed, true);
  assert.equal(after.eggs.rocket.discoveredAt, 'original');
  assert.equal(after.eggs.signal.completed, true);
  assert.equal(after.eggs.signal.wins, 5);
  assert.equal(after.custom, 1);
});

test('a reward-write failure rolls back a completion so the operation can be retried safely', (t) => {
  const db = fixture(t);
  state(db, 'easter-eggs', { eggs: { blackHole: allEggs.blackHole, signal: allEggs.signal } });
  db.exec("CREATE TRIGGER fail_reward BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'unavailable'); END;");
  assert.throws(() => reconcileEasterEggs(db, 'tenant-a', { egg: 'rocket' }), /unavailable/);
  const row = db.prepare("SELECT data_json FROM app_state_records WHERE namespace = 'easter-eggs'").get();
  assert.equal(JSON.parse(row.data_json).eggs.rocket, undefined);
  db.exec('DROP TRIGGER fail_reward');
  assert.equal(reconcileEasterEggs(db, 'tenant-a', { egg: 'rocket' }).title, 'Voidwalker');
});

test('first Discord poll backfills existing winners and only claims linked identities', (t) => {
  const db = fixture(t);
  state(db, 'easter-eggs', { eggs: allEggs });
  state(db, 'easter-eggs', { eggs: allEggs }, 'tenant-b');
  const jobs = claimDiscordRewards(db, 5, 1000);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].userId, 'tenant-a');
  assert.equal(jobs[0].discordUserId, '111111111111111111');
  assert.equal(claimDiscordRewards(db, 5, 1001).length, 0);
  assert.equal(acknowledgeDiscordReward(db, { ...jobs[0], discordUserId: 'wrong', delivered: true }, 1002), false);
  assert.equal(acknowledgeDiscordReward(db, { ...jobs[0], delivered: true }, 1002), true);
  assert.equal(claimDiscordRewards(db, 5, 400000).length, 0);
  db.prepare('UPDATE users SET discord_id = ? WHERE id = ?').run('222222222222222222', 'tenant-b');
  assert.equal(claimDiscordRewards(db, 5, 400001)[0].userId, 'tenant-b');
});

test('Discord failures back off durably and expired claims are redelivered with new tokens', (t) => {
  const db = fixture(t); state(db, 'easter-eggs', { eggs: allEggs });
  const job = claimDiscordRewards(db, 5, 1000)[0];
  assert.equal(acknowledgeDiscordReward(db, { ...job, delivered: false, error: 'Discord 403' }, 1001), true);
  assert.equal(claimDiscordRewards(db, 5, 2000).length, 0);
  const retry = claimDiscordRewards(db, 5, 31002)[0];
  assert.notEqual(retry.claimToken, job.claimToken);
  assert.equal(acknowledgeDiscordReward(db, { ...job, delivered: true }, 31003), false);
  const lostAckRetry = claimDiscordRewards(db, 5, 400000)[0];
  assert.notEqual(lostAckRetry.claimToken, retry.claimToken);
  assert.equal(acknowledgeDiscordReward(db, { ...lostAckRetry, delivered: true }, 400001), true);
});
