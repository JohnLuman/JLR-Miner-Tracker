import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {TrackerSessionStore} from './core.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Math.max(1,Number(process.env.PORT)||3191);
const SHARED_SECRET=String(process.env.TRACKER_SUPPORT_SHARED_SECRET||'').trim();
const STATE_FILE=String(process.env.TRACKER_SUPPORT_STATE_FILE||path.join(__dirname,'data','sessions.json')).trim();
const SESSION_TTL_MS=Math.max(60_000,Number(process.env.TRACKER_SUPPORT_SESSION_TTL_MS)||12*60*60*1000);
const FOCUS_TTL_MS=Math.max(60_000,Number(process.env.TRACKER_SUPPORT_FOCUS_TTL_MS)||30*60*1000);
const MAX_SESSIONS=Math.max(100,Number(process.env.TRACKER_SUPPORT_MAX_SESSIONS)||5000);
const VOICE_PACK_FILE=String(process.env.TRACKER_SUPPORT_VOICE_PACK_FILE||path.join(path.dirname(STATE_FILE),'voice','JLR_Voice_Worker_v3_PATCH.zip')).trim();
const UPLOAD_TOKEN=String(process.env.TRACKER_SUPPORT_UPLOAD_TOKEN||'').trim();
const VOICE_PACK_MAX_BYTES=20*1024*1024;

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

await loadState();

const startedAt=Date.now();
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/', 'http://tracker-support.local');
  if(req.method==='GET'&&url.pathname==='/health'){
    return json(res,200,{
      ok:true,
      service:'jlr-tracker-support',
      sessions:store.size,
      uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),
      persistence:Boolean(STATE_FILE),
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
  if(req.method==='POST'&&url.pathname==='/v1/resolve'){
    let body;
    try{body=await readBody(req)}
    catch(error){return json(res,400,{error:String(error?.message||'BAD_REQUEST')})}
    const userKey=validUserKey(body?.userKey);
    if(!userKey)return json(res,400,{error:'USER_KEY_REQUIRED'});
    return json(res,200,store.resolve(userKey,{question:body?.question,currentTab:body?.currentTab}));
  }
  if(req.method==='POST'&&url.pathname==='/v1/remember'){
    let body;
    try{body=await readBody(req)}
    catch(error){return json(res,400,{error:String(error?.message||'BAD_REQUEST')})}
    const userKey=validUserKey(body?.userKey);
    if(!userKey)return json(res,400,{error:'USER_KEY_REQUIRED'});
    const session=store.remember(userKey,{question:body?.question,currentTab:body?.currentTab,answer:body?.answer});
    scheduleSave();
    return json(res,200,{ok:true,session});
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

server.listen(PORT,'0.0.0.0',()=>console.log('JLR Tracker Support listening on '+PORT));

async function shutdown(){
  try{if(saveTimer)clearTimeout(saveTimer);await saveState()}catch(error){}
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),3000).unref?.();
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
