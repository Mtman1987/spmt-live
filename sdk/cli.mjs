#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { SpaceMountainClient } from './dist/index.js';

const SDK_URL = process.env.SPMT_SDK_URL || 'https://spmt.live/sdk/spmt-sdk.tgz';
const DEFAULT_BASE_URL = 'https://spmt.live';
const cwd = process.cwd();

function parseArguments(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const key = value.slice(2);
    if (key.startsWith('no-')) {
      flags[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { positional, flags };
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@[^/]+\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function titleize(value) {
  return String(value || '').split(/[-_]+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}

async function ask(input, question, defaultValue) {
  if (!input) return defaultValue;
  const answer = await input.question(`${question}${defaultValue ? ` [${defaultValue}]` : ''}: `);
  return answer.trim() || defaultValue;
}

async function writeIfAllowed(file, content, force) {
  try {
    await fs.access(file);
    if (!force) return false;
  } catch {}
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
  return true;
}

async function ensureGitIgnore() {
  const file = path.join(cwd, '.gitignore');
  let current = '';
  try { current = await fs.readFile(file, 'utf8'); } catch {}
  if (current.split(/\r?\n/).some((line) => line.trim() === '.env')) return;
  const separator = current && !current.endsWith('\n') ? '\n' : '';
  await fs.writeFile(file, `${current}${separator}.env\n`, 'utf8');
}

async function readLocalEnvironment() {
  const values = {};
  try {
    const text = await fs.readFile(path.join(cwd, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
  return values;
}

async function projectContext(flags) {
  const localEnvironment = await readLocalEnvironment();
  const manifest = await readJson(path.join(cwd, 'spmt.app.json'));
  return {
    manifest,
    apiKey: process.env.SPMT_API_KEY || localEnvironment.SPMT_API_KEY,
    baseUrl: String(flags['base-url'] || process.env.SPMT_BASE_URL || localEnvironment.SPMT_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
  };
}

async function install(flags) {
  const packageJson = await readJson(path.join(cwd, 'package.json'), {});
  const interactive = process.stdin.isTTY && flags.yes !== true;
  const input = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  const defaultId = slugify(flags['app-id'] || packageJson?.name || path.basename(cwd)) || 'atherrea';
  let appId;
  let name;
  let description;
  let launchUrl;
  let healthUrl;
  try {
    appId = slugify(await ask(input, 'SPMT app id', defaultId));
    name = await ask(input, 'App name', String(flags.name || titleize(appId)));
    description = await ask(input, 'Short description', String(flags.description || `${name} connected game application.`));
    launchUrl = await ask(input, 'Public launch URL (can be added later)', String(flags['launch-url'] || packageJson?.homepage || ''));
    healthUrl = await ask(input, 'Health URL (optional)', String(flags['health-url'] || ''));
  } finally {
    input?.close();
  }
  const force = flags.force === true;

  const manifest = {
    schemaVersion: 1,
    appId,
    name,
    description,
    category: String(flags.category || 'Games'),
    launchUrl,
    healthUrl,
    version: String(flags.version || packageJson?.version || '0.1.1'),
    permissions: ['identity:read', 'apps:read', 'events:write'],
    events: ['game.session.started', 'game.session.ended', 'game.player.progressed', 'game.server.status'],
  };

  const manifestWritten = await writeIfAllowed(
    path.join(cwd, 'spmt.app.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    force,
  );
  const example = `import { SpaceMountainClient } from '@spmt/sdk';

const spmt = new SpaceMountainClient({
  apiKey: process.env.SPMT_API_KEY,
  appId: '${appId}',
  baseUrl: process.env.SPMT_BASE_URL || 'https://spmt.live',
});

const result = await spmt.game.publish('session.started', {
  sessionId: 'replace-with-your-session-id',
  summary: '${name} test session started',
  playerCount: 1,
});

console.log(result.event);
`;
  await writeIfAllowed(path.join(cwd, 'spmt', 'publish-event.mjs'), example, force);
  await writeIfAllowed(
    path.join(cwd, '.env.example'),
    'SPMT_API_KEY=\nSPMT_BASE_URL=https://spmt.live\n',
    force,
  );
  await ensureGitIgnore();

  let dependencyInstalled = false;
  if (packageJson?.name && flags['no-package'] !== true) {
    const npmCli = process.env.npm_execpath;
    const npm = npmCli ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
    const npmArgs = npmCli
      ? [npmCli, 'install', '--save-exact', SDK_URL]
      : ['install', '--save-exact', SDK_URL];
    const result = spawnSync(npm, npmArgs, { cwd, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('The starter files were created, but npm could not install @spmt/sdk');
    dependencyInstalled = true;
  }

  console.log(`\nSPMT starter ready for ${name} (${appId}).`);
  console.log(manifestWritten ? 'Created spmt.app.json.' : 'Kept the existing spmt.app.json (use --force to replace it).');
  console.log(dependencyInstalled ? 'Installed @spmt/sdk in this project.' : 'No Node package was changed; the HTTP contract and manifest are still usable.');
  console.log('Next: create a scoped key at https://spmt.live/?view=developers and copy it into .env as SPMT_API_KEY.');
  console.log('Then run: npx spmt doctor');
  console.log('Submit for the app list: npx spmt submit');
  console.log('Publish a proof event: node --env-file=.env spmt/publish-event.mjs');
}

async function doctor(flags) {
  const context = await projectContext(flags);
  let failed = false;
  if (context.manifest?.appId && context.manifest?.name) {
    console.log(`OK manifest: ${context.manifest.name} (${context.manifest.appId})`);
  } else {
    console.error('FAIL manifest: run spmt install first');
    failed = true;
  }

  try {
    const response = await fetch(`${context.baseUrl}/api/platform`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    console.log(`OK platform: ${context.baseUrl}`);
  } catch (error) {
    console.error(`FAIL platform: ${error.message}`);
    failed = true;
  }

  if (!context.apiKey) {
    console.warn('WARN key: SPMT_API_KEY is missing from the environment or local .env');
  } else {
    try {
      const client = new SpaceMountainClient({ apiKey: context.apiKey, appId: context.manifest?.appId, baseUrl: context.baseUrl });
      const verification = await client.developer.verifyKey();
      console.log(`OK key: ${verification.key.keyPrefix} with ${verification.key.scopes.join(', ')}`);
      if (verification.key.appId && verification.key.appId !== context.manifest?.appId) {
        console.error(`FAIL key binding: key is for ${verification.key.appId}, manifest is ${context.manifest?.appId}`);
        failed = true;
      }
    } catch (error) {
      console.error(`FAIL key: ${error.message}`);
      failed = true;
    }
  }

  if (failed) process.exitCode = 1;
}

async function submit(flags) {
  const context = await projectContext(flags);
  if (!context.manifest) throw new Error('spmt.app.json is missing; run spmt install first');
  if (!context.apiKey) throw new Error('SPMT_API_KEY is missing; create a scoped key in the SPMT Developer page and put it in .env');
  const client = new SpaceMountainClient({ apiKey: context.apiKey, appId: context.manifest.appId, baseUrl: context.baseUrl });
  const result = await client.developer.submitApp(context.manifest);
  console.log(`Submitted ${result.submission.name} as ${result.submission.appId}.`);
  console.log(`Status: ${result.submission.status}. It appears in the public app list after owner approval.`);
}

async function readPayloadJson(flags) {
  let raw = '';
  if (flags['data-file']) {
    raw = await fs.readFile(path.resolve(cwd, String(flags['data-file'])), 'utf8');
  } else if (flags.data) {
    const value = String(flags.data);
    raw = value.startsWith('@')
      ? await fs.readFile(path.resolve(cwd, value.slice(1)), 'utf8')
      : value;
  } else if (flags.stdin === true) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (!raw.trim()) return { summary: 'Published game event' };
  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Payload must be a JSON object');
    }
    return payload;
  } catch (error) {
    throw new Error(`event payload must be valid JSON: ${error.message}`);
  }
}

async function publishEvent(positional, flags) {
  const context = await projectContext(flags);
  if (!context.manifest?.appId) throw new Error('spmt.app.json is missing; run spmt install first');
  if (!context.apiKey) throw new Error('SPMT_API_KEY is missing from the environment or local .env');
  const type = positional[1];
  if (!type) throw new Error('event type required, for example: spmt event game.session.started');
  const payload = await readPayloadJson(flags);
  const client = new SpaceMountainClient({ apiKey: context.apiKey, appId: context.manifest.appId, baseUrl: context.baseUrl });
  const result = await client.game.publish(type, payload, { visibility: String(flags.visibility || 'creator') });
  console.log(`Published ${result.event.type} as ${result.event.sourceApp} (${result.event.id}).`);
}

async function status(flags) {
  const context = await projectContext(flags);
  if (!context.apiKey) throw new Error('SPMT_API_KEY is missing from the environment or local .env');
  const client = new SpaceMountainClient({ apiKey: context.apiKey, appId: context.manifest?.appId, baseUrl: context.baseUrl });
  const [submissions, events] = await Promise.all([client.developer.submissions(), client.game.list(10)]);
  console.log(JSON.stringify({ submissions: submissions.submissions, recentEvents: events.events }, null, 2));
}

function help() {
  console.log(`SPMT developer CLI

Commands:
  spmt install                 Create spmt.app.json and starter files
  spmt doctor                  Verify manifest, platform, key, and app binding
  spmt submit                  Submit or update the app for registry review
  spmt event <type>            Publish a game event; use --data '{"score":10}'
  spmt event <type> --data-file status.json
  spmt event <type> --data @status.json
  spmt event <type> --stdin
  spmt status                  Show submissions and recent app events

Useful install command:
  npm exec --yes --package=${SDK_URL} -- spmt install

Secrets belong in .env as SPMT_API_KEY. Never put the key in spmt.app.json.`);
}

const { positional, flags } = parseArguments(process.argv.slice(2));
const command = positional[0] || 'help';

try {
  if (command === 'install' || command === 'init') await install(flags);
  else if (command === 'doctor') await doctor(flags);
  else if (command === 'submit') await submit(flags);
  else if (command === 'event') await publishEvent(positional, flags);
  else if (command === 'status') await status(flags);
  else if (command === 'help' || command === '--help' || command === '-h') help();
  else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(`SPMT: ${error.message}`);
  process.exitCode = 1;
}
