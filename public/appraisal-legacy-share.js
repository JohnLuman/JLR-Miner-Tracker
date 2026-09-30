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
  const statusLabel=status=>({
    planning:'PLANNING','needs-mats':'NEEDS MATS',ready:'READY TO BUILD',building:'BUILDING',done:'DONE'
  })[status]||String(status||'PLANNING').toUpperCase();

  async function boot(){
    const token=location.pathname.split('/').filter(Boolean).pop()||'';
    try{
      const response=await fetch('/api/forge/share/'+encodeURIComponent(token),{headers:{Accept:'application/json'}});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload?.message||payload?.error||'Build not found');
      const share=payload.share||{};
      const plan=share.plan||{},summary=plan.summary||{};
      const items=Array.isArray(plan.items)?plan.items:[];
      const materials=Array.isArray(plan.materials)?plan.materials:[];
      document.title=(share.title||'JLR Archived Build')+' • JLR';
      root.innerHTML=`
        <div class="head">
          <div><h1>${esc(share.title||'JLR Build')}</h1><p class="sub">Posted by ${esc(share.owner?.name||'JLR Pilot')} • ME ${Number(plan.me||0)} / TE ${Number(plan.te||0)}</p></div>
          <span class="chip">${esc(statusLabel(share.status))}</span>
        </div>
        <div class="kpis">
          <div class="kpi"><span>BUILD LINES</span><strong>${Number(summary.buildableLines||0)}</strong></div>
          <div class="kpi"><span>MATERIAL TYPES</span><strong>${Number(summary.materialTypes||0)}</strong></div>
          <div class="kpi"><span>MATERIAL ESTIMATE</span><strong>${isk(summary.materialCost)} ISK</strong></div>
          <div class="kpi"><span>95% ORE PAYOUT</span><strong>${isk(summary.orePayoutValue)} ISK</strong></div>
        </div>
        <div class="grid">
          <section><h2>OUTPUTS</h2><div class="list">${items.length?items.map(row=>`<div class="row"><div><strong>${esc(row.name)}</strong><small>${esc(String(row.kind||'').toUpperCase())}</small></div><span>× ${Number(row.quantity||0).toLocaleString()}</span></div>`).join(''):'<div class="row">No output rows.</div>'}</div></section>
          <section><h2>MATERIAL SHOPPING LIST</h2><div class="list">${materials.length?materials.map(row=>`<div class="row"><div><strong>${esc(row.name)}</strong><small>MATERIAL</small></div><span>${Number(row.quantity||0).toLocaleString()} • ${isk(row.cost)} ISK</span></div>`).join(''):'<div class="row">No manufacturing materials.</div>'}</div></section>
        </div>
        ${share.notes?`<div class="notes">${esc(share.notes)}</div>`:''}
        <div class="footer">Archived JLR build snapshot • values were calculated when this link was created. <a href="/">Open JLR Appraisal</a> for current prices.</div>
      `;
    }catch(error){
      root.innerHTML='<h1>Build unavailable</h1><p class="error">'+esc(error.message||error)+'</p>';
    }
  }
  boot();
})();
