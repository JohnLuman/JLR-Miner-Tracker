// Ground Adam's market answers in the same snapshots displayed by JLR. Keep
// these calculations pure so the server can enforce access before passing data.
const normalized=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const isk=value=>Math.round(value).toLocaleString('en-US')+' ISK';
const pct=value=>(value*100).toFixed(1)+'%';

export function isDoctrineDataQuestion(question,currentTab=''){
  const q=normalized(question);
  const explicit=/\bdoctrine\b/.test(q);
  const buying=/\b(?:item|module|modules|implant|buy|seed|stock|restock)\b/.test(q)
    &&/\b(?:roi|return on investment|profit|margin|investment|best|highest|most|worth|price|sales|supply|stock|buy|restock|why)\b/.test(q);
  if(explicit)return buying||/\b(?:which|how many|how much|top|best|lowest|out of stock|compare|status|summary|stock|price|sales|supply|roi|margin|profit)\b/.test(q);
  if(/\b(?:ore|ice|gas|fleet|ship|laser)\b/.test(q))return false;
  if(currentTab==='doctrine')return buying||/\b(?:roi|return on investment|profit|margin|investment|invest|best|top|stock|restock|sales|supply|buy|price|status)\b/.test(q);
  return buying&&/\b(?:item|module|implant)\b/.test(q);
}

function budgetFromQuestion(question){
  const match=String(question||'').match(/\b(?:budget|have|spend|invest|with|for)\s*(?:of|about|around|up to)?\s*([\d,.]+)\s*(trillion|billion|million|t|b|m)\b/i);
  if(!match)return null;
  const amount=Number(match[1].replaceAll(',',''));
  const multiplier={trillion:1e12,t:1e12,billion:1e9,b:1e9,million:1e6,m:1e6}[match[2].toLowerCase()];
  return amount>0&&Number.isFinite(amount*multiplier)?amount*multiplier:null;
}

function candidate(row,budget){
  const cost=number(row.breakeven);
  const sale=number(row.cnSell);
  const jita=number(row.jitaSell);
  const daily=number(row.sold30);
  const stock=Math.max(0,number(row.stock));
  const missing=Math.max(0,Math.ceil(number(row.required)));
  const units=cost>0?Math.min(missing,budget===null?missing:Math.floor(budget/cost)):0;
  return{row,cost,sale,jita,daily,stock,missing,units,roi:cost>0?sale/cost-1:0,profit:units*(sale-cost)};
}

function sourceNote(snapshot){
  const status=snapshot?.status||{};
  const sources=status.sources||{};
  const missing=['cn','jita','history'].filter(key=>!String(sources[key]||'').startsWith('live-'));
  const stale=[['cn',status.cnUpdatedAt,30*60*1000],['jita',status.jitaUpdatedAt,3*60*60*1000],['history',status.historyUpdatedAt,36*60*60*1000]]
    .filter(([key,date,age])=>!missing.includes(key)&&(!Number.isFinite(Date.parse(date))||Date.now()-Date.parse(date)>age))
    .map(([key])=>key);
  if(missing.length||stale.length){
    const parts=[];
    if(missing.length)parts.push(missing.join(', ')+' use the '+(snapshot?.snapshotDate||'undated')+' workbook snapshot');
    if(stale.length)parts.push(stale.join(', ')+' cached inputs are past their refresh window');
    return 'Data caution: '+parts.join('; ')+'. Check the current orders before buying.';
  }
  return 'Prices and sales are estimates from the cached C-N, Jita and Fountain feeds; orders, fees and actual local sales can change.';
}

function findItem(rows,question,focusItem){
  const q=normalized(question);
  const sorted=rows.filter(row=>row.item).sort((a,b)=>b.item.length-a.item.length);
  const explicit=sorted.find(row=>q.includes(normalized(row.item))||new RegExp('\\b'+String(row.typeId)+'\\b').test(q));
  if(explicit)return explicit;
  if(/\b(?:it|its|that item|that one|this item)\b/.test(q)&&focusItem){
    return sorted.find(row=>normalized(row.item)===normalized(focusItem))||null;
  }
  if(focusItem&&!/\b(?:best|top|highest|which item|which one)\b/.test(q)
    &&/\b(?:how many|how much|stock|price|profit|margin|cost|sales|buy)\b/.test(q)){
    return sorted.find(row=>normalized(row.item)===normalized(focusItem))||null;
  }
  return null;
}

