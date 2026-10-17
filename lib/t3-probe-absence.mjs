// Reported absence is a *scan observation*, not a quantity inferred from ESI.
// EVE's Probe Scanner may be filtered or clipped, so require structured copy
// evidence or two separated, readable screen-observer frames before clearing.
export function credibleAbsentT3Scan(text,scan,{observer=false}={}){
  if(!scan?.valid||scan.detected)return false;
  const lines=String(text||'').slice(0,100000).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const scannerLines=lines.filter(line=>/\bcosmic\s+(?:anomaly|signature)\b|\b(?:ore|gas)\s+site\b/i.test(line));
  const tabRows=lines.filter(line=>line.includes('\t')&&/\bcosmic\s+(?:anomaly|signature)\b|\b(?:ore|gas)\s+site\b/i.test(line));
  if(observer){
    const hasScannerUI=/\bprobe\s*scanner\b|\bsignal\s*strength\b/i.test(String(text||''));
    const metrics=(String(text||'').match(/\b\d+(?:\.\d+)?\s*(?:au|km|m)\b|\b\d+(?:\.\d+)?\s*%/ig)||[]).length;
    return lines.length>=5&&hasScannerUI&&scannerLines.length>=1&&metrics>=1;
  }
  const header=lines.some(line=>/\b(?:signal\s+strength|scan\s+group)\b/i.test(line))
    &&lines.some(line=>/\bdistance\b/i.test(line));
  return tabRows.length>=2||(tabRows.length>=1&&header);
}

export const OBSERVER_NEGATIVE_CONFIRM_MS=15_000;
export const OBSERVER_NEGATIVE_EXPIRES_MS=3*60_000;
export function observeAbsentT3(previous,{characterId,system,scanText,at=Date.now()}){
  const id=String(characterId||''), name=String(system||'');
  if(!id||!name||!Number.isFinite(at))return{confirmed:false,next:{characterId:id,system:name,firstAt:at,observations:1}};
  const same=previous&&previous.characterId===id&&previous.system===name;
  const elapsed=same?at-Number(previous.firstAt):NaN;
  if(!same||!Number.isFinite(elapsed)||elapsed<0||elapsed>OBSERVER_NEGATIVE_EXPIRES_MS){
    return{confirmed:false,next:{characterId:id,system:name,firstAt:at,observations:1}};
  }
  if(elapsed<OBSERVER_NEGATIVE_CONFIRM_MS){
    return{confirmed:false,next:previous,retryInMs:OBSERVER_NEGATIVE_CONFIRM_MS-elapsed};
  }
  return{confirmed:true,next:null};
}

export function markAbsentT3FieldCleared(field,at,{respawnMs=10*60*60*1000}={}){
  if(!field)throw new Error('Missing tracked field');
  const ms=Date.parse(String(at||''));
  if(!Number.isFinite(ms)||!(respawnMs>0))throw new Error('Invalid clear timestamp');
  const timerMs=Date.parse(field.timerEndsAt||'');
  if(field.status==='cleared'&&Number.isFinite(timerMs)&&timerMs>ms)
    return{applied:false,alreadyCleared:true};
  const previousStatus=String(field.status||'ready');
  field.status='cleared';
  field.timerEndsAt=new Date(ms+respawnMs).toISOString();
  field.updatedAt=at;
  field.autoClearedAt=at;
  field.autoClearReason='probe-scan-absent';
  field.autoClearM3=null;
  field.autoReopenedAt=null;
  field.autoReopenReason=null;
  field.autoReopenM3=null;
  field.ledgerMinedM3=0;
  field.ledgerPickedAt=null;
  field.ledgerLastActivityAt=null;
  return{applied:true,from:previousStatus,to:'cleared',at,timerEndsAt:field.timerEndsAt,reason:'probe-scan-absent'};
}
