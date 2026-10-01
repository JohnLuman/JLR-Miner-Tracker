import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { CEO_OPERATION_ROUTES, operationNameIds, normalizeOperations } from '../lib/ceo-operations.mjs';

const names=new Map([[10,'Container'],[11,'Ore'],[12,'Blueprint'],[60000001,'Station'],[2110000001,'Pilot']]);
const assets=normalizeOperations('assets',[
  {item_id:1000000000001,type_id:10,location_id:60000001,location_flag:'CorpSAG1',quantity:1},
  {item_id:1000000000002,type_id:11,location_id:1000000000001,location_flag:'Cargo',quantity:25},
  {item_id:1000000000003,type_id:11,location_id:1000000000001,location_flag:'Cargo',quantity:75},
  {item_id:1000000000004,type_id:12,location_id:60000001,location_flag:'CorpSAG1',quantity:-2},
],names);
assert.equal(assets.records.find(row=>row.name==='Ore').quantity,100);
assert.equal(assets.records.find(row=>row.name==='Ore').location,'Station');
assert.equal(assets.records.find(row=>row.name==='Blueprint').quantity,1,'Blueprint copy is one item, not negative quantity');
assert.equal(assets.records.find(row=>row.name==='Blueprint').blueprintCopy,true);
assert.equal(assets.summary.units,102);
const cycle=normalizeOperations('assets',[{item_id:1,type_id:11,location_id:2,quantity:1},{item_id:2,type_id:10,location_id:1,quantity:1}],names);
assert.ok(cycle.records.every(row=>row.unresolvedLocation),'Container cycles terminate and remain explicit');
const missing=normalizeOperations('assets',[{item_id:1,type_id:11,location_id:60000001,quantity:null}],names);
assert.equal(missing.summary.missingQuantity,1);
assert.ok(operationNameIds('jobs',[{installer_id:2110000001,station_id:1000000000001,product_type_id:11}]).includes(2110000001),'Modern character IDs can be resolved');
assert.ok(!operationNameIds('jobs',[{station_id:1000000000001}]).includes(1000000000001),'Structure IDs are not sent to universe names');
const orders=normalizeOperations('orders',[{order_id:1,type_id:11,price:5,volume_remain:10,is_buy_order:true},{order_id:2,type_id:11,price:7,volume_remain:3,is_buy_order:false},{order_id:3,type_id:11,price:null,volume_remain:4}],names);
assert.equal(orders.summary.buyValue,50);assert.equal(orders.summary.sellValue,21);assert.equal(orders.summary.missingValue,1);
const jobs=normalizeOperations('jobs',[{job_id:1,product_type_id:11,installer_id:2110000001,status:'active',runs:5},{job_id:2,status:'ready',runs:1}],names);
assert.equal(jobs.summary.active,1);assert.equal(jobs.summary.ready,1);assert.equal(jobs.records[0].installer,'Pilot');
const contracts=normalizeOperations('contracts',[{contract_id:1,status:'outstanding',type:'courier',reward:50,collateral:500},{contract_id:2,status:'in_progress'}],names);
assert.equal(contracts.summary.outstanding,1);assert.equal(contracts.summary.inProgress,1);assert.equal(contracts.records[0].collateral,500);

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const start=server.indexOf('async function ceoOperationsSnapshot('),end=server.indexOf('\nfunction sameOrigin',start);
let fail=false,calls=0;const urls=[];
const ctx={ceoOperationsCache:new Map(),CEO_OPERATION_ROUTES,operationNameIds,normalizeOperations,Date,Object,console:{info(){}},now:()=>new Date().toISOString(),ceoAccessToken:async()=>({access:'fixture-token',admin:{corporationId:1}}),save:async()=>{},resolveUniverseNames:async()=>names,ceoPagedGet:async(url,token,options)=>{calls++;urls.push(url);assert.equal(token,'fixture-token');if(fail)throw Error('ESI unavailable');assert.equal(options.maxPages,url.includes('/assets/')?50:20);return {rows:[{item_id:1,type_id:11,location_id:60000001,quantity:2}],truncated:true,pagesFetched:2,reportedPages:3};}};
vm.createContext(ctx);vm.runInContext(server.slice(start,end),ctx);
const [a,b]=await Promise.all([ctx.ceoOperationsSnapshot('assets'),ctx.ceoOperationsSnapshot('assets')]);
assert.equal(calls,1,'Concurrent calls share one section pull');assert.equal(a,b);assert.equal(a.truncated,true);
await ctx.ceoOperationsSnapshot('assets');assert.equal(calls,1,'Cached pulls avoid duplicate requests');
await ctx.ceoOperationsSnapshot('jobs');assert.equal(calls,2,'Sections have independent caches');assert.ok(urls.at(-1).includes('include_completed=true'));
fail=true;const stale=await ctx.ceoOperationsSnapshot('assets',{force:true});
assert.equal(stale.available,false);assert.equal(stale.stale,true);assert.equal(stale.records.length,1);assert.equal(stale.pagesFetched,2);
assert.ok(!JSON.stringify(stale).includes('fixture-token'),'Access tokens never enter API output');
await assert.rejects(()=>ctx.ceoOperationsSnapshot('toString'));
const routeStart=server.indexOf("  if(req.method==='GET'&&url.pathname==='/api/ceo/operations'){");
const routeEnd=server.indexOf('\n  if(',routeStart+5);const route=server.slice(routeStart,routeEnd);
for(const allowed of [false,true]){let pulls=0;const rctx={req:{method:'GET'},res:{},url:new URL('https://example.test/api/ceo/operations?section=orders'),Object,CEO_OPERATION_ROUTES,requireCeoViewer:()=>allowed,json(){},ceoOperationsSnapshot:async()=>{pulls++;return{};}};vm.createContext(rctx);await vm.runInContext('(async()=>{'+route+'})()',rctx);assert.equal(pulls,allowed?1:0,'Private reader is guarded before pulling data');}