export function answerDoctrineQuestion({question,snapshot,focusItem=''}){
  const rows=Array.isArray(snapshot?.rows)?snapshot.rows:[];
  const q=normalized(question);
  const budget=budgetFromQuestion(question);
  const note=sourceNote(snapshot);
  const item=findItem(rows,question,focusItem);
  const money=value=>isk(value);
  if(item){
    const c=candidate(item,budget);
    const estimates=c.cost>0&&c.sale>0
      ?`Estimated landed cost ${money(c.cost)} and current C-N lowest sell ${money(c.sale)}: ${money(c.sale-c.cost)} gross spread per unit (${pct(c.roi)} on landed cost).`
      :'A reliable buy-to-local-sell spread cannot be calculated from the available prices.';
    const text=`${item.item}: C-N stock ${Math.round(c.stock).toLocaleString()}, Jita reference sell ${c.jita>0?money(c.jita):'unavailable'}, estimated Fountain sales ${c.daily.toFixed(1)}/day, about ${number(item.daysStandard).toFixed(1)} days of stock. ${estimates} ${c.missing>0?'30-day restock gap about '+c.missing.toLocaleString()+' units.':'No 30-day restock gap at the current sales estimate.'}${budget!==null?' Your budget covers up to '+c.units.toLocaleString()+' units within that gap.':''} ${note}`;
    return{topic:'doctrine-item',text,focusItem:item.item,metrics:{typeId:item.typeId,roi:c.roi,stock:c.stock,units:c.units}};
  }

  if(/\b(?:that item|this item|that one|its|how many should i buy|how much should i buy)\b/.test(q)){
    return{topic:'doctrine-item-needed',text:'Which doctrine item do you mean? Name it, or ask me to find the best ROI first.'};
  }

  if(/\b(?:status|summary)\b/.test(q)){
    const summary=snapshot?.summary||{};
    return{topic:'doctrine-status',text:`Doctrine Market tracks ${rows.length} items. ${number(summary.zero)} have zero C-N stock; ${number(summary.need)} have less than the estimated 30-day supply, and ${number(summary.seed)} show a positive gross buy-to-local-sell spread. ${note}`};
  }

  if(/\b(?:stock|out of stock|restock|supply)\b/.test(q)&&!/\b(?:roi|profit|return on investment|best|buy|seed)\b/.test(q)){
    const summary=snapshot?.summary||{};
    const lowest=rows.filter(row=>number(row.required)>0&&number(row.sold30)>=1)
      .sort((a,b)=>number(a.daysDynamic)-number(b.daysDynamic)||number(b.required)-number(a.required)).slice(0,3);
    return{topic:'doctrine-stock',text:`Doctrine Market has ${number(summary.zero)} items at zero C-N stock and ${number(summary.need)} below the 30-day supply target. Shortest coverage with meaningful estimated sales: ${lowest.map(row=>row.item+' ('+number(row.daysDynamic).toFixed(1)+' days)').join('; ')||'none available'}. ${note}`};
  }

  const byProfit=/\b(?:total profit|most profit|highest profit|absolute profit)\b/.test(q);
  // Regional sales are a demand proxy, not proof that these units sell in C-N.
  // Ignore workbook .01 placeholders and items with no local price or deficit.
  const eligible=rows.map(row=>candidate(row,budget)).filter(c=>
    c.jita>0&&c.sale>0&&c.cost>0&&c.roi>0&&c.daily>=1&&c.units>0);
  eligible.sort((a,b)=>byProfit?b.profit-a.profit||b.roi-a.roi:b.roi-a.roi||b.profit-a.profit);
  if(!eligible.length)return{topic:'doctrine-roi',text:`I cannot identify a profitable doctrine purchase with both prices, estimated sales and a 30-day stock gap${budget!==null?' within '+money(budget):''}. ${note}`};
  const best=eligible[0];
  const details=eligible.slice(0,3).map((c,i)=>`${i+1}. ${c.row.item}: ${pct(c.roi)} estimated gross ROI, ${money(c.sale-c.cost)} spread/unit, ${c.units.toLocaleString()} units in the 30-day gap, about ${c.daily.toFixed(1)} sold/day across Fountain`).join('; ');
  const metric=byProfit?'estimated gross profit within the stock gap':'estimated gross ROI';
  const total=byProfit?' Approximate gross spread across '+best.units.toLocaleString()+' units: '+money(best.profit)+'.':'';
  const live=snapshot?.status?.sources||{};
  const current=String(live.cn||'').startsWith('live-')&&String(live.jita||'').startsWith('live-')
    &&Date.now()-Date.parse(snapshot?.status?.cnUpdatedAt)<30*60*1000
    &&Date.now()-Date.parse(snapshot?.status?.jitaUpdatedAt)<3*60*60*1000;
  const intro=current?'Best by '+metric:'I cannot confirm the current best buy yet. Workbook lead by '+metric;
  return{topic:'doctrine-roi',text:`${intro}${budget!==null?' for '+money(budget)+' budget':''}: ${details}.${total} Landed cost includes JLR’s trade multiplier and hauling estimate; this spread assumes selling near the listed C-N price. Fountain sales are only a demand proxy. ${note}`,focusItem:best.row.item,metrics:{typeId:best.row.typeId,roi:best.roi,units:best.units,profit:best.profit}};
}

