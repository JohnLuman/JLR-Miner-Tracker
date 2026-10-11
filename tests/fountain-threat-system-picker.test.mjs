import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const start=app.indexOf('  const FOUNTAIN_SYSTEM_NAMES=Object.freeze(');
const end=app.indexOf('  function renderThreatScan(){',start);
assert.ok(start>0&&end>start,'Fountain picker functions are available');
const inputs={};
const bindings={};
const inputListeners={};
const listListeners={};
const fakeInput={
  value:'',attributes:{},
  addEventListener:(type,fn)=>{inputListeners[type]=fn},
  setAttribute:(name,value)=>{fakeInput.attributes[name]=String(value)},
  removeAttribute:(name)=>{delete fakeInput.attributes[name]},
  closest:()=>({contains:element=>element===fakeInput}),
  focus:()=>{},
};
const fakeList={
  innerHTML:'',hidden:true,
  addEventListener:(type,fn)=>{listListeners[type]=fn},
  querySelectorAll:()=>[],
};
inputs.threatShareNewSystem=fakeInput;
inputs.threatShareNewSystemChoices=fakeList;
const esc=val=>String(val).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const pickerFactory=new Function('$','esc','document',
  app.slice(start,end)+'\nreturn {FOUNTAIN_SYSTEM_NAMES,matchingFountainSystems,canonicalFountainSystem,fountainSystemInputMarkup,attachFountainSystemPicker};');
const picker=pickerFactory(id=>inputs[id],esc,{activeElement:fakeInput});
assert.equal(picker.FOUNTAIN_SYSTEM_NAMES.length,115,'all 115 Fountain systems from ESI region 10000058 are included');
assert.equal(new Set(picker.FOUNTAIN_SYSTEM_NAMES).size,115,'no duplicate system names');
assert.deepEqual(picker.matchingFountainSystems('Rp'),['RP2-OQ'],'typing RP finds RP2-OQ');
assert.deepEqual(picker.matchingFountainSystems(' rp '),['RP2-OQ'],'matching ignores whitespace and case');
assert.ok(picker.matchingFountainSystems('CN').every(n=>n.toUpperCase().includes('CN')),'contains filtering is exact');
assert.deepEqual(picker.matchingFountainSystems(''),[...picker.FOUNTAIN_SYSTEM_NAMES].sort((a,b)=>a.localeCompare(b)),'clicking empty box browses all Fountain systems');
assert.ok(picker.matchingFountainSystems('C-N').includes('C-N4OD'),'home system exists');
assert.ok(picker.matchingFountainSystems('Serp').includes('Serpentis Prime'),'named NPC systems included');
assert.equal(picker.canonicalFountainSystem('rp2-oq'),'RP2-OQ','selection normalizes case to canonical Fountain name');
assert.equal(picker.canonicalFountainSystem('Jita'),'','non-Fountain system is rejected');
assert.equal(picker.matchingFountainSystems('jita').length,0);
assert.match(picker.fountainSystemInputMarkup('threatShareNewSystem','rp'),/role="combobox"/);
assert.match(picker.fountainSystemInputMarkup('threatShareNewSystem','rp'),/aria-autocomplete="list"/);
assert.match(picker.fountainSystemInputMarkup('threatShareNewSystem','rp'),/value="rp"/);
let selected='';
picker.attachFountainSystemPicker('threatShareNewSystem',value=>{selected=value});
fakeInput.value='Rp';
inputListeners.input();
assert.equal(fakeList.hidden,false,'suggestions appear while typing');
assert.match(fakeList.innerHTML,/data-system="RP2-OQ"/,'RP2-OQ is an actual clickable option');
assert.doesNotMatch(fakeList.innerHTML,/data-system="C-N4OD"/,'unrelated systems are filtered out');
assert.equal(fakeInput.attributes['aria-expanded'],'true');
let prevented=false;
listListeners.pointerdown({
  target:{closest:()=>({dataset:{system:'RP2-OQ'}})},
  preventDefault:()=>{prevented=true},
});
assert.equal(prevented,true,'mouse selection keeps input stable');
assert.equal(fakeInput.value,'RP2-OQ','click fills exact system into the input');
assert.equal(selected,'RP2-OQ','click persists selected system for share payload');
assert.equal(fakeList.hidden,true,'dropdown closes after selection');
assert.equal(fakeInput.attributes['aria-expanded'],'false');
fakeInput.value='';
inputListeners.focus();
assert.equal(fakeList.innerHTML.match(/data-system="/g).length,115,'all systems browsable with a scrollable dropdown');
inputListeners.keydown({key:'Escape',preventDefault:()=>{}});
assert.equal(fakeList.hidden,true,'Escape dismisses dropdown');
fakeInput.value='rp';
inputListeners.input();
inputListeners.keydown({key:'Enter',preventDefault:()=>{}});
assert.equal(fakeInput.value,'RP2-OQ','Enter accepts a single matching system');
assert.match(app,/attachFountainSystemPicker\('threatShareSystem'/,'same dropdown works for editing shared scans');
assert.match(app,/attachFountainSystemPicker\('threatShareNewSystem'/,'new share field uses picker');
assert.match(app,/Choose a Fountain system from the clickable suggestions/,'invalid out-of-region input prompts user to select');
assert.match(css,/\.threat-system-options/,'dropdown visibly styled');
assert.match(css,/\.threat-system-options\[hidden\]/,'hidden list does not remain visible');
const hero=app.slice(app.indexOf('<section class="glass threat-hero">'),app.indexOf('<section class="glass threat-input-card">'));
const heading=hero.indexOf('<h2>THREAT SCAN</h2>');
const selector=hero.indexOf("fountainSystemInputMarkup('threatShareNewSystem',threatShareNewSystem)");
assert.ok(heading>=0&&selector>heading,'new system picker appears immediately to the right of Threat Scan title');
assert.ok(hero.indexOf('class="threat-hero-title-row"')<heading,'Threat Scan heading and picker share a header row');
assert.ok(selector<hero.indexOf('class="threat-actions"'),'picker appears before scan action buttons');
assert.ok(!app.slice(app.indexOf('<section class="glass threat-input-card">'),app.indexOf('const input=$(\'threatScanInput\')')).includes("fountainSystemInputMarkup('threatShareNewSystem'"),'picker no longer takes space below paste box');
assert.match(css,/\.threat-hero-title-row\{display:flex/,'header lays out heading and picker horizontally');
assert.match(css,/@media\(max-width:480px\)/,'header picker remains usable on narrow screens');
assert.match(html,/fountainpick2-header/g,'browser loads refreshed JS and CSS after picker relocation');
console.log('Fountain 115-system searchable clickable Threat Scan dropdown passed.');
