import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import { decodeMoonBaseline, structureRows } from '../lib/ceo-moons.mjs';

const encode=data=>gzipSync(JSON.stringify(data)).toString('base64');
const fixture={source:'Admin.xlsx',sourceDate:'2024-11-19',records:[
  {name:'Alpha moon',system:'A-TEST',composition:[{name:'Otavite',fraction:.3}],estimates:{dailyBuy:10,dailySell:20,buy28Days:280,sell28Days:560},sourceRow:2,estimateRow:62},
  {name:'Beta moon',system:'B-TEST',composition:[],estimates:{dailyBuy:0,dailySell:null,buy28Days:0,sell28Days:null},sourceRow:3,estimateRow:63},
]};
const baseline=decodeMoonBaseline(encode(fixture));
assert.equal(baseline.records.length,2);
assert.equal(baseline.totals.dailyBuy.value,10);
assert.equal(baseline.totals.dailySell.missing,1,'Missing price remains visible, distinct from zero');
assert.equal(baseline.records[1].estimates.dailyBuy,0);
assert.equal(baseline.sourceDate,'2024-11-19');
assert.equal(decodeMoonBaseline('broken').available,false);
assert.equal(decodeMoonBaseline('').available,false);
assert.equal(decodeMoonBaseline(encode({...fixture,records:[fixture.records[0],fixture.records[0]]})).available,false,'Repeated moon cannot inflate totals');

const at=Date.parse('2026-10-01T00:00:00Z');
const structures=structureRows([
  {structure_id:1000000000001,system_id:1,type_id:2,fuel_expires:'2026-10-02T00:00:00Z',services:[{name:'Reprocessing',state:'online'}]},
  {structure_id:1000000000002,system_id:1,type_id:2,fuel_expires:'2026-09-30T00:00:00Z'},
  {structure_id:1000000000003,system_id:1,type_id:2},
  {structure_id:1000000000004,system_id:1,type_id:2,fuel_expires:'2026-10-10T00:00:00Z'},
],new Map([[1,'A-TEST'],[2,'Athanor']]),at);
assert.equal(structures[0].fuelStatus,'EXPIRED');
assert.equal(structures[1].fuelStatus,'LOW');
assert.equal(structures[2].fuelStatus,'OK');
assert.equal(structures[3].fuelStatus,'UNKNOWN');
assert.equal(structures[3].fuelHours,null);
assert.equal(structures[1].system,'A-TEST');

const elements=new Map();
const get=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',textContent:'',classList:{toggle(){},remove(){}}});return elements.get(id);};
const browser={document:{getElementById:get,addEventListener(){}},window:{},fetch:async()=>({ok:true,json:async()=>({baseline,live:{available:false,records:[],error:'ESI unavailable'}})})};
vm.createContext(browser);vm.runInContext(fs.readFileSync(new URL('../public/ceo-moons.js',import.meta.url),'utf8'),browser);
const select=browser.window.JlrCeoMoons.selectRecords;
assert.equal(select(baseline.records,{query:'otavite'}).length,1);
assert.equal(select(baseline.records,{system:'B-TEST'})[0].name,'Beta moon');
assert.equal(select(baseline.records,{sort:'sell'})[0].name,'Alpha moon');
await browser.window.JlrCeoMoons.load();
assert.match(get('ceoMoonSource').textContent,/historical estimates/);
assert.match(get('ceoMoonRecords').innerHTML,/Unavailable/);
assert.match(get('ceoStructuresWarning').textContent,/ESI unavailable/);
assert.match(get('ceoMoonRecords').innerHTML,/Alpha moon/,'Baseline stays usable when live ESI fails');

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const start=server.indexOf("  if(req.method==='GET'&&url.pathname==='/api/ceo/moons'){");
const end=server.indexOf('\n  if(',start+5);
const route=server.slice(start,end);
for(const allowed of [false,true]){
  let calls=0,payload;
  const context={req:{method:'GET'},res:{},url:new URL('https://example.test/api/ceo/moons?force=1'),requireCeoViewer:()=>allowed,ceoMoonSnapshot:async({force})=>{assert.equal(force,true);calls++;return {baseline};},json:(res,status,data)=>payload={status,data}};
  vm.createContext(context);await vm.runInContext('(async()=>{'+route+'})()',context);
  assert.equal(calls,allowed?1:0,'CEO guard executes before accessing private baseline');
  if(allowed)assert.equal(payload.status,200);
}
console.log('CEO moon baseline, missing values, fuel status, search and private endpoint tests passed.');

const upkeep=[...structures,{structureId:55,system:'B-TEST',type:'Fortizar',fuelStatus:'OK',fuelHours:200,services:[{name:'Market',state:'offline'}]}];
const selectStructures=browser.window.JlrCeoMoons.selectStructures;
assert.equal(selectStructures(upkeep,{filter:'fuel'}).length,2);
assert.equal(selectStructures(upkeep,{filter:'unknown'})[0].fuelStatus,'UNKNOWN');
assert.equal(selectStructures(upkeep,{filter:'offline'})[0].structureId,55);
assert.equal(selectStructures(upkeep,{query:'market'})[0].structureId,55);
assert.equal(selectStructures(upkeep,{query:'1000000000001'})[0].fuelStatus,'LOW');
assert.equal(selectStructures(upkeep)[0].fuelStatus,'EXPIRED');
assert.equal(upkeep[0].structureId,structures[0].structureId,'Filtering does not mutate the source');
browser.fetch=async()=>({ok:true,json:async()=>({baseline,live:{available:true,updatedAt:'2026-10-01T00:00:00Z',records:upkeep}})});
await browser.window.JlrCeoMoons.load(true);
assert.match(get('ceoStructureSummary').textContent,/5 structures/);
assert.match(get('ceoStructureSummary').textContent,/1 with offline services/);
get('ceoStructureFilter').value='offline';browser.window.JlrCeoMoons.render();
assert.match(get('ceoLiveStructures').innerHTML,/Fortizar/);
assert.doesNotMatch(get('ceoLiveStructures').innerHTML,/Athanor/);
assert.match(get('ceoStructureCount').textContent,/1 of 5/);
get('ceoStructureSearch').value='no-match';browser.window.JlrCeoMoons.render();
assert.match(get('ceoLiveStructures').innerHTML,/No structures match/);
get('ceoStructureSearch').value='';browser.fetch=async()=>{throw new Error('Connection failed');};
await browser.window.JlrCeoMoons.load(true);
assert.match(get('ceoStructuresStamp').textContent,/LAST SUCCESSFUL PULL/);
assert.match(get('ceoStructuresWarning').textContent,/Connection failed/);
assert.match(get('ceoLiveStructures').innerHTML,/Fortizar/);
console.log('CEO structure upkeep filters, counts, preserved results and stale timestamps passed.');
