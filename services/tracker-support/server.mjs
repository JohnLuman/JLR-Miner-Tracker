import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {TrackerSessionStore,appraisalCompressionCandidateName,appraisalSelectedValue,appraisalIntelTargets,summarizeAppraisalMarketHistory} from './core.mjs';
import {JlrSdeCatalog,sdeCompressionCandidate} from './sde-catalog.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Math.max(1,Number(process.env.PORT)||3191);
const SHARED_SECRET=String(process.env.TRACKER_SUPPORT_SHARED_SECRET||'').trim();
const STATE_FILE=String(process.env.TRACKER_SUPPORT_STATE_FILE||path.join(__dirname,'data','sessions.json')).trim();
const SESSION_TTL_MS=Math.max(60_000,Number(process.env.TRACKER_SUPPORT_SESSION_TTL_MS)||12*60*60*1000);
const FOCUS_TTL_MS=Math.max(60_000,Number(process.env.TRACKER_SUPPORT_FOCUS_TTL_MS)||30*60*1000);
const MAX_SESSIONS=Math.max(100,Number(process.env.TRACKER_SUPPORT_MAX_SESSIONS)||5000);
const MAIN_APP_URL=String(process.env.TRACKER_SUPPORT_MAIN_URL||'http://JLR-Miner-Tracker.railway.internal:8080').trim().replace(/\/+$/,'');
const APPRAISAL_INTEL_CACHE_TTL_MS=Math.max(30_000,Number(process.env.TRACKER_SUPPORT_APPRAISAL_CACHE_MS)||5*60*1000);
const APPRAISAL_HISTORY_CACHE_TTL_MS=Math.max(60_000,Number(process.env.TRACKER_SUPPORT_MARKET_HISTORY_CACHE_MS)||30*60*1000);
const APPRAISAL_MAIN_TIMEOUT_MS=Math.max(2_000,Number(process.env.TRACKER_SUPPORT_APPRAISAL_MAIN_TIMEOUT_MS)||8_000);
const APPRAISAL_ESI_TIMEOUT_MS=Math.max(2_000,Number(process.env.TRACKER_SUPPORT_APPRAISAL_ESI_TIMEOUT_MS)||6_000);
const APPRAISAL_MAX_ITEMS=80;
const APPRAISAL_HISTORY_LIMIT=10;
const APPRAISAL_PRICE_FRESH_MS=Math.max(60_000,Number(process.env.TRACKER_SUPPORT_APPRAISAL_PRICE_FRESH_MS)||5*60*1000);
const APPRAISAL_PRICE_RETAIN_MS=Math.max(APPRAISAL_PRICE_FRESH_MS,Number(process.env.TRACKER_SUPPORT_APPRAISAL_PRICE_RETAIN_MS)||72*60*60*1000);
const APPRAISAL_PRICE_FILE=String(process.env.TRACKER_SUPPORT_APPRAISAL_PRICE_FILE||path.join(path.dirname(STATE_FILE),'appraisal-price-snapshots.json')).trim();
const SDE_DB_FILE=String(process.env.TRACKER_SUPPORT_SDE_DB_FILE||path.join(path.dirname(STATE_FILE),'jlr-sde.sqlite')).trim();
const SDE_IMPORTER_FILE=String(process.env.TRACKER_SUPPORT_SDE_IMPORTER_FILE||path.join(__dirname,'sde_import.py')).trim();
const SDE_PYTHON=String(process.env.TRACKER_SUPPORT_SDE_PYTHON||'python3').trim();
const SDE_REFRESH_MS=Math.max(60*60*1000,Number(process.env.TRACKER_SUPPORT_SDE_REFRESH_MS)||6*60*60*1000);
const SDE_REFRESH_TIMEOUT_MS=Math.max(60_000,Number(process.env.TRACKER_SUPPORT_SDE_REFRESH_TIMEOUT_MS)||8*60*1000);
const appraisalIntelCache=new Map();
const appraisalHistoryCache=new Map();
const appraisalPriceSnapshots=new Map();
let appraisalPriceSaveTimer=null;

if(SHARED_SECRET.length<24){
  console.error('TRACKER_SUPPORT_SHARED_SECRET must be set to a random value of at least 24 characters.');
  process.exit(1);
}

const store=new TrackerSessionStore({ttlMs:SESSION_TTL_MS,focusTtlMs:FOCUS_TTL_MS,maxSessions:MAX_SESSIONS});
const sdeCatalog=new JlrSdeCatalog({dbFile:SDE_DB_FILE});
const sdeRefreshState={
  running:false,
  lastCheckedAt:null,
  lastSuccessAt:null,
  lastUpdated:false,
  lastError:null,
};
let saveTimer=null;
let sdeStartupTimer=null;
let sdePeriodicTimer=null;

