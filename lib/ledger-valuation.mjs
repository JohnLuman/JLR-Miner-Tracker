// Exact T3 ore definitions from CCP's Static Data Export (SDE).
// The mining ledger reports the mined type_id, so grade-specific recipes must
// be selected by type ID instead of by the solar system's base ore family.
const VARIANTS = [
  {typeId:74521,family:'Mordinium',name:'Mordunium',grade:1,volume:0.1,portionSize:100,minerals:{Pyerite:97}},
  {typeId:74522,family:'Mordinium',name:'Mordunium II-Grade',grade:2,volume:0.1,portionSize:100,minerals:{Pyerite:101}},
  {typeId:74523,family:'Mordinium',name:'Mordunium III-Grade',grade:3,volume:0.1,portionSize:100,minerals:{Pyerite:107}},
  {typeId:74524,family:'Mordinium',name:'Mordunium IV-Grade',grade:4,volume:0.1,portionSize:100,minerals:{Pyerite:112}},
  {typeId:74525,family:'Ytirium',name:'Ytirium',grade:1,volume:0.6,portionSize:100,minerals:{Isogen:240}},
  {typeId:74526,family:'Ytirium',name:'Ytirium II-Grade',grade:2,volume:0.6,portionSize:100,minerals:{Isogen:252}},
  {typeId:74527,family:'Ytirium',name:'Ytirium III-Grade',grade:3,volume:0.6,portionSize:100,minerals:{Isogen:264}},
  {typeId:74528,family:'Ytirium',name:'Ytirium IV-Grade',grade:4,volume:0.6,portionSize:100,minerals:{Isogen:276}},
  {typeId:81900,family:'Kylixium',name:'Kylixium',grade:1,volume:1.2,portionSize:100,minerals:{Tritanium:300,Pyerite:200,Mexallon:550}},
  {typeId:81901,family:'Kylixium',name:'Kylixium II-Grade',grade:2,volume:1.2,portionSize:100,minerals:{Tritanium:315,Pyerite:210,Mexallon:578}},
  {typeId:81902,family:'Kylixium',name:'Kylixium III-Grade',grade:3,volume:1.2,portionSize:100,minerals:{Tritanium:330,Pyerite:220,Mexallon:605}},
  {typeId:81903,family:'Kylixium',name:'Kylixium IV-Grade',grade:4,volume:1.2,portionSize:100,minerals:{Tritanium:345,Pyerite:230,Mexallon:633}},
  {typeId:81975,family:'Griemeer',name:'Griemeer',grade:1,volume:0.8,portionSize:100,minerals:{Tritanium:250,Isogen:80}},
  {typeId:81976,family:'Griemeer',name:'Griemeer II-Grade',grade:2,volume:0.8,portionSize:100,minerals:{Tritanium:263,Isogen:84}},
  {typeId:81977,family:'Griemeer',name:'Griemeer III-Grade',grade:3,volume:0.8,portionSize:100,minerals:{Tritanium:275,Isogen:88}},
  {typeId:81978,family:'Griemeer',name:'Griemeer IV-Grade',grade:4,volume:0.8,portionSize:100,minerals:{Tritanium:288,Isogen:92}},
  {typeId:82016,family:'Nocxite',name:'Nocxite',grade:1,volume:4,portionSize:100,minerals:{Tritanium:900,Pyerite:150,Nocxium:105}},
  {typeId:82017,family:'Nocxite',name:'Nocxite II-Grade',grade:2,volume:4,portionSize:100,minerals:{Tritanium:945,Pyerite:158,Nocxium:111}},
  {typeId:82018,family:'Nocxite',name:'Nocxite III-Grade',grade:3,volume:4,portionSize:100,minerals:{Tritanium:990,Pyerite:165,Nocxium:116}},
  {typeId:82019,family:'Nocxite',name:'Nocxite IV-Grade',grade:4,volume:4,portionSize:100,minerals:{Tritanium:1035,Pyerite:173,Nocxium:121}},
  {typeId:82163,family:'Hezorime',name:'Hezorime',grade:1,volume:5,portionSize:100,minerals:{Tritanium:2000,Isogen:120,Zydrine:60}},
  {typeId:82164,family:'Hezorime',name:'Hezorime II-Grade',grade:2,volume:5,portionSize:100,minerals:{Tritanium:2100,Isogen:126,Zydrine:63}},
  {typeId:82165,family:'Hezorime',name:'Hezorime III-Grade',grade:3,volume:5,portionSize:100,minerals:{Tritanium:2200,Isogen:132,Zydrine:66}},
  {typeId:82166,family:'Hezorime',name:'Hezorime IV-Grade',grade:4,volume:5,portionSize:100,minerals:{Tritanium:2300,Isogen:138,Zydrine:69}},
  {typeId:82205,family:'Ueganite',name:'Ueganite',grade:1,volume:5,portionSize:100,minerals:{Tritanium:800,Megacyte:40}},
  {typeId:82206,family:'Ueganite',name:'Ueganite II-Grade',grade:2,volume:5,portionSize:100,minerals:{Tritanium:840,Megacyte:42}},
  {typeId:82207,family:'Ueganite',name:'Ueganite III-Grade',grade:3,volume:5,portionSize:100,minerals:{Tritanium:880,Megacyte:44}},
  {typeId:82208,family:'Ueganite',name:'Ueganite IV-Grade',grade:4,volume:5,portionSize:100,minerals:{Tritanium:920,Megacyte:46}},
];

