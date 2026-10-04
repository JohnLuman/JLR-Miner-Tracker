import {t2Site,currentT2Report} from './map-field-ledger.mjs';
export function mapFieldReport(row,reports={},at=Date.now()){
  const report=currentT2Report(row,reports[row.id],at);
  const site=t2Site(row);
  const active=report.status==='cleared'&&Date.parse(report.timerEndsAt)>at;
  return {...row,siteM3:site?.siteM3||null,minedM3:Math.max(0,Number(report.minedM3)||0),status:active?'cleared':report.status==='picked'?'picked':'ready',timerEndsAt:active?report.timerEndsAt:null,
    cycleStartedAt:report.cycleStartedAt||null,needsScan:Boolean(report.needsScan),
    scanReminderStartedAt:Date.parse(report.scanReminderStartedAt)>Date.parse(row.scanReminderStartedAt||'')?report.scanReminderStartedAt:row.scanReminderStartedAt};
}
export function clearMapField(row,previous,{confirm,at=Date.now()}={}){
  if(!row||Number(row.tier)!==2)throw Object.assign(new Error('Unknown T2 field.'),{statusCode:404});
  previous=currentT2Report(row,previous,at);
  if(previous?.status==='cleared'&&Date.parse(previous.timerEndsAt)>at)throw Object.assign(new Error('The respawn timer is already running.'),{statusCode:409});
  if(confirm!==true)throw Object.assign(new Error('Confirm that this ore field has been mined out.'),{statusCode:409});
  return {...previous,status:'cleared',updatedAt:new Date(at).toISOString(),scanReminderStartedAt:new Date(at).toISOString(),timerEndsAt:new Date(at+4*3600000).toISOString()};
}
export function applyMapScanReminders(rows,scans,at=Date.now()){
  const out={...scans};
  const starts=new Map();
  for(const row of rows){
    const ms=Date.parse(row.scanReminderStartedAt||'');
    if(Number.isFinite(ms))starts.set(row.system,Math.min(starts.get(row.system)??Infinity,ms));
  }
  for(const [system,start] of starts){
    const existing=out[system]||{lastScanAt:null,kinds:[],source:null};
    const real=Date.parse(existing.lastScanAt||'');
    const respawnDue=rows.some(row=>row.system===system&&row.needsScan&&(!Number.isFinite(real)||real<Date.parse(row.cycleStartedAt||'')));
    if(Number.isFinite(real)&&real>=start){if(respawnDue)out[system]={...existing,due:true};continue;}
    out[system]={...existing,reminderStartedAt:new Date(start).toISOString(),
      due:respawnDue||at-start>=12*3600000,nextUpdateAt:new Date(start+12*3600000).toISOString(),
      kinds:[...new Set([...existing.kinds,...rows.filter(row=>row.system===system).map(row=>'t'+row.tier)])]};
  }
  return out;
}