function json(res,status,body){
  const raw=JSON.stringify(body);
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'content-length':Buffer.byteLength(raw),
  });
  res.end(raw);
}
function authorized(req){
  const raw=String(req.headers.authorization||'');
  const match=raw.match(/^Bearer\s+(.+)$/i);
  if(!match)return false;
  const supplied=Buffer.from(match[1].trim());
  const expected=Buffer.from(SHARED_SECRET);
  return supplied.length===expected.length&&crypto.timingSafeEqual(supplied,expected);
}
async function readBody(req,max=20_000){
  return await new Promise((resolve,reject)=>{
    let size=0;const chunks=[];
    req.on('data',chunk=>{
      size+=chunk.length;
      if(size>max){reject(new Error('REQUEST_TOO_LARGE'));req.destroy();return;}
      chunks.push(chunk);
    });
    req.on('end',()=>{
      if(!chunks.length)return resolve({});
      try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}
      catch{reject(new Error('INVALID_JSON'))}
    });
    req.on('error',reject);
  });
}
async function loadState(){
  if(!STATE_FILE)return;
  try{
    const raw=await fsp.readFile(STATE_FILE,'utf8');
    store.importState(JSON.parse(raw));
    console.log('Loaded '+store.size+' Tracker support sessions.');
  }catch(error){
    if(error?.code!=='ENOENT')console.warn('Tracker support state load failed:',String(error?.message||error));
  }
}
async function saveState(){
  if(!STATE_FILE)return;
  await fsp.mkdir(path.dirname(STATE_FILE),{recursive:true});
  const tmp=STATE_FILE+'.tmp';
  await fsp.writeFile(tmp,JSON.stringify(store.exportState()),'utf8');
  await fsp.rename(tmp,STATE_FILE);
}
function scheduleSave(){
  if(!STATE_FILE||saveTimer)return;
  saveTimer=setTimeout(()=>{
    saveTimer=null;
    saveState().catch(error=>console.warn('Tracker support state save failed:',String(error?.message||error)));
  },1000);
  saveTimer.unref?.();
}
function appraisalPriceSnapshotKey(marketId,variant,typeId){
  const market=Math.floor(Number(marketId)||0);
  const type=Math.floor(Number(typeId)||0);
  const mode=String(variant||'immediate').toLowerCase()==='top5percent'?'top5percent':'immediate';
  return market+':'+mode+':'+type;
}
function sanitizeAppraisalPriceSnapshot(input){
  const marketId=Math.floor(Number(input?.marketId)||0);
  const typeId=Math.floor(Number(input?.typeId)||0);
  if(!marketId||!typeId)return null;
  const variant=String(input?.variant||'immediate').toLowerCase()==='top5percent'?'top5percent':'immediate';
  const fetchedAtRaw=String(input?.fetchedAt||new Date().toISOString());
  const fetchedAtMs=Date.parse(fetchedAtRaw);
  if(!Number.isFinite(fetchedAtMs))return null;
  const nonNegative=value=>Math.max(0,Number(value)||0);
  return{
    marketId,
    marketName:String(input?.marketName||'').trim().slice(0,120),
    typeId,
    typeName:String(input?.typeName||'').trim().slice(0,180),
    variant,
    buy:nonNegative(input?.buy),
    split:nonNegative(input?.split),
    sell:nonNegative(input?.sell),
    buyOrderCount:Math.max(0,Math.floor(Number(input?.buyOrderCount)||0)),
    sellOrderCount:Math.max(0,Math.floor(Number(input?.sellOrderCount)||0)),
    buyVolume:nonNegative(input?.buyVolume),
    sellVolume:nonNegative(input?.sellVolume),
    fetchedAt:new Date(fetchedAtMs).toISOString(),
    source:String(input?.source||'jlr-native-esi').trim().slice(0,40)||'jlr-native-esi',
  };
}
function pruneAppraisalPriceSnapshots(){
  const cutoff=Date.now()-APPRAISAL_PRICE_RETAIN_MS;
  for(const [key,row] of appraisalPriceSnapshots){
    const fetched=Date.parse(row?.fetchedAt||'');
    if(!Number.isFinite(fetched)||fetched<cutoff)appraisalPriceSnapshots.delete(key);
  }
  if(appraisalPriceSnapshots.size<=10_000)return;
  const rows=[...appraisalPriceSnapshots.entries()].sort((a,b)=>Date.parse(a[1]?.fetchedAt||0)-Date.parse(b[1]?.fetchedAt||0));
  for(const [key] of rows.slice(0,appraisalPriceSnapshots.size-10_000))appraisalPriceSnapshots.delete(key);
}
async function loadAppraisalPriceSnapshots(){
  if(!APPRAISAL_PRICE_FILE)return;
  try{
    const parsed=JSON.parse(await fsp.readFile(APPRAISAL_PRICE_FILE,'utf8'));
    const rows=Array.isArray(parsed?.snapshots)?parsed.snapshots:[];
    for(const raw of rows){
      const row=sanitizeAppraisalPriceSnapshot(raw);
      if(row)appraisalPriceSnapshots.set(appraisalPriceSnapshotKey(row.marketId,row.variant,row.typeId),row);
    }
    pruneAppraisalPriceSnapshots();
    console.log('Loaded '+appraisalPriceSnapshots.size+' persistent Appraisal price snapshots.');
  }catch(error){
    if(error?.code!=='ENOENT')console.warn('Appraisal price snapshot load failed:',String(error?.message||error));
  }
}
async function saveAppraisalPriceSnapshots(){
  if(!APPRAISAL_PRICE_FILE)return;
  pruneAppraisalPriceSnapshots();
  await fsp.mkdir(path.dirname(APPRAISAL_PRICE_FILE),{recursive:true});
  const tmp=APPRAISAL_PRICE_FILE+'.tmp';
  const payload={
    version:1,
    savedAt:new Date().toISOString(),
    freshMs:APPRAISAL_PRICE_FRESH_MS,
    retainMs:APPRAISAL_PRICE_RETAIN_MS,
    snapshots:[...appraisalPriceSnapshots.values()],
  };
  await fsp.writeFile(tmp,JSON.stringify(payload),'utf8');
  await fsp.rename(tmp,APPRAISAL_PRICE_FILE);
}
function scheduleAppraisalPriceSave(){
  if(!APPRAISAL_PRICE_FILE||appraisalPriceSaveTimer)return;
  appraisalPriceSaveTimer=setTimeout(()=>{
    appraisalPriceSaveTimer=null;
    saveAppraisalPriceSnapshots().catch(error=>console.warn('Appraisal price snapshot save failed:',String(error?.message||error)));
  },750);
  appraisalPriceSaveTimer.unref?.();
}
function appraisalPriceSnapshotView(row){
  if(!row)return null;
  const fetchedMs=Date.parse(row.fetchedAt||'');
  if(!Number.isFinite(fetchedMs))return null;
  const ageMs=Math.max(0,Date.now()-fetchedMs);
  if(ageMs>APPRAISAL_PRICE_RETAIN_MS)return null;
  return{
    ...row,
    ageMs,
    stale:ageMs>APPRAISAL_PRICE_FRESH_MS,
    freshMs:APPRAISAL_PRICE_FRESH_MS,
    retainMs:APPRAISAL_PRICE_RETAIN_MS,
  };
}
function getAppraisalPriceSnapshots(body){
  pruneAppraisalPriceSnapshots();
  const marketId=Math.floor(Number(body?.marketId)||0);
  const variant=String(body?.variant||'immediate').toLowerCase()==='top5percent'?'top5percent':'immediate';
  const ids=[...new Set((Array.isArray(body?.typeIds)?body.typeIds:[])
    .map(value=>Math.floor(Number(value)||0)).filter(value=>value>0))].slice(0,250);
  const snapshots=[];
  for(const typeId of ids){
    const row=appraisalPriceSnapshotView(appraisalPriceSnapshots.get(appraisalPriceSnapshotKey(marketId,variant,typeId)));
    if(row)snapshots.push(row);
  }
  return{
    marketId,variant,
    freshMs:APPRAISAL_PRICE_FRESH_MS,
    retainMs:APPRAISAL_PRICE_RETAIN_MS,
    snapshots,
  };
}
function putAppraisalPriceSnapshots(body){
  const rows=(Array.isArray(body?.snapshots)?body.snapshots:[]).slice(0,250);
  let accepted=0;
  for(const raw of rows){
    const row=sanitizeAppraisalPriceSnapshot(raw);
    if(!row)continue;
    appraisalPriceSnapshots.set(appraisalPriceSnapshotKey(row.marketId,row.variant,row.typeId),row);
    accepted++;
  }
  pruneAppraisalPriceSnapshots();
  if(accepted)scheduleAppraisalPriceSave();
  return{ok:true,accepted,total:appraisalPriceSnapshots.size};
}

