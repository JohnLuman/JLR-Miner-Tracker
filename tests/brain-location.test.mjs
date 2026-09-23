import assert from 'node:assert/strict';
import { eligibleTrackedSystems, nearestTrackedSystems } from '../lib/brain-location.mjs';

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
console.log('Brain nearest-system tests passed.');
