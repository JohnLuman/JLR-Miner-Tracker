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


function appraisalAgeText(ms){
  const value=Math.max(0,Number(ms)||0);
  if(value<60_000)return Math.max(1,Math.round(value/1000))+' seconds';
  if(value<60*60_000)return Math.round(value/60_000)+' minutes';
  if(value<24*60*60_000)return (value/(60*60_000)).toFixed(value<10*60*60_000?1:0)+' hours';
  return (value/(24*60*60_000)).toFixed(1)+' days';
}

export function isAppraisalDataQuestion(question,currentTab=''){
  const q=normalized(question);
  const staticIntent=/\b(?:refine|refines|refined|reprocess|reprocessing|material|materials|compress|compressed|compression|decompress|volume|m3|cubic|type id|category|group|market group|portion|portion size)\b/.test(q);
  const marketIntent=/\b(?:price|worth|value|buy|sell|split|market|liquidity|spread|history|trend|volume traded|raw vs|compressed vs|better|best option|highest value|data age|how old)\b/.test(q);
  const itemInfo=/^(?:what is|whats|what s|tell me about|info on|information on)\b/.test(q);
  if(currentTab==='forge'||currentTab==='appraisal')return staticIntent||marketIntent||itemInfo;
  return staticIntent||marketIntent||itemInfo;
}

export function appraisalQuestionNeedsMarket(question){
  const q=normalized(question);
  return /\b(?:price|worth|value|buy|sell|split|market|liquidity|spread|history|trend|volume traded|raw vs|compressed vs|better|best option|highest value|data age|how old|profit)\b/.test(q)
    ||(/\b(?:compress|compressed|compression|refine|reprocess)\b/.test(q)&&/\b(?:worth|value|better|best|isk|price|versus|vs|compare)\b/.test(q));
}

export function appraisalMarketIdFromQuestion(question){
  const q=normalized(question);
  if(/\bamarr\b/.test(q))return 3;
  if(/\bdodixie\b/.test(q))return 4;
  if(/\brens\b/.test(q))return 5;
  if(/\bhek\b/.test(q))return 6;
  return 2;
}

export function appraisalQuantityFromQuestion(question,itemName=''){
  const raw=String(question||'');
  const escaped=String(itemName||'').replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
  const patterns=escaped?[
    new RegExp('\\b([\\d,]+)\\s*(?:x\\s*)?'+escaped+'\\b','i'),
    new RegExp('\\b'+escaped+'\\s*(?:x\\s*)?([\\d,]+)\\b','i'),
  ]:[];
  patterns.push(/\b(?:qty|quantity|amount|for)\s*[:=]?\s*([\d,]+)\b/i);
  for(const pattern of patterns){
    const match=raw.match(pattern);
    if(!match)continue;
    const value=Math.floor(Number(String(match[1]).replaceAll(',','')));
    if(Number.isFinite(value)&&value>0)return Math.min(value,2_000_000_000);
  }
  return 1;
}

