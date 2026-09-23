import assert from 'node:assert/strict';
import { positiveLedgerDeltas, dueRouteStops, fountainRouteDestination, brainLiveIntent } from '../lib/brain-intel.mjs';

const old=[{date:'2026-09-23',solar_system_id:1,type_id:74521,quantity:100},{date:'2026-09-23',solar_system_id:2,type_id:74521,quantity:20}];
const next=[{date:'2026-09-23',solar_system_id:1,type_id:74521,quantity:145},{date:'2026-09-23',solar_system_id:2,type_id:74521,quantity:12},{date:'2026-09-23',solar_system_id:1,type_id:74522,quantity:7}];
assert.deepEqual(positiveLedgerDeltas(old,next).map(row=>[row.solar_system_id,row.type_id,row.quantity]),[[1,74521,45],[1,74522,7]]);
assert.deepEqual(positiveLedgerDeltas(undefined,next),[],'first ledger sync only establishes a baseline');
assert.deepEqual(positiveLedgerDeltas(next,next),[],'unchanged ESI cache must not count twice');

const future=new Date(Date.now()+60_000).toISOString();
const route=[1,2,3,4,5];
const tracked=new Map([
  ['2',{system:'due midway',needsScan:true}],
  ['3',{system:'fresh',needsScan:false}],
  ['4',{system:'cleared timer',needsScan:true,clearedUntil:future}],
  ['5',{system:'due destination',needsScan:true}],
]);
assert.deepEqual(dueRouteStops(route,tracked).map(row=>[row.system,row.jumpsFromOrigin,row.atDestination]),[['due midway',1,false],['due destination',4,true]]);
assert.deepEqual(dueRouteStops([1,3],tracked),[],'never suggest a detour as an on-route stop');
assert.equal(fountainRouteDestination('I am heading to C-N, what systems could I stop by and scan?'),'C-N4OD');
assert.equal(fountainRouteDestination('On my way to 1-SMEB. Which systems need a scan?'),'1-SMEB');
assert.equal(fountainRouteDestination('on way to anywhere in fountain'),'','ask for a destination instead of guessing');
for(const question of [
  'Tracker what system is closest that needs an update?',
  'which systems need a scan update on Tracker',
  'where should I go to update a field',
  'find me a close system due for scanning',
])assert.deepEqual(brainLiveIntent(question),{kind:'nearest',updatesOnly:true},question);
assert.deepEqual(brainLiveIntent('where is my toon'),{kind:'location'});
assert.deepEqual(brainLiveIntent('on way to anywhere in Fountain'),{kind:'route'});
assert.deepEqual(brainLiveIntent('how much I made this hour total'),{kind:'earnings',period:'current'});
assert.deepEqual(brainLiveIntent('give me a status briefing'),{kind:'general'});
console.log('Brain intel tests passed');

assert.deepEqual(brainLiveIntent('Tracker, next system'),{kind:'nearest',updatesOnly:true});
assert.deepEqual(brainLiveIntent('next field'),{kind:'nearest',updatesOnly:true});
assert.deepEqual(brainLiveIntent('another scan stop'),{kind:'nearest',updatesOnly:true});
