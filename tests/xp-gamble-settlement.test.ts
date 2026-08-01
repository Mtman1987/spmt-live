import test from 'node:test';
import assert from 'node:assert/strict';
import { settleGambleWallet } from '../xp-gamble-settlement.js';

test('a small win only refills spendable XP back toward lifetime', () => {
  const settlement = settleGambleWallet({ spendableXp: 1_000, lifetimeXp: 5_000, wager: 500, payout: 1_500 });
  assert.equal(settlement.refill, 1_500);
  assert.equal(settlement.overflow, 0);
  assert.equal(settlement.matchedGrowth, 0);
});

test('a jackpot stops at lifetime and compresses the rest 10:1, split evenly', () => {
  const settlement = settleGambleWallet({ spendableXp: 10_000, lifetimeXp: 10_000, wager: 1_000, payout: 101_000 });
  assert.equal(settlement.refill, 1_000);
  assert.equal(settlement.overflow, 100_000);
  assert.equal(settlement.compressed, 10_000);
  assert.equal(settlement.matchedGrowth, 5_000);
});

test('matched growth keeps spendable level with lifetime, never above it', () => {
  const before = { spendableXp: 4_000, lifetimeXp: 4_000 };
  const settlement = settleGambleWallet({ ...before, wager: 1_000, payout: 51_000 });
  const spendableAfter = before.spendableXp - settlement.wager + settlement.refill + settlement.matchedGrowth;
  const lifetimeAfter = before.lifetimeXp + settlement.matchedGrowth;
  assert.equal(spendableAfter, lifetimeAfter);
  assert.ok(spendableAfter <= lifetimeAfter);
});

test('a loss removes the wager and credits nothing', () => {
  const settlement = settleGambleWallet({ spendableXp: 2_000, lifetimeXp: 8_000, wager: 750, payout: 0 });
  assert.deepEqual(
    { refill: settlement.refill, matchedGrowth: settlement.matchedGrowth, wager: settlement.wager },
    { refill: 0, matchedGrowth: 0, wager: 750 },
  );
});

test('overflow below the compression floor is discarded rather than rounded up', () => {
  const settlement = settleGambleWallet({ spendableXp: 100, lifetimeXp: 100, wager: 0, payout: 9 });
  assert.equal(settlement.overflow, 9);
  assert.equal(settlement.compressed, 0);
  assert.equal(settlement.matchedGrowth, 0);
  assert.equal(settlement.discardedOverflow, 9);
});
