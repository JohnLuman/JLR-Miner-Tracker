import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {TrackerSessionStore,appraisalCompressionCandidateName,appraisalSelectedValue,appraisalIntelTargets,summarizeAppraisalMarketHistory} from './core.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Math.max(1,Number(process.env.PORT)||3191);
const SHARED_SECRET=String(process.env.TRACKER_SUPPORT_SHARED_SECRET||'').trim();
const STATE_FILE=String(process.env.TRACKER_SUPPORT_STATE_FILE||path.join(__dirname,'data','sessions.json')).trim();
const SESSION_TTL_MS=Math.max(60_000,Number(process.env.TRACKER_SUPPORT_SESSION_TTL_MS)||12*60*60*1000);
const FOCUS_TTL_MS=Math.max(60_000,Number(process.env.TRACKER_SUPPORT_FOCUS_TTL_MS)||30*60*1000);
const MAX_SESSIONS=Math.max(100,Number(process.env.TRACKER_SUPPORT_MAX_SESSIONS)||5000);
const MAIN_APP_URL=String(process.env.TRACKER_SUPPORT_MAIN_URL||'http://JLR-Miner-Tracker.railway.internal:8080').trim().replace(/\/+$/,'');
const GPT_SOVITS_URL=String(process.env.GPT_SOVITS_URL||'http://127.0.0.1:9880/tts').trim();
const VOICE_DIR=String(process.env.TRACKER_SUPPORT_VOICE_DIR||'/data/voice').trim();
const VOICE_REFERENCE_FILE=path.join(VOICE_DIR,'core-reference.wav');
const VOICE_REFERENCE_META=path.join(VOICE_DIR,'core-reference.json');
const VOICE_CACHE_DIR=path.join(VOICE_DIR,'cache');
const VOICE_MAX_TEXT=700;
const VOICE_MAX_AUDIO_BYTES=8_000_000;
const VOICE_FETCH_TIMEOUT_MS=Math.max(30_000,Number(process.env.TRACKER_SUPPORT_VOICE_TIMEOUT_MS)||180_000);
const VOICE_HEALTH_TIMEOUT_MS=Math.max(2_000,Number(process.env.TRACKER_SUPPORT_VOICE_HEALTH_TIMEOUT_MS)||5_000);
const voiceJobs=new Map();
const VOICE_PACK_FILE=String(process.env.TRACKER_SUPPORT_VOICE_PACK_FILE||path.join(path.dirname(STATE_FILE),'voice','JLR_Voice_Worker_v3_PATCH.zip')).trim();
const UPLOAD_TOKEN=String(process.env.TRACKER_SUPPORT_UPLOAD_TOKEN||'').trim();
const VOICE_PACK_MAX_BYTES=20*1024*1024;
const APPRAISAL_INTEL_CACHE_TTL_MS=Math.max(30_000,Number(process.env.TRACKER_SUPPORT_APPRAISAL_CACHE_MS)||5*60*1000);
const APPRAISAL_HISTORY_CACHE_TTL_MS=Math.max(60_000,Number(process.env.TRACKER_SUPPORT_MARKET_HISTORY_CACHE_MS)||30*60*1000);
const APPRAISAL_MAIN_TIMEOUT_MS=Math.max(2_000,Number(process.env.TRACKER_SUPPORT_APPRAISAL_MAIN_TIMEOUT_MS)||8_000);
const APPRAISAL_ESI_TIMEOUT_MS=Math.max(2_000,Number(process.env.TRACKER_SUPPORT_APPRAISAL_ESI_TIMEOUT_MS)||6_000);
const APPRAISAL_MAX_ITEMS=80;
const APPRAISAL_HISTORY_LIMIT=10;
const appraisalIntelCache=new Map();
const appraisalHistoryCache=new Map();

if(SHARED_SECRET.length<24){
  console.error('TRACKER_SUPPORT_SHARED_SECRET must be set to a random value of at least 24 characters.');
  process.exit(1);
}

