'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  let me = null;
  let state = null;
  let filter = 'all';
  let selectedSystem = '';
  let fieldDraftDirty = false;
  let pending = null;
  let audio = null;
  let audioUnlocked = false;
  let toastTimer = null;
  let eventSource = null;

  const DEFAULT_FLEET = { shipType:'hulk', shipCount:30, minerType:'ore', baseOutput:406800, abyssalAverage:20, uptime:100, payout:95 };
  function loadFleet() { try { return { ...DEFAULT_FLEET, ...JSON.parse(localStorage.getItem('jlrFleet') || '{}') }; } catch { return { ...DEFAULT_FLEET }; } }
  let fleetSettings = loadFleet();
  const DEFAULT_CALC = { minerCharacterId:'', fittingId:'', boosterCharacterId:'', boosterShip:'none', burstTech:2, coreTech:2, mindlink:true, referenceOutput:406800 };
  function loadCalc(){try{return{...DEFAULT_CALC,...JSON.parse(localStorage.getItem('jlrMiningCalc')||'{}')}}catch{return{...DEFAULT_CALC}}}
  let calcSettings=loadCalc();
  const SKILL_IDS={mining:'3386',astrogeology:'3410',miningBarge:'17940',exhumers:'22551',industrialCommand:'29637',capitalIndustrial:'28374',miningDirector:'22552',miningForeman:'22536'};
  const statusText = {ready:'GREEN',picked:'YELLOW',cleared:'RED'};

  function fmt(v, kind='num') {
    v = Number(v || 0);
    const abs = Math.abs(v);
    if (abs >= 1e12) return `${(v/1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${(v/1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(v/1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(v/1e3).toFixed(kind==='m3'?0:1)}K`;
    return v.toFixed(0);
  }
  function timer(iso) {
    if (!iso) return 'READY';
    let s = Math.max(0, Math.floor((Date.parse(iso)-Date.now())/1000));
    const h=Math.floor(s/3600); s%=3600; const m=Math.floor(s/60); s%=60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function ago(iso) {
    if (!iso) return 'never'; const ms=Date.now()-Date.parse(iso); if(!Number.isFinite(ms))return 'unknown';
    const m=Math.max(0,Math.floor(ms/60000)); if(m<1)return 'just now'; if(m<60)return `${m}m ago`; const h=Math.floor(m/60); if(h<24)return `${h}h ${m%60}m ago`; return `${Math.floor(h/24)}d ago`;
  }
  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function toast(msg){$('toast').textContent=msg;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),3000)}

  function unlockAudio(){if(audioUnlocked)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audio=new AC();audioUnlocked=true;}
  function sfx(kind='click'){unlockAudio();if(!audio)return;if(audio.state==='suspended')audio.resume().catch(()=>{});const o=audio.createOscillator(),g=audio.createGain(),n=audio.currentTime;o.connect(g);g.connect(audio.destination);if(kind==='hover'){o.type='sine';o.frequency.setValueAtTime(560,n);o.frequency.exponentialRampToValueAtTime(690,n+.035);g.gain.setValueAtTime(.008,n);g.gain.exponentialRampToValueAtTime(.001,n+.045);o.start(n);o.stop(n+.05)}else if(kind==='timer'){o.type='sawtooth';o.frequency.setValueAtTime(330,n);o.frequency.exponentialRampToValueAtTime(100,n+.14);g.gain.setValueAtTime(.025,n);g.gain.exponentialRampToValueAtTime(.001,n+.15);o.start(n);o.stop(n+.16)}else{o.type='square';o.frequency.setValueAtTime(290,n);o.frequency.exponentialRampToValueAtTime(470,n+.05);g.gain.setValueAtTime(.014,n);g.gain.exponentialRampToValueAtTime(.001,n+.07);o.start(n);o.stop(n+.08)}}
  document.addEventListener('pointerdown',unlockAudio,{once:true});
  document.addEventListener('pointerover',(e)=>{if(audioUnlocked&&e.target.closest('button,summary,.system-node')&&!e.relatedTarget?.closest?.('button,summary,.system-node'))sfx('hover')});
  document.addEventListener('click',(e)=>{if(e.target.closest('button,summary'))sfx('click')});

  async function api(url, options={}) {
    const headers={...(options.headers||{})}; if(options.body&&!headers['Content-Type'])headers['Content-Type']='application/json';
    const r=await fetch(url,{...options,headers,credentials:'same-origin'}); const ct=r.headers.get('content-type')||''; const p=ct.includes('application/json')?await r.json():await r.text();
    if(r.status===401){showLogin();throw new Error('Please log in with EVE Online.')} if(!r.ok)throw new Error(p?.message||p?.error||p||`Request failed ${r.status}`); return p;
  }

  function showLogin(){$('app').classList.add('hidden');$('loginView').classList.remove('hidden');}
  function showApp(){$('loginView').classList.add('hidden');$('app').classList.remove('hidden');}
  function applyMode(mode){$('app').classList.toggle('compact',mode==='compact');$('app').classList.toggle('expanded',mode==='expanded');$('compactMode').classList.toggle('active',mode==='compact');$('expandedMode').classList.toggle('active',mode==='expanded');localStorage.setItem('jlrMode',mode)}

  function perShip(){const s=fleetSettings;return Number(s.baseOutput)*(1+Number(s.abyssalAverage)/100)*(Number(s.uptime)/100)}
  function fleetM3(){return perShip()*Number(fleetSettings.shipCount)}
  function projectedISK(ore){return fleetM3()*Number(ore.jbvPerM3)*(Number(fleetSettings.payout)/100)}
  function actualValue(raw){return Number(raw||0)*(Number(fleetSettings.payout)/100)}
  function saveFleet(){localStorage.setItem('jlrFleet',JSON.stringify(fleetSettings));renderAll()}
  function saveCalc(){localStorage.setItem('jlrMiningCalc',JSON.stringify(calcSettings));renderCalculator()}
  function skillLevel(character,id){return Number(character?.skills?.[String(id)]?.level||0)}
  function skillLabel(character,id){const s=character?.skills?.[String(id)];return s?`${s.name} ${s.level}`:'Not synced'}
  function minerSkillScale(character,shipName){
    if(!character||!Object.keys(character.skills||{}).length)return 1;
    const mining=skillLevel(character,SKILL_IDS.mining),astro=skillLevel(character,SKILL_IDS.astrogeology),barge=skillLevel(character,SKILL_IDS.miningBarge),exh=skillLevel(character,SKILL_IDS.exhumers);
    let factor=((1+.05*mining)/1.25)*((1+.05*astro)/1.25);
    if(shipName==='Hulk'){
      factor*=((1+.03*barge)/1.15)*((1+.06*exh)/1.30);
      factor*=.85/Math.max(.01,1-.03*exh);
    }else if(shipName==='Mackinaw'){
      factor*=((1+.03*barge)/1.15)*((1+.04*exh)/1.20);
    }
    return factor;
  }
  function boostReduction(character,ship,burstTech,coreTech,mindlink){
    if(!character||ship==='none'||!Object.keys(character.skills||{}).length)return 0;
    const director=skillLevel(character,SKILL_IDS.miningDirector);
    const shipLevel=ship==='rorqual'?skillLevel(character,SKILL_IDS.capitalIndustrial):skillLevel(character,SKILL_IDS.industrialCommand);
    const moduleBonus=Number(burstTech)===2?.25:0;
    const mindlinkBonus=mindlink?.25:0;
    const shipBonus=(ship==='rorqual'?.05:.02)*shipLevel;
    let coreBonus=0;
    if(Number(coreTech)===1)coreBonus=ship==='rorqual'?.30:.05;
    if(Number(coreTech)===2)coreBonus=ship==='rorqual'?.40:.075;
    return Math.min(.90,.15*(1+moduleBonus)*(1+mindlinkBonus)*(1+.10*director)*(1+shipBonus)*(1+coreBonus));
  }
  function calcCharacter(id){return me?.characters?.find(c=>String(c.characterId)===String(id))||null}
  function calcFitting(character,id){return character?.fittings?.find(f=>String(f.fittingId)===String(id))||null}

  function definitions(){return [...(state?.source?.systems||[])].sort((a,b)=>a.rank-b.rank||a.order-b.order||a.system.localeCompare(b.system))}
  function field(system){return state?.fields?.[system]||null}
  function def(system){return definitions().find(x=>x.system===system)||null}

  function renderTop(){
    if(!state)return; const ores=state.source.ores; const top=ores[0];
    $('perShipKpi').textContent=fmt(perShip(),'m3'); $('fleetKpi').textContent=fmt(fleetM3(),'m3'); $('topOreKpi').textContent=top.name; $('topOreSub').textContent=`${top.jbvPerM3.toFixed(2)} JBV/m³`; $('projectedIskKpi').textContent=`${fmt(projectedISK(top))}/hr`;
    $('actualTodayM3').textContent=fmt(state.esi.actual.today.m3,'m3'); $('actualTodayIsk').textContent=fmt(actualValue(state.esi.actual.today.jbv));
    $('actualExpTodayM3').textContent=`${fmt(state.esi.actual.today.m3,'m3')} m³`; $('actualExpTodayValue').textContent=`${fmt(actualValue(state.esi.actual.today.jbv))} ISK`; $('actualWeekM3').textContent=`${fmt(state.esi.actual.week.m3,'m3')} m³`; $('actualWeekValue').textContent=`${fmt(actualValue(state.esi.actual.week.jbv))} ISK`;
    $('esiStatus').textContent=`${state.esi.linkedCharacters} TOONS`; $('lastSync').textContent=state.esi.lastSyncAt?`Last sync ${ago(state.esi.lastSyncAt)}`:(state.esi.lastError||'Never synced');
  }
  function renderFleet(){
    for(const [id,key] of [['shipType','shipType'],['shipCount','shipCount'],['minerType','minerType'],['baseOutput','baseOutput'],['abyssalAverage','abyssalAverage'],['uptime','uptime'],['payout','payout']])if(document.activeElement!==$(id))$(id).value=fleetSettings[key];
    const label=fleetSettings.shipType==='hulk'?'Hulks':fleetSettings.shipType==='mackinaw'?'Mackinaws':'ships'; $('setupSummary').textContent=`${fleetSettings.shipCount} ${label} • +${Number(fleetSettings.abyssalAverage).toFixed(1)}% • ${Number(fleetSettings.payout).toFixed(1)}% JBV`;
  }
  function renderSelect(){
    if(!state)return; const old=selectedSystem||$('systemSelect').value; $('systemSelect').innerHTML='';
    for(const ore of state.source.ores){const g=document.createElement('optgroup');g.label=`#${ore.rank} ${ore.name.toUpperCase()}`;for(const d of definitions().filter(x=>x.rank===ore.rank)){const f=field(d.system),o=document.createElement('option');o.value=d.system;o.textContent=`${d.system} — ${f.status==='cleared'?`RED ${timer(f.timerEndsAt)}`:statusText[f.status]}${f.cherryPicked?' 🍒':''}`;g.appendChild(o)}$('systemSelect').appendChild(g)}
    selectedSystem=definitions().some(x=>x.system===old)?old:(definitions()[0]?.system||'');$('systemSelect').value=selectedSystem;const f=field(selectedSystem);if(f){const timerActive=f.status==='cleared'&&Date.parse(f.timerEndsAt)>Date.now();if(timerActive)fieldDraftDirty=false;if(!fieldDraftDirty)$('statusSelect').value=f.status;$('statusSelect').disabled=timerActive;$('updateField').disabled=timerActive}
  }
  function chooseSystem(system){selectedSystem=system;$('systemSelect').value=system;fieldDraftDirty=false;$('fieldNote').value='';const f=field(system);if(f)$('statusSelect').value=f.status;renderSelect();renderBoards();renderSelected();renderNotes()}
  function node(d,f,includeTimer=true){const b=document.createElement('button');b.type='button';b.className='system-node';b.dataset.status=f.status;if(d.system===selectedSystem)b.classList.add('selected');const line=f.status==='cleared'?timer(f.timerEndsAt):f.status==='picked'?'PICKED':'READY';b.innerHTML=`${f.cherryPicked?'<span class="cherry-pin">🍒</span>':''}<span class="sys-name">${esc(d.system)}</span><span class="sys-ore">#${d.rank} ${esc(d.ore)}</span>${includeTimer?`<span class="sys-state">${line}</span>`:''}`;b.title=`${d.system} • ${d.ore} • ${statusText[f.status]}${f.cherryPicked?' • Cherry Picked':''}${f.notes?.length?` • ${f.notes.length} notes`:''}`;b.addEventListener('click',()=>chooseSystem(d.system));return b}
  function renderBoards(){
    if(!state)return;$('miniMap').innerHTML='';$('fieldBoard').innerHTML='';let counts={ready:0,picked:0,cleared:0,cherry:0};
    for(const d of definitions()){const f=field(d.system);counts[f.status]++;if(f.cherryPicked)counts.cherry++;$('miniMap').appendChild(node(d,f,false));if(filter==='all'||filter===f.status||(filter==='cherry'&&f.cherryPicked))$('fieldBoard').appendChild(node(d,f,true))}
    $('statusCounts').textContent=`${counts.ready} G • ${counts.picked} Y • ${counts.cleared} R • ${counts.cherry} 🍒`; $('systemCountLabel').textContent=`${definitions().length} systems`;
  }
  function renderHits(){
    if(!state)return;const arr=definitions().map(d=>({d,f:field(d.system)})).filter(x=>x.f.status!=='cleared').sort((a,b)=>Number(a.f.cherryPicked)-Number(b.f.cherryPicked)||a.d.rank-b.d.rank||a.d.order-b.d.order).slice(0,8);$('hitOrder').innerHTML='';
    for(const [i,x] of arr.entries()){const b=document.createElement('button');b.type='button';b.className=`orb hit-chip ${x.f.cherryPicked?'cherry':x.f.status==='picked'?'yellow':'green'}`;b.textContent=`${i+1}. ${x.d.system}${x.f.cherryPicked?' 🍒':''}`;b.addEventListener('click',()=>chooseSystem(x.d.system));$('hitOrder').appendChild(b)}
  }
  function renderRanking(){
    if(!state)return;$('oreRanking').innerHTML='';for(const ore of state.source.ores){const clear=ore.siteM3/fleetM3()*60;const r=document.createElement('div');r.className='rank-row';r.innerHTML=`<div class="rank-badge">#${ore.rank}</div><div><strong>${esc(ore.name)}</strong><small>${ore.systems.join(' • ')}<br>${ore.jbvPerM3.toFixed(2)} JBV/m³ • site ${fmt(ore.siteJBV)} JBV</small></div><div class="rank-num">${fmt(fleetM3(),'m3')}<small>m³/hr</small></div><div class="rank-num">${fmt(projectedISK(ore))}/hr<small>~${Number.isFinite(clear)?clear.toFixed(0):'—'} min/site</small></div>`;$('oreRanking').appendChild(r)}
  }
  function renderTimers(){
    if(!state)return;const active=definitions().map(d=>({d,f:field(d.system)})).filter(x=>x.f.status==='cleared'&&x.f.timerEndsAt).sort((a,b)=>Date.parse(a.f.timerEndsAt)-Date.parse(b.f.timerEndsAt));$('timerCount').textContent=`${active.length} active`;if(!active.length){$('activeTimers').innerHTML='<div class="timer-item"><div><strong>No active respawns</strong><small>Cleared fields appear here.</small></div></div>';return}$('activeTimers').innerHTML='';for(const x of active){const d=document.createElement('div');d.className='timer-item';d.innerHTML=`<div><strong>${x.d.system}${x.f.cherryPicked?' 🍒':''}</strong><small>${x.d.ore} • updated ${ago(x.f.updatedAt)}</small></div><div class="timer-value">${timer(x.f.timerEndsAt)}</div>`;$('activeTimers').appendChild(d)}
  }
  function renderSelected(){
    if(!state||!selectedSystem)return;const d=def(selectedSystem),f=field(selectedSystem);if(!d||!f)return;$('selectedDetail').innerHTML=`<strong>${d.system} — #${d.rank} ${d.ore}</strong><br><span class="muted">${statusText[f.status]}${f.status==='cleared'?` • ${timer(f.timerEndsAt)}`:''}${f.cherryPicked?' • 🍒 CHERRY PICKED':''} • projected ${fmt(projectedISK(state.source.ores[d.rank-1]))}/hr • updated ${ago(f.updatedAt)}</span>`;const timerActive=f.status==='cleared'&&Date.parse(f.timerEndsAt)>Date.now();for(const id of ['markGreen','markYellow','markRed'])$(id).disabled=timerActive;
  }
  function renderNotes(){const f=field(selectedSystem),notes=f?.notes||[];$('fieldNotes').innerHTML=notes.length?notes.slice().reverse().map(n=>`<div class="field-note"><span>${esc(n.text)}</span><time>${esc(ago(n.createdAt))}</time></div>`).join(''):'<span class="field-notes-empty">No notes for this system yet.</span>'}
  function renderCharacters(){
    if(!me)return;$('characterList').innerHTML='';if(!me.characters.length){$('characterList').innerHTML='<div class="character-row"><div></div><div><strong>No mining toons linked</strong><small>Use Add Toon through EVE SSO.</small></div></div>';return}
    for(const c of me.characters){
      const r=document.createElement('div');r.className='character-row';
      const scopeState=c.needsReauth?' • skills/fits need authorization':` • ${Object.keys(c.skills||{}).length} mining skills • ${(c.fittings||[]).length} mining fits`;
      r.innerHTML=`<img src="${esc(c.portrait)}" alt=""><div><strong>${esc(c.name)}</strong><small>${c.lastError?`⚠ ${esc(c.lastError)}`:`last sync ${ago(c.lastSyncAt)}`}${scopeState}</small></div><div class="character-actions">${c.needsReauth?'<button class="orb blue reauth" type="button">AUTHORIZE</button>':''}<button class="orb red disconnect" data-id="${c.characterId}" type="button">DISCONNECT</button></div>`;
      $('characterList').appendChild(r)
    }
    $('characterList').querySelectorAll('.reauth').forEach(b=>b.addEventListener('click',()=>{location.href='/auth/eve/start?intent=link'}));
    $('characterList').querySelectorAll('.disconnect').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Disconnect this mining toon from JLR?'))return;try{const p=await api(`/api/me/characters/${b.dataset.id}`,{method:'DELETE'});me=p.user;renderCharacters();renderCalculator();toast('Toon disconnected.')}catch(e){toast(e.message)}}));
  }
  function renderCalculator(){
    if(!me||!$('calcMinerCharacter'))return;
    const miners=me.characters||[];
    const minerSel=$('calcMinerCharacter'),boosterSel=$('calcBoosterCharacter'),fitSel=$('calcFitting');
    const oldMiner=calcSettings.minerCharacterId||minerSel.value;
    minerSel.innerHTML=miners.map(c=>`<option value="${c.characterId}">${esc(c.name)}</option>`).join('');
    if(!miners.length){$('calcResults').innerHTML='<div class="calc-empty">Connect a mining toon first.</div>';fitSel.innerHTML='';return}
    calcSettings.minerCharacterId=miners.some(c=>String(c.characterId)===String(oldMiner))?String(oldMiner):String(miners[0].characterId);
    minerSel.value=calcSettings.minerCharacterId;
    const miner=calcCharacter(calcSettings.minerCharacterId);
    const fits=miner?.fittings||[];
    fitSel.innerHTML=fits.length?fits.map(f=>`<option value="${f.fittingId}">${esc(f.shipName)} — ${esc(f.name)}</option>`).join(''):'<option value="">No saved mining fits synced</option>';
    if(!fits.some(f=>String(f.fittingId)===String(calcSettings.fittingId)))calcSettings.fittingId=fits[0]?String(fits[0].fittingId):'';
    fitSel.value=calcSettings.fittingId;
    boosterSel.innerHTML='<option value="">No booster</option>'+miners.map(c=>`<option value="${c.characterId}">${esc(c.name)}</option>`).join('');
    if(!miners.some(c=>String(c.characterId)===String(calcSettings.boosterCharacterId)))calcSettings.boosterCharacterId='';
    boosterSel.value=calcSettings.boosterCharacterId;
    $('calcBoosterShip').value=calcSettings.boosterShip;
    $('calcBurstTech').value=String(calcSettings.burstTech);
    $('calcCoreTech').value=String(calcSettings.coreTech);
    $('calcMindlink').checked=Boolean(calcSettings.mindlink);
    if(document.activeElement!==$('calcReferenceOutput'))$('calcReferenceOutput').value=Number(calcSettings.referenceOutput||406800);
    const fit=calcFitting(miner,calcSettings.fittingId);
    const shipName=fit?.shipName||(fleetSettings.shipType==='mackinaw'?'Mackinaw':'Hulk');
    const ref=Math.max(1,Number(calcSettings.referenceOutput)||406800);
    const skillScale=minerSkillScale(miner,shipName);
    const unboosted=ref*skillScale;
    const booster=calcCharacter(calcSettings.boosterCharacterId);
    const reduction=boostReduction(booster,calcSettings.boosterShip,calcSettings.burstTech,calcSettings.coreTech,calcSettings.mindlink);
    const boosted=unboosted/Math.max(.05,1-reduction);
    const fleet=boosted*Math.max(1,Number(fleetSettings.shipCount)||1);
    $('calcStatus').textContent=miner?.needsReauth?'REAUTH NEEDED':'ESI READY';
    $('calcResults').innerHTML=`
      <article class="calc-card"><span>Skill-adjusted</span><strong>${fmt(unboosted,'m3')} m³/hr</strong><small>${shipName} • ${(skillScale*100).toFixed(1)}% of max-skill reference</small></article>
      <article class="calc-card"><span>Boost strength</span><strong>${(reduction*100).toFixed(2)}%</strong><small>${calcSettings.boosterShip==='none'?'No Mining Laser Optimization boost':esc(calcSettings.boosterShip.toUpperCase())+' cycle reduction'}</small></article>
      <article class="calc-card"><span>Boosted per ship</span><strong>${fmt(boosted,'m3')} m³/hr</strong><small>cycle-time adjusted</small></article>
      <article class="calc-card"><span>Fleet × ${Math.max(1,Number(fleetSettings.shipCount)||1)}</span><strong>${fmt(fleet,'m3')} m³/hr</strong><small>theoretical continuous mining</small></article>`;
    const skillBits=[
      skillLabel(miner,SKILL_IDS.mining),skillLabel(miner,SKILL_IDS.astrogeology),skillLabel(miner,SKILL_IDS.miningBarge),skillLabel(miner,SKILL_IDS.exhumers)
    ];
    if(booster)skillBits.push(skillLabel(booster,SKILL_IDS.miningDirector),calcSettings.boosterShip==='rorqual'?skillLabel(booster,SKILL_IDS.capitalIndustrial):skillLabel(booster,SKILL_IDS.industrialCommand));
    const modules=fit?.items||[];
    $('calcFitDetails').innerHTML=`<strong>${fit?esc(fit.shipName+' — '+fit.name):esc(shipName+' — reference setup')}</strong><div class="calc-skills">${skillBits.map(x=>`<span>${esc(x)}</span>`).join('')}</div>${fit?`<div class="fit-modules">${modules.map(i=>`<span>${esc(i.name)} ×${i.quantity}</span>`).join('')}</div>`:'<div class="muted tiny">Authorize ESI skills/fittings and save the mining fit in EVE to populate module details.</div>'}`;
    localStorage.setItem('jlrMiningCalc',JSON.stringify(calcSettings));
  }
  function renderAll(){if(!state)return;renderTop();renderFleet();renderSelect();renderBoards();renderHits();renderRanking();renderTimers();renderSelected();renderNotes();renderCharacters();renderCalculator();}

  async function refreshMe(){const p=await api('/api/me');me=p.user;if(me){$('userName').textContent=me.displayName;$('userPortrait').src=me.portrait}return p.authenticated}
  async function loadState(){state=await api('/api/state');renderAll()}
  function connectSse(){if(eventSource)eventSource.close();eventSource=new EventSource('/api/events');eventSource.addEventListener('state',e=>{state=JSON.parse(e.data);renderAll();$('liveBadge').textContent='● LIVE'});eventSource.onerror=()=>{$('liveBadge').textContent='● RECONNECTING'}}

  function addToon(){location.href='/auth/eve/start?intent=link'}
  $('addToon').addEventListener('click',addToon);$('addToonTop').addEventListener('click',addToon);
  $('logout').addEventListener('click',async()=>{try{await api('/auth/logout',{method:'POST',body:'{}'})}catch{}location.href='/' });
  $('compactMode').addEventListener('click',()=>applyMode('compact'));$('expandedMode').addEventListener('click',()=>applyMode('expanded'));
  $('systemSelect').addEventListener('change',()=>chooseSystem($('systemSelect').value));
  $('statusSelect').addEventListener('change',()=>{fieldDraftDirty=true});
  document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));renderBoards()}));

  function applyFieldUpdate(system,updatedField,resetDraft=true){state.fields[system]=updatedField;if(resetDraft&&selectedSystem===system)fieldDraftDirty=false;renderAll()}
  async function setField(status,forceSystem=null){const system=forceSystem||$('systemSelect').value;if(status==='cleared'){pending={system};$('confirmText').textContent=`${system} will turn RED and count down from 10 hours. The timer cannot be restarted or changed while it runs.`;$('confirmPanel').classList.remove('hidden');return}try{const result=await api(`/api/fields/${encodeURIComponent(system)}`,{method:'PUT',body:JSON.stringify({status})});applyFieldUpdate(system,result.field);$('fieldMessage').textContent=`${system} updated to ${statusText[status]}.`}catch(e){toast(e.message)}}
  $('updateField').addEventListener('click',()=>setField($('statusSelect').value));
  $('markGreen').addEventListener('click',()=>setField('ready',selectedSystem));$('markYellow').addEventListener('click',()=>setField('picked',selectedSystem));$('markRed').addEventListener('click',()=>setField('cleared',selectedSystem));
  async function addNote(){const system=selectedSystem,text=$('fieldNote').value.trim();if(!text){toast('Type a note first.');return}try{const result=await api(`/api/fields/${encodeURIComponent(system)}/notes`,{method:'POST',body:JSON.stringify({text})});if(selectedSystem===system&&$('fieldNote').value.trim()===text)$('fieldNote').value='';applyFieldUpdate(system,result.field,false);toast(`Note added to ${system}.`)}catch(e){toast(e.message)}}
  $('addNote').addEventListener('click',addNote);$('fieldNote').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addNote()}});
  async function cherry(){const system=selectedSystem||$('systemSelect').value;try{await api(`/api/fields/${encodeURIComponent(system)}/cherry`,{method:'POST',body:'{}'});$('fieldMessage').textContent=`${system} reported 🍒 CHERRY PICKED. It will clear only when the 10-hour respawn ends.`;sfx('timer')}catch(e){toast(e.message)}}
  $('reportCherry').addEventListener('click',cherry);$('cherryExpanded').addEventListener('click',cherry);
  $('confirmNo').addEventListener('click',()=>{pending=null;$('confirmPanel').classList.add('hidden')});
  $('confirmYes').addEventListener('click',async()=>{if(!pending)return;const p=pending;pending=null;$('confirmPanel').classList.add('hidden');try{const result=await api(`/api/fields/${encodeURIComponent(p.system)}`,{method:'PUT',body:JSON.stringify({status:'cleared',confirm:true})});applyFieldUpdate(p.system,result.field);sfx('timer');$('fieldMessage').textContent=`${p.system} RED — 10-hour timer started.`}catch(e){toast(e.message)}});
  $('syncNow').addEventListener('click',async()=>{try{await api('/api/esi/sync',{method:'POST',body:'{}'});toast('ESI sync started. Skills and saved fittings will refresh too.');setTimeout(async()=>{try{await refreshMe();renderCalculator();renderCharacters()}catch{}},3500);setTimeout(async()=>{try{await refreshMe();renderCalculator();renderCharacters()}catch{}},9000)}catch(e){toast(e.message)}});

  function readCalc(){
    calcSettings={
      minerCharacterId:$('calcMinerCharacter').value,
      fittingId:$('calcFitting').value,
      boosterCharacterId:$('calcBoosterCharacter').value,
      boosterShip:$('calcBoosterShip').value,
      burstTech:Number($('calcBurstTech').value)||1,
      coreTech:Number($('calcCoreTech').value)||0,
      mindlink:$('calcMindlink').checked,
      referenceOutput:Math.max(1,Number($('calcReferenceOutput').value)||406800),
    };
    saveCalc();
  }
  ['calcMinerCharacter','calcFitting','calcBoosterCharacter','calcBoosterShip','calcBurstTech','calcCoreTech','calcMindlink'].forEach(id=>$(id).addEventListener('change',readCalc));
  $('calcMinerCharacter').addEventListener('change',()=>{calcSettings.fittingId='';readCalc()});
  $('calcReferenceOutput').addEventListener('input',readCalc);

  function readFleet(){fleetSettings={shipType:$('shipType').value,shipCount:Math.max(1,Number($('shipCount').value)||30),minerType:$('minerType').value,baseOutput:Math.max(1,Number($('baseOutput').value)||406800),abyssalAverage:Math.max(0,Number($('abyssalAverage').value)||0),uptime:Math.min(100,Math.max(1,Number($('uptime').value)||100)),payout:Math.min(100,Math.max(1,Number($('payout').value)||95))};saveFleet()}
  ['shipCount','baseOutput','abyssalAverage','uptime','payout'].forEach(id=>$(id).addEventListener('input',readFleet));
  function preset(){if(!state)return;const ship=$('shipType').value,miner=$('minerType').value;if(ship==='hulk'&&miner==='ore')$('baseOutput').value=state.source.presetOutputs.hulk_ore;else if(ship==='mackinaw'&&miner==='mod2')$('baseOutput').value=state.source.presetOutputs.mack_mod2;readFleet()}
  $('shipType').addEventListener('change',preset);$('minerType').addEventListener('change',preset);
  $('averageRolls').addEventListener('click',()=>{const vals=$('abyssalRolls').value.split(/[\s,;]+/).map(x=>Number(x.replace('%',''))).filter(x=>Number.isFinite(x)&&x>=0&&x<=200);if(!vals.length){$('rollResult').textContent='No valid percentages found.';return}const avg=vals.reduce((a,b)=>a+b,0)/vals.length;$('abyssalAverage').value=avg.toFixed(3);$('rollResult').textContent=`${vals.length} rolls • average ${avg.toFixed(2)}%`;readFleet()});

  async function boot(){
    try{
      const config=await fetch('/api/config').then(r=>r.json());
      if(!config.ssoConfigured){$('setupWarning').classList.remove('hidden');$('setupWarning').innerHTML=`Server owner: EVE SSO is not configured yet.<br>Register this callback in the EVE Developer Portal:<br><code>${esc(config.callbackUrl)}</code><br>Then set EVE_CLIENT_ID and EVE_CLIENT_SECRET on the web host.`;}
      const auth=await fetch('/api/me',{credentials:'same-origin'}).then(r=>r.json());
      if(!auth.authenticated){showLogin();return}
      me=auth.user;showApp();$('userName').textContent=me.displayName;$('userPortrait').src=me.portrait;applyMode(localStorage.getItem('jlrMode')==='expanded'?'expanded':'compact');await loadState();connectSse();
      const params=new URLSearchParams(location.search);if(params.get('linked'))toast('Mining toon connected through EVE SSO.');if(params.get('login'))toast('Logged in with EVE Online.');if(params.get('error'))toast(decodeURIComponent(params.get('error')));if(params.toString())history.replaceState({},'',location.pathname);
    }catch(e){console.error(e);showLogin();$('setupWarning').classList.remove('hidden');$('setupWarning').textContent=`JLR could not load: ${e.message}`}
  }
  setInterval(()=>{if(state){renderBoards();renderTimers();renderSelect();renderSelected();}},1000);
  boot();
})();
