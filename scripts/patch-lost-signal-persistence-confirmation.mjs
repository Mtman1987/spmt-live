import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'public', 'signal', 'index.html');
const original = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
let source = original;

const before = `  function showSuccessResult(){
    result.classList.add('show'); resultTitle.textContent='SIGNAL STABILIZED';
    resultConsole.textContent=\`SOURCE RESOLVED\\nDECODING TRANSMISSION...\\n\\n\${packet.message.join('\\n')}\\n\\nTRANSMISSION TERMINATED\`;
    reward.hidden=false; reward.textContent='TRANSMITTER AUTHORIZATION RETAINED · Outbound carrier unlocked · Command: !signal';
    if(audioArmed&&window.speechSynthesis){setGain(staticGain,.015,.2);const final=new SpeechSynthesisUtterance(packet.message.join(' '));final.voice=roboticVoice();final.rate=.82;final.pitch=.68;final.volume=.75;final.onend=()=>setGain(staticGain,.08,.3);window.speechSynthesis.speak(final);}
  }
  function finishSuccess(){
    if(finished)return; finished=true; cancelAnimationFrame(raf); freezeControls(); document.getElementById('status').textContent='SIGNAL STABILIZED';
    voidEl.style.setProperty('--void-scale','6.8'); void voidEl.offsetWidth; voidEl.classList.add('successReturn'); ringsEl.classList.add('successReturn');
    if(audioArmed&&musicGain)setGain(musicGain,.018,.9);
    persistSignal().catch(()=>{loginWarning.style.display='block'}); setTimeout(showSuccessResult,1900);
  }`;

const after = `  function showSuccessResult(persisted){
    result.classList.add('show'); resultTitle.textContent='SIGNAL STABILIZED';
    resultConsole.textContent=\`SOURCE RESOLVED\\nDECODING TRANSMISSION...\\n\\n\${packet.message.join('\\n')}\\n\\nTRANSMISSION TERMINATED\`;
    reward.hidden=false;
    reward.textContent=persisted
      ? 'TRANSMITTER AUTHORIZATION RETAINED · Outbound carrier unlocked · Command: !signal'
      : 'TRANSMITTER AUTHORIZATION NOT RETAINED · Sign in to SPMT and complete the signal again before using !signal';
    if(audioArmed&&window.speechSynthesis){setGain(staticGain,.015,.2);const final=new SpeechSynthesisUtterance(packet.message.join(' '));final.voice=roboticVoice();final.rate=.82;final.pitch=.68;final.volume=.75;final.onend=()=>setGain(staticGain,.08,.3);window.speechSynthesis.speak(final);}
  }
  function finishSuccess(){
    if(finished)return; finished=true; cancelAnimationFrame(raf); freezeControls(); document.getElementById('status').textContent='SIGNAL STABILIZED';
    voidEl.style.setProperty('--void-scale','6.8'); void voidEl.offsetWidth; voidEl.classList.add('successReturn'); ringsEl.classList.add('successReturn');
    if(audioArmed&&musicGain)setGain(musicGain,.018,.9);
    const persistence=Promise.race([
      persistSignal().then(()=>true).catch(()=>false),
      new Promise(resolve=>setTimeout(()=>resolve(false),6000)),
    ]);
    setTimeout(async()=>{
      const persisted=await persistence;
      if(!persisted)loginWarning.style.display='block';
      showSuccessResult(persisted);
    },1900);
  }`;

if (source.includes(before)) {
  source = source.replace(before, after);
} else if (!source.includes("showSuccessResult(persisted)") || !source.includes("new Promise(resolve=>setTimeout(()=>resolve(false),6000))")) {
  throw new Error('Lost Signal success/persistence contract marker missing');
}

if (source !== original) fs.writeFileSync(file, source, 'utf8');
console.log('Lost Signal persistence confirmation patch applied.');
