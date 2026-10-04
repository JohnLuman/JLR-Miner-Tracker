const POWER_STATES=new Set(['online','pending','offline','low','unknown']);

function clean(value){return String(value??'').replace(/\s+/g,' ').trim()}

export function normalizeMapFieldRow(row){
  const system=clean(row?.system);
  const mineral=clean(row?.mineral);
  const ore=clean(row?.ore);
  const tier=Number(row?.tier);
  const powerState=clean(row?.powerState||'unknown').toLowerCase();
  if(!system)throw new Error('Map field row is missing system.');
  if(!mineral)throw new Error('Map field row is missing mineral.');
  if(!ore)throw new Error('Map field row is missing ore family.');
  if(![2,3].includes(tier))throw new Error(system+' map field tier must be 2 or 3.');
  if(!POWER_STATES.has(powerState))throw new Error(system+' has invalid map power state '+powerState+'.');
  return{
    id:clean(row?.id)||['map',system,mineral,'t'+tier].join(':'),
    source:'user-map-2026-10-02',
    system,
    mineral,
    ore,
    tier,
    powerState,
    capturedAt:clean(row?.capturedAt||'2026-10-02'),
    note:clean(row?.note||''),
  };
}

export function normalizeMapFieldSnapshot(snapshot){
  const raw=Array.isArray(snapshot?.fields)?snapshot.fields:[];
  const seen=new Set();
  const fields=raw.map(normalizeMapFieldRow).filter(row=>{
    const key=[row.system.toLowerCase(),row.mineral.toLowerCase(),row.tier].join('|');
    if(seen.has(key))throw new Error('Duplicate map field '+row.system+' '+row.mineral+' T'+row.tier+'.');
    seen.add(key);
    return true;
  }).sort((a,b)=>a.tier-b.tier||a.system.localeCompare(b.system)||a.mineral.localeCompare(b.mineral));
  return{
    source:clean(snapshot?.source||'User-supplied Fountain Sovereignty Hub map'),
    capturedAt:clean(snapshot?.capturedAt||'2026-10-02'),
    key:{
      online:'Online',
      pending:'Pending',
      offline:'Offline',
      low:'Low',
      ...(snapshot?.key||{}),
    },
    fields,
  };
}

export function mapFieldSummary(snapshot){
  const fields=Array.isArray(snapshot?.fields)?snapshot.fields:[];
  const out={total:fields.length,tier2:0,tier3:0,online:0,pending:0,offline:0,low:0,unknown:0,systems:0};
  const systems=new Set();
  for(const row of fields){
    if(Number(row.tier)===2)out.tier2++;
    if(Number(row.tier)===3)out.tier3++;
    if(Object.hasOwn(out,row.powerState))out[row.powerState]++;
    else out.unknown++;
    systems.add(String(row.system));
  }
  out.systems=systems.size;
  return out;
}
