'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CONFLICT_GATE = [
  '      if (discordUser && twitchUser && discordUser.id !== twitchUser.id) {',
  '        throw Object.assign(new Error("Discord and Twitch are already attached to different SPMT identities. Crew review is required."), {',
  '          statusCode: 409,',
  '          code: "identity_conflict"',
  '        });',
  '      }',
].join('\n');

const SAFE_RECONCILIATION_GATE = [
  '      if (discordUser && twitchUser && discordUser.id !== twitchUser.id) {',
  '        const safeProviderOwnedSplit = discordUser.password_hash === "SYSTEM_NO_LOGIN"',
  '          && twitchUser.password_hash === "SYSTEM_NO_LOGIN"',
  '          && Boolean(discordUser.discord_id)',
  '          && !discordUser.twitch_id',
  '          && Boolean(twitchUser.twitch_id)',
  '          && !twitchUser.discord_id;',
  '        if (!safeProviderOwnedSplit) {',
  '          throw Object.assign(new Error("Discord and Twitch are already attached to different SPMT identities. Crew review is required."), {',
  '            statusCode: 409,',
  '            code: "identity_conflict"',
  '          });',
  '        }',
  '        const xpSummary = db.prepare("SELECT COUNT(*) AS rows, COALESCE(SUM(delta), 0) AS delta FROM xp_ledger WHERE user_id = ?").get(twitchUser.id);',
  '        db.prepare("UPDATE xp_ledger SET user_id = ? WHERE user_id = ?").run(discordUser.id, twitchUser.id);',
  '        db.prepare("UPDATE users SET twitch_username = NULL, twitch_id = NULL WHERE id = ?").run(twitchUser.id);',
  '        db.prepare("DELETE FROM account_recovery_codes WHERE user_id = ?").run(twitchUser.id);',
  '        db.prepare("DELETE FROM provider_identity_tickets WHERE user_id IN (?, ?)").run(discordUser.id, twitchUser.id);',
  '        const preferredUsername = cleanHandle(twitch.username || twitch.providerUsername || discord.username || discord.providerUsername).slice(0, 30);',
  '        if (preferredUsername && discordUser.username !== preferredUsername) {',
  '          const placeholder = db.prepare("SELECT id, password_hash, discord_id, twitch_id FROM users WHERE username = ? AND id NOT IN (?, ?)").get(preferredUsername, discordUser.id, twitchUser.id);',
  '          const disposablePlaceholder = placeholder',
  '            && placeholder.password_hash === "SYSTEM_NO_LOGIN"',
  '            && !placeholder.discord_id',
  '            && !placeholder.twitch_id;',
  '          if (disposablePlaceholder) {',
  '            const stableSuffix = String(placeholder.id).replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-16) || "providerless";',
  '            const archivedUsername = `legacy-${stableSuffix}`;',
  '            if (!db.prepare("SELECT 1 FROM users WHERE username = ?").get(archivedUsername)) {',
  '              db.prepare("UPDATE users SET username = ? WHERE id = ?").run(archivedUsername, placeholder.id);',
  '              db.prepare("UPDATE users SET username = ? WHERE id = ?").run(preferredUsername, discordUser.id);',
  '            }',
  '          }',
  '        }',
  '        console.info("[SPMT] Reconciled verified split provider identity", {',
  '          canonicalUserId: discordUser.id,',
  '          duplicateUserId: twitchUser.id,',
  '          xpRowsMoved: Number(xpSummary?.rows || 0),',
  '          xpDeltaMoved: Number(xpSummary?.delta || 0)',
  '        });',
  '      }',
].join('\n');

function patchVerifiedIdentityReconciliation(source) {
  const occurrences = String(source || '').split(CONFLICT_GATE).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Verified identity reconciliation expected one conflict gate and found ${occurrences}`);
  }
  return source.replace(CONFLICT_GATE, SAFE_RECONCILIATION_GATE);
}

function patchProductionServerBundle() {
  const serverBundlePath = process.env.SPMT_SERVER_BUNDLE_PATH
    ? path.resolve(process.env.SPMT_SERVER_BUNDLE_PATH)
    : path.join(__dirname, 'dist', 'server.cjs');
  const original = fs.readFileSync(serverBundlePath, 'utf8');
  const patched = patchVerifiedIdentityReconciliation(original);
  fs.writeFileSync(serverBundlePath, patched, 'utf8');
}

module.exports = {
  CONFLICT_GATE,
  SAFE_RECONCILIATION_GATE,
  patchVerifiedIdentityReconciliation,
  patchProductionServerBundle,
};
