export const FIELD_AUTO_CLEAR_REASON = 'esi-ledger-cap';

// A personal mining ledger is daily and cumulative. Only count an increase
// observed wholly after a scan that confirmed this site's deposit was present.
export function addVerifiedSiteMining(inference, deltaM3, previousSampleAt, sampleAt) {
  const scanAt=Date.parse(inference?.baselineAt||'');
  const previousAt=Date.parse(previousSampleAt||'');
  const currentAt=Date.parse(sampleAt||'');
  const delta=Number(deltaM3);
  if(!inference?.baselineDetected||inference.verifiedFromScanAt!==inference.baselineAt||
    !Number.isFinite(scanAt)||!Number.isFinite(previousAt)||!Number.isFinite(currentAt)||
    previousAt<scanAt||currentAt<=previousAt||!Number.isFinite(delta)||delta<=0)return false;
  inference.verifiedM3SinceScan=Math.max(0,Number(inference.verifiedM3SinceScan)||0)+delta;
  inference.verifiedLastAt=sampleAt;
  return true;
}

export function autoClearFieldAtCap(field, inference, siteM3, sampleAt, respawnMs) {
  const cap=Number(siteM3);
  const mined=Number(inference?.verifiedM3SinceScan);
  const scanAt=Date.parse(inference?.baselineAt||'');
  const verifiedAt=Date.parse(inference?.verifiedLastAt||'');
  const at=Date.parse(sampleAt||'');
  if(field?.status!=='picked'||!inference?.baselineDetected||
    inference.verifiedFromScanAt!==inference.baselineAt||
    !Number.isFinite(scanAt)||!Number.isFinite(verifiedAt)||verifiedAt<scanAt||
    !Number.isFinite(at)||at<verifiedAt||!Number.isFinite(cap)||cap<=0||
    !Number.isFinite(mined)||mined<cap||!Number.isFinite(respawnMs)||respawnMs<=0)return false;
  field.status='cleared';
  field.updatedAt=sampleAt;
  field.timerEndsAt=new Date(at+respawnMs).toISOString();
  field.autoClearedAt=sampleAt;
  field.autoClearReason=FIELD_AUTO_CLEAR_REASON;
  field.autoClearM3=mined;
  field.autoReopenedAt=null;
  field.autoReopenReason=null;
  field.autoReopenM3=null;
  return true;
}
