import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const destination = path.join(root, 'public', 'sdk');
fs.mkdirSync(destination, { recursive: true });

for (const filename of fs.readdirSync(destination)) {
  if (/^(?:spmt-sdk(?:-\d+\.\d+\.\d+)?|sdk-\d+\.\d+\.\d+)\.tgz$/.test(filename)) {
    fs.rmSync(path.join(destination, filename));
  }
}

const npmCli = process.env.npm_execpath;
const command = npmCli ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const args = npmCli
  ? [npmCli, 'pack', './sdk', '--pack-destination', destination]
  : ['pack', './sdk', '--pack-destination', destination];
const packed = spawnSync(command, args, {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
if (packed.error) throw packed.error;
if (packed.status !== 0) process.exit(packed.status || 1);

const filename = packed.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
if (!filename) throw new Error('npm pack did not return an SDK filename');
fs.copyFileSync(path.join(destination, filename), path.join(destination, 'spmt-sdk.tgz'));
console.log(JSON.stringify({ package: filename, stable: 'spmt-sdk.tgz' }));
