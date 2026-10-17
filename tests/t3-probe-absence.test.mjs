import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseProbeScan} from '../lib/probe-scan.mjs';
import {credibleAbsentT3Scan,observeAbsentT3,markAbsentT3FieldCleared,OBSERVER_NEGATIVE_CONFIRM_MS} from '../lib/t3-probe-absence.mjs';

const fullCopy=[
  'ID\tGroup\tType\tName\tSignal Strength\tDistance',
  'ABC-123\tCosmic Anomaly\tCombat Site\tForsaken Hub\t100.0%\t8.10 AU',
].join('\n');
const expectedOre='Kylixium';
const missing=parseProbeScan(fullCopy,expectedOre);
assert.equal(missing.valid,true);
assert.equal(missing.detected,false);
assert.equal(credibleAbsentT3Scan(fullCopy,missing),true,'real, complete clipboard scanner may confirm missing T3');
const partial='ABC-123\tCosmic Anomaly\tCombat Site\tForsaken Hub\t100.0%\t8.10 AU';
assert.equal(credibleAbsentT3Scan(partial,parseProbeScan(partial,expectedOre)),false,'one arbitrary scan row is not a complete table');
const present=fullCopy+'\nDEF-456\tCosmic Anomaly\tOre Site\tLarge Kylixium Deposit\t100%\t3.0 AU';
assert.equal(credibleAbsentT3Scan(present,parseProbeScan(present,expectedOre)),false,'detected ore never automatically clears');
assert.equal(credibleAbsentT3Scan('screen text',parseProbeScan('screen text',expectedOre)),false,'non-scanner clipboard is untrusted');
const observer=[
  'Probe Scanner',
  'Cosmic Anomaly',
  'Combat Site',
  'Forsaken Hub',
  '100%',
  '8.1 AU'
].join('\n');
assert.equal(credibleAbsentT3Scan(observer,parseProbeScan(observer,expectedOre),{observer:true}),true,'readable Yeda screen OCR can nominate absence');
assert.equal(credibleAbsentT3Scan('Cosmic Anomaly\nCombat Site\nForsaken Hub\n100%\n8.1 AU',parseProbeScan('Cosmic Anomaly\nCombat Site\nForsaken Hub\n100%\n8.1 AU',expectedOre),{observer:true}),false,'unidentified screen cannot clear a field');
const t=Date.parse('2026-10-17T20:00:00Z');
const first=observeAbsentT3(null,{characterId:'111',system:'APM-8K',scanText:observer,at:t});
assert.equal(first.confirmed,false,'first OCR negative is provisional');
assert.equal(observeAbsentT3(first.next,{characterId:'111',system:'APM-8K',scanText:observer,at:t+OBSERVER_NEGATIVE_CONFIRM_MS-1}).confirmed,false,'same instant screenshot cannot clear');
assert.equal(observeAbsentT3(first.next,{characterId:'111',system:'APM-8K',scanText:observer,at:t+OBSERVER_NEGATIVE_CONFIRM_MS}).confirmed,true,'second separate capture confirms');
assert.equal(observeAbsentT3(first.next,{characterId:'222',system:'APM-8K',scanText:observer,at:t+30000}).confirmed,false,'different scout must restart verification');
assert.equal(observeAbsentT3(first.next,{characterId:'111',system:'OTHER',scanText:observer,at:t+30000}).confirmed,false,'different system must restart verification');
assert.equal(observeAbsentT3(first.next,{characterId:'111',system:'APM-8K',scanText:observer,at:t+4*60_000}).confirmed,false,'stale confirmation candidate must expire');
const f={status:'picked',timerEndsAt:null,notes:[{text:'my note'}],cherryPicked:true,ledgerMinedM3:5000000};
const timestamp=new Date(t).toISOString();
const cleared=markAbsentT3FieldCleared(f,timestamp);
assert.equal(cleared.applied,true);
assert.equal(f.status,'cleared');
assert.equal(f.timerEndsAt,'2026-10-18T06:00:00.000Z');
assert.equal(f.autoClearReason,'probe-scan-absent');
assert.deepEqual(f.notes,[{text:'my note'}],'do not delete field notes');
const again=markAbsentT3FieldCleared(f,new Date(t+60000).toISOString());
assert.equal(again.alreadyCleared,true);
assert.equal(f.timerEndsAt,'2026-10-18T06:00:00.000Z','no repeated negative may restart timer');
const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
assert.match(server,/probeScanPreview\(ch,scanText,observedSystem,\{origin:'observer'\}\)/,'Yeda observation uses two-capture guard');
assert.match(server,/probeScanPreview\(ch,clipText,observedSystem\|\|null,\{origin:'clipboard'\}\)/,'clipboard uses complete-copy evidence');
assert.match(server,/markAbsentT3FieldCleared\(state\.fields\[system\],state\.scans\[system\]\.lastScanAt/,'only committed scan absence starts timer');
assert.match(server,/SCAN_PENDING_CONFIRMATION/,'old companion retry logic receives 409 rather than premature success');
assert.match(server,/await save\(\);\n        if\(preview\.correction\?\.applied\|\|preview\.clearance/,'clipboard commit persisted');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const details=fs.readFileSync(new URL('../public/field-status.js',import.meta.url),'utf8');
assert.match(app,/PROBE SCAN • T3 NOT DETECTED/,'field card shows source of RED timer');
assert.match(details,/Probe Scanner reported T3 deposit not detected/,'field history never confuses absence with a full ESI cap');
console.log('Yeda/clipboard T3 missing-site confirmation, no false scanner clear, timer and persistence tests passed.');
