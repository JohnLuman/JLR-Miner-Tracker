// Operator soft reset: all T3 deposits are ASSUMED present, not probe-scanned.
// Never promote this assumption into a verified ESI depletion baseline.
export function snapshotT3ForSoftReset(state, definitions, id, at) {
  if(!/^[A-Za-z0-9_-]{8,64}$/.test(String(id||'')))throw new Error('Invalid soft reset id');
  if(!Number.isFinite(Date.parse(at)))throw new Error('Invalid soft reset timestamp');
  const systems=[...new Set((definitions||[]).map(row=>String(row.system)))];
  const fields={},scans={},inference={};
  for(const system of systems){
    if(!state.fields?.[system])throw new Error('Missing tracked T3 field '+system);
    fields[system]=structuredClone(state.fields[system]);
    scans[system]=structuredClone(state.scans?.[system]||null);
    inference[system]=structuredClone(state.esi?.fieldInference?.[system]||null);
  }
  return {id,at,systems,fields,scans,inference};
}

export function applyT3SoftReset(state, definitions, id, at) {
  if(state.lastT3SoftReset?.id===id)return {alreadyApplied:true,count:0};
  if(!/^[A-Za-z0-9_-]{8,64}$/.test(String(id||'')))throw new Error('Invalid soft reset id');
  if(!Number.isFinite(Date.parse(at)))throw new Error('Invalid soft reset timestamp');
  state.scans||={};
  state.esi||={};
  state.esi.fieldInference||={};
  let count=0;
  for(const d of definitions||[]){
    const system=String(d.system);
    const field=state.fields?.[system];
    if(!field)throw new Error('Missing T3 field '+system);
    Object.assign(field,{
      status:'ready',cherryPicked:false,timerEndsAt:null,updatedAt:at,
      autoReopenedAt:null,autoReopenReason:null,autoReopenM3:null,
      autoClearedAt:null,autoClearReason:null,autoClearM3:null,
      ledgerPickedAt:null,ledgerLastActivityAt:null,ledgerMinedM3:0,
      softResetAt:at,softResetId:id,
    });
    // A reminder acknowledgement, NOT a fabricated CCP Probe Scanner result.
    state.scans[system]={
      ...(state.scans[system]||{}),
      lastScanAt:at,source:'operator-soft-reset',kinds:['t3'],scannerRowCount:0,
      t3:{ore:String(d.ore||''),detected:false},
    };
    state.esi.fieldInference[system]={
      ...(state.esi.fieldInference[system]||{}),
      baselineAt:at,baselineDetected:false,
      verifiedFromScanAt:null,verifiedM3SinceScan:0,verifiedLastAt:null,
      minedM3SinceBaseline:0,minedM3SinceSite:0,activityStartedAt:null,
      lastDeltaM3:0,lastLedgerAt:null,seededAt:null,seededDay:null,
      depletionPct:null,needsScan:false,likelyDepleted:false,
      respawnCompletedAt:at,siteM3:Number(d.siteM3)||0,
    };
    count++;
  }
  state.lastT3SoftReset={id,at,count,mode:'assumed-present-unverified'};
  return {alreadyApplied:false,count,at,id};
}
