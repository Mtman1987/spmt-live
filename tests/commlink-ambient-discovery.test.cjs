const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/commlink/black-hole-puzzle.js', 'utf8');

function fixture(storage = new Map(), random = () => 0) {
  let now = 1_000_000, nextId = 0, discoveries = 0;
  const timers = new Map();
  class Element {
    constructor(id = '') {
      this.id = id; this.style = {}; this.dataset = {}; this.events = {}; this.children = []; this.hidden = false;
      const classes = new Set();
      this.classList = { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)), contains: n => classes.has(n) };
    }
    appendChild(el) { this.children.push(el); return el; }
    setAttribute() {}
    getBoundingClientRect() { return {left:0,top:0,width:1000,height:700}; }
    getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; }
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
    emit(name, event={}) { for (const fn of this.events[name] || []) fn({ preventDefault(){},stopImmediatePropagation(){}, ...event }); }
    querySelector() { return orbit; }
    matches() { return false; }
    remove() {}
  }
  const logo=new Element('cosmo-logo'),orbit=new Element(),shell=new Element('app-shell'),body=new Element(),head=new Element(),docEvents={};
  const document={ body, head, hidden:false, activeElement:body,
    getElementById:id=>({'cosmo-logo':logo,'app-shell':shell}[id] || null),
    createElement:()=>new Element(),
    addEventListener:(name,fn)=>(docEvents[name] ||= []).push(fn),
  };
  const timeout=(fn,delay)=>{const id=++nextId;timers.set(id,{fn,at:now+delay});return id;};
  class ClockDate extends Date { static now(){return now;} }
  const context={document,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Date:ClockDate,performance:{now:()=>now},Math:Object.assign(Object.create(Math),{random}),requestAnimationFrame:()=>0,console};
  context.window={setTimeout:timeout,clearTimeout:id=>timers.delete(id),toast(){},recordDiscovery:async()=>{discoveries++;return {};} };
  vm.runInNewContext(source,context);
  const advance=ms=>{now+=ms;const ready=[...timers].filter(([,t])=>t.at<=now);for(const [id,t] of ready){timers.delete(id);t.fn();}};
  return {document,logo,body,advance,storage,get claims(){return discoveries;},active:()=>body.classList.contains('commlink-black-hole-active'),escape:()=>docEvents.keydown.forEach(fn=>fn({key:'Escape',target:body})),close:()=>body.children.find(el=>el.textContent==='Close anomaly · Esc').emit('click')};
}

test('ambient discovery waits for a visible idle composer and opens the existing puzzle without awarding it',()=>{
  const f=fixture();f.document.hidden=true;f.advance(60000);assert.equal(f.active(),false);
  f.document.hidden=false;f.document.activeElement={matches:()=>true};f.advance(60000);assert.equal(f.active(),false);
  f.document.activeElement=f.body;f.advance(60000);assert.equal(f.active(),true);assert.equal(f.claims,0);
  f.close();assert.equal(f.active(),false);f.advance(60000);assert.equal(f.active(),false);
  f.logo.emit('click');assert.equal(f.active(),true);f.escape();assert.equal(f.active(),false);
});
test('automatic-start cooldown survives reload while manual logo activation stays available',()=>{
  const first=fixture();first.advance(60000);first.close();
  const second=fixture(first.storage);second.advance(60000);assert.equal(second.active(),false);
  second.logo.emit('click');assert.equal(second.active(),true);
});
test('unlucky active visitors discover the anomaly by the tenth eligible minute',()=>{
  const f=fixture(new Map(),()=>.999);
  for(let i=1;i<=10;i++){f.advance(60000);assert.equal(f.active(),i===10);}
});
