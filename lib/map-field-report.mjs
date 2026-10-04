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
