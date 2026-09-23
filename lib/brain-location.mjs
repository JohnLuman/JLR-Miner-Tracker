export function eligibleTrackedSystems(names,activity,updatesOnly=false){
  const unique=[...new Set(names.filter(Boolean))];
  if(!updatesOnly)return unique;
  return unique.filter(system=>{
    const row=activity[system];
    // A system with no scan is due too; it must not disappear from update queries.
    return !row||Boolean(row.due||row.ledger?.needsScan||row.ledger?.likelyDepleted);
  });
}

export async function nearestTrackedSystems(originSystemId,{
  names,activity,updatesOnly=false,limit=1,resolveIds,routeJumps,concurrency=6,
}){
  const candidates=eligibleTrackedSystems(names,activity,updatesOnly);
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
