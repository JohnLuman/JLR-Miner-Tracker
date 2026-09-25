export function actionableLedgerScanWarning(row){
  const ledger=row?.ledger;
  if(!ledger?.needsScan&&!ledger?.likelyDepleted)return false;
  const scanAt=Date.parse(row?.lastScanAt||'');
  const respawnAt=Date.parse(ledger?.respawnCompletedAt||'');
  if(Number.isFinite(respawnAt)&&(!Number.isFinite(scanAt)||respawnAt>scanAt))return true;
  const evidenceAt=Date.parse(ledger?.lastActivityAt||'');
  // A new Probe Scanner copy answers older ledger warnings. Only mining
  // observed after that copy can ask the pilot to scan the same field again.
  return !Number.isFinite(scanAt)||!Number.isFinite(evidenceAt)||evidenceAt>scanAt;
}

export function needsScanUpdate(row){
  return !row||Boolean(row.due||actionableLedgerScanWarning(row));
}

export function recentlyScannedSystem(actions,scans,{at=Date.now(),maxAgeMs=30*60_000}={}){
  const last=[...(Array.isArray(actions)?actions:[])].reverse().find(row=>row?.kind==='scan-updated'&&row.system);
  if(!last)return '';
  const actionAt=Number(last.at);
  const scanAt=Date.parse(scans?.[last.system]?.lastScanAt||'');
  const age=at-actionAt;
  return Number.isFinite(actionAt)&&age>=0&&age<=maxAgeMs
    &&Number.isFinite(scanAt)&&Math.abs(scanAt-actionAt)<60_000?last.system:'';
}

export function eligibleTrackedSystems(names,activity,updatesOnly=false,excludeSystem=''){
  const unique=[...new Set(names.filter(Boolean))];
  if(!updatesOnly)return unique.filter(system=>system!==excludeSystem);
  return unique.filter(system=>{
    if(system===excludeSystem)return false;
    const row=activity?.[system];
    // A system with no scan is due too; it must not disappear from update queries.
    return needsScanUpdate(row);
  });
}

export async function nearestTrackedSystems(originSystemId,{
  names,activity,updatesOnly=false,excludeSystem='',limit=1,resolveIds,routeJumps,concurrency=6,
}){
  const candidates=eligibleTrackedSystems(names,activity,updatesOnly,excludeSystem);
  if(!candidates.length)return{candidates:0,rows:[]};
  const ids=await resolveIds(candidates);
  const queue=candidates.map(system=>({system,id:Number(ids.get(system))||0})).filter(row=>row.id>0);
  const rows=[];
  let cursor=0;
  const workers=Array.from({length:Math.min(Math.max(1,concurrency),queue.length)},async()=>{
    while(cursor<queue.length){
      const row=queue[cursor++];
      try{
        const jumps=Number(originSystemId)===row.id?0:await routeJumps(Number(originSystemId),row.id,row.system);
        if(!Number.isInteger(jumps)||jumps<0)continue;
        rows.push({...row,jumps,due:!activity[row.system]||Boolean(activity[row.system].due),activity:activity[row.system]||null});
      }catch(error){
        // One unreachable route should not prevent another tracked system from winning.
      }
    }
  });
  await Promise.all(workers);
  rows.sort((a,b)=>a.jumps-b.jumps||Number(b.due)-Number(a.due)||a.system.localeCompare(b.system));
  return{candidates:candidates.length,rows:rows.slice(0,Math.max(1,Number(limit)||1))};
}
