import {T2_SITE_DATA} from './t2-site-data.mjs';
import {t3OreVariant,trackedT3OreVariant} from './ledger-valuation.mjs';

const normalize=value=>String(value||'').replace(/\s+/g,' ').trim().toLowerCase();

function t2Matches(row,typeName){
  if(Number(row?.tier)!==2||!typeName)return false;
  const site=T2_SITE_DATA[row?.mineral];
  return Boolean(site?.ores?.some(ore=>normalize(ore?.name)===normalize(typeName)));
}

export function fieldMiningTargets({
  system,
  typeId,
  typeName='',
  t3Definition=null,
  mapFields=[],
  iceSystems=[],
  iceNames=[],
}={}){
  const name=String(typeName||'').trim();
  const variant=t3OreVariant(typeId);

  if(t3Definition&&trackedT3OreVariant(t3Definition.ore,typeId)){
    return ['t3:'+system];
  }

  const mapT3=(mapFields||[]).filter(row=>
    Number(row?.tier)===3&&
    String(row?.system)===String(system)&&
    variant&&String(row?.ore)===String(variant.family)
  );
  if(mapT3.length===1){
    const id=String(mapT3[0].id||[mapT3[0].system,mapT3[0].mineral,mapT3[0].tier].join('|'));
    return ['map:'+id];
  }
  if(mapT3.length>1)return [];

  const resolvedName=name||variant?.name||'';
  if(resolvedName&&(mapFields||[]).some(row=>String(row?.system)===String(system)&&t2Matches(row,resolvedName))){
    return ['map:t2|'+system];
  }

  const iceSystemSet=new Set((iceSystems||[]).map(String));
  const iceNameSet=new Set((iceNames||[]).map(normalize));
  if(resolvedName&&iceSystemSet.has(String(system))&&iceNameSet.has(normalize(resolvedName))){
    return ['ice:'+system];
  }

  return [];
}
