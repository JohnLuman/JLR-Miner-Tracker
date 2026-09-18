'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  let me = null;
  let state = null;
  let filter = 'all';
  let selectedSystem = '';
  let pending = null;
  let audio = null;
  let audioUnlocked = false;
  let toastTimer = null;
  let eventSource = null;

  const DEFAULT_FLEET = { members:{}, uptime:100, payout:95 };
  function loadFleet() {
    try {
      const raw=JSON.parse(localStorage.getItem('jlrFleet')||'{}');
      return {
        members:raw.members&&typeof raw.members==='object'?raw.members:{},
        uptime:Math.min(100,Math.max(1,Number(raw.uptime)||100)),
        payout:Math.min(100,Math.max(1,Number(raw.payout)||95)),
      };
    } catch { return { members:{}, uptime:100, payout:95 }; }
  }
  let fleetSettings = loadFleet();
  const DEFAULT_CALC = { minerCharacterId:'', fittingId:'', crystal:'Auto', boosterCharacterId:'', boosterFittingId:'', mindlink:true };
  function loadCalc(){try{return{...DEFAULT_CALC,...JSON.parse(localStorage.getItem('jlrMiningCalc')||'{}')}}catch{return{...DEFAULT_CALC}}}
  let calcSettings=loadCalc(); delete calcSettings.efficiencyCharge;
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
  function sfx(kind='click'){
    unlockAudio();
    if(!audio)return;
    if(audio.state==='suspended')audio.resume().catch(()=>{});
    const o=audio.createOscillator(),g=audio.createGain(),n=audio.currentTime;
    o.connect(g);g.connect(audio.destination);
    if(kind==='hover'){
      o.type='sine';o.frequency.setValueAtTime(560,n);o.frequency.exponentialRampToValueAtTime(690,n+.035);
      g.gain.setValueAtTime(.008,n);g.gain.exponentialRampToValueAtTime(.001,n+.045);o.start(n);o.stop(n+.05);
    }else if(kind==='systemHover'){
      o.type='sine';o.frequency.setValueAtTime(430,n);o.frequency.exponentialRampToValueAtTime(540,n+.055);
      g.gain.setValueAtTime(.010,n);g.gain.exponentialRampToValueAtTime(.001,n+.065);o.start(n);o.stop(n+.07);
    }else if(kind==='systemSelect'){
      o.type='triangle';o.frequency.setValueAtTime(350,n);o.frequency.exponentialRampToValueAtTime(720,n+.09);
      g.gain.setValueAtTime(.018,n);g.gain.exponentialRampToValueAtTime(.001,n+.11);o.start(n);o.stop(n+.12);
    }else if(kind==='select'){
      o.type='triangle';o.frequency.setValueAtTime(500,n);o.frequency.exponentialRampToValueAtTime(760,n+.06);
      g.gain.setValueAtTime(.012,n);g.gain.exponentialRampToValueAtTime(.001,n+.075);o.start(n);o.stop(n+.08);
    }else if(kind==='toggle'){
      o.type='square';o.frequency.setValueAtTime(220,n);o.frequency.exponentialRampToValueAtTime(390,n+.045);
      g.gain.setValueAtTime(.010,n);g.gain.exponentialRampToValueAtTime(.001,n+.06);o.start(n);o.stop(n+.065);
    }else if(kind==='timer'){
      o.type='sawtooth';o.frequency.setValueAtTime(330,n);o.frequency.exponentialRampToValueAtTime(100,n+.14);
      g.gain.setValueAtTime(.025,n);g.gain.exponentialRampToValueAtTime(.001,n+.15);o.start(n);o.stop(n+.16);
    }else{
      o.type='square';o.frequency.setValueAtTime(290,n);o.frequency.exponentialRampToValueAtTime(470,n+.05);
      g.gain.setValueAtTime(.014,n);g.gain.exponentialRampToValueAtTime(.001,n+.07);o.start(n);o.stop(n+.08);
    }
  }
  let systemHoverKey='';
  document.addEventListener('pointerdown',unlockAudio,{once:true});
  document.addEventListener('pointerover',(e)=>{
    if(!audioUnlocked)return;
    const system=e.target.closest('.system-node');
    if(system){
      const key=system.dataset.system||system.querySelector('.sys-name')?.textContent||'system';
      if(key!==systemHoverKey){systemHoverKey=key;sfx('systemHover')}
      return;
    }
    const target=e.target.closest('button,summary');
    if(!target)return;
    const previous=e.relatedTarget?.closest?.('button,summary');
    if(previous!==target)sfx('hover');
  });
  document.addEventListener('pointerout',(e)=>{
    const system=e.target.closest('.system-node');
    if(!system)return;
    const x=e.clientX,y=e.clientY;
    setTimeout(()=>{
      const under=document.elementFromPoint(x,y)?.closest?.('.system-node');
      if(!under)systemHoverKey='';
      else systemHoverKey=under.dataset.system||under.querySelector('.sys-name')?.textContent||systemHoverKey;
    },0);
  });
  document.addEventListener('click',(e)=>{
    if(e.target.closest('.system-node')){sfx('systemSelect');return}
    if(e.target.closest('button,summary'))sfx('click');
  });
  document.addEventListener('change',(e)=>{
    if(e.target.matches('select'))sfx('select');
    else if(e.target.matches('input[type="checkbox"],input[type="radio"]'))sfx('toggle');
  });

  async function api(url, options={}) {
    const headers={...(options.headers||{})}; if(options.body&&!headers['Content-Type'])headers['Content-Type']='application/json';
    const r=await fetch(url,{...options,headers,credentials:'same-origin'}); const ct=r.headers.get('content-type')||''; const p=ct.includes('application/json')?await r.json():await r.text();
    if(r.status===401){showLogin();throw new Error('Please log in with EVE Online.')} if(!r.ok)throw new Error(p?.message||p?.error||p||`Request failed ${r.status}`); return p;
  }

  function showLogin(){$('app').classList.add('hidden');$('loginView').classList.remove('hidden');}
  function showApp(){$('loginView').classList.add('hidden');$('app').classList.remove('hidden');}
  function applyMode(mode){
    $('app').classList.toggle('compact',mode==='compact');
    $('app').classList.toggle('expanded',mode==='expanded');
    $('compactMode').classList.toggle('active',mode==='compact');
    $('expandedMode').classList.toggle('active',mode==='expanded');
    localStorage.setItem('jlrMode',mode);
  }

  function fleetStats(){
    const data=calcData(),engine=window.JLRYieldMath,chars=me?.characters||[];
    const uptime=Math.min(100,Math.max(1,Number(fleetSettings.uptime)||100))/100;
    if(!data||!engine)return{count:0,total:0,average:0,entries:[]};
    const booster=calcCharacter(calcSettings.boosterCharacterId);
    const boosterFit=calcFitting(booster,calcSettings.boosterFittingId);
    const activeBooster=boosterInFleet();
    const entries=[];
    for(const character of chars){
      const id=String(character.characterId),cfg=fleetSettings.members?.[id]||{};
      if(!cfg.enabled||id===String(calcSettings.boosterCharacterId||''))continue;
      const fits=miningFits(character);
      const fit=fits.find(x=>String(x.fittingId)===String(cfg.fittingId))||fits[0]||null;
      if(!fit){entries.push({character,fit:null,error:'No mining fit'});continue}
      try{
        const result=engine.calculate({
          data,
          minerSkills:character.skills||{},
          minerFit:fit,
          crystalKey:'Auto',
          boosterSkills:activeBooster?(booster?.skills||{}):{},
          boosterFit:activeBooster?boosterFit:null,
          mindlink:activeBooster&&Boolean(calcSettings.mindlink),
        });
        entries.push({character,fit,result,rawM3:result.m3PerHour,effectiveM3:result.m3PerHour*uptime});
      }catch(error){entries.push({character,fit,error:String(error.message||error)})}
    }
    const valid=entries.filter(x=>x.result);
    const total=valid.reduce((sum,x)=>sum+x.effectiveM3,0);
    const average=valid.length?total/valid.length:0;
    return{count:valid.length,total,average,entries};
  }
  function perShip(){return fleetStats().average}
  function fleetM3(){return fleetStats().total}
  function projectedISK(ore){return fleetM3()*Number(ore.jbvPerM3)*(Number(fleetSettings.payout)/100)}
  function actualValue(raw){return Number(raw||0)*(Number(fleetSettings.payout)/100)}
  function saveFleet(){localStorage.setItem('jlrFleet',JSON.stringify(fleetSettings));renderAll()}
  function saveCalc(){
    localStorage.setItem('jlrMiningCalc',JSON.stringify(calcSettings));
    if(state){renderFleet();renderTop()}
    renderCalculator();
  }
  function calcData(){return state?.source?.yieldCalculator||null}
  function skillLabel(character,id){const s=character?.skills?.[String(id)];return s?`${s.name} ${s.level}`:'Not synced'}
  function skillLabelKey(character,key){const id=calcData()?.skillIds?.[key];return id?skillLabel(character,id):'Not synced'}
  function calcCharacter(id){return me?.characters?.find(c=>String(c.characterId)===String(id))||null}
  function calcFitting(character,id){return character?.fittings?.find(f=>String(f.fittingId)===String(id))||null}
  function miningFits(character){const data=calcData();return(character?.fittings||[]).filter(f=>Boolean(data?.ships?.[f.shipName]))}
  function boosterFits(character){return(character?.fittings||[]).filter(f=>['Porpoise','Orca','Rorqual','Outrider'].includes(f.shipName))}
  function boosterInFleet(){
    const id=String(calcSettings.boosterCharacterId||'');
    return Boolean(id&&fleetSettings.members?.[id]?.enabled);
  }

  function definitions(){return [...(state?.source?.systems||[])].sort((a,b)=>a.rank-b.rank||a.order-b.order||a.system.localeCompare(b.system))}
  function field(system){return state?.fields?.[system]||null}
  function def(system){return definitions().find(x=>x.system===system)||null}

  function renderTop(){
    if(!state)return; const ores=state.source.ores; const top=ores[0];
    $('perShipKpi').textContent=fmt(perShip(),'m3'); $('fleetKpi').textContent=fmt(fleetM3(),'m3'); $('topOreKpi').textContent=top.name; $('topOreSub').textContent=`${top.jbvPerM3.toFixed(2)} JBV/m³`; $('projectedIskKpi').textContent=`${fmt(projectedISK(top))}/hr`;
    $('actualTodayM3').textContent=fmt(state.esi.actual.today.m3,'m3'); $('actualTodayIsk').textContent=fmt(actualValue(state.esi.actual.today.jbv));
    $('actualExpTodayM3').textContent=`${fmt(state.esi.actual.today.m3,'m3')} m³`; $('actualExpTodayValue').textContent=`${fmt(actualValue(state.esi.actual.today.jbv))} ISK`; $('actualWeekM3').textContent=`${fmt(state.esi.actual.week.m3,'m3')} m³`; $('actualWeekValue').textContent=`${fmt(actualValue(state.esi.actual.week.jbv))} ISK`;
    $('esiStatus').textContent=`${state.esi.linkedCharacters} TOONS`; $('lastSync').textContent=state.esi.lastSyncAt?`Last refresh ${ago(state.esi.lastSyncAt)}`:(state.esi.lastError||'Never refreshed');
  }
  function renderFleet(){
    if(!me)return;
    if(document.activeElement!==$('uptime'))$('uptime').value=Number(fleetSettings.uptime)||100;
    if(document.activeElement!==$('payout'))$('payout').value=Number(fleetSettings.payout)||95;

    const chars=me.characters||[];
    if(!chars.some(character=>String(character.characterId)===String(calcSettings.boosterCharacterId))){
      calcSettings.boosterCharacterId='';
      calcSettings.boosterFittingId='';
    }
    const selectedBooster=calcCharacter(calcSettings.boosterCharacterId);
    const selectedBoostFits=boosterFits(selectedBooster);
    if(calcSettings.boosterCharacterId&&!selectedBoostFits.some(fit=>String(fit.fittingId)===String(calcSettings.boosterFittingId))){
      calcSettings.boosterFittingId=selectedBoostFits[0]?String(selectedBoostFits[0].fittingId):'';
    }
    if(!calcSettings.boosterCharacterId)calcSettings.boosterFittingId='';
    localStorage.setItem('jlrMiningCalc',JSON.stringify(calcSettings));

    const booster=calcCharacter(calcSettings.boosterCharacterId);
    const boosterFit=calcFitting(booster,calcSettings.boosterFittingId);
    const list=$('fleetMemberList');
    list.innerHTML='';
    for(const character of chars){
      const id=String(character.characterId),fits=miningFits(character);
      const existing=fleetSettings.members[id]&&typeof fleetSettings.members[id]==='object'?fleetSettings.members[id]:{};
      const chosen=fits.find(x=>String(x.fittingId)===String(existing.fittingId))||fits[0]||null;
      fleetSettings.members[id]={enabled:Boolean(existing.enabled),fittingId:chosen?String(chosen.fittingId):''};
    }

    const stats=fleetStats(),byId=new Map(stats.entries.map(x=>[String(x.character.characterId),x]));
    if(!chars.length){
      list.innerHTML='<div class="fleet-empty">Connect miners to build your fleet.</div>';
    }else{
      for(const character of chars){
        const id=String(character.characterId),cfg=fleetSettings.members[id],fits=miningFits(character),entry=byId.get(id);
        const row=document.createElement('div');row.className=`fleet-member${cfg.enabled?' selected':''}`;
        const fitOptions=fits.length?fits.map(f=>`<option value="${f.fittingId}" ${String(f.fittingId)===String(cfg.fittingId)?'selected':''}>${esc(f.shipName)} — ${esc(f.name)}</option>`).join(''):'<option value="">No mining fit</option>';
        let output='Not selected';
        if(cfg.enabled){
          if(entry?.result)output=`${fmt(entry.effectiveM3,'m3')} m³/hr`;
          else output=entry?.error||'Needs fit';
        }
        const isBooster=id===String(calcSettings.boosterCharacterId||'');
        const boosterFitText=isBooster?(boosterFit?`${boosterFit.shipName} — ${boosterFit.name}`:'No booster fit'):'';
        if(isBooster)row.classList.add('booster');
        row.innerHTML=`
          <label class="fleet-member-toggle"><input class="fleet-member-check" data-id="${id}" type="checkbox" ${cfg.enabled?'checked':''} ${!isBooster&&!fits.length?'disabled':''}><img src="${esc(character.portrait)}" alt=""><span><strong>${esc(character.name)}</strong><small>${isBooster?(cfg.enabled?'Selected booster • in fleet':'Selected booster • not in fleet'):fits.length?`${fits.length} mining fit${fits.length===1?'':'s'}`:'No mining fits'}</small></span></label>
          ${isBooster?`<div class="fleet-booster-fit-inline">${esc(boosterFitText)}</div>`:`<select class="fleet-fit-select" data-id="${id}" ${fits.length?'':'disabled'}>${fitOptions}</select>`}
          <strong class="fleet-member-output">${esc(isBooster?(cfg.enabled?'Booster':'Not in fleet'):output)}</strong>`;
        list.appendChild(row);
      }
    }

    list.querySelectorAll('.fleet-member-check').forEach(input=>input.addEventListener('change',()=>{
      const id=input.dataset.id;if(!fleetSettings.members[id])fleetSettings.members[id]={enabled:false,fittingId:''};
      fleetSettings.members[id].enabled=input.checked;saveFleet();
    }));
    list.querySelectorAll('.fleet-fit-select').forEach(select=>select.addEventListener('change',()=>{
      const id=select.dataset.id;if(!fleetSettings.members[id])fleetSettings.members[id]={enabled:false,fittingId:''};
      fleetSettings.members[id].fittingId=select.value;saveFleet();
    }));

    const boostLabel=booster&&boosterFit&&boosterInFleet()?` • ${boosterFit.shipName} boost`:'';
    $('setupSummary').textContent=stats.count?`${stats.count} miners • ${fmt(stats.total,'m3')} m³/hr${boostLabel} • ${Number(fleetSettings.payout).toFixed(1)}% payout`:`Select miners${boostLabel}`;
    localStorage.setItem('jlrFleet',JSON.stringify(fleetSettings));
  }
  function renderSelect(){
    if(!state)return;
    const systemSelect=$('systemSelect');
    if(document.activeElement===systemSelect)return;
    const old=selectedSystem||systemSelect.value; systemSelect.innerHTML='';
    for(const ore of state.source.ores){const g=document.createElement('optgroup');g.label=`#${ore.rank} ${ore.name.toUpperCase()}`;for(const d of definitions().filter(x=>x.rank===ore.rank)){const f=field(d.system),o=document.createElement('option');o.value=d.system;o.textContent=`${d.system} — ${f.status==='cleared'?`RED ${timer(f.timerEndsAt)}`:statusText[f.status]}${f.cherryPicked?' 🍒':''}`;g.appendChild(o)}systemSelect.appendChild(g)}
    selectedSystem=definitions().some(x=>x.system===old)?old:(definitions()[0]?.system||'');
    systemSelect.value=selectedSystem;
  }
  function chooseSystem(system){selectedSystem=system;$('systemSelect').value=system;$('fieldNote').value='';renderSelect();renderBoards();renderSelected();renderNotes()}
  function node(d,f,includeTimer=true){const b=document.createElement('button');b.type='button';b.className='system-node';b.dataset.status=f.status;b.dataset.system=d.system;if(d.system===selectedSystem)b.classList.add('selected');const line=f.status==='cleared'?timer(f.timerEndsAt):f.status==='picked'?'PICKED':'READY';b.innerHTML=`${f.cherryPicked?'<span class="cherry-pin">🍒</span>':''}<span class="sys-name">${esc(d.system)}</span><span class="sys-ore">#${d.rank} ${esc(d.ore)}</span>${includeTimer?`<span class="sys-state">${line}</span>`:''}`;b.title=`${d.system} • ${d.ore} • ${statusText[f.status]}${f.cherryPicked?' • Cherry Picked':''}${f.notes?.length?` • ${f.notes.length} notes`:''}`;b.addEventListener('click',()=>chooseSystem(d.system));return b}
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
    if(!state||!selectedSystem)return;
    const d=def(selectedSystem),f=field(selectedSystem);if(!d||!f)return;
    const status=f.status==='cleared'?`RED • ${timer(f.timerEndsAt)}`:statusText[f.status];
    $('selectedDetail').innerHTML=`<strong>#${d.rank} ${esc(d.ore)}</strong><span>${esc(status)}${f.cherryPicked?' • 🍒':''} • ${fmt(projectedISK(state.source.ores[d.rank-1]))}/hr</span>`;
    const timerActive=f.status==='cleared'&&Date.parse(f.timerEndsAt)>Date.now();
    for(const id of ['markGreen','markYellow','markRed'])$(id).disabled=timerActive;
  }
  function renderNotes(){const f=field(selectedSystem),notes=f?.notes||[];$('fieldNotes').innerHTML=notes.length?notes.slice().reverse().map(n=>`<div class="field-note"><span>${esc(n.text)}</span><time>${esc(ago(n.createdAt))}</time></div>`).join(''):'<span class="field-notes-empty">No notes for this system yet.</span>'}
  function renderCharacters(){
    if(!me)return;$('characterList').innerHTML='';if(!me.characters.length){$('characterList').innerHTML='<div class="character-row"><div></div><div><strong>No mining toons linked</strong><small>Use Add Toon to connect one.</small></div></div>';return}
    for(const c of me.characters){
      const r=document.createElement('div');r.className='character-row';
      const savedFits=Number(c.savedFittingsCount ?? (c.fittings||[]).length)||0;
      const miningFits=(c.fittings||[]).length;
      const abyssal=Number(c.abyssalStripCount||0);
      const scopeState=c.needsReauth?' • authorization needed':` • ${savedFits} saved fits • ${miningFits} mining fits${abyssal?` • ${abyssal} Abyssal`:''}`;
      r.innerHTML=`<img src="${esc(c.portrait)}" alt=""><div><strong>${esc(c.name)}</strong><small>${c.lastError?`⚠ ${esc(c.lastError)}`:`last refresh ${ago(c.lastSyncAt)}`}${scopeState}</small></div><div class="character-actions">${c.needsReauth?'<button class="orb blue reauth" type="button">AUTHORIZE</button>':''}<button class="orb red disconnect" data-id="${c.characterId}" type="button">DISCONNECT</button></div>`;
      $('characterList').appendChild(r)
    }
    $('characterList').querySelectorAll('.reauth').forEach(b=>b.addEventListener('click',()=>{location.href='/auth/eve/start?intent=link'}));
    $('characterList').querySelectorAll('.disconnect').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Disconnect this mining toon from JLR?'))return;try{const p=await api(`/api/me/characters/${b.dataset.id}`,{method:'DELETE'});me=p.user;renderCharacters();renderCalculator();toast('Toon disconnected.')}catch(e){toast(e.message)}}));
  }
  function renderCalculator(){
    if(!me||!$('calcMinerCharacter'))return;
    const data=calcData(),engine=window.JLRYieldMath;
    if(!data||!engine){$('calcResults').innerHTML='<div class="calc-empty">Calculator data is not loaded.</div>';return}
    const chars=me.characters||[];
    const minerSel=$('calcMinerCharacter'),fitSel=$('calcFitting'),crystalSel=$('calcCrystal'),boosterSel=$('calcBoosterCharacter'),boosterFitSel=$('calcBoosterFitting');
    const oldMiner=calcSettings.minerCharacterId||minerSel.value;
    minerSel.innerHTML=chars.map(ch=>`<option value="${ch.characterId}">${esc(ch.name)}</option>`).join('');
    if(!chars.length){$('calcResults').innerHTML='<div class="calc-empty">Connect a mining toon first.</div>';fitSel.innerHTML='';return}
    calcSettings.minerCharacterId=chars.some(ch=>String(ch.characterId)===String(oldMiner))?String(oldMiner):String(chars[0].characterId);
    minerSel.value=calcSettings.minerCharacterId;
    const miner=calcCharacter(calcSettings.minerCharacterId);
    const fits=miningFits(miner);
    fitSel.innerHTML=fits.length?fits.map(f=>`<option value="${f.fittingId}">${esc(f.shipName)} — ${esc(f.name)}</option>`).join(''):'<option value="">No supported mining fits synced</option>';
    if(!fits.some(f=>String(f.fittingId)===String(calcSettings.fittingId)))calcSettings.fittingId=fits[0]?String(fits[0].fittingId):'';
    fitSel.value=calcSettings.fittingId;
    const minerFit=calcFitting(miner,calcSettings.fittingId);

    const crystals=Object.keys(data.crystals||{});
    crystalSel.innerHTML='<option value="Auto">Auto-detect from fit</option>'+crystals.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');
    if(!['Auto',...crystals].includes(calcSettings.crystal))calcSettings.crystal='Auto';
    crystalSel.value=calcSettings.crystal;

    boosterSel.innerHTML='<option value="">No booster</option>'+chars.map(ch=>`<option value="${ch.characterId}">${esc(ch.name)}</option>`).join('');
    if(!chars.some(ch=>String(ch.characterId)===String(calcSettings.boosterCharacterId)))calcSettings.boosterCharacterId='';
    boosterSel.value=calcSettings.boosterCharacterId;
    const booster=calcCharacter(calcSettings.boosterCharacterId);
    const boostFits=boosterFits(booster);
    boosterFitSel.innerHTML='<option value="">No booster fit</option>'+boostFits.map(f=>`<option value="${f.fittingId}">${esc(f.shipName)} — ${esc(f.name)}</option>`).join('');
    if(!boostFits.some(f=>String(f.fittingId)===String(calcSettings.boosterFittingId)))calcSettings.boosterFittingId=boostFits[0]?String(boostFits[0].fittingId):'';
    if(!calcSettings.boosterCharacterId)calcSettings.boosterFittingId='';
    boosterFitSel.value=calcSettings.boosterFittingId;
    const boosterFit=calcFitting(booster,calcSettings.boosterFittingId);

    const detectedBoostCharges=engine.detectBoostCharges(boosterFit);
    $('calcBoostCharges').textContent=detectedBoostCharges.names.length?detectedBoostCharges.names.join(' + '):'None';
    $('calcMindlink').checked=Boolean(calcSettings.mindlink);

    const needsReauth=Boolean(miner?.needsReauth||(boosterInFleet()&&booster&&booster.needsReauth));
    $('calcStatus').textContent=needsReauth?'AUTHORIZE':'READY';

    if(!minerFit){
      $('calcResults').innerHTML='<div class="calc-empty">Save a supported barge/exhumer fit, authorize access, then refresh.</div>';
      localStorage.setItem('jlrMiningCalc',JSON.stringify(calcSettings));
      return;
    }
    if(miner?.needsReauth||!Object.keys(miner?.skills||{}).length){
      $('calcResults').innerHTML='<div class="calc-empty">Authorize this miner, then press Refresh.</div>';
      localStorage.setItem('jlrMiningCalc',JSON.stringify(calcSettings));
      return;
    }
    if(boosterInFleet()&&booster&&boosterFit&&(booster.needsReauth||!Object.keys(booster.skills||{}).length)){
      $('calcResults').innerHTML='<div class="calc-empty">Authorize the selected booster, then press Refresh.</div>';
      localStorage.setItem('jlrMiningCalc',JSON.stringify(calcSettings));
      return;
    }

    try{
      const activeBooster=boosterInFleet();
      const result=engine.calculate({
        data,
        minerSkills:miner?.skills||{},
        minerFit,
        crystalKey:calcSettings.crystal,
        boosterSkills:activeBooster?(booster?.skills||{}):{},
        boosterFit:activeBooster?boosterFit:null,
        mindlink:activeBooster&&Boolean(calcSettings.mindlink),
      });
      const fleetView=fleetStats(),fleetCount=fleetView.count,fleet=fleetView.total;
      const firstLaser=result.lasers[0];
      const detectedCrystal=calcSettings.crystal==='Auto'?engine.detectCrystal(minerFit):result.crystal;
      $('calcResults').innerHTML=`
        <article class="calc-card compact-ship-stat"><span>Ship</span><strong>${esc(result.shipName)}</strong><small>${esc(minerFit.name||'Saved fit')}</small></article>
        <article class="calc-card expanded-stat"><span>Per ship</span><strong>${fmt(result.m3PerHour,'m3')} m³/hr</strong><small>${result.m3PerSecond.toFixed(2)} m³/s</small></article>
        <article class="calc-card cycle-stat"><span>Cycle</span><strong>${firstLaser?firstLaser.duration.toFixed(2):'—'} sec</strong><small>${esc(result.shipName)} • crystal ${esc(detectedCrystal)}</small></article>
        <article class="calc-card boost-stat"><span>Boost</span><strong>${(result.boost.cycleReduction*100).toFixed(2)}%</strong><small>${result.boost.ship==='None'?'No booster':esc(result.boost.ship+' '+result.boost.core+' / Burst '+result.boost.burst)}</small></article>
        <article class="calc-card expanded-stat"><span>Fleet × ${fleetCount}</span><strong>${fmt(fleet,'m3')} m³/hr</strong><small>selected miners @ ${Number(fleetSettings.uptime).toFixed(0)}% uptime</small></article>`;

    }catch(err){
      $('calcResults').innerHTML=`<div class="calc-empty">⚠ ${esc(err.message||err)}</div>`;
    }
    localStorage.setItem('jlrMiningCalc',JSON.stringify(calcSettings));
  }
  function renderAll(){if(!state)return;renderFleet();renderTop();renderSelect();renderBoards();renderHits();renderRanking();renderTimers();renderSelected();renderNotes();renderCharacters();renderCalculator();}

  async function refreshMe(){const p=await api('/api/me');me=p.user;if(me){$('userName').textContent=me.displayName;$('userPortrait').src=me.portrait}return p.authenticated}
  async function loadState(){state=await api('/api/state');renderAll()}
  function connectSse(){if(eventSource)eventSource.close();eventSource=new EventSource('/api/events');eventSource.addEventListener('state',e=>{state=JSON.parse(e.data);renderAll();$('liveBadge').textContent='● LIVE'});eventSource.onerror=()=>{$('liveBadge').textContent='● RECONNECTING'}}

  function addToon(){location.href='/auth/eve/start?intent=link'}
  $('addToon').addEventListener('click',addToon);$('addToonTop').addEventListener('click',addToon);
  $('logout').addEventListener('click',async()=>{try{await api('/auth/logout',{method:'POST',body:'{}'})}catch{}location.href='/' });
  $('compactMode').addEventListener('click',()=>applyMode('compact'));$('expandedMode').addEventListener('click',()=>applyMode('expanded'));
  $('systemSelect').addEventListener('change',()=>chooseSystem($('systemSelect').value));
  document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));renderBoards()}));

  function applyFieldUpdate(system,updatedField){state.fields[system]=updatedField;renderAll()}
  async function setField(status,forceSystem=null){const system=forceSystem||$('systemSelect').value;if(status==='cleared'){pending={system};$('confirmText').textContent=`${system} will turn RED and count down from 10 hours. The timer cannot be restarted or changed while it runs.`;$('confirmPanel').classList.remove('hidden');return}try{const result=await api(`/api/fields/${encodeURIComponent(system)}`,{method:'PUT',body:JSON.stringify({status})});applyFieldUpdate(system,result.field);$('fieldMessage').textContent=`${system} updated to ${statusText[status]}.`}catch(e){toast(e.message)}}
  $('markGreen').addEventListener('click',()=>setField('ready',selectedSystem));$('markYellow').addEventListener('click',()=>setField('picked',selectedSystem));$('markRed').addEventListener('click',()=>setField('cleared',selectedSystem));
  async function addNote(){const system=selectedSystem,text=$('fieldNote').value.trim();if(!text){toast('Type a note first.');return}try{const result=await api(`/api/fields/${encodeURIComponent(system)}/notes`,{method:'POST',body:JSON.stringify({text})});if(selectedSystem===system&&$('fieldNote').value.trim()===text)$('fieldNote').value='';applyFieldUpdate(system,result.field);toast(`Note added to ${system}.`)}catch(e){toast(e.message)}}
  $('addNote').addEventListener('click',addNote);$('fieldNote').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addNote()}});
  async function cherry(){const system=selectedSystem||$('systemSelect').value;try{await api(`/api/fields/${encodeURIComponent(system)}/cherry`,{method:'POST',body:'{}'});$('fieldMessage').textContent=`${system} reported 🍒 CHERRY PICKED. It will clear only when the 10-hour respawn ends.`;sfx('timer')}catch(e){toast(e.message)}}
  $('reportCherry').addEventListener('click',cherry);
  $('confirmNo').addEventListener('click',()=>{pending=null;$('confirmPanel').classList.add('hidden')});
  $('confirmYes').addEventListener('click',async()=>{if(!pending)return;const p=pending;pending=null;$('confirmPanel').classList.add('hidden');try{const result=await api(`/api/fields/${encodeURIComponent(p.system)}`,{method:'PUT',body:JSON.stringify({status:'cleared',confirm:true})});applyFieldUpdate(p.system,result.field);sfx('timer');$('fieldMessage').textContent=`${p.system} RED — 10-hour timer started.`}catch(e){toast(e.message)}});
  $('syncNow').addEventListener('click',async()=>{
    const button=$('syncNow');
    const before=state?.esi?.lastSyncAt||null;
    button.disabled=true;
    button.textContent='REFRESHING…';
    try{
      await api('/api/esi/sync',{method:'POST',body:'{}'});
      toast('Refreshing character data...');
      let completed=false;
      for(let attempt=0;attempt<60;attempt++){
        await new Promise(resolve=>setTimeout(resolve,1000));
        const next=await api('/api/state');
        state=next;
        const finished=!next.esi?.syncing&&next.esi?.lastSyncAt&&next.esi.lastSyncAt!==before;
        if(finished){completed=true;break}
      }
      await refreshMe();
      renderAll();
      if(completed){
        const chars=me?.characters||[];
        const saved=chars.reduce((n,c)=>n+(Number(c.savedFittingsCount ?? (c.fittings||[]).length)||0),0);
        const mining=chars.reduce((n,c)=>n+(c.fittings||[]).length,0);
        const abyssal=chars.reduce((n,c)=>n+(Number(c.abyssalStripCount)||0),0);
        button.textContent='UPDATED ✓';
        toast(`${saved} saved fits • ${mining} mining fits${abyssal?` • ${abyssal} Abyssal`:''}`);
        setTimeout(()=>{button.textContent='REFRESH';button.disabled=false},2200);
      }else{
        button.textContent='STILL REFRESHING';
        toast('Refresh is taking longer than expected.');
        setTimeout(()=>{button.textContent='REFRESH';button.disabled=false},3000);
      }
    }catch(e){
      button.textContent='REFRESH FAILED';
      toast(e.message);
      setTimeout(()=>{button.textContent='REFRESH';button.disabled=false},3000);
    }
  });

  function readCalc(){
    calcSettings={
      minerCharacterId:$('calcMinerCharacter').value,
      fittingId:$('calcFitting').value,
      crystal:$('calcCrystal').value,
      boosterCharacterId:$('calcBoosterCharacter').value,
      boosterFittingId:$('calcBoosterFitting').value,
      mindlink:$('calcMindlink').checked,
    };
    saveCalc();
  }
  ['calcFitting','calcCrystal'].forEach(id=>$(id).addEventListener('change',readCalc));
  ['calcBoosterFitting','calcMindlink'].forEach(id=>$(id).addEventListener('change',()=>{readCalc();renderFleet();renderTop()}));
  $('calcMinerCharacter').addEventListener('change',()=>{calcSettings.minerCharacterId=$('calcMinerCharacter').value;calcSettings.fittingId='';saveCalc()});
  $('calcBoosterCharacter').addEventListener('change',()=>{
    calcSettings.boosterCharacterId=$('calcBoosterCharacter').value;
    calcSettings.boosterFittingId='';
    const id=String(calcSettings.boosterCharacterId||'');
    if(id){
      const existing=fleetSettings.members[id]&&typeof fleetSettings.members[id]==='object'?fleetSettings.members[id]:{};
      fleetSettings.members[id]={...existing,enabled:true,fittingId:existing.fittingId||''};
      localStorage.setItem('jlrFleet',JSON.stringify(fleetSettings));
    }
    saveCalc();
    renderFleet();
    renderTop();
  });

  function readFleet(){
    fleetSettings.uptime=Math.min(100,Math.max(1,Number($('uptime').value)||100));
    fleetSettings.payout=Math.min(100,Math.max(1,Number($('payout').value)||95));
    saveFleet();
  }
  ['uptime','payout'].forEach(id=>$(id).addEventListener('input',readFleet));
  async function boot(){
    try{
      const config=await fetch('/api/config').then(r=>r.json());
      if(!config.ssoConfigured){$('setupWarning').classList.remove('hidden');$('setupWarning').textContent='Login is not configured yet.';}
      const auth=await fetch('/api/me',{credentials:'same-origin'}).then(r=>r.json());
      if(!auth.authenticated){showLogin();return}
      me=auth.user;showApp();$('userName').textContent=me.displayName;$('userPortrait').src=me.portrait;applyMode(localStorage.getItem('jlrMode')==='expanded'?'expanded':'compact');await loadState();connectSse();
      const params=new URLSearchParams(location.search);if(params.get('linked'))toast('Mining toon connected.');if(params.get('login'))toast('Logged in.');if(params.get('error'))toast(decodeURIComponent(params.get('error')));if(params.toString())history.replaceState({},'',location.pathname);
    }catch(e){console.error(e);showLogin();$('setupWarning').classList.remove('hidden');$('setupWarning').textContent=`JLR could not load: ${e.message}`}
  }
  setInterval(()=>{if(state){renderBoards();renderTimers();renderSelect();renderSelected();}},1000);
  boot();
})();
