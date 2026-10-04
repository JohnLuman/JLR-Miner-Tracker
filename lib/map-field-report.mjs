export function mapFieldReport(row,reports={},at=Date.now()){
  const report=reports[row.id];
  if(!report)return {...row,status:'ready',timerEndsAt:null};
  const active=report.status==='cleared'&&Date.parse(report.timerEndsAt)>at;
  return {...row,status:active?'cleared':'ready',timerEndsAt:active?report.timerEndsAt:null,
    scanReminderStartedAt:Date.parse(report.updatedAt)>Date.parse(row.scanReminderStartedAt||'')?report.updatedAt:row.scanReminderStartedAt};
}
export function clearMapField(row,previous,{confirm,at=Date.now()}={}){
  if(!row||Number(row.tier)!==2)throw Object.assign(new Error('Unknown T2 field.'),{statusCode:404});
  if(previous?.status==='cleared'&&Date.parse(previous.timerEndsAt)>at)throw Object.assign(new Error('The respawn timer is already running.'),{statusCode:409});
  if(confirm!==true)throw Object.assign(new Error('Confirm that this ore field has been mined out.'),{statusCode:409});
  return {status:'cleared',updatedAt:new Date(at).toISOString(),timerEndsAt:new Date(at+10*3600000).toISOString()};
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
    if(Number.isFinite(real)&&real>=start)continue;
    out[system]={...existing,reminderStartedAt:new Date(start).toISOString(),
      due:at-start>=12*3600000,nextUpdateAt:new Date(start+12*3600000).toISOString(),
      kinds:[...new Set([...existing.kinds,...rows.filter(row=>row.system===system).map(row=>'t'+row.tier)])]};
  }
  return out;
}
