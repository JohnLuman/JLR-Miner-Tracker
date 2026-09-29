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
  const mode=value=>String(value||'split').toUpperCase();
  const variant=value=>String(value||'immediate')==='top5percent'?'TOP 5% AVG':'IMMEDIATE';

  async function boot(){
    const token=location.pathname.split('/').filter(Boolean).pop()||'';
    try{
      const response=await fetch('/api/appraisal/share/'+encodeURIComponent(token),{headers:{Accept:'application/json'}});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload?.message||payload?.error||'Appraisal not found');
      const share=payload.share||{};
      const appraisal=share.appraisal||{},summary=appraisal.summary||{};
      const items=Array.isArray(appraisal.items)?appraisal.items:[];
      document.title=(share.title||'JLR Appraisal')+' • JLR';
      root.innerHTML=`
        <div class="head">
          <div><h1>${esc(share.title||'JLR Appraisal')}</h1><p class="sub">${esc(appraisal.market?.name||'Jita 4-4')} • ${variant(appraisal.pricingVariant)} • shared by ${esc(share.owner?.name||'JLR Pilot')}</p></div>
          <span class="chip">${mode(appraisal.pricing)} APPRAISAL</span>
        </div>
        <div class="kpis">
          <div class="kpi"><span>APPRAISED</span><strong>${isk(summary.value)} ISK</strong></div>
          <div class="kpi"><span>JITA BUY</span><strong>${isk(summary.buy)} ISK</strong></div>
          <div class="kpi"><span>SPLIT</span><strong>${isk(summary.split)} ISK</strong></div>
          <div class="kpi"><span>JITA SELL</span><strong>${isk(summary.sell)} ISK</strong></div>
          <div class="kpi"><span>VOLUME</span><strong>${vol(summary.volume)}</strong></div>
          <div class="kpi"><span>ITEM TYPES</span><strong>${Number(summary.resolvedLines||0).toLocaleString()}</strong></div>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>ITEM</th><th>QTY</th><th>VOLUME</th><th>BUY / EA</th><th>SPLIT / EA</th><th>SELL / EA</th><th>BUY TOTAL</th><th>SELL TOTAL</th></tr></thead>
          <tbody>${items.length?items.map(row=>row.resolved===false
            ?`<tr><td class="item bad"><strong>${esc(row.name)}</strong><small>UNRESOLVED</small></td><td colspan="7">—</td></tr>`
            :`<tr><td class="item"><strong>${esc(row.name)}</strong><small>TYPE ${Number(row.typeId||0)}</small></td><td>${Number(row.amount||0).toLocaleString()}</td><td>${vol(row.totalVolume)}</td><td>${isk(row.buy)}</td><td>${isk(row.split)}</td><td>${isk(row.sell)}</td><td>${isk(row.buyTotal)}</td><td>${isk(row.sellTotal)}</td></tr>`).join(''):'<tr><td colspan="8">No appraisal rows.</td></tr>'}</tbody>
        </table></div>
        <div class="footer">JLR Appraisal • market pricing is sourced through the configured appraisal provider and presented in JLR format. Values can move as EVE market orders change.</div>
      `;
    }catch(error){
      root.innerHTML='<h1>Appraisal unavailable</h1><p class="bad">'+esc(error.message||error)+'</p>';
    }
  }
  boot();
})();