function validUserKey(value){
  const key=String(value||'').trim();
  return /^[a-f0-9]{32,64}$/i.test(key)?key:'';
}
function sdeRuntimeStatus(){
  return sdeCatalog.status({
    refreshRunning:sdeRefreshState.running,
    lastCheckedAt:sdeRefreshState.lastCheckedAt,
    lastSuccessAt:sdeRefreshState.lastSuccessAt,
    lastUpdated:Boolean(sdeRefreshState.lastUpdated),
    lastError:sdeRefreshState.lastError,
    refreshMs:SDE_REFRESH_MS,
  });
}
async function refreshSdeCatalog({force=false}={}){
  if(sdeRefreshState.running)return sdeRuntimeStatus();
  sdeRefreshState.running=true;
  sdeRefreshState.lastCheckedAt=new Date().toISOString();
  sdeRefreshState.lastError=null;
  try{
    const args=[SDE_IMPORTER_FILE,'--db',SDE_DB_FILE];
    if(force)args.push('--force');
    const result=await new Promise((resolve,reject)=>{
      execFile(SDE_PYTHON,args,{
        timeout:SDE_REFRESH_TIMEOUT_MS,
        maxBuffer:4*1024*1024,
        env:{...process.env,PYTHONUNBUFFERED:'1'},
      },(error,stdout,stderr)=>{
        if(error){
          const detail=String(stderr||stdout||error.message||error).trim().slice(-1800);
          reject(new Error(detail||String(error.message||error)));
          return;
        }
        const lines=String(stdout||'').trim().split(/\r?\n/).filter(Boolean);
        let parsed=null;
        for(let i=lines.length-1;i>=0;i--){
          try{parsed=JSON.parse(lines[i]);break}catch{}
        }
        resolve(parsed||{ok:true,updated:false});
      });
    });
    sdeRefreshState.lastSuccessAt=new Date().toISOString();
    sdeRefreshState.lastUpdated=Boolean(result?.updated);
    console.log('JLR SDE catalog '+(result?.updated?'updated':'checked')+
      (result?.buildNumber?' at build '+result.buildNumber:'')+
      (result?.typeCount?' ('+result.typeCount+' types)':''));
    return{...sdeRuntimeStatus(),refreshResult:result};
  }catch(error){
    sdeRefreshState.lastError=String(error?.message||error).slice(0,1000);
    console.warn('JLR SDE catalog refresh failed:',sdeRefreshState.lastError);
    return sdeRuntimeStatus();
  }finally{
    sdeRefreshState.running=false;
  }
}
function scheduleSdeRefresh(){
  if(sdeStartupTimer||sdePeriodicTimer)return;
  sdeStartupTimer=setTimeout(()=>{
    sdeStartupTimer=null;
    void refreshSdeCatalog();
  },20_000);
  sdeStartupTimer.unref?.();
  sdePeriodicTimer=setInterval(()=>void refreshSdeCatalog(),SDE_REFRESH_MS);
  sdePeriodicTimer.unref?.();
}
function sdeRouteError(res,error){
  const message=String(error?.message||error||'JLR_SDE_UNAVAILABLE');
  const unavailable=message.includes('JLR_SDE_UNAVAILABLE');
  return json(res,unavailable?503:500,{
    error:unavailable?'JLR_SDE_UNAVAILABLE':'JLR_SDE_FAILED',
    message:message.slice(0,240),
    sde:sdeRuntimeStatus(),
  });
}

