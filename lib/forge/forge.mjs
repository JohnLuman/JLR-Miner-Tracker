export const FORGE_STATUSES = Object.freeze(['planning','needs-mats','ready','building','done']);

function clean(value){
  return String(value??'').normalize('NFKC').replace(/\u00a0/g,' ').trim();
}

function parseQty(value){
  const n=Number(String(value??'').replace(/,/g,'').trim());
  return Number.isFinite(n)&&n>0?Math.floor(n):null;
}

export function parseForgePaste(text){
  const rows=[];
  const rejected=[];
  const lines=String(text??'').replace(/\r/g,'').split('\n').map(clean).filter(Boolean);
  for(const raw of lines.slice(0,100)){
    const tab=raw.split('\t').map(clean).filter(Boolean);
    let name='',quantity=null;
    if(tab.length>=2){
      // Native EVE inventory exports are usually Item Name<TAB>Quantity<...>.
      const second=parseQty(tab[1]);
      if(second){name=tab[0];quantity=second}
    }
    if(!name){
      let m=raw.match(/^([\d,]+)\s*[x×]?\s+(.+)$/i);
      if(m){quantity=parseQty(m[1]);name=clean(m[2])}
      else{
        m=raw.match(/^(.+?)\s+[x×]\s*([\d,]+)$/i);
        if(m){name=clean(m[1]);quantity=parseQty(m[2])}
      }
    }
    if(!name){
      const m=raw.match(/^(.+?)\s+([\d,]+)$/);
      if(m&&parseQty(m[2])){name=clean(m[1]);quantity=parseQty(m[2])}
    }
    if(!name){name=raw;quantity=1}
    name=name.replace(/^Compressed\s+/i,'Compressed ').trim();
    if(!name||!(quantity>0)){rejected.push(raw);continue}
    rows.push({name,quantity,raw});
  }
  return {valid:rows.length>0,rows,rejected,lineCount:lines.length};
}

export function aggregateForgeMaterials(items){
  const map=new Map();
  for(const item of Array.isArray(items)?items:[]){
    for(const material of Array.isArray(item?.materials)?item.materials:[]){
      const typeId=Number(material?.typeId)||0;
      const name=clean(material?.name)||String(typeId);
      const quantity=Math.max(0,Number(material?.quantity)||0);
      const key=typeId?String(typeId):name.toLowerCase();
      const row=map.get(key)||{typeId:typeId||null,name,quantity:0,cost:0,costPerUnit:Number(material?.costPerUnit)||0};
      row.quantity+=quantity;
      row.cost+=Math.max(0,Number(material?.cost)||0);
      if(!row.costPerUnit&&Number(material?.costPerUnit)>0)row.costPerUnit=Number(material.costPerUnit);
      map.set(key,row);
    }
  }
  return [...map.values()].sort((a,b)=>b.cost-a.cost||a.name.localeCompare(b.name));
}

export function forgeSummary(items,materials){
  const list=Array.isArray(items)?items:[];
  const mats=Array.isArray(materials)?materials:[];
  return {
    requestedLines:list.length,
    buildableLines:list.filter(row=>row.kind==='manufacturing').length,
    oreLines:list.filter(row=>row.kind==='ore').length,
    unresolvedLines:list.filter(row=>row.kind==='unresolved').length,
    totalUnits:list.reduce((sum,row)=>sum+Math.max(0,Number(row.quantity)||0),0),
    materialTypes:mats.length,
    materialCost:mats.reduce((sum,row)=>sum+Math.max(0,Number(row.cost)||0),0),
    orePayoutValue:list.reduce((sum,row)=>sum+Math.max(0,Number(row.orePayoutValue)||0),0),
  };
}

export function sanitizeForgeShare(input,owner={}){
  const title=clean(input?.title).slice(0,100)||'JLR Build';
  const status=FORGE_STATUSES.includes(String(input?.status))?String(input.status):'planning';
  const notes=clean(input?.notes).slice(0,1200);
  const plan=input?.plan&&typeof input.plan==='object'?input.plan:{};
  const items=(Array.isArray(plan.items)?plan.items:[]).slice(0,100).map(row=>({
    name:clean(row?.name).slice(0,120),
    quantity:Math.max(0,Number(row?.quantity)||0),
    typeId:Number(row?.typeId)||null,
    kind:clean(row?.kind).slice(0,24),
    totalCost:Math.max(0,Number(row?.totalCost)||0),
    orePayoutValue:Math.max(0,Number(row?.orePayoutValue)||0),
  })).filter(row=>row.name&&row.quantity>0);
  const materials=(Array.isArray(plan.materials)?plan.materials:[]).slice(0,250).map(row=>({
    name:clean(row?.name).slice(0,120),
    typeId:Number(row?.typeId)||null,
    quantity:Math.max(0,Number(row?.quantity)||0),
    cost:Math.max(0,Number(row?.cost)||0),
    costPerUnit:Math.max(0,Number(row?.costPerUnit)||0),
  })).filter(row=>row.name&&row.quantity>0);
  return {
    title,status,notes,
    owner:{id:String(owner?.id||''),name:clean(owner?.displayName||owner?.name||'JLR Pilot').slice(0,80)},
    plan:{
      me:Math.max(0,Math.min(10,Number(plan?.me)||0)),
      te:Math.max(0,Math.min(20,Number(plan?.te)||0)),
      items,
      materials,
      summary:forgeSummary(items,materials),
    },
  };
}
