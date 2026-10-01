export const METENOX_TYPE_ID=81826;
export const METENOX_GAS_PER_HOUR=200;
export const METENOX_BLOCKS_PER_HOUR=5;
export const FUEL_BLOCK_NAMES=['Helium Fuel Block','Hydrogen Fuel Block','Nitrogen Fuel Block','Oxygen Fuel Block'];
const finite=value=>(typeof value!=='number'&&typeof value!=='string')||value===null||value===undefined||value===''?null:Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
export function metenoxRows(structures,assets,{profiles={},prices={},assetsAvailable=false,assetsPartial=false}={}){
  return (structures||[]).filter(row=>Number(row.typeId)===METENOX_TYPE_ID||/metenox/i.test(row.type||'')).map(row=>{
    const profile=profiles[String(row.structureId)]||{};
    const stock=(assets||[]).filter(item=>!item.unresolvedLocation&&Number(item.locationId)===Number(row.structureId));
    const gas=stock.filter(item=>item.name==='Magmatic Gas');
    const blocks=stock.filter(item=>FUEL_BLOCK_NAMES.includes(item.name));
    const reportedGasUnits=assetsAvailable&&gas.length?gas.reduce((sum,item)=>sum+(finite(item.quantity)||0),0):null;
    const reportedFuelBlocks=assetsAvailable&&blocks.length?blocks.reduce((sum,item)=>sum+(finite(item.quantity)||0),0):null;
    // Missing asset rows are unknown: some structure bays are not exposed by ESI.
    const manualGasUnits=finite(profile.gasUnits);
    const gasUnits=reportedGasUnits??manualGasUnits;
    const fuelType=FUEL_BLOCK_NAMES.includes(profile.fuelType)?profile.fuelType:blocks.length?blocks.slice().sort((a,b)=>b.quantity-a.quantity)[0].name:null;
    const gasPrice=finite(prices['Magmatic Gas']),blockPrice=fuelType?finite(prices[fuelType]):null;
    const costPerHour=gasPrice!==null&&blockPrice!==null?METENOX_GAS_PER_HOUR*gasPrice+METENOX_BLOCKS_PER_HOUR*blockPrice:null;
    const revenue30Days=finite(profile.revenue30Days),overhead30Days=finite(profile.overhead30Days)??0,taxPct=finite(profile.taxPct)??0;
    const operatingCost30Days=costPerHour===null?null:costPerHour*24*30;
    const profit30Days=revenue30Days===null||operatingCost30Days===null?null:revenue30Days*(1-taxPct/100)-operatingCost30Days-overhead30Days;
    return {...row,reportedGasUnits,reportedFuelBlocks,gasUnits,gasSource:reportedGasUnits!==null?'esi':manualGasUnits!==null?'manual':'unavailable',gasCoverageDays:gasUnits===null?null:gasUnits/METENOX_GAS_PER_HOUR/24,fuelStockCoverageDays:reportedFuelBlocks===null?null:reportedFuelBlocks/METENOX_BLOCKS_PER_HOUR/24,fuelType,gasPrice,blockPrice,costPerHour,operatingCost30Days,revenue30Days,overhead30Days,taxPct,profit30Days,profileUpdatedAt:profile.updatedAt||null,assetsPartial,profile:{revenue30Days,overhead30Days,taxPct,gasUnits:manualGasUnits,fuelType:profile.fuelType||''}};
  });
}
export function validateMetenoxProfile(body){
  if(!body||!/^\d{1,16}$/.test(String(body.structureId||'')))throw new Error('Choose a current Metenox structure.');
  const result={structureId:String(body.structureId)};
  for(const field of ['revenue30Days','overhead30Days','gasUnits','taxPct']){
    const value=body[field];
    if(value===null||value===undefined||value===''){result[field]=null;continue;}
    const number=finite(value),max=field==='taxPct'?100:1e15;
    if(number===null||number>max)throw new Error('Invalid '+field+'.');
    result[field]=number;
  }
  result.fuelType=String(body.fuelType||'');
  if(result.fuelType&&!FUEL_BLOCK_NAMES.includes(result.fuelType))throw new Error('Choose a valid fuel block type.');
  return result;
}
