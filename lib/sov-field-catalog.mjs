const MINERAL_TO_ORE=Object.freeze({
  Tritanium:'Veldspar',
  Pyerite:'Mordinium',
  Mexallon:'Kylixium',
  Isogen:'Griemeer',
  Nocxium:'Nocxite',
  Zydrine:'Hezorime',
  Megacyte:'Ueganite',
});
const MINERALS=Object.keys(MINERAL_TO_ORE);
const ROMAN_TIER=Object.freeze({I:1,II:2,III:3});

function clean(value){return String(value??'').replace(/\s+/g,' ').trim()}

export function parseProspectingArrayName(value){
  const name=clean(value);
  if(!name)return null;
  const mineral=MINERALS.find(item=>new RegExp('^'+item+'\\b','i').test(name));
  if(!mineral)return null;
  const rest=name.slice(mineral.length).trim();
  const match=rest.match(/^(?:Prospecting\s+Array\s+)?(I{1,3}|[123])$/i);
  if(!match)return null;
  const token=String(match[1]||'').toUpperCase();
  const tier=ROMAN_TIER[token]||Number(token)||0;
  if(![1,2,3].includes(tier))return null;
  return{mineral,ore:MINERAL_TO_ORE[mineral],tier,name};
}

export function normalizeSovHubPowerState(value){
  const raw=clean(value).toLowerCase().replace(/[\s_-]+/g,' ');
  if(!raw)return'unknown';
  if(raw.includes('online')||raw.includes('active'))return'online';
  if(raw.includes('pending')||raw.includes('anchoring')||raw.includes('onlining'))return'pending';
  if(raw.includes('low'))return'low';
  if(raw.includes('offline')||raw.includes('disabled')||raw.includes('inactive'))return'offline';
  return raw.replace(/\s+/g,'-');
}

function legacyByMineral(legacyOres=[]){
  const out=new Map();
  for(const row of Array.isArray(legacyOres)?legacyOres:[]){
    const upgrade=clean(row?.upgrade);
    const match=upgrade.match(/^(Tritanium|Pyerite|Mexallon|Isogen|Nocxium|Zydrine|Megacyte)\b/i);
    if(!match)continue;
    const mineral=MINERALS.find(x=>x.toLowerCase()===match[1].toLowerCase());
    if(!mineral)continue;
    out.set(mineral,row);
  }
  return out;
}

export function buildSovFieldCatalog({
  hubs=[],
  detailsByHubId={},
  namesById={},
  legacyOres=[],
  fountainSystemIds=null,
}={}){
  const names=namesById instanceof Map?namesById:new Map(Object.entries(namesById||{}).map(([id,name])=>[Number(id),name]));
  const details=detailsByHubId instanceof Map?detailsByHubId:new Map(Object.entries(detailsByHubId||{}).map(([id,row])=>[Number(id),row]));
  const allowed=fountainSystemIds instanceof Set?fountainSystemIds:(Array.isArray(fountainSystemIds)?new Set(fountainSystemIds.map(Number)):null);
  const legacy=legacyByMineral(legacyOres);
  const out=[];

  const listing=Array.isArray(hubs)?hubs:[];
  for(const hub of listing){
    const hubId=Number(hub?.id);
    const systemId=Number(hub?.solar_system_id);
    if(!Number.isSafeInteger(hubId)||hubId<=0||!Number.isSafeInteger(systemId)||systemId<=0)continue;
    if(allowed&&!allowed.has(systemId))continue;
    const detail=details.get(hubId)||hub?.detail||null;
    const upgrades=Array.isArray(detail?.upgrades)?detail.upgrades:[];
    for(const upgrade of upgrades){
      const typeId=Number(upgrade?.type_id);
      if(!Number.isSafeInteger(typeId)||typeId<=0)continue;
      const upgradeName=clean(names.get(typeId)||upgrade?.name||'');
      const parsed=parseProspectingArrayName(upgradeName);
      if(!parsed||![2,3].includes(parsed.tier))continue;
      const system=clean(names.get(systemId)||hub?.system||detail?.system||('System '+systemId));
      const legacyRow=legacy.get(parsed.mineral)||null;
      const siteM3=parsed.tier===3&&Number(legacyRow?.siteM3)>0?Number(legacyRow.siteM3):null;
      const jbvPerM3=Number(legacyRow?.jbvPerM3)>0?Number(legacyRow.jbvPerM3):null;
      out.push({
        fieldId:'sov:'+systemId+':'+typeId,
        source:'esi-sov-hub',
        hubId,
        systemId,
        system,
        upgradeTypeId:typeId,
        upgradeName,
        powerState:normalizeSovHubPowerState(upgrade?.power_state),
        mineral:parsed.mineral,
        ore:parsed.ore,
        tier:parsed.tier,
        siteM3,
        siteM3Known:siteM3!==null,
        jbvPerM3,
        siteJBV:siteM3!==null&&jbvPerM3!==null?siteM3*jbvPerM3:null,
        respawnHours:parsed.tier===3?10:null,
      });
    }
  }
  return out.sort((a,b)=>a.tier-b.tier||a.system.localeCompare(b.system)||a.mineral.localeCompare(b.mineral));
}

export function summarizeSovFieldCatalog(rows=[]){
  const list=Array.isArray(rows)?rows:[];
  const summary={total:list.length,tier2:0,tier3:0,online:0,pending:0,offline:0,low:0,other:0,systems:0};
  const systems=new Set();
  for(const row of list){
    if(Number(row?.tier)===2)summary.tier2++;
    if(Number(row?.tier)===3)summary.tier3++;
    const state=String(row?.powerState||'other');
    if(Object.hasOwn(summary,state)&&state!=='total'&&state!=='systems')summary[state]++;
    else summary.other++;
    if(row?.system)systems.add(String(row.system));
  }
  summary.systems=systems.size;
  return summary;
}
