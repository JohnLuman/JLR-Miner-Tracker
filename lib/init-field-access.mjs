const INIT=1900696668;
export async function initFieldAccess(user,{lookup,cache=new Map(),now=Date.now,ttlMs=60000}={}){
  const ids=(user?.characterIds||[]).map(Number).filter(id=>Number.isSafeInteger(id)&&id>0);
  if(!user?.id||!ids.length)return {allowed:false,reason:'INIT_FIELD_ACCESS_REQUIRED'};
  const key=String(user.id)+':'+[...ids].sort((a,b)=>a-b).join(',');
  const cached=cache.get(key);
  if(cached&&now()-cached.at<ttlMs)return cached.result;
  let allowed=false;
  try{const rows=await lookup(ids);allowed=Array.isArray(rows)&&rows.some(row=>ids.includes(Number(row.character_id))&&Number(row.alliance_id)===INIT)}catch{}
  const result={allowed,reason:allowed?'INIT_MEMBER':'INIT_FIELD_ACCESS_REQUIRED'};
  cache.set(key,{at:now(),result});
  return result;
}
export function fieldRouteRequiresInit(path){
  if(path==='/api/companion/clipboard/stream')return true;
  return /^\/api\/(?:fields(?:\/|$)|scans(?:\/|$)|tracker\/brain(?:\/|$)|scout(?:\/|$))/.test(path);
}
export function redactFieldState(snapshot,access){
  if(access?.allowed)return {...snapshot,fieldAccess:access};
  return {...snapshot,fieldAccess:{allowed:false,reason:'INIT_FIELD_ACCESS_REQUIRED'},app:{...snapshot.app,systemCount:0},
    source:{...snapshot.source,systems:[],ores:(snapshot.source?.ores||[]).map(({systems,...ore})=>({...ore,systems:[]})),mapFields:[],mapFieldSnapshot:{extractionStatus:'INIT-only'},iceFields:[],a0Fields:[],gas:{...snapshot.source?.gas,wormholes:{reports:[]}}},
    miningActivity:{},fields:{},scans:{},trackerBrain:{},esi:{...snapshot.esi,ledgerDebug:{}},market:{...snapshot.market,history:[]}};
}
