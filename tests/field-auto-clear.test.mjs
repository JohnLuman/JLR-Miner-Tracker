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

console.log('Verified T3 field auto-clear tests passed.');
