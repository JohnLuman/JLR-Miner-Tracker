// ESI character mining ledgers are date-wide cumulative snapshots.
// Two close, ordered observations are required for a defensible mining delta.
// A gap, midnight rollover or new scan/cycle boundary requires a new baseline.
export const FIELD_ESI_MAX_POLL_GAP_MS=90*60*1000;
export const FIELD_SCAN_FRESH_MS=12*60*60*1000;

export function freshLedgerInterval(previousAt,sampledAt,{maxGapMs=FIELD_ESI_MAX_POLL_GAP_MS,afterAt=null}={}){
  const prev=Date.parse(String(previousAt||''));
  const cur=Date.parse(String(sampledAt||''));
  const after=afterAt==null?NaN:Date.parse(String(afterAt||''));
  return Number.isFinite(prev)&&Number.isFinite(cur)&&cur>prev&&cur-prev<=maxGapMs
    &&new Date(prev).toISOString().slice(0,10)===new Date(cur).toISOString().slice(0,10)
    &&(!Number.isFinite(after)||prev>=after);
}

export function freshConfirmedScan(scan,at=Date.now()){
  const scanAt=Date.parse(String(scan?.lastScanAt||''));
  const time=Number(at);
  return scan?.source==='probe-scan'&&scan?.t3?.detected===true
    &&Number.isFinite(scanAt)&&Number.isFinite(time)
    &&time>=scanAt&&time-scanAt<FIELD_SCAN_FRESH_MS;
}
