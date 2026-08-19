import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'public', 'commlink', 'index.html');
const puzzlePath = path.join(root, 'public', 'commlink', 'black-hole-puzzle.js');

if (!fs.existsSync(puzzlePath)) {
  throw new Error('Commlink black-hole puzzle module is missing');
}

const original = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');
let source = original;
const commlinkScript = '  <script src="/commlink/commlink.js" defer></script>';
const puzzleScript = '  <script src="/commlink/black-hole-puzzle.js" defer></script>';

if (!source.includes(puzzleScript)) {
  if (!source.includes(commlinkScript)) {
    throw new Error('Commlink black-hole patch marker missing: commlink script tag');
  }
  source = source.replace(commlinkScript, `${commlinkScript}\n${puzzleScript}`);
}

if (!source.includes(puzzleScript)) {
  throw new Error('Commlink black-hole puzzle loader was not installed');
}

if (source !== original) fs.writeFileSync(indexPath, source, 'utf8');
console.log('Commlink black-hole physics patch applied.');
