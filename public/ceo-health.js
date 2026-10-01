(() => {
  'use strict';
  let serial=0,timer;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const labels={setup:'SETUP NEEDED',paused:'PAUSED',collecting:'COLLECTING',unpulled:'NOT PULLED',permission:'PERMISSION NEEDED',disconnected:'NOT CONNECTED',loading:'PULLING',stale:'PREVIOUS RESULTS',failed:'PULL FAILED',partial:'PARTIAL RESULTS',older:'OLDER SNAPSHOT',pulled:'PULL SUCCEEDED',saved:'BASELINE SAVED',missing:'BASELINE MISSING'};
  async function load(){
    const host=$('ceoHealthRows');if(!host)return;
    const request=++serial;
    try{
      const response=await fetch('/api/ceo/health',{credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw new Error(response.status===401?'Log in to view CEO data health.':response.status===403?'CEO access is restricted.':'Data health could not be loaded.');
      const data=await response.json();if(request!==serial)return;
      host.innerHTML=data.rows.map(row=>'<div class="ceo-health-row"><div><strong>'+esc(row.name)+'</strong><small>'+esc(row.note)+'</small></div><span class="ceo-health-status '+esc(row.status)+'">'+esc(labels[row.status]||row.status)+'</span><small>'+(row.count!==null?Number(row.count).toLocaleString()+' records • ':'')+esc(row.status==='saved'?'Historical baseline':row.updatedAt?'Pulled '+new Date(row.updatedAt).toLocaleString():row.checkedAt?'Checked '+new Date(row.checkedAt).toLocaleString():'No pull recorded')+'</small></div>').join('');
      if($('ceoHealthSummary'))$('ceoHealthSummary').textContent=data.attention+' sections need attention • '+data.unpulled+' sections not pulled • status checked '+new Date(data.checkedAt).toLocaleString();
    }catch(error){if(request===serial){host.innerHTML='<div class="visual-empty">'+esc(error.message||error)+'</div>';if($('ceoHealthSummary'))$('ceoHealthSummary').textContent='Status unavailable.';}}
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(()=>void load(),150);}
  document.addEventListener('click',event=>{if(event.target?.closest?.('#ceoHealthRefresh'))void load();});
  window.JlrCeoHealth={load,schedule};
})();