export function answerMiningMarketQuestion({question,currentTab='',focusOre='',ores=[],ice=[],gas={},updatedAt=null}){
  const q=normalized(question);
  const ask=/\b(?:best|highest|most valuable|worth|value|price|compare|per m3|per cubic|payout)\b/.test(q);
  if(!ask)return null;
  let domain=/\b(?:gas|fullerite|cytoserocin|mykoserocin)\b/.test(q)?'gas':/\bice\b/.test(q)?'ice':/\bore\b/.test(q)?'ore':'';
  if(!domain&&['gas','ice','fields'].includes(currentTab))domain=currentTab==='fields'?'ore':currentTab;
  if(!domain)return null;
  if(domain==='ore'&&/\b(?:field|system|site)\b/.test(q)&&!/\bore\b/.test(q))return null;
  const list=domain==='ore'?ores.map(row=>({name:row.name,value:number(row.market?.jita?.refinedBuyPerM3||row.market?.jita?.buyPerM3||row.jbvPerM3),basis:'Jita refined buy ISK/m³'})):
    domain==='ice'?ice.map(row=>({name:row.name,value:number(row.market?.trackingBlockValue),basis:'JLR payout ISK/block, Heavy Water excluded'})):
    Object.entries(gas).map(([name,row])=>({name,value:number(row.volume)>0?number(row.market?.raw?.jita?.buy)/number(row.volume):0,basis:'raw Jita buy ISK/m³'}));
  const match=list.find(row=>q.includes(normalized(row.name)))
    ||(domain==='ore'&&/\b(?:it|its|that ore|this ore|selected ore)\b/.test(q)
      ?list.find(row=>normalized(row.name)===normalized(focusOre)):null);
  const ranked=list.filter(row=>row.value>0).sort((a,b)=>b.value-a.value);
  const comparing=/\b(?:best|highest|most valuable|compare|top)\b/.test(q);
  if(!match&&!comparing)return{topic:'market-item-needed',text:`Which ${domain} item do you want priced? Name it, or ask for the best priced ${domain} in JLR’s current data.`};
  const selected=match?[match]:ranked.slice(0,3);
  if(!selected.length)return{topic:'market-data',text:`I do not have a priced ${domain} entry to compare right now. The market feed last updated ${updatedAt||'at an unknown time'}.`};
  const stale=updatedAt&&Date.now()-Date.parse(updatedAt)>36*60*60*1000;
  return{topic:'market-data',text:`${match?match.name+' value':'Highest priced '+domain+' in JLR’s current data'}: ${selected.map(row=>row.name+' '+row.value.toLocaleString('en-US',{maximumFractionDigits:2})+' '+row.basis).join('; ')}. ${updatedAt?'Market updated '+updatedAt+'.':'Market update time unavailable.'}${stale?' These prices are over 36 hours old.':''} Price per volume does not account for yield, site availability, travel or time to mine.`};
}
