import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {recordSystemMining,recentSystemMining,RECENT_MINING_MS} from '../lib/system-mining-activity.mjs';
import {redactFieldState} from '../lib/init-field-access.mjs';
import {fieldMiningTargets} from '../lib/field-mining-target.mjs';

const cha2MapFields=[
  {id:'cha2-isogen',system:'CHA2-Q',tier:2,mineral:'Isogen',ore:'Awaiting scan'},
];
assert.deepEqual(fieldMiningTargets({system:'CHA2-Q',typeId:81975,typeName:'Griemeer',t3Definition:{system:'CHA2-Q',ore:'Griemeer'},mapFields:cha2MapFields}),['t3:CHA2-Q'],'CHA2 Griemeer ledger delta targets only its T3 card');
assert.deepEqual(fieldMiningTargets({system:'CHA2-Q',typeId:0,typeName:'Gneiss',t3Definition:{system:'CHA2-Q',ore:'Griemeer'},mapFields:cha2MapFields}),['map:t2|CHA2-Q'],'CHA2 T2 ore targets only the grouped T2 card');
assert.deepEqual(fieldMiningTargets({system:'CHA2-Q',typeId:0,typeName:'Glare Crust',t3Definition:{system:'CHA2-Q',ore:'Griemeer'},mapFields:cha2MapFields,iceSystems:['CHA2-Q'],iceNames:['Glare Crust']}),['ice:CHA2-Q'],'ice ledger delta targets only the ice card');
assert.deepEqual(fieldMiningTargets({system:'CHA2-Q',typeId:0,typeName:'Unknown Ore',t3Definition:{system:'CHA2-Q',ore:'Griemeer'},mapFields:cha2MapFields,iceSystems:['CHA2-Q'],iceNames:['Glare Crust']}),[],'unattributed ore fails closed instead of lighting every CHA2 card');

const snapshots={},activity={},systemCache={'1':{name:'TEST'}};
const start=Date.parse('2026-10-04T12:00:00Z');
function sample(quantity,minutes,characterId='a',date='2026-10-04'){
  recordSystemMining({characterId,rows:[{date,solar_system_id:1,type_id:9,quantity}],snapshots,activity,systemCache,sampleAt:new Date(start+minutes*60000).toISOString()});
}
sample(100,0);assert.deepEqual(activity,{},'initial daily totals are only a baseline');
sample(100,1);assert.deepEqual(activity,{},'unchanged polling does not activate');
sample(110,2);assert.equal(activity.TEST,new Date(start+120000).toISOString());
sample(110,3);assert.equal(activity.TEST,new Date(start+120000).toISOString(),'polling never extends activity');
sample(500,4,'b');assert.equal(activity.TEST,new Date(start+120000).toISOString(),'new toon is a baseline');
sample(109,1);assert.equal(snapshots.a.at,new Date(start+180000).toISOString(),'out-of-order samples ignored');
assert.equal(Object.keys(recentSystemMining(activity,start+120000+RECENT_MINING_MS-1)).length,1);
assert.deepEqual(recentSystemMining(activity,start+120000+RECENT_MINING_MS),{});
assert.deepEqual(recentSystemMining(activity,start),{},'future timestamp cannot activate');
sample(150,60);assert.equal(activity.TEST,new Date(start+120000).toISOString(),'long reconnect gap does not claim recent mining');
sample(160,61);assert.equal(activity.TEST,new Date(start+61*60000).toISOString());
sample(300,24*60,'a','2026-10-05');assert.equal(activity.TEST,new Date(start+61*60000).toISOString(),'new UTC day resets baseline');
assert.deepEqual(redactFieldState({miningActivity:activity},{allowed:false}).miningActivity,{},'non-INIT cannot see system activity');
const window={};let elapsed=0;
const document={createElement:()=>({setAttribute(){},remove(){this._owner._icon=null;}})};
vm.runInNewContext(fs.readFileSync(new URL('../public/field-mining-activity.js',import.meta.url),'utf8'),{window,document,performance:{now:()=>elapsed},Map,String});
assert.equal(window.JlrFieldMiningActivity.recent(new Date(start).toISOString(),start+1),true);
assert.equal(window.JlrFieldMiningActivity.recent(new Date(start).toISOString(),start+RECENT_MINING_MS),false);
function makeCard(system,boardKey){
  return {
    dataset:{system,boardKey},
    _icon:null,
    added:0,
    append(node){node._owner=this;this._icon=node;this.added++;},
    querySelector(selector){return selector==='.mining-activity-icon'?this._icon:null;},
  };
}
const single=makeCard('TEST','t3:TEST');
const singleBoard={querySelectorAll:()=>[single]};
const legacyState={serverNow:new Date(start).toISOString(),miningActivity:{TEST:new Date(start).toISOString()},fieldAccess:{allowed:true},playerLosses:{}};
window.JlrFieldMiningActivity.paint(singleBoard,legacyState);assert.equal(single.added,1,'legacy system activity remains safe for a one-card system');
window.JlrFieldMiningActivity.paint(singleBoard,legacyState);assert.equal(single.added,1,'repaint preserves animated icon');
elapsed=RECENT_MINING_MS;window.JlrFieldMiningActivity.paint(singleBoard,legacyState);assert.equal(single._icon,null,'activity expires even without a new server event');

elapsed=0;
const t3=makeCard('CHA2-Q','t3:CHA2-Q'),t2=makeCard('CHA2-Q','map:t2|CHA2-Q'),ice=makeCard('CHA2-Q','ice:CHA2-Q');
const multiBoard={querySelectorAll:()=>[t3,t2,ice]};
const exactState={serverNow:new Date(start).toISOString(),miningActivity:{'t3:CHA2-Q':new Date(start).toISOString(), 'CHA2-Q':new Date(start).toISOString()},fieldAccess:{allowed:true},playerLosses:{}};
window.JlrFieldMiningActivity.paint(multiBoard,exactState);
assert.equal(t3.added,1,'exact CHA2 T3 target animates');
assert.equal(t2.added,0,'CHA2 T2 card stays idle when T3 ore is mined');
assert.equal(ice.added,0,'CHA2 ice card stays idle when T3 ore is mined');
window.JlrFieldMiningActivity.paint(multiBoard,{...exactState,miningActivity:{'CHA2-Q':new Date(start).toISOString()}});
assert.equal(t3._icon,null,'legacy system-only signal is ignored when CHA2 has multiple cards');
assert.equal(t2._icon,null);
assert.equal(ice._icon,null);
window.JlrFieldMiningActivity.paint(multiBoard,{...exactState,fieldAccess:{allowed:false}});
assert.equal(t3._icon,null);
console.log('System mining now targets exact field cards; CHA2 multi-card false positives are blocked.');
