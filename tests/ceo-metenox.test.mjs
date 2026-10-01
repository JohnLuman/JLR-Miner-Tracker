import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {metenoxRows,validateMetenoxProfile,FUEL_BLOCK_NAMES} from '../lib/ceo-metenox.mjs';
const structure={structureId:55,typeId:81826,type:'Metenox Moon Drill',fuelHours:240};
const assets=[{locationId:55,name:'Magmatic Gas',quantity:4800},{locationId:55,name:'Helium Fuel Block',quantity:120},{locationId:99,name:'Magmatic Gas',quantity:999999},{locationId:55,name:'Magmatic Gas',quantity:99999,unresolvedLocation:true}];
const options={assetsAvailable:true,prices:{'Magmatic Gas':1000,'Helium Fuel Block':20000},profiles:{55:{revenue30Days:5000000000,taxPct:10,overhead30Days:100000000,gasUnits:10}}};
const [row]=metenoxRows([structure,{structureId:99,typeId:35835,type:'Athanor'}],assets,options);
assert.equal(row.gasUnits,4800,'Only matched, resolved structure assets are counted');
assert.equal(row.gasSource,'esi','Current ESI supersedes manual stock');
assert.equal(row.gasCoverageDays,1);
assert.equal(row.fuelStockCoverageDays,1);
assert.equal(row.operatingCost30Days,216000000);
assert.equal(row.profit30Days,4184000000,'Net deducts fuel, gas, tax and overhead');
assert.equal(metenoxRows([structure],[],options)[0].reportedFuelBlocks,null,'Absent fuel rows are not zero');
assert.equal(metenoxRows([structure],[],options)[0].gasSource,'manual');
const unknown=metenoxRows([structure],[],{assetsAvailable:true})[0];
assert.equal(unknown.gasUnits,null);assert.equal(unknown.profit30Days,null);
assert.equal(metenoxRows([structure],assets,{...options,assetsAvailable:false})[0].reportedGasUnits,null,'Failed asset pulls cannot claim current stock');
assert.equal(metenoxRows([structure],assets,{...options,prices:{}})[0].profit30Days,null,'Missing prices cannot produce false profit');
assert.equal(metenoxRows([structure],assets,{...options,profiles:{55:{revenue30Days:0}}})[0].profit30Days,-216000000,'Zero expected revenue is a legitimate loss');
const profile=validateMetenoxProfile({structureId:'55',revenue30Days:'0',gasUnits:'',taxPct:'10',fuelType:FUEL_BLOCK_NAMES[0]});
assert.equal(profile.revenue30Days,0);assert.equal(profile.gasUnits,null);
for(const body of [{structureId:'no'},{structureId:55,taxPct:101},{structureId:55,gasUnits:-1},{structureId:55,revenue30Days:'NaN'},{structureId:55,fuelType:'bad'}])assert.throws(()=>validateMetenoxProfile(body));
const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const start=source.indexOf("  if(req.method==='POST'&&url.pathname==='/api/ceo/metenox/profile'){");
const end=source.indexOf('\n  if(',start+5);
for(const allowed of [false,true]){
  let reads=0,saves=0,result;
  const context={req:{method:'POST'},res:{},url:new URL('https://example.test/api/ceo/metenox/profile'),requireCeoViewer:()=>allowed?{user:{}}:null,readBody:async()=>{reads++;return {structureId:55,revenue30Days:1};},validateMetenoxProfile,ceoMoonSnapshot:async()=>({live:{available:true},metenox:{records:[structure]}}),state:{ceoAdmin:{}},now:()=>new Date().toISOString(),save:async()=>{saves++;},ceoStructuresCache:{at:1},json:(res,status,data)=>result={status,data}};
  vm.createContext(context);await vm.runInContext('(async()=>{'+source.slice(start,end)+'})()',context);
  assert.equal(reads,allowed?1:0);assert.equal(saves,allowed?1:0);
  if(allowed){assert.equal(result.status,200);assert.equal(context.ceoStructuresCache.at,0);}
}
console.log('Metenox stock matching, missing data, gas coverage, current-cost profit and private profile validation passed.');
