(() => {
  'use strict';
  let data=null,busy=false,loadError='';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>typeof value==='number'&&Number.isFinite(value)?Math.round(value).toLocaleString()+' ISK':'Unavailable';
  const date=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString():'Not available';
  function selectRecords(records,{query='',system='',sort='name'}={}){
    const q=query.trim().toLowerCase();
    return (records||[]).filter(row=>(!system||row.system===system)&&(!q||[row.name,row.system,row.recordedName,...(row.composition||[]).map(item=>item.name)].join(' ').toLowerCase().includes(q))).slice().sort((a,b)=>sort==='sell'?(b.estimates?.dailySell??-Infinity)-(a.estimates?.dailySell??-Infinity)||a.name.localeCompare(b.name):sort==='buy'?(b.estimates?.dailyBuy??-Infinity)-(a.estimates?.dailyBuy??-Infinity)||a.name.localeCompare(b.name):a.system.localeCompare(b.system)||a.name.localeCompare(b.name));
  }
  function render(){
    const host=$('ceoMoonRecords');if(!host)return;
    const refresh=$('ceoMoonRefresh');if(refresh){refresh.disabled=busy;refresh.textContent=busy?'REFRESHING…':'REFRESH STRUCTURES';}
    if(!data){host.innerHTML='<div class="visual-empty">'+(busy?'Loading private moon records…':'Moon records have not loaded.')+'</div>';return;}
    const b=data.baseline||{},live=data.live||{};
    const stamp=$('ceoMoonSource');if(stamp)stamp.textContent=b.available?'TMP Admin baseline • '+b.sourceDate+' • historical estimates':'Admin workbook baseline unavailable';
    const system=$('ceoMoonSystem');if(system){const selected=system.value;system.innerHTML='<option value="">All systems</option>'+(b.systems||[]).map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('');if((b.systems||[]).includes(selected))system.value=selected;}
    const summary=$('ceoMoonSummary');if(summary)summary.innerHTML=[['MOONS',String(b.records?.length||0)],['SYSTEMS',String(b.systems?.length||0)],['SHEET 28-DAY BUY ESTIMATE',b.totals?.buy28Days?.missing?'Incomplete':money(b.totals?.buy28Days?.value)],['SHEET 28-DAY SELL ESTIMATE',b.totals?.sell28Days?.missing?'Incomplete':money(b.totals?.sell28Days?.value)]].map(([label,value])=>'<div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>').join('');
    const rows=selectRecords(b.records,{query:$('ceoMoonSearch')?.value||'',system:system?.value||'',sort:$('ceoMoonSort')?.value||'name'});
    const count=$('ceoMoonCount');if(count)count.textContent=rows.length+' of '+(b.records?.length||0)+' moon records';
    host.innerHTML=rows.map(row=>'<details class="ceo-moon-record"><summary><span class="ceo-moon-system">'+esc(row.system)+'</span><strong>'+esc(row.name)+'</strong><span><small>SHEET SELL / DAY</small>'+esc(money(row.estimates?.dailySell))+'</span></summary><div class="ceo-moon-detail"><div class="ceo-moon-composition">'+(row.composition||[]).map(item=>'<span>'+esc(item.name)+' <b>'+(item.fraction*100).toFixed(2)+'%</b></span>').join('')+'</div><div class="ceo-moon-values">'+[['Sheet buy / day',money(row.estimates?.dailyBuy)],['Sheet sell / 28 days',money(row.estimates?.sell28Days)],['Sheet alliance tax / full moon',money(row.estimates?.allianceTax)],['Sheet days to recoup',row.estimates?.recoupDays||'Unavailable'],['Magma breakeven / unit, selling to buy',money(row.estimates?.magmaBreakevenBuy)],['Magma breakeven / unit, via sell',money(row.estimates?.magmaBreakevenSell)]].map(([label,value])=>'<div><small>'+esc(label)+'</small><b>'+esc(value)+'</b></div>').join('')+'</div><p>Recorded name: '+esc(row.recordedName||'Not recorded')+(row.note?' • Sheet note: '+esc(row.note):'')+'</p><small>Moon Overview rows '+esc(row.sourceRow)+' and '+esc(row.estimateRow)+' • historical worksheet figures</small></div></details>').join('')||'<div class="visual-empty">'+(b.available?'No moons match these filters.':'No admin workbook records available.')+'</div>';
    const assumptions=$('ceoMoonAssumptions');if(assumptions){const a=b.assumptions||{};assumptions.innerHTML='<p>Sheet assumptions: alliance tax '+esc(a.allianceTaxRate===null||a.allianceTaxRate===undefined?'Unavailable':(a.allianceTaxRate*100).toFixed(0)+'%')+' • magmatic gas '+esc(money(a.magmaticGasPrice))+' / unit • '+esc(a.magmaticGasPerHour??'Unavailable')+' units / hour • '+esc(money(a.magmaticGasCostPerHour))+' / hour.</p><ul>'+(b.notes||[]).map(note=>'<li>'+esc(note)+'</li>').join('')+'</ul>';}
    const liveStamp=$('ceoStructuresStamp');if(liveStamp)liveStamp.textContent=(live.stale?'LAST SUCCESSFUL PULL • ':live.available?'LIVE ESI PULL • ':'LIVE ESI UNAVAILABLE • ')+date(live.updatedAt||live.checkedAt);
    const warning=$('ceoStructuresWarning');if(warning){warning.classList.toggle('hidden',!live.error&&!live.truncated&&!loadError);warning.textContent=(loadError?loadError+' ':'')+(live.error?'Structure pull: '+live.error+'. The admin workbook remains available. ':'')+(live.truncated?'ESI returned more pages than the configured limit; this list is partial.':'');}
    const structures=$('ceoLiveStructures');if(structures)structures.innerHTML=(live.records||[]).map(row=>'<details class="ceo-live-structure"><summary><strong>'+esc(row.system)+' • '+esc(row.type)+'</strong><span class="ceo-fuel '+esc(row.fuelStatus.toLowerCase())+'">'+esc(row.fuelStatus==='UNKNOWN'?'Fuel expiry not reported':row.fuelStatus==='EXPIRED'?'Fuel expiry passed':(Math.max(0,row.fuelHours)/24).toFixed(1)+' days of fuel'+(row.fuelStatus==='LOW'?' • LOW':''))+'</span></summary><div><p>Structure ID '+esc(row.structureId)+' • '+esc((row.state||'Unknown state').replaceAll('_',' '))+'</p><p>Fuel expires: '+esc(date(row.fuelExpires))+'</p><p>Services: '+esc((row.services||[]).map(item=>item.name+' ('+item.state+')').join(', ')||'Not reported')+'</p></div></details>').join('')||'<div class="visual-empty">'+(live.available?'No corporation-owned structures returned by ESI.':'Live structures are unavailable; sheet records above remain usable.')+'</div>';
  }
  async function load(force=false){
    if(busy)return;if(data&&!force){render();return;}
    busy=true;loadError='';render();
    try{const response=await fetch('/api/ceo/moons'+(force?'?force=1':''),{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error(response.status===403?'CEO access is restricted.':response.status===401?'Log in to view CEO data.':'Moon records could not be loaded.');data=await response.json();}
    catch(error){loadError=String(error.message||error);const warning=$('ceoStructuresWarning');if(warning){warning.classList.remove('hidden');warning.textContent=loadError;}}
    finally{busy=false;render();}
  }
  document.addEventListener('input',event=>{if(event.target?.id==='ceoMoonSearch')render();});
  document.addEventListener('change',event=>{if(['ceoMoonSystem','ceoMoonSort'].includes(event.target?.id))render();});
  document.addEventListener('click',event=>{if(event.target?.closest?.('#ceoMoonRefresh'))void load(true);});
  window.JlrCeoMoons={load,render,selectRecords};
})();
