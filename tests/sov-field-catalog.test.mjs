import assert from 'node:assert/strict';
import {
  parseProspectingArrayName,
  normalizeSovHubPowerState,
  buildSovFieldCatalog,
  summarizeSovFieldCatalog,
} from '../lib/sov-field-catalog.mjs';

assert.deepEqual(parseProspectingArrayName('Mexallon Prospecting Array II'),{mineral:'Mexallon',ore:'Kylixium',tier:2,name:'Mexallon Prospecting Array II'});
assert.deepEqual(parseProspectingArrayName('Pyerite Prospecting Array 3'),{mineral:'Pyerite',ore:'Mordinium',tier:3,name:'Pyerite Prospecting Array 3'});
assert.deepEqual(parseProspectingArrayName('Zydrine 2'),{mineral:'Zydrine',ore:'Hezorime',tier:2,name:'Zydrine 2'});
assert.equal(parseProspectingArrayName('Advanced Logistics Network'),null);
assert.equal(normalizeSovHubPowerState('POWER_STATE_ONLINE'),'online');
assert.equal(normalizeSovHubPowerState('pending'),'pending');
assert.equal(normalizeSovHubPowerState('low power'),'low');

const hubs=[
  {id:9001,solar_system_id:3001},
  {id:9002,solar_system_id:3002},
  {id:9003,solar_system_id:9999},
];
const detailsByHubId=new Map([
  [9001,{upgrades:[
    {type_id:101,power_state:'online'},
    {type_id:102,power_state:'offline'},
    {type_id:103,power_state:'online'},
  ]}],
  [9002,{upgrades:[
    {type_id:104,power_state:'pending'},
    {type_id:105,power_state:'low'},
  ]}],
  [9003,{upgrades:[{type_id:106,power_state:'online'}]}],
]);
const namesById=new Map([
  [3001,'RP2-OQ'],[3002,'APM-6K'],[9999,'OUTSIDE'],
  [101,'Mexallon Prospecting Array III'],
  [102,'Isogen Prospecting Array II'],
  [103,'Advanced Logistics Network'],
  [104,'Megacyte Prospecting Array 2'],
  [105,'Pyerite Prospecting Array III'],
  [106,'Nocxium Prospecting Array III'],
]);
const legacyOres=[
  {name:'Kylixium',upgrade:'Mexallon 3',siteM3:12999073.9,jbvPerM3:243.3728258},
  {name:'Ueganite',upgrade:'Megacyte 3',siteM3:15993152,jbvPerM3:180.9082083},
  {name:'Griemeer',upgrade:'Isogen 3',siteM3:13098666,jbvPerM3:180.4080852},
  {name:'Mordinium',upgrade:'Pyerite 3',siteM3:24997765.3,jbvPerM3:149.8800477},
];
const catalog=buildSovFieldCatalog({
  hubs,detailsByHubId,namesById,legacyOres,
  fountainSystemIds:new Set([3001,3002]),
});
assert.equal(catalog.length,4,'only Fountain T2/T3 Prospecting Arrays should be included');
assert.equal(catalog.filter(row=>row.system==='RP2-OQ').length,2,'multiple mining arrays in one system must remain separate fields');
const kylixium=catalog.find(row=>row.mineral==='Mexallon');
assert.equal(kylixium.tier,3);
assert.equal(kylixium.siteM3,12999073.9);
assert.equal(kylixium.respawnHours,10);
const t2=catalog.find(row=>row.mineral==='Isogen');
assert.equal(t2.tier,2);
assert.equal(t2.siteM3,null,'unknown Tier 2 site volume must not be invented');
assert.equal(t2.respawnHours,null,'Tier 2 respawn must remain unknown until a reliable value is configured');
const summary=summarizeSovFieldCatalog(catalog);
assert.deepEqual(summary,{total:4,tier2:2,tier3:2,online:1,pending:1,offline:1,low:1,other:0,systems:2});
console.log('Sovereignty Hub field catalog tests passed.');
