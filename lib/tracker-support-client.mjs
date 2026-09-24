import crypto from 'node:crypto';

function clean(value,max=1200){
  return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
}
function finite(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function cleanSupportContext(value){
  const input=value&&typeof value==='object'?value:{};
  const performance=input.performance&&typeof input.performance==='object'?input.performance:{};
  return{
    currentTab:clean(input.currentTab,40),
    workflow:clean(input.workflow,60),
    selectedSystem:clean(input.selectedSystem,80),
    selectedCharacterId:clean(input.selectedCharacterId,40),
    selectedCharacterName:clean(input.selectedCharacterName,120),
    selectedFleetCount:finite(input.selectedFleetCount),
    selectedMetric:clean(input.selectedMetric,60),
    targetOre:clean(input.targetOre,120),
    historyMetric:clean(input.historyMetric,30),
    historyDays:finite(input.historyDays),
    fieldStatus:clean(input.fieldStatus,40),
    performance:{
      latestRate:finite(performance.latestRate),
      previousRate:finite(performance.previousRate),
      targetRate:finite(performance.targetRate),
      activeToons:finite(performance.activeToons),
      sampledToons:finite(performance.sampledToons),
      sampleAt:clean(performance.sampleAt,40),
    },
    recentActions:(Array.isArray(input.recentActions)?input.recentActions:[]).slice(-8).map(row=>({
      kind:clean(row?.kind,60),
      at:finite(row?.at),
      tab:clean(row?.tab,40),
      system:clean(row?.system,80),
      characterName:clean(row?.characterName,120),
      detail:clean(row?.detail,160),
    })).filter(row=>row.kind),
  };
}

export function trackerSupportAnswerContext(answer){
  if(!answer||typeof answer!=='object')return{};
  const closest=answer.closest&&typeof answer.closest==='object'?answer.closest:null;
  const nearest=Array.isArray(answer.nearest)?answer.nearest.find(row=>row&&row.system):null;
  let focusSystem=clean(answer.focusSystem||closest?.system||nearest?.system,80);
  if(!focusSystem&&String(answer.topic||'')==='location')focusSystem=clean(answer.location?.system,80);
  const jumps=Number.isFinite(Number(answer.jumps))?Number(answer.jumps):
    Number.isFinite(Number(closest?.jumps))?Number(closest.jumps):
    Number.isFinite(Number(nearest?.jumps))?Number(nearest.jumps):null;
  const originSystem=clean(answer.originSystem||answer.location?.system,80);
  return{
    topic:clean(answer.topic,80),
    text:clean(answer.text,1000),
    voiceText:clean(answer.voiceText,600),
    focusSystem,
    jumps,
    originSystem,
    closest:closest?{system:clean(closest.system,80),jumps:Number.isFinite(Number(closest.jumps))?Number(closest.jumps):null}:null,
    nearest:Array.isArray(answer.nearest)?answer.nearest.slice(0,3).map(row=>({
      system:clean(row?.system,80),
      jumps:Number.isFinite(Number(row?.jumps))?Number(row.jumps):null,
    })).filter(row=>row.system):[],
    location:answer.location&&typeof answer.location==='object'?{system:clean(answer.location.system,80)}:null,
  };
}

export function createTrackerSupportClient({
  baseUrl='',
  secret='',
  userKeySecret='',
  timeoutMs=1200,
  fetchImpl=globalThis.fetch,
}={}){
  const base=String(baseUrl||'').trim().replace(/\/+$/,'');
  const bearer=String(secret||'').trim();
  const keySecret=String(userKeySecret||bearer).trim();
  const timeout=Math.max(250,Number(timeoutMs)||1200);
  const enabled=Boolean(base&&bearer.length>=24&&keySecret&&typeof fetchImpl==='function');

  function userKey(userId){
    if(!enabled||!String(userId||''))return'';
    return crypto.createHmac('sha256',keySecret).update(String(userId)).digest('hex').slice(0,48);
  }
  async function post(path,body){
    if(!enabled)return null;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetchImpl(base+path,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'authorization':'Bearer '+bearer,
        },
        body:JSON.stringify(body),
        signal:controller.signal,
      });
      if(!response.ok)throw new Error('Tracker support HTTP '+response.status);
      return await response.json();
    }finally{clearTimeout(timer)}
  }

  return{
    enabled,
    async resolveQuestion({userId,question,currentTab,context}={}){
      const original=clean(question,900);
      if(!enabled)return{available:false,question:original,currentTab:clean(currentTab,40)};
      try{
        const result=await post('/v1/resolve',{
          userKey:userKey(userId),
          question:original,
          currentTab:clean(currentTab,40),
          context:cleanSupportContext(context),
        });
        return{available:true,...result,question:clean(result?.question||original,900)};
      }catch(error){
        return{available:false,question:original,currentTab:clean(currentTab,40),error:clean(error?.message||error,180)};
      }
    },
    async rememberAnswer({userId,question,currentTab,answer,context}={}){
      if(!enabled)return{available:false};
      try{
        await post('/v1/remember',{
          userKey:userKey(userId),
          question:clean(question,900),
          currentTab:clean(currentTab,40),
          context:cleanSupportContext(context),
          answer:trackerSupportAnswerContext(answer),
        });
        return{available:true};
      }catch(error){
        return{available:false,error:clean(error?.message||error,180)};
      }
    },
  };
}
