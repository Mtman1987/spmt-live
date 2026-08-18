'use strict';

const fs = require('node:fs');
const path = require('node:path');

function applyCommlinkServiceOauthPatch() {
  const file = path.join(__dirname, 'commlink-diagnostic-bootstrap.cjs');
  let source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

  if (!source.includes('function serviceBearerAuthorized(req, env = process.env)')) {
    const marker = `function isAuthorized(req, env = process.env) {\n  const expected = configuredDiagnosticKeys(env);\n  const supplied = suppliedDiagnosticKeys(req);\n  return expected.length > 0 && expected.some((candidate) => supplied.some((value) => sameSecret(candidate, value)));\n}`;
    if (!source.includes(marker)) throw new Error('Commlink service OAuth patch marker missing');

    const replacement = `function serviceBearerAuthorized(req, env = process.env) {\n  const bearer = String(req?.headers?.authorization || '').replace(/^Bearer\\s+/i, '').trim();\n  if (!bearer) return false;\n  const secret = String(env.JWT_SECRET || '').trim();\n  if (!secret) return false;\n  try {\n    const jwt = require('jsonwebtoken');\n    const payload = jwt.verify(bearer, secret);\n    const clientId = String(payload?.client_id || '').trim();\n    const tokenUse = String(payload?.token_use || '').trim();\n    const scopes = Array.isArray(payload?.scopes) ? payload.scopes.map(String) : [];\n    return clientId === 'discord-stream-hub' && tokenUse === 'client_credentials' && scopes.includes('athena:write');\n  } catch {\n    return false;\n  }\n}\n\nfunction isAuthorized(req, env = process.env) {\n  if (serviceBearerAuthorized(req, env)) return true;\n  const expected = configuredDiagnosticKeys(env);\n  const supplied = suppliedDiagnosticKeys(req);\n  return expected.length > 0 && expected.some((candidate) => supplied.some((value) => sameSecret(candidate, value)));\n}`;
    source = source.replace(marker, replacement);
  }

  if (!source.includes("clientId === 'discord-stream-hub'")) throw new Error('Commlink service OAuth patch did not install client restriction');
  if (!source.includes("scopes.includes('athena:write')")) throw new Error('Commlink service OAuth patch did not install scope restriction');
  fs.writeFileSync(file, source, 'utf8');
}

module.exports = { applyCommlinkServiceOauthPatch };
