import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../server.ts", import.meta.url), "utf8");

test("SPMT credentialed session bridge allows Apollo Hostless origins even with CORS_ORIGINS overrides", () => {
  assert.match(source, /'https:\/\/apollo-node-1\.hostless\.app'/);
  assert.match(source, /'https:\/\/apollo-node-2\.hostless\.app'/);
  assert.match(source, /\(process\.env\.CORS_ORIGINS \|\| ''\)\.split\(','\)/);
  assert.match(source, /Access-Control-Allow-Credentials', 'true'/);
  assert.match(source, /Access-Control-Allow-Origin', origin/);
});
