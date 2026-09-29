export const APPRAISAL_PRICING = Object.freeze(['buy','split','sell']);
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
  })).filter(row=>row.name);
  const refineSource=source?.refine&&typeof source.refine==='object'?source.refine:null;
  const refine=refineSource?{
    kind:clean(refineSource.kind).slice(0,20)||'ore',
    defaultRate:Math.max(0,Math.min(1,Number(refineSource.defaultRate)||0)),
    selectedRate:Math.max(0,Math.min(1,Number(refineSource.selectedRate??refineSource.defaultRate)||0)),
    recognizedLines:qty(refineSource.recognizedLines),
    recognizedUnits:qty(refineSource.recognizedUnits),
    buyAt100:money(refineSource.buyAt100),
    eligibleBuy:money(refineSource.eligibleBuy),
    eligibleSplit:money(refineSource.eligibleSplit),
    eligibleSell:money(refineSource.eligibleSell),
    pricingBasis:clean(refineSource.pricingBasis).slice(0,80),
    minerals:(Array.isArray(refineSource.minerals)?refineSource.minerals:[]).slice(0,30).map(row=>({
      mineral:clean(row?.mineral).slice(0,80),
      quantityAt100:money(row?.quantityAt100),
      unitBuy:money(row?.unitBuy),
      valueAt100:money(row?.valueAt100),
    })).filter(row=>row.mineral),
  }:null;
  return{
    title:clean(input?.title).slice(0,120)||'JLR Appraisal',
    owner:{
      id:String(owner?.id||''),
      name:clean(owner?.displayName||owner?.name||'JLR Pilot').slice(0,80),
    },
    appraisal:{
      generatedAt:source.generatedAt||new Date().toISOString(),
      datasetTime:source.datasetTime||null,
      source:clean(source.source).slice(0,40)||'janice-v2',
      market:{
        id:Number(source?.market?.id)||2,
        name:clean(source?.market?.name).slice(0,120)||'Jita 4-4',
      },
      pricing:mode,
      pricingVariant:priceVariant,
      failures:clean(source.failures).slice(0,4000),
      items,
      summary:appraisalSummary(items,mode),
      refine,
    },
  };
}