function pruneTimedCache(map,maxEntries=500){
  const t=Date.now();
  for(const [key,row] of map)if(!row||Number(row.expiresAt||0)<=t)map.delete(key);
  if(map.size<=maxEntries)return;
  const rows=[...map.entries()].sort((a,b)=>Number(a[1]?.createdAt||0)-Number(b[1]?.createdAt||0));
  for(const [key] of rows.slice(0,map.size-maxEntries))map.delete(key);
}
function appraisalCacheKey(appraisal){
  const source=appraisal&&typeof appraisal==='object'?appraisal:{};
  const items=(Array.isArray(source.items)?source.items:[]).slice(0,APPRAISAL_MAX_ITEMS).map(row=>[
    Number(row?.typeId)||0,String(row?.name||'').trim(),Number(row?.amount)||0,
    Number(row?.buyTotal)||0,Number(row?.splitTotal)||0,Number(row?.sellTotal)||0,Number(row?.totalVolume)||0
  ]);
  return crypto.createHash('sha256').update(JSON.stringify({
    market:Number(source?.market?.id)||0,marketName:String(source?.market?.name||''),
    pricing:String(source?.pricing||'split'),pricingVariant:String(source?.pricingVariant||'immediate'),items,
  })).digest('hex');
}
function historyRegionForMarket(market){
  const id=Number(market?.id)||0;
  const name=String(market?.name||'').toLowerCase();
  if(id===2||name.includes('jita'))return{regionId:10000002,regionName:'The Forge'};
  if(name.includes('amarr'))return{regionId:10000043,regionName:'Domain'};
  if(name.includes('dodixie'))return{regionId:10000032,regionName:'Sinq Laison'};
  if(name.includes('rens'))return{regionId:10000030,regionName:'Heimatar'};
  if(name.includes('hek'))return{regionId:10000042,regionName:'Metropolis'};
  return null;
}
async function supportMainAppraisal(text,{market,pricing,pricingVariant}={}){
  const response=await fetch(MAIN_APP_URL+'/api/internal/support/appraisal',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'authorization':'Bearer '+SHARED_SECRET,
      'user-agent':'JLR-Tracker-Support/appraisal-intel',
    },
    body:JSON.stringify({text,market,pricing,pricingVariant}),
    signal:AbortSignal.timeout(APPRAISAL_MAIN_TIMEOUT_MS),
  });
  let payload=null;
  try{payload=await response.json()}catch{}
  if(!response.ok)throw new Error(String(payload?.message||payload?.error||('MAIN_APPRAISAL_HTTP_'+response.status)));
  return payload;
}
async function esiMarketHistory(regionId,typeId){
  const key=String(regionId)+':'+String(typeId);
  const cached=appraisalHistoryCache.get(key);
  if(cached&&cached.expiresAt>Date.now())return cached.value;
  const url='https://esi.evetech.net/latest/markets/'+encodeURIComponent(regionId)+'/history/?datasource=tranquility&type_id='+encodeURIComponent(typeId);
  const response=await fetch(url,{
    headers:{'accept':'application/json','user-agent':'JLR-Tracker-Support/appraisal-history'},
    signal:AbortSignal.timeout(APPRAISAL_ESI_TIMEOUT_MS),
  });
  if(!response.ok)throw new Error('ESI_HISTORY_HTTP_'+response.status);
  const rows=await response.json();
  const value=summarizeAppraisalMarketHistory(Array.isArray(rows)?rows:[]);
  appraisalHistoryCache.set(key,{createdAt:Date.now(),expiresAt:Date.now()+APPRAISAL_HISTORY_CACHE_TTL_MS,value});
  pruneTimedCache(appraisalHistoryCache,1500);
  return value;
}
function appraisalIntelItem(row){
  return{
    resolved:row?.resolved!==false,
    typeId:Number(row?.typeId)||null,
    name:String(row?.name||'').trim().slice(0,180),
    amount:Math.max(0,Math.floor(Number(row?.amount)||0)),
    totalVolume:Math.max(0,Number(row?.totalVolume)||0),
    buyOrderCount:Math.max(0,Math.floor(Number(row?.buyOrderCount)||0)),
    buyVolume:Math.max(0,Number(row?.buyVolume)||0),
    sellOrderCount:Math.max(0,Math.floor(Number(row?.sellOrderCount)||0)),
    sellVolume:Math.max(0,Number(row?.sellVolume)||0),
    buy:Math.max(0,Number(row?.buy)||0),
    split:Math.max(0,Number(row?.split)||0),
    sell:Math.max(0,Number(row?.sell)||0),
    buyTotal:Math.max(0,Number(row?.buyTotal)||0),
    splitTotal:Math.max(0,Number(row?.splitTotal)||0),
    sellTotal:Math.max(0,Number(row?.sellTotal)||0),
    marketDataAt:String(row?.marketDataAt||'').trim().slice(0,60),
    marketDataAgeMs:Math.max(0,Number(row?.marketDataAgeMs)||0),
    marketDataStale:Boolean(row?.marketDataStale),
    marketDataSource:String(row?.marketDataSource||'').trim().slice(0,40),
  };
}
function appraisalDecisionRawValue(row,pricing){
  if(pricing==='buy')return Math.max(0,Number(row?.buyTotal)||0);
  if(pricing==='sell')return Math.max(0,Number(row?.sellTotal)||0);
  return Math.max(0,Number(row?.splitTotal)||0);
}
function appraisalDecisionIntel(source,compression,pricing){
  const refine=source?.refine&&typeof source.refine==='object'?source.refine:null;
  const refineItems=(Array.isArray(refine?.items)?refine.items:[])
    .filter(row=>row&&String(row.name||'').trim()&&Number(row.valueAt100)>0);
  if(!refine||!refineItems.length)return null;
  const rate=Math.max(0,Math.min(1,Number(refine.selectedRate??refine.defaultRate)||0));
  const compressionByName=new Map((Array.isArray(compression)?compression:[])
    .filter(row=>row?.sourceName)
    .map(row=>[String(row.sourceName).trim().toLowerCase(),row]));
  let rawValue=0,compressedValue=0,refinedValue=0,covered=0;
  const rows=refineItems.map(row=>{
    const name=String(row.name||'').trim();
    const comp=compressionByName.get(name.toLowerCase())||null;
    const currentRaw=appraisalDecisionRawValue(row,pricing);
    let raw=currentRaw,compressed=null;
    if(comp){
      covered++;
      if(String(comp.direction)==='decompress'){
        compressed=Math.max(0,Number(comp.sourceValue)||0);
        raw=Math.max(0,Number(comp.targetValue)||0);
      }else{
        raw=Math.max(0,Number(comp.sourceValue)||0);
        compressed=Math.max(0,Number(comp.targetValue)||0);
      }
    }else if(/^compressed\s+/i.test(name)){
      compressed=currentRaw;
      raw=null;
    }
    const refineAt100=Math.max(0,Number(row.valueAt100)||0);
    const refined=refineAt100*rate;
    if(Number.isFinite(Number(raw)))rawValue+=Math.max(0,Number(raw)||0);
    if(Number.isFinite(Number(compressed)))compressedValue+=Math.max(0,Number(compressed)||0);
    refinedValue+=refined;
    const options=[
      Number.isFinite(Number(raw))?{key:'raw',label:'RAW',value:Math.max(0,Number(raw)||0)}:null,
      Number.isFinite(Number(compressed))?{key:'compressed',label:'COMPRESSED',value:Math.max(0,Number(compressed)||0)}:null,
      {key:'refine',label:'REFINE',value:refined},
    ].filter(Boolean).sort((a,b)=>b.value-a.value);
    return{
      typeId:Number(row.typeId)||null,
      name,
      amount:Math.max(0,Number(row.amount)||0),
      rawValue:Number.isFinite(Number(raw))?Math.max(0,Number(raw)||0):null,
      compressedValue:Number.isFinite(Number(compressed))?Math.max(0,Number(compressed)||0):null,
      refineValueAt100:refineAt100,
      refinedValue:refined,
      winner:options[0]?.key||null,
      winnerLabel:options[0]?.label||null,
      advantageValue:options.length>1?Math.max(0,options[0].value-options[1].value):0,
    };
  });
  const fullCompressionCoverage=covered===refineItems.length&&covered>0;
  const options=[
    {key:'raw',label:'RAW',value:rawValue},
    fullCompressionCoverage?{key:'compressed',label:'COMPRESSED',value:compressedValue}:null,
    {key:'refine',label:'REFINE',value:refinedValue},
  ].filter(Boolean).sort((a,b)=>b.value-a.value);
  return{
    pricing,
    refineRate:rate,
    pricingBasis:String(refine.pricingBasis||'Jita mineral buy').slice(0,80),
    recognizedLines:refineItems.length,
    compressionCoveredLines:covered,
    fullCompressionCoverage,
    rawValue,
    compressedValue:fullCompressionCoverage?compressedValue:null,
    refinedValue,
    winner:options[0]?.key||null,
    winnerLabel:options[0]?.label||null,
    winnerValue:options[0]?.value||0,
    advantageValue:options.length>1?Math.max(0,(options[0]?.value||0)-(options[1]?.value||0)):0,
    rows,
  };
}

