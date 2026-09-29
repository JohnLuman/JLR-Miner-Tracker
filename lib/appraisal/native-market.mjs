function positive(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?n:0;
}
function volume(row){
  return positive(row?.volume_remain);
}
function price(row){
  return positive(row?.price);
}

export function weightedEdgePrice(rows,{side='sell',fraction=0.05}={}){
  const list=(Array.isArray(rows)?rows:[])
    .filter(row=>price(row)>0&&volume(row)>0)
    .sort((a,b)=>side==='buy'?price(b)-price(a):price(a)-price(b));
  if(!list.length)return 0;
  const totalVolume=list.reduce((sum,row)=>sum+volume(row),0);
  if(!(totalVolume>0))return 0;
  const share=Math.max(0.0001,Math.min(1,Number(fraction)||0.05));
  const target=Math.max(1,totalVolume*share);
  let taken=0;
  let value=0;
  for(const row of list){
    if(taken>=target)break;
    const qty=Math.min(volume(row),target-taken);
    if(!(qty>0))continue;
    value+=qty*price(row);
    taken+=qty;
  }
  return taken>0?value/taken:0;
}

export function nativeAppraisalPriceSet({buyOrders=[],sellOrders=[],variant='immediate'}={}){
  const buys=(Array.isArray(buyOrders)?buyOrders:[]).filter(row=>price(row)>0&&volume(row)>0);
  const sells=(Array.isArray(sellOrders)?sellOrders:[]).filter(row=>price(row)>0&&volume(row)>0);
  const mode=String(variant||'immediate').toLowerCase()==='top5percent'?'top5percent':'immediate';
  const buy=mode==='top5percent'
    ?weightedEdgePrice(buys,{side:'buy',fraction:0.05})
    :buys.reduce((best,row)=>Math.max(best,price(row)),0);
  const sell=mode==='top5percent'
    ?weightedEdgePrice(sells,{side:'sell',fraction:0.05})
    :sells.reduce((best,row)=>{
      const p=price(row);
      return best===0||p<best?p:best;
    },0);
  const split=buy>0&&sell>0?(buy+sell)/2:(buy||sell||0);
  return{
    variant:mode,
    buy,
    sell,
    split,
    buyOrderCount:buys.length,
    sellOrderCount:sells.length,
    buyVolume:buys.reduce((sum,row)=>sum+volume(row),0),
    sellVolume:sells.reduce((sum,row)=>sum+volume(row),0),
  };
}
