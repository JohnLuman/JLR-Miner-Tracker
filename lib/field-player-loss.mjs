export const PLAYER_LOSS_WINDOW_MS=30*60*1000;
export function recordPlayerLoss(store,km,at=Date.now()){
  const time=Date.parse(km?.killmail_time||'');
  const id=Number(km?.killmail_id),systemId=Number(km?.solar_system_id);
  if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(systemId)||systemId<=0||!(Number(km?.victim?.character_id)>0)||!(Number(km?.victim?.ship_type_id)>0)||!Number.isFinite(time)||time>at||at-time>=PLAYER_LOSS_WINDOW_MS)return false;
  const current=store[systemId];
  if(current&&Date.parse(current.at)>=time)return false;
  store[systemId]={at:new Date(time).toISOString(),killmailId:id};
  return true;
}
export function prunePlayerLosses(store,at=Date.now()){
  for(const [id,row]of Object.entries(store)){
    const time=Date.parse(row?.at||'');
    if(!Number.isFinite(time)||time>at||at-time>=PLAYER_LOSS_WINDOW_MS)delete store[id];
  }
}
export function playerLossSnapshot(store,systemNames,at=Date.now()){
  prunePlayerLosses(store,at);
  return Object.fromEntries([...systemNames].flatMap(([name,id])=>store[id]?[[name,store[id]]]:[]));
}
