'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Installed after the existing asset migrations, before the first render and
// event binding. Keep navigation readable as ordinary JS/CSS, not replacement strings.
function installCommlinkChatNavigationBootstrap() {
  const file = (env, name) => process.env[env] || path.join(__dirname, 'public/commlink', name);
  const jsPath = file('SPMT_COMMLINK_JS_PATH', 'commlink.js');
  const cssPath = file('SPMT_COMMLINK_CSS_PATH', 'commlink.css');
  let js = fs.readFileSync(jsPath, 'utf8');
  const begin = '// BEGIN COMMLINK CHAT NAVIGATION';
  const end = '// END COMMLINK CHAT NAVIGATION';
  const extension = fs.readFileSync(path.join(__dirname, 'public/commlink/chat-navigation.js'), 'utf8');
  const block = `${begin}\n${extension}\n${end}\n`;
  if (js.includes(begin)) {
    const first = js.indexOf(begin);
    const last = js.indexOf(end, first);
    if (last < 0) throw new Error('Incomplete Commlink chat navigation asset');
    js = js.slice(0, first) + block + js.slice(last + end.length + 1);
  } else {
    const marker = '\nrenderAll();\nwireEvents();';
    if (!js.includes(marker) || !js.includes('function activeSpaceRecord()')) {
      throw new Error('Chat navigation requires the prepared Commlink assets');
    }
    js = js.replace(marker, `\n${block}${marker}`);
  }
  const css = fs.readFileSync(cssPath, 'utf8');
  const cssMarker = '/* COMMLINK CHAT NAVIGATION */';
  const stylesheet = fs.readFileSync(path.join(__dirname, 'public/commlink/chat-navigation.css'), 'utf8');
  fs.writeFileSync(jsPath, js);
  fs.writeFileSync(cssPath, css.split(cssMarker)[0].trimEnd() + '\n\n' + cssMarker + '\n' + stylesheet);
}

module.exports = { installCommlinkChatNavigationBootstrap };
