export const APPRAISAL_PRICING = Object.freeze(['buy','split','sell','refine-buy','refine-sell']);
export const APPRAISAL_VARIANTS = Object.freeze(['immediate','top5percent']);

function clean(value){
  return String(value??'').normalize('NFKC').replace(/\u00a0/g,' ').trim();
}
function money(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?n:0;
}
function qty(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?Math.floor(n):0;
}
function pricing(value){
  const key=String(value||'split').toLowerCase();
  return APPRAISAL_PRICING.includes(key)?key:'split';
}
function variant(value){
  const key=String(value||'immediate').toLowerCase();
  return APPRAISAL_VARIANTS.includes(key)?key:'immediate';
}
function selectedValue(summary,mode){
  if(mode==='buy')return summary.buy;
  if(mode==='sell')return summary.sell;
  return summary.split;
}

export function appraisalSummary(items,mode='split'){
  const list=Array.isArray(items)?items:[];
  const summary={
    lines:list.length,
    resolvedLines:list.filter(row=>row?.resolved!==false).length,
    unresolvedLines:list.filter(row=>row?.resolved===false).length,
    units:list.reduce((sum,row)=>sum+qty(row?.amount),0),
    volume:list.reduce((sum,row)=>sum+money(row?.totalVolume),0),
    packagedVolume:list.reduce((sum,row)=>sum+money(row?.totalPackagedVolume),0),
    buy:list.reduce((sum,row)=>sum+money(row?.buyTotal),0),
    split:list.reduce((sum,row)=>sum+money(row?.splitTotal),0),
    sell:list.reduce((sum,row)=>sum+money(row?.sellTotal),0),
  };
  summary.value=selectedValue(summary,pricing(mode));
  return summary;
}

export function appraisalSummaryWithRefine(items,mode='split',refine=null){
  const normalizedMode=pricing(mode);
  const summary=appraisalSummary(items,normalizedMode);
  const source=refine&&typeof refine==='object'?refine:null;
  const rate=Math.max(0,Math.min(1,Number(source?.selectedRate??source?.defaultRate)||0));
  summary.refineBuy=money(source?.buyAt100)*rate;
  summary.refineSell=money(source?.sellAt100)*rate;
  if(normalizedMode==='refine-buy')summary.value=summary.refineBuy;
  else if(normalizedMode==='refine-sell')summary.value=summary.refineSell;
  return summary;
}

export function normalizeJaniceAppraisal(payload,options={}){
  const mode=pricing(options.pricing||payload?.pricing);
  const priceVariant=variant(options.pricingVariant||payload?.pricingVariant);
  const rows=Array.isArray(payload?.items)?payload.items:[];
  const items=rows.map(row=>{
    const type=row?.itemType||{};
    const effective=row?.effectivePrices
      ||(priceVariant==='top5percent'?row?.top5AveragePrices:row?.immediatePrices)
      ||{};
    const amount=qty(row?.amount);
    const volumePerUnit=money(type?.volume);
    const packagedVolumePerUnit=money(type?.packagedVolume);
    return{
      resolved:true,
      typeId:Number(type?.eid)||null,
      name:clean(type?.name)||'Unknown item',
      amount,
      volumePerUnit,
      packagedVolumePerUnit,
      totalVolume:money(row?.totalVolume)||(volumePerUnit*amount),
      totalPackagedVolume:money(row?.totalPackagedVolume)||(packagedVolumePerUnit*amount),
      buyOrderCount:qty(row?.buyOrderCount),
      buyVolume:qty(row?.buyVolume),
      sellOrderCount:qty(row?.sellOrderCount),
      sellVolume:qty(row?.sellVolume),
      buy:money(effective?.buyPrice),
      split:money(effective?.splitPrice),
      sell:money(effective?.sellPrice),
      buyTotal:money(effective?.buyPriceTotal),
      splitTotal:money(effective?.splitPriceTotal),
      sellTotal:money(effective?.sellPriceTotal),
    };
  });
  const failures=clean(payload?.failures);
  if(failures){
    for(const line of failures.split(/\r?\n/).map(clean).filter(Boolean).slice(0,100)){
      items.push({resolved:false,typeId:null,name:line,amount:0,totalVolume:0,totalPackagedVolume:0,buy:0,split:0,sell:0,buyTotal:0,splitTotal:0,sellTotal:0});
    }
  }
  const summary=appraisalSummary(items,mode);
  return{
    generatedAt:payload?.created||new Date().toISOString(),
    datasetTime:payload?.datasetTime||null,
    source:'janice-v2',
    market:{
      id:Number(payload?.market?.id||options.marketId)||2,
      name:clean(payload?.market?.name)||clean(options.marketName)||'Jita 4-4',
    },
    pricing:mode,
    pricingVariant:priceVariant,
    failures,
    items,
    summary,
  };
}