const store=new TrackerSessionStore({ttlMs:SESSION_TTL_MS,focusTtlMs:FOCUS_TTL_MS,maxSessions:MAX_SESSIONS});
let saveTimer=null;

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
function validUserKey(value){
  const key=String(value||'').trim();
  return /^[a-f0-9]{32,64}$/i.test(key)?key:'';
}
function uploadAuthorized(req){
  if(UPLOAD_TOKEN.length<24)return false;
  const supplied=String(req.headers['x-jlr-upload-token']||'').trim();
  if(!supplied)return false;
  const left=Buffer.from(supplied);const right=Buffer.from(UPLOAD_TOKEN);
  return left.length===right.length&&crypto.timingSafeEqual(left,right);
}
async function voicePackStatus(){
  if(!VOICE_PACK_FILE)return{configured:false,present:false,bytes:0};
  try{
    const st=await fsp.stat(VOICE_PACK_FILE);
    return{configured:true,present:st.isFile()&&st.size>0,bytes:st.isFile()?st.size:0,path:path.basename(VOICE_PACK_FILE)};
  }catch(error){
    if(error?.code==='ENOENT')return{configured:true,present:false,bytes:0,path:path.basename(VOICE_PACK_FILE)};
    throw error;
  }
}
async function receiveVoicePack(req){
  if(!VOICE_PACK_FILE)throw new Error('VOICE_PACK_PATH_NOT_CONFIGURED');
  await fsp.mkdir(path.dirname(VOICE_PACK_FILE),{recursive:true});
  const tmp=VOICE_PACK_FILE+'.upload-'+process.pid+'-'+Date.now();
  const out=fs.createWriteStream(tmp,{flags:'wx'});
  let bytes=0;let complete=false;
  try{
    await new Promise((resolve,reject)=>{
      req.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>VOICE_PACK_MAX_BYTES){reject(new Error('VOICE_PACK_TOO_LARGE'));req.destroy();return;}
        if(!out.write(chunk))req.pause(),out.once('drain',()=>req.resume());
      });
      req.on('end',()=>out.end(resolve));
      req.on('error',reject);
      out.on('error',reject);
    });
    if(bytes<1000)throw new Error('VOICE_PACK_TOO_SMALL');
    await fsp.rename(tmp,VOICE_PACK_FILE);
    complete=true;
    return{ok:true,bytes,path:path.basename(VOICE_PACK_FILE)};
  }finally{
    try{out.destroy()}catch{}
    if(!complete)await fsp.unlink(tmp).catch(()=>{});
  }
}

