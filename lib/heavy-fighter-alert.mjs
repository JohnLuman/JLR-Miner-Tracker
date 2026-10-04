export const DEFAULT_HEAVY_FIGHTER_ALERT_MAX_AGE_MS = 60 * 1000;

export function heavyFighterAlertFresh(row, nowMs=Date.now(), maxAgeMs=DEFAULT_HEAVY_FIGHTER_ALERT_MAX_AGE_MS){
  const receivedMs=Date.parse(String(row?.receivedAt||''));
  if(!Number.isFinite(receivedMs))return false;
  const age=Number(nowMs)-receivedMs;
  return age>=0&&age<=Math.max(0,Number(maxAgeMs)||0);
}

export function reportableHeavyFighterVictim(row, initAllianceId){
  const victim=row?.victim||{};
  const allianceId=Number(victim.allianceId??victim.alliance_id)||0;
  return allianceId!==Number(initAllianceId);
}

export function buildSimulatedHeavyFighterLoss({
  killmailId,
  nowIso=new Date().toISOString(),
  shipTypeId,
  shipTypeName='Heavy Fighter',
  systemId,
  systemName='JLR TEST SYSTEM',
  totalValue=987654321,
  runId='',
}={}){
  const id=Number(killmailId);
  if(!Number.isSafeInteger(id)||id<=0)throw new Error('Simulated Heavy Fighter loss requires a positive safe killmail ID.');
  const typeId=Number(shipTypeId)||0;
  if(!typeId)throw new Error('Simulated Heavy Fighter loss requires a Heavy Fighter type ID.');
  const solarSystemId=Number(systemId)||0;
  return{
    killmailId:id,
    killmailTime:nowIso,
    receivedAt:nowIso,
    shipTypeId:typeId,
    shipTypeName:String(shipTypeName||'Heavy Fighter'),
    systemId:solarSystemId||null,
    systemName:String(systemName||'JLR TEST SYSTEM'),
    closest:null,
    victim:{
      characterId:null,
      characterName:'JLR Alarm Test Victim',
      corporationId:null,
      corporationName:'JLR TEST HARNESS',
      allianceId:null,
      allianceName:null,
      damageTaken:1,
    },
    finalBlow:{
      characterId:null,
      characterName:'JLR Alarm Test',
      corporationId:null,
      corporationName:'JLR TEST HARNESS',
      allianceId:null,
      allianceName:null,
      shipTypeId:null,
      shipTypeName:null,
      damageDone:1,
    },
    attackerCount:1,
    totalValue:Math.max(0,Number(totalValue)||0),
    points:0,
    npc:false,
    solo:true,
    awox:false,
    href:null,
    live:true,
    simulated:true,
    simulationRunId:String(runId||''),
  };
}
