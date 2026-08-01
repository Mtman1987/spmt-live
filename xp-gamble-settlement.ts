export type GambleSettlementInput = {
  spendableXp: number;
  lifetimeXp: number;
  wager: number;
  payout: number;
};

export type GambleSettlement = {
  /** Spendable XP removed for the wager. */
  wager: number;
  /** Winnings that fit under the lifetime ceiling, credited 1:1 to spendable XP. */
  refill: number;
  /** Winnings above the ceiling, before compression. */
  overflow: number;
  /** Overflow compressed 10:1. */
  compressed: number;
  /** Half of the compressed overflow, credited to both lifetime and spendable XP. */
  matchedGrowth: number;
  /** Overflow that neither refilled nor compressed into matched growth. */
  discardedOverflow: number;
};

/**
 * Winnings first refill spendable XP up to the player's lifetime total, so a
 * jackpot restores what was spent without inflating rank. Anything above that
 * ceiling is compressed 10:1 and split evenly between lifetime and spendable
 * XP, which keeps the two wallets level and a big win from bloating the
 * leaderboard.
 */
export function settleGambleWallet(input: GambleSettlementInput): GambleSettlement {
  const wager = Math.max(0, Math.trunc(input.wager));
  const payout = Math.max(0, Math.trunc(input.payout));
  const afterWager = Math.max(0, Math.trunc(input.spendableXp)) - wager;
  const missingToLifetime = Math.max(0, Math.max(0, Math.trunc(input.lifetimeXp)) - afterWager);
  const refill = Math.min(payout, missingToLifetime);
  const overflow = Math.max(0, payout - refill);
  const compressed = Math.floor(overflow / 10);
  const matchedGrowth = Math.floor(compressed / 2);

  return {
    wager,
    refill,
    overflow,
    compressed,
    matchedGrowth,
    discardedOverflow: overflow - matchedGrowth * 2,
  };
}
