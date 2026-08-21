'use strict';

const fs = require('node:fs');
const path = require('node:path');

function installCommlinkEasterEggRelocationBootstrap() {
  const jsPath = process.env.SPMT_COMMLINK_JS_PATH
    ? path.resolve(process.env.SPMT_COMMLINK_JS_PATH)
    : path.join(__dirname, 'public', 'commlink', 'commlink.js');
  const htmlPath = process.env.SPMT_COMMLINK_INDEX_PATH
    ? path.resolve(process.env.SPMT_COMMLINK_INDEX_PATH)
    : path.join(__dirname, 'public', 'commlink', 'index.html');

  let html = fs.readFileSync(htmlPath, 'utf8').replace(/\r\n/g, '\n');

  // Commlink is messaging only. The Black Hole belongs to the signed-in SPMT
  // shell logo, where the canonical SPMT cookie and app-state record already
  // identify the user. Remove both the old modal and the later physics loader.
  html = html.replace(
    /\n  <div class="black-hole-game hidden" id="black-hole-game"[\s\S]*?\n  <\/div>\n\n(?=  <div class="unlock-overlay hidden")/,
    '\n',
  );
  html = html.replace(/\n  <script src="\/commlink\/black-hole-puzzle\.js" defer><\/script>/g, '');

  let source = fs.readFileSync(jsPath, 'utf8').replace(/\r\n/g, '\n');
  source = source.replace('  blackHoleArtifacts: new Set(),\n', '');
  source = source.replace(
    /\nfunction openBlackHoleGame\(\) \{[\s\S]*?\n\}\n\n(?=async function handleConstellationStep)/,
    '\n',
  );
  source = source.replace(
    "  $('#cosmo-logo').addEventListener('click', openBlackHoleGame);\n  $('#black-hole-close').addEventListener('click', () => $('#black-hole-game').classList.add('hidden'));\n  $$('.cosmic-artifact').forEach((artifact) => artifact.addEventListener('click', () => captureBlackHoleArtifact(artifact)));\n",
    '',
  );

  for (const forbidden of [
    'id="black-hole-game"',
    '/commlink/black-hole-puzzle.js',
  ]) {
    if (html.includes(forbidden)) throw new Error(`Commlink still contains relocated Black Hole UI: ${forbidden}`);
  }
  for (const forbidden of [
    'blackHoleArtifacts',
    'openBlackHoleGame',
    'captureBlackHoleArtifact',
    "recordDiscovery('cosmo-black-hole')",
  ]) {
    if (source.includes(forbidden)) throw new Error(`Commlink still contains relocated Black Hole runtime: ${forbidden}`);
  }

  fs.writeFileSync(htmlPath, html, 'utf8');
  fs.writeFileSync(jsPath, source, 'utf8');
}

module.exports = { installCommlinkEasterEggRelocationBootstrap };
