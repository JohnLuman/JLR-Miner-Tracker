export const INIT_ALLIANCE_ID=1900696668;

// EVE standings are ordered by specificity: character, corporation, alliance.
// Our public classifications use INIT alliance contacts only; never someone's
// personal standings or guessed hostility from ship hulls and PvP statistics.
export function initStandingClass({characterId=0,corporationId=0,allianceId=0}={},contacts=null){
  if(Number(allianceId)===INIT_ALLIANCE_ID)return 'friendly';
  if(!(contacts instanceof Map))return 'unknown';
  for(const id of [characterId,corporationId,allianceId]){
    const target=Number(id);
    if(target>0&&contacts.has(target)){
      const score=Number(contacts.get(target));
      return score>0?'friendly':score<0?'hostile':'neutral';
    }
  }
  // No entry in verified INIT contacts means neutral (0.0), not red.
  return 'neutral';
}
export function initSovClass(allianceId,contacts=null){
  const id=Number(allianceId);
  if(!id)return 'unclaimed';
  return initStandingClass({allianceId:id},contacts);
}