async function buildSupportAppraisalIntel(body){
  const source=body?.appraisal&&typeof body.appraisal==='object'?body.appraisal:{};
  const pricing=['buy','split','sell'].includes(String(source.pricing||'').toLowerCase())?String(source.pricing).toLowerCase():'split';
  const pricingVariant=String(source.pricingVariant||'immediate').toLowerCase()==='top5percent'?'top5percent':'immediate';
  const market={id:Number(source?.market?.id)||2,name:String(source?.market?.name||'Jita 4-4').trim().slice(0,120)};
  const items=(Array.isArray(source.items)?source.items:[]).slice(0,APPRAISAL_MAX_ITEMS).map(appraisalIntelItem)
    .filter(row=>row.resolved!==false&&row.name&&row.amount>0);
  if(!items.length)return{available:true,generatedAt:new Date().toISOString(),market,pricing,pricingVariant,compression:[],history:[],warnings:['No resolved appraisal items were available for Support intel.']};

  const key=appraisalCacheKey({market,pricing,pricingVariant,items});
  const cached=appraisalIntelCache.get(key);
  if(cached&&cached.expiresAt>Date.now()){
    return{...cached.value,cache:{hit:true,ageMs:Math.max(0,Date.now()-cached.createdAt),ttlMs:APPRAISAL_INTEL_CACHE_TTL_MS}};
  }

  const warnings=[];
  const ranked=[...items].sort((a,b)=>appraisalSelectedValue(b,pricing)-appraisalSelectedValue(a,pricing));
  const candidateRows=[];
  const seenTargets=new Set();
  let sdeTypesById=new Map();
  try{
    const lookup=sdeCatalog.types(ranked.map(row=>row.typeId));
    sdeTypesById=new Map((lookup.items||[]).map(row=>[Number(row.typeId),row]));
  }catch{}
  for(const row of ranked){
    const exact=sdeCompressionCandidate(sdeTypesById.get(Number(row.typeId)));
    const candidate=exact||appraisalCompressionCandidateName(row.name);
    if(!candidate)continue;
    const targetKey=String(candidate.targetName||'').toLowerCase();
    if(!targetKey||seenTargets.has(targetKey))continue;
    seenTargets.add(targetKey);
    candidateRows.push({row,candidate});
    if(candidateRows.length>=40)break;
  }

  let compression=[];
  if(candidateRows.length){
    try{
      const candidateText=candidateRows.map(({row,candidate})=>candidate.targetName+'\t'+row.amount).join('\n');
      const alternate=await supportMainAppraisal(candidateText,{market:market.id,pricing,pricingVariant});
      const targetRows=new Map((Array.isArray(alternate?.items)?alternate.items:[])
        .filter(row=>row?.resolved!==false&&row?.name)
        .map(row=>[String(row.name).trim().toLowerCase(),appraisalIntelItem(row)]));
      compression=candidateRows.map(({row,candidate})=>{
        const target=targetRows.get(candidate.targetName.toLowerCase());
        if(!target)return null;
        const sourceValue=appraisalSelectedValue(row,pricing);
        const targetValue=appraisalSelectedValue(target,pricing);
        const sourceVolume=Math.max(0,Number(row.totalVolume)||0);
        const targetVolume=Math.max(0,Number(target.totalVolume)||0);
        return{
          sourceName:row.name,
          sourceTypeId:row.typeId,
          targetName:target.name,
          targetTypeId:target.typeId,
          direction:candidate.direction,
          amount:row.amount,
          pricing,
          sourceValue,
          targetValue,
          valueDelta:targetValue-sourceValue,
          valueDeltaPct:sourceValue>0?((targetValue/sourceValue)-1)*100:null,
          sourceVolume,
          targetVolume,
          volumeDelta:targetVolume-sourceVolume,
          volumeReductionPct:sourceVolume>0?(1-targetVolume/sourceVolume)*100:null,
        };
      }).filter(Boolean).sort((a,b)=>Math.abs(b.sourceValue)-Math.abs(a.sourceValue));
    }catch(error){
      warnings.push('Compression comparison unavailable: '+String(error?.message||error).slice(0,140));
    }
  }

  const region=historyRegionForMarket(market);
  let history=[];
  if(region){
    const targets=appraisalIntelTargets(items,{pricing,limit:APPRAISAL_HISTORY_LIMIT});
    const settled=await Promise.all(targets.map(async row=>{
      try{
        const summary=await esiMarketHistory(region.regionId,row.typeId);
        const buy=Math.max(0,Number(row.buy)||0);
        const sell=Math.max(0,Number(row.sell)||0);
        const midpoint=buy>0&&sell>0?(buy+sell)/2:0;
        const avgDaily=Math.max(0,Number(summary.avgDailyVolume7)||0);
        return{
          typeId:row.typeId,name:row.name,amount:row.amount,
          selectedValue:appraisalSelectedValue(row,pricing),
          regionId:region.regionId,regionName:region.regionName,
          buyOrderCount:Math.max(0,Number(row.buyOrderCount)||0),
          sellOrderCount:Math.max(0,Number(row.sellOrderCount)||0),
          buyVolume:Math.max(0,Number(row.buyVolume)||0),
          sellVolume:Math.max(0,Number(row.sellVolume)||0),
          spreadPct:midpoint>0?((sell-buy)/midpoint)*100:null,
          buyBookDays:avgDaily>0?Math.max(0,Number(row.buyVolume)||0)/avgDaily:null,
          sellBookDays:avgDaily>0?Math.max(0,Number(row.sellVolume)||0)/avgDaily:null,
          marketDataAt:row.marketDataAt||null,
          marketDataStale:Boolean(row.marketDataStale),
          marketDataSource:row.marketDataSource||null,
          ...summary,
        };
      }catch{return null}
    }));
    history=settled.filter(Boolean);
    if(!history.length&&targets.length)warnings.push('ESI market history is temporarily unavailable for these items.');
  }else{
    warnings.push('Market history is currently mapped for Jita, Amarr, Dodixie, Rens, and Hek.');
  }

  const decision=appraisalDecisionIntel(source,compression,pricing);
  const value={
    available:true,
    generatedAt:new Date().toISOString(),
    market,pricing,pricingVariant,
    marketData:source.marketData&&typeof source.marketData==='object'?source.marketData:null,
    compression,
    history,
    decision,
    warnings,
    cache:{
      hit:false,ageMs:0,ttlMs:APPRAISAL_INTEL_CACHE_TTL_MS,
      compressionCandidates:compression.length,historyRows:history.length,
    },
  };
  appraisalIntelCache.set(key,{createdAt:Date.now(),expiresAt:Date.now()+APPRAISAL_INTEL_CACHE_TTL_MS,value});
  pruneTimedCache(appraisalIntelCache,300);
  return value;
}

