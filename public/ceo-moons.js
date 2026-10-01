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
  function selectStructures(records,{query='',filter='all'}={}){
    const q=query.trim().toLowerCase();
    return (records||[]).filter(row=>{
      if(q&&![row.system,row.type,row.structureId,row.state,...(row.services||[]).map(item=>item.name)].join(' ').toLowerCase().includes(q))return false;
      if(filter==='fuel')return ['LOW','EXPIRED'].includes(row.fuelStatus);
      if(filter==='unknown')return row.fuelStatus==='UNKNOWN';
      if(filter==='offline')return (row.services||[]).some(item=>item.state==='offline');
      return true;
    }).slice().sort((a,b)=>(a.fuelHours??Infinity)-(b.fuelHours??Infinity)||String(a.system).localeCompare(String(b.system)));
  }
  function render(){
    const host=$('ceoMoonRecords');if(!host)return;
    const refresh=$('ceoMoonRefresh');if(refresh){refresh.disabled=busy;refresh.textContent=busy?'REFRESHING…':'REFRESH MOONS + STRUCTURES';}
    if(!data){host.innerHTML='<div class="visual-empty">'+(busy?'Loading private moon records…':'Moon records have not loaded.')+'</div>';return;}
    const live=data.live||{},extractions=data.extractions||{},rows=extractions.records||[];
    const stamp=$('ceoMoonSource');if(stamp)stamp.textContent=(extractions.stale?'LAST SUCCESSFUL MOON PULL • ':extractions.available?'ESI MOON EXTRACTIONS • ':'MOON ESI UNAVAILABLE • ')+date(extractions.updatedAt||extractions.checkedAt);
    const summary=$('ceoMoonSummary');if(summary)summary.innerHTML='<div><small>CURRENT EXTRACTIONS</small><strong>'+rows.length+'</strong></div>';
    const count=$('ceoMoonCount');if(count)count.textContent=rows.length+' scheduled moon extractions';
    host.innerHTML=rows.map(row=>'<details class="ceo-moon-record"><summary><strong>'+esc(row.name)+'</strong><span>Chunk arrival '+esc(date(row.readyAt))+'</span></summary><div><p>Moon ID '+esc(row.moonId)+' • Structure ID '+esc(row.structureId)+'</p><p>Extraction started: '+esc(date(row.startedAt))+'</p><p>Natural decay: '+esc(date(row.decayAt))+'</p></div></details>').join('')||'<div class="visual-empty">'+(extractions.available?'No scheduled corporation moon extractions returned by ESI.':'Current moon extractions could not be loaded.')+'</div>';
    const liveStamp=$('ceoStructuresStamp');if(liveStamp)liveStamp.textContent=((live.stale||loadError)&&live.updatedAt?'LAST SUCCESSFUL PULL • ':live.available&&!loadError?'LIVE ESI PULL • ':'LIVE ESI UNAVAILABLE • ')+date(live.updatedAt||live.checkedAt);
    const warning=$('ceoStructuresWarning');if(warning){warning.classList.toggle('hidden',!live.error&&!live.truncated&&!loadError&&!extractions.error&&!extractions.truncated);warning.textContent=(loadError?loadError+' ':'')+(extractions.error?'Moon pull: '+extractions.error+'. ':'')+(extractions.truncated?'Moon extraction results are partial. ':'')+(live.error?'Structure pull: '+live.error+'. ':'')+(live.truncated?'ESI returned more pages than the configured limit; this list is partial.':'');}
    const allStructures=live.records||[];
    const structureRows=selectStructures(allStructures,{query:$('ceoStructureSearch')?.value||'',filter:$('ceoStructureFilter')?.value||'all'});
    const structureSummary=$('ceoStructureSummary');if(structureSummary)structureSummary.textContent=allStructures.length+' structures • '+allStructures.filter(row=>row.fuelStatus==='LOW').length+' with ≤72 hours of fuel • '+allStructures.filter(row=>row.fuelStatus==='EXPIRED').length+' with fuel expiry passed • '+allStructures.filter(row=>(row.services||[]).some(item=>item.state==='offline')).length+' with offline services • '+allStructures.filter(row=>row.fuelStatus==='UNKNOWN').length+' with fuel expiry unreported';
    const structureCount=$('ceoStructureCount');if(structureCount)structureCount.textContent=structureRows.length+' of '+allStructures.length+' structures • fuel figures at the last successful pull';
    const structures=$('ceoLiveStructures');if(structures)structures.innerHTML=structureRows.map(row=>'<details class="ceo-live-structure"><summary><strong>'+esc(row.system)+' • '+esc(row.type)+'</strong><span class="ceo-fuel '+esc(row.fuelStatus.toLowerCase())+'">'+esc(row.fuelStatus==='UNKNOWN'?'Fuel expiry not reported':row.fuelStatus==='EXPIRED'?'Fuel expiry passed':(Math.max(0,row.fuelHours)/24).toFixed(1)+' days of fuel'+(row.fuelStatus==='LOW'?' • LOW':''))+'</span></summary><div><p>Structure ID '+esc(row.structureId)+' • '+esc((row.state||'Unknown state').replaceAll('_',' '))+'</p><p>Fuel expires: '+esc(date(row.fuelExpires))+'</p><p>Services: '+esc((row.services||[]).map(item=>item.name+' ('+item.state+')').join(', ')||'Not reported')+'</p></div></details>').join('')||'<div class="visual-empty">'+(allStructures.length?'No structures match these filters.':live.available?'No corporation-owned structures returned by ESI.':'Current structures could not be loaded.')+'</div>';
  }
  async function load(force=false){
    if(busy)return;if(data&&!force){render();return;}
    busy=true;loadError='';render();window.JlrCeoHealth?.schedule();
    try{const response=await fetch('/api/ceo/moons'+(force?'?force=1':''),{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error(response.status===403?'CEO access is restricted.':response.status===401?'Log in to view CEO data.':'Moon records could not be loaded.');data=await response.json();}
    catch(error){loadError=String(error.message||error);const warning=$('ceoStructuresWarning');if(warning){warning.classList.remove('hidden');warning.textContent=loadError;}}
    finally{busy=false;render();window.JlrCeoHealth?.schedule();}
  }
  document.addEventListener('input',event=>{if(['ceoMoonSearch','ceoStructureSearch'].includes(event.target?.id))render();});
  document.addEventListener('change',event=>{if(['ceoMoonSystem','ceoMoonSort','ceoStructureFilter'].includes(event.target?.id))render();});
  document.addEventListener('click',event=>{if(event.target?.closest?.('#ceoMoonRefresh'))void load(true);});
  window.JlrCeoMoons={load,render,selectRecords,selectStructures};
})();