async function voiceReferenceStatus(){
  try{
    const [st,metaRaw]=await Promise.all([
      fsp.stat(VOICE_REFERENCE_FILE),
      fsp.readFile(VOICE_REFERENCE_META,'utf8'),
    ]);
    const meta=JSON.parse(metaRaw);
    return{
      present:st.isFile()&&st.size>100_000,
      bytes:st.isFile()?st.size:0,
      text:String(meta?.text||'').replace(/\s+/g,' ').trim().slice(0,220),
      fetchedAt:meta?.fetchedAt||null,
    };
  }catch{return{present:false,bytes:0,text:'',fetchedAt:null}}
}
async function ensureVoiceReference({force=false}={}){
  const current=await voiceReferenceStatus();
  if(current.present&&!force)return current;
  if(!MAIN_APP_URL)throw new Error('Main JLR private URL is not configured.');
  const response=await fetch(MAIN_APP_URL+'/api/internal/support/voice-reference',{
    headers:{
      'authorization':'Bearer '+SHARED_SECRET,
      'accept':'audio/wav',
      'user-agent':'JLR-Tracker-Support/voice-reference',
    },
    signal:AbortSignal.timeout(10_000),
  });
  if(!response.ok)throw new Error('Main JLR voice reference HTTP '+response.status);
  const mime=String(response.headers.get('content-type')||'').toLowerCase();
  if(!mime.startsWith('audio/'))throw new Error('Main JLR voice reference returned '+(mime||'invalid content type'));
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<100_000||bytes.length>2_000_000)throw new Error('Main JLR voice reference size is invalid: '+bytes.length);
  let text='';
  try{text=decodeURIComponent(String(response.headers.get('x-jlr-reference-text')||''))}catch{}
  text=String(text||'').replace(/\s+/g,' ').trim().slice(0,220);
  await fsp.mkdir(VOICE_DIR,{recursive:true});
  const tmp=VOICE_REFERENCE_FILE+'.tmp';
  await fsp.writeFile(tmp,bytes);
  await fsp.rename(tmp,VOICE_REFERENCE_FILE);
  await fsp.writeFile(VOICE_REFERENCE_META,JSON.stringify({
    text,
    lang:String(response.headers.get('x-jlr-reference-lang')||'en').slice(0,16)||'en',
    voice:'core',
    bytes:bytes.length,
    fetchedAt:new Date().toISOString(),
  }),'utf8');
  return await voiceReferenceStatus();
}
async function gptSovitsReachable(){
  const base=GPT_SOVITS_URL.replace(/\/tts\/?$/,'');
  try{
    const response=await fetch(base+'/docs',{signal:AbortSignal.timeout(VOICE_HEALTH_TIMEOUT_MS)});
    return response.ok;
  }catch{return false}
}
function cleanVoiceText(value){
  return String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,VOICE_MAX_TEXT);
}
async function synthesizeVoice(request={}){
  const text=cleanVoiceText(request?.text);
  if(!text)throw new Error('text is required');
  const reference=await ensureVoiceReference();
  if(!reference.present)throw new Error('JLR core voice reference is unavailable.');
  const voice='core';
  const seed=crypto.createHash('sha256').update(JSON.stringify({
    text,voice,ref:reference.fetchedAt||reference.bytes,
    topK:15,topP:.95,temperature:.75,repetitionPenalty:1.35,
  })).digest('hex');
  const audioFile=path.join(VOICE_CACHE_DIR,seed+'.wav');
  try{
    const bytes=await fsp.readFile(audioFile);
    if(bytes.length>0&&bytes.length<=VOICE_MAX_AUDIO_BYTES)return{bytes,mime:'audio/wav',cached:true,voice};
  }catch{}
  if(voiceJobs.has(seed))return await voiceJobs.get(seed);
  const job=(async()=>{
    await fsp.mkdir(VOICE_CACHE_DIR,{recursive:true});
    let meta={text:'',lang:'en'};
    try{meta=JSON.parse(await fsp.readFile(VOICE_REFERENCE_META,'utf8'))}catch{}
    const payload={
      text,
      text_lang:'en',
      ref_audio_path:VOICE_REFERENCE_FILE,
      aux_ref_audio_paths:[],
      prompt_text:String(meta?.text||'').slice(0,220),
      prompt_lang:String(meta?.lang||'en')||'en',
      top_k:15,
      top_p:.95,
      temperature:.75,
      text_split_method:'cut2',
      batch_size:1,
      speed_factor:1.0,
      fragment_interval:.3,
      seed:20260922,
      media_type:'wav',
      streaming_mode:0,
      parallel_infer:true,
      repetition_penalty:1.35,
    };
    let response;
    try{
      response=await fetch(GPT_SOVITS_URL,{
        method:'POST',
        headers:{'content-type':'application/json','accept':'audio/wav'},
        body:JSON.stringify(payload),
        signal:AbortSignal.timeout(VOICE_FETCH_TIMEOUT_MS),
      });
    }catch(error){
      throw new Error('GPT-SoVITS fetch failed: '+String(error?.message||error));
    }
    if(!response.ok){
      const detail=(await response.text().catch(()=>'' )).slice(0,500);
      throw new Error('GPT-SoVITS HTTP '+response.status+(detail?': '+detail:''));
    }
    const mime=String(response.headers.get('content-type')||'audio/wav').split(';')[0].trim().toLowerCase();
    if(!mime.startsWith('audio/'))throw new Error('GPT-SoVITS returned '+(mime||'invalid content type'));
    const bytes=Buffer.from(await response.arrayBuffer());
    if(!bytes.length||bytes.length>VOICE_MAX_AUDIO_BYTES)throw new Error('GPT-SoVITS returned invalid audio size '+bytes.length);
    await fsp.writeFile(audioFile,bytes);
    return{bytes,mime,cached:false,voice};
  })().finally(()=>voiceJobs.delete(seed));
  voiceJobs.set(seed,job);
  return await job;
}