export function answerAppraisalStaticQuestion({question,item,materials=null,sdeMeta=null}={}){
  if(!item||!item.name)return null;
  const q=normalized(question);
  const name=String(item.name);
  const build=Number(sdeMeta?.buildNumber)||Number(item.sdeBuildNumber)||null;
  const source=build?'CCP SDE build '+build.toLocaleString('en-US'):'JLR static catalog';
  const focusItem=name;

  if(/\b(?:refine|refines|reprocess|reprocessing|material|materials)\b/.test(q)){
    const recipe=materials&&Array.isArray(materials.materials)?materials:null;
    if(!recipe||!recipe.length){
      return{topic:'appraisal-static-refine',text:name+' has no reprocessing-material recipe in '+source+'.',focusItem};
    }
    const portion=Math.max(1,number(materials.portionSize)||number(item.portionSize)||1);
    const parts=recipe.slice(0,12).map(row=>Math.round(number(row.quantity)).toLocaleString('en-US')+' '+row.name);
    return{
      topic:'appraisal-static-refine',
      text:name+' reprocesses in a static portion of '+portion.toLocaleString('en-US')+' unit'+(portion===1?'':'s')+' into '+parts.join(', ')+'. Those are CCP static material quantities before JLR applies your actual refine efficiency or live mineral prices. Source: '+source+'.',
      focusItem,
      metrics:{typeId:item.typeId,portionSize:portion},
    };
  }

  if(/\b(?:compress|compressed|compression|decompress)\b/.test(q)){
    if(number(item.compressedTypeId)>0&&item.compressedName){
      return{topic:'appraisal-static-compression',text:name+' compresses to '+item.compressedName+' (type '+Math.round(number(item.compressedTypeId))+'). JLR is using CCP’s exact SDE compression relationship, not a name guess. Source: '+source+'.',focusItem};
    }
    if(number(item.rawTypeId)>0&&item.rawName){
      return{topic:'appraisal-static-compression',text:name+' is the compressed form of '+item.rawName+' (raw type '+Math.round(number(item.rawTypeId))+'). Source: '+source+'.',focusItem};
    }
    return{topic:'appraisal-static-compression',text:name+' does not have a compression relationship in '+source+'.',focusItem};
  }

  if(/\b(?:volume|m3|cubic)\b/.test(q)){
    const volume=number(item.volume);
    const packaged=number(item.packagedVolume);
    return{topic:'appraisal-static-volume',text:name+' volume is '+volume.toLocaleString('en-US',{maximumFractionDigits:6})+' m³ per unit'+(packaged!==volume?' and packaged volume is '+packaged.toLocaleString('en-US',{maximumFractionDigits:6})+' m³.':'.')+' Source: '+source+'.',focusItem,metrics:{typeId:item.typeId,volume,packagedVolume:packaged}};
  }

  if(/\btype id\b/.test(q)){
    return{topic:'appraisal-static-type',text:name+' is EVE type ID '+Math.round(number(item.typeId))+'. Source: '+source+'.',focusItem};
  }

  if(/\b(?:category|group|market group)\b/.test(q)){
    const parts=[];
    if(item.categoryName)parts.push('category '+item.categoryName);
    if(item.groupName)parts.push('group '+item.groupName);
    if(item.marketGroupName)parts.push('market group '+item.marketGroupName);
    return{topic:'appraisal-static-classification',text:name+': '+(parts.join(', ')||'classification metadata is unavailable')+'. Type ID '+Math.round(number(item.typeId))+'. Source: '+source+'.',focusItem};
  }

  const facts=['type ID '+Math.round(number(item.typeId))];
  if(item.categoryName)facts.push('category '+item.categoryName);
  if(item.groupName)facts.push('group '+item.groupName);
  if(number(item.volume)>0)facts.push(number(item.volume).toLocaleString('en-US',{maximumFractionDigits:6})+' m³/unit');
  if(item.compressedName)facts.push('compresses to '+item.compressedName);
  if(item.rawName)facts.push('compressed form of '+item.rawName);
  return{topic:'appraisal-static-item',text:name+': '+facts.join(', ')+'. Source: '+source+'.',focusItem};
}

