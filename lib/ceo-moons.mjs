import { gunzipSync } from 'node:zlib';

const finite=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const clean=value=>String(value??'').slice(0,240);
export function decodeMoonBaseline(encoded){
  if(!encoded)return {available:false,records:[],notes:['Admin workbook has not been imported.']};
  try{
    const raw=JSON.parse(gunzipSync(Buffer.from(encoded,'base64'),{maxOutputLength:1_000_000}).toString('utf8'));
    if(!Array.isArray(raw.records)||raw.records.length>5000)throw new Error('Invalid moon records');
    const seen=new Set();
    const records=raw.records.filter(row=>row?.name&&row?.system).map(row=>{
      const name=clean(row.name),system=clean(row.system);
      const key=(system+'|'+name).toLowerCase();
      if(seen.has(key))throw new Error('Duplicate moon record');
      seen.add(key);
      const estimates={};
      for(const field of ['buyPerPull','sellPerPull','dailyBuy','dailySell','magmaBreakevenBuy','magmaBreakevenSell','buy28Days','sell28Days','fullMoonSell','allianceTax'])estimates[field]=finite(row.estimates?.[field]);
      estimates.recoupDays=clean(row.estimates?.recoupDays);
      const composition=(Array.isArray(row.composition)?row.composition:[]).filter(item=>finite(item?.fraction)!==null&&item.fraction>0&&item.fraction<=1).map(item=>({name:clean(item.name),fraction:item.fraction}));
      return {name,system,composition,estimates,recordedName:clean(row.recordedName),note:clean(row.note),sourceRow:finite(row.sourceRow),estimateRow:finite(row.estimateRow)};
    });
    const totals={};
    for(const field of ['dailyBuy','dailySell','buy28Days','sell28Days','allianceTax'])totals[field]={value:records.reduce((sum,row)=>sum+(row.estimates[field]??0),0),missing:records.filter(row=>row.estimates[field]===null).length};
    return {available:true,source:clean(raw.source),sheet:clean(raw.sheet),sourceDate:clean(raw.sourceDate),importedAt:clean(raw.importedAt),records,systems:[...new Set(records.map(row=>row.system))].sort(),totals,assumptions:Object.fromEntries(Object.entries(raw.assumptions||{}).map(([key,value])=>[clean(key),finite(value)])),notes:(raw.notes||[]).map(clean)};
  }catch{return {available:false,records:[],notes:['Admin workbook import is invalid. Existing live structure data remains available.']};}
}

export function structureRows(rows,names=new Map(),at=Date.now()){
  return (Array.isArray(rows)?rows:[]).filter(row=>Number.isSafeInteger(row?.structure_id)&&row.structure_id>0).map(row=>{
    const fuelTime=Date.parse(row.fuel_expires||'');
    const fuelHours=Number.isFinite(fuelTime)?(fuelTime-at)/3_600_000:null;
    return {structureId:row.structure_id,systemId:Number(row.system_id)||null,system:names.get(Number(row.system_id))||String(row.system_id||'Unknown'),type:names.get(Number(row.type_id))||String(row.type_id||'Unknown'),state:clean(row.state),fuelExpires:Number.isFinite(fuelTime)?new Date(fuelTime).toISOString():null,fuelHours,fuelStatus:fuelHours===null?'UNKNOWN':fuelHours<=0?'EXPIRED':fuelHours<=72?'LOW':'OK',services:(row.services||[]).map(service=>({name:clean(service.name),state:clean(service.state)}))};
  }).sort((a,b)=>(a.fuelHours??Infinity)-(b.fuelHours??Infinity)||a.system.localeCompare(b.system));
}
