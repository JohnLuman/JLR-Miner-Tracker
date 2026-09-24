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

function finite(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function cleanAction(row){
  if(!row||typeof row!=='object')return null;
  const kind=clean(row.kind,60);
  if(!kind)return null;
  return{
    kind,
    at:finite(row.at),
    tab:clean(row.tab,40),
    system:clean(row.system,80),
    characterName:clean(row.characterName,120),
    detail:clean(row.detail,160),
  };
}
function cleanContext(value){
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
    selectedDoctrineItem:clean(input.selectedDoctrineItem,120),
    performance:{
      latestRate:finite(performance.latestRate),
      previousRate:finite(performance.previousRate),
      targetRate:finite(performance.targetRate),
      activeToons:finite(performance.activeToons),
      sampledToons:finite(performance.sampledToons),
      sampleAt:clean(performance.sampleAt,40),
    },
    recentActions:(Array.isArray(input.recentActions)?input.recentActions:[])
      .map(cleanAction).filter(Boolean).slice(-8),
  };
}
function mergeContext(previous,current){
  const a=cleanContext(previous);
  const b=cleanContext(current);
  const pick=(next,prior)=>next!==''&&next!==null&&next!==undefined?next:prior;
  return{
    currentTab:pick(b.currentTab,a.currentTab),
    workflow:pick(b.workflow,a.workflow),
    selectedSystem:pick(b.selectedSystem,a.selectedSystem),
    selectedCharacterId:pick(b.selectedCharacterId,a.selectedCharacterId),
    selectedCharacterName:pick(b.selectedCharacterName,a.selectedCharacterName),
    selectedFleetCount:pick(b.selectedFleetCount,a.selectedFleetCount),
    selectedMetric:pick(b.selectedMetric,a.selectedMetric),
    targetOre:pick(b.targetOre,a.targetOre),
    historyMetric:pick(b.historyMetric,a.historyMetric),
    historyDays:pick(b.historyDays,a.historyDays),
    fieldStatus:pick(b.fieldStatus,a.fieldStatus),
    selectedDoctrineItem:pick(b.selectedDoctrineItem,a.selectedDoctrineItem),
    performance:{
      latestRate:pick(b.performance.latestRate,a.performance.latestRate),
      previousRate:pick(b.performance.previousRate,a.performance.previousRate),
      targetRate:pick(b.performance.targetRate,a.performance.targetRate),
      activeToons:pick(b.performance.activeToons,a.performance.activeToons),
      sampledToons:pick(b.performance.sampledToons,a.performance.sampledToons),
      sampleAt:pick(b.performance.sampleAt,a.performance.sampleAt),
    },
    recentActions:b.recentActions.length?b.recentActions:a.recentActions,
  };
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
      row={updatedAt:this.now(),lastTab:'',lastTopic:'',focus:null,lastItem:null,lastContext:{},turns:[]};
      this.sessions.set(key,row);
    }
    return row;
  }
  resolve(userKey,{question,currentTab,context}={}){
    const q=clean(question,900);
    const tab=clean(currentTab,40);
    const key=clean(userKey,160);
    this.prune();
    const incoming=cleanContext(context);
    const hasIncomingContext=Boolean(
      incoming.currentTab||incoming.workflow||incoming.selectedSystem||incoming.selectedCharacterId||
      incoming.selectedCharacterName||incoming.selectedMetric||incoming.targetOre||incoming.fieldStatus||
      incoming.selectedDoctrineItem||
      incoming.recentActions.length||incoming.selectedFleetCount!==null||incoming.performance.latestRate!==null
    );
    const row=key?(this.sessions.get(key)||(hasIncomingContext?this.get(key):null)):null;
    if(!row||!q)return{question:q,currentTab:tab,answerOverride:null,contextUsed:false};
    row.updatedAt=this.now();
    if(tab)row.lastTab=tab;

    const ctx=mergeContext(row.lastContext,incoming);
    if(tab)ctx.currentTab=tab;
    const effectiveTab=tab||ctx.currentTab||row.lastTab||'';
    const lower=q.toLowerCase();
    const focus=row.focus;
    const focusFresh=Boolean(focus?.system)&&this.now()-Number(focus?.at||0)<=this.focusTtlMs;
    const itemFresh=Boolean(row.lastItem?.item)&&this.now()-Number(row.lastItem?.at||0)<=this.focusTtlMs;
    const hasSystem=Boolean(explicitSystem(q));
    const recentScan=ctx.workflow==='scan-update'||ctx.recentActions.some(action=>action.kind==='scan-updated');
    let answerOverride=null;
    let resolvedQuestion=q;

    if(!hasSystem){
      const shortNext=/^(?:next|next one|next system|next field|where next|what next|another one|another system)[\s?.!]*$/i.test(q);
      if(shortNext&&(effectiveTab==='fields'||effectiveTab==='brain'||recentScan)){
        resolvedQuestion='closest tracked system needing a scan update';
      }else if(effectiveTab==='performance'&&/^(?:why(?: is)? (?:this|it)(?: so)? low|why did (?:this|it) drop|what changed|what happened|explain (?:this|it)|why)[\s?.!]*$/i.test(q)){
        resolvedQuestion='explain recent fleet performance variance';
      }

      if(ctx.selectedSystem){
        resolvedQuestion=resolvedQuestion
          .replace(/\b(?:this|that) system\b/ig,ctx.selectedSystem)
          .replace(/\bthat field\b/ig,ctx.selectedSystem);
      }
      if(ctx.selectedCharacterName){
        resolvedQuestion=resolvedQuestion
          .replace(/\b(?:this|that) toon\b/ig,ctx.selectedCharacterName)
          .replace(/\b(?:this|that) character\b/ig,ctx.selectedCharacterName);
      }
    }

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
      }else if(/\bwhy (?:that|there|that one|that system)\b/.test(lower)&&focus.answerText
        &&!(itemFresh&&(effectiveTab==='doctrine'||/\bitem\b/.test(lower)))){
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

    const item=itemFresh?row.lastItem.item:incoming.selectedDoctrineItem;
    if(item&&(effectiveTab==='doctrine'||/\b(?:stock|price|profit|roi|margin|buy|sell|cost)\b/i.test(q))){
      resolvedQuestion=resolvedQuestion.replace(/\b(?:that item|this item|that one)\b/ig,item)
        .replace(/\b(?:its|it)\b/ig,word=>word.toLowerCase()==='its'?item+'’s':item);
      if(/^(?:how many should i buy|how much should i buy|what(?:'s| is) (?:the )?(?:stock|price|profit|margin|cost))\??$/i.test(resolvedQuestion)){
        resolvedQuestion+=' for '+item;
      }
    }

    return{
      question:resolvedQuestion,
      currentTab:effectiveTab,
      answerOverride,
      contextUsed:Boolean(answerOverride||resolvedQuestion!==q),
      focusSystem:focusFresh?focus.system:'',
      selectedSystem:ctx.selectedSystem||'',
      workflow:ctx.workflow||'',
      lastTopic:clean(row.lastTopic,80),
    };
  }
  remember(userKey,{question,currentTab,answer,context}={}){
    const row=this.get(userKey);
    if(!row)return null;
    const t=this.now();
    const q=clean(question,900);
    const tab=clean(currentTab,40);
    const topic=clean(answer?.topic,80);
    const text=clean(answer?.text,1000);
    const voiceText=clean(answer?.voiceText,600);
    const focus=focusFromAnswer(answer);
    const focusItem=clean(answer?.focusItem,120);

    row.updatedAt=t;
    if(tab)row.lastTab=tab;
    if(topic)row.lastTopic=topic;
    row.lastContext=mergeContext(row.lastContext,context);
    if(tab)row.lastContext.currentTab=tab;
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
    if(focusItem)row.lastItem={item:focusItem,at:t};
    row.turns.push({at:t,question:q,tab,topic,focusSystem:focus.system||'',workflow:row.lastContext?.workflow||'',selectedSystem:row.lastContext?.selectedSystem||''});
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
      lastItem:row.lastItem?{item:row.lastItem.item,at:row.lastItem.at}:null,
      context:cleanContext(row.lastContext),
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
    focusItem:clean(answer.focusItem,120),
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