export function answerAppraisalMarketQuestion({question,item,quantity=1,appraisal,intel=null}={}){
  if(!item?.name||!appraisal)return null;
  const q=normalized(question);
  const rows=Array.isArray(appraisal.items)?appraisal.items:[];
  const row=rows.find(candidate=>number(candidate.typeId)===number(item.typeId))
    ||rows.find(candidate=>normalized(candidate.name)===normalized(item.name))
    ||rows[0];
  if(!row)return null;
  const focusItem=String(row.name||item.name);
  const market=String(appraisal.market?.name||'Jita 4-4');
  const qty=Math.max(1,Math.floor(number(quantity)||number(row.amount)||1));
  const marketData=appraisal.marketData||{};
  const age=appraisalAgeText(number(marketData.maxAgeMs));
  const stale=number(marketData.staleCount)>0;
  const dataNote=' '+(stale?'JLR is using retained stale fallback pricing; ':'')+'Oldest price input is about '+age+' old.';

  if(/\b(?:data age|how old|fresh|stale|cache|source)\b/.test(q)){
    const sources=Object.entries(marketData.sourceCounts||{}).filter(([,count])=>number(count)>0)
      .map(([source,count])=>source+' '+Math.round(number(count))).join(', ');
    return{topic:'appraisal-market-freshness',text:focusItem+' in '+market+': oldest price input is about '+age+' old; '+Math.round(number(marketData.staleCount))+' stale and '+Math.round(number(marketData.freshCount))+' fresh priced row'+(number(marketData.freshCount)===1?'':'s')+'. '+(sources?'Sources: '+sources+'. ':'')+'Static item data comes from CCP SDE build '+(Number(appraisal.staticData?.buildNumber)||'unknown')+'.',focusItem};
  }

  const compression=(Array.isArray(intel?.compression)?intel.compression:[])
    .find(candidate=>number(candidate.sourceTypeId)===number(row.typeId)||normalized(candidate.sourceName)===normalized(row.name));
  if(/\b(?:compress|compressed|compression|decompress)\b/.test(q)&&/\b(?:worth|value|price|better|compare|vs|versus|difference|gain|lose)\b/.test(q)){
    if(!compression)return{topic:'appraisal-market-compression',text:'I do not have a priced compression comparison for '+focusItem+' in '+market+' right now.'+dataNote,focusItem};
    const delta=number(compression.valueDelta);
    const direction=String(compression.direction||'compress')==='decompress'?'decompressed':'compressed';
    const volumeDrop=Number(compression.volumeReductionPct);
    return{
      topic:'appraisal-market-compression',
      text:qty.toLocaleString('en-US')+' '+focusItem+' is about '+isk(compression.sourceValue)+' on JLR’s '+appraisal.pricing+' basis; the '+direction+' equivalent '+compression.targetName+' is about '+isk(compression.targetValue)+'. That is '+(delta>=0?'+':'-')+isk(Math.abs(delta))+(Number.isFinite(volumeDrop)?' with '+volumeDrop.toFixed(1)+'% volume reduction':'')+'.'+dataNote,
      focusItem,
      metrics:{typeId:row.typeId,valueDelta:delta},
    };
  }

  if(/\b(?:raw vs|compressed vs|better|best option|highest value|refine vs|should i refine|should i compress|compare raw|compare refine)\b/.test(q)){
    const decision=intel?.decision;
    if(!decision)return{topic:'appraisal-market-decision',text:'I can price '+focusItem+', but I do not have a complete raw/compressed/refine decision for it right now.',focusItem};
    const values=[
      Number.isFinite(Number(decision.rawValue))?'raw '+isk(decision.rawValue):null,
      Number.isFinite(Number(decision.compressedValue))?'compressed '+isk(decision.compressedValue):null,
      Number.isFinite(Number(decision.refinedValue))?'refined '+isk(decision.refinedValue):null,
    ].filter(Boolean);
    return{
      topic:'appraisal-market-decision',
      text:'For '+qty.toLocaleString('en-US')+' '+focusItem+' at '+market+' on JLR’s '+appraisal.pricing+' basis and '+(number(decision.refineRate)*100).toFixed(2).replace(/0+$/,'').replace(/\.$/,'')+'% refine, the highest-value option is '+String(decision.winnerLabel||'unknown')+' at '+isk(decision.winnerValue)+'. '+values.join('; ')+(number(decision.advantageValue)>0?'. Advantage over the next option: '+isk(decision.advantageValue):'.')+dataNote,
      focusItem,
      metrics:{typeId:row.typeId,winner:decision.winner,winnerValue:decision.winnerValue},
    };
  }

  if(/\b(?:liquidity|spread|history|trend|volume traded|daily volume|book depth)\b/.test(q)){
    const history=(Array.isArray(intel?.history)?intel.history:[])
      .find(candidate=>number(candidate.typeId)===number(row.typeId)||normalized(candidate.name)===normalized(row.name));
    if(!history)return{topic:'appraisal-market-history',text:'I do not have cached market-history/liquidity data for '+focusItem+' in '+market+' right now.',focusItem};
    const trend=Number(history.trend7Pct);
    const spread=Number(history.spreadPct);
    const details=[
      '7-day average '+isk(history.avg7),
      '30-day average '+isk(history.avg30),
      Number.isFinite(trend)?'7-day trend '+(trend>=0?'+':'')+trend.toFixed(2)+'%':null,
      'average daily volume '+Math.round(number(history.avgDailyVolume7)).toLocaleString('en-US'),
      Number.isFinite(spread)?'current spread '+spread.toFixed(2)+'%':null,
    ].filter(Boolean);
    return{topic:'appraisal-market-history',text:focusItem+' '+market+' liquidity: '+details.join('; ')+'.'+dataNote,focusItem};
  }

  const perUnitBuy=number(row.buy);
  const perUnitSplit=number(row.split);
  const perUnitSell=number(row.sell);
  const amount=Math.max(1,number(row.amount)||qty);
  return{
    topic:'appraisal-market-price',
    text:amount.toLocaleString('en-US')+' '+focusItem+' in '+market+': buy '+isk(row.buyTotal)+' ('+isk(perUnitBuy)+'/unit), split '+isk(row.splitTotal)+' ('+isk(perUnitSplit)+'/unit), sell '+isk(row.sellTotal)+' ('+isk(perUnitSell)+'/unit). Pricing mode: '+String(appraisal.pricingVariant||'immediate')+'.'+dataNote,
    focusItem,
    metrics:{typeId:row.typeId,buy:row.buyTotal,split:row.splitTotal,sell:row.sellTotal},
  };
}
