import {T2_SITE_DATA} from './t2-site-data.mjs';
import {t3OreVariant} from './ledger-valuation.mjs';
const FOUR_HOURS=4*3600000;
const normalize=name=>String(name||'').replace(/\s+/g,' ').trim().toLowerCase();
export function t2Site(row){return Number(row?.tier)===2?T2_SITE_DATA[row.mineral]||null:null}
export function currentT2Report(row,report,at=Date.now()){
  if(report?.status==='cleared'){
    const correctedEnd=Math.min(Date.parse(report.timerEndsAt),Date.parse(report.updatedAt)+FOUR_HOURS);
    if(Number.isFinite(correctedEnd))report={...report,timerEndsAt:new Date(correctedEnd).toISOString()};
  }
  if(report?.status==='cleared'&&Date.parse(report.timerEndsAt)<=at)return {status:'ready',cycleStartedAt:report.timerEndsAt,minedByOre:{},minedM3:0,needsScan:true};
  return report||{status:'ready',cycleStartedAt:row.scanReminderStartedAt,minedByOre:{},minedM3:0};
}
export function updateT2Ledger({characterId,rows,fields,reports,snapshots,systemCache,typeCache,sampleAt}){
  const day=sampleAt.slice(0,10),at=Date.parse(sampleAt),totals={},types={};
  for(const row of rows||[]){
    if(String(row.date)!==day)continue;
    const system=systemCache[String(row.solar_system_id)]?.name;
    if(!system)continue;
    const variant=t3OreVariant(row.type_id),cached=typeCache[String(row.type_id)]||{};
    const type={name:variant?.name||cached.name,volume:Number(variant?.volume||cached.volume),family:variant?.family};
    if(!type.name||!Number.isFinite(type.volume)||type.volume<=0)continue;
    const units=Number(row.quantity);if(!Number.isFinite(units)||units<=0)continue;
    const key=system+'|'+row.type_id;
    totals[key]=(totals[key]||0)+units;types[key]={...type,system};
  }
  const id=String(characterId),previous=snapshots[id];
  snapshots[id]={day,at:sampleAt,totals};
  if(!previous||previous.day!==day)return [];
  const changed=new Set();
  for(const [key,units] of Object.entries(totals)){
    const delta=Math.max(0,units-(previous.totals[key]||0));if(!delta)continue;
    const type=types[key];
    const candidates=fields.filter(row=>row.system===type.system&&t2Site(row)?.ores.some(ore=>normalize(ore.name)===normalize(type.name)));
    // ESI has no site identifier. Never count the same shared ore against two sites.
    if(candidates.length!==1||fields.some(row=>Number(row.tier)===3&&row.system===type.system&&row.ore===type.family))continue;
    const row=candidates[0],site=t2Site(row),report=currentT2Report(row,reports[row.id],at);
    if(report.status==='cleared')continue;
    const boundary=Date.parse(report.cycleStartedAt||row.scanReminderStartedAt||'');
    if(!Number.isFinite(boundary)||Date.parse(previous.at)<boundary||at<=Date.parse(previous.at))continue;
    const ore=site.ores.find(ore=>normalize(ore.name)===normalize(type.name));
    const minedByOre={...report.minedByOre};
    minedByOre[ore.name]=Math.min(ore.quantity*type.volume,(minedByOre[ore.name]||0)+delta*type.volume);
    const minedM3=Object.values(minedByOre).reduce((a,b)=>a+b,0);
    const complete=minedM3+1e-6>=site.siteM3;
    reports[row.id]={...report,minedByOre,minedM3,status:complete?'cleared':'picked',updatedAt:sampleAt,
      ...(complete?{scanReminderStartedAt:sampleAt}:{}),
      timerEndsAt:complete?new Date(at+FOUR_HOURS).toISOString():null,autoClearReason:complete?'esi-ledger-cap':null};
    changed.add(row.system);
  }
  return [...changed];
}
