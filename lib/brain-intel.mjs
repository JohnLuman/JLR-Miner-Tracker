// The personal ESI mining ledger is daily. These are changes observed between
// two complete snapshots, never claims about the exact time ore was mined.
export function positiveLedgerDeltas(previous,current){
  if(!Array.isArray(previous)||!Array.isArray(current))return [];
  const quantities=new Map();
  const key=row=>`${row?.date||''}|${row?.solar_system_id||''}|${row?.type_id||''}`;
  for(const row of previous){
    const id=key(row);
    quantities.set(id,(quantities.get(id)||0)+Math.max(0,Number(row?.quantity)||0));
  }
  const deltas=[];
  for(const row of current){
    if(!row?.date||!row?.solar_system_id||!row?.type_id)continue;
    const id=key(row);
    const quantity=Math.max(0,Number(row.quantity)||0);
    const prior=Math.max(0,quantities.get(id)||0);
    const increment=Math.max(0,quantity-prior);
    quantities.set(id,Math.max(0,prior-quantity));
    if(increment>0)deltas.push({...row,quantity:increment});
  }
  return deltas;
}

export function dueRouteStops(route,trackedById,{limit=3}={}){
  const seen=new Set();
  const stops=[];
  for(let index=0;index<(route||[]).length;index++){
    const id=String(route[index]);
    if(seen.has(id))continue;
    seen.add(id);
    const candidate=trackedById?.get(id);
    if(!candidate?.needsScan)continue;
    if(candidate.clearedUntil&&Date.parse(candidate.clearedUntil)>Date.now()&&!candidate.ledgerNeedsScan)continue;
    stops.push({...candidate,jumpsFromOrigin:index,atDestination:index===route.length-1});
    if(stops.length>=limit)break;
  }
  return stops;
}

export function fountainRouteDestination(raw,cnSystemName='C-N4OD'){
  const match=String(raw||'').match(/\b(?:heading|headed|going|travelling|traveling|flying|on\s+(?:my\s+|the\s+)?way|en\s+route|route)\s+(?:(?:over\s+)?to|towards?)\s+([a-z0-9]+(?:[ -][a-z0-9]+){0,3})/i);
  if(!match)return null;
  const phrase=match[1].split(/\b(?:what|which|where|could|can|should|for|and|so|to|i'm|i am)\b/i)[0].replace(/[.,!?].*$/,'').trim();
  if(!phrase||/^(?:anywhere|somewhere|a system|the fountain|fountain)\b/i.test(phrase))return '';
  if(/^c[ -]?n(?:[ -]?4od)?$/i.test(phrase)||/^c[ -]?n\b/i.test(phrase))return cnSystemName;
  return phrase;
}

// Resolve operational questions before the general feature/help responses. In
// particular, asking which field needs an update means choosing a destination.
export function brainLiveIntent(raw){
  const q=String(raw||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  if(/\b(?:how much|what|total|made|earned|earnings|income|payout)\b/.test(q)
    &&/\b(?:this hour|current hour|last hour|past hour|hourly|so far this hour)\b/.test(q)){
    return{kind:'earnings',period:/\blast hour\b/.test(q)?'last':/\bpast hour\b/.test(q)?'past':'current'};
  }
  if(/\b(?:heading|headed|going|travelling|traveling|flying|on (?:my |the )?way|en route|route)\b/.test(q)
    &&/\b(?:to|toward|towards)\b/.test(q)&&!/\b(?:closest|nearest)\b/.test(q))return{kind:'route'};

  const updatesOnly=/\b(?:update|updates|updating|scan|scans|scanning|stale|refresh|due)\b/.test(q);
  const nearby=/\b(?:closest|nearest|nearby|near|close|around)\b/.test(q);
  const choosing=/\b(?:which|what|where|find|show|tell|give|pick|recommend|suggest|should|could)\b/.test(q);
  const target=/\b(?:system|systems|field|fields|place|places|scan|scans|update|updates|go|stop)\b/.test(q);
  const nextOperational=/\b(?:next|another)\b/.test(q)&&target;
  if(nextOperational)return{kind:'nearest',updatesOnly:true};
  if(nearby||(updatesOnly&&choosing&&target))return{kind:'nearest',updatesOnly};
  if(/\b(?:where is|where are|where am|where s|location|what system|which system|in what system)\b/.test(q))return{kind:'location'};
  return{kind:'general'};
}
