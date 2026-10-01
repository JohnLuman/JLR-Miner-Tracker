export function ceoDataHealth({connected=false,upgradeRequired=false,walletGranted=false,finance=null,walletPull=null,structures=null,operations={},pending={},baseline=null,at=Date.now()}={}){
  const rows=[];
  function add(id,name,pull,count,busy=false,permission=true){
    let status='unpulled',note='Open this section to load its data.';
    if(!permission){status='permission';note='Renius needs to approve corporation wallet access.';}
    else if(!connected){status='disconnected';note='Renius needs to connect CEO ESI.';}
    else if(upgradeRequired){status='permission';note='Renius needs to update the core CEO permissions.';}
    else if(busy){status='loading';note='A pull is running.';}
    else if(pull?.error||pull?.available===false){status=pull?.updatedAt?'stale':'failed';note=String(pull.error||'The ESI pull failed.').slice(0,220);}
    else if(pull?.updatedAt){
      const stamp=Date.parse(pull.updatedAt);
      status=pull.truncated?'partial':Number.isFinite(stamp)&&at-stamp>5*60_000?'older':'pulled';
      note=status==='partial'?'The ESI page limit was reached; results are incomplete.':status==='older'?'This snapshot is over five minutes old. Refresh its section for a new pull.':'The latest pull succeeded. This is a snapshot, not live activity.';
    }
    rows.push({id,name,status,note,count:Number.isFinite(count)?count:null,checkedAt:pull?.checkedAt||null,updatedAt:pull?.updatedAt||null});
  }
  const sectionPull=section=>{
    if(!finance)return null;
    const error=(finance.errors||[]).find(row=>row.section===section);
    return {available:!error,error:error?.message||null,checkedAt:finance.generatedAt,updatedAt:error?null:finance.generatedAt};
  };
  add('members','Corporation roster',sectionPull('members'),finance?.members?.count,pending.finance);
  add('tracking','Member join / login dates',sectionPull('membertracking'),finance?.members?.tracking?.length,pending.finance);
  add('wallet','Wallet balances + journal',walletPull,null,pending.finance,walletGranted);
  add('structures','Corporation structures',structures,structures?.records?.length,pending.structures);
  for(const [id,name] of [['assets','Assets'],['jobs','Industry jobs'],['contracts','Contracts'],['orders','Market orders']])add(id,name,operations[id],operations[id]?.records?.length,pending[id]);
  rows.push({id:'baseline',name:'Moon workbook baseline',status:baseline?.available?'saved':'missing',note:baseline?.available?'Historical worksheet source: '+String(baseline.sourceDate||'date unavailable'):'The admin workbook baseline is unavailable.',count:baseline?.records?.length??null,checkedAt:null,updatedAt:null});
  return {checkedAt:new Date(at).toISOString(),rows,unpulled:rows.filter(row=>row.status==='unpulled').length,attention:rows.filter(row=>['permission','disconnected','failed','stale','partial','missing'].includes(row.status)).length};
}
