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
    selectedDoctrineItem:clean(input.selectedDoctrineItem,120),
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

function cleanAppraisalIntelInput(value){
  const source=value&&typeof value==='object'?value:{};
  const market=source.market&&typeof source.market==='object'?source.market:{};
  const refine=source.refine&&typeof source.refine==='object'?source.refine:null;
  const marketData=source.marketData&&typeof source.marketData==='object'?source.marketData:null;
  return{
    generatedAt:clean(source.generatedAt,60),
    source:clean(source.source,40),
    market:{id:finite(market.id),name:clean(market.name,120)},
    pricing:clean(source.pricing,20)||'split',
    pricingVariant:clean(source.pricingVariant,30)||'immediate',
    marketData:marketData?{
      generatedAt:clean(marketData.generatedAt,60),
      freshMs:finite(marketData.freshMs),
      rows:finite(marketData.rows),
      staleCount:finite(marketData.staleCount),
      freshCount:finite(marketData.freshCount),
      oldestAt:clean(marketData.oldestAt,60),
      newestAt:clean(marketData.newestAt,60),
      maxAgeMs:finite(marketData.maxAgeMs),
      sourceCounts:marketData.sourceCounts&&typeof marketData.sourceCounts==='object'
        ?Object.fromEntries(Object.entries(marketData.sourceCounts).slice(0,12).map(([key,count])=>[clean(key,40),finite(count)||0]))
        :{},
    }:null,
    refine:refine?{
      selectedRate:finite(refine.selectedRate),
      defaultRate:finite(refine.defaultRate),
      recognizedLines:finite(refine.recognizedLines),
      recognizedUnits:finite(refine.recognizedUnits),
      buyAt100:finite(refine.buyAt100),
      eligibleBuy:finite(refine.eligibleBuy),
      eligibleSplit:finite(refine.eligibleSplit),
      eligibleSell:finite(refine.eligibleSell),
      pricingBasis:clean(refine.pricingBasis,80),
      items:(Array.isArray(refine.items)?refine.items:[]).slice(0,120).map(row=>({
        typeId:finite(row?.typeId),
        name:clean(row?.name,180),
        amount:finite(row?.amount),
        buyTotal:finite(row?.buyTotal),
        splitTotal:finite(row?.splitTotal),
        sellTotal:finite(row?.sellTotal),
        valueAt100:finite(row?.valueAt100),
      })).filter(row=>row.name),
    }:null,
    items:(Array.isArray(source.items)?source.items:[]).slice(0,250).map(row=>({
      resolved:row?.resolved!==false,
      typeId:finite(row?.typeId),
      name:clean(row?.name,180),
      amount:finite(row?.amount),
      totalVolume:finite(row?.totalVolume),
      buyOrderCount:finite(row?.buyOrderCount),
      buyVolume:finite(row?.buyVolume),
      sellOrderCount:finite(row?.sellOrderCount),
      sellVolume:finite(row?.sellVolume),
      buy:finite(row?.buy),split:finite(row?.split),sell:finite(row?.sell),
      buyTotal:finite(row?.buyTotal),splitTotal:finite(row?.splitTotal),sellTotal:finite(row?.sellTotal),
      marketDataAt:clean(row?.marketDataAt,60),
      marketDataAgeMs:finite(row?.marketDataAgeMs),
      marketDataStale:Boolean(row?.marketDataStale),
      marketDataSource:clean(row?.marketDataSource,40),
    })).filter(row=>row.name),
  };
}

