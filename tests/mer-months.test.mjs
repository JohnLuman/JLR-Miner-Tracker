import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=(name)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const august=JSON.parse(file('public/mer-fountain-init.json'));
const september=JSON.parse(file('public/mer-fountain-init-2026-09.json'));
const app=file('public/app.js');
const index=file('public/index.html');
const pkg=JSON.parse(file('package.json'));

assert.equal(august.period,'2026-08','existing August report must remain intact');
assert.equal(september.period,'2026-09');
assert.equal(september.reportLabel,'September 2026');
assert.equal(september.alliance.allianceId,1900696668);
assert.equal(september.region,'Fountain');
assert.equal(september.fountain.economic.mined_value.value,3171655279573,'Fountain September mining ISK');
assert.equal(september.fountain.economic.npc_bounties.value,6758803960528,'Fountain September bounties');
assert.equal(september.fountain.economic.produced_value.value,13293417960003);
assert.equal(september.fountain.mining.asteroid.minedM3,6379225427.05);
assert.equal(september.fountain.mining.ice.minedM3,2438048000);
assert.equal(september.fountain.mining.moon.minedM3,2141188990);
assert.equal(september.fountain.mining.gas.minedM3,16849930);
assert.equal(september.fountain.moonMaterials.metenoxMining,277528823028);
assert.equal(september.fountain.moonMaterials.refineryMining,578344719211.71);
assert.equal(september.fountain.combat.killRecords,14573);
assert.equal(september.init.global.killRecords,25062);
assert.equal(september.init.global.lossRecords,24262);
assert.equal(september.init.fountain.killRecords,8396);
assert.equal(september.init.fountain.lossRecords,6096);
assert.equal(september.init.fountainHotspots[0].system,'C-N4OD');
assert.equal(september.init.fountainHotspots[0].initKillRecords,1326);
assert.equal(september.init.fountainHotspots[0].initLossRecords,550);
for(const month of [august,september]){
  assert.equal(Object.keys(month.fountain.economic).length,6);
  assert.equal(Object.keys(month.fountain.mining).length,4);
  assert.equal(month.init.fountainHotspots.length,10);
  for(const row of Object.values(month.fountain.mining)){
    assert.ok(row.minedM3>=0&&row.wastedM3>=0);
    assert.ok(Math.abs(row.wasteRate-row.wastedM3/(row.wastedM3+row.minedM3))<1e-10);
    assert.ok(row.rank>=1&&row.rank<=row.of);
  }
  assert.ok(Math.abs(month.init.fountain.ccpEfficiency-
    month.init.fountain.ccpDestroyed/(month.init.fountain.ccpDestroyed+month.init.fountain.ccpLost))<1e-10);
}
assert.match(app,/mer-fountain-init-2026-09\.json/,'September data is available');
assert.match(app,/mer-fountain-init\.json/,'August data is still available');
assert.match(app,/id="merMonthSelect"/,'MER has a month selector');
assert.match(app,/jlrMerPeriod/,'selected month persists');
assert.match(app,/payload\.period!==period/,'mismatched report cannot display under wrong month');
assert.match(app,/merSelectedPeriod!==period/,'out-of-order fetch does not overwrite newer selection');
assert.doesNotMatch(app,/regional August totals|INIT ALL-NEW-EDEN AUGUST/,'page no longer contains stale fixed August labels');
assert.ok(index.includes('/app.js?v='+pkg.version+'-threat-fast1'),'latest app script is cache-busted');
assert.ok(index.includes('/styles.css?v='+pkg.version+'-reset-loop1'),'latest styles are cache-busted');
console.log('September MER source totals, August preservation, month selector, and dynamic labels passed.');
