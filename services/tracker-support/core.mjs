const SYSTEM_CODE_RE=/\b[A-Z0-9]{1,10}(?:-[A-Z0-9]{1,10})+\b/g;

function clean(value,max=1200){
  return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
}
function explicitSystem(text){
  const matches=String(text||'').toUpperCase().match(SYSTEM_CODE_RE);
  return matches?.[0]||'';
}
function focusFromAnswer(answer){
  if(!answer||typeof answer!=='object')return{};
  const closest=answer.closest&&typeof answer.closest==='object'?answer.closest:null;
  const nearest=Array.isArray(answer.nearest)?answer.nearest.find(row=>row&&row.system):null;
  let system=clean(answer.focusSystem||closest?.system||nearest?.system,80);
  if(!system&&String(answer.topic||'')==='location')system=clean(answer.location?.system,80);
  const jumps=Number.isFinite(Number(answer.jumps))?Number(answer.jumps):
    Number.isFinite(Number(closest?.jumps))?Number(closest.jumps):
    Number.isFinite(Number(nearest?.jumps))?Number(nearest.jumps):null;
  const originSystem=clean(answer.originSystem||answer.location?.system,80);
  return{system,jumps,originSystem};
}

export class TrackerSessionStore{
  constructor({ttlMs=12*60*60*1000,focusTtlMs=30*60*1000,maxSessions=5000,maxTurns=12,nowFn=Date.now}={}){
    this.ttlMs=Math.max(60_000,Number(ttlMs)||0);
    this.focusTtlMs=Math.max(60_000,Number(focusTtlMs)||0);
    this.maxSessions=Math.max(100,Number(maxSessions)||0);
    this.maxTurns=Math.max(2,Number(maxTurns)||0);
    this.nowFn=nowFn;
    this.sessions=new Map();
  }
  now(){return Number(this.nowFn())||Date.now()}
  prune(){
    const cutoff=this.now()-this.ttlMs;
    for(const [key,row] of this.sessions){
      if(Number(row?.updatedAt||0)<cutoff)this.sessions.delete(key);
    }
    if(this.sessions.size<=this.maxSessions)return;
    const rows=[...this.sessions.entries()].sort((a,b)=>Number(a[1]?.updatedAt||0)-Number(b[1]?.updatedAt||0));
    for(let i=0;i<rows.length-this.maxSessions;i++)this.sessions.delete(rows[i][0]);
  }
  get(userKey){
    const key=clean(userKey,160);
    if(!key)return null;
    this.prune();
    let row=this.sessions.get(key);
    if(!row){
      row={updatedAt:this.now(),lastTab:'',lastTopic:'',focus:null,turns:[]};
      this.sessions.set(key,row);
    }
    return row;
  }
  resolve(userKey,{question,currentTab}={}){
    const q=clean(question,900);
    const tab=clean(currentTab,40);
    const key=clean(userKey,160);
    this.prune();
    const row=key?this.sessions.get(key):null;
    if(!row||!q)return{question:q,currentTab:tab,answerOverride:null,contextUsed:false};
    row.updatedAt=this.now();
    if(tab)row.lastTab=tab;

    const lower=q.toLowerCase();
    const focus=row.focus;
    const focusFresh=Boolean(focus?.system)&&this.now()-Number(focus?.at||0)<=this.focusTtlMs;
    const hasSystem=Boolean(explicitSystem(q));
    let answerOverride=null;
    let resolvedQuestion=q;

    if(focusFresh&&!hasSystem){
      if(/\b(?:what|which) system (?:was|is) (?:that|it)\b|\bwhere was that\b/.test(lower)){
        answerOverride={
          handled:true,
          topic:'support-context-system',
          text:'That was '+focus.system+'.',
          voiceText:'That was '+focus.system+'.',
          focusSystem:focus.system,
        };
      }else if(/\b(?:how far|how many jumps|distance)\b/.test(lower)&&/\b(?:it|that|there|system)\b/.test(lower)){
        const jumpText=Number.isFinite(focus.jumps)
          ?focus.jumps+' jump'+(focus.jumps===1?'':'s')
          :'the last recorded route';
        const origin=focus.originSystem?' from '+focus.originSystem:'';
        answerOverride={
          handled:true,
          topic:'support-context-distance',
          text:focus.system+' is '+jumpText+origin+'.',
          voiceText:focus.system+' is '+jumpText+origin+'.',
          focusSystem:focus.system,
          jumps:Number.isFinite(focus.jumps)?focus.jumps:null,
          originSystem:focus.originSystem||'',
        };
      }else if(/\bwhy (?:that|there|that one|that system)\b/.test(lower)&&focus.answerText){
        answerOverride={
          handled:true,
          topic:'support-context-why',
          text:focus.answerText,
          voiceText:focus.voiceText||focus.answerText,
          focusSystem:focus.system,
        };
      }else if(/\bthat system\b/.test(lower)){
        resolvedQuestion=q.replace(/that system/ig,focus.system);
      }
    }

    return{
      question:resolvedQuestion,
      currentTab:tab||row.lastTab||'',
      answerOverride,
      contextUsed:Boolean(answerOverride||resolvedQuestion!==q),
      focusSystem:focusFresh?focus.system:'',
      lastTopic:clean(row.lastTopic,80),
    };
  }
  remember(userKey,{question,currentTab,answer}={}){
    const row=this.get(userKey);
    if(!row)return null;
    const t=this.now();
    const q=clean(question,900);
    const tab=clean(currentTab,40);
    const topic=clean(answer?.topic,80);
    const text=clean(answer?.text,1000);
    const voiceText=clean(answer?.voiceText,600);
    const focus=focusFromAnswer(answer);

    row.updatedAt=t;
    if(tab)row.lastTab=tab;
    if(topic)row.lastTopic=topic;
    if(focus.system){
      row.focus={
        system:focus.system,
        jumps:Number.isFinite(focus.jumps)?focus.jumps:null,
        originSystem:focus.originSystem||'',
        answerText:text,
        voiceText,
        at:t,
      };
    }
    row.turns.push({at:t,question:q,tab,topic,focusSystem:focus.system||''});
    if(row.turns.length>this.maxTurns)row.turns=row.turns.slice(-this.maxTurns);
    this.prune();
    return this.publicSession(userKey);
  }
  publicSession(userKey){
    const row=this.sessions.get(clean(userKey,160));
    if(!row)return null;
    return{
      updatedAt:row.updatedAt,
      lastTab:row.lastTab||'',
      lastTopic:row.lastTopic||'',
      focus:row.focus?{
        system:row.focus.system||'',
        jumps:Number.isFinite(row.focus.jumps)?row.focus.jumps:null,
        originSystem:row.focus.originSystem||'',
        at:row.focus.at||0,
      }:null,
      turns:Array.isArray(row.turns)?row.turns.slice(-this.maxTurns):[],
    };
  }
  exportState(){
    this.prune();
    return{version:1,savedAt:this.now(),sessions:Object.fromEntries(this.sessions)};
  }
  importState(payload){
    const rows=payload&&payload.sessions&&typeof payload.sessions==='object'?payload.sessions:{};
    this.sessions=new Map(Object.entries(rows).filter(([key,row])=>key&&row&&typeof row==='object'));
    this.prune();
    return this.sessions.size;
  }
  get size(){this.prune();return this.sessions.size}
}

export function trackerSupportAnswerContext(answer){
  if(!answer||typeof answer!=='object')return{};
  const focus=focusFromAnswer(answer);
  return{
    topic:clean(answer.topic,80),
    text:clean(answer.text,1000),
    voiceText:clean(answer.voiceText,600),
    focusSystem:focus.system||'',
    jumps:Number.isFinite(focus.jumps)?focus.jumps:null,
    originSystem:focus.originSystem||'',
    closest:answer.closest&&typeof answer.closest==='object'?{
      system:clean(answer.closest.system,80),
      jumps:Number.isFinite(Number(answer.closest.jumps))?Number(answer.closest.jumps):null,
    }:null,
    nearest:Array.isArray(answer.nearest)?answer.nearest.slice(0,3).map(row=>({
      system:clean(row?.system,80),
      jumps:Number.isFinite(Number(row?.jumps))?Number(row.jumps):null,
    })).filter(row=>row.system):[],
    location:answer.location&&typeof answer.location==='object'?{
      system:clean(answer.location.system,80),
    }:null,
  };
}
