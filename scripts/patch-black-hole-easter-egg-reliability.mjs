import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'public', 'shared', 'black-hole-easter-egg.js');
const original = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
let source = original;

const stateBefore = `  let installedMark = null;\n  let clickTimer = null;\n  let ambientTimer = null;\n  let activeGame = null;`;
const stateAfter = `  let installedMark = null;\n  let clickTimer = null;\n  let ambientTimer = null;\n  let activeGame = null;\n  let lastPointerActivationAt = 0;\n  let lastKeyboardActivationAt = 0;`;
if (!source.includes('let lastPointerActivationAt = 0;') && source.includes(stateBefore)) {
  source = source.replace(stateBefore, stateAfter);
}

const finishBefore = `  function finishGame(won) {\n    const game = activeGame;\n    if (!game) return;\n    activeGame = null;\n    cancelAnimationFrame(game.frame);\n    const result = document.createElement('div');\n    result.className = 'egg-result';\n    result.innerHTML = \`<span>\${won ? 'ANOMALY STABILIZED' : 'THE VOID CLOSED'}</span>\`;\n    game.root.appendChild(result);\n    if (won) {\n      writeCompletion().catch((error) => console.warn('[BlackHoleEgg] completion persistence failed', error));\n    }\n    window.setTimeout(() => {\n      game.root.remove();\n      setBlackHoleMark(game.mark, false);\n    }, won ? 1800 : 1100);\n  }`;

const finishAfter = `  async function finishGame(won) {\n    const game = activeGame;\n    if (!game) return;\n    activeGame = null;\n    cancelAnimationFrame(game.frame);\n    const result = document.createElement('div');\n    result.className = 'egg-result';\n    const message = document.createElement('span');\n    message.textContent = won ? 'ANOMALY STABILIZING…' : 'THE VOID CLOSED';\n    result.appendChild(message);\n    game.root.appendChild(result);\n\n    let persisted = false;\n    if (won) {\n      persisted = await Promise.race([\n        writeCompletion().then(() => true).catch((error) => {\n          console.warn('[BlackHoleEgg] completion persistence failed', error);\n          return false;\n        }),\n        new Promise((resolve) => window.setTimeout(() => resolve(false), 6000)),\n      ]);\n      message.textContent = persisted ? 'ANOMALY STABILIZED' : 'ANOMALY NOT RETAINED';\n    }\n\n    window.setTimeout(() => {\n      game.root.remove();\n      setBlackHoleMark(game.mark, false);\n    }, won ? (persisted ? 1800 : 3200) : 1100);\n  }`;

if (!source.includes('async function finishGame(won)') && source.includes(finishBefore)) {
  source = source.replace(finishBefore, finishAfter);
}

const attachBefore = `  function attachToMark(mark) {\n    if (!mark || mark === installedMark) return;\n    installedMark = mark;\n    mark.style.cursor = 'pointer';\n    mark.title = mark.title || 'SPMT';\n    mark.addEventListener('click', () => {\n      window.clearTimeout(clickTimer);\n      clickTimer = window.setTimeout(() => flicker(mark), 235);\n    });\n    mark.addEventListener('dblclick', (event) => {\n      event.preventDefault();\n      window.clearTimeout(clickTimer);\n      startGame(mark);\n    });\n  }`;

const attachAfter = `  function attachToMark(mark) {\n    if (!mark || mark === installedMark) return;\n    installedMark = mark;\n    mark.style.cursor = 'pointer';\n    mark.title = mark.title || 'SPMT';\n    if (!mark.hasAttribute('tabindex')) mark.tabIndex = 0;\n    if (!mark.hasAttribute('role')) mark.setAttribute('role', 'button');\n\n    const activate = (event) => {\n      event?.preventDefault?.();\n      window.clearTimeout(clickTimer);\n      startGame(mark);\n    };\n\n    mark.addEventListener('click', () => {\n      window.clearTimeout(clickTimer);\n      clickTimer = window.setTimeout(() => flicker(mark), 235);\n    });\n    mark.addEventListener('dblclick', activate);\n\n    // Browsers do not consistently synthesize dblclick for touch. Preserve the\n    // hidden two-activation gesture while making it work on phones/tablets.\n    mark.addEventListener('pointerup', (event) => {\n      if (event.pointerType === 'mouse') return;\n      const now = performance.now();\n      if (lastPointerActivationAt && now - lastPointerActivationAt <= 420) {\n        lastPointerActivationAt = 0;\n        activate(event);\n        return;\n      }\n      lastPointerActivationAt = now;\n      flicker(mark, 90);\n    });\n\n    // Keyboard activation keeps the same hidden double-activation requirement.\n    mark.addEventListener('keydown', (event) => {\n      if (event.key !== 'Enter' && event.key !== ' ') return;\n      event.preventDefault();\n      const now = performance.now();\n      if (lastKeyboardActivationAt && now - lastKeyboardActivationAt <= 420) {\n        lastKeyboardActivationAt = 0;\n        activate(event);\n        return;\n      }\n      lastKeyboardActivationAt = now;\n      flicker(mark, 90);\n    });\n  }`;

if (!source.includes("mark.addEventListener('pointerup'") && source.includes(attachBefore)) {
  source = source.replace(attachBefore, attachAfter);
}

for (const marker of [
  'lastPointerActivationAt',
  'lastKeyboardActivationAt',
  'async function finishGame(won)',
  "message.textContent = persisted ? 'ANOMALY STABILIZED' : 'ANOMALY NOT RETAINED'",
  'new Promise((resolve) => window.setTimeout(() => resolve(false), 6000))',
  "mark.addEventListener('pointerup'",
  "mark.addEventListener('keydown'",
]) {
  if (!source.includes(marker)) throw new Error(`Black-hole reliability patch marker missing: ${marker}`);
}

if (source !== original) fs.writeFileSync(file, source, 'utf8');
console.log('Black-hole Easter egg reliability patch applied.');
