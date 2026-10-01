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
    const refresh=$('ceoMoonRefresh');if(refresh){refresh.disabled=busy;refresh.textContent=busy?'REFRESHING…':'REFRESH METENOX + STRUCTURES';}
    if(!data){host.innerHTML='<div class="visual-empty">'+(busy?'Loading private moon records…':'Moon records have not loaded.')+'</div>';return;}
    const live=data.live||{},drills=data.metenox||{},rows=drills.records||[];
    const stamp=$('ceoMoonSource');if(stamp)stamp.textContent=(drills.stale?'LAST SUCCESSFUL METENOX PULL • ':drills.available?'CURRENT METENOX ESI • ':'METENOX ESI UNAVAILABLE • ')+date(drills.updatedAt||drills.checkedAt);
    const summary=$('ceoMoonSummary');if(summary)summary.innerHTML=[['CURRENT DRILLS',rows.length],['LOW GAS COVERAGE',rows.filter(row=>row.gasCoverageDays!==null&&row.gasCoverageDays<=3).length],['LOW FUEL',rows.filter(row=>['LOW','EXPIRED'].includes(row.fuelStatus)).length],['AUTOMATIC PROFIT READY',rows.filter(row=>row.profit30Days!==null).length+' / '+rows.length]].map(([label,value])=>'<div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>').join('');
    const count=$('ceoMoonCount');if(count)count.textContent=rows.length+' current Metenox drills • Jita replacement prices '+date(drills.priceUpdatedAt);
    const days=value=>value===null||value===undefined?'Not reported':Number(value).toFixed(1)+' days';
    const units=value=>value===null||value===undefined?'Not reported':Number(value).toLocaleString();
    const fuels=['Helium Fuel Block','Hydrogen Fuel Block','Nitrogen Fuel Block','Oxygen Fuel Block'];
    host.innerHTML=rows.map(row=>'<details class="ceo-moon-record ceo-metenox-record"><summary><strong>'+esc(row.system)+' • Metenox</strong><span>Fuel '+esc(row.fuelHours===null?'Not reported':days(Math.max(0,row.fuelHours)/24))+'</span><b class="'+(row.profit30Days!==null&&row.profit30Days<0?'negative':'positive')+'">'+esc(row.profit30Days===null?(row.profile?.survey?'Profit unavailable':'Add current moon survey'):money(row.profit30Days)+' / 30 days')+'</b></summary><div class="ceo-metenox-metrics">'+[['REPORTED GAS STOCK',units(row.gasUnits)+(row.gasSource==='manual'?' • manual':'')],['GAS STOCK COVERAGE',days(row.gasCoverageDays)],['REPORTED FUEL BLOCKS',units(row.reportedFuelBlocks)],['FUEL EXPIRES',date(row.fuelExpires)],['GROSS MATERIALS / 30 DAYS',money(row.revenue30Days)],['FUEL + GAS / 30 DAYS',money(row.operatingCost30Days)],['ESTIMATED NET / 30 DAYS',money(row.profit30Days)]].map(([label,value])=>'<div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>').join('')+'</div>'+((row.production?.outputs||[]).length?'<div class="ceo-metenox-output"><table><thead><tr><th>Material</th><th>Projected units / 30 days</th><th>Jita buy / unit</th></tr></thead><tbody>'+row.production.outputs.map(item=>'<tr><td>'+esc(item.name)+'</td><td>'+esc(units(item.quantity30Days))+'</td><td>'+esc(money(item.unitBuy))+'</td></tr>').join('')+'</tbody></table></div>':'')+'<p>'+esc(row.production?.error||'Automatic estimate uses current moon-material prices.')+'</p><p>Structure '+esc(row.structureId)+' • '+esc(row.fuelType||'Select fuel block type')+' • '+esc((row.services||[]).map(service=>service.name+' ('+service.state+')').join(', ')||'Service state not reported')+'</p><p>Stock coverage assumes 200 gas and 5 fuel blocks per operating hour. Reported stocks can include reserve bays; fuel expiry is the ESI structure value. Missing gas is not treated as zero.</p><details class="ceo-metenox-setup"><summary>Current moon survey / costs / gas count</summary><p>Paste the current survey ore rows for this drill once (ore name and percentage, totalling 100%). Gross revenue recalculates at current Jita buy prices. Net subtracts gas and fuel at Jita sell prices, tax and other costs. Projection assumes 30 days of continuous operation, 30,000 m³/hour and 40% material yield. Offline or reinforced drills can produce less.</p><form data-metenox-profile="'+esc(row.structureId)+'"><div class="ceo-metenox-form"><label class="ceo-metenox-survey">Current moon composition<textarea name="survey" rows="5" placeholder="Bitumens 50%&#10;Coesite 50%">'+esc(row.profile?.survey||'')+'</textarea></label>'+[['taxPct','Tax (%)',row.profile?.taxPct],['overhead30Days','Other costs / 30 days (ISK)',row.profile?.overhead30Days],['gasUnits','Manual gas count (used when ESI omits gas)',row.profile?.gasUnits]].map(([name,label,value])=>'<label>'+esc(label)+'<input name="'+name+'" type="number" min="0" '+(name==='taxPct'?'max="100" ':'')+'step="any" value="'+esc(value??'')+'"></label>').join('')+'<label>Fuel block type<select name="fuelType"><option value="">Use reported stock type</option>'+fuels.map(name=>'<option value="'+esc(name)+'"'+(row.profile?.fuelType===name?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label></div><button class="board-tool" type="submit">SAVE CURRENT SURVEY</button><small data-metenox-save-status></small></form><p>Assumptions updated '+esc(date(row.profileUpdatedAt))+' • '+esc(row.gasSource==='manual'?'Gas count is a saved manual reading; refresh it after refuelling.':'Gas count comes from the latest available ESI asset snapshot.')+'</p></details></details>').join('')||'<div class="visual-empty">'+(drills.available?'No current corporation Metenox drills returned by ESI.':'Current Metenox drills could not be loaded.')+'</div>';
    const liveStamp=$('ceoStructuresStamp');if(liveStamp)liveStamp.textContent=((live.stale||loadError)&&live.updatedAt?'LAST SUCCESSFUL PULL • ':live.available&&!loadError?'LIVE ESI PULL • ':'LIVE ESI UNAVAILABLE • ')+date(live.updatedAt||live.checkedAt);
    const warning=$('ceoStructuresWarning');if(warning){warning.classList.toggle('hidden',!live.error&&!live.truncated&&!loadError&&!drills.error&&!drills.assetsError&&!drills.priceError&&!drills.assetsPartial);warning.textContent=(loadError?loadError+' ':'')+([drills.error,drills.assetsError,drills.priceError].filter(Boolean).join(' • '))+(drills.assetsPartial?' Asset stock results are partial or stale. ':'')+(live.error?'Structure pull: '+live.error+'. ':'')+(live.truncated?'ESI returned more pages than the configured limit; this list is partial.':'');}
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
  document.addEventListener('submit',async event=>{
    const form=event.target?.closest?.('[data-metenox-profile]');if(!form)return;
    event.preventDefault();
    const button=form.querySelector('button[type="submit"]'),status=form.querySelector('[data-metenox-save-status]');
    if(button.disabled)return;button.disabled=true;status.textContent='Saving…';
    const body={structureId:form.dataset.metenoxProfile};
    for(const name of ['survey','overhead30Days','taxPct','gasUnits','fuelType'])body[name]=form.querySelector('[name="'+name+'"]').value;
    try{
      const response=await fetch('/api/ceo/metenox/profile',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json();if(!response.ok)throw new Error(result.message||'Estimate could not be saved.');
      await load(true);
    }catch(error){status.textContent=String(error.message||error);button.disabled=false;}
  });
  window.JlrCeoMoons={load,render,selectRecords,selectStructures};
})();
