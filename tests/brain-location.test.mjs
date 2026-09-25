import assert from 'node:assert/strict';
import { actionableLedgerScanWarning, eligibleTrackedSystems, nearestTrackedSystems, recentlyScannedSystem } from '../lib/brain-location.mjs';

const names=['C-N4OD','H-S80W','Griemeer'];
const activity={
  'C-N4OD':{due:false},
  'H-S80W':{due:true},
  // Griemeer has never been scanned and must still qualify for an update.
};
assert.deepEqual(eligibleTrackedSystems(names,activity,true),['H-S80W','Griemeer']);

let resolved=[];
const ids=new Map([['C-N4OD',1],['H-S80W',2],['Griemeer',3]]);
const lookup=async systems=>{resolved=systems;return ids};
const routes=[];
const routeJumps=async(origin,destination)=>{
  routes.push([origin,destination]);
  return destination===2?5:1;
};
const nearest=await nearestTrackedSystems(1,{
  names,activity,updatesOnly:true,limit:1,resolveIds:lookup,routeJumps,
});
assert.deepEqual(resolved,['H-S80W','Griemeer']);
assert.deepEqual(routes,[[1,2],[1,3]]);
assert.equal(nearest.candidates,2);
assert.deepEqual(nearest.rows.map(row=>row.system),['Griemeer']);

let queried=false;
const current=await nearestTrackedSystems(1,{
  names:['C-N4OD'],activity,updatesOnly:true,
  resolveIds:async()=>{queried=true;return ids},routeJumps,
});
assert.deepEqual(current,{candidates:0,rows:[]});
assert.equal(queried,false,'no ESI requests when all tracked scans are current');

const partial=await nearestTrackedSystems(1,{
  names:['H-S80W','Griemeer'],activity,resolveIds:lookup,
  routeJumps:async(origin,destination)=>destination===2?null:destination===3?2:99,
});
assert.deepEqual(partial.rows.map(row=>row.system),['Griemeer']);

const scanAt='2026-09-25T02:20:00.000Z';
const justUpdated={
  due:false,lastScanAt:scanAt,
  ledger:{needsScan:true,lastActivityAt:'2026-09-25T02:19:00.000Z'},
};
assert.equal(actionableLedgerScanWarning(justUpdated),false,'the new scan answers earlier ledger warnings');
assert.deepEqual(eligibleTrackedSystems(names,{'C-N4OD':justUpdated,'H-S80W':{due:true}},true),['H-S80W','Griemeer']);
const newMining={...justUpdated,ledger:{needsScan:true,lastActivityAt:'2026-09-25T02:21:00.000Z'}};
assert.equal(actionableLedgerScanWarning(newMining),true,'mining observed after the scan can request another update');
assert.deepEqual(eligibleTrackedSystems(['C-N4OD'],{'C-N4OD':newMining},true),['C-N4OD']);
assert.equal(actionableLedgerScanWarning({...justUpdated,ledger:{needsScan:true,respawnCompletedAt:'2026-09-25T02:21:00.000Z',lastActivityAt:'2026-09-25T02:19:00.000Z'}}),true,'a completed respawn needs a new scan even when older mining activity has been answered');

const now=Date.parse('2026-09-25T02:20:10.000Z');
const actions=[{kind:'scan-updated',system:'C-N4OD',at:Date.parse(scanAt)}];
assert.equal(recentlyScannedSystem(actions,{'C-N4OD':{lastScanAt:scanAt}},{at:now}),'C-N4OD');
const afterScan=await nearestTrackedSystems(1,{
  names:['C-N4OD','H-S80W'],activity:{'C-N4OD':newMining,'H-S80W':{due:true}},
  updatesOnly:true,excludeSystem:recentlyScannedSystem(actions,{'C-N4OD':{lastScanAt:scanAt}},{at:now}),
  resolveIds:async()=>ids,routeJumps:async()=>1,
});
assert.deepEqual(afterScan.rows.map(row=>row.system),['H-S80W'],'next system skips the field just scanned');
assert.equal(recentlyScannedSystem(actions,{'C-N4OD':{lastScanAt:'2026-09-24T22:00:00.000Z'}},{at:now}),'','client history cannot skip a field without a committed scan');
assert.equal(recentlyScannedSystem(actions,{'C-N4OD':{lastScanAt:scanAt}},{at:now+31*60_000}),'','the skip expires after the scan workflow');
console.log('Brain nearest-system tests passed.');
