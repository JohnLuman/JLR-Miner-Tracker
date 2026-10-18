import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=js.indexOf('  function boardEvidenceLine(system){');
const end=js.indexOf('  function renderTop(){',start);
assert.ok(start>0&&end>start,'board evidence function must exist');
const ctx=vm.createContext({
  state:{fields:{'PNQY-Y':{status:'cleared',autoClearReason:null}},scans:{'PNQY-Y':{
    lastScanAt:'2026-10-18T05:29:00Z',source:'clear-report',esiTodayM3:25000,
    ledger:{active:true,lastDeltaM3:1500,lastActivityAt:'2026-10-18T05:27:58Z',siteM3:60000,minedM3SinceSite:25000}
  }}},
  fmt:v=>String(v),
  ago:()=> 'just now'
});
vm.runInContext(js.slice(start,end),ctx);
let row=ctx.boardEvidenceLine('PNQY-Y');
assert.match(row.text,/CLEAR REPORTED.*RESPAWNING/);
assert.doesNotMatch(row.text,/MINING DETECTED|RECENT ESI INCREASE/,'old ESI increase cannot imply cleared T3 is still mined');
assert.equal(row.tone,'danger');

ctx.state.fields['PNQY-Y'].autoClearReason='probe-scan-absent';
row=ctx.boardEvidenceLine('PNQY-Y');
assert.match(row.text,/PROBE SCAN.*NOT DETECTED/,'retain scanner-backed clearance evidence');

ctx.state.fields['PNQY-Y'].autoClearReason='esi-ledger-cap';
ctx.state.fields['PNQY-Y'].autoClearM3=60000;
row=ctx.boardEvidenceLine('PNQY-Y');
assert.match(row.text,/AUTO RED/,'retain verified depletion reason');

ctx.state.fields['PNQY-Y']={status:'picked'};
row=ctx.boardEvidenceLine('PNQY-Y');
assert.match(row.text,/RECENT ESI INCREASE/,'mining activity remains visible on a currently active field');

console.log('T3 cleared field suppresses stale ESI mining badge, preserves absence/depletion reasons and active field evidence.');
