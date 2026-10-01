import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ceoDataHealth } from '../lib/ceo-health.mjs';
const at=Date.parse('2026-10-01T00:00:00Z');
const good={available:true,updatedAt:new Date(at).toISOString(),records:[]};
const base={connected:true,walletGranted:false,baseline:{available:true,sourceDate:'2024-11-19',records:[{}]},at};
let result=ceoDataHealth(base);
assert.equal(result.rows.find(row=>row.id==='wallet').status,'permission');
assert.equal(result.unpulled,7);
assert.equal(result.attention,1);
assert.equal(result.rows.find(row=>row.id==='baseline').status,'saved');
result=ceoDataHealth({...base,finance:{generatedAt:good.updatedAt,errors:[{section:'membertracking',message:'Denied'}],members:{count:12,tracking:[]}},structures:{...good,error:'ESI failed',available:false},operations:{assets:good,jobs:{...good,truncated:true},contracts:{...good,updatedAt:new Date(at-360000).toISOString()},orders:{available:false,error:'Denied'}},pending:{assets:true}});
const status=id=>result.rows.find(row=>row.id===id).status;
assert.equal(status('members'),'pulled');assert.equal(status('tracking'),'failed');
assert.equal(status('structures'),'stale');assert.equal(status('assets'),'loading');
assert.equal(status('jobs'),'partial');assert.equal(status('contracts'),'older');assert.equal(status('orders'),'failed');
assert.equal(result.rows.find(row=>row.id==='members').count,12);
assert.equal(ceoDataHealth({...base,walletGranted:true,walletPull:good}).rows.find(row=>row.id==='wallet').status,'pulled');
assert.equal(ceoDataHealth({...base,upgradeRequired:true,operations:{assets:good}}).rows.find(row=>row.id==='assets').status,'permission');
assert.equal(ceoDataHealth({...base,connected:false,operations:{assets:good}}).rows.find(row=>row.id==='assets').status,'disconnected');
assert.equal(ceoDataHealth({...base,baseline:null}).rows.at(-1).status,'missing');

const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const start=source.indexOf("  if(req.method==='GET'&&url.pathname==='/api/ceo/health'){");
const end=source.indexOf('\n  if(',start+5);
for(const allowed of [false,true]){
  let calls=0,payload;
  const context={req:{method:'GET'},res:{},url:new URL('https://example.test/api/ceo/health'),requireCeoViewer:()=>allowed?{user:{}}:null,ceoStatusForUser:()=>({connected:true,walletScopeGranted:false}),ceoDataHealth:args=>{calls++;return ceoDataHealth(args);},ceoFinanceCache:{data:null},ceoStructuresCache:{data:null},ceoOperationsCache:new Map([['assets',{data:good}]]),state:{ceoAdmin:{}},discordLive:{status:'not-configured',connected:false},CEO_MOON_BASELINE:base.baseline,json:(res,status,data)=>payload={status,data}};
  vm.createContext(context);await vm.runInContext('(async()=>{'+source.slice(start,end)+'})()',context);
  assert.equal(calls,allowed?1:0,'Private guard precedes cache inspection');
  if(allowed){assert.equal(payload.status,200);assert.equal(payload.data.rows.find(row=>row.id==='assets').count,0);}
}
assert.doesNotMatch(source.slice(start,end),/esiGet|ceoAccessToken|ceoFinanceSnapshot|ceoMoonSnapshot|ceoOperationsSnapshot/,'Status inspection cannot trigger ESI pulls');

const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:''});return elements.get(id);};
const pending=[];
const browser={window:{},document:{getElementById:$,addEventListener(){}},fetch:()=>new Promise(resolve=>pending.push(resolve)),setTimeout,clearTimeout};
vm.createContext(browser);vm.runInContext(fs.readFileSync(new URL('../public/ceo-health.js',import.meta.url),'utf8'),browser);
const old=browser.window.JlrCeoHealth.load(),latest=browser.window.JlrCeoHealth.load();
pending[1]({ok:true,json:async()=>({...result,rows:[{id:'assets',name:'<Assets>',status:'partial',note:'<unsafe>',count:2,updatedAt:good.updatedAt}]})});await latest;
pending[0]({ok:true,json:async()=>({...result,rows:[]})});await old;
assert.match($('ceoHealthRows').innerHTML,/PARTIAL RESULTS/);assert.match($('ceoHealthRows').innerHTML,/&lt;unsafe&gt;/);assert.doesNotMatch($('ceoHealthRows').innerHTML,/<unsafe>/);
const denied=browser.window.JlrCeoHealth.load();pending[2]({ok:false,status:403});await denied;
assert.match($('ceoHealthRows').innerHTML,/restricted/);assert.doesNotMatch($('ceoHealthRows').innerHTML,/Assets/);
console.log('CEO data health status precedence, private access, no extra ESI, rendering and request ordering passed.');