const elements=new Map(),listeners=new Map();
const get=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',classList:{toggle(){}},setAttribute(){}});return elements.get(id);};
const records=Array.from({length:101},(_,i)=>({name:'Ore '+String(i).padStart(3,'0'),quantity:i,location:'Station',storage:'CorpSAG1',stacks:1,typeId:11,locationId:60000001}));
const browser={window:{},document:{getElementById:get,querySelectorAll:()=>[],addEventListener:(type,callback)=>listeners.set(type,callback)},fetch:async()=>({ok:true,json:async()=>({available:true,records,summary:{groups:101,stacks:101,units:5050},updatedAt:'2026-10-01T00:00:00Z'})})};
vm.createContext(browser);vm.runInContext(fs.readFileSync(new URL('../public/ceo-operations.js',import.meta.url),'utf8'),browser);
await browser.window.JlrCeoOperations.load();
assert.equal((get('ceoOperationRecords').innerHTML.match(/<details/g)||[]).length,50,'Large results are paged');
assert.match(get('ceoOperationCount').textContent,/1–50 of 101/);
listeners.get('click')({target:{closest:selector=>selector==='#ceoOperationNext'?{}:null}});
assert.match(get('ceoOperationCount').textContent,/51–100/);
get('ceoOperationSearch').value='Ore 100';listeners.get('input')({target:{id:'ceoOperationSearch'}});
assert.match(get('ceoOperationCount').textContent,/1–1 of 1/);
const selected=browser.window.JlrCeoOperations.select([{name:'x',price:5,remaining:10,side:'BUY'},{name:'y',price:10,remaining:2,side:'SELL'}],{kind:'orders',sort:'amount'});
assert.equal(selected[0].name,'x','Order sorting uses remaining value, not unit price');
browser.fetch=async()=>{throw Error('Network unavailable');};await browser.window.JlrCeoOperations.load(true);
assert.match(get('ceoOperationStamp').textContent,/STALE/);assert.match(get('ceoOperationWarning').textContent,/Previous results/);
console.log('CEO operations normalization, cache/failure handling, private access, search and pagination passed.');