async function streamSynthesizeVoice(res,request={}){
  const text=cleanVoiceText(request?.text);
  if(!text)throw new Error('text is required');
  const reference=await ensureVoiceReference();
  if(!reference.present)throw new Error('JLR core voice reference is unavailable.');

  let meta={text:'',lang:'en'};
  try{meta=JSON.parse(await fsp.readFile(VOICE_REFERENCE_META,'utf8'))}catch{}
  const requestedMode=Number(request?.streaming_mode);
  const streamingMode=[2,3].includes(requestedMode)?requestedMode:3;
  const payload={
    text,
    text_lang:'en',
    ref_audio_path:VOICE_REFERENCE_FILE,
    aux_ref_audio_paths:[],
    prompt_text:String(meta?.text||'').slice(0,220),
    prompt_lang:String(meta?.lang||'en')||'en',
    top_k:15,
    top_p:.95,
    temperature:.75,
    // cut5 turns short English clauses such as "Welcome back," into tiny
    // semantic jobs that can run to the 1500-token ceiling on CPU. cut2 keeps
    // useful sentence context together and ends much more reliably.
    text_split_method:'cut2',
    batch_size:1,
    speed_factor:1.0,
    fragment_interval:.15,
    seed:20260922,
    media_type:'wav',
    streaming_mode:streamingMode,
    parallel_infer:true,
    repetition_penalty:1.35,
    overlap_length:2,
    // Mode 3 can emit a first PCM fragment after a small semantic chunk instead
    // of waiting for the entire sentence to finish on the CPU worker.
    min_chunk_length:4,
  };

  let response;
  try{
    response=await fetch(GPT_SOVITS_URL,{
      method:'POST',
      headers:{'content-type':'application/json','accept':'audio/wav'},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(VOICE_FETCH_TIMEOUT_MS),
    });
  }catch(error){
    throw new Error('GPT-SoVITS streaming fetch failed: '+String(error?.message||error));
  }
  if(!response.ok){
    const detail=(await response.text().catch(()=>'' )).slice(0,500);
    throw new Error('GPT-SoVITS streaming HTTP '+response.status+(detail?': '+detail:''));
  }
  const mime=String(response.headers.get('content-type')||'audio/wav').split(';')[0].trim().toLowerCase();
  if(!mime.startsWith('audio/'))throw new Error('GPT-SoVITS streaming returned '+(mime||'invalid content type'));
  if(!response.body)throw new Error('GPT-SoVITS streaming returned no body.');

  res.writeHead(200,{
    'content-type':mime,
    'cache-control':'private, no-store, no-transform',
    'connection':'keep-alive',
    'x-accel-buffering':'no',
    'x-jlr-worker-cache':'MISS',
    'x-jlr-voice-profile':'core',
    'x-jlr-streaming':'1',
    'x-jlr-streaming-mode':String(streamingMode),
  });
  res.flushHeaders?.();
  res.socket?.setNoDelay?.(true);

  const reader=response.body.getReader();
  let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      if(!value?.byteLength)continue;
      total+=value.byteLength;
      if(total>VOICE_MAX_AUDIO_BYTES)throw new Error('GPT-SoVITS streaming audio exceeded the maximum size.');
      if(!res.destroyed)res.write(Buffer.from(value));
    }
    if(!res.destroyed)res.end();
  }catch(error){
    try{await reader.cancel()}catch{}
    if(res.headersSent){
      console.warn('Support GPT-SoVITS stream interrupted:',String(error?.message||error));
      if(!res.destroyed)res.end();
      return;
    }
    throw error;
  }
}