export const T3_ORE_VARIANTS_BY_TYPE_ID = Object.freeze(Object.fromEntries(
  VARIANTS.map(row=>[String(row.typeId),Object.freeze({...row,minerals:Object.freeze({...row.minerals})})]),
));

export const BASE_T3_ORE_REPROCESSING = Object.freeze(Object.fromEntries(
  VARIANTS.filter(row=>row.grade===1).map(row=>[
    row.family,
    Object.freeze({portionSize:row.portionSize,minerals:row.minerals}),
  ]),
));

export function t3OreVariant(typeId){
  return T3_ORE_VARIANTS_BY_TYPE_ID[String(Number(typeId))]||null;
}

export function trackedT3OreVariant(expectedFamily,typeId){
  const variant=t3OreVariant(typeId);
  return variant&&variant.family===String(expectedFamily||'')?variant:null;
}

export function refinedT3BuyValue(typeId,quantity,priceByMineral,refineYield){
  const variant=t3OreVariant(typeId);
  const units=Number(quantity);
  const yieldRate=Number(refineYield);
  if(!variant||!Number.isFinite(units)||units<0||!Number.isFinite(yieldRate)||yieldRate<0)return null;
  const batches=units/variant.portionSize;
  let value=0;
  const breakdown={};
  for(const [mineral,grossPerBatch] of Object.entries(variant.minerals)){
    const unitPrice=Number(priceByMineral?.[mineral]);
    if(!Number.isFinite(unitPrice)||unitPrice<=0)return null;
    const refinedQuantity=Number(grossPerBatch)*batches*yieldRate;
    const mineralValue=refinedQuantity*unitPrice;
    breakdown[mineral]={grossPerBatch:Number(grossPerBatch),refinedQuantity,unitPrice,value:mineralValue};
    value+=mineralValue;
  }
  return {
    family:variant.family,
    grade:variant.grade,
    typeId:variant.typeId,
    units,
    volumeM3:units*variant.volume,
    value,
    breakdown,
  };
}

// Payout accounting is intentionally based on the exact mined T3 type_id.
// A solar system only matters for field attribution; valid T3 ore mined outside
// a JLR-tracked field must still contribute to app and personal payout totals.
export function aggregateTrackedT3Ledger({rows,typeById,priceByMineral,refineYield}){
  const daily=new Map();
  for(const row of rows||[]){
    const variant=t3OreVariant(row?.type_id);
    if(!variant)continue;

    const quantity=Math.max(0,Number(row?.quantity)||0);
    const cachedType=typeById?.[String(row?.type_id)]||{};
    const typeVolume=Number(cachedType.volume);
    const volumeM3=quantity*(Number.isFinite(typeVolume)&&typeVolume>0?typeVolume:variant.volume);
    const valuation=refinedT3BuyValue(row.type_id,quantity,priceByMineral,refineYield);
    const key=String(row?.date||'');
    if(!key)continue;
    const total=daily.get(key)||{date:key,m3:0,jbv:0,unpricedM3:0,ores:{}};
    const oreName=String(cachedType.name||variant.name);
    total.m3+=volumeM3;
    if(valuation)total.jbv+=valuation.value;
    else total.unpricedM3+=volumeM3;
    total.ores[oreName]=Number(total.ores[oreName]||0)+volumeM3;
    daily.set(key,total);
  }
  return [...daily.values()].sort((a,b)=>b.date.localeCompare(a.date));
}

export function janiceImmediateBuyPrices(rows,expectedNames){
  const byName={};
  for(const row of Array.isArray(rows)?rows:[]){
    const name=String(row?.itemType?.name||'').trim();
    const price=Number(row?.immediatePrices?.buyPrice);
    if(name&&Number.isFinite(price)&&price>0)byName[name]=price;
  }
  const result={};
  for(const name of expectedNames||[]){
    const price=Number(byName[name]);
    if(!Number.isFinite(price)||price<=0)return null;
    result[name]=price;
  }
  return result;
}
