'use strict';

const fs = require('node:fs');
const path = require('node:path');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`SPMT auth shell stability patch marker missing: ${label}`);
  return source.replace(before, after);
}

function patchAuthShellStability(rootDir = __dirname) {
  const chromePath = path.join(rootDir, 'public', 'shared', 'shell-chrome.js');
  let chrome = fs.readFileSync(chromePath, 'utf8').replace(/\r\n/g, '\n');
  chrome = replaceOnce(
    chrome,
    "  const observer = new MutationObserver(observeShellState);\n  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });",
    "  const observer = new MutationObserver(observeShellState);\n  [document.getElementById('app'), document.getElementById('auth')].filter(Boolean).forEach((node) => {\n    observer.observe(node, { attributes: true, attributeFilter: ['class'] });\n  });",
    'shell-chrome observer',
  );
  fs.writeFileSync(chromePath, chrome, 'utf8');

  const ecosystemPath = path.join(rootDir, 'public', 'shared', 'ecosystem-header.js');
  let ecosystem = fs.readFileSync(ecosystemPath, 'utf8').replace(/\r\n/g, '\n');
  ecosystem = replaceOnce(
    ecosystem,
    "    const observer = new MutationObserver(() => requestAnimationFrame(apply));\n    observer.observe(document.body, { childList: true, subtree: true });",
    "    const observer = new MutationObserver((mutations) => {\n      if (header && mutations.every((mutation) => mutation.target === header || header.contains(mutation.target))) return;\n      requestAnimationFrame(apply);\n    });\n    observer.observe(document.body, { childList: true, subtree: true });",
    'ecosystem-header observer',
  );
  fs.writeFileSync(ecosystemPath, ecosystem, 'utf8');

  console.log('[SPMT] Auth shell observer stability patch applied.');
}

module.exports = { patchAuthShellStability };