function cleanAppraisalPriceSnapshot(row){
  if(!row||typeof row!=='object')return null;
  const marketId=finite(row.marketId),typeId=finite(row.typeId);
  if(!(marketId>0)||!(typeId>0))return null;
  const variant=clean(row.variant,30)==='top5percent'?'top5percent':'immediate';
  return{
    marketId,typeId,
    marketName:clean(row.marketName,120),
    typeName:clean(row.typeName,180),
    variant,
    buy:finite(row.buy)||0,
    split:finite(row.split)||0,
    sell:finite(row.sell)||0,
    buyOrderCount:Math.max(0,finite(row.buyOrderCount)||0),
    sellOrderCount:Math.max(0,finite(row.sellOrderCount)||0),
    buyVolume:Math.max(0,finite(row.buyVolume)||0),
    sellVolume:Math.max(0,finite(row.sellVolume)||0),
    fetchedAt:clean(row.fetchedAt,60),
    source:clean(row.source,40)||'jlr-native-esi',
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
    focusItem:clean(answer.focusItem,120),
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
  async function post(path,body,timeoutOverride=timeout){
    if(!enabled)return null;
    const controller=new AbortController();
    const requestTimeout=Math.max(250,Number(timeoutOverride)||timeout);
    const timer=setTimeout(()=>controller.abort(),requestTimeout);
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
    async appraisalIntel({appraisal}={}){
      if(!enabled)return{available:false};
      try{
        const result=await post('/v1/appraisal/intel',{
          appraisal:cleanAppraisalIntelInput(appraisal),
        },Math.max(timeout,9_000));
        return{available:true,...result};
      }catch(error){
        return{available:false,error:clean(error?.message||error,180)};
      }
    },
    async sdeStatus(){
      if(!enabled)return{available:false,ready:false};
      try{
        const result=await post('/v1/sde/status',{},Math.max(timeout,2_500));
        return{available:true,...result};
      }catch(error){
        return{available:false,ready:false,error:clean(error?.message||error,180)};
      }
    },
    async sdeMatch({question:questionText,limit=8}={}){
      if(!enabled)return{available:false,items:[]};
      const q=clean(questionText,900);
      if(!q)return{available:true,items:[]};
      try{
        const result=await post('/v1/sde/match',{
          question:q,
          limit:Math.max(1,Math.min(20,Number(limit)||8)),
        },Math.max(timeout,3_000));
        return{
          available:true,
          meta:result?.meta||null,
          items:Array.isArray(result?.items)?result.items:[],
        };
      }catch(error){
        return{available:false,items:[],error:clean(error?.message||error,180)};
      }
    },
    async sdeResolve({names}={}){
      if(!enabled)return{available:false,items:[],missing:Array.isArray(names)?names:[]};
      const list=(Array.isArray(names)?names:[]).map(value=>clean(value,180)).filter(Boolean).slice(0,250);
      if(!list.length)return{available:true,items:[],missing:[]};
      try{
        const result=await post('/v1/sde/resolve',{names:list},Math.max(timeout,4_000));
        return{
          available:true,
          meta:result?.meta||null,
          items:Array.isArray(result?.items)?result.items:[],
          missing:Array.isArray(result?.missing)?result.missing:[],
        };
      }catch(error){
        return{available:false,items:[],missing:list,error:clean(error?.message||error,180)};
      }
    },
    async sdeTypes({typeIds}={}){
      if(!enabled)return{available:false,items:[]};
      const ids=(Array.isArray(typeIds)?typeIds:[]).map(finite).filter(value=>value>0).slice(0,250);
      if(!ids.length)return{available:true,items:[]};
      try{
        const result=await post('/v1/sde/types',{typeIds:ids},Math.max(timeout,4_000));
        return{available:true,meta:result?.meta||null,items:Array.isArray(result?.items)?result.items:[]};
      }catch(error){
        return{available:false,items:[],error:clean(error?.message||error,180)};
      }
    },
    async sdeMaterials({typeIds}={}){
      if(!enabled)return{available:false,items:[]};
      const ids=(Array.isArray(typeIds)?typeIds:[]).map(finite).filter(value=>value>0).slice(0,250);
      if(!ids.length)return{available:true,items:[]};
      try{
        const result=await post('/v1/sde/materials',{typeIds:ids},Math.max(timeout,4_000));
        return{available:true,meta:result?.meta||null,items:Array.isArray(result?.items)?result.items:[]};
      }catch(error){
        return{available:false,items:[],error:clean(error?.message||error,180)};
      }
    },
    async appraisalPriceSnapshots({marketId,variant,typeIds}={}){
      if(!enabled)return{available:false,snapshots:[]};
      try{
        const result=await post('/v1/appraisal/prices/get',{
          marketId:finite(marketId),
          variant:clean(variant,30)||'immediate',
          typeIds:(Array.isArray(typeIds)?typeIds:[]).map(finite).filter(value=>value>0).slice(0,250),
        },Math.max(timeout,2_500));
        return{available:true,...result,snapshots:Array.isArray(result?.snapshots)?result.snapshots:[]};
      }catch(error){
        return{available:false,snapshots:[],error:clean(error?.message||error,180)};
      }
    },
    async rememberAppraisalPriceSnapshots({snapshots}={}){
      if(!enabled)return{available:false,accepted:0};
      const rows=(Array.isArray(snapshots)?snapshots:[])
        .map(cleanAppraisalPriceSnapshot).filter(Boolean).slice(0,250);
      if(!rows.length)return{available:true,accepted:0};
      try{
        const result=await post('/v1/appraisal/prices/put',{snapshots:rows},Math.max(timeout,2_500));
        return{available:true,...result};
      }catch(error){
        return{available:false,accepted:0,error:clean(error?.message||error,180)};
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
