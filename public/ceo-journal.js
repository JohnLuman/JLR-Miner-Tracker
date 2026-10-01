(() => {
  'use strict';
  let data=null,page=1,serial=0,busy=false,error='',timer;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=value=>typeof value==='number'&&Number.isFinite(value)?Math.round(value).toLocaleString()+' ISK':'Not reported';
  const date=value=>Number.isFinite(Date.parse(value||''))?new Date(value).toLocaleString():'Not reported';
  function render(){
    const host=$('ceoJournalRecords');if(!host)return;
    const refresh=$('ceoJournalRefresh');if(refresh){refresh.disabled=busy;refresh.textContent=busy?'LOADING…':'REFRESH VIEW';}
    const warning=$('ceoJournalWarning');
    const pull=data?.pull;
    if(warning){
      const messages=[error,data&&!data.walletGranted?'Corporation wallet permission is still needed. Renius can use CONNECT CORP WALLET.':'',pull?.error,pull?.truncated?'The latest ESI pull reached its page limit; retained history may be incomplete.':''].filter(Boolean);
      warning.classList.toggle('hidden',!messages.length);warning.textContent=messages.join(' • ');
    }
    const stamp=$('ceoJournalStamp');if(stamp)stamp.textContent=pull?.updatedAt?'Journal pull '+date(pull.updatedAt)+(pull.available?'':' • last successful pull'):'No successful journal pull recorded.';
    if(!data){if($('ceoJournalSummary'))$('ceoJournalSummary').innerHTML='';if($('ceoJournalCount'))$('ceoJournalCount').textContent='';for(const id of ['ceoJournalPrev','ceoJournalNext'])if($(id))$(id).disabled=true;host.innerHTML='<div class="visual-empty">'+(busy?'Loading saved wallet entries…':error?'Journal view could not be loaded.':'No wallet entries loaded.')+'</div>';return;}
    const month=$('ceoJournalMonth');if(month){const selected=month.value;month.innerHTML='<option value="">All observed months</option>'+data.months.map(value=>'<option value="'+esc(value)+'">'+esc(value)+'</option>').join('');month.value=selected;}
    const summary=$('ceoJournalSummary');if(summary)summary.innerHTML=[['MATCHING MONEY IN',money(data.totals.income)],['MATCHING MONEY OUT',money(data.totals.expenses)],['MATCHING NET',money(data.totals.net)]].map(([label,value])=>'<div><small>'+label+'</small><strong>'+esc(value)+'</strong></div>').join('');
    const count=$('ceoJournalCount');if(count)count.textContent=data.total+' matching entries of '+data.retained+' retained • page '+data.page+' of '+data.pages+(busy?' • updating…':error?' • previous results':'');
    const prev=$('ceoJournalPrev'),next=$('ceoJournalNext');if(prev)prev.disabled=busy||data.page<=1;if(next)next.disabled=busy||data.page>=data.pages;
    host.innerHTML=data.records.map(row=>'<details class="ceo-journal-record"><summary><span>'+esc(date(row.date))+'</span><strong>'+esc(String(row.refType||'Unknown').replaceAll('_',' '))+'</strong><b class="'+(row.amount<0?'negative':'positive')+'">'+esc(money(row.amount))+'</b></summary><div><p>Division '+esc(row.division)+' • Journal reference '+esc(row.refId)+'</p><p>'+esc(row.description||'No description reported')+'</p><p>Reason: '+esc(row.reason||'Not reported')+'</p><p>First party ID: '+esc(row.firstPartyId||'Not reported')+' • Second party ID: '+esc(row.secondPartyId||'Not reported')+'</p><p>Balance after entry: '+esc(money(row.balance))+'</p></div></details>').join('')||'<div class="visual-empty">'+(!data.walletGranted&&!data.retained?'Waiting for corporation wallet permission.':data.retained?'No wallet entries match these filters.':'No wallet journal entries have been observed yet.')+'</div>';
  }
  function setMembers(rows){
    const select=$('ceoJournalParty');if(!select)return;
    const chosen=select.value;
    const members=(rows||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    select.innerHTML='<option value="">All parties / members</option>'+members.map(row=>'<option value="'+esc(row.characterId)+'">'+esc(row.name)+'</option>').join('');
    if(chosen&&!members.some(row=>String(row.characterId)===chosen))select.innerHTML+='<option value="'+esc(chosen)+'">Character '+esc(chosen)+'</option>';
    select.value=chosen;
  }
  function viewMember(characterId,month=''){
    const id=String(characterId||'');if(!/^\d+$/.test(id))return;
    const select=$('ceoJournalParty');if(!select)return;
    if(!Array.from(select.options||[]).some(option=>option.value===id))select.innerHTML+='<option value="'+esc(id)+'">Character '+esc(id)+'</option>';
    select.value=id;
    for(const control of ['ceoJournalSearch','ceoJournalMonth','ceoJournalDivision','ceoJournalDirection'])if($(control))$(control).value='';
    if(/^\d{4}-\d{2}$/.test(month))$('ceoJournalMonth').value=month;
    clearTimeout(timer);page=1;const request=load();
    $('ceoJournalParty')?.focus?.({preventScroll:true});
    $('ceoJournalCard')?.scrollIntoView?.({behavior:'smooth',block:'start'});
    return request;
  }
  async function load(){
    if(!$('ceoJournalRecords'))return;
    const request=++serial;
    const params=new URLSearchParams({query:$('ceoJournalSearch')?.value||'',month:$('ceoJournalMonth')?.value||'',division:$('ceoJournalDivision')?.value||'',direction:$('ceoJournalDirection')?.value||'',party:$('ceoJournalParty')?.value||'',page:String(page)});
    busy=true;error='';render();
    try{
      const response=await fetch('/api/ceo/journal?'+params,{credentials:'same-origin',cache:'no-store'});
      if(!response.ok){if(request===serial&&[401,403].includes(response.status))data=null;throw new Error(response.status===401?'Log in to view wallet history.':response.status===403?'CEO access is restricted.':'Wallet history could not be loaded.');}
      const next=await response.json();if(request!==serial)return;data=next;page=data.page;
    }catch(cause){if(request===serial)error=String(cause.message||cause);}
    finally{if(request===serial){busy=false;render();}}
  }
  document.addEventListener('input',event=>{if(event.target?.id==='ceoJournalSearch'){clearTimeout(timer);page=1;timer=setTimeout(()=>void load(),300);}});
  document.addEventListener('change',event=>{if(['ceoJournalMonth','ceoJournalDivision','ceoJournalDirection','ceoJournalParty'].includes(event.target?.id)){clearTimeout(timer);page=1;void load();}});
  document.addEventListener('click',event=>{
    const member=event.target?.closest?.('[data-ceo-member-journal]');if(member)viewMember(member.dataset.ceoMemberJournal,member.dataset.ceoMemberMonth||'');
    if(event.target?.closest?.('#ceoJournalRefresh'))void load();
    if(event.target?.closest?.('#ceoJournalPrev')&&!busy&&page>1){page--;void load();}
    if(event.target?.closest?.('#ceoJournalNext')&&!busy&&page<(data?.pages||1)){page++;void load();}
  });
  window.JlrCeoJournal={load,render,setMembers,viewMember};
})();
