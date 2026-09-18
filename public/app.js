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
  const DEFAULT_CALC = { boosterCharacterId:'', boosterFittingId:'', mindlink:true };
  function loadCalc(){try{return{...DEFAULT_CALC,...JSON.parse(localStorage.getItem('jlrMiningCalc')||'{}')}}catch{return{...DEFAULT_CALC}}}
  let calcSettings=loadCalc();
  delete calcSettings.efficiencyCharge;
  delete calcSettings.minerCharacterId;
  delete calcSettings.fittingId;
  delete calcSettings.crystal;
  let iceTrackType=localStorage.getItem('jlrIceType')||'Blue Ice IV-Grade';
  let oreTrendType=localStorage.getItem('jlrOreTrend')||'Kylixium';
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

  function compactNumber(v){
    const n=Number(v);
    if(!Number.isFinite(n))return'—';
    const a=Math.abs(n);
    if(a>=1e9)return(n/1e9).toFixed(a>=1e10?0:1)+'B';
    if(a>=1e6)return(n/1e6).toFixed(a>=1e7?0:1)+'M';
    if(a>=1e3)return(n/1e3).toFixed(a>=1e4?0:1)+'K';
    return n.toFixed(a>=100?0:a>=10?1:2);
  }
  function chartDateLabel(date){
    const d=new Date(String(date)+'T00:00:00Z');
    if(!Number.isFinite(d.getTime()))return String(date||'');
    return d.toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
  }
  function marketHistoryPoints(bucket,key,currentJita,currentCn){
    const source=Array.isArray(state?.market?.history?.[bucket]?.[key])?state.market.history[bucket][key]:[];
    const points=source.slice(-31).map(row=>({
      date:String(row.date||''),
      jita:Number.isFinite(Number(row.jita))?Number(row.jita):null,
      cn:Number.isFinite(Number(row.cn))?Number(row.cn):null,
    })).filter(row=>row.date);
    const today=new Date().toISOString().slice(0,10);
    if(!points.some(row=>row.date===today)){
      points.push({
        date:today,
        jita:Number.isFinite(Number(currentJita))&&Number(currentJita)>0?Number(currentJita):null,
        cn:Number.isFinite(Number(currentCn))&&Number(currentCn)>0?Number(currentCn):null,
      });
    }
    return points.sort((a,b)=>a.date.localeCompare(b.date)).slice(-31);
  }
  function renderMarketLineChart(el,points,{unit='',decimals=2}={}){
    if(!el)return;
    const rows=(points||[]).filter(row=>row&&row.date).slice(-31);
    const vals=rows.flatMap(row=>[row.jita,row.cn]).filter(v=>Number.isFinite(Number(v))&&Number(v)>0).map(Number);
    if(!vals.length){
      el.innerHTML='<div class="visual-empty">Market history is collecting its first daily point.</div>';
      return;
    }

    const W=760,H=300,L=62,R=18,T=34,B=36;
    const pw=W-L-R,ph=H-T-B;
    let min=Math.min(...vals),max=Math.max(...vals);
    if(min===max){min*=.97;max*=1.03}
    else{const pad=(max-min)*.10;min=Math.max(0,min-pad);max+=pad}
    const range=Math.max(1e-9,max-min);
    const x=i=>rows.length<=1?L+pw/2:L+(i/(rows.length-1))*pw;
    const y=v=>T+(max-Number(v))/range*ph;

    const ticks=5;
    let grid='';
    for(let i=0;i<=ticks;i++){
      const yy=T+(i/ticks)*ph;
      const value=max-(i/ticks)*range;
      grid+='<line x1="'+L+'" y1="'+yy.toFixed(1)+'" x2="'+(W-R)+'" y2="'+yy.toFixed(1)+'" class="market-grid"/>'+
        '<text x="'+(L-8)+'" y="'+(yy+3).toFixed(1)+'" text-anchor="end" class="market-axis-label">'+esc(compactNumber(value))+'</text>';
    }

    const labelCount=Math.min(6,rows.length);
    const tickIndexes=new Set();
    if(rows.length===1)tickIndexes.add(0);
    else for(let i=0;i<labelCount;i++)tickIndexes.add(Math.round(i*(rows.length-1)/(labelCount-1)));
    let xLabels='';
    for(const i of tickIndexes){
      xLabels+='<text x="'+x(i).toFixed(1)+'" y="'+(H-10)+'" text-anchor="middle" class="market-axis-label">'+esc(chartDateLabel(rows[i].date))+'</text>';
    }

    function seriesPath(key){
      let d='',started=false;
      for(let i=0;i<rows.length;i++){
        const v=Number(rows[i][key]);
        if(!(Number.isFinite(v)&&v>0)){started=false;continue}
        d+=(started?' L ':'M ')+x(i).toFixed(1)+' '+y(v).toFixed(1);
        started=true;
      }
      return d;
    }
    function areaPaths(){
      const paths=[];
      let segment=[];
      const flush=()=>{
        if(segment.length<2){segment=[];return}
        const top=segment.map(p=>x(p.i).toFixed(1)+' '+y(Math.max(p.jita,p.cn)).toFixed(1));
        const bottom=[...segment].reverse().map(p=>x(p.i).toFixed(1)+' '+y(Math.min(p.jita,p.cn)).toFixed(1));
        paths.push('M '+top.join(' L ')+' L '+bottom.join(' L ')+' Z');
        segment=[];
      };
      rows.forEach((row,i)=>{
        const j=Number(row.jita),n=Number(row.cn);
        if(Number.isFinite(j)&&j>0&&Number.isFinite(n)&&n>0)segment.push({i,jita:j,cn:n});
        else flush();
      });
      flush();
      return paths;
    }
    function dots(key,cls){
      return rows.map((row,i)=>{
        const v=Number(row[key]);
        if(!(Number.isFinite(v)&&v>0))return'';
        const label=chartDateLabel(row.date)+' • '+(key==='jita'?'Jita':'C-N')+' '+v.toFixed(decimals)+(unit?' '+unit:'');
        return '<circle cx="'+x(i).toFixed(1)+'" cy="'+y(v).toFixed(1)+'" r="3.3" class="'+cls+'"><title>'+esc(label)+'</title></circle>';
      }).join('');
    }

    const jitaPath=seriesPath('jita'),cnPath=seriesPath('cn');
    const areas=areaPaths().map(d=>'<path d="'+d+'" class="market-range-area"/>').join('');
    const first=rows[0]?.date;
    const last=rows[rows.length-1]?.date;
    const monthLabel=last?new Date(last+'T00:00:00Z').toLocaleDateString(undefined,{month:'short',year:'numeric',timeZone:'UTC'}):'';
    const collecting=rows.length<30?'<div class="market-history-note">History started '+esc(chartDateLabel(first))+' • '+rows.length+' daily point'+(rows.length===1?'':'s')+' collected</div>':'';

    el.innerHTML='<div class="market-chart-shell">'+
      '<div class="market-chart-month">'+esc(monthLabel)+'</div>'+
      '<div class="market-chart-legend"><span class="legend-market-jita">Jita</span><span class="legend-market-cn">C-N</span><span class="legend-market-range">Price range</span></div>'+
      '<svg class="market-line-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Jita versus C-N 30 day market trend">'+
        '<defs><pattern id="marketDots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" class="market-bg-dot"/></pattern></defs>'+
        '<rect x="'+L+'" y="'+T+'" width="'+pw+'" height="'+ph+'" class="market-bg-grid"/>'+
        grid+xLabels+areas+
        (jitaPath?'<path d="'+jitaPath+'" class="market-line market-line-jita"/>':'')+
        (cnPath?'<path d="'+cnPath+'" class="market-line market-line-cn"/>':'')+
        dots('jita','market-dot market-dot-jita')+dots('cn','market-dot market-dot-cn')+
        '<text x="'+(W-R)+'" y="'+(T-10)+'" text-anchor="end" class="market-unit-label">'+esc(unit)+'</text>'+
      '</svg>'+
      collecting+
    '</div>';
  }
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
      o.type='triangle';o.frequency.setValueAtTime(470,n);o.frequency.exponentialRampToValueAtTime(650,n+.06);
      g.gain.setValueAtTime(.020,n);g.gain.exponentialRampToValueAtTime(.001,n+.075);o.start(n);o.stop(n+.08);
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
    if(state){renderFleet();renderTop();renderIceMining()}
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


  const ICE_HARVESTERS={
    'Ice Harvester I':240,
    'Ice Harvester II':200,
    'ORE Ice Harvester':200,
  };
  const ICE_UPGRADES={
    'Ice Harvester Upgrade I':0.05,
    'Frigoris Restrained Ice Harvester Upgrade':0.08,
    'Ice Harvester Upgrade II':0.09,
    "'Anguis' Ice Harvester Upgrade":0.09,
    "'Ingenii' Ice Harvester Upgrade":0.10,
  };
  const ICE_SHIP_BONUSES={
    Covetor:{barge:0.03,exhumers:0,role:0.30},
    Retriever:{barge:0.02,exhumers:0,role:0.125},
    Procurer:{barge:0.02,exhumers:0,role:0},
    Hulk:{barge:0.03,exhumers:0.04,role:0.30},
    Mackinaw:{barge:0.04,exhumers:0,role:0.125},
    Skiff:{barge:0.04,exhumers:0,role:0},
  };
  function skillLevel(character,id){return Number(character?.skills?.[String(id)]?.level||0)}
  function selectedFleetFit(character){
    const cfg=fleetSettings.members?.[String(character?.characterId)]||{};
    const fits=miningFits(character);
    return fits.find(f=>String(f.fittingId)===String(cfg.fittingId))||fits[0]||null;
  }
  function iceFitStats(character,fit){
    if(!character||!fit)return null;
    const ship=ICE_SHIP_BONUSES[fit.shipName];
    if(!ship)return null;
    const items=Array.isArray(fit.items)?fit.items:[];
    const harvesters=items.filter(row=>Object.prototype.hasOwnProperty.call(ICE_HARVESTERS,String(row.name||'')));
    if(!harvesters.length)return null;
    if(!Object.prototype.hasOwnProperty.call(character.skills||{},'16281'))return{character,fit,error:'Refresh to sync Ice Harvesting skill'};

    const iceSkill=skillLevel(character,16281);
    const barge=skillLevel(character,17940);
    const exhumers=skillLevel(character,22551);
    let upgradeReduction=0,rigReduction=0;
    for(const row of items){
      const name=String(row.name||''),q=Math.max(1,Number(row.quantity||1));
      if(Object.prototype.hasOwnProperty.call(ICE_UPGRADES,name))upgradeReduction+=Number(ICE_UPGRADES[name])*q;
      if(name==='Medium Ice Harvester Accelerator I')rigReduction+=0.12*q;
    }

    const booster=calcCharacter(calcSettings.boosterCharacterId);
    const boosterFit=calcFitting(booster,calcSettings.boosterFittingId);
    const activeBooster=boosterInFleet();
    const boost=window.JLRYieldMath?.boostBreakdown(
      calcData(),
      activeBooster?(booster?.skills||{}):{},
      activeBooster?boosterFit:null,
      activeBooster&&Boolean(calcSettings.mindlink),
    )||{cycleReduction:0,ship:'None'};

    const common=
      Math.max(.05,1-.05*iceSkill)*
      Math.max(.05,1-ship.barge*barge)*
      Math.max(.05,1-ship.exhumers*exhumers)*
      Math.max(.05,1-ship.role)*
      Math.max(.05,1-upgradeReduction)*
      Math.max(.05,1-rigReduction)*
      Math.max(.05,1-Number(boost.cycleReduction||0));

    let blocksPerHour=0,harvesterCount=0;
    const modules=[];
    for(const row of harvesters){
      const name=String(row.name||''),q=Math.max(1,Number(row.quantity||1));
      const duration=Number(ICE_HARVESTERS[name])*common;
      harvesterCount+=q;
      blocksPerHour+=(3600/duration)*q;
      modules.push({name,quantity:q,duration});
    }
    const cycle=blocksPerHour>0?harvesterCount*3600/blocksPerHour:0;
    return{character,fit,ship:fit.shipName,modules,harvesterCount,cycle,blocksPerHour,m3PerHour:blocksPerHour*1000,iceSkill,barge,exhumers,upgradeReduction,rigReduction,boost};
  }
  function iceClass(name){
    if(name==='Blue Ice IV-Grade')return'blue';
    if(name==='Glare Crust')return'glare';
    if(name==='Dark Glitter')return'dark';
    if(name==='Gelidus')return'gelidus';
    if(name==='Krystallos')return'krystallos';
    return'other';
  }

  function definitions(){return [...(state?.source?.systems||[])].sort((a,b)=>a.rank-b.rank||a.order-b.order||a.system.localeCompare(b.system))}
  function field(system){return state?.fields?.[system]||null}
  function def(system){return definitions().find(x=>x.system===system)||null}

  function renderTop(){
    if(!state)return;
    const ores=state.source.ores;
    const targets=definitions().map(d=>({d,f:field(d.system)}))
      .filter(x=>x.f.status!=='cleared')
      .sort((a,b)=>Number(a.f.cherryPicked)-Number(b.f.cherryPicked)||a.d.rank-b.d.rank||a.d.order-b.d.order);
    const target=targets[0]||null;
    const top=target?ores[target.d.rank-1]:ores[0];
    $('perShipKpi').textContent=fmt(perShip(),'m3');
    $('fleetKpi').textContent=fmt(fleetM3(),'m3');
    $('topOreKpi').textContent=top?.name||'—';
    $('topOreSub').textContent=target?`${target.d.system} • max refine`:(top?'max refine':'No target');

    const payout=Number(fleetSettings.payout)/100;
    const jitaPerM3=Number(top?.market?.jita?.refinedBuyPerM3 ?? top?.market?.jita?.buyPerM3 ?? top?.jbvPerM3);
    const cnPerM3=Number(top?.market?.cn?.refinedBuyPerM3 ?? top?.market?.cn?.buyPerM3);
    const fleetRate=fleetM3();
    const jitaHourly=Number.isFinite(jitaPerM3)?fleetRate*jitaPerM3*payout:null;
    const cnHourly=Number.isFinite(cnPerM3)&&cnPerM3>0?fleetRate*cnPerM3*payout:null;

    $('jitaValueKpi').textContent=jitaHourly===null?'—':`${fmt(jitaHourly)}/hr`;
    $('jitaValueSub').textContent=Number.isFinite(jitaPerM3)?`${jitaPerM3.toFixed(2)} ISK/m³ • max refine`:'No Jita price';
    $('cnValueKpi').textContent=cnHourly===null?'—':`${fmt(cnHourly)}/hr`;
    $('cnValueSub').textContent=cnHourly===null?'No local mineral price':`${cnPerM3.toFixed(2)} ISK/m³ • max refine`;

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
  function node(d,f,includeTimer=true){
    const b=document.createElement('button');
    b.type='button';
    b.className='system-node';
    b.dataset.status=f.status;
    b.dataset.system=d.system;
    if(d.system===selectedSystem)b.classList.add('selected');
    const line=f.status==='cleared'?timer(f.timerEndsAt):f.status==='picked'?'PICKED':'READY';
    const distance=d.distanceLy==null?NaN:Number(d.distanceLy);
    const distanceText=Number.isFinite(distance)?` • ${distance.toFixed(2)} LY`:'';
    b.innerHTML=`${f.cherryPicked?'<span class="cherry-pin">🍒</span>':''}<span class="sys-name">${esc(d.system)}</span><span class="sys-ore">#${d.rank} ${esc(d.ore)}</span>${includeTimer?`<span class="sys-state">${line}${distanceText}</span>`:''}`;
    b.title=`${d.system} • ${d.ore} • ${statusText[f.status]}${Number.isFinite(distance)?` • ${distance.toFixed(2)} LY from C-N4OD`:''}${f.cherryPicked?' • Cherry Picked':''}${f.notes?.length?` • ${f.notes.length} notes`:''}`;
    b.addEventListener('click',()=>chooseSystem(d.system));
    return b;
  }
  function iceBoardNode(row){
    const card=document.createElement('div');
    card.className='system-node ice-system-node';
    card.dataset.status='ice';
    card.dataset.system=row.system;
    const fields=Math.max(1,Number(row.iceBelts)||1);
    const distance=Number(row.distanceLy);
    card.innerHTML='<span class="sys-name">'+esc(row.system)+'</span>'+
      '<span class="sys-ore">'+fields+' ICE FIELD'+(fields===1?'':'S')+'</span>'+
      '<span class="sys-state">READY'+(Number.isFinite(distance)?' • '+distance.toFixed(2)+' LY':'')+'</span>';
    card.title=row.system+' • '+fields+' ice field'+(fields===1?'':'s')+(Number.isFinite(distance)?' • '+distance.toFixed(2)+' LY from C-N4OD':'')+' • READY';
    return card;
  }

  function renderBoards(){
    if(!state)return;
    const board=$('fieldBoard');
    board.innerHTML='';
    let counts={ready:0,picked:0,cleared:0,cherry:0};
    const iceFields=Array.isArray(state.source?.iceFields)?state.source.iceFields:[];

    if(filter!=='ice'){
      for(const d of definitions()){
        const f=field(d.system);
        counts[f.status]++;
        if(f.cherryPicked)counts.cherry++;
        if(filter==='all'||filter===f.status||(filter==='cherry'&&f.cherryPicked))board.appendChild(node(d,f,true));
      }
    }else{
      for(const d of definitions()){
        const f=field(d.system);
        counts[f.status]++;
        if(f.cherryPicked)counts.cherry++;
      }
    }

    if(filter==='all'||filter==='ice'){
      for(const row of iceFields)board.appendChild(iceBoardNode(row));
    }

    $('statusCounts').textContent=`${counts.ready} G • ${counts.picked} Y • ${counts.cleared} R • ${counts.cherry} 🍒 • ${iceFields.length} ICE`;
    $('systemCountLabel').textContent=`${definitions().length} T3 • ${iceFields.length} ICE`;
  }
  function renderHits(){
    if(!state)return;const arr=definitions().map(d=>({d,f:field(d.system)})).filter(x=>x.f.status!=='cleared').sort((a,b)=>Number(a.f.cherryPicked)-Number(b.f.cherryPicked)||a.d.rank-b.d.rank||a.d.order-b.d.order).slice(0,8);$('hitOrder').innerHTML='';
    for(const [i,x] of arr.entries()){const b=document.createElement('button');b.type='button';b.className=`orb hit-chip ${x.f.cherryPicked?'cherry':x.f.status==='picked'?'yellow':'green'}`;b.textContent=`${i+1}. ${x.d.system}${x.f.cherryPicked?' 🍒':''}`;b.addEventListener('click',()=>chooseSystem(x.d.system));$('hitOrder').appendChild(b)}
  }
  function renderMiningVisuals(){
    if(!state||!$('oreValueChart')||!$('fleetOutputChart'))return;

    const ores=state.source?.ores||[];
    const oreNames=ores.map(ore=>ore.name);
    if(!oreNames.includes(oreTrendType))oreTrendType=oreNames[0]||'Kylixium';
    const oreSelect=$('oreTrendSelect');
    if(oreSelect&&document.activeElement!==oreSelect){
      oreSelect.innerHTML=ores.map(ore=>'<option value="'+esc(ore.name)+'">'+esc(ore.name)+'</option>').join('');
      oreSelect.value=oreTrendType;
    }
    const trendOre=ores.find(ore=>ore.name===oreTrendType)||ores[0]||null;
    const currentJita=Number(trendOre?.market?.jita?.refinedBuyPerM3 ?? trendOre?.market?.jita?.buyPerM3 ?? trendOre?.jbvPerM3);
    const currentCn=Number(trendOre?.market?.cn?.refinedBuyPerM3 ?? trendOre?.market?.cn?.buyPerM3);
    const oreHistory=marketHistoryPoints('ore',trendOre?.name||oreTrendType,currentJita,currentCn);
    renderMarketLineChart($('oreValueChart'),oreHistory,{unit:'ISK/m³',decimals:2});

    const fleet=fleetStats();
    const entries=fleet.entries.filter(x=>x.result);
    if(!entries.length){
      $('fleetOutputChart').innerHTML='<div class="visual-empty">Select miners in Fleet Setup to see fleet performance.</div>';
      return;
    }

    const uptime=Math.min(100,Math.max(1,Number(fleetSettings.uptime)||100));
    const potential=entries.reduce((sum,x)=>sum+Number(x.rawM3||0),0);
    const effective=Number(fleet.total||0);
    const lost=Math.max(0,potential-effective);
    const average=entries.length?effective/entries.length:0;
    const best=entries.reduce((top,row)=>!top||Number(row.effectiveM3)>Number(top.effectiveM3)?row:top,null);

    const contributionRows=entries.map((entry,index)=>{
      const fullRate=Number(entry.rawM3)||0;
      const output=Number(entry.effectiveM3)||0;
      const share=effective>0?output/effective*100:0;
      const delta=average>0?(output-average)/average*100:0;
      return `<div class="fleet-perf-row">
        <div class="fleet-perf-miner">
          <strong>${esc(entry.character.name)}</strong>
          <small>${esc(entry.fit?.shipName||'Ship')} • ${delta>=0?'+':''}${delta.toFixed(1)}% vs fleet avg</small>
        </div>
        <div class="fleet-rate-pair">
          <div><span>100% RATE</span><strong>${fmt(fullRate,'m3')}</strong><small>m³/hr</small></div>
          <div><span>@ ${uptime.toFixed(0)}% UPTIME</span><strong>${fmt(output,'m3')}</strong><small>m³/hr</small></div>
        </div>
        <div class="fleet-share-track"><span style="width:${share.toFixed(2)}%"></span></div>
        <div class="fleet-perf-number"><strong>${share.toFixed(1)}%</strong><small>fleet share</small></div>
      </div>`;
    }).join('');

    $('fleetOutputChart').innerHTML=`
      <div class="fleet-perf-kpis">
        <div><span>@ ${uptime.toFixed(0)}% UPTIME</span><strong>${fmt(effective,'m3')}</strong><small>projected m³/hr</small></div>
        <div><span>100% RATE</span><strong>${fmt(potential,'m3')}</strong><small>full calculated m³/hr</small></div>
        <div><span>UPTIME</span><strong>${uptime.toFixed(0)}%</strong><small>fleet setting</small></div>
        <div><span>LOST</span><strong>${fmt(lost,'m3')}</strong><small>m³/hr to downtime</small></div>
      </div>
      <div class="fleet-capacity-chart">
        <div class="fleet-capacity-head"><span>UPTIME EFFECT</span><strong>${fmt(potential,'m3')} → ${fmt(effective,'m3')} m³/hr</strong></div>
        <div class="fleet-capacity-track"><span style="width:${potential>0?Math.min(100,effective/potential*100).toFixed(2):0}%"></span></div>
        <div class="fleet-capacity-scale"><span>0</span><span>${fmt(potential,'m3')} m³/hr potential</span></div>
      </div>
      <div class="fleet-perf-list">${contributionRows}</div>
      <div class="fleet-perf-footer">
        <span>Average <strong>${fmt(average,'m3')} m³/hr</strong></span>
        <span>Top miner <strong>${best?esc(best.character.name):'—'}</strong></span>
        <span>${entries.length} miner${entries.length===1?'':'s'} selected</span>
      </div>`;
  }


  function renderIceMining(){
    if(!state||!$('iceValueChart'))return;
    const iceRows=(state.source?.ice||[]).map(ice=>{
      const market=ice.market||{};
      const rawJita=Number(market.rawMarket?.jita?.buy);
      const track=Number(market.trackingBlockValue);
      const jita=Number(market.jita?.refinedBlockValue);
      const cn=Number(market.cn?.refinedBlockValue);
      return{
        name:ice.name,
        market,
        rawJita:Number.isFinite(rawJita)&&rawJita>0?rawJita:0,
        track:Number.isFinite(track)&&track>0?track:0,
        jita:Number.isFinite(jita)&&jita>0?jita:0,
        cn:Number.isFinite(cn)&&cn>0?cn:0,
        pct:Number(market.trackingPct||0),
      };
    });

    const names=iceRows.map(x=>x.name);
    if(!names.includes(iceTrackType))iceTrackType=names[0]||'Blue Ice IV-Grade';
    const select=$('iceTypeSelect');
    if(select&&document.activeElement!==select){
      select.innerHTML=iceRows.map(row=>'<option value="'+esc(row.name)+'">'+esc(row.name)+'</option>').join('');
      select.value=iceTrackType;
    }
    const selected=iceRows.find(x=>x.name===iceTrackType)||iceRows[0]||null;

    $('iceTrackValue').textContent=selected?.track?fmt(selected.track)+' ISK':'—';
    $('iceTrackValueSub').textContent=selected?(selected.name+' • '+Math.round(selected.pct*100)+'% Jita refine'):'Waiting for Jita refined value';
    $('iceBestJita').textContent=selected?.jita?fmt(selected.jita)+' ISK':'—';
    $('iceBestJitaSub').textContent=selected?(selected.name+' • /block • no Heavy Water'):'Heavy Water excluded';
    $('iceBestCn').textContent=selected?.cn?fmt(selected.cn)+' ISK':'—';
    $('iceBestCnSub').textContent=selected?(selected.name+' • /block • no Heavy Water'):'Heavy Water excluded';

    const range=Number(state.market?.titanBridgeRangeLy||6);
    const fields=Array.isArray(state.source?.iceFields)?state.source.iceFields:[];
    $('iceFieldCount').textContent=String(fields.length);
    $('iceBridgeRange').textContent='≤ '+range.toFixed(1)+' LY from C-N4OD';

    if(!iceRows.length){
      $('iceBlockTable').innerHTML='<div class="visual-empty">Ice market data is not loaded yet.</div>';
      $('iceValueChart').innerHTML='<div class="visual-empty">Ice market data is not loaded yet.</div>';
    }else{
      $('iceBlockTable').innerHTML=iceRows.map(row=>
        '<div class="ice-block-row">'+
          '<div><strong>'+esc(row.name)+'</strong><small>'+Math.round(row.pct*100)+'% Jita refine tracking</small></div>'+
          '<div><span>Jita refine</span><strong>'+(row.jita?fmt(row.jita):'—')+'</strong></div>'+
          '<div><span>Track</span><strong>'+(row.track?fmt(row.track):'—')+'</strong></div>'+
        '</div>'
      ).join('');

      const iceHistory=marketHistoryPoints('ice',selected?.name||iceTrackType,selected?.jita,selected?.cn);
      renderMarketLineChart($('iceValueChart'),iceHistory,{unit:'ISK/block',decimals:0});
    }

    const boosterId=String(calcSettings.boosterCharacterId||'');
    const selectedMiners=(me?.characters||[]).filter(ch=>{
      const id=String(ch.characterId);
      return fleetSettings.members?.[id]?.enabled&&id!==boosterId;
    });
    const stats=selectedMiners.map(ch=>{
      const fit=selectedFleetFit(ch);
      return iceFitStats(ch,fit)||{character:ch,fit,error:'Selected Fleet Setup fit is not an ice fit'};
    });

    if(!stats.length){
      $('iceFleetOutput').innerHTML='<div class="visual-empty">Select miners in Fleet Setup to calculate ice output.</div>';
    }else{
      let totalBlocks=0,totalM3=0,totalTrack=0,totalJita=0,totalCn=0;
      const body=stats.map(row=>{
        if(row.error||!row.blocksPerHour){
          return '<div class="ice-fleet-row error"><div><strong>'+esc(row.character?.name||'Miner')+'</strong><small>'+esc(row.fit?.name||'No selected fit')+'</small></div><span>'+esc(row.error||'No supported ice harvester')+'</span></div>';
        }
        const blocks=row.blocksPerHour,m3=row.m3PerHour;
        const track=blocks*Number(selected?.track||0);
        const jita=blocks*Number(selected?.jita||0);
        const cn=blocks*Number(selected?.cn||0);
        totalBlocks+=blocks;totalM3+=m3;totalTrack+=track;totalJita+=jita;totalCn+=cn;
        return '<div class="ice-fleet-row">'+
          '<div><strong>'+esc(row.character.name)+'</strong><small>'+esc(row.fit.shipName)+' • '+esc(row.fit.name||'Saved fit')+' • '+row.cycle.toFixed(1)+'s cycle</small></div>'+
          '<div><span>Blocks/hr</span><strong>'+blocks.toFixed(1)+'</strong></div>'+
          '<div><span>m³/hr</span><strong>'+fmt(m3,'m3')+'</strong></div>'+
          '<div><span>Track/hr</span><strong>'+(track?fmt(track):'—')+'</strong></div>'+
          '<div><span>Jita refine/hr</span><strong>'+(jita?fmt(jita):'—')+'</strong></div>'+
          '<div><span>C-N refine/hr</span><strong>'+(cn?fmt(cn):'—')+'</strong></div>'+
        '</div>';
      }).join('');
      $('iceFleetOutput').innerHTML=body+
        '<div class="ice-fleet-total"><span>'+esc(iceTrackType)+' fleet total</span><strong>'+
        totalBlocks.toFixed(1)+' blocks/hr • '+fmt(totalM3,'m3')+' m³/hr</strong><small>Track '+
        (totalTrack?fmt(totalTrack):'—')+'/hr • Jita refine '+(totalJita?fmt(totalJita):'—')+
        '/hr • C-N refine '+(totalCn?fmt(totalCn):'—')+'/hr</small></div>';
    }
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
      const marketButton=c.marketEligible?`<button class="orb ${c.marketAuthorized?'green':'purple'} market-auth" data-id="${c.characterId}" type="button">${c.marketAuthorized?'MARKET ✓':'MARKET ACCESS'}</button>`:'';
      r.innerHTML=`<img src="${esc(c.portrait)}" alt=""><div><strong>${esc(c.name)}</strong><small>${c.lastError?`⚠ ${esc(c.lastError)}`:`last refresh ${ago(c.lastSyncAt)}`}${scopeState}${c.marketAuthorized?' • private market authorized':''}</small></div><div class="character-actions">${marketButton}${c.needsReauth?'<button class="orb blue reauth" type="button">AUTHORIZE</button>':''}<button class="orb red disconnect" data-id="${c.characterId}" type="button">DISCONNECT</button></div>`;
      $('characterList').appendChild(r)
    }
    $('characterList').querySelectorAll('.market-auth').forEach(b=>b.addEventListener('click',()=>{location.href=`/auth/eve/market/start?character=${encodeURIComponent(b.dataset.id)}`}));
    $('characterList').querySelectorAll('.reauth').forEach(b=>b.addEventListener('click',()=>{location.href='/auth/eve/start?intent=link'}));
    $('characterList').querySelectorAll('.disconnect').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Disconnect this mining toon from JLR?'))return;try{const p=await api(`/api/me/characters/${b.dataset.id}`,{method:'DELETE'});me=p.user;renderCharacters();renderCalculator();toast('Toon disconnected.')}catch(e){toast(e.message)}}));
  }
  function renderCalculator(){
    if(!me||!$('calcResults'))return;
    const data=calcData(),engine=window.JLRYieldMath;
    if(!data||!engine){$('calcResults').innerHTML='<div class="calc-empty">Calculator data is not loaded.</div>';return}

    const chars=me.characters||[];
    const boosterSel=$('calcBoosterCharacter'),boosterFitSel=$('calcBoosterFitting');
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

    if(!chars.length){
      $('calcStatus').textContent='SETUP';
      $('calcResults').innerHTML='<div class="calc-empty">Connect a mining toon first.</div>';
      return;
    }

    const boosterId=String(calcSettings.boosterCharacterId||'');
    const enabledMiners=chars.filter(ch=>fleetSettings.members?.[String(ch.characterId)]?.enabled&&String(ch.characterId)!==boosterId);
    const minerNeedsReauth=enabledMiners.some(ch=>ch.needsReauth||!Object.keys(ch.skills||{}).length);
    const boosterNeedsReauth=Boolean(boosterInFleet()&&booster&&boosterFit&&(booster.needsReauth||!Object.keys(booster.skills||{}).length));
    $('calcStatus').textContent=(minerNeedsReauth||boosterNeedsReauth)?'AUTHORIZE':'READY';

    if(!enabledMiners.length){
      $('calcResults').innerHTML='<div class="calc-empty">Select your miners and saved fits in Fleet Setup.</div>';
      return;
    }
    if(boosterNeedsReauth){
      $('calcResults').innerHTML='<div class="calc-empty">Authorize the selected booster, then press Refresh.</div>';
      return;
    }

    const fleetView=fleetStats();
    const representative=fleetView.entries.find(x=>x.result);
    if(!representative){
      const firstError=fleetView.entries.find(x=>x.error)?.error;
      $('calcResults').innerHTML=`<div class="calc-empty">${firstError?`⚠ ${esc(firstError)}`:'Select supported mining fits in Fleet Setup, then Refresh.'}</div>`;
      return;
    }

    const result=representative.result;
    const minerFit=representative.fit;
    const firstLaser=result.lasers[0];
    const detectedCrystal=engine.detectCrystal(minerFit);
    const fleetCount=fleetView.count,fleet=fleetView.total;
    const shipSub=fleetCount>1?`${esc(representative.character.name)} • ${fleetCount} miners selected`:`${esc(representative.character.name)} • ${esc(minerFit.name||'Saved fit')}`;

    $('calcResults').innerHTML=`
      <article class="calc-card compact-ship-stat"><span>Ship</span><strong>${esc(result.shipName)}</strong><small>${shipSub}</small></article>
      <article class="calc-card expanded-stat"><span>Per ship</span><strong>${fmt(representative.rawM3,'m3')} m³/hr</strong><small>${result.m3PerSecond.toFixed(2)} m³/s • Fleet Setup</small></article>
      <article class="calc-card cycle-stat"><span>Cycle</span><strong>${firstLaser?firstLaser.duration.toFixed(2):'—'} sec</strong><small>${esc(result.shipName)} • crystal ${esc(detectedCrystal)}</small></article>
      <article class="calc-card boost-stat"><span>Boost</span><strong>${(result.boost.cycleReduction*100).toFixed(2)}%</strong><small>${result.boost.ship==='None'?'No booster':esc(result.boost.ship+' '+result.boost.core+' / Burst '+result.boost.burst)}</small></article>
      <article class="calc-card expanded-stat"><span>Fleet × ${fleetCount}</span><strong>${fmt(fleet,'m3')} m³/hr</strong><small>selected miners @ ${Number(fleetSettings.uptime).toFixed(0)}% uptime</small></article>`;

    localStorage.setItem('jlrMiningCalc',JSON.stringify(calcSettings));
  }
  function renderAll(){if(!state)return;renderFleet();renderTop();renderSelect();renderBoards();renderHits();renderMiningVisuals();renderIceMining();renderRanking();renderTimers();renderSelected();renderNotes();renderCharacters();renderCalculator();}

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

  $('oreTrendSelect').addEventListener('change',()=>{
    oreTrendType=$('oreTrendSelect').value||'Kylixium';
    localStorage.setItem('jlrOreTrend',oreTrendType);
    renderMiningVisuals();
    sfx('select');
  });

  $('iceTypeSelect').addEventListener('change',()=>{
    iceTrackType=$('iceTypeSelect').value||'Blue Ice IV-Grade';
    localStorage.setItem('jlrIceType',iceTrackType);
    renderIceMining();
    sfx('select');
  });

  function readBoosterCalc(){
    calcSettings.boosterFittingId=$('calcBoosterFitting').value;
    calcSettings.mindlink=$('calcMindlink').checked;
    saveCalc();
  }
  ['calcBoosterFitting','calcMindlink'].forEach(id=>$(id).addEventListener('change',readBoosterCalc));
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
      const params=new URLSearchParams(location.search);if(params.get('linked'))toast('Mining toon connected.');if(params.get('login'))toast('Logged in.');if(params.get('market')==='authorized')toast('John market access authorized.');if(params.get('error'))toast(decodeURIComponent(params.get('error')));if(params.toString())history.replaceState({},'',location.pathname);
    }catch(e){console.error(e);showLogin();$('setupWarning').classList.remove('hidden');$('setupWarning').textContent=`JLR could not load: ${e.message}`}
  }
  setInterval(()=>{if(state){renderBoards();renderTimers();renderSelect();renderSelected();}},1000);
  boot();
})();
