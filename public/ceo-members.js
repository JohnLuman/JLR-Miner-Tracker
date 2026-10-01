(() => {
  'use strict';
  const timestamp=value=>{const time=Date.parse(value||'');return Number.isFinite(time)?time:null;};
  function select(rows,{query='',activity='all',sort='name',at=Date.now()}={}){
    const q=query.trim().toLowerCase();
    return (rows||[]).filter(row=>{
      if(q&&!String(row.name||'').toLowerCase().includes(q)&&!String(row.characterId||'').includes(q))return false;
      const login=timestamp(row.logonDate);
      if(activity==='recent')return login!==null&&login<=at&&at-login<=7*86400000;
      if(activity==='older')return login!==null&&login<=at&&at-login>30*86400000;
      if(activity==='unknown')return login===null;
      return true;
    }).slice().sort((a,b)=>{
      if(sort==='loyalty')return (Number(b.loyalty?.balance)||0)-(Number(a.loyalty?.balance)||0)||String(a.name).localeCompare(String(b.name));
      if(sort==='login'||sort==='joined'){
        const key=sort==='login'?'logonDate':'startDate';
        const av=timestamp(a[key]),bv=timestamp(b[key]);
        if(av===null&&bv!==null)return 1;
        if(bv===null&&av!==null)return -1;
        if(av!==null&&bv!==null&&av!==bv)return bv-av;
      }
      return String(a.name||'').localeCompare(String(b.name||''));
    });
  }
  const formatDate=value=>timestamp(value)===null?'Not reported':new Date(value).toLocaleString();
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function loyaltyHistory(loyalty){
    const rows=Array.isArray(loyalty?.history)?loyalty.history:[];
    const count=Number(loyalty?.adjustmentCount)||0;
    return '<div class="ceo-loyalty-history"><strong>LOYALTY ADJUSTMENT HISTORY</strong><small>'+ (rows.length?'Latest '+rows.length+' of '+count+' retained adjustments. Up to 250 are retained per member.':'No recorded adjustments.')+'</small>'+rows.map(row=>{
      const points=Number(row.points)||0;
      return '<div class="ceo-loyalty-history-row"><b class="'+(points>=0?'positive':'negative')+'">'+(points>0?'+':'')+points.toLocaleString()+' pts</b><span>'+escape(row.note||'No reason recorded')+'</span><small>'+escape(formatDate(row.createdAt))+' • '+escape(row.createdBy||'CEO Command')+'</small></div>';
    }).join('')+'<p>To correct points, make an opposite adjustment with a reason. Existing records remain in the history.</p></div>';
  }
  window.JlrCeoMembers={select,formatDate,loyaltyHistory};
})();
