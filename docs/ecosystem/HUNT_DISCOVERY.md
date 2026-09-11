# Commlink hunt discovery

The existing Cosmo logo physics puzzle remains manually available with one logo click. Commlink now also checks once per visible, idle minute for an ambient start. Each eligible check has a 15% chance; the tenth eligible unsuccessful check starts it to prevent indefinitely unlucky visitors. Hidden pages and focused message composers do not count.

Automatic or manual starts establish a 30-minute automatic-start cooldown, preserved across reloads in session storage. The deliberate logo trigger remains available during this cooldown. A Close anomaly button and Escape dismiss the game. Opening does not record a discovery: the existing physics completion and canonical recordDiscovery route still decide the reward.

The shared legacy Black Hole module is unchanged; this is the restored Commlink Cosmo implementation loaded by patch-commlink-black-hole-physics.mjs. The Signal Discord lifetime and clues belong to DiscordStreamHub; the Rocket discovery change belongs to spacemountain-live.

Validation: node --test tests/commlink-black-hole-puzzle-contract.test.cjs tests/commlink-ambient-discovery.test.cjs, npm run typecheck, npm run build. Timer/DOM tests exercise automatic opening, hidden/composer protection, cooldown persistence, manual retry, dismissal, and no automatic reward.
