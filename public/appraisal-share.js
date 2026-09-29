(()=>{
  const root=document.getElementById('root');
  const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const number=value=>Math.max(0,Number(value)||0);
  const isk=value=>{
    const n=number(value);
    if(n>=1e12)return(n/1e12).toFixed(2)+'T';
    if(n>=1e9)return(n/1e9).toFixed(2)+'B';
    if(n>=1e6)return(n/1e6).toFixed(2)+'M';
    if(n>=1e3)return(n/1e3).toFixed(1)+'K';
    return Math.round(n).toLocaleString();
  };
  const fullIsk=value=>number(value).toLocaleString(undefined,{maximumFractionDigits:0})+' ISK';
  const price=value=>number(value).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2});
  const vol=value=>{
    const n=number(value);
    if(n>=1e9)return(n/1e9).toFixed(2)+'B m³';
    if(n>=1e6)return(n/1e6).toFixed(2)+'M m³';
    if(n>=1e3)return(n/1e3).toFixed(1)+'K m³';
    return n.toLocaleString(undefined,{maximumFractionDigits:2})+' m³';
  };
  const mode=value=>['buy','split','sell'].includes(String(value||'').toLowerCase())?String(value).toLowerCase():'split';
  const variant=value=>String(value||'immediate')==='top5percent'?'TOP 5% AVERAGE':'IMMEDIATE';
  const dateLabel=value=>{
    const ms=Date.parse(String(value||''));
    return Number.isFinite(ms)?new Date(ms).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
  };

  function metric(label,value,sub,selected=false){
    return '<article class="metric'+(selected?' selected':'')+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub||'')+'</small></article>';
  }

  function refineHtml(refine){
    if(!refine||typeof refine!=='object')return'';
    const lines=Math.max(0,Number(refine.recognizedLines)||0);
    const rate=Math.max(0,Math.min(1,Number(refine.selectedRate??refine.defaultRate??0)));
    const ratePct=rate*100;
    if(!lines){
      return '<section class="section refine"><div class="refine-head"><div class="refine-title"><span class="eyebrow">JLR REPROCESS // ORE</span><strong>REFINE ESTIMATE</strong><small>No refinable ore was recognized in this appraisal.</small></div><div class="rate-badge"><span>ORE EFFICIENCY</span><strong>'+ratePct.toFixed(2)+'%</strong></div></div><div class="refine-note">Modules, ships, loot, and non-ore items remain appraisal-only.</div></section>';
    }
    const refined=number(refine.buyAt100)*rate;
    const raw=number(refine.eligibleBuy);
    const delta=refined-raw;
    const deltaText=(delta>=0?'+':'−')+isk(Math.abs(delta))+' ISK';
    const minerals=(Array.isArray(refine.minerals)?refine.minerals:[]).slice(0,14);
    return '<section class="section refine">'+
      '<div class="refine-head"><div class="refine-title"><span class="eyebrow">JLR REPROCESS // ORE</span><strong>REFINE ESTIMATE</strong><small>Recognized ore is compared against its raw buy value.</small></div><div class="rate-badge"><span>ORE EFFICIENCY</span><strong>'+ratePct.toFixed(2)+'%</strong></div></div>'+
      '<div class="refine-grid">'+
        '<article class="refine-card"><span>REFINED BUY</span><strong>'+isk(refined)+' ISK</strong><small>'+fullIsk(refined)+'</small></article>'+
        '<article class="refine-card"><span>RAW ORE BUY</span><strong>'+isk(raw)+' ISK</strong><small>'+fullIsk(raw)+'</small></article>'+
        '<article class="refine-card '+(delta>=0?'positive':'negative')+'"><span>REFINE DIFFERENCE</span><strong>'+deltaText+'</strong><small>refined − raw buy</small></article>'+
        '<article class="refine-card"><span>REFINABLE</span><strong>'+lines.toLocaleString()+' LINE'+(lines===1?'':'S')+'</strong><small>'+number(refine.recognizedUnits).toLocaleString()+' ore units</small></article>'+
      '</div>'+
      (minerals.length?'<div class="minerals">'+minerals.map(row=>{
        const qty=number(row.quantityAt100)*rate;
        const value=number(row.valueAt100)*rate;
        return '<div class="mineral"><span>'+esc(row.mineral)+'</span><strong>'+Math.floor(qty).toLocaleString()+'</strong><small>'+isk(value)+' ISK</small></div>';
      }).join('')+'</div>':'')+
      '<div class="refine-note">Estimate uses '+esc(refine.pricingBasis||'Jita mineral buy')+'. This is an appraisal comparison, not an in-game reprocessing quote.</div>'+
    '</section>';
  }

  async function boot(){
    const token=location.pathname.split('/').filter(Boolean).pop()||'';
    try{
      const response=await fetch('/api/appraisal/share/'+encodeURIComponent(token),{headers:{Accept:'application/json'},cache:'no-store'});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload?.message||payload?.error||'Appraisal not found');
      const share=payload.share||{};
      const appraisal=share.appraisal||{};
      const summary=appraisal.summary||{};
      const items=Array.isArray(appraisal.items)?appraisal.items:[];
      const selectedMode=mode(appraisal.pricing);
      const selectedValue=selectedMode==='buy'?summary.buy:selectedMode==='sell'?summary.sell:summary.split;
      const created=dateLabel(share.createdAt||appraisal.generatedAt);
      document.title=(share.title||'JLR Appraisal')+' • JLR';

      root.className='share-shell';
      root.innerHTML=
        '<section class="hero">'+
          '<div><span class="eyebrow">JLR MARKET NETWORK // SHARED APPRAISAL</span><h1>'+esc(share.title||'JLR Appraisal')+'</h1>'+
            '<div class="meta"><span>MARKET <b>'+esc(appraisal.market?.name||'Jita 4-4')+'</b></span><span>PRICING <b>'+esc(variant(appraisal.pricingVariant))+'</b></span><span>SHARED BY <b>'+esc(share.owner?.name||'JLR Pilot')+'</b></span>'+(created?'<span>CREATED <b>'+esc(created)+'</b></span>':'')+'</div>'+
          '</div>'+
          '<div class="hero-value"><span>'+selectedMode.toUpperCase()+' APPRAISAL</span><strong>'+isk(selectedValue)+' ISK</strong><small title="'+esc(fullIsk(selectedValue))+'">'+esc(fullIsk(selectedValue))+'</small></div>'+
        '</section>'+
        '<section class="price-grid">'+
          metric('JITA BUY',isk(summary.buy)+' ISK',fullIsk(summary.buy),selectedMode==='buy')+
          metric('SPLIT',isk(summary.split)+' ISK',fullIsk(summary.split),selectedMode==='split')+
          metric('JITA SELL',isk(summary.sell)+' ISK',fullIsk(summary.sell),selectedMode==='sell')+
          metric('VOLUME',vol(summary.volume),number(summary.units).toLocaleString()+' total units')+
          metric('ITEM TYPES',number(summary.resolvedLines).toLocaleString(),number(summary.unresolvedLines)+' unresolved')+
        '</section>'+
        '<section class="section">'+
          '<div class="section-head"><div><strong>APPRAISAL ITEMS</strong><small>Per-unit pricing and totals for the pasted quantities</small></div><span class="section-count">'+items.length.toLocaleString()+' ROW'+(items.length===1?'':'S')+'</span></div>'+
          '<div class="table-wrap"><table><thead><tr><th>ITEM</th><th>QTY</th><th>VOLUME</th><th class="'+(selectedMode==='buy'?'selected':'')+'">BUY / EA</th><th class="'+(selectedMode==='split'?'selected':'')+'">SPLIT / EA</th><th class="'+(selectedMode==='sell'?'selected':'')+'">SELL / EA</th><th>BUY TOTAL</th><th>SELL TOTAL</th></tr></thead>'+
          '<tbody>'+(items.length?items.map(row=>row.resolved===false
            ?'<tr><td class="item bad"><strong>'+esc(row.name)+'</strong><small>UNRESOLVED</small></td><td colspan="7">—</td></tr>'
            :'<tr><td class="item"><strong>'+esc(row.name)+'</strong><small>'+number(row.buyOrderCount).toLocaleString()+' BUY ORDERS • '+number(row.sellOrderCount).toLocaleString()+' SELL ORDERS</small></td><td>'+number(row.amount).toLocaleString()+'</td><td>'+vol(row.totalVolume)+'</td><td class="'+(selectedMode==='buy'?'selected':'')+'">'+price(row.buy)+'</td><td class="'+(selectedMode==='split'?'selected':'')+'">'+price(row.split)+'</td><td class="'+(selectedMode==='sell'?'selected':'')+'">'+price(row.sell)+'</td><td>'+isk(row.buyTotal)+'</td><td>'+isk(row.sellTotal)+'</td></tr>').join(''):'<tr><td colspan="8">No appraisal rows.</td></tr>')+'</tbody></table></div>'+
        '</section>'+
        refineHtml(appraisal.refine)+
        '<footer class="footer"><div>JLR APPRAISAL • VALUES MOVE WITH EVE MARKET ORDERS • CHECK THE MARKET BEFORE LARGE TRADES</div><span><a href="/">OPEN JLR MINER TRACKER →</a></span></footer>';
    }catch(error){
      root.className='error-card';
      root.innerHTML='<div><span class="eyebrow">JLR MARKET NETWORK</span><h1>Appraisal unavailable</h1><p class="bad">'+esc(error.message||error)+'</p></div>';
    }
  }
  boot();
})();