function sendVoiceAudio(res,audio){
  res.writeHead(200,{
    'content-type':audio.mime||'audio/wav',
    'content-length':audio.bytes.length,
    'cache-control':'private, no-store',
    'x-jlr-worker-cache':audio.cached?'HIT':'MISS',
    'x-jlr-voice-profile':audio.voice||'core',
    'x-jlr-streaming':'buffered',
  });
  res.end(audio.bytes);
}
async function voiceHealth(){
  const reference=await voiceReferenceStatus();
  const engine=await gptSovitsReachable();
  return{
    voice_ready:Boolean(reference.present&&engine),
    voice_engine:'GPT-SoVITS',
    voice_engine_reachable:engine,
    reference_exists:Boolean(reference.present),
    reference_pack:reference.present,
    reference_pack_version:'railway-core-v1',
    voice_profiles:['core'],
    system_pronunciations:0,
    streaming:true,
    streaming_modes:[2,3],
    stable_streaming:true,
  };
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
    buy:Math.max(0,Number(row?.buy)||0),
    split:Math.max(0,Number(row?.split)||0),
    sell:Math.max(0,Number(row?.sell)||0),
    buyTotal:Math.max(0,Number(row?.buyTotal)||0),
    splitTotal:Math.max(0,Number(row?.splitTotal)||0),
    sellTotal:Math.max(0,Number(row?.sellTotal)||0),
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
  for(const row of ranked){
    const candidate=appraisalCompressionCandidateName(row.name);
    if(!candidate)continue;
    const targetKey=candidate.targetName.toLowerCase();
    if(seenTargets.has(targetKey))continue;
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
        return{
          typeId:row.typeId,name:row.name,amount:row.amount,
          selectedValue:appraisalSelectedValue(row,pricing),
          regionId:region.regionId,regionName:region.regionName,
          ...summary,
        };
      }catch{return null}
    }));
    history=settled.filter(Boolean);
    if(!history.length&&targets.length)warnings.push('ESI market history is temporarily unavailable for these items.');
  }else{
    warnings.push('Market history is currently mapped for Jita, Amarr, Dodixie, Rens, and Hek.');
  }

  const value={
    available:true,
    generatedAt:new Date().toISOString(),
    market,pricing,pricingVariant,
    compression,
    history,
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

await loadState();

const startedAt=Date.now();
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/', 'http://tracker-support.local');
  if(req.method==='GET'&&url.pathname==='/health'){
    const voice=await voiceHealth().catch(()=>({
      voice_ready:false,voice_engine:'GPT-SoVITS',voice_engine_reachable:false,
      reference_exists:false,reference_pack:false,voice_profiles:['core'],
      streaming:false,streaming_modes:[0],stable_streaming:false,system_pronunciations:0,
    }));
    return json(res,200,{
      ok:true,
      service:'jlr-tracker-support',
      version:'2.2.0',
      sessions:store.size,
      uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),
      persistence:Boolean(STATE_FILE),
      appraisalIntelCacheEntries:appraisalIntelCache.size,
      marketHistoryCacheEntries:appraisalHistoryCache.size,
      ...voice,
    });
  }
  if(req.method==='GET'&&url.pathname==='/admin/voice-pack/status'){
    if(!uploadAuthorized(req))return json(res,401,{error:'UNAUTHORIZED'});
    return json(res,200,await voicePackStatus());
  }
  if(req.method==='PUT'&&url.pathname==='/admin/voice-pack'){
    if(!uploadAuthorized(req))return json(res,401,{error:'UNAUTHORIZED'});
    try{return json(res,200,await receiveVoicePack(req))}
    catch(error){return json(res,400,{error:String(error?.message||error)})}
  }
  if(!authorized(req))return json(res,401,{error:'UNAUTHORIZED'});
  if(req.method==='POST'&&url.pathname==='/synthesize-stream'){
    let body;
    try{body=await readBody(req,20_000)}
    catch(error){return json(res,400,{error:'BAD_VOICE_REQUEST',message:String(error?.message||error)})}
    try{return await streamSynthesizeVoice(res,body)}
    catch(error){
      console.warn('Support GPT-SoVITS streaming synthesis failed:',String(error?.message||error));
      if(!res.headersSent)return json(res,503,{error:'TTS_FAILED',message:String(error?.message||error)});
      if(!res.destroyed)res.end();
      return;
    }
  }
  if(req.method==='POST'&&url.pathname==='/synthesize'){
    let body;
    try{body=await readBody(req,20_000)}
    catch(error){return json(res,400,{error:'BAD_VOICE_REQUEST',message:String(error?.message||error)})}
    try{
      const audio=await synthesizeVoice(body);
      return sendVoiceAudio(res,audio);
    }catch(error){
      console.warn('Support GPT-SoVITS synthesis failed:',String(error?.message||error));
      return json(res,503,{error:'TTS_FAILED',message:String(error?.message||error)});
    }
  }
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
  setTimeout(()=>ensureVoiceReference().then(ref=>{
    console.log('JLR core voice reference '+(ref.present?'ready':'missing')+' ('+ref.bytes+' bytes)');
  }).catch(error=>console.warn('JLR voice reference warmup deferred:',String(error?.message||error))),1500).unref?.();
});

async function shutdown(){
  try{if(saveTimer)clearTimeout(saveTimer);await saveState()}catch(error){}
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),3000).unref?.();
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