await Promise.all([loadState(),loadAppraisalPriceSnapshots()]);

const startedAt=Date.now();
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/', 'http://tracker-support.local');
  if(req.method==='GET'&&url.pathname==='/health'){
    return json(res,200,{
      ok:true,
      service:'jlr-tracker-support',
      version:'2.3.0',
      sessions:store.size,
      uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),
      persistence:Boolean(STATE_FILE),
      appraisalIntelCacheEntries:appraisalIntelCache.size,
      marketHistoryCacheEntries:appraisalHistoryCache.size,
      appraisalPriceSnapshots:appraisalPriceSnapshots.size,
      appraisalPriceFreshMs:APPRAISAL_PRICE_FRESH_MS,
      appraisalPriceRetainMs:APPRAISAL_PRICE_RETAIN_MS,
      staticData:sdeRuntimeStatus(),
    });
  }
  if(!authorized(req))return json(res,401,{error:'UNAUTHORIZED'});
  if(req.method==='POST'&&url.pathname==='/v1/resolve'){
    let body;
    try{body=await readBody(req)}
    catch(error){return json(res,400,{error:String(error?.message||'BAD_REQUEST')})}
    const userKey=validUserKey(body?.userKey);
    if(!userKey)return json(res,400,{error:'USER_KEY_REQUIRED'});
    return json(res,200,store.resolve(userKey,{question:body?.question,currentTab:body?.currentTab,context:body?.context}));
  }
  if(req.method==='POST'&&url.pathname==='/v1/remember'){
    let body;
    try{body=await readBody(req)}
    catch(error){return json(res,400,{error:String(error?.message||'BAD_REQUEST')})}
    const userKey=validUserKey(body?.userKey);
    if(!userKey)return json(res,400,{error:'USER_KEY_REQUIRED'});
    const session=store.remember(userKey,{question:body?.question,currentTab:body?.currentTab,context:body?.context,answer:body?.answer});
    scheduleSave();
    return json(res,200,{ok:true,session});
  }
  if(req.method==='POST'&&url.pathname==='/v1/sde/status'){
    return json(res,200,sdeRuntimeStatus());
  }
  if(req.method==='POST'&&url.pathname==='/v1/sde/match'){
    let body;
    try{body=await readBody(req,20_000)}
    catch(error){return json(res,400,{error:String(error?.message||'BAD_REQUEST')})}
    try{return json(res,200,sdeCatalog.matchQuestion(body?.question,{limit:body?.limit}))}
    catch(error){return sdeRouteError(res,error)}
  }
  if(req.method==='POST'&&url.pathname==='/v1/sde/resolve'){
    let body;
    try{body=await readBody(req,80_000)}
    catch(error){return json(res,400,{error:String(error?.message||'BAD_REQUEST')})}
    try{return json(res,200,sdeCatalog.resolveNames(body?.names))}
    catch(error){return sdeRouteError(res,error)}
  }
  if(req.method==='POST'&&url.pathname==='/v1/sde/types'){
    let body;
    try{body=await readBody(req,40_000)}
    catch(error){return json(res,400,{error:String(error?.message||'BAD_REQUEST')})}
    try{return json(res,200,sdeCatalog.types(body?.typeIds))}
    catch(error){return sdeRouteError(res,error)}
  }
  if(req.method==='POST'&&url.pathname==='/v1/sde/materials'){
    let body;
    try{body=await readBody(req,40_000)}
    catch(error){return json(res,400,{error:String(error?.message||'BAD_REQUEST')})}
    try{return json(res,200,sdeCatalog.materials(body?.typeIds))}
    catch(error){return sdeRouteError(res,error)}
  }
  if(req.method==='POST'&&url.pathname==='/v1/sde/refresh'){
    return json(res,200,await refreshSdeCatalog({force:Boolean((await readBody(req,4_000).catch(()=>({})))?.force)}));
  }
  if(req.method==='POST'&&url.pathname==='/v1/appraisal/prices/get'){
    let body;
    try{body=await readBody(req,40_000)}
    catch(error){return json(res,400,{error:String(error?.message||'BAD_REQUEST')})}
    return json(res,200,getAppraisalPriceSnapshots(body));
  }
  if(req.method==='POST'&&url.pathname==='/v1/appraisal/prices/put'){
    let body;
    try{body=await readBody(req,180_000)}
    catch(error){return json(res,400,{error:String(error?.message||'BAD_REQUEST')})}
    return json(res,200,putAppraisalPriceSnapshots(body));
  }
  if(req.method==='POST'&&url.pathname==='/v1/appraisal/intel'){
    let body;
    try{body=await readBody(req,220_000)}
    catch(error){return json(res,400,{error:String(error?.message||'BAD_REQUEST')})}
    try{return json(res,200,await buildSupportAppraisalIntel(body))}
    catch(error){
      console.warn('Support appraisal intel failed:',String(error?.message||error));
      return json(res,503,{error:'APPRAISAL_INTEL_FAILED',message:String(error?.message||error)});
    }
  }
  if(req.method==='POST'&&url.pathname==='/v1/session'){
    let body;
    try{body=await readBody(req,4_000)}
    catch(error){return json(res,400,{error:String(error?.message||'BAD_REQUEST')})}
    const userKey=validUserKey(body?.userKey);
    if(!userKey)return json(res,400,{error:'USER_KEY_REQUIRED'});
    return json(res,200,{session:store.publicSession(userKey)});
  }
  return json(res,404,{error:'NOT_FOUND'});
});

server.listen(PORT,'0.0.0.0',()=>{
  console.log('JLR Tracker Support listening on '+PORT);
  scheduleSdeRefresh();
});

async function shutdown(){
  try{
    if(saveTimer)clearTimeout(saveTimer);
    if(appraisalPriceSaveTimer)clearTimeout(appraisalPriceSaveTimer);
    if(sdeStartupTimer)clearTimeout(sdeStartupTimer);
    if(sdePeriodicTimer)clearInterval(sdePeriodicTimer);
    await Promise.all([saveState(),saveAppraisalPriceSnapshots()]);
  }catch(error){}
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),3000).unref?.();
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
