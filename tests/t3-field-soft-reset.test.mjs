import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {snapshotT3ForSoftReset,applyT3SoftReset} from '../lib/t3-field-soft-reset.mjs';

const stamp='2026-10-17T08:15:00.000Z';
const defs=[{system:'APM-8K',ore:'Kylixium',siteM3:12999073.9},{system:'OTHER',ore:'Griemeer',siteM3:13098666}];
const initial={
  fields:{
    'APM-8K':{status:'picked',cherryPicked:true,updatedAt:'2026-10-16T00:00:00Z',notes:[{text:'do not forget this'}],ledgerMinedM3:47650000},
    'OTHER':{status:'cleared',timerEndsAt:'2026-10-18T09:00:00Z',notes:[{text:'timer active'}]},
    'UNRELATED':{status:'cleared',timerEndsAt:'later'},
  },
  scans:{'APM-8K':{lastScanAt:'2026-10-16T05:00:00Z',source:'probe-scan',t3:{ore:'Kylixium',detected:true}}},
  esi:{
    fieldInference:{'APM-8K':{baselineDetected:true,baselineAt:'2026-10-16T05:00:00Z',minedM3SinceSite:47650000,verifiedM3SinceScan:500000}},
    ledgerFieldSnapshots:{'111':{date:'2026-10-17',totals:{'APM-8K':47650000}}},
    dailyFleet:[{date:'2026-10-17',m3:47650000}],
  },
};
const before=structuredClone(initial);
const backup=snapshotT3ForSoftReset(initial,defs,'operator-reset-001',stamp);
assert.deepEqual(backup.fields['APM-8K'],before.fields['APM-8K']);
assert.deepEqual(backup.scans['APM-8K'],before.scans['APM-8K']);
assert.deepEqual(backup.inference['APM-8K'],before.esi.fieldInference['APM-8K']);
assert.equal(backup.systems.length,2);
assert.deepEqual(initial,before,'backup must not modify state');
const done=applyT3SoftReset(initial,defs,'operator-reset-001',stamp);
assert.deepEqual({count:done.count,alreadyApplied:done.alreadyApplied},{count:2,alreadyApplied:false});
for(const d of defs){
  const f=initial.fields[d.system],scan=initial.scans[d.system],inf=initial.esi.fieldInference[d.system];
  assert.equal(f.status,'ready');
  assert.equal(f.timerEndsAt,null);
  assert.equal(f.cherryPicked,false);
  assert.equal(f.softResetAt,stamp);
  assert.equal(scan.source,'operator-soft-reset');
  assert.equal(scan.lastScanAt,stamp);
  assert.equal(scan.t3.detected,false,'never fake a CCP verified scan');
  assert.equal(inf.baselineDetected,false,'unverified sites cannot auto-clear RED');
  assert.equal(inf.verifiedFromScanAt,null);
  assert.equal(inf.minedM3SinceSite,0);
  assert.equal(inf.verifiedM3SinceScan,0);
  assert.equal(inf.respawnCompletedAt,stamp,'prevent same-day daily ESI from reinstating older site');
}
assert.deepEqual(initial.fields['APM-8K'].notes,before.fields['APM-8K'].notes,'keep notes in soft reset');
assert.deepEqual(initial.fields['OTHER'].notes,before.fields['OTHER'].notes,'keep notes on timer reset');
assert.deepEqual(initial.fields.UNRELATED,before.fields.UNRELATED,'non-T3 row untouched');
assert.deepEqual(initial.esi.ledgerFieldSnapshots,before.esi.ledgerFieldSnapshots,'ESI character ledger baselines must survive');
assert.deepEqual(initial.esi.dailyFleet,before.esi.dailyFleet,'real daily payout history must survive');
assert.equal(applyT3SoftReset(initial,defs,'operator-reset-001',stamp).alreadyApplied,true,'one-shot idempotency');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const status=readFileSync(new URL('../public/field-status.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
assert.match(app,/ASSUMED PRESENT/);
assert.match(app,/SOFT RESET • UNVERIFIED/);
assert.match(app,/RECENT MINING • NOT VERIFIED/,'only fresh mining is shown after an assumed soft reset');
assert.match(status,/Presence assumed \(NOT scanned\)/);
assert.match(server,/JLR_T3_SOFT_RESET_ONCE/);
assert.match(server,/field-reset-backups/);
assert.match(server,/writeState\(state\)/);
console.log('One-time T3 assumption reset, non-fabricated scan, ledger preservation, and rollback snapshot passed.');
