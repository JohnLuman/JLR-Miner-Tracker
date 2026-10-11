import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const start=app.indexOf('  function configuredFleetPerformanceIds(){');
const end=app.indexOf('  function fleetPerformanceKey(',start);
assert.ok(start>0&&end>start,'auto ESI selection helpers are present');
const selectedFleetPerformanceIds=new Function('me','fleetSettings','calcSettings',
  app.slice(start,end)+'\nreturn selectedFleetPerformanceIds;'
);
const chars=Array.from({length:33},(_,i)=>({
  characterId:String(i+10000),miningAccess:i<30,
  fittings:[],ledgerActivity:{miningDetected:i<22,actualM3PerHour:1800},
}));
const noFits=selectedFleetPerformanceIds({characters:chars},{members:{}},{boosterCharacterId:'10000'});
const ids=noFits();
assert.equal(ids.length,29,'automatically includes all 30 mining-authorized characters except the booster');
assert.ok(!ids.includes('10000'),'Rorqual booster excluded from miner totals');
assert.ok(ids.includes('10029'),'mining authorized character tracked even without saved fittings');
assert.ok(!ids.includes('10030'),'characters missing mining scope never appear in auto selection');
const explicitlySelected=selectedFleetPerformanceIds({characters:chars},{members:{'10001':{enabled:true},'10002':{enabled:true}}},{boosterCharacterId:'10000'});
assert.deepEqual(explicitlySelected(),['10001','10002'],'explicitly selected fleet keeps its own scope');
assert.deepEqual(selectedFleetPerformanceIds({characters:chars},{members:{}},{boosterCharacterId:''})().length,30);
assert.deepEqual(selectedFleetPerformanceIds({characters:[]},{members:{}},{boosterCharacterId:''})(),[],'no connected accounts never fake production');
assert.match(app,/const tracked=new Set\(selectedFleetPerformanceIds\(\)\)/,'fitless miner comparison respects the selected authorized scope');
assert.match(app,/Observed ESI rates are shown without fits/,'actual miner readouts are independent from mining fits');
assert.ok(app.includes("'AUTO • '+assignedCount"),'automatic tracking mode visibly identified');
assert.ok(app.includes("'ESI LEDGER: '+cachedCount"),'visible ledger coverage based on cached characters');
assert.match(html,/id="fleetTrackingScope"/,'tracking scope is visible in Performance');
assert.match(html,/id="fleetLedgerCoverage"/,'missing cache and ESI scope are visible');
assert.match(server,/const allowed=new Set\(\(user\?\.characterIds\|\|\[\]\)\.map\(String\)\)/,'backend always authorizes individual miners');
assert.match(server,/cachedCharacters:characterIds\.filter\(id=>ledgerRowsByCharacter\.has\(id\)\)\.length/,'backend returns actual cache coverage');
console.log('Auto ESI Fleet Performance without fitted miners, scoped selection, and coverage labels passed.');
