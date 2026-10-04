export const RECENT_MINING_MS=45*60*1000;
// Daily ESI totals are a baseline, never evidence of a new mining session.
export function recordSystemMining({characterId,rows,snapshots,activity,systemCache,sampleAt}){
  const at=Date.parse(sampleAt),day=String(sampleAt).slice(0,10),totals={};
  if(!Number.isFinite(at))return;
  for(const row of rows||[]){
    const quantity=Number(row.quantity);
    if(String(row.date)!==day||!Number.isFinite(quantity)||quantity<=0)continue;
    const system=systemCache[String(row.solar_system_id)]?.name;
    if(!system)continue;
    const key=JSON.stringify([system,String(row.type_id)]);
    totals[key]=(totals[key]||0)+quantity;
  }
  const key=String(characterId),previous=snapshots[key],previousAt=Date.parse(previous?.at);
  if(Number.isFinite(previousAt)&&at<=previousAt)return;
  snapshots[key]={day,at:sampleAt,totals};
  // Reconnecting after a long gap cannot establish recent activity.
  if(!previous||previous.day!==day||!Number.isFinite(previousAt)||at-previousAt>RECENT_MINING_MS)return;
  for(const [key,quantity] of Object.entries(totals)){
    if(quantity<=Number(previous.totals?.[key]||0))continue;
    const [system]=JSON.parse(key);
    if(!activity[system]||Date.parse(activity[system])<at)activity[system]=sampleAt;
  }
}
export function recentSystemMining(activity,at=Date.now()){
  return Object.fromEntries(Object.entries(activity||{}).filter(([,stamp])=>{
    const age=at-Date.parse(stamp);
    return Number.isFinite(age)&&age>=0&&age<RECENT_MINING_MS;
  }));
}
