// Projected continuous operation; current moon survey + CCP SDE recipes.
export const MOON_VOLUME_PER_HOUR=30000;
export const METENOX_YIELD=0.4;
const ordinaryMinerals=new Set([34,35,36,37,38,39,40,11399]);
export function parseMoonSurvey(text){
  const source=String(text||'').trim();
  if(!source)return [];
  if(source.length>4000)throw new Error('Paste one moon survey at a time.');
  const rows=[];
  for(const line of source.split(/\r?\n/).map(line=>line.trim()).filter(Boolean)){
    if(/^Product\s+Quantity/i.test(line))continue;
    const match=line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(%)?(?:\s+\d+)*$/);
    if(!match)throw new Error('Use one ore and its percentage per line, for example Bitumens 50%.');
    const fraction=Number(match[2])/(match[3]||Number(match[2])>1?100:1);
    const name=match[1].trim();
    if(!fraction||fraction>1||name.length>100||/^compressed /i.test(name))throw new Error('Use uncompressed moon ores with positive percentages.');
    if(rows.some(row=>row.name.toLowerCase()===name.toLowerCase()))throw new Error('Each ore should appear once.');
    rows.push({name,fraction});
  }
  if(!rows.length||rows.length>8||Math.abs(rows.reduce((sum,row)=>sum+row.fraction,0)-1)>0.001)throw new Error('The full moon composition must total 100%.');
  return rows;
}
export function moonProduction(composition,oreRecipes){
  if(!composition?.length)return {outputs:[],error:'Add a current moon survey to calculate profit.'};
  const totals=new Map();
  for(const ore of composition){
    const recipe=oreRecipes?.[ore.name.toLowerCase()];
    if(!recipe||!Number.isFinite(recipe.volume)||recipe.volume<=0||!Number.isFinite(recipe.portionSize)||recipe.portionSize<=0||!recipe.materials?.length||!recipe.moonOre)return {outputs:[],error:'Current moon ore recipe unavailable: '+ore.name};
    const batches=MOON_VOLUME_PER_HOUR*ore.fraction/recipe.volume/recipe.portionSize*METENOX_YIELD;
    for(const material of recipe.materials){
      if(ordinaryMinerals.has(Number(material.typeId)))continue;
      if(!material.name||!Number.isFinite(material.quantity)||material.quantity<=0)return {outputs:[],error:'Invalid material recipe: '+ore.name};
      totals.set(material.name,(totals.get(material.name)||0)+batches*material.quantity);
    }
  }
  if(!totals.size)return {outputs:[],error:'The survey contains no moon materials.'};
  return {outputs:[...totals].map(([name,perHour])=>({name,perHour,quantity30Days:perHour*720})),error:null};
}
export function priceMoonProduction(production,buyPrices){
  if(production.error)return {...production,revenue30Days:null};
  let revenue30Days=0;
  const outputs=production.outputs.map(row=>{
    const unitBuy=Number(buyPrices?.[row.name]);
    const value30Days=Number.isFinite(unitBuy)&&unitBuy>0?row.quantity30Days*unitBuy:null;
    if(value30Days!==null)revenue30Days+=value30Days;
    return {...row,unitBuy:value30Days===null?null:unitBuy,value30Days};
  });
  const missing=outputs.filter(row=>row.value30Days===null);
  return {outputs,revenue30Days:missing.length?null:revenue30Days,error:missing.length?'Current Jita buy price unavailable: '+missing.map(row=>row.name).join(', '):null};
}
