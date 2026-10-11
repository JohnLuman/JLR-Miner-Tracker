import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=app.indexOf('  function resetThreatShare(){');
const stop=app.indexOf('  let ceoCommandStatus=',start);
assert.ok(start>0&&stop>start,'share-reset helper is present');
const resetSource=app.slice(start,stop);
const clear=app.match(/\$\('threatClearScan'\)\?\.addEventListener\('click',\(\)=>\{([\s\S]*?)\n    \}\);/);
const next=app.match(/\$\('threatNewShare'\)\?\.addEventListener\('click',\(\)=>\{([\s\S]*?)\n    \}\);/);
assert.ok(clear&&next,'CLEAR TEXT and NEW SHARE have click handlers');
assert.match(clear[1],/resetThreatShare\(\)/,'clear delegates to full share reset');
assert.match(next[1],/resetThreatShare\(\)/,'new share delegates to same reset');
assert.match(app,/\$\{threatScanText\|\|threatShareUrl\?'':'disabled'\}/,
  'Clear Text remains available when a saved link exists without pasted text');
assert.match(app,/const generation=threatShareGeneration;/,
  'async share requests keep a generation to avoid restoring a cleared link');
assert.match(app,/if\(generation!==threatShareGeneration\)return; \/\/ Clear may have happened during creation\./,
  'stale responses cannot restore a link after clearing');
assert.match(app,/if\(threatShareUrl\)\{await copyThreatShareUrl\(\);return\}/,
  'an active share is reused only until Clear Text resets the URL');

const removed=[];
const storage=new Map([['jlrThreatShareUrl','https://jlrhub.com/d/oldShare123']]);
const localStorage={
  removeItem(key){removed.push(key);storage.delete(key)},
};
let renderCount=0,clearedTimer=0;
const harness=new Function('localStorage','renderThreatScan','clearTimeout',`
  let threatShareGeneration=0,threatShareUrl='https://jlrhub.com/d/oldShare123';
  let threatShareRecord={token:'oldShare123'},threatShareNewSystem='C-N4OD';
  let threatShareLoading=true,threatShareSaving=true,threatShareEditOpen=true;
  let threatShareEditLoading=true,threatShareError='bad',threatShareEditError='bad';
  let threatScanRequestSeq=4,threatScanPoll=123,threatScanLoading=true;
  let threatScanPollCount=9,threatScanText='Hulk\\tHulk\\t1 AU';
  let threatScanData={ships:[1]},threatScanError='old error';
  ${resetSource}
  function clearClick(){${clear[1]}}
  function newClick(){${next[1]}}
  function snapshot(){return {
    threatShareGeneration,threatShareUrl,threatShareRecord,threatShareNewSystem,
    threatShareLoading,threatShareSaving,threatShareEditOpen,threatShareEditLoading,
    threatShareError,threatShareEditError,threatScanRequestSeq,threatScanPoll,
    threatScanLoading,threatScanPollCount,threatScanText,threatScanData,threatScanError,
  }}
  return {clearClick,newClick,snapshot};
`)(localStorage,()=>{renderCount++},()=>{clearedTimer++});
harness.clearClick();
const state=harness.snapshot();
assert.equal(state.threatShareUrl,'','the previous public share URL is detached');
assert.equal(state.threatShareRecord,null);
assert.equal(state.threatShareNewSystem,'','the new scan can choose a new system');
assert.equal(state.threatShareEditOpen,false);
assert.equal(state.threatShareLoading,false);
assert.equal(state.threatShareEditLoading,false);
assert.equal(state.threatShareSaving,false);
assert.equal(state.threatShareError,'');
assert.equal(state.threatShareEditError,'');
assert.equal(state.threatShareGeneration,1,'stale in-flight share callbacks are invalidated');
assert.equal(storage.has('jlrThreatShareUrl'),false,'stored link cannot come back after reloading');
assert.deepEqual(removed,['jlrThreatShareUrl']);
assert.equal(state.threatScanText,'');
assert.equal(state.threatScanData,null);
assert.equal(state.threatScanPoll,null);
assert.equal(state.threatScanLoading,false);
assert.equal(state.threatScanRequestSeq,5,'old in-flight scan results are rejected');
assert.equal(clearedTimer,1);
assert.equal(renderCount,1);
harness.newClick();
assert.equal(harness.snapshot().threatShareGeneration,2,'New Share also invalidates stale share requests');
assert.equal(renderCount,2);
console.log('Clear Text resets active/shared/stored link, selection, editor, and pending scan; next share is fresh.');
