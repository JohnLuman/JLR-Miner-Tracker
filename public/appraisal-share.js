(()=>{
  const root=document.getElementById('root');
  const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const isk=value=>{
    const n=Math.max(0,Number(value)||0);
    if(n>=1e12)return(n/1e12).toFixed(2)+'T';
    if(n>=1e9)return(n/1e9).toFixed(2)+'B';
    if(n>=1e6)return(n/1e6).toFixed(2)+'M';
    if(n>=1e3)return(n/1e3).toFixed(1)+'K';
    return Math.round(n).toLocaleString();
  };
  const vol=value=>{
    const n=Math.max(0,Number(value)||0);
    if(n>=1e9)return(n/1e9).toFixed(2)+'B m³';
    if(n>=1e6)return(n/1e6).toFixed(2)+'M m³';
    if(n>=1e3)return(n/1e3).toFixed(1)+'K m³';
    return n.toLocaleString(undefined,{maximumFractionDigits:2})+' m³';
  };
  const number=value=>Math.max(0,Number(value)||0);
  const mode=value=>{
    const key=String(value||'split').toLowerCase();
    if(key==='refine-buy')return'REFINE BUY';
    if(key==='refine-sell')return'REFINE SELL';
    return key.toUpperCase();
  };
  const variant=value=>String(value||'immediate')==='top5percent'?'TOP 5% AVG':'IMMEDIATE';
  const dateTime=value=>{
    const ms=Date.parse(String(value||''));
    if(!Number.isFinite(ms))return'Pricing snapshot unavailable';
    return 'Priced '+new Date(ms).toLocaleString([],{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  };
  const kpi=(label,value,klass='')=>`<article class="kpi ${klass}"><span>${esc(label)}</span><strong>${value}</strong></article>`;

  function refineHtml(refine){
    if(!refine||typeof refine!=='object')return'';
    const lines=Math.max(0,Number(refine.recognizedLines)||0);
    const rate=Math.max(0,Math.min(1,Number(refine.selectedRate??refine.defaultRate??0)));
    const ratePct=rate*100;
    if(!lines){
      return `<section class="refine-panel">
        <div class="refine-head">
          <div><span>JLR REPROCESS // ORE</span><strong>REFINE ESTIMATE</strong><small>No refinable ore was recognized in this appraisal.</small></div>
          <div class="refine-rate"><span>ORE EFFICIENCY</span><strong>${ratePct.toFixed(2)}%</strong></div>
        </div>
        <div class="refine-note">Modules, ships, loot, and non-ore items remain appraisal-only.</div>
      </section>`;
    }
    const refined=number(refine.buyAt100)*rate;
    const refinedSell=number(refine.sellAt100)*rate;
    const raw=number(refine.eligibleBuy);
    const delta=refined-raw;
    const minerals=(Array.isArray(refine.minerals)?refine.minerals:[]).slice(0,14);
    return `<section class="refine-panel">
      <div class="refine-head">
        <div><span>JLR REPROCESS // ORE</span><strong>REFINE ESTIMATE</strong><small>Recognized ore compared with its raw Jita buy value.</small></div>
        <div class="refine-rate"><span>ORE EFFICIENCY</span><strong>${ratePct.toFixed(2)}%</strong></div>
      </div>
      <div class="refine-grid">
        <article class="refine-card"><span>REFINED BUY</span><strong>${isk(refined)} ISK</strong><small>Jita mineral buy</small></article>
        <article class="refine-card"><span>REFINED SELL</span><strong>${isk(refinedSell)} ISK</strong><small>Jita mineral sell</small></article>
        <article class="refine-card"><span>RAW ORE BUY</span><strong>${isk(raw)} ISK</strong><small>recognized ore only</small></article>
        <article class="refine-card ${delta>=0?'positive':'negative'}"><span>REFINE DIFFERENCE</span><strong>${delta>=0?'+':'−'}${isk(Math.abs(delta))} ISK</strong><small>refined buy − raw buy</small></article>
        <article class="refine-card"><span>REFINABLE</span><strong>${lines.toLocaleString()} LINE${lines===1?'':'S'}</strong><small>${number(refine.recognizedUnits).toLocaleString()} ore units</small></article>
      </div>
      ${minerals.length?`<div class="refine-minerals">${minerals.map(row=>{
        const qty=number(row.quantityAt100)*rate;
        const value=number(row.valueAt100)*rate;
        return `<div class="refine-mineral"><span>${esc(row.mineral)}</span><strong>${Math.floor(qty).toLocaleString()}</strong><small>${isk(value)} ISK</small></div>`;
      }).join('')}</div>`:''}
      <div class="refine-note">Estimate uses ${esc(refine.pricingBasis||'Jita mineral buy')}. This is an appraisal comparison, not an in-game reprocessing quote.</div>
    </section>`;
  }

  async function boot(){
    const token=location.pathname.split('/').filter(Boolean).pop()||'';
    try{
      const response=await fetch('/api/appraisal/share/'+encodeURIComponent(token),{headers:{Accept:'application/json'},cache:'no-store'});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload?.message||payload?.error||'Appraisal not found');
      const share=payload.share||{};
      const appraisal=share.appraisal||{},summary=appraisal.summary||{};
      const items=Array.isArray(appraisal.items)?appraisal.items:[];
      const pricing=mode(appraisal.pricing);
      const pricingKey=String(appraisal.pricing||'split').toLowerCase();
      const selectedLabel=pricingKey==='buy'?'JITA BUY'
        :pricingKey==='sell'?'JITA SELL'
        :pricingKey==='refine-buy'?'REFINED BUY'
        :pricingKey==='refine-sell'?'REFINED SELL'
        :'SPLIT';
      document.title=(share.title||'JLR Appraisal')+' • JLR';

      root.classList.remove('loading-panel');
      root.innerHTML=`
        <section class="share-hero">
          <div class="hero-copy">
            <div class="hero-kicker"><span>JLR APPRAISAL</span><span class="hero-dot">•</span><span>${esc(appraisal.market?.name||'Jita 4-4')}</span></div>
            <h1>${esc(share.title||'JLR Appraisal')}</h1>
            <p class="sub">Shared by <strong>${esc(share.owner?.name||'JLR Pilot')}</strong> • ${variant(appraisal.pricingVariant)} pricing</p>
            <p class="snapshot">${esc(dateTime(appraisal.datasetTime||appraisal.generatedAt))}</p>
          </div>
          <div class="hero-value">
            <span>${esc(selectedLabel)} APPRAISAL</span>
            <strong>${isk(summary.value)} <small>ISK</small></strong>
            <em>${pricing} MODE</em>
          </div>
        </section>

        <section class="kpis" aria-label="Appraisal totals">
          ${kpi('JITA BUY',isk(summary.buy)+' ISK',pricingKey==='buy'?'selected':'')}
          ${kpi('SPLIT',isk(summary.split)+' ISK',pricingKey==='split'?'selected':'')}
          ${kpi('JITA SELL',isk(summary.sell)+' ISK',pricingKey==='sell'?'selected':'')}
          ${kpi('VOLUME',vol(summary.volume))}
          ${kpi('ITEM TYPES',Number(summary.resolvedLines||0).toLocaleString())}
          ${kpi('TOTAL UNITS',Number(summary.units||0).toLocaleString())}
        </section>

        <section class="items-panel">
          <div class="section-head">
            <div><span>APPRAISAL CONTENTS</span><strong>${Number(summary.resolvedLines||0).toLocaleString()} priced item type${Number(summary.resolvedLines||0)===1?'':'s'}</strong></div>
            <small>Market prices can move after this appraisal was created.</small>
          </div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>ITEM</th><th>QTY</th><th>VOLUME</th><th>BUY / EA</th><th>SPLIT / EA</th><th>SELL / EA</th><th>BUY TOTAL</th><th>SPLIT TOTAL</th><th>SELL TOTAL</th></tr></thead>
            <tbody>${items.length?items.map(row=>row.resolved===false
              ?`<tr class="unresolved"><td class="item bad"><div class="item-name"><span class="item-icon placeholder">?</span><span><strong>${esc(row.name)}</strong><small>UNRESOLVED ITEM</small></span></div></td><td colspan="8">—</td></tr>`
              :`<tr>
                <td class="item"><div class="item-name"><img class="item-icon" src="https://images.evetech.net/types/${Number(row.typeId||0)}/icon?size=32" alt="" loading="lazy"><span><strong>${esc(row.name)}</strong><small>TYPE ${Number(row.typeId||0)}</small></span></div></td>
                <td class="num qty">${Number(row.amount||0).toLocaleString()}</td>
                <td class="num">${vol(row.totalVolume)}</td>
                <td class="num buy">${isk(row.buy)}</td>
                <td class="num split">${isk(row.split)}</td>
                <td class="num sell">${isk(row.sell)}</td>
                <td class="num total buy">${isk(row.buyTotal)}</td>
                <td class="num total split">${isk(row.splitTotal)}</td>
                <td class="num total sell">${isk(row.sellTotal)}</td>
              </tr>`).join(''):'<tr><td colspan="9" class="empty-row">No appraisal rows.</td></tr>'}</tbody>
          </table></div>
        </section>

        ${refineHtml(appraisal.refine)}

        <footer class="footer">
          <div><strong>JLR MARKET NETWORK</strong><span>Market pricing is sourced through the configured appraisal provider and presented in JLR format.</span></div>
          <a href="/">OPEN JLR MINER TRACKER <span aria-hidden="true">›</span></a>
        </footer>
      `;
    }catch(error){
      root.classList.remove('loading-panel');
      root.innerHTML='<section class="error-state"><span>JLR MARKET NETWORK</span><h1>Appraisal unavailable</h1><p class="bad">'+esc(error.message||error)+'</p><a href="/">Return to JLR</a></section>';
    }
  }
  boot();
})();