export function sanitizeAppraisalShare(input,owner={}){
  const mode=pricing(input?.appraisal?.pricing||input?.pricing);
  const priceVariant=variant(input?.appraisal?.pricingVariant||input?.pricingVariant);
  const source=input?.appraisal&&typeof input.appraisal==='object'?input.appraisal:{};
  const items=(Array.isArray(source.items)?source.items:[]).slice(0,500).map(row=>({
    resolved:row?.resolved!==false,
    typeId:Number(row?.typeId)||null,
    name:clean(row?.name).slice(0,160),
    amount:qty(row?.amount),
    volumePerUnit:money(row?.volumePerUnit),
    packagedVolumePerUnit:money(row?.packagedVolumePerUnit),
    totalVolume:money(row?.totalVolume),
    totalPackagedVolume:money(row?.totalPackagedVolume),
    buyOrderCount:qty(row?.buyOrderCount),
    buyVolume:qty(row?.buyVolume),
    sellOrderCount:qty(row?.sellOrderCount),
    sellVolume:qty(row?.sellVolume),
    buy:money(row?.buy),
    split:money(row?.split),
    sell:money(row?.sell),
    buyTotal:money(row?.buyTotal),
    splitTotal:money(row?.splitTotal),
    sellTotal:money(row?.sellTotal),
    marketDataAt:clean(row?.marketDataAt).slice(0,60)||null,
    marketDataAgeMs:Math.max(0,Number(row?.marketDataAgeMs)||0),
    marketDataStale:Boolean(row?.marketDataStale),
    marketDataSource:clean(row?.marketDataSource).slice(0,40),
    staticSource:clean(row?.staticSource).slice(0,20),
    sdeBuildNumber:Number(row?.sdeBuildNumber)||null,
    groupId:Number(row?.groupId)||null,
    groupName:clean(row?.groupName).slice(0,120),
    categoryId:Number(row?.categoryId)||null,
    categoryName:clean(row?.categoryName).slice(0,120),
    marketGroupId:Number(row?.marketGroupId)||null,
    marketGroupName:clean(row?.marketGroupName).slice(0,120),
    portionSize:Math.max(1,Number(row?.portionSize)||1),
    compressedTypeId:Number(row?.compressedTypeId)||null,
    compressedName:clean(row?.compressedName).slice(0,160),
    rawTypeId:Number(row?.rawTypeId)||null,
    rawName:clean(row?.rawName).slice(0,160),
  })).filter(row=>row.name);
  const refineSource=source?.refine&&typeof source.refine==='object'?source.refine:null;
  const refine=refineSource?{
    kind:clean(refineSource.kind).slice(0,20)||'ore',
    defaultRate:Math.max(0,Math.min(1,Number(refineSource.defaultRate)||0)),
    selectedRate:Math.max(0,Math.min(1,Number(refineSource.selectedRate??refineSource.defaultRate)||0)),
    recognizedLines:qty(refineSource.recognizedLines),
    recognizedUnits:qty(refineSource.recognizedUnits),
    buyAt100:money(refineSource.buyAt100),
    sellAt100:money(refineSource.sellAt100),
    eligibleBuy:money(refineSource.eligibleBuy),
    eligibleSplit:money(refineSource.eligibleSplit),
    eligibleSell:money(refineSource.eligibleSell),
    pricingBasis:clean(refineSource.pricingBasis).slice(0,80),
    recipeSource:clean(refineSource.recipeSource).slice(0,30),
    sdeRecipeLines:qty(refineSource.sdeRecipeLines),
    legacyRecipeLines:qty(refineSource.legacyRecipeLines),
    items:(Array.isArray(refineSource.items)?refineSource.items:[]).slice(0,120).map(row=>({
      typeId:Number(row?.typeId)||null,
      name:clean(row?.name).slice(0,160),
      amount:qty(row?.amount),
      buyTotal:money(row?.buyTotal),
      splitTotal:money(row?.splitTotal),
      sellTotal:money(row?.sellTotal),
      valueAt100:money(row?.valueAt100),
      sellValueAt100:money(row?.sellValueAt100),
      recipeSource:clean(row?.recipeSource).slice(0,30),
    })).filter(row=>row.name),
    minerals:(Array.isArray(refineSource.minerals)?refineSource.minerals:[]).slice(0,30).map(row=>({
      mineral:clean(row?.mineral).slice(0,80),
      quantityAt100:money(row?.quantityAt100),
      unitBuy:money(row?.unitBuy),
      unitSell:money(row?.unitSell),
      valueAt100:money(row?.valueAt100),
      valueSellAt100:money(row?.valueSellAt100),
    })).filter(row=>row.mineral),
  }:null;
  return{
    title:clean(input?.title).slice(0,120)||'JLR Hub Appraisal',
    owner:{
      id:String(owner?.id||''),
      name:clean(owner?.displayName||owner?.name||'JLR Pilot').slice(0,80),
    },
    appraisal:{
      generatedAt:source.generatedAt||new Date().toISOString(),
      datasetTime:source.datasetTime||null,
      source:clean(source.source).slice(0,40)||'jlr-native-esi',
      market:{
        id:Number(source?.market?.id)||2,
        name:clean(source?.market?.name).slice(0,120)||'Jita 4-4',
      },
      pricing:mode,
      pricingVariant:priceVariant,
      failures:clean(source.failures).slice(0,4000),
      staticData:source.staticData&&typeof source.staticData==='object'?{
        provider:clean(source.staticData.provider).slice(0,40),
        buildNumber:Number(source.staticData.buildNumber)||null,
        releaseDate:clean(source.staticData.releaseDate).slice(0,60)||null,
        sdeResolved:qty(source.staticData.sdeResolved),
        esiFallbackResolved:qty(source.staticData.esiFallbackResolved),
        totalRequested:qty(source.staticData.totalRequested),
      }:null,
      items,
      summary:appraisalSummaryWithRefine(items,mode,refine),
      marketData:source.marketData&&typeof source.marketData==='object'?{
        generatedAt:clean(source.marketData.generatedAt).slice(0,60)||null,
        freshMs:Math.max(0,Number(source.marketData.freshMs)||0),
        rows:qty(source.marketData.rows),
        staleCount:qty(source.marketData.staleCount),
        freshCount:qty(source.marketData.freshCount),
        oldestAt:clean(source.marketData.oldestAt).slice(0,60)||null,
        newestAt:clean(source.marketData.newestAt).slice(0,60)||null,
        maxAgeMs:Math.max(0,Number(source.marketData.maxAgeMs)||0),
        sourceCounts:source.marketData.sourceCounts&&typeof source.marketData.sourceCounts==='object'
          ?Object.fromEntries(Object.entries(source.marketData.sourceCounts).slice(0,12).map(([key,value])=>[clean(key).slice(0,40),qty(value)]))
          :{},
      }:null,
      refine,
    },
  };
}
