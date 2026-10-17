import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import { addVerifiedSiteMining, autoClearFieldAtCap, FIELD_AUTO_CLEAR_REASON } from '../lib/field-auto-clear.mjs';

const scanAt='2026-09-24T18:00:00.000Z';
const field={status:'picked',cherryPicked:true,timerEndsAt:null};
const inference={
  baselineAt:scanAt,
  baselineDetected:true,
  verifiedFromScanAt:scanAt,
  verifiedM3SinceScan:0,
};
const cap=13_000_000;
const tenHours=10*60*60*1000;

// A daily ESI increase spanning the scan can include mining from an older site.
assert.equal(addVerifiedSiteMining(inference,12_000_000,'2026-09-24T17:50:00.000Z','2026-09-24T18:10:00.000Z'),false);
assert.equal(inference.verifiedM3SinceScan,0);
assert.equal(autoClearFieldAtCap(field,inference,cap,'2026-09-24T18:10:00.000Z',tenHours),false);

assert.equal(addVerifiedSiteMining(inference,8_000_000,'2026-09-24T18:10:00.000Z','2026-09-24T18:20:00.000Z'),true);
assert.equal(autoClearFieldAtCap(field,inference,cap,'2026-09-24T18:20:00.000Z',tenHours),false);
assert.equal(addVerifiedSiteMining(inference,5_000_000,'2026-09-24T18:20:00.000Z','2026-09-24T18:30:00.000Z'),true);
assert.equal(autoClearFieldAtCap(field,inference,cap,'2026-09-24T18:30:00.000Z',tenHours),true);
assert.equal(field.status,'cleared');
assert.equal(field.timerEndsAt,'2026-09-25T04:30:00.000Z');
assert.equal(field.autoClearReason,FIELD_AUTO_CLEAR_REASON);
assert.equal(field.autoClearM3,cap);
assert.equal(field.cherryPicked,true,'cherry status remains until the timer expires');
assert.equal(autoClearFieldAtCap(field,inference,cap,'2026-09-24T18:45:00.000Z',tenHours),false,'RED timer cannot restart from more ledger data');

const unconfirmed={baselineAt:scanAt,baselineDetected:false,verifiedFromScanAt:null,verifiedM3SinceScan:cap};
assert.equal(addVerifiedSiteMining(unconfirmed,1_000_000,'2026-09-24T18:10:00.000Z','2026-09-24T18:20:00.000Z'),false);
assert.equal(autoClearFieldAtCap({status:'picked'},unconfirmed,cap,'2026-09-24T18:20:00.000Z',tenHours),false);

const oldScan={...inference,baselineAt:'2026-09-25T05:00:00.000Z'};
assert.equal(addVerifiedSiteMining(oldScan,1_000_000,'2026-09-25T05:10:00.000Z','2026-09-25T05:20:00.000Z'),false,'old scan evidence cannot arm a new cycle');
assert.equal(autoClearFieldAtCap({status:'picked'},oldScan,cap,'2026-09-25T05:20:00.000Z',tenHours),false);

// Current T3 cards must not expose historical/cumulative UTC mining.
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const evidence=app.slice(app.indexOf('  function boardEvidenceLine(system){'),app.indexOf('  function renderTop(){'));
assert.match(evidence,/const today=Math\.max\(0,Number\(scan\.esiTodayM3\)/,'raw UTC total remains an independent diagnostic input');
assert.doesNotMatch(evidence,/ESI SYSTEM TODAY.*fmt\(today,'m3'\)/,'historic day-total no longer on field card');
assert.doesNotMatch(evidence,/ESI HISTORY.*fmt\(mined,'m3'\)/,'old field estimates no longer on field card');
assert.match(evidence,/RECENT ESI INCREASE/,'only most recent ESI interval appears without a scan');
assert.match(evidence,/ledger\?\.active&&Number\(ledger\.lastDeltaM3\)>0/,'stale ESI increments are hidden');
assert.match(evidence,/site>0&&verified/,'post-scan observed field progress is separate from old history');
assert.match(evidence,/scan\.source==='probe-scan'/,'only actual Probe Scanner reports can confirm the site');
assert.match(evidence,/tone:verified&&site>0&&confirmedMined>=site\*0\.95\?'danger':'warning'/,'critical styling requires verified near-complete site progress');
assert.match(evidence,/raw daily history belongs in Fleet Performance/);
console.log('Verified T3 field auto-clear tests passed.');
