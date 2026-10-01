const label=(id,names,prefix)=>{const name=names.get(Number(id));return name&&name!==String(id)?name:prefix+' '+String(id||'not reported');};
const number=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const clean=value=>String(value??'').slice(0,240);
export const CEO_OPERATION_ROUTES=Object.freeze({assets:'/assets/',jobs:'/industry/jobs/',contracts:'/contracts/',orders:'/orders/'});
export function operationNameIds(section,rows){
  const fields=section==='assets'?['type_id','location_id']:section==='jobs'?['product_type_id','blueprint_type_id','installer_id','station_id']:section==='contracts'?['issuer_id','issuer_corporation_id','assignee_id','acceptor_id','start_location_id','end_location_id']:['type_id','location_id','issued_by'];
  return [...new Set((rows||[]).flatMap(row=>fields.map(field=>Number(row[field]))).filter(id=>id>0&&id<10_000_000_000))];
}
export function normalizeOperations(section,rows,names=new Map()){
  const raw=Array.isArray(rows)?rows:[];
  if(section==='assets'){
    const parents=new Map(raw.map(row=>[Number(row.item_id),row]));const groups=new Map();
    for(const row of raw){
      let location=Number(row.location_id),flag=clean(row.location_flag),unresolved=false;const seen=new Set([Number(row.item_id)]);
      for(let depth=0;parents.has(location);depth++){
        if(seen.has(location)||depth>=64){unresolved=true;break;}
        seen.add(location);const parent=parents.get(location);flag=clean(parent.location_flag)||flag;location=Number(parent.location_id);
      }
      const copy=Boolean(row.is_blueprint_copy)||Number(row.quantity)===-2;
      const quantity=Number(row.quantity)<0?1:number(row.quantity);
      const key=[row.type_id,location,flag,copy,unresolved].join('|');
      if(!groups.has(key))groups.set(key,{typeId:Number(row.type_id),name:label(row.type_id,names,'Type'),locationId:location,location:label(location,names,'Location'),storage:flag,blueprintCopy:copy,unresolvedLocation:unresolved,quantity:0,missingQuantity:0,stacks:0});
      const group=groups.get(key);group.quantity+=quantity??0;group.missingQuantity+=quantity===null?1:0;group.stacks++;
    }
    const records=[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.location.localeCompare(b.location));
    return {records,summary:{groups:records.length,stacks:raw.length,units:records.reduce((sum,row)=>sum+row.quantity,0),missingQuantity:records.reduce((sum,row)=>sum+row.missingQuantity,0)}};
  }
  if(section==='jobs'){
    const records=raw.map(row=>({id:row.job_id,name:label(row.product_type_id||row.blueprint_type_id,names,'Type'),installer:label(row.installer_id,names,'Installer'),location:label(row.station_id,names,'Location'),status:clean(row.status),activityId:number(row.activity_id),runs:number(row.runs),cost:number(row.cost),startDate:row.start_date||null,endDate:row.end_date||null})).sort((a,b)=>Date.parse(b.startDate||0)-Date.parse(a.startDate||0));
    return {records,summary:{jobs:records.length,active:records.filter(row=>row.status==='active').length,ready:records.filter(row=>row.status==='ready').length}};
  }
  if(section==='contracts'){
    const records=raw.map(row=>({id:row.contract_id,name:clean(row.title)||'Contract '+row.contract_id,type:clean(row.type),status:clean(row.status),issuer:label(row.issuer_id,names,'Issuer'),assignee:row.assignee_id?label(row.assignee_id,names,'Assignee'):'Unassigned / public',startLocation:label(row.start_location_id,names,'Location'),endLocation:row.end_location_id?label(row.end_location_id,names,'Location'):null,price:number(row.price),reward:number(row.reward),collateral:number(row.collateral),issued:row.date_issued||null,expires:row.date_expired||null})).sort((a,b)=>Date.parse(b.issued||0)-Date.parse(a.issued||0));
    return {records,summary:{contracts:records.length,outstanding:records.filter(row=>row.status==='outstanding').length,inProgress:records.filter(row=>row.status==='in_progress').length}};
  }
  if(section==='orders'){
    const records=raw.map(row=>({id:row.order_id,typeId:Number(row.type_id),name:label(row.type_id,names,'Type'),side:row.is_buy_order?'BUY':'SELL',location:label(row.location_id,names,'Location'),issuer:label(row.issued_by,names,'Issuer'),price:number(row.price),remaining:number(row.volume_remain),total:number(row.volume_total),issued:row.issued||null,duration:number(row.duration),escrow:number(row.escrow)})).sort((a,b)=>a.name.localeCompare(b.name)||a.side.localeCompare(b.side));
    const value=side=>records.filter(row=>row.side===side&&row.price!==null&&row.remaining!==null).reduce((sum,row)=>sum+row.price*row.remaining,0);
    return {records,summary:{orders:records.length,buyValue:value('BUY'),sellValue:value('SELL'),missingValue:records.filter(row=>row.price===null||row.remaining===null).length}};
  }
  throw new Error('Unknown corporation operations section');
}
