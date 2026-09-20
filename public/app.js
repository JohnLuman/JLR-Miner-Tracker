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
  let audioResumePending = false;
  let soundEnabled = localStorage.getItem('jlrSoundEnabled') !== 'false';
  const THEME_IDS = new Set(['void','citadel','forge','serpentis','blood','angel','edencom','aurora']);
  let activeTheme = THEME_IDS.has(localStorage.getItem('jlrTheme')) ? localStorage.getItem('jlrTheme') : 'void';
  document.documentElement.dataset.theme=activeTheme;
  let toastTimer = null;
  let eventSource = null;
  let scanCharacterId = localStorage.getItem('jlrScanCharacter') || '';
  let scanBusy = false;
  let merIntel = null;
  let merIntelError = '';
  let pvpIntel = null;
  let pvpIntelError = '';
  let pvpIntelLoading = false;
  let pvpIntelPoll = null;
  let pvpIntelPollCount = 0;
  const savedPvpMemberRankMode=localStorage.getItem('jlrPvpMemberRankMode');
  let pvpMemberRankMode=['overall','activity','isk','damage','lifetime'].includes(savedPvpMemberRankMode)?savedPvpMemberRankMode:'overall';
  let pvpPinnedCharacterId=localStorage.getItem('jlrPvpPinnedCharacter')||'';
  let pvpToonMenuOpen=false;
  let pvpLifetimeDamage=null;
  let pvpLifetimeDamageLoading=false;
  let pvpLifetimeDamageError='';
  let pvpLifetimeDamagePoll=null;
  let threatScanData=null;
  let threatScanLoading=false;
  let threatScanError='';
  let threatScanText='';
  let threatIgnorePositive=localStorage.getItem('jlrThreatIgnorePositive')!=='false';
  let threatIgnoreOwn=localStorage.getItem('jlrThreatIgnoreOwn')!=='false';
  let threatShareLoading=false;
  let threatShareUrl='';
  let threatShareError='';

  const DEFAULT_FLEET = { members:{}, uptime:100, payout:95, order:[] };
  function loadFleet() {
    try {
      const raw=JSON.parse(localStorage.getItem('jlrFleet')||'{}');
      return {
        members:raw.members&&typeof raw.members==='object'?raw.members:{},
        uptime:Math.min(100,Math.max(1,Number(raw.uptime)||100)),
        payout:Math.min(100,Math.max(1,Number(raw.payout)||95)),
        order:Array.isArray(raw.order)?raw.order.map(String):[],
      };
    } catch { return { ...DEFAULT_FLEET, members:{}, order:[] }; }
  }
  let fleetSettings = loadFleet();
  let fleetArrangeMode=false;
  let fleetDragId='';
  let fleetSearchText='';
  let fleetViewFilter=['all','selected','miners','nofit'].includes(localStorage.getItem('jlrFleetViewFilter'))?localStorage.getItem('jlrFleetViewFilter'):'all';
  const DEFAULT_CALC = { boosterCharacterId:'', boosterFittingId:'', mindlink:true };
  function loadCalc(){try{return{...DEFAULT_CALC,...JSON.parse(localStorage.getItem('jlrMiningCalc')||'{}')}}catch{return{...DEFAULT_CALC}}}
  let calcSettings=loadCalc();
  delete calcSettings.efficiencyCharge;
  delete calcSettings.minerCharacterId;
  delete calcSettings.fittingId;
  delete calcSettings.crystal;
  let iceTrackType=localStorage.getItem('jlrIceType')||'Blue Ice IV-Grade';
  let gasRegion=localStorage.getItem('jlrGasRegion')||'Fountain';
  let gasType=localStorage.getItem('jlrGasType')||'Celadon Cytoserocin';
  let doctrineMarket=null;
  let doctrineMarketLoading=false;
  let doctrineMarketError='';
  let doctrineMarketPoll=null;
  let doctrineView=['restock','seed','alerts','all'].includes(localStorage.getItem('jlrDoctrineView'))?localStorage.getItem('jlrDoctrineView'):'restock';
  let doctrineSearch='';
  let doctrineClass='all';
  let doctrineCategory='all';
  function loadDoctrineShoppingList(){
    try{
      const rows=JSON.parse(localStorage.getItem('jlrDoctrineShoppingList')||'[]');
      return Array.isArray(rows)?rows
        .map(row=>({typeId:Number(row?.typeId)||0,qty:Math.max(1,Math.floor(Number(row?.qty)||1))}))
        .filter(row=>row.typeId):[];
    }catch{return[]}
  }
  let doctrineShoppingList=loadDoctrineShoppingList();
  let doctrineShoppingMode=localStorage.getItem('jlrDoctrineShoppingMode')==='shortfall'?'shortfall':'full';
  let doctrineShoppingOpen=localStorage.getItem('jlrDoctrineShoppingOpen')==='true';
  let oreTrendType=localStorage.getItem('jlrOreTrend')||'Kylixium';
  const savedFleetHistoryDays=Number(localStorage.getItem('jlrFleetHistoryDays'));
  let fleetHistoryDays=[7,30,90].includes(savedFleetHistoryDays)?savedFleetHistoryDays:7;
  let fleetHistoryMetric=localStorage.getItem('jlrFleetHistoryMetric')==='value'?'value':'m3';
  let targetOre=localStorage.getItem('jlrTargetOre')||'auto';
  const BOARD_SIZES=['small','medium','large'];
  function normalizeBoardKey(value){
    const key=String(value||'');
    return key.includes(':')?key:`t3:${key}`;
  }
  function loadBoardPrefs(){
    try{
      const raw=JSON.parse(localStorage.getItem('jlrFieldBoard')||'{}');
      return {
        order:Array.isArray(raw.order)?raw.order.map(normalizeBoardKey):[],
        favorites:Array.isArray(raw.favorites)?raw.favorites.map(normalizeBoardKey):[],
        size:BOARD_SIZES.includes(raw.size)?raw.size:'medium',
      };
    }catch{return{order:[],favorites:[],size:'medium'}}
  }
  let boardPrefs=loadBoardPrefs();
  let boardArrangeMode=false;
  let boardDragKey='';
  let boardSuppressClickUntil=0;
  const statusText = {ready:'GREEN • MINEABLE',picked:'YELLOW • PICKED',cleared:'RED • RESPAWN'};

  function applyTheme(theme){
    const next=THEME_IDS.has(theme)?theme:'void';
    activeTheme=next;
    document.documentElement.dataset.theme=next;
    localStorage.setItem('jlrTheme',next);
    const select=$('themeSelect');
    if(select&&select.value!==next)select.value=next;
  }

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
    if (!iso) return 'NO TIMER';
    let s = Math.max(0, Math.floor((Date.parse(iso)-Date.now())/1000));
    const h=Math.floor(s/3600); s%=3600; const m=Math.floor(s/60); s%=60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function ago(iso) {
    if (!iso) return 'not yet'; const ms=Date.now()-Date.parse(iso); if(!Number.isFinite(ms))return 'time unavailable';
    const m=Math.max(0,Math.floor(ms/60000)); if(m<1)return 'just now'; if(m<60)return `${m}m ago`; const h=Math.floor(m/60); if(h<24)return `${h}h ${m%60}m ago`; return `${Math.floor(h/24)}d ago`;
  }
  function renderDataStatus(){
    const el=$('liveBadge');
    if(!el)return;
    if(state?.esi?.syncing){
      el.textContent='● SYNCING EVE DATA';
      el.title='Skills, saved fits, assets, and mining ledger are being refreshed.';
    }else if(state?.esi?.lastError){
      el.textContent='⚠ EVE SYNC ERROR';
      el.title=String(state.esi.lastError);
    }else if(state?.esi?.lastSyncAt){
      el.textContent='● EVE DATA '+ago(state.esi.lastSyncAt).toUpperCase();
      el.title='Latest successful EVE character-data sync: '+ago(state.esi.lastSyncAt)+'.';
    }else{
      el.textContent='● EVE DATA PENDING';
      el.title='No successful EVE character-data sync has completed yet.';
    }
  }
  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function toast(msg){$('toast').textContent=msg;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),3000)}
  function setScanStatus(message,tone=''){
    const el=$('scanStatus');
    if(!el)return;
    el.textContent=message;
    el.className=tone;
  }

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
  function updateSoundStatus(){
    const button=$('soundStatus');
    if(!button)return;
    button.textContent=soundEnabled?'SOUND ON':'SOUND OFF';
    button.classList.toggle('active',soundEnabled);
    button.setAttribute('aria-pressed',String(soundEnabled));
    button.title=soundEnabled?'Sounds are on. Click to turn them off.':'Sounds are off. Click to turn them on.';
  }
  function unlockAudio(){
    if(audioUnlocked&&audio)return audio;
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return null;
    audio=new AC();
    audioUnlocked=true;
    audio.addEventListener('statechange',updateSoundStatus);
    updateSoundStatus();
    return audio;
  }
  function tryResumeAudio(){
    if(!audio||audio.state!=='suspended'||audioResumePending)return;
    audioResumePending=true;
    // Installed apps and previously approved sites may allow this immediately.
    // If a browser blocks it, keep at most one pending request and retry on a gesture.
    audio.resume().catch(()=>{}).finally(()=>{
      audioResumePending=false;
      updateSoundStatus();
    });
  }
  function sfx(kind='click'){
    if(!soundEnabled)return false;
    unlockAudio();
    if(!audio)return false;
    // Attempt to resume without queuing a sound: a blocked resume may not
    // resolve until the next click, when this old hover cue would be stale.
    tryResumeAudio();
    if(audio.state!=='running')return false;

    const o=audio.createOscillator(),g=audio.createGain(),n=audio.currentTime;
    o.connect(g);g.connect(audio.destination);
    if(kind==='hover'){
      o.type='sine';o.frequency.setValueAtTime(560,n);o.frequency.exponentialRampToValueAtTime(710,n+.045);
      g.gain.setValueAtTime(.018,n);g.gain.exponentialRampToValueAtTime(.001,n+.060);o.start(n);o.stop(n+.065);
    }else if(kind==='threatHover'){
      // Short scanner/targeting chirp for moving across threat intel readouts.
      o.type='triangle';o.frequency.setValueAtTime(820,n);o.frequency.exponentialRampToValueAtTime(1080,n+.035);
      g.gain.setValueAtTime(.025,n);g.gain.exponentialRampToValueAtTime(.001,n+.055);o.start(n);o.stop(n+.060);
    }else if(kind==='systemHover'){
      o.type='triangle';o.frequency.setValueAtTime(470,n);o.frequency.exponentialRampToValueAtTime(680,n+.07);
      g.gain.setValueAtTime(.035,n);g.gain.exponentialRampToValueAtTime(.001,n+.090);o.start(n);o.stop(n+.095);
    }else if(kind==='systemSelect'){
      o.type='triangle';o.frequency.setValueAtTime(350,n);o.frequency.exponentialRampToValueAtTime(760,n+.10);
      g.gain.setValueAtTime(.034,n);g.gain.exponentialRampToValueAtTime(.001,n+.13);o.start(n);o.stop(n+.135);
    }else if(kind==='selectOpen'){
      o.type='sine';o.frequency.setValueAtTime(330,n);o.frequency.exponentialRampToValueAtTime(430,n+.045);
      g.gain.setValueAtTime(.030,n);g.gain.exponentialRampToValueAtTime(.001,n+.065);o.start(n);o.stop(n+.070);
    }else if(kind==='select'){
      o.type='triangle';o.frequency.setValueAtTime(540,n);o.frequency.exponentialRampToValueAtTime(930,n+.09);
      g.gain.setValueAtTime(.045,n);g.gain.exponentialRampToValueAtTime(.001,n+.12);o.start(n);o.stop(n+.125);
    }else if(kind==='selectPreview'){
      o.type='sine';o.frequency.setValueAtTime(610,n);o.frequency.exponentialRampToValueAtTime(790,n+.055);
      g.gain.setValueAtTime(.032,n);g.gain.exponentialRampToValueAtTime(.001,n+.075);o.start(n);o.stop(n+.080);
    }else if(kind==='toggleOn'){
      o.type='square';o.frequency.setValueAtTime(310,n);o.frequency.exponentialRampToValueAtTime(540,n+.065);
      g.gain.setValueAtTime(.040,n);g.gain.exponentialRampToValueAtTime(.001,n+.100);o.start(n);o.stop(n+.105);
    }else if(kind==='toggleOff'){
      o.type='square';o.frequency.setValueAtTime(420,n);o.frequency.exponentialRampToValueAtTime(230,n+.065);
      g.gain.setValueAtTime(.040,n);g.gain.exponentialRampToValueAtTime(.001,n+.100);o.start(n);o.stop(n+.105);
    }else if(kind==='toggle'){
      o.type='square';o.frequency.setValueAtTime(250,n);o.frequency.exponentialRampToValueAtTime(430,n+.055);
      g.gain.setValueAtTime(.020,n);g.gain.exponentialRampToValueAtTime(.001,n+.075);o.start(n);o.stop(n+.08);
    }else if(kind==='timer'){
      o.type='sawtooth';o.frequency.setValueAtTime(330,n);o.frequency.exponentialRampToValueAtTime(100,n+.14);
      g.gain.setValueAtTime(.025,n);g.gain.exponentialRampToValueAtTime(.001,n+.15);o.start(n);o.stop(n+.16);
    }else{
      o.type='square';o.frequency.setValueAtTime(290,n);o.frequency.exponentialRampToValueAtTime(470,n+.05);
      g.gain.setValueAtTime(.014,n);g.gain.exponentialRampToValueAtTime(.001,n+.07);o.start(n);o.stop(n+.08);
    }
    return true;
  }
  let systemHoverKey='';
  // Try on load when sound is enabled so a site/app with audio permission can
  // play the first hover. The user's mute preference persists in this browser.
  if(soundEnabled){
    unlockAudio();
    tryResumeAudio();
  }
  updateSoundStatus();

  // Browsers can block WebAudio until a real user gesture. Prime on pointer/key
  // down before opening a menu, and show the current state in the header.
  async function primeAudioFromGesture(e){
    if(!soundEnabled)return false;
    unlockAudio();
    if(audio?.state==='suspended'){
      try{await audio.resume()}catch{}
    }
    updateSoundStatus();
    if(audio?.state!=='running')return false;

    const target=e?.target;
    if(target?.matches?.('select')&&(e.type==='pointerdown'||(target.matches(audibleSelects)&&soundMenu?.select!==target)))sfx('selectOpen');
    return true;
  }
  document.addEventListener('pointerdown',primeAudioFromGesture,{capture:true});
  document.addEventListener('keydown',(e)=>{
    if(e.key==='Enter'||e.key===' '||e.key==='ArrowUp'||e.key==='ArrowDown')primeAudioFromGesture(e);
  },{capture:true});

  document.addEventListener('pointerover',(e)=>{
    if(e.target.closest('.sound-menu'))return;
    const threatReadout=e.target.closest('.threat-table-v2 tbody td');
    if(threatReadout){
      const previous=e.relatedTarget?.closest?.('.threat-table-v2 tbody td');
      if(previous!==threatReadout)sfx('threatHover');
      return;
    }
    const system=e.target.closest('.system-node');
    if(system){
      const key=system.dataset.system||system.querySelector('.sys-name')?.textContent||'system';
      if(key!==systemHoverKey){
        const played=sfx('systemHover');
        if(played)systemHoverKey=key;
      }
      return;
    }
    const target=e.target.closest('button,summary,.app-tab,select,.fleet-member-toggle');
    if(!target)return;
    const previous=e.relatedTarget?.closest?.('button,summary,.app-tab,select,.fleet-member-toggle');
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
    if(e.target.closest('.sound-menu'))return;
    if(e.target.closest('#soundStatus'))return;
    if(e.target.closest('.system-node')){sfx('systemSelect');return}
    if(e.target.closest('button,summary,.app-tab'))sfx('click');
  });
  $('soundStatus').addEventListener('click',async()=>{
    soundEnabled=!soundEnabled;
    localStorage.setItem('jlrSoundEnabled',String(soundEnabled));
    if(soundEnabled){
      unlockAudio();
      if(audio?.state==='suspended'){
        try{await audio.resume()}catch{}
      }
      updateSoundStatus();
      sfx('select');
    }else{
      updateSoundStatus();
    }
  });

  // Listen to both input and change because native select behavior differs by
  // browser/OS. De-dupe the pair so one selection produces one commit tone.
  const controlSoundState=new WeakMap();
  function controlSound(e){
    const target=e.target;
    if(!target?.matches?.('select,input[type="checkbox"],input[type="radio"]'))return;
    const signature=target.matches('select')?`select:${target.value}`:`toggle:${target.checked}`;
    const previous=controlSoundState.get(target);
    const stamp=performance.now();
    if(previous&&previous.signature===signature&&stamp-previous.stamp<180)return;
    controlSoundState.set(target,{signature,stamp});
    if(target.matches('select'))sfx('select');
    else sfx(target.checked?'toggleOn':'toggleOff');
  }
  document.addEventListener('input',controlSound,{capture:true});
  document.addEventListener('change',controlSound,{capture:true});

  // Native <select> popups are drawn by the browser/OS, so moving over their
  // options does not produce page events. Use an app-owned popup for the fit
  // and booster selectors while retaining their existing change handlers.
  const audibleSelects='#calcBoosterCharacter,#calcBoosterFitting,.fleet-fit-select,#doctrineClass,#doctrineCategory,#themeSelect';
  let soundMenu=null, soundMenuSerial=0;
  function closeSoundMenu(refocus=false){
    if(!soundMenu)return;
    const {select,popup}=soundMenu;
    soundMenu=null;
    popup.remove();
    select.removeAttribute('aria-expanded');
    select.removeAttribute('aria-controls');
    select.removeAttribute('aria-activedescendant');
    if(refocus&&select.isConnected)select.focus({preventScroll:true});
  }
  function highlightSoundOption(index,preview=false){
    if(!soundMenu||index<0||soundMenu.select.options[index]?.disabled)return;
    const {popup,select}=soundMenu;
    const button=popup.querySelector(`[data-index="${index}"]`);
    if(!button)return;
    popup.querySelector('.active')?.classList.remove('active');
    button.classList.add('active');
    select.setAttribute('aria-activedescendant',button.id);
    if(preview&&soundMenu.lastPreviewIndex!==index){
      sfx('selectPreview');
      soundMenu.lastPreviewIndex=index;
    }
    soundMenu.activeIndex=index;
    button.scrollIntoView({block:'nearest'});
  }
  function openSoundMenu(select){
    if(select.disabled||!select.options.length)return;
    closeSoundMenu();
    const popup=document.createElement('div');
    const id=`sound-menu-${++soundMenuSerial}`;
    popup.className='sound-menu';popup.id=id;popup.setAttribute('role','listbox');
    if(select.id==='themeSelect')popup.classList.add('theme-menu');
    popup.setAttribute('aria-label',select.labels?.[0]?.querySelector('span')?.textContent?.trim()||select.getAttribute('aria-label')||'Saved mining fit');
    Array.from(select.options).forEach((option,index)=>{
      const button=document.createElement('button');
      button.type='button';button.className='sound-menu-option';button.id=`${id}-option-${index}`;
      button.dataset.index=String(index);button.setAttribute('role','option');
      button.setAttribute('aria-selected',String(index===select.selectedIndex));
      button.textContent=option.textContent;button.disabled=option.disabled;
      if(select.id==='themeSelect')button.dataset.themeValue=String(option.value||'');
      popup.appendChild(button);
    });
    document.body.appendChild(popup);
    soundMenu={select,popup,activeIndex:-1,lastPreviewIndex:-1};
    select.setAttribute('aria-expanded','true');select.setAttribute('aria-controls',id);
    select.focus({preventScroll:true});
    const rect=select.getBoundingClientRect();
    const width=Math.min(window.innerWidth-16,select.id==='themeSelect'?Math.max(rect.width,170):Math.max(rect.width,270));
    popup.style.width=`${width}px`;
    popup.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-width-8))}px`;
    const height=popup.offsetHeight,spaceBelow=window.innerHeight-rect.bottom-8,spaceAbove=rect.top-8;
    const above=spaceBelow<Math.min(height,220)&&spaceAbove>spaceBelow;
    popup.style.top=`${above?Math.max(8,rect.top-height-4):Math.min(rect.bottom+4,window.innerHeight-height-8)}px`;
    const selected=select.selectedIndex;
    highlightSoundOption(selected>=0&&!select.options[selected].disabled?selected:Array.from(select.options).findIndex(o=>!o.disabled));

    // Keep focus on the select so arrow keys, Escape and Tab keep working.
    popup.addEventListener('pointerdown',e=>e.preventDefault());
    popup.addEventListener('pointerover',e=>{
      const option=e.target.closest('.sound-menu-option');
      if(option&&!option.disabled)highlightSoundOption(Number(option.dataset.index),true);
    });
    popup.addEventListener('click',e=>{
      const option=e.target.closest('.sound-menu-option');
      if(option&&!option.disabled)commitSoundOption(Number(option.dataset.index));
    });
  }
  function commitSoundOption(index){
    if(!soundMenu)return;
    const {select}=soundMenu,option=select.options[index];
    if(!option||option.disabled)return;
    const changed=select.value!==option.value;
    select.value=option.value;
    closeSoundMenu(true);
    if(changed){
      select.dispatchEvent(new Event('input',{bubbles:true}));
      select.dispatchEvent(new Event('change',{bubbles:true}));
    }else sfx('select');
  }
  document.addEventListener('pointerdown',e=>{
    const select=e.target.closest?.(audibleSelects);
    if(select&&e.pointerType!=='touch'&&e.button===0){
      e.preventDefault();
      if(soundMenu?.select===select)closeSoundMenu(true);
      else openSoundMenu(select);
    }else if(soundMenu&&!soundMenu.popup.contains(e.target))closeSoundMenu();
  },{capture:true});
  document.addEventListener('keydown',e=>{
    const select=e.target.closest?.(audibleSelects);
    if(!select||select.disabled)return;
    if(e.key==='Tab'){closeSoundMenu();return}
    if(e.key==='Escape'&&soundMenu?.select===select){e.preventDefault();closeSoundMenu(true);return}
    if(!['Enter',' ','ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
    e.preventDefault();
    if(soundMenu?.select!==select){openSoundMenu(select);return}
    if(e.key==='Enter'||e.key===' '){commitSoundOption(soundMenu.activeIndex);return}
    const available=Array.from(select.options).map((o,i)=>o.disabled?-1:i).filter(i=>i>=0);
    if(!available.length)return;
    const current=available.indexOf(soundMenu.activeIndex);
    const next=e.key==='Home'?available[0]:e.key==='End'?available.at(-1):
      available[(current+(e.key==='ArrowDown'?1:available.length-1))%available.length];
    highlightSoundOption(next,true);
  },{capture:true});
  document.addEventListener('focusin',e=>{
    if(soundMenu&&e.target!==soundMenu.select&&!soundMenu.popup.contains(e.target))closeSoundMenu();
  });
  window.addEventListener('resize',()=>closeSoundMenu());

  async function api(url, options={}) {
    const headers={...(options.headers||{})}; if(options.body&&!headers['Content-Type'])headers['Content-Type']='application/json';
    const r=await fetch(url,{...options,headers,credentials:'same-origin'}); const ct=r.headers.get('content-type')||''; const p=ct.includes('application/json')?await r.json():await r.text();
    if(r.status===401){showLogin();throw new Error('Please log in with EVE Online.')} if(!r.ok)throw new Error(p?.message||p?.error||p||`Request failed ${r.status}`); return p;
  }

  function showLogin(){$('app').classList.add('hidden');$('loginView').classList.remove('hidden');}
  function showApp(){$('loginView').classList.add('hidden');$('app').classList.remove('hidden');}
  let activeTab=localStorage.getItem('jlrTab')||'fields';
  function doctrineAllowed(){return Boolean(me?.doctrineMarketAccess?.allowed)}
  function syncDoctrineTabAccess(){
    const button=document.querySelector('.app-tab[data-tab="doctrine"]');
    const allowed=doctrineAllowed();
    if(button){
      button.classList.toggle('hidden',!allowed);
      button.setAttribute('aria-hidden',String(!allowed));
      button.title=allowed
        ?(me?.doctrineMarketAccess?.reason==='INIT_MEMBER'?'INIT member verified':'INIT blue verified')
        :'Requires a linked INIT or INIT-blue character';
    }
    if(!allowed&&activeTab==='doctrine'){
      activeTab='fields';
      localStorage.setItem('jlrTab',activeTab);
    }
  }
  function applyTab(tab){
    const valid=['fields','fleet','performance','ice','gas','pvp','threat','mer','toons'];
    if(doctrineAllowed())valid.splice(5,0,'doctrine');
    activeTab=valid.includes(tab)?tab:'fields';
    localStorage.setItem('jlrTab',activeTab);
    document.querySelectorAll('.app-tab').forEach(button=>button.classList.toggle('active',button.dataset.tab===activeTab));
    document.querySelectorAll('.tab-panel').forEach(panel=>panel.classList.toggle('active',panel.dataset.tab===activeTab));
    if(activeTab!=='pvp'&&pvpIntelPoll){clearTimeout(pvpIntelPoll);pvpIntelPoll=null}
    if(activeTab==='doctrine'&&!doctrineMarket&&!doctrineMarketLoading)loadDoctrineMarket();
    if(activeTab==='pvp'&&!pvpIntel&&!pvpIntelLoading)loadPvpIntel();
    if(activeTab==='threat')renderThreatScan();
  }
  function initTabs(){
    const host=$('tabHost');
    if(!host||host.dataset.ready==='1')return;
    host.dataset.ready='1';

    const makePanel=(name)=>{
      const panel=document.createElement('div');
      panel.className='tab-panel';
      panel.dataset.tab=name;
      host.appendChild(panel);
      return panel;
    };
    const fields=makePanel('fields');
    const fleet=makePanel('fleet');
    const performance=makePanel('performance');
    const ice=makePanel('ice');
    const gas=makePanel('gas');
    const doctrine=makePanel('doctrine');
    doctrine.id='doctrineMarketPanel';
    const pvp=makePanel('pvp');
    pvp.id='pvpIntelPanel';
    const threat=makePanel('threat');
    threat.id='threatScanPanel';
    const mer=makePanel('mer');
    mer.id='merIntelPanel';
    const toons=makePanel('toons');

    const quick=document.querySelector('.quick-update');
    const calculator=document.querySelector('.shared-calculator');
    const timers=document.querySelector('.timers-panel');
    const board=document.querySelector('.board-panel');
    const hits=document.querySelector('.hit-panel');
    const fieldSidebar=document.createElement('div');
    fieldSidebar.className='field-sidebar';
    [quick,timers].filter(Boolean).forEach(el=>fieldSidebar.appendChild(el));
    if(fieldSidebar.children.length)fields.appendChild(fieldSidebar);
    [board,hits].filter(Boolean).forEach(el=>fields.appendChild(el));

    const advanced=document.createElement('div');
    advanced.className='tab-advanced expanded-grid';
    const ranking=document.querySelector('.ranking-panel');
    if(ranking)advanced.appendChild(ranking);
    if(advanced.children.length)fields.appendChild(advanced);

    const setup=document.querySelector('.setup-drawer');
    [setup,calculator].filter(Boolean).forEach(el=>fleet.appendChild(el));

    const command=document.querySelector('.fleet-command-panel');
    const visuals=document.querySelector('.mining-visuals-panel');
    const actual=document.querySelector('.actual-panel');
    [command,visuals,actual].filter(Boolean).forEach(el=>performance.appendChild(el));

    const icePanel=document.querySelector('.ice-mining-panel');
    if(icePanel)ice.appendChild(icePanel);
    const gasPanel=document.querySelector('.gas-huffing-panel');
    if(gasPanel)gas.appendChild(gasPanel);

    const toonPanel=document.querySelector('.esi-panel');
    if(toonPanel)toons.appendChild(toonPanel);

    document.querySelector('.compact-row')?.remove();
    $('expandedArea')?.remove();

    document.querySelectorAll('.app-tab').forEach(button=>button.addEventListener('click',()=>applyTab(button.dataset.tab)));
    applyTab(activeTab);
  }

  async function loadDoctrineMarket(force=false){
    if(!doctrineAllowed()){
      doctrineMarket=null;
      doctrineMarketError='Doctrine Market requires a linked INIT or INIT-blue character.';
      renderDoctrineMarket();
      return;
    }
    if(doctrineMarketLoading)return;
    doctrineMarketLoading=true;doctrineMarketError='';
    if(doctrineMarketPoll){clearTimeout(doctrineMarketPoll);doctrineMarketPoll=null}
    renderDoctrineMarket();
    let shouldPoll=false;
    try{
      const payload=force
        ?await api('/api/doctrine-market/refresh',{method:'POST',body:'{}'})
        :await api('/api/doctrine-market');
      doctrineMarket=payload;
      shouldPoll=Boolean(payload?.status?.refreshing);
    }catch(error){
      console.error('Doctrine Market load failed',error);
      doctrineMarketError='Doctrine market data is temporarily unavailable. Try again in a moment.';
    }finally{
      doctrineMarketLoading=false;
      renderDoctrineMarket();
      if(shouldPoll&&activeTab==='doctrine'){
        doctrineMarketPoll=setTimeout(()=>loadDoctrineMarket(false),5000);
      }
    }
  }
  function doctrinePercent(value){
    const n=Number(value);
    return Number.isFinite(n)?(n*100).toFixed(Math.abs(n)>=1?0:1)+'%':'—';
  }
  function doctrineMoney(value){
    const n=Number(value);
    return Number.isFinite(n)&&n!==0?fmt(n)+' ISK':'—';
  }
  function doctrineState(row){
    if(row.stock<=0)return{key:'zero',label:'ZERO STOCK'};
    if(row.daysDynamic<2)return{key:'critical',label:'< 2 DAYS'};
    if(row.daysDynamic<7)return{key:'low',label:'LOW'};
    if(row.required>0)return{key:'restock',label:'RESTOCK'};
    return{key:'healthy',label:'OK'};
  }
  function saveDoctrineShoppingList(){
    localStorage.setItem('jlrDoctrineShoppingList',JSON.stringify(doctrineShoppingList));
  }
  function doctrineSevenDayTarget(row){
    return Math.max(1,Math.ceil(Math.max(.01,Number(row?.sold7)||.01)*7));
  }
  function doctrineShoppingQty(row,mode=doctrineShoppingMode){
    const target=doctrineSevenDayTarget(row);
    if(mode==='shortfall')return Math.max(0,target-Math.max(0,Math.floor(Number(row?.stock)||0)));
    return target;
  }
  function recalculateDoctrineShoppingList(){
    const byId=new Map((doctrineMarket?.rows||[]).map(row=>[Number(row.typeId),row]));
    let removed=0,updated=0;
    doctrineShoppingList=doctrineShoppingList.map(item=>{
      const row=byId.get(Number(item.typeId));
      if(!row)return null;
      const qty=doctrineShoppingQty(row);
      if(qty<=0){removed++;return null}
      if(Number(item.qty)!==qty)updated++;
      return{typeId:Number(item.typeId),qty};
    }).filter(Boolean);
    saveDoctrineShoppingList();
    renderDoctrineMarket();
    const mode=doctrineShoppingMode==='shortfall'?'7-day shortfall':'full 7-day supply';
    toast('Shopping list recalculated for '+mode+'.'+(removed?' '+removed+' covered item'+(removed===1?'':'s')+' removed.':''));
  }
  function addDoctrineShoppingItem(typeId){
    const id=Number(typeId);
    const row=(doctrineMarket?.rows||[]).find(item=>Number(item.typeId)===id);
    if(!row)return;
    const existing=doctrineShoppingList.find(item=>Number(item.typeId)===id);
    if(existing){
      toast(row.item+' is already on the shopping list.');
      return;
    }
    const qty=doctrineShoppingQty(row);
    if(qty<=0){
      toast(row.item+' already has at least 7 days of stock in C-N.');
      return;
    }
    doctrineShoppingList.push({typeId:id,qty});
    saveDoctrineShoppingList();
    renderDoctrineMarket();
    toast(row.item+' added at '+(doctrineShoppingMode==='shortfall'?'the 7-day shortfall':'a full 7-day supply')+'.');
  }
  function removeDoctrineShoppingItem(typeId){
    const id=Number(typeId);
    doctrineShoppingList=doctrineShoppingList.filter(item=>Number(item.typeId)!==id);
    saveDoctrineShoppingList();
    renderDoctrineMarket();
  }
  async function copyDoctrineMultibuy(){
    const byId=new Map((doctrineMarket?.rows||[]).map(row=>[Number(row.typeId),row]));
    const lines=doctrineShoppingList.map(item=>{
      const row=byId.get(Number(item.typeId));
      if(!row)return null;
      return row.item+'\t'+Math.max(1,Math.floor(Number(item.qty)||1));
    }).filter(Boolean);
    if(!lines.length){toast('Add items to the shopping list first.');return}
    const text=lines.join('\n');
    let copied=false;
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(text);
        copied=true;
      }
    }catch{}
    if(!copied){
      try{
        const helper=document.createElement('textarea');
        helper.value=text;
        helper.setAttribute('readonly','');
        helper.setAttribute('aria-hidden','true');
        helper.style.position='fixed';
        helper.style.left='-9999px';
        helper.style.opacity='0';
        document.body.appendChild(helper);
        helper.focus();
        helper.select();
        copied=document.execCommand('copy');
        helper.remove();
      }catch{}
    }
    toast(copied?'Shopping list copied. Paste it into EVE Multi-Buy.':'Could not copy automatically.');
  }
  function renderDoctrineMarket(){
    const host=$('doctrineMarketPanel');
    if(!host)return;
    if(doctrineMarketLoading&&!doctrineMarket){
      host.innerHTML='<section class="glass doctrine-loading"><strong>LOADING DOCTRINE MARKET…</strong><span>Loading current doctrine market data.</span></section>';
      return;
    }
    if(doctrineMarketError){
      host.innerHTML='<section class="glass doctrine-error"><strong>DOCTRINE MARKET UNAVAILABLE</strong><span>'+esc(doctrineMarketError)+'</span><button id="doctrineRetry" class="orb blue" type="button">TRY AGAIN</button></section>';
      $('doctrineRetry')?.addEventListener('click',()=>loadDoctrineMarket(true));
      return;
    }
    if(!doctrineMarket){
      host.innerHTML='<section class="glass doctrine-loading">Open this tab to load doctrine market data.</section>';
      return;
    }

    const summary=doctrineMarket.summary||{};
    const allRows=doctrineMarket.rows||[];
    const classes=[...new Set(allRows.map(x=>x.classification).filter(Boolean))].sort();
    const categories=[...new Set(allRows.map(x=>x.category).filter(Boolean))].sort();
    const q=doctrineSearch.trim().toLowerCase();

    let rows=allRows.filter(row=>{
      if(doctrineClass!=='all'&&row.classification!==doctrineClass)return false;
      if(doctrineCategory!=='all'&&row.category!==doctrineCategory)return false;
      if(q&&!row.item.toLowerCase().includes(q)&&!String(row.typeId).includes(q))return false;
      if(doctrineView==='restock')return row.required>0;
      if(doctrineView==='seed')return row.seedMargin>0&&row.cnSell>0&&row.jitaSell>0;
      if(doctrineView==='alerts')return row.cnJita>1.3;
      return true;
    });

    if(doctrineView==='restock'){
      rows.sort((a,b)=>
        Number(b.stock<=0)-Number(a.stock<=0)||
        a.daysDynamic-b.daysDynamic||
        b.required-a.required||
        a.item.localeCompare(b.item)
      );
    }else if(doctrineView==='seed'){
      rows.sort((a,b)=>b.seedMargin-a.seedMargin||b.seed10Profit-a.seed10Profit||a.item.localeCompare(b.item));
    }else if(doctrineView==='alerts'){
      rows.sort((a,b)=>b.cnJita-a.cnJita||a.daysDynamic-b.daysDynamic||a.item.localeCompare(b.item));
    }else{
      rows.sort((a,b)=>a.item.localeCompare(b.item));
    }

    const display=rows.slice(0,200);
    const tableRows=display.map(row=>{
      const state=doctrineState(row);
      const ratio=row.cnJita>0?row.cnJita.toFixed(2)+'x':'—';
      const required=row.required>0?fmt(row.required):'—';
      return '<tr class="doctrine-row doctrine-'+state.key+'" draggable="true" data-doctrine-type-id="'+esc(String(row.typeId))+'" title="Drag to Shopping List">'+
        '<td><span class="doctrine-state '+state.key+'">'+esc(state.label)+'</span></td>'+
        '<td class="doctrine-item"><div class="doctrine-item-main"><div><strong>'+esc(row.item)+'</strong><small>'+esc(row.classification)+' • '+esc(row.category)+' • ID '+esc(String(row.typeId))+'</small></div><button class="doctrine-list-add" type="button" data-add-doctrine="'+esc(String(row.typeId))+'" title="Add 7-day supply to Shopping List">ADD</button></div></td>'+
        '<td><strong>'+fmt(row.stock)+'</strong></td>'+
        '<td>'+row.sold7.toFixed(1)+'</td>'+
        '<td>'+row.sold30.toFixed(1)+'</td>'+
        '<td><strong>'+row.daysDynamic.toFixed(1)+'</strong><small>std '+row.daysStandard.toFixed(1)+'</small></td>'+
        '<td><strong class="'+(row.required>0?'negative':'')+'">'+required+'</strong></td>'+
        '<td>'+doctrineMoney(row.cnSell)+'</td>'+
        '<td>'+doctrineMoney(row.jitaSell)+'</td>'+
        '<td><strong class="'+(row.cnJita>1.3?'negative':row.cnJita>0&&row.cnJita<1?'positive':'')+'">'+ratio+'</strong></td>'+
        '<td><strong class="'+(row.seedMargin>0?'positive':'negative')+'">'+doctrinePercent(row.seedMargin)+'</strong><small>'+doctrineMoney(row.breakeven)+'</small></td>'+
      '</tr>';
    }).join('');

    const marketById=new Map(allRows.map(row=>[Number(row.typeId),row]));
    const shoppingRows=doctrineShoppingList.map(item=>{
      const row=marketById.get(Number(item.typeId));
      return row?{...item,row}:null;
    }).filter(Boolean);
    const shoppingJitaTotal=shoppingRows.reduce((sum,item)=>sum+Math.max(1,Number(item.qty)||1)*Math.max(0,Number(item.row.jitaSell)||0),0);
    const shoppingHtml=shoppingRows.map(item=>{
      const target=doctrineSevenDayTarget(item.row);
      const shortfall=doctrineShoppingQty(item.row,'shortfall');
      return '<div class="doctrine-shop-row" draggable="true" data-shop-type-id="'+esc(String(item.typeId))+'">'+
        '<div class="doctrine-shop-name"><strong>'+esc(item.row.item)+'</strong><small>7D target '+fmt(target)+' • shortfall '+fmt(shortfall)+' • '+item.row.sold7.toFixed(1)+'/day</small></div>'+
        '<label class="doctrine-shop-qty"><span>QTY</span><input type="number" min="1" step="1" value="'+Math.max(1,Math.floor(Number(item.qty)||1))+'" data-shop-qty="'+esc(String(item.typeId))+'" aria-label="Quantity for '+esc(item.row.item)+'"></label>'+
        '<button class="doctrine-shop-remove" type="button" data-remove-doctrine="'+esc(String(item.typeId))+'" aria-label="Remove '+esc(item.row.item)+'">REMOVE</button>'+
      '</div>';
    }).join('');
    const status=doctrineMarket.status||{};
    const refreshing=Boolean(status.refreshing||doctrineMarketLoading);
    host.innerHTML=`
      <section class="glass doctrine-shell">
        <div class="doctrine-hero">
          <div>
            <span class="eyebrow">INITIATIVE • DOCTRINE MARKET</span>
            <strong>DOCTRINE MARKET INTEL</strong>
            <small>C-N stock • Fountain demand • Jita pricing</small>
          </div>
          <button id="doctrineRefresh" class="board-tool" type="button" ${refreshing?'disabled':''}>${refreshing?'REFRESHING…':'REFRESH LIVE'}</button>
        </div>

        <div class="doctrine-kpis">
          <article><span>TRACKED ITEMS</span><strong>${fmt(summary.count||allRows.length)}</strong><small>full doctrine-market list</small></article>
          <article><span>RESTOCK NEEDED</span><strong>${fmt(summary.need)}</strong><small>required quantity above zero</small></article>
          <article class="critical"><span>UNDER 2 DAYS</span><strong>${fmt(summary.under2)}</strong><small>dynamic days of supply</small></article>
          <article class="critical"><span>ZERO STOCK</span><strong>${fmt(summary.zero)}</strong><small>currently unavailable</small></article>
          <article><span>PRICE ALERTS</span><strong>${fmt(summary.alerts)}</strong><small>C-N above 130% of Jita</small></article>
          <article><span>SEED TO 30D</span><strong>${fmt(summary.seed30)} ISK</strong><small>tracker estimate</small></article>
        </div>

        <div class="doctrine-command">
          <div class="doctrine-modes" role="group" aria-label="Doctrine market view">
            <button class="doctrine-mode ${doctrineView==='restock'?'active':''}" data-doctrine-view="restock" type="button">PRIORITY RESTOCK</button>
            <button class="doctrine-mode ${doctrineView==='seed'?'active':''}" data-doctrine-view="seed" type="button">SEEDING OPPORTUNITIES</button>
            <button class="doctrine-mode ${doctrineView==='alerts'?'active':''}" data-doctrine-view="alerts" type="button">PRICE ALERTS</button>
            <button class="doctrine-mode ${doctrineView==='all'?'active':''}" data-doctrine-view="all" type="button">ALL ITEMS</button>
          </div>
          <div class="doctrine-filters">
            <label><span>SEARCH</span><input id="doctrineSearch" type="search" autocomplete="off" placeholder="Item or type ID…" value="${esc(doctrineSearch)}"></label>
            <label><span>CLASS</span><select id="doctrineClass"><option value="all">ALL</option>${classes.map(x=>'<option value="'+esc(x)+'" '+(doctrineClass===x?'selected':'')+'>'+esc(x.toUpperCase())+'</option>').join('')}</select></label>
            <label><span>TYPE</span><select id="doctrineCategory"><option value="all">ALL</option>${categories.map(x=>'<option value="'+esc(x)+'" '+(doctrineCategory===x?'selected':'')+'>'+esc(x.toUpperCase())+'</option>').join('')}</select></label>
          </div>
        </div>

        <div class="doctrine-summary-line">
          <strong>${fmt(rows.length)} MATCHING ITEMS</strong>
          <span>Showing ${fmt(display.length)}${rows.length>display.length?' of '+fmt(rows.length):''}</span>
        </div>

        <div class="doctrine-workspace">
          <div class="doctrine-table-wrap">
            <table class="doctrine-table">
              <thead><tr><th>STATE</th><th>ITEM</th><th>STOCK</th><th>7D/DAY</th><th>30D/DAY</th><th>DAYS</th><th>REQUIRED</th><th>C-N SELL</th><th>JITA SELL</th><th>C-N/JITA</th><th>SEED MARGIN</th></tr></thead>
              <tbody>${tableRows||'<tr><td colspan="11" class="doctrine-empty">No items match these filters.</td></tr>'}</tbody>
            </table>
          </div>

          <aside id="doctrineShoppingDrop" class="doctrine-shopping ${doctrineShoppingOpen?'open':'collapsed'}">
            <button id="doctrineShoppingToggle" class="doctrine-shopping-toggle" type="button" aria-expanded="${String(doctrineShoppingOpen)}">
              <div class="doctrine-shopping-toggle-title">
                <span>SHOPPING LIST</span>
                <strong>${fmt(shoppingRows.length)} ITEM${shoppingRows.length===1?'':'S'}</strong>
              </div>
              <div class="doctrine-shopping-toggle-summary">
                <span>${shoppingJitaTotal?fmt(shoppingJitaTotal)+' ISK':'EMPTY'}</span>
                <strong class="doctrine-shopping-chevron">${doctrineShoppingOpen?'▲':'▼'}</strong>
              </div>
            </button>
            <div class="doctrine-shopping-body" ${doctrineShoppingOpen?'':'hidden'}>
              <div class="doctrine-shopping-head">
                <span>${doctrineShoppingMode==='shortfall'?'7D SHORTFALL MODE':'FULL 7D SUPPLY MODE'}</span>
                <button id="doctrineShoppingClear" class="doctrine-shop-clear" type="button" ${shoppingRows.length?'':'disabled'}>CLEAR</button>
              </div>
              <div class="doctrine-shopping-mode">
                <div class="doctrine-shopping-mode-buttons" role="group" aria-label="Shopping list quantity mode">
                  <button class="${doctrineShoppingMode==='full'?'active':''}" data-shop-mode="full" type="button">FULL 7D SUPPLY</button>
                  <button class="${doctrineShoppingMode==='shortfall'?'active':''}" data-shop-mode="shortfall" type="button">7D SHORTFALL</button>
                </div>
                <button id="doctrineShoppingRecalc" class="doctrine-shopping-recalc" type="button" ${shoppingRows.length?'':'disabled'}>APPLY TO LIST</button>
              </div>
              <div class="doctrine-shopping-hint">${doctrineShoppingMode==='shortfall'?'New items buy only what C-N needs to reach seven days of stock.':'New items use a full seven days of demand.'}</div>
              <div class="doctrine-shopping-list">
                ${shoppingHtml||'<div class="doctrine-shopping-empty"><strong>DROP ITEMS HERE</strong><span>Or use ADD beside any doctrine item.</span></div>'}
              </div>
              <div class="doctrine-shopping-total">
                <span>EST. JITA TOTAL</span>
                <strong>${shoppingJitaTotal?fmt(shoppingJitaTotal)+' ISK':'—'}</strong>
              </div>
              <button id="doctrineShoppingCopy" class="doctrine-multibuy-copy" type="button" ${shoppingRows.length?'':'disabled'}>COPY FOR EVE MULTIBUY</button>
            </div>
          </aside>
        </div>

      </section>`;

    $('doctrineShoppingToggle')?.addEventListener('click',()=>{
      doctrineShoppingOpen=!doctrineShoppingOpen;
      localStorage.setItem('jlrDoctrineShoppingOpen',String(doctrineShoppingOpen));
      renderDoctrineMarket();
    });
    host.querySelectorAll('[data-add-doctrine]').forEach(button=>button.addEventListener('click',event=>{
      event.stopPropagation();
      addDoctrineShoppingItem(button.dataset.addDoctrine);
    }));
    host.querySelectorAll('.doctrine-row[data-doctrine-type-id]').forEach(row=>{
      row.addEventListener('dragstart',event=>{
        const id=row.dataset.doctrineTypeId;
        event.dataTransfer.effectAllowed='copy';
        event.dataTransfer.setData('text/plain',id);
        row.classList.add('dragging');
      });
      row.addEventListener('dragend',()=>row.classList.remove('dragging'));
    });
    const shopDrop=$('doctrineShoppingDrop');
    if(shopDrop){
      shopDrop.addEventListener('dragover',event=>{
        event.preventDefault();
        event.dataTransfer.dropEffect='copy';
        shopDrop.classList.add('drag-over');
      });
      shopDrop.addEventListener('dragleave',event=>{
        if(!shopDrop.contains(event.relatedTarget))shopDrop.classList.remove('drag-over');
      });
      shopDrop.addEventListener('drop',event=>{
        event.preventDefault();
        shopDrop.classList.remove('drag-over');
        addDoctrineShoppingItem(event.dataTransfer.getData('text/plain'));
      });
    }
    host.querySelectorAll('[data-shop-mode]').forEach(button=>button.addEventListener('click',()=>{
      doctrineShoppingMode=button.dataset.shopMode==='shortfall'?'shortfall':'full';
      localStorage.setItem('jlrDoctrineShoppingMode',doctrineShoppingMode);
      renderDoctrineMarket();
    }));
    $('doctrineShoppingRecalc')?.addEventListener('click',recalculateDoctrineShoppingList);
    host.querySelectorAll('[data-shop-qty]').forEach(input=>input.addEventListener('change',()=>{
      const item=doctrineShoppingList.find(row=>Number(row.typeId)===Number(input.dataset.shopQty));
      if(!item)return;
      item.qty=Math.max(1,Math.floor(Number(input.value)||1));
      saveDoctrineShoppingList();
      renderDoctrineMarket();
    }));
    host.querySelectorAll('[data-remove-doctrine]').forEach(button=>button.addEventListener('click',()=>removeDoctrineShoppingItem(button.dataset.removeDoctrine)));
    $('doctrineShoppingClear')?.addEventListener('click',()=>{
      doctrineShoppingList=[];
      saveDoctrineShoppingList();
      renderDoctrineMarket();
      toast('Shopping list cleared.');
    });
    $('doctrineShoppingCopy')?.addEventListener('click',copyDoctrineMultibuy);
    host.querySelectorAll('[data-doctrine-view]').forEach(button=>button.addEventListener('click',()=>{
      doctrineView=button.dataset.doctrineView;
      localStorage.setItem('jlrDoctrineView',doctrineView);
      renderDoctrineMarket();
    }));
    $('doctrineSearch')?.addEventListener('input',event=>{
      doctrineSearch=String(event.currentTarget.value||'');
      renderDoctrineMarket();
      requestAnimationFrame(()=>$('doctrineSearch')?.focus());
    });
    $('doctrineClass')?.addEventListener('change',event=>{doctrineClass=event.currentTarget.value||'all';renderDoctrineMarket()});
    $('doctrineCategory')?.addEventListener('change',event=>{doctrineCategory=event.currentTarget.value||'all';renderDoctrineMarket()});
    $('doctrineRefresh')?.addEventListener('click',()=>loadDoctrineMarket(true));
  }

  function ordinalRank(value){
    const n=Math.trunc(Number(value)||0);
    if(n<=0)return '—';
    const mod100=n%100;
    const mod10=n%10;
    const suffix=(mod100>=11&&mod100<=13)?'th':mod10===1?'st':mod10===2?'nd':mod10===3?'rd':'th';
    return `${n}${suffix}`;
  }
  function pvpRankBadge(rank,isMine=false){
    return `<span class="pvp-rank${isMine?' mine':''}">${ordinalRank(rank)}</span>`;
  }
  function renderPvpIntel(){
    const host=$('pvpIntelPanel');
    if(!host)return;
    if(pvpIntelLoading&&!pvpIntel){
      host.innerHTML='<section class="glass pvp-loading"><strong>BUILDING INIT 7-DAY LEADERBOARD…</strong><span>Reading cached zKillboard data or refreshing the shared alliance cache.</span></section>';
      return;
    }
    if(pvpIntelError){
      host.innerHTML=`<section class="glass pvp-error"><strong>INIT PVP LEADERBOARD UNAVAILABLE</strong><span>${esc(pvpIntelError)}</span><button id="pvpRetry" class="orb blue" type="button">TRY AGAIN</button></section>`;
      $('pvpRetry')?.addEventListener('click',()=>loadPvpIntel(true));
      return;
    }
    if(!pvpIntel){
      host.innerHTML='<section class="glass pvp-loading">Open this tab to load INIT PvP rankings.</section>';
      return;
    }
    const d=pvpIntel;
    if(pvpMemberRankMode==='lifetime'&&!pvpLifetimeDamage&&!pvpLifetimeDamageLoading)setTimeout(()=>loadPvpLifetimeDamage(),0);
    const corpRows=(d.corporations||[]).map(row=>`
      <tr class="${row.isMyCorp?'mine':''}">
        <td>${pvpRankBadge(row.rank,row.isMyCorp)}</td>
        <td><a class="pvp-killboard-link" href="https://zkillboard.com/corporation/${encodeURIComponent(row.corporationId)}/" target="_blank" rel="noopener noreferrer" title="Open ${esc(row.name||('Corp '+row.corporationId))} on zKillboard"><strong>${esc(row.name||('Corp '+row.corporationId))}</strong></a>${row.isMyCorp?'<small>YOUR CORP</small>':''}</td>
        <td>${fmt(row.shipsDestroyed)}</td>
        <td>${fmt(row.pointsDestroyed)}</td>
        <td>${fmt(row.iskDestroyed)} ISK</td>
        <td>${row.zkillGlobalRank?('#'+fmt(row.zkillGlobalRank)):'—'}</td>
      </tr>`).join('');
    const linkedPvpToons=Array.isArray(d.linkedCorpCharacters)?d.linkedCorpCharacters:[];
    if(!linkedPvpToons.some(row=>String(row.characterId)===String(pvpPinnedCharacterId))){
      pvpPinnedCharacterId=String(linkedPvpToons.find(row=>row.primary)?.characterId||linkedPvpToons[0]?.characterId||'');
      if(pvpPinnedCharacterId)localStorage.setItem('jlrPvpPinnedCharacter',pvpPinnedCharacterId);
    }

    const lifetimeMode=pvpMemberRankMode==='lifetime';
    const memberRankField=pvpMemberRankMode==='overall'?'rankOverall':pvpMemberRankMode==='isk'?'rankIsk':pvpMemberRankMode==='damage'?'rankDamage':'rankActivity';
    let memberRows=lifetimeMode
      ?[...(pvpLifetimeDamage?.rows||[])]
      :[...(d.myCorpMembers||[])];

    if(lifetimeMode&&pvpPinnedCharacterId&&!memberRows.some(row=>String(row.characterId)===String(pvpPinnedCharacterId))){
      const linked=linkedPvpToons.find(row=>String(row.characterId)===String(pvpPinnedCharacterId));
      if(linked)memberRows.push({rank:null,characterId:linked.characterId,name:linked.name,killmails:0,finalBlows:0,damageDone:0,iskOnKillmails:0});
    }

    memberRows.sort((a,b)=>{
      const aPinned=String(a.characterId)===String(pvpPinnedCharacterId);
      const bPinned=String(b.characterId)===String(pvpPinnedCharacterId);
      if(aPinned!==bPinned)return aPinned?-1:1;
      if(lifetimeMode)return Number(a.rank||999999)-Number(b.rank||999999);
      return Number(a?.[memberRankField]||999999)-Number(b?.[memberRankField]||999999);
    });

    const myMembers=memberRows.map(row=>`
      <tr class="mine${String(row.characterId)===String(pvpPinnedCharacterId)?' pvp-own-toon':''}">
        <td>${pvpRankBadge(lifetimeMode?row.rank:row?.[memberRankField],true)}</td>
        <td><a class="pvp-killboard-link" href="https://zkillboard.com/character/${encodeURIComponent(row.characterId)}/" target="_blank" rel="noopener noreferrer" title="Open ${esc(row.name||('Character '+row.characterId))} on zKillboard"><strong>${esc(row.name||('Character '+row.characterId))}</strong></a>${pvpMemberRankMode==='overall'&&Number.isFinite(Number(row.overallScore))?'<small>OVERALL '+Number(row.overallScore).toFixed(1)+'</small>':''}</td>
        <td>${fmt(row.killmails)}</td>
        <td>${fmt(row.finalBlows)}</td>
        <td>${fmt(row.damageDone)}</td>
        <td>${fmt(row.iskOnKillmails)} ISK</td>
      </tr>`).join('');
    const allianceRows=(d.characters||[]).map(row=>`
      <tr class="${row.isMyCorp?'mine':''}">
        <td>${pvpRankBadge(row.rank,row.isMyCorp)}</td>
        <td>${row.isMyCorp?`<a class="pvp-killboard-link" href="https://zkillboard.com/character/${encodeURIComponent(row.characterId)}/" target="_blank" rel="noopener noreferrer" title="Open ${esc(row.name||('Character '+row.characterId))} on zKillboard"><strong>${esc(row.name||('Character '+row.characterId))}</strong></a>`:`<strong>${esc(row.name||('Character '+row.characterId))}</strong>`}${row.isMyCorp?'<small>YOUR CORP</small>':''}</td>
        <td>${fmt(row.killmails)}</td>
        <td>${fmt(row.finalBlows)}</td>
        <td>${fmt(row.damageDone)}</td>
        <td>${fmt(row.iskOnKillmails)} ISK</td>
      </tr>`).join('');
    const myRank=d.myCorporation?.rank||null;
    host.innerHTML=`
      <div class="pvp-shell">
        <section class="glass pvp-hero">
          <div>
            <span class="pvp-eyebrow">ZKILLBOARD • ROLLING 7 DAYS</span>
            <h2>INIT PVP LEADERBOARDS</h2>
            <p>Corporations use zKillboard's Weekly 7d stats; pilots use INIT killmail participation for their 7-day placement.</p>
          </div>
          <button id="pvpRefresh" class="orb blue" type="button">REFRESH</button>
        </section>

        <section class="pvp-summary-grid">
          <article class="glass pvp-summary-card">
            <span>YOUR CORP</span>
            <strong>${d.myCorporation?.corporationId?`<a class="pvp-killboard-link" href="https://zkillboard.com/corporation/${encodeURIComponent(d.myCorporation.corporationId)}/" target="_blank" rel="noopener noreferrer" title="Open ${esc(d.myCorporation?.name||'Corporation')} on zKillboard">${esc(d.myCorporation?.name||'Unknown')}</a>`:`${esc(d.myCorporation?.name||'Unknown')}`}</strong>
            <small>${myRank?`#${myRank} of ${d.activeCorporations} active INIT corps`:'No kills recorded in this window'}${d.myCorporation?.statsVerified?' • zKill Weekly 7d':''}</small>
          </article>
          <article class="glass pvp-summary-card">
            <span>YOUR ACTIVE PILOTS</span>
            <strong>${fmt(d.myCorpMembers?.length||0)}</strong>
            <small>corp members appearing on INIT killmails</small>
          </article>
          <article class="glass pvp-summary-card">
            <span>INIT ACTIVE PILOTS</span>
            <strong>${fmt(d.activeCharacters||0)}</strong>
            <small>ranked from zKillboard attacker records</small>
          </article>
          <article class="glass pvp-summary-card">
            <span>${d.localArchive?'LOCAL KILLMAIL DATABASE':'KILLMAILS PROCESSED'}</span>
            <strong>${fmt(d.killmailsProcessed||0)}</strong>
            <small>${d.localArchive
              ?`${fmt(d.killmailsStored||d.killmailsProcessed||0)} stored • ${d.truncated?'local history is filling • exact after 7 tracked days':'complete rolling 7-day coverage'}`
              :d.truncated?'API page cap reached • rankings may be partial':`${fmt(d.pagesFetched||0)} API pages • validated crawl`}</small>
          </article>
        </section>

        <div class="pvp-two-col">
          <section class="glass pvp-section">
            <div class="pvp-section-head"><strong>INIT CORPORATIONS</strong><span>your corp is highlighted</span></div>
            <div class="pvp-table-wrap">
              <table class="pvp-table">
                <thead><tr><th>INIT RANK</th><th>CORPORATION</th><th>SHIPS</th><th>POINTS</th><th>ISK DESTROYED</th><th>ZKILL 7D RANK</th></tr></thead>
                <tbody>${corpRows||'<tr><td colspan="6">No corp activity found.</td></tr>'}</tbody>
              </table>
            </div>
          </section>

          <section class="glass pvp-section">
            <div class="pvp-section-head pvp-member-head pvp-member-controls-only">
              <div class="pvp-section-title"><strong>${esc(String(d.myCorporation?.name||'YOUR CORP').toUpperCase())}</strong><span>• CORP PILOT RANKING</span></div>
              <div class="pvp-member-rank-controls" role="group" aria-label="Corp member ranking mode">
                ${linkedPvpToons.length>1?(()=>{
                  const selectedToon=linkedPvpToons.find(row=>String(row.characterId)===String(pvpPinnedCharacterId))||linkedPvpToons[0];
                  return `<div class="pvp-toon-picker${pvpToonMenuOpen?' open':''}">
                    <button id="pvpPinnedToonButton" class="pvp-toon-trigger" type="button" aria-haspopup="listbox" aria-expanded="${pvpToonMenuOpen}" title="Choose which linked ESI toon stays pinned to the top">
                      <span>${esc(selectedToon?.name||'Select toon')}</span><b>▾</b>
                    </button>
                    ${pvpToonMenuOpen?`<div id="pvpPinnedToonMenu" class="pvp-toon-menu" role="listbox" aria-label="Choose linked ESI toon">
                      ${linkedPvpToons.map(row=>`<button class="pvp-toon-option${String(row.characterId)===String(pvpPinnedCharacterId)?' selected':''}" type="button" role="option" aria-selected="${String(row.characterId)===String(pvpPinnedCharacterId)}" data-id="${esc(row.characterId)}">
                        <span>${esc(row.name)}</span>${row.primary?'<small>PRIMARY</small>':''}
                      </button>`).join('')}
                    </div>`:''}
                  </div>`;
                })():''}
                <button id="pvpRankOverall" class="orb ${pvpMemberRankMode==='overall'?'blue':''}" type="button" aria-pressed="${pvpMemberRankMode==='overall'}">BEST OVERALL • CORP</button>
                <button id="pvpRankActivity" class="orb ${pvpMemberRankMode==='activity'?'blue':''}" type="button" aria-pressed="${pvpMemberRankMode==='activity'}">KILLMAILS / FINALS</button>
                <button id="pvpRankIsk" class="orb ${pvpMemberRankMode==='isk'?'blue':''}" type="button" aria-pressed="${pvpMemberRankMode==='isk'}">ISK ON KILLS</button>
                <button id="pvpRankDamage" class="orb ${pvpMemberRankMode==='damage'?'blue':''}" type="button" aria-pressed="${pvpMemberRankMode==='damage'}">MOST DAMAGE • 7D</button>
                <button id="pvpRankLifetime" class="orb ${pvpMemberRankMode==='lifetime'?'blue':''}" type="button" aria-pressed="${pvpMemberRankMode==='lifetime'}">LIFETIME DAMAGE</button>
              </div>
            </div>
            <div class="pvp-table-wrap">
              <table class="pvp-table">
                <thead><tr><th>${lifetimeMode?'CORP RANK':pvpMemberRankMode==='overall'?'CORP RANK':pvpMemberRankMode==='isk'?'ISK RANK':pvpMemberRankMode==='damage'?'DAMAGE RANK':'KILL RANK'}</th><th>PILOT</th><th>KILLMAILS</th><th>FINAL</th><th>${lifetimeMode?'LIFETIME DAMAGE':pvpMemberRankMode==='damage'?'DAMAGE • 7D':'DAMAGE'}</th><th>ISK ON KILLS</th></tr></thead>
                <tbody>${lifetimeMode&&!pvpLifetimeDamage?.ready?`<tr><td colspan="6" class="pvp-lifetime-status">${pvpLifetimeDamageError?esc(pvpLifetimeDamageError):`LOCAL DATABASE BUILDING • ${fmt(pvpLifetimeDamage?.monthsScanned||0)}/${fmt(pvpLifetimeDamage?.totalMonths||0)} MONTHS CACHED`}</td></tr>`:''}${myMembers||`<tr><td colspan="6">${lifetimeMode?'No lifetime damage cached yet.':'No active corp pilots found in this 7-day window.'}</td></tr>`}</tbody>
              </table>
            </div>
          </section>
        </div>

        <section class="glass pvp-section">
          <div class="pvp-section-head"><strong>INIT PILOT LEADERBOARD</strong><span>rank numbers are INIT-wide • top 100 active pilots</span></div>
          <div class="pvp-table-wrap">
            <table class="pvp-table">
              <thead><tr><th>INIT RANK</th><th>PILOT</th><th>KILLMAILS</th><th>FINAL</th><th>DAMAGE</th><th>ISK ON KILLS</th></tr></thead>
              <tbody>${allianceRows||'<tr><td colspan="6">No pilot activity found.</td></tr>'}</tbody>
            </table>
          </div>
        </section>

        <section class="pvp-footnote">
          <strong>RANKING METHOD</strong>
          <span>Corporation rows use zKillboard's own Weekly 7d stats. BEST OVERALL is a corp-only 7-day score with equal weight for killmail participation, final blows, damage, and ISK on kills. Other pilot rankings are INIT-wide from JLR's local rolling killmail database. LIFETIME DAMAGE uses the separate historical local database.</span>
          <small>Updated ${d.generatedAt?ago(d.generatedAt):'recently'} • ${d.stale?'showing last good cache after refresh error • ':''}${d.localArchive?'local archive refreshes every 15 minutes':'shared server cache'} • source: zKillboard public API</small>
        </section>
      </div>`;
    $('pvpRefresh')?.addEventListener('click',()=>loadPvpIntel(true));
    $('pvpPinnedToonButton')?.addEventListener('click',event=>{
      event.stopPropagation();
      pvpToonMenuOpen=!pvpToonMenuOpen;
      renderPvpIntel();
    });
    document.querySelectorAll('.pvp-toon-option').forEach(button=>button.addEventListener('click',event=>{
      event.stopPropagation();
      pvpPinnedCharacterId=String(button.dataset.id||'');
      localStorage.setItem('jlrPvpPinnedCharacter',pvpPinnedCharacterId);
      pvpToonMenuOpen=false;
      renderPvpIntel();
    }));
    $('pvpRankOverall')?.addEventListener('click',()=>{
      pvpMemberRankMode='overall';
      localStorage.setItem('jlrPvpMemberRankMode',pvpMemberRankMode);
      renderPvpIntel();
    });
    $('pvpRankActivity')?.addEventListener('click',()=>{
      pvpMemberRankMode='activity';
      localStorage.setItem('jlrPvpMemberRankMode',pvpMemberRankMode);
      renderPvpIntel();
    });
    $('pvpRankIsk')?.addEventListener('click',()=>{
      pvpMemberRankMode='isk';
      localStorage.setItem('jlrPvpMemberRankMode',pvpMemberRankMode);
      renderPvpIntel();
    });
    $('pvpRankDamage')?.addEventListener('click',()=>{
      pvpMemberRankMode='damage';
      localStorage.setItem('jlrPvpMemberRankMode',pvpMemberRankMode);
      renderPvpIntel();
    });
    $('pvpRankLifetime')?.addEventListener('click',()=>{
      pvpMemberRankMode='lifetime';
      localStorage.setItem('jlrPvpMemberRankMode',pvpMemberRankMode);
      renderPvpIntel();
      loadPvpLifetimeDamage();
    });
  }
  document.addEventListener('click',event=>{
    if(!pvpToonMenuOpen)return;
    if(event.target?.closest?.('.pvp-toon-picker'))return;
    pvpToonMenuOpen=false;
    renderPvpIntel();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&pvpToonMenuOpen){
      pvpToonMenuOpen=false;
      renderPvpIntel();
    }
  });

  async function loadPvpLifetimeDamage(force=false){
    if(pvpLifetimeDamageLoading)return;
    pvpLifetimeDamageLoading=true;
    pvpLifetimeDamageError='';
    try{
      const data=await api(`/api/zkill/lifetime-damage${force?'?refresh=1':''}`);
      pvpLifetimeDamage=data;
      if(!data?.ready){
        clearTimeout(pvpLifetimeDamagePoll);
        pvpLifetimeDamagePoll=setTimeout(()=>loadPvpLifetimeDamage(false),8000);
      }
    }catch(error){
      pvpLifetimeDamageError=String(error?.message||error||'Lifetime corp damage could not be loaded.');
    }finally{
      pvpLifetimeDamageLoading=false;
      renderPvpIntel();
    }
  }

  async function loadPvpIntel(force=false,backgroundPoll=false){
    if(pvpIntelLoading)return;
    if(!backgroundPoll)pvpIntelPollCount=0;
    if(pvpIntelPoll){clearTimeout(pvpIntelPoll);pvpIntelPoll=null}
    pvpIntelLoading=true;pvpIntelError='';renderPvpIntel();
    let shouldPoll=false;
    try{
      pvpIntel=await api(`/api/zkill/leaderboard${force?'?refresh=1':''}`);
      shouldPoll=Boolean(pvpIntel?.refreshing);
    }catch(error){
      pvpIntelError=String(error?.message||error||'PvP rankings could not be loaded.');
    }finally{
      pvpIntelLoading=false;
      renderPvpIntel();
      if(shouldPoll&&activeTab==='pvp'&&pvpIntelPollCount<20){
        pvpIntelPollCount++;
        pvpIntelPoll=setTimeout(()=>loadPvpIntel(false,true),3000);
      }
    }
  }


  function threatAgeLabel(birthday){
    const born=Date.parse(String(birthday||''));
    if(!Number.isFinite(born))return '—';
    const days=Math.max(0,(Date.now()-born)/86400000);
    if(days>=365)return `${Math.floor(days/365)}y`;
    if(days>=30)return `${Math.floor(days/30)}m`;
    return `${Math.max(1,Math.floor(days))}d`;
  }
  function threatBadges(ch){
    const tags=Array.isArray(ch?.tags)?ch.tags:[];
    if(ch?.statsError&&!tags.length)return[{label:'LIMITED DATA',kind:'dim'}];
    return tags.length?tags:[{label:'NO MAJOR FLAGS',kind:'dim'}];
  }
  function threatShipImages(ch){
    const characterId=Number(ch?.id)||0;
    const characterName=String(ch?.name||'pilot');
    return (Array.isArray(ch?.ships)?ch.ships:[]).slice(0,5).map(ship=>{
      const id=Number(ship?.shipTypeID)||0;
      const name=String(ship?.shipName||'Unknown ship');
      if(!id)return '';
      const appearances=fmt(ship?.appearances||0);
      const href=characterId
        ?`https://zkillboard.com/character/${encodeURIComponent(characterId)}/scanalyzer/`
        :`https://zkillboard.com/ship/${encodeURIComponent(id)}/`;
      return `<a class="threat-ship-link" href="${href}" target="_blank" rel="noopener noreferrer" title="${esc(name)} • ${appearances} appearances • click for zKillboard ship history" aria-label="Open ${esc(characterName)} ${esc(name)} ship history on zKillboard"><img src="https://images.evetech.net/types/${id}/render?size=64" alt="${esc(name)}"></a>`;
    }).join('');
  }
  function threatScoreClass(score){
    const n=Number(score)||0;
    return n>=85?'critical':n>=70?'high':n>=50?'watch':'';
  }
  function threatNumber(value){
    if(value===null||value===undefined||value==='')return null;
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  }
  function renderThreatScan(){
    const host=$('threatScanPanel');
    if(!host)return;
    const data=threatScanData;
    const chars=Array.isArray(data?.chars)?data.chars:[];
    const highDanger=chars.filter(ch=>Number(ch?.jlrThreat)>=70).length;
    const signalCount=chars.filter(ch=>(ch?.tags||[]).some(tag=>/CYNO|FC|BAIT|BLOPS|TITAN|SUPER/i.test(String(tag?.label||'')))).length;
    const dscanShips=Array.isArray(data?.ships)?data.ships:[];
    const hasContactsAccess=Boolean(me?.characters?.some(character=>character.contactsAccess));

    const shipStrip=dscanShips.length?`
      <section class="glass threat-dscan-strip">
        <div class="threat-results-head"><strong>D-SCAN COMPOSITION</strong><span>${fmt(data.totalShips||0)} ships detected</span></div>
        <div class="threat-dscan-list">${dscanShips.slice(0,18).map(ship=>`
          <span><img src="https://images.evetech.net/types/${encodeURIComponent(ship.shipTypeID)}/render?size=64" alt=""><b>${fmt(ship.count)}×</b> ${esc(ship.name)}</span>`).join('')}</div>
      </section>`:'';

    const rows=chars.map(ch=>{
      const s=ch?.stats||{},weekly=s.weekly||{};
      const score=Number(ch?.jlrThreat)||0;
      const kills=Number(weekly.shipsDestroyed)||0;
      const losses=Number(weekly.shipsLost)||0;
      const kd=losses>0?(kills/losses).toFixed(2):(kills>0?'∞':'—');
      const gang=threatNumber(s.gangRatio);
      const soloValue=threatNumber(s.soloRatio);
      const solo=soloValue!==null?soloValue:(gang!==null?Math.max(0,100-gang):null);
      const avgGang=threatNumber(s.avgGangSize);
      const sec=threatNumber(ch?.secStatus);
      const tags=threatBadges(ch).map(tag=>`<span class="threat-tag ${esc(tag.kind||'blue')}">${esc(tag.label)}</span>`).join('');
      const partner=ch?.topPartners?.[0];
      return `<tr class="${threatScoreClass(score)}">
        <td class="threat-pilot-cell">
          <div class="threat-pilot">
            <img src="https://images.evetech.net/characters/${encodeURIComponent(ch.id)}/portrait?size=64" alt="">
            <div>
              <a href="https://zkillboard.com/character/${encodeURIComponent(ch.id)}/" target="_blank" rel="noopener noreferrer"><strong>${esc(ch.name)}</strong></a>
              <small>${esc(ch.corporationName||'No corporation')}${ch.allianceName?esc(' • '+ch.allianceName):''}</small>
            </div>
          </div>
        </td>
        <td class="threat-age-cell"><strong>${threatAgeLabel(ch.birthday)}</strong><small>CHAR AGE</small></td>
        <td class="threat-score-cell"><strong>${score}</strong><div><i style="width:${score}%"></i></div></td>
        <td>${sec!==null?sec.toFixed(1):'—'}</td>
        <td><strong>${fmt(kills)} / ${fmt(losses)}</strong><small>K/D ${kd}</small></td>
        <td><strong>${solo===null?'—':Math.round(solo)+'%'}</strong><small>${gang!==null?Math.round(gang)+'% gang':'no gang data'}</small></td>
        <td>${avgGang!==null?avgGang.toFixed(1):'—'}</td>
        <td><strong>${fmt(weekly.iskDestroyed||0)}</strong><small>ISK destroyed</small></td>
        <td class="threat-tags">${tags}</td>
        <td class="threat-ships">${threatShipImages(ch)||'<span>—</span>'}</td>
        <td>${partner?`<a class="pvp-killboard-link" href="https://zkillboard.com/character/${encodeURIComponent(partner.characterID)}/" target="_blank" rel="noopener noreferrer">${esc(partner.name)}</a><small>${fmt(partner.sharedKills)} shared</small>`:'—'}</td>
      </tr>`;
    }).join('');

    const unresolved=Array.isArray(data?.unresolvedNames)?data.unresolvedNames:[];
    const unresolvedShips=Array.isArray(data?.unresolvedShipNames)?data.unresolvedShipNames:[];
    const ignored=Number(data?.ignored?.total)||0;
    const parsedPilots=Number(data?.parsedPilotCount??data?.rawLineCount??chars.length)||0;
    const resolvedPilots=Number(data?.resolvedPilotCount??data?.candidateCount??chars.length)||0;
    const displayedPilots=Number(data?.displayedPilotCount??chars.length)||0;
    const truncatedPilots=Number(data?.truncatedCount)||0;
    const cacheText=data?`${fmt(parsedPilots)} parsed • ${fmt(resolvedPilots)} resolved • ${fmt(ignored)} filtered • ${fmt(displayedPilots)} displayed • ${fmt(data.cache?.hits||0)} local hits • ${fmt(data.cache?.refreshed||0)} refreshed${unresolved.length?' • '+fmt(unresolved.length)+' pilots unresolved':''}${unresolvedShips.length?' • '+fmt(unresolvedShips.length)+' ship types unresolved':''}${truncatedPilots?' • '+fmt(truncatedPilots)+' over 1,000-pilot safety limit':''}`:'';

    host.innerHTML=`
      <div class="threat-shell">
        <section class="glass threat-hero">
          <div>
            <span class="threat-eyebrow">JLR LOCAL / D-SCAN INTELLIGENCE</span>
            <h2>THREAT SCAN</h2>
          </div>
          <div class="threat-actions">
            <button id="threatPasteScan" class="orb blue" type="button">📋 PASTE & SCAN</button>
            <button id="threatRunScan" class="orb silver" type="button">SCAN TEXT</button>
            <button id="threatShareScan" class="orb purple" type="button" title="Publish this pasted scan to dscan.info and automatically copy its share URL" ${threatShareLoading?'disabled':''}>${threatShareLoading?'CREATING…':threatShareUrl?'📋 COPY INTEL LINK':'🔗 CREATE + COPY LINK'}</button>
          </div>
        </section>

        <section class="glass threat-input-card">
          <textarea id="threatScanInput" spellcheck="false" placeholder="Paste Local names or copied D-scan rows here…">${esc(threatScanText)}</textarea>
          <div class="threat-input-foot">
            <span>${threatScanLoading?'BUILDING THREAT INTEL…':threatScanError?esc(threatScanError):data?`JLR threat engine • ${cacheText}`:'Paste names or D-scan, then scan.'}${threatShareError?` • ${esc(threatShareError)}`:''}</span>
            ${data?.scannedAt?`<small>updated ${ago(data.scannedAt)}</small>`:''}
          </div>
          ${threatShareUrl?`<div class="threat-share-ready"><span>INTEL LINK READY</span><a href="${esc(threatShareUrl)}" target="_blank" rel="noopener noreferrer">${esc(threatShareUrl)}</a></div>`:''}
        </section>

        <section class="glass threat-ignore-card">
          <strong>IGNORED CHARACTERS</strong>
          <label class="threat-check${hasContactsAccess?'':' disabled'}">
            <input id="threatIgnorePositive" type="checkbox" ${threatIgnorePositive&&hasContactsAccess?'checked':''} ${hasContactsAccess?'':'disabled'}>
            <span>Ignore characters with positive standings</span>
          </label>
          <label class="threat-check">
            <input id="threatIgnoreOwn" type="checkbox" ${threatIgnoreOwn?'checked':''}>
            <span>Ignore your own linked characters</span>
          </label>
          ${hasContactsAccess
            ?`<small>Positive standings are read from ${esc(data?.standingsSource?.name||'an authorized linked toon')} and are never shown or stored.</small>`
            :'<small>Positive-standings filtering needs EVE contacts access. <button id="threatUpdateAccess" type="button">UPDATE ACCESS</button></small>'}
        </section>

        ${data?`
        <section class="threat-summary">
          <article class="glass"><span>PILOTS IDENTIFIED</span><strong>${fmt(resolvedPilots)}</strong></article>
          <article class="glass"><span>JLR THREAT 70+</span><strong>${fmt(highDanger)}</strong></article>
          <article class="glass"><span>TACTICAL SIGNALS</span><strong>${fmt(signalCount)}</strong></article>
          <article class="glass"><span>D-SCAN SHIPS</span><strong>${fmt(data.totalShips||0)}</strong></article>
        </section>

        ${shipStrip}

        <section class="glass threat-results">
          <div class="threat-results-head"><strong>PILOT INTELLIGENCE</strong><span>JLR threat score • public ESI + cached zKill stats</span></div>
          <div class="threat-table-wrap">
            <table class="threat-table threat-table-v2">
              <thead><tr><th>CHARACTER</th><th>AGE</th><th>JLR THREAT</th><th>SEC</th><th>7D K/L</th><th>SOLO</th><th>AVG GANG</th><th>7D ISK</th><th>TAGS</th><th>RECENT SHIPS</th><th>PARTNER</th></tr></thead>
              <tbody>${rows||`<tr><td colspan="11" class="threat-empty">${dscanShips.length?'D-scan ships found. No pilot names could be resolved from this paste. Paste Local names as well for pilot threat intel.':'No EVE characters were identified from that paste.'}</td></tr>`}</tbody>
            </table>
          </div>
        </section>

        <section class="threat-source-note">
          <strong>JLR THREAT ENGINE</strong>
          <span>Identity, corporation, alliance, age and security come from public ESI. PvP behavior comes from zKillboard's public GET stats API and is cached in our local PvP database for 6 hours. CREATE INTEL LINK publishes the pasted scan to dscan.info and copies its share URL.</span>
        </section>`:''}
      </div>`;

    const input=$('threatScanInput');
    input?.addEventListener('input',()=>{
      if(threatShareUrl&&input.value!==threatScanText)threatShareUrl='';
      threatShareError='';
      threatScanText=input.value;
    });
    input?.addEventListener('keydown',event=>{
      if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();runThreatScan(input.value)}
    });
    $('threatIgnorePositive')?.addEventListener('change',event=>{
      threatIgnorePositive=Boolean(event.target.checked);
      localStorage.setItem('jlrThreatIgnorePositive',String(threatIgnorePositive));
      threatScanData=null;
      threatScanError='Filters changed. Run the scan again.';
      renderThreatScan();
    });
    $('threatIgnoreOwn')?.addEventListener('change',event=>{
      threatIgnoreOwn=Boolean(event.target.checked);
      localStorage.setItem('jlrThreatIgnoreOwn',String(threatIgnoreOwn));
      threatScanData=null;
      threatScanError='Filters changed. Run the scan again.';
      renderThreatScan();
    });
    $('threatUpdateAccess')?.addEventListener('click',()=>{location.href='/auth/eve/start?intent=link'});
    $('threatRunScan')?.addEventListener('click',()=>runThreatScan(input?.value||''));
    $('threatShareScan')?.addEventListener('click',()=>shareThreatScan(input?.value||''));
    $('threatPasteScan')?.addEventListener('click',async()=>{
      try{
        if(!navigator.clipboard?.readText)throw new Error('Clipboard access is unavailable in this browser. Paste into the box instead.');
        const text=await navigator.clipboard.readText();
        if(text!==threatScanText)threatShareUrl='';
        threatShareError='';
        threatScanText=text;
        await runThreatScan(text);
      }catch(error){
        threatScanError=String(error?.message||error);
        renderThreatScan();
        setTimeout(()=>$('threatScanInput')?.focus(),0);
      }
    });
  }
  async function copyThreatShareUrl(){
    if(!threatShareUrl)return false;
    let copied=false;
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(threatShareUrl);
        copied=true;
      }
    }catch{}
    if(!copied){
      try{
        const helper=document.createElement('textarea');
        helper.value=threatShareUrl;
        helper.setAttribute('readonly','');
        helper.setAttribute('aria-hidden','true');
        helper.style.position='fixed';
        helper.style.left='-9999px';
        helper.style.opacity='0';
        document.body.appendChild(helper);
        helper.focus();
        helper.select();
        copied=document.execCommand('copy');
        helper.remove();
      }catch{}
    }
    if(copied){
      toast('Intel link copied. Paste it into your intel channel.');
      return true;
    }
    toast('Intel link is ready below. Click COPY INTEL LINK or select the link to copy.');
    return false;
  }
  async function shareThreatScan(text){
    const value=String(text||'').trim();
    threatScanText=String(text||'');
    if(threatShareUrl){await copyThreatShareUrl();return}
    if(value.length<2){
      threatShareError='Paste a D-scan, Local list, or fleet scan first.';
      renderThreatScan();
      return;
    }
    if(threatShareLoading)return;
    threatShareLoading=true;
    threatShareError='';
    renderThreatScan();
    try{
      const result=await api('/api/threat-share',{method:'POST',body:JSON.stringify({text:value})});
      threatShareUrl=String(result?.url||'');
      if(!threatShareUrl)throw new Error('dscan.info did not return a share link.');
      renderThreatScan();
      await copyThreatShareUrl();
    }catch(error){
      threatShareError=String(error?.message||error||'Could not create the intel link.');
    }finally{
      threatShareLoading=false;
      renderThreatScan();
    }
  }
  async function runThreatScan(text){
    const value=String(text||'').trim();
    threatScanText=String(text||'');
    if(value.length<2){
      threatScanError='Paste at least one pilot name or D-scan row.';
      renderThreatScan();
      return;
    }
    if(threatScanLoading)return;
    threatScanLoading=true;
    threatScanError='';
    renderThreatScan();
    try{
      const contactsAvailable=Boolean(me?.characters?.some(character=>character.contactsAccess));
      threatScanData=await api('/api/threat-scan',{method:'POST',body:JSON.stringify({
        text:value,
        ignoreOwn:threatIgnoreOwn,
        ignorePositive:threatIgnorePositive&&contactsAvailable,
      })});
    }catch(error){
      threatScanError=String(error?.message||error||'Threat scan failed.');
    }finally{
      threatScanLoading=false;
      renderThreatScan();
    }
  }


  function merPct(value){return `${(Number(value||0)*100).toFixed(1)}%`}
  function merRank(row){return row&&row.rank?`#${row.rank} / ${row.of}`:'—'}
  function renderMerIntel(){
    const host=$('merIntelPanel');
    if(!host)return;
    if(merIntelError){
      host.innerHTML=`<section class="glass mer-error"><strong>MER INTEL UNAVAILABLE</strong><span>${esc(merIntelError)}</span></section>`;
      return;
    }
    if(!merIntel){
      host.innerHTML='<section class="glass mer-loading">Loading Fountain + INIT MER data…</section>';
      return;
    }
    const m=merIntel;
    const econ=m.fountain?.economic||{};
    const mining=Object.values(m.fountain?.mining||{});
    const init=m.init?.fountain||{};
    const global=m.init?.global||{};
    const hotspots=(m.init?.fountainHotspots||[]).slice(0,8);
    const econCards=[
      econ.mined_value,econ.produced_value,econ.trade_value,econ.npc_bounties,econ.destroyed_value,econ.loyalty_points
    ].filter(Boolean).map(row=>`
      <article class="mer-kpi">
        <span>${esc(row.label)}</span>
        <strong>${fmt(row.value)}</strong>
        <small>${merRank(row)} among MER regions / locations</small>
      </article>`).join('');
    const miningRows=mining.map(row=>`
      <div class="mer-mining-row">
        <div><span>${esc(row.label)} mined</span><strong>${fmt(row.minedM3,'m3')} m³</strong></div>
        <div><span>Regional rank</span><strong>${merRank(row)}</strong></div>
        <div><span>Waste</span><strong>${merPct(row.wasteRate)}</strong></div>
      </div>`).join('');
    const hotspotRows=hotspots.map((row,index)=>`
      <tr>
        <td><strong>${index+1}</strong></td>
        <td><strong>${esc(row.system)}</strong></td>
        <td>${fmt(row.initKillRecords)}</td>
        <td>${fmt(row.initLossRecords)}</td>
        <td>${fmt(row.ccpDestroyed)} ISK</td>
      </tr>`).join('');
    host.innerHTML=`
      <div class="mer-shell">
        <section class="glass mer-hero">
          <div>
            <span class="mer-eyebrow">MONTHLY ECONOMIC REPORT • ${esc(m.reportLabel||m.period)}</span>
            <h2>FOUNTAIN + INIT INTEL</h2>
            <p>Only the MER data that directly describes Fountain or identifies The Initiative. in the kill dump.</p>
          </div>
          <div class="mer-badges">
            <span>FOUNTAIN</span>
            <span>INIT. • ${esc(String(m.alliance?.allianceId||''))}</span>
          </div>
        </section>

        <section class="glass mer-section">
          <div class="mer-section-head"><strong>FOUNTAIN ECONOMY</strong><span>regional August totals</span></div>
          <div class="mer-kpi-grid">${econCards}</div>
        </section>

        <div class="mer-two-col">
          <section class="glass mer-section">
            <div class="mer-section-head"><strong>FOUNTAIN MINING</strong><span>volume + waste + regional rank</span></div>
            <div class="mer-mining-list">${miningRows}</div>
            <div class="mer-moon-strip">
              <div><span>METENOX MOON MATERIALS</span><strong>${fmt(m.fountain?.moonMaterials?.metenoxMining)}</strong><small>MER quantity</small></div>
              <div><span>REFINERY MOON MATERIALS</span><strong>${fmt(m.fountain?.moonMaterials?.refineryMining)}</strong><small>MER quantity</small></div>
            </div>
          </section>

          <section class="glass mer-section">
            <div class="mer-section-head"><strong>INIT COMBAT • FOUNTAIN</strong><span>MER kill-dump slice</span></div>
            <div class="mer-combat-grid">
              <article><span>KILL RECORDS</span><strong>${fmt(init.killRecords)}</strong><small>${merPct(init.shareOfInitKillRecords)} of INIT kill records</small></article>
              <article><span>LOSS RECORDS</span><strong>${fmt(init.lossRecords)}</strong><small>${merPct(init.shareOfInitLossRecords)} of INIT loss records</small></article>
              <article><span>CCP VALUE DESTROYED</span><strong>${fmt(init.ccpDestroyed)}</strong><small>Fountain</small></article>
              <article><span>CCP VALUE LOST</span><strong>${fmt(init.ccpLost)}</strong><small>Fountain</small></article>
              <article><span>VALUE EFFICIENCY</span><strong>${merPct(init.ccpEfficiency)}</strong><small>destroyed / (destroyed + lost)</small></article>
              <article><span>FOUNTAIN PRESENCE</span><strong>${merPct(init.shareOfFountainKillRecordsAsKiller)}</strong><small>of Fountain records list INIT as killer</small></article>
            </div>
            <div class="mer-global-line">
              <span>INIT ALL-NEW-EDEN AUGUST</span>
              <strong>${fmt(global.killRecords)} kill records • ${fmt(global.lossRecords)} losses • ${fmt(global.ccpDestroyed)} destroyed • ${fmt(global.ccpLost)} lost</strong>
            </div>
          </section>
        </div>

        <section class="glass mer-section">
          <div class="mer-section-head"><strong>INIT • FOUNTAIN HOTSPOTS</strong><span>systems with the most INIT-involved MER records</span></div>
          <div class="mer-table-wrap">
            <table class="mer-table">
              <thead><tr><th>#</th><th>SYSTEM</th><th>INIT KILL REC.</th><th>INIT LOSS REC.</th><th>CCP VALUE DESTROYED</th></tr></thead>
              <tbody>${hotspotRows}</tbody>
            </table>
          </div>
        </section>

        <section class="mer-scope-note">
          <strong>WHAT THIS TAB MEANS</strong>
          <span>Fountain economy/mining totals are regional and are not attributed to INIT by the MER. INIT-specific numbers here come from alliance ID ${esc(String(m.alliance?.allianceId||''))} in the MER kill dump. A kill row contains one killer alliance, not every participant.</span>
          <small>Source: ${esc(m.source||'EVE Online Monthly Economic Report')}</small>
        </section>
      </div>`;
  }
  async function loadMerIntel(){
    merIntelError='';
    try{
      const response=await fetch('/mer-fountain-init.json',{cache:'no-cache'});
      if(!response.ok)throw new Error(`MER data request failed (${response.status})`);
      merIntel=await response.json();
    }catch(error){
      merIntel=null;
      merIntelError=String(error?.message||error||'MER data could not be loaded.');
    }
    renderMerIntel();
  }

  function updateUiScale(){
    const app=$('app');
    if(!app||app.classList.contains('hidden'))return;
    const viewport=Math.max(320,document.documentElement.clientWidth||window.innerWidth||320);
    if(viewport<1700){
      app.style.zoom='1';
      return;
    }
    const expanded=app.classList.contains('expanded');
    const designWidth=expanded?1600:1120;
    const maxScale=expanded?1.6:1.55;
    const targetWidth=viewport*.90;
    const scale=Math.max(1,Math.min(maxScale,targetWidth/designWidth));
    app.style.zoom=String(Math.round(scale*1000)/1000);
  }
  function applyMode(mode){
    $('app').classList.toggle('compact',mode==='compact');
    $('app').classList.toggle('expanded',mode==='expanded');
    $('compactMode').classList.toggle('active',mode==='compact');
    $('expandedMode').classList.toggle('active',mode==='expanded');
    localStorage.setItem('jlrMode',mode);
    requestAnimationFrame(updateUiScale);
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
      const fit=fits.find(x=>String(x.fittingId)===String(cfg.fittingId))||defaultFleetFit(fits);
      if(!fit){entries.push({character,fit:null,error:'No mining fit'});continue}
      if(isGasFit(fit)){entries.push({character,fit,error:'Gas fit — output is calculated on the Gas tab',gas:true});continue}
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
    if(state){renderFleet();renderTop();renderIceMining();renderGasHuffing()}
    renderCalculator();
  }
  function calcData(){return state?.source?.yieldCalculator||null}
  function skillLabel(character,id){const s=character?.skills?.[String(id)];return s?`${s.name} ${s.level}`:'Not synced'}
  function skillLabelKey(character,key){const id=calcData()?.skillIds?.[key];return id?skillLabel(character,id):'Not synced'}
  function calcCharacter(id){return me?.characters?.find(c=>String(c.characterId)===String(id))||null}
  function calcFitting(character,id){return character?.fittings?.find(f=>String(f.fittingId)===String(id))||null}
  function fitSortDescending(a,b){
    const options={numeric:true,sensitivity:'base'};
    return String(b?.shipName||'').localeCompare(String(a?.shipName||''),undefined,options)
      ||String(b?.name||'').localeCompare(String(a?.name||''),undefined,options)
      ||String(b?.fittingId||'').localeCompare(String(a?.fittingId||''),undefined,options);
  }
  const GAS_MODULES={
    'Gas Cloud Scoop I':{family:'SCOOP',duration:30,yieldM3:10,residueChance:0,residueMultiplier:0},
    'Gas Cloud Scoop II':{family:'SCOOP',duration:40,yieldM3:20,residueChance:.34,residueMultiplier:1},
    "'Crop' Gas Cloud Scoop":{family:'SCOOP',duration:40,yieldM3:20,residueChance:1,residueMultiplier:2},
    "'Plow' Gas Cloud Scoop":{family:'SCOOP',duration:40,yieldM3:20,residueChance:1,residueMultiplier:4},
    'Syndicate Gas Cloud Scoop':{family:'SCOOP',duration:30,yieldM3:20,residueChance:0,residueMultiplier:0},
    'Gas Cloud Harvester I':{family:'HARVESTER',duration:100,yieldM3:50,residueChance:0,residueMultiplier:0},
    'Gas Cloud Harvester II':{family:'HARVESTER',duration:80,yieldM3:100,residueChance:.34,residueMultiplier:1},
    'ORE Gas Cloud Harvester':{family:'HARVESTER',duration:80,yieldM3:100,residueChance:0,residueMultiplier:0},
  };
  const GAS_SHIP_BONUSES={
    Venture:{miningFrigate:0.05,roleYield:1},
    Prospect:{miningFrigate:0.05,roleYield:1},
    'Venture Consortium Issue':{miningFrigate:0.05,roleYield:1},
    Endurance:{},
    Covetor:{barge:0.03,roleDuration:0.30},
    Retriever:{barge:0.02,roleDuration:0.125},
    Procurer:{barge:0.02},
    Hulk:{barge:0.03,exhumers:0.03,roleDuration:0.30},
    Mackinaw:{barge:0.03,exhumers:0.03,roleDuration:0.125},
    Skiff:{},
  };
  function gasModulesInFit(fit){
    return (Array.isArray(fit?.items)?fit.items:[]).filter(row=>Object.prototype.hasOwnProperty.call(GAS_MODULES,String(row.name||'')));
  }
  function isGasFit(fit){return gasModulesInFit(fit).length>0}
  function isOreFit(fit){return Boolean(calcData()?.ships?.[fit?.shipName])&&!isGasFit(fit)}
  function miningFits(character){
    const data=calcData();
    return(character?.fittings||[])
      .filter(f=>Boolean(data?.ships?.[f.shipName])||isGasFit(f))
      .sort(fitSortDescending);
  }
  function defaultFleetFit(fits){return fits.find(isOreFit)||fits[0]||null}
  function groupedFitOptions(fits,selectedId){
    if(!fits.length)return'<option value="">No supported saved mining or gas fit</option>';
    const groups=new Map();
    for(const fit of fits){
      const hull=String(fit.shipName||'Other');
      if(!groups.has(hull))groups.set(hull,[]);
      groups.get(hull).push(fit);
    }
    return[...groups].map(([hull,rows])=>`<optgroup label="${esc(hull)}">${rows.map(f=>`<option value="${esc(f.fittingId)}" ${String(f.fittingId)===String(selectedId)?'selected':''}>${isGasFit(f)?'[GAS] ':''}${esc(f.shipName)} — ${esc(f.name)}</option>`).join('')}</optgroup>`).join('');
  }
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
  function gasFitStats(character,fit){
    if(!character||!fit||!isGasFit(fit))return null;
    const ship=GAS_SHIP_BONUSES[fit.shipName]||{};
    const gasRows=gasModulesInFit(fit);
    if(!Object.prototype.hasOwnProperty.call(character.skills||{},'25544'))return{character,fit,error:'Use Sync EVE Data to load the Gas Cloud Harvesting skill'};

    const miningFrigate=skillLevel(character,32918);
    const gasSkill=skillLevel(character,25544);
    const barge=skillLevel(character,17940);
    const exhumers=skillLevel(character,22551);
    if(ship.miningFrigate&&!Object.prototype.hasOwnProperty.call(character.skills||{},'32918')){
      return{character,fit,error:'Use Sync EVE Data to load the Mining Frigate skill'};
    }

    const booster=calcCharacter(calcSettings.boosterCharacterId);
    const boosterFit=calcFitting(booster,calcSettings.boosterFittingId);
    const activeBooster=boosterInFleet();
    const boost=window.JLRYieldMath?.boostBreakdown(
      calcData(),
      activeBooster?(booster?.skills||{}):{},
      activeBooster?boosterFit:null,
      activeBooster&&Boolean(calcSettings.mindlink),
    )||{cycleReduction:0,rangeBonus:0,ship:'None'};

    const durationMultiplier=
      Math.max(.05,1-Number(ship.miningFrigate||0)*miningFrigate)*
      Math.max(.05,1-Number(ship.barge||0)*barge)*
      Math.max(.05,1-Number(ship.exhumers||0)*exhumers)*
      Math.max(.05,1-Number(ship.roleDuration||0))*
      Math.max(.05,1-Number(boost.cycleReduction||0));
    const yieldMultiplier=1+Number(ship.roleYield||0);

    let m3PerHour=0,moduleCount=0,activationsPerHour=0;
    const modules=[];
    for(const row of gasRows){
      const name=String(row.name||''),q=Math.max(1,Number(row.quantity||1)),spec=GAS_MODULES[name];
      const duration=Number(spec.duration)*durationMultiplier;
      const yieldM3=Number(spec.yieldM3)*yieldMultiplier;
      const perModuleM3Hr=duration>0?yieldM3*(3600/duration):0;
      moduleCount+=q;
      activationsPerHour+=duration>0?(3600/duration)*q:0;
      m3PerHour+=perModuleM3Hr*q;
      modules.push({
        name,quantity:q,family:spec.family,duration,yieldM3,
        residueChance:Number(spec.residueChance||0),
        residueMultiplier:Number(spec.residueMultiplier||0),
        range:1500*(1+Number(boost.rangeBonus||0)),
      });
    }
    const cycle=activationsPerHour>0?moduleCount*3600/activationsPerHour:0;
    const gasVolume=Math.max(.001,Number(state?.source?.gas?.volume)||10);
    const unitsPerHour=m3PerHour/gasVolume;
    const residue=modules.map(row=>row.residueChance>0?`${Math.round(row.residueChance*100)}% ×${row.residueMultiplier}`:'NONE');
    const residueSummary=[...new Set(residue)].join(' / ');
    return{
      character,fit,ship:fit.shipName,modules,moduleCount,cycle,m3PerHour,unitsPerHour,gasSkill,miningFrigate,barge,exhumers,boost,
      range:Math.max(0,...modules.map(row=>Number(row.range)||0)),
      residueSummary,
    };
  }
  function selectedFleetFit(character){
    const cfg=fleetSettings.members?.[String(character?.characterId)]||{};
    const fits=miningFits(character);
    return fits.find(f=>String(f.fittingId)===String(cfg.fittingId))||defaultFleetFit(fits);
  }
  function iceFitStats(character,fit){
    if(!character||!fit)return null;
    const ship=ICE_SHIP_BONUSES[fit.shipName];
    if(!ship)return null;
    const items=Array.isArray(fit.items)?fit.items:[];
    const harvesters=items.filter(row=>Object.prototype.hasOwnProperty.call(ICE_HARVESTERS,String(row.name||'')));
    if(!harvesters.length)return null;
    if(!Object.prototype.hasOwnProperty.call(character.skills||{},'16281'))return{character,fit,error:'Use Sync EVE Data to load the Ice Harvesting skill'};

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
  function boardKey(kind,system){return `${kind}:${system}`}
  function saveBoardPrefs(){localStorage.setItem('jlrFieldBoard',JSON.stringify(boardPrefs))}
  function favoriteBoardKeys(){return new Set(boardPrefs.favorites)}
  function isBoardFavorite(kind,system){return favoriteBoardKeys().has(boardKey(kind,system))}
  function boardEntries(){
    const entries=[];
    for(const d of definitions())entries.push({kind:'t3',key:boardKey('t3',d.system),system:d.system,d,f:field(d.system)});
    for(const row of Array.isArray(state?.source?.iceFields)?state.source.iceFields:[])entries.push({kind:'ice',key:boardKey('ice',row.system),system:row.system,row});
    for(const row of Array.isArray(state?.source?.a0Fields)?state.source.a0Fields:[])entries.push({kind:'a0',key:boardKey('a0',row.system),system:row.system,row});
    return entries;
  }
  function orderedBoardEntries(){
    const entries=boardEntries(),favorites=favoriteBoardKeys();
    const original=new Map(entries.map((entry,index)=>[entry.key,index]));
    const custom=new Map(boardPrefs.order.map((key,index)=>[normalizeBoardKey(key),index]));
    return entries.sort((a,b)=>{
      const af=favorites.has(a.key),bf=favorites.has(b.key);
      if(af!==bf)return af?-1:1;
      const ai=custom.has(a.key)?custom.get(a.key):100000+(original.get(a.key)||0);
      const bi=custom.has(b.key)?custom.get(b.key):100000+(original.get(b.key)||0);
      return ai-bi;
    });
  }
  function syncBoardControls(){
    const board=$('fieldBoard'),arrange=$('boardArrange'),size=$('boardSize'),hint=$('boardArrangeHint');
    if(board){
      for(const value of BOARD_SIZES)board.classList.toggle(`board-size-${value}`,boardPrefs.size===value);
      board.classList.toggle('arranging',boardArrangeMode);
    }
    if(arrange){
      arrange.classList.toggle('active',boardArrangeMode);
      arrange.setAttribute('aria-pressed',String(boardArrangeMode));
      arrange.textContent=boardArrangeMode?'✓ ARRANGING':'↕ ARRANGE';
    }
    if(size)size.textContent=`BOX SIZE • ${boardPrefs.size==='small'?'S':boardPrefs.size==='large'?'L':'M'}`;
    if(hint)hint.textContent=boardArrangeMode?'Drag any T3, ICE or A0 box to reorder • favorites stay pinned first':'☆ favorite any T3, ICE or A0 system to pin it to the front';
  }
  function toggleBoardFavorite(kind,system){
    const key=boardKey(kind,system),favorites=favoriteBoardKeys();
    if(favorites.has(key))favorites.delete(key);else favorites.add(key);
    boardPrefs.favorites=[...favorites];
    saveBoardPrefs();
    renderBoards();
  }
  function moveBoardItem(sourceKey,targetKey){
    if(!sourceKey||!targetKey||sourceKey===targetKey)return;
    const favorites=favoriteBoardKeys();
    if(favorites.has(sourceKey)!==favorites.has(targetKey))return;
    const ids=orderedBoardEntries().map(entry=>entry.key);
    const from=ids.indexOf(sourceKey),to=ids.indexOf(targetKey);
    if(from<0||to<0)return;
    ids.splice(to,0,ids.splice(from,1)[0]);
    boardPrefs.order=ids;
    saveBoardPrefs();
    renderBoards();
  }
  function cycleBoardSize(){
    const index=BOARD_SIZES.indexOf(boardPrefs.size);
    boardPrefs.size=BOARD_SIZES[(index+1)%BOARD_SIZES.length];
    saveBoardPrefs();syncBoardControls();
  }
  function resetBoardOrder(){
    boardPrefs.order=[];
    saveBoardPrefs();renderBoards();
    toast('Field board order reset. Favorites were kept.');
  }
  function toggleBoardArrange(){
    boardArrangeMode=!boardArrangeMode;
    if(boardArrangeMode){
      filter='all';
      document.querySelectorAll('.filter').forEach(button=>button.classList.toggle('active',button.dataset.filter==='all'));
    }
    renderBoards();
  }
  function field(system){return state?.fields?.[system]||null}
  function def(system){return definitions().find(x=>x.system===system)||null}
  function boardScanLine(system){
    const row=state?.scans?.[system]||null;
    const at=row?.lastScanAt||null;
    const ms=Date.parse(at||'');
    if(!Number.isFinite(ms))return{text:'SCAN • NEVER',stale:true,title:'No Probe Scanner update recorded yet'};
    const stale=row?.due||Date.now()-ms>=12*60*60*1000;
    const age=ago(at).toUpperCase();
    return{
      text:stale?`SCAN • ${age} • UPDATE`:`SCAN • ${age}`,
      stale,
      title:stale?`Last Probe Scanner update ${ago(at)}; update requested after 12 hours`:`Last Probe Scanner update ${ago(at)}`,
    };
  }

  function renderTop(){
    if(!state)return;
    const ores=state.source.ores;
    const targets=definitions().map(d=>({d,f:field(d.system)}))
      .filter(x=>x.f.status!=='cleared')
      .sort((a,b)=>Number(a.f.cherryPicked)-Number(b.f.cherryPicked)||a.d.rank-b.d.rank||a.d.order-b.d.order);
    const target=targets[0]||null;
    const top=target?ores[target.d.rank-1]:ores[0];
    const fleetNow=fleetStats();
    const uptimePct=Math.min(100,Math.max(1,Number(fleetSettings.uptime)||100));
    $('perShipKpi').textContent=fmt(fleetNow.average,'m3');
    $('perShipSub').textContent=fleetNow.count?`${fleetNow.count} selected • avg @ ${uptimePct.toFixed(0)}% uptime • m³/hr`:'No miners selected';
    $('fleetKpi').textContent=fmt(fleetNow.total,'m3');
    $('fleetSub').textContent=fleetNow.count?`${fleetNow.count} miners • ${uptimePct.toFixed(0)}% uptime target • m³/hr`:'Select miners in Fleet';
    $('topOreKpi').textContent=top?.name||'—';
    const targetDistance=target&&Number.isFinite(Number(target.d.distanceLy))?` • ${Number(target.d.distanceLy).toFixed(2)} LY`:'';
    $('topOreSub').textContent=target?`${target.d.system}${targetDistance} • rank #${target.d.rank}`:'No mineable T3 target';

    const payout=Number(fleetSettings.payout)/100;
    const jitaPerM3=Number(top?.market?.jita?.refinedBuyPerM3 ?? top?.market?.jita?.buyPerM3 ?? top?.jbvPerM3);
    const cnPerM3=Number(top?.market?.cn?.refinedBuyPerM3 ?? top?.market?.cn?.buyPerM3);
    const fleetRate=fleetM3();
    const jitaHourly=Number.isFinite(jitaPerM3)?fleetRate*jitaPerM3*payout:null;
    const cnHourly=Number.isFinite(cnPerM3)&&cnPerM3>0?fleetRate*cnPerM3*payout:null;

    $('jitaValueKpi').textContent=jitaHourly===null?'—':`${fmt(jitaHourly)}/hr`;
    $('jitaValueSub').textContent=Number.isFinite(jitaPerM3)?`${jitaPerM3.toFixed(2)} ISK/m³ • ${(payout*100).toFixed(1)}% payout • prices ${ago(state.market?.lastUpdatedAt)}`:'Jita refined-mineral price unavailable';
    $('cnValueKpi').textContent=cnHourly===null?'—':`${fmt(cnHourly)}/hr`;
    $('cnValueSub').textContent=cnHourly===null?'C-N private mineral price unavailable':`${cnPerM3.toFixed(2)} ISK/m³ • ${(payout*100).toFixed(1)}% payout • prices ${ago(state.market?.lastUpdatedAt)}`;

    $('actualTodayM3').textContent=fmt(state.esi.actual.today.m3,'m3');
    $('actualTodayIsk').textContent=fmt(actualValue(state.esi.actual.today.jbv));
    $('actualTodaySub').textContent=state.esi.lastSyncAt?`ledger total • synced ${ago(state.esi.lastSyncAt)}`:'waiting for first EVE ledger sync';
    $('actualTodayIskSub').textContent=`tracked T3 ore • ${(payout*100).toFixed(1)}% payout setting`;
    $('actualExpTodayM3').textContent=`${fmt(state.esi.actual.today.m3,'m3')} m³`;
    $('actualExpTodayValue').textContent=`${fmt(actualValue(state.esi.actual.today.jbv))} ISK`;
    $('actualWeekM3').textContent=`${fmt(state.esi.actual.week.m3,'m3')} m³`;
    $('actualWeekValue').textContent=`${fmt(actualValue(state.esi.actual.week.jbv))} ISK`;
    const accessNeeded=(me?.characters||[]).filter(c=>c.needsReauth).length;
    $('esiStatus').textContent=accessNeeded?`${state.esi.linkedCharacters} LINKED • ${accessNeeded} NEED ACCESS`:`${state.esi.linkedCharacters} LINKED • ACCESS CURRENT`;
    $('lastSync').textContent=state.esi.lastSyncAt?`EVE data synced ${ago(state.esi.lastSyncAt)}`:(state.esi.lastError?`Sync error: ${state.esi.lastError}`:'No successful sync yet');
    renderDataStatus();
  }
  function fleetLaserDetails(entry){
    if(!entry?.result)return null;
    const lasers=Array.isArray(entry.result.lasers)?entry.result.lasers:[];
    const count=lasers.reduce((sum,row)=>sum+Math.max(1,Number(row?.quantity)||1),0);
    if(!count)return null;
    const perLaser=(Number(entry.effectiveM3)||0)/count;
    const ranges=[];
    for(const row of lasers){
      const range=Number(row?.optimalRange);
      if(Number.isFinite(range)&&range>0)ranges.push(range);
    }
    let rangeText='—';
    if(ranges.length){
      const min=Math.min(...ranges),max=Math.max(...ranges);
      const km=value=>value>=1000?(value/1000).toFixed(value>=10000?1:2)+' km':Math.round(value)+' m';
      rangeText=Math.abs(max-min)>50?`${km(min)}–${km(max)}`:km(max);
    }
    return{count,perLaser,rangeText};
  }
  function fleetCharacterMatches(character){
    const id=String(character.characterId);
    const cfg=fleetSettings.members?.[id]||{};
    const fits=miningFits(character);
    if(fleetViewFilter==='selected'&&!cfg.enabled)return false;
    if(fleetViewFilter==='miners'&&!fits.length)return false;
    if(fleetViewFilter==='nofit'&&fits.length)return false;
    const query=String(fleetSearchText||'').trim().toLowerCase();
    if(!query)return true;
    const haystack=[
      character.name,
      ...fits.flatMap(fit=>[fit.shipName,fit.name]),
      id,
    ].map(value=>String(value||'').toLowerCase()).join(' ');
    return haystack.includes(query);
  }

  function renderFleet(){
    if(!me)return;
    if(document.activeElement!==$('uptime'))$('uptime').value=Number(fleetSettings.uptime)||100;
    if(document.activeElement!==$('payout'))$('payout').value=Number(fleetSettings.payout)||95;

    const sourceChars=me.characters||[];
    const originalOrder=new Map(sourceChars.map((character,index)=>[String(character.characterId),index]));
    const customOrder=new Map((fleetSettings.order||[]).map((id,index)=>[String(id),index]));
    const chars=[...sourceChars].sort((a,b)=>{
      const aId=String(a.characterId),bId=String(b.characterId);
      const aOrder=customOrder.has(aId)?customOrder.get(aId):100000+(originalOrder.get(aId)||0);
      const bOrder=customOrder.has(bId)?customOrder.get(bId):100000+(originalOrder.get(bId)||0);
      return aOrder-bOrder;
    });
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
    const boosterBreakdown=window.JLRYieldMath?.boostBreakdown(
      calcData(),
      booster?.skills||{},
      boosterFit,
      Boolean(calcSettings.mindlink),
    )||null;
    const activeBoost=Boolean(boosterInFleet()&&booster&&boosterFit&&boosterBreakdown?.ship&&boosterBreakdown.ship!=='None');
    const list=$('fleetMemberList');
    if(soundMenu?.select.closest('#fleetMemberList'))closeSoundMenu();
    list.innerHTML='';
    for(const character of chars){
      const id=String(character.characterId),fits=miningFits(character);
      const existing=fleetSettings.members[id]&&typeof fleetSettings.members[id]==='object'?fleetSettings.members[id]:{};
      const chosen=fits.find(x=>String(x.fittingId)===String(existing.fittingId))||defaultFleetFit(fits);
      fleetSettings.members[id]={enabled:Boolean(existing.enabled),fittingId:chosen?String(chosen.fittingId):''};
    }

    const stats=fleetStats(),byId=new Map(stats.entries.map(x=>[String(x.character.characterId),x]));
    const visibleChars=chars.filter(fleetCharacterMatches);
    const selectedCount=chars.filter(character=>Boolean(fleetSettings.members?.[String(character.characterId)]?.enabled)).length;
    const visibleCount=$('fleetVisibleCount');
    if(visibleCount)visibleCount.textContent=`SHOWING ${visibleChars.length} / ${chars.length} • ${selectedCount} SELECTED`;
    const searchInput=$('fleetSearchInput');
    if(searchInput&&document.activeElement!==searchInput&&searchInput.value!==fleetSearchText)searchInput.value=fleetSearchText;
    const viewSelect=$('fleetViewFilter');
    if(viewSelect&&viewSelect.value!==fleetViewFilter)viewSelect.value=fleetViewFilter;
    if(!chars.length){
      list.innerHTML='<div class="fleet-empty">Connect miners to build your fleet.</div>';
    }else if(!visibleChars.length){
      list.innerHTML='<div class="fleet-empty">No toons match this fleet view. Clear the search or change SHOW.</div>';
    }else{
      for(const character of visibleChars){
        const id=String(character.characterId),cfg=fleetSettings.members[id],fits=miningFits(character),entry=byId.get(id);
        const row=document.createElement('div');row.className=`fleet-member${cfg.enabled?' selected':''}`;
        row.dataset.id=id;
        row.draggable=fleetArrangeMode;
        const fitOptions=groupedFitOptions(fits,cfg.fittingId);
        const isBooster=id===String(calcSettings.boosterCharacterId||'');
        const boosterFitText=isBooster?(boosterFit?`${boosterFit.shipName} — ${boosterFit.name}` :'No saved booster fit'):'';
        const laser=fleetLaserDetails(entry);
        let outputMain='EXCLUDED',outputSub='not counted';
        let metricOne='—',metricOneLabel='M³/HR / LASER';
        let metricTwo='—',metricTwoLabel='LASER RANGE';
        let metricThree='NONE',metricThreeLabel='BOOST SOURCE';
        if(isBooster){
          const charges=boosterBreakdown?.charges?.names||[];
          outputMain=activeBoost?'BOOST ACTIVE':cfg.enabled?'BOOST FIT READY':'BOOSTER OFF';
          outputSub=boosterFit
            ?`${boosterFit.shipName} • ${boosterBreakdown?.core||'None'} core • ${boosterBreakdown?.burst||'T1'} burst${calcSettings.mindlink?' • mindlink':''}`
            :(cfg.enabled?'select a saved booster fit':'not in fleet');
          metricOne=boosterBreakdown?`${(Number(boosterBreakdown.cycleReduction||0)*100).toFixed(2)}%`:'—';
          metricOneLabel='CYCLE REDUCTION';
          metricTwo=boosterBreakdown?`${(Number(boosterBreakdown.efficiencyBoost||0)*100).toFixed(1)}%`:'—';
          metricTwoLabel='EFFICIENCY BURST';
          metricThree=boosterBreakdown?`${(Number(boosterBreakdown.rangeBonus||0)*100).toFixed(1)}%`:'—';
          metricThreeLabel='RANGE BOOST';
          if(charges.length)outputSub+=` • ${charges.join(' + ')}`;
        }else if(cfg.enabled&&entry?.result){
          outputMain=`${fmt(entry.effectiveM3,'m3')} m³/hr @ ${Number(fleetSettings.uptime).toFixed(0)}%`;
          outputSub=`${activeBoost?`BOOSTED • ${boosterBreakdown.ship}`:'UNBOOSTED'} • ${laser?.count||0} laser${laser?.count===1?'':'s'}`;
          metricOne=laser?`${fmt(laser.perLaser,'m3')}`:'—';
          metricTwo=laser?.rangeText||'—';
          metricThree=activeBoost?boosterBreakdown.ship:'NONE';
        }else if(cfg.enabled){
          outputMain=entry?.error||'NO SUPPORTED FIT';
          outputSub='check saved fit / EVE sync';
          metricThree=activeBoost?boosterBreakdown.ship:'NONE';
        }
        if(isBooster)row.classList.add('booster');
        if(fleetArrangeMode)row.classList.add('arranging');
        row.innerHTML=`
          ${fleetArrangeMode?'<span class="fleet-drag-grip" aria-hidden="true">⠿</span>':''}
          <label class="fleet-member-toggle"><input class="fleet-member-check" data-id="${id}" type="checkbox" ${cfg.enabled?'checked':''} ${!isBooster&&!fits.length?'disabled':''}><img src="${esc(character.portrait)}" alt=""><span><strong>${esc(character.name)}</strong><small>${isBooster?(cfg.enabled?'Selected booster • in fleet':'Selected booster • not in fleet'):fits.length?`${fits.length} mining fit${fits.length===1?'':'s'}`:'No mining fits'}</small></span></label>
          ${isBooster?`<div class="fleet-booster-fit-inline">${esc(boosterFitText)}</div>`:`<select class="fleet-fit-select" data-id="${id}" ${fits.length?'':'disabled'}>${fitOptions}</select>`}
          <div class="fleet-member-metrics">
            <span class="fleet-member-output"><strong>${esc(outputMain)}</strong><small>${esc(outputSub)}</small></span>
            <span><strong>${esc(metricOne)}</strong><small>${esc(metricOneLabel)}</small></span>
            <span title="Strip-miner optimal range includes the detected Mining Laser Field Enhancement boost. Implant range bonuses are not modeled."><strong>${esc(metricTwo)}</strong><small>${esc(metricTwoLabel)}</small></span>
            <span class="${activeBoost?'fleet-boost-live':''}"><strong>${esc(metricThree)}</strong><small>${esc(metricThreeLabel)}</small></span>
          </div>`;
        list.appendChild(row);
      }
    }

    const arrange=$('fleetArrange'),reset=$('fleetOrderReset'),hint=$('fleetArrangeHint');
    if(arrange){
      arrange.classList.toggle('active',fleetArrangeMode);
      arrange.setAttribute('aria-pressed',String(fleetArrangeMode));
      arrange.textContent=fleetArrangeMode?'✓ ARRANGING TOONS':'↕ ARRANGE TOONS';
    }
    if(reset)reset.disabled=!(fleetSettings.order||[]).length;
    if(hint)hint.textContent=fleetArrangeMode?'Drag a toon above or below another':'Fits grouped by hull • Z→A';

    list.querySelectorAll('.fleet-member').forEach(row=>{
      row.addEventListener('dragstart',event=>{
        if(!fleetArrangeMode){event.preventDefault();return}
        fleetDragId=String(row.dataset.id||'');
        row.classList.add('dragging');
        if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',fleetDragId)}
      });
      row.addEventListener('dragover',event=>{
        if(!fleetArrangeMode||!fleetDragId||fleetDragId===String(row.dataset.id||''))return;
        event.preventDefault();
        list.querySelectorAll('.drag-before,.drag-after').forEach(item=>{if(item!==row)item.classList.remove('drag-before','drag-after')});
        const after=event.clientY>row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;
        row.classList.toggle('drag-after',after);
        row.classList.toggle('drag-before',!after);
        if(event.dataTransfer)event.dataTransfer.dropEffect='move';
      });
      row.addEventListener('dragleave',event=>{
        if(event.relatedTarget&&row.contains(event.relatedTarget))return;
        row.classList.remove('drag-before','drag-after');
      });
      row.addEventListener('drop',event=>{
        if(!fleetArrangeMode||!fleetDragId)return;
        event.preventDefault();
        const targetId=String(row.dataset.id||'');
        const after=row.classList.contains('drag-after');
        const ids=chars.map(character=>String(character.characterId));
        const from=ids.indexOf(fleetDragId);
        if(from>=0&&targetId&&targetId!==fleetDragId){
          ids.splice(from,1);
          const targetIndex=ids.indexOf(targetId);
          ids.splice(Math.max(0,targetIndex+(after?1:0)),0,fleetDragId);
          fleetSettings.order=ids;
          localStorage.setItem('jlrFleet',JSON.stringify(fleetSettings));
          renderFleet();
        }
      });
      row.addEventListener('dragend',()=>{
        fleetDragId='';
        list.querySelectorAll('.dragging,.drag-before,.drag-after').forEach(item=>item.classList.remove('dragging','drag-before','drag-after'));
      });
    });

    list.querySelectorAll('.fleet-member-check').forEach(input=>input.addEventListener('change',()=>{
      const id=input.dataset.id;if(!fleetSettings.members[id])fleetSettings.members[id]={enabled:false,fittingId:''};
      fleetSettings.members[id].enabled=input.checked;saveFleet();
    }));
    list.querySelectorAll('.fleet-fit-select').forEach(select=>select.addEventListener('change',()=>{
      const id=select.dataset.id;if(!fleetSettings.members[id])fleetSettings.members[id]={enabled:false,fittingId:''};
      fleetSettings.members[id].fittingId=select.value;saveFleet();
    }));

    const boostLabel=booster&&boosterFit&&boosterInFleet()?` • ${boosterFit.shipName} boost`:'';
    $('setupSummary').textContent=stats.count?`${stats.count} miners • ${fmt(stats.total,'m3')} m³/hr @ ${Number(fleetSettings.uptime).toFixed(0)}%${boostLabel} • ${Number(fleetSettings.payout).toFixed(1)}% payout`:`No miners selected${boostLabel}`;
    localStorage.setItem('jlrFleet',JSON.stringify(fleetSettings));
  }
  function renderSelect(){
    if(!state)return;
    const systemSelect=$('systemSelect');
    if(document.activeElement===systemSelect)return;
    const old=selectedSystem||systemSelect.value; systemSelect.innerHTML='';
    for(const ore of state.source.ores){const g=document.createElement('optgroup');g.label=`#${ore.rank} ${ore.name.toUpperCase()}`;for(const d of definitions().filter(x=>x.rank===ore.rank)){const f=field(d.system),o=document.createElement('option');o.value=d.system;const esi=f.status==='picked'&&f.autoReopenedAt?' • ESI VERIFIED':'';o.textContent=`${d.system} — ${f.status==='cleared'?`RED • RESPAWN ${timer(f.timerEndsAt)}`:statusText[f.status]}${esi}${f.cherryPicked?' 🍒 CHERRY':''}`;g.appendChild(o)}systemSelect.appendChild(g)}
    selectedSystem=definitions().some(x=>x.system===old)?old:(definitions()[0]?.system||'');
    systemSelect.value=selectedSystem;
  }
  function chooseSystem(system){selectedSystem=system;$('systemSelect').value=system;$('fieldNote').value='';renderSelect();renderBoards();renderSelected();renderNotes()}
  function node(d,f,includeTimer=true){
    const b=document.createElement('div');
    const key=boardKey('t3',d.system);
    const favorite=isBoardFavorite('t3',d.system);
    b.className='system-node';
    b.dataset.status=f.status;
    b.dataset.system=d.system;
    b.dataset.boardKey=key;
    b.setAttribute('role','button');
    b.setAttribute('tabindex','0');
    b.setAttribute('aria-label',`${d.system}, ${d.ore}, ${statusText[f.status]}`);
    b.classList.toggle('favorite',favorite);
    b.classList.toggle('arrange-mode',boardArrangeMode);
    b.draggable=boardArrangeMode;
    if(d.system===selectedSystem)b.classList.add('selected');
    const line=f.status==='cleared'?`RESPAWN ${timer(f.timerEndsAt)}`:f.status==='picked'?(f.autoReopenedAt?'PICKED • ESI':'PICKED'):'MINEABLE';
    const distance=d.distanceLy==null?NaN:Number(d.distanceLy);
    const distanceText=Number.isFinite(distance)?` • ${distance.toFixed(2)} LY`:'';
    const scanLine=boardScanLine(d.system);
    b.innerHTML=`${f.cherryPicked?'<span class="cherry-pin">🍒</span>':''}<button class="favorite-toggle" type="button" aria-pressed="${favorite}" title="${favorite?'Remove from favorites':'Favorite this system'}">${favorite?'★':'☆'}</button>${boardArrangeMode?'<span class="drag-grip" aria-hidden="true">⠿</span>':''}<span class="sys-name">${esc(d.system)}</span><span class="sys-ore">#${d.rank} ${esc(d.ore)}</span>${includeTimer?`<span class="sys-state">${line}${distanceText}</span>`:''}<span class="sys-scan${scanLine.stale?' stale':''}">${esc(scanLine.text)}</span>`;
    b.title=`${d.system} • ${d.ore} • ${statusText[f.status]}${favorite?' • Favorite':''}${f.autoReopenedAt?` • ESI mining detected ${ago(f.autoReopenedAt)}`:''}${Number.isFinite(distance)?` • ${distance.toFixed(2)} LY from C-N4OD`:''} • ${scanLine.title}${f.cherryPicked?' • Cherry Picked':''}${f.notes?.length?` • ${f.notes.length} notes`:''}`;

    b.querySelector('.favorite-toggle').addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();toggleBoardFavorite('t3',d.system);sfx('select');
    });
    b.addEventListener('click',e=>{
      if(e.target.closest('.favorite-toggle'))return;
      if(Date.now()<boardSuppressClickUntil)return;
      chooseSystem(d.system);
    });
    b.addEventListener('keydown',e=>{
      if(e.target!==b)return;
      if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseSystem(d.system)}
    });
    attachBoardDrag(b,key);
    return b;
  }

  function attachBoardDrag(card,key){
    card.addEventListener('dragstart',e=>{
      if(!boardArrangeMode){e.preventDefault();return}
      boardDragKey=key;
      card.classList.add('dragging');
      if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',key)}
    });
    card.addEventListener('dragover',e=>{
      if(!boardArrangeMode||!boardDragKey||boardDragKey===key)return;
      const favorites=favoriteBoardKeys();
      if(favorites.has(boardDragKey)!==favorites.has(key))return;
      e.preventDefault();
      card.classList.add('drag-over');
      if(e.dataTransfer)e.dataTransfer.dropEffect='move';
    });
    card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
    card.addEventListener('drop',e=>{
      e.preventDefault();card.classList.remove('drag-over');
      moveBoardItem(boardDragKey,key);
    });
    card.addEventListener('dragend',()=>{
      boardDragKey='';
      boardSuppressClickUntil=Date.now()+180;
      document.querySelectorAll('.system-node.dragging,.system-node.drag-over').forEach(node=>node.classList.remove('dragging','drag-over'));
    });
  }

  function iceBoardNode(row){
    const card=document.createElement('div');
    const key=boardKey('ice',row.system);
    const favorite=isBoardFavorite('ice',row.system);
    card.className='system-node ice-system-node';
    card.dataset.status='ice';
    card.dataset.system=row.system;
    card.dataset.boardKey=key;
    card.classList.toggle('favorite',favorite);
    card.classList.toggle('arrange-mode',boardArrangeMode);
    card.draggable=boardArrangeMode;
    card.setAttribute('role','group');
    const fields=Math.max(1,Number(row.iceBelts)||1);
    const distance=Number(row.distanceLy);
    const scanLine=boardScanLine(row.system);
    const iceScan=state?.scans?.[row.system]?.ice||null;
    const seen=iceScan?Math.min(fields,Math.max(0,Number(iceScan.seen)||0)):null;
    const missing=seen==null?null:Math.max(0,fields-seen);
    const coverage=seen==null
      ?`ICE ?/${fields} • NEED SCAN`
      :missing>0
        ?`ICE ${seen}/${fields} SEEN • ${missing} MISSING`
        :`ICE ${seen}/${fields} SEEN • ALL PRESENT`;
    card.innerHTML='<button class="favorite-toggle" type="button" aria-pressed="'+favorite+'" title="'+(favorite?'Remove from favorites':'Favorite this system')+'">'+(favorite?'★':'☆')+'</button>'+
      (boardArrangeMode?'<span class="drag-grip" aria-hidden="true">⠿</span>':'')+
      '<span class="sys-name">'+esc(row.system)+'</span>'+
      '<span class="sys-ore">'+fields+' ICE FIELD'+(fields===1?'':'S')+'</span>'+
      '<span class="sys-state">IN TITAN RANGE'+(Number.isFinite(distance)?' • '+distance.toFixed(2)+' LY':'')+'</span>'+
      '<span class="sys-ice-coverage'+(missing>0||seen==null?' missing':'')+'">'+esc(coverage)+'</span>'+
      '<span class="sys-scan'+(scanLine.stale?' stale':'')+'">'+esc(scanLine.text)+'</span>';
    card.title=row.system+' • '+fields+' ice field'+(fields===1?'':'s')+(favorite?' • Favorite':'')+(Number.isFinite(distance)?' • '+distance.toFixed(2)+' LY from C-N4OD':'')+' • '+coverage+' • '+scanLine.title+' • within configured Titan bridge range';
    card.querySelector('.favorite-toggle').addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();toggleBoardFavorite('ice',row.system);sfx('select');
    });
    attachBoardDrag(card,key);
    return card;
  }

  function a0BoardNode(row){
    const card=document.createElement('div');
    const key=boardKey('a0',row.system);
    const favorite=isBoardFavorite('a0',row.system);
    const scan=row.scan||{};
    const checkedMs=Date.parse(scan.lastCheckedAt||'');
    const due=scan.due||!Number.isFinite(checkedMs)||Date.now()-checkedMs>=12*60*60*1000;
    const a0State=due?'needs-update':scan.detected?'active':'clear';
    card.className='system-node a0-system-node';
    card.dataset.status='a0';
    card.dataset.a0State=a0State;
    card.dataset.system=row.system;
    card.dataset.boardKey=key;
    card.classList.toggle('favorite',favorite);
    card.classList.toggle('arrange-mode',boardArrangeMode);
    card.draggable=boardArrangeMode;
    card.setAttribute('role','group');
    const distance=Number(row.distanceLy);
    const spectral=String(row.spectralClass||'A0');
    const stateLine=due?'NEEDS UPDATE • PASTE SCAN':scan.detected?'A0 SITE ACTIVE':'NO A0 SITE';
    const scanLine=boardScanLine(row.system);
    card.innerHTML='<button class="favorite-toggle" type="button" aria-pressed="'+favorite+'" title="'+(favorite?'Remove from favorites':'Favorite this system')+'">'+(favorite?'★':'☆')+'</button>'+
      (boardArrangeMode?'<span class="drag-grip" aria-hidden="true">⠿</span>':'')+
      '<span class="sys-name">'+esc(row.system)+'</span>'+
      '<span class="sys-ore">BLUE '+esc(spectral)+' STAR'+(Number.isFinite(distance)?' • '+distance.toFixed(2)+' LY':'')+'</span>'+
      '<span class="sys-state">'+esc(stateLine)+'</span>'+
      '<span class="sys-scan'+(scanLine.stale?' stale':'')+'">'+esc(scanLine.text)+'</span>';
    card.title=row.system+' • '+spectral+' Blue star'+(favorite?' • Favorite':'')+(Number.isFinite(distance)?' • '+distance.toFixed(2)+' LY from C-N4OD':'')+(due?' • Needs Probe Scanner update':scan.detected?' • A0 rare asteroid site detected':' • Checked; no active A0 site detected')+' • refresh due every 12 hours';
    card.querySelector('.favorite-toggle').addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();toggleBoardFavorite('a0',row.system);sfx('select');
    });
    attachBoardDrag(card,key);
    return card;
  }

  function renderBoards(){
    if(!state)return;
    const board=$('fieldBoard');
    syncBoardControls();
    board.innerHTML='';
    let counts={ready:0,picked:0,cleared:0,cherry:0};
    const iceFields=Array.isArray(state.source?.iceFields)?state.source.iceFields:[];
    const a0Fields=Array.isArray(state.source?.a0Fields)?state.source.a0Fields:[];
    const a0Due=a0Fields.filter(row=>row.scan?.due||!row.scan?.lastCheckedAt||Date.now()-Date.parse(row.scan.lastCheckedAt)>=12*60*60*1000).length;
    const a0Filter=document.querySelector('.filter[data-filter="a0"]');
    if(a0Filter)a0Filter.textContent=a0Due?`A0 • ${a0Due} UPDATE`:'A0 ✓';

    for(const d of definitions()){
      const f=field(d.system);
      counts[f.status]++;
      if(f.cherryPicked)counts.cherry++;
    }

    for(const entry of orderedBoardEntries()){
      if(entry.kind==='t3'){
        if(filter==='all'||filter===entry.f.status||(filter==='cherry'&&entry.f.cherryPicked))board.appendChild(node(entry.d,entry.f,true));
      }else if(entry.kind==='ice'&&(filter==='all'||filter==='ice')){
        board.appendChild(iceBoardNode(entry.row));
      }else if(entry.kind==='a0'&&(filter==='a0'||(filter==='all'&&entry.row.scan?.detected))){
        // Confirmed A0 sites belong on the main board too. Once confirmed, they
        // remain visible there when stale so the 12-hour NEEDS UPDATE state is obvious.
        board.appendChild(a0BoardNode(entry.row));
      }
    }

    $('statusCounts').textContent=`${counts.ready} mineable • ${counts.picked} picked • ${counts.cleared} respawning • ${counts.cherry} cherry • ${iceFields.length} ice • ${a0Fields.length} A0 • ${a0Due} need update`;
    $('systemCountLabel').textContent=`${definitions().length} T3 • ${iceFields.length} ICE • ${a0Fields.length} A0`;
    if(filter==='a0'&&!a0Fields.length)board.innerHTML='<div class="target-empty"><strong>No A0 systems found within 6 LY.</strong><span>The server scans Fountain star spectral classes through ESI. Active rare-asteroid anomalies themselves are not exposed remotely.</span></div>';
  }
  function renderHits(){
    if(!state)return;
    const ores=state.source?.ores||[];
    const oreNames=ores.map(ore=>ore.name);
    if(targetOre!=='auto'&&!oreNames.includes(targetOre))targetOre='auto';

    const oreSelect=$('targetOreSelect');
    if(oreSelect&&document.activeElement!==oreSelect){
      oreSelect.innerHTML='<option value="auto">AUTO • BEST VALUE</option>'+ores.map(ore=>'<option value="'+esc(ore.name)+'">#'+ore.rank+' • '+esc(ore.name.toUpperCase())+'</option>').join('');
      oreSelect.value=targetOre;
    }

    const all=definitions()
      .map(d=>({d,f:field(d.system)}))
      .filter(x=>targetOre==='auto'||x.d.ore===targetOre);
    const arr=all
      .filter(x=>x.f.status!=='cleared')
      .sort((a,b)=>Number(a.f.cherryPicked)-Number(b.f.cherryPicked)||a.d.rank-b.d.rank||a.d.order-b.d.order)
      .slice(0,12);

    const host=$('hitOrder');
    host.innerHTML='';

    const summary=$('targetSummary');
    if(summary){
      if(targetOre==='auto')summary.textContent='highest-value mineable fields first • 🍒 cherry-picked fields go last';
      else summary.textContent=`${arr.length} available ${targetOre} system${arr.length===1?'':'s'} • click a card to select it on the field board`;
    }

    for(const [i,x] of arr.entries()){
      const b=document.createElement('button');
      b.type='button';
      b.className=`target-card ${x.f.cherryPicked?'cherry':x.f.status==='picked'?'yellow':'green'} ${i===0?'priority-first':''}`;

      const distance=x.d.distanceLy==null?NaN:Number(x.d.distanceLy);
      const payout=projectedISK(state.source.ores[x.d.rank-1]);
      const stateLabel=x.f.cherryPicked?'CHERRY PICKED':x.f.status==='picked'?(x.f.autoReopenedAt?'PICKED • ESI VERIFIED':'PICKED'):'MINEABLE';
      const priorityLabel=i===0?'MINE FIRST':i===1?'NEXT':'PRIORITY';

      b.innerHTML=`
        <span class="target-rank">
          <strong>${i+1}</strong>
          <small>${priorityLabel}</small>
        </span>
        <span class="target-main">
          <strong>${esc(x.d.system)}</strong>
          <span class="target-ore">#${x.d.rank} ${esc(x.d.ore)}</span>
          <span class="target-state">${stateLabel}</span>
        </span>
        <span class="target-meta">
          <span>DISTANCE FROM C-N</span>
          <strong>${Number.isFinite(distance)?distance.toFixed(2)+' LY':'—'}</strong>
        </span>
        <span class="target-meta target-payout">
          <span>FLEET PAYOUT / HR</span>
          <strong>${fmt(payout)}</strong>
          <small>ISK/hr</small>
        </span>`;

      b.setAttribute('aria-label',`Priority ${i+1}: ${x.d.system}, ${x.d.ore}, ${Number.isFinite(distance)?distance.toFixed(2)+' light years from C-N4OD, ':''}${fmt(payout)} ISK per hour, ${stateLabel}`);
      b.addEventListener('click',()=>chooseSystem(x.d.system));
      host.appendChild(b);
    }

    if(!arr.length){
      const respawning=all.filter(x=>x.f.status==='cleared').sort((a,b)=>Date.parse(a.f.timerEndsAt||0)-Date.parse(b.f.timerEndsAt||0));
      if(targetOre!=='auto'&&respawning.length){
        const next=respawning[0];
        host.innerHTML=`<div class="target-empty"><strong>No ${esc(targetOre)} systems are mineable right now.</strong><span>${respawning.length} system${respawning.length===1?' is':'s are'} respawning. Next: ${esc(next.d.system)} in ${esc(timer(next.f.timerEndsAt))}.</span></div>`;
      }else{
        host.innerHTML='<div class="target-empty"><strong>No mineable T3 fields right now.</strong><span>Cleared fields will return after their respawn timers finish.</span></div>';
      }
    }
  }
  function fleetHistoryRows(days=fleetHistoryDays){
    const source=Array.isArray(state?.esi?.performance?.daily)?state.esi.performance.daily:[];
    const byDate=new Map(source.map(row=>[String(row.date||''),row]));
    const today=new Date();
    today.setUTCHours(0,0,0,0);
    const rows=[];
    for(let offset=days-1;offset>=0;offset--){
      const date=new Date(today.getTime()-offset*86400000).toISOString().slice(0,10);
      const row=byDate.get(date)||{};
      rows.push({date,m3:Number(row.m3||0),jbv:Number(row.jbv||0),ores:row.ores&&typeof row.ores==='object'?row.ores:{}});
    }
    return rows;
  }
  function renderFleetActivityChart(el,samples,target){
    if(!el)return;
    const rows=(samples||[]).filter(row=>Number.isFinite(Date.parse(row?.at||''))).slice(-48);
    if(!rows.length){
      el.innerHTML='<div class="visual-empty">Live activity history will begin after the next ESI ledger sync.</div>';
      return;
    }
    const W=760,H=250,L=58,R=18,T=22,B=34,pw=W-L-R,ph=H-T-B;
    const values=rows.map(row=>Math.max(0,Number(row.actualM3PerHour)||0));
    const max=Math.max(1,Number(target)||0,...values)*1.12;
    const x=i=>rows.length<=1?L+pw/2:L+i/(rows.length-1)*pw;
    const y=v=>T+(1-Math.min(max,Math.max(0,Number(v)||0))/max)*ph;
    let grid='';
    for(let i=0;i<=4;i++){
      const yy=T+i/4*ph,value=max*(1-i/4);
      grid+=`<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W-R}" y2="${yy.toFixed(1)}" class="fleet-chart-grid"/><text x="${L-7}" y="${(yy+3).toFixed(1)}" text-anchor="end" class="fleet-chart-axis">${esc(compactNumber(value))}</text>`;
    }
    const points=rows.map((row,i)=>`${x(i).toFixed(1)} ${y(values[i]).toFixed(1)}`);
    const line='M '+points.join(' L ');
    const area=line+` L ${x(rows.length-1).toFixed(1)} ${T+ph} L ${x(0).toFixed(1)} ${T+ph} Z`;
    const dots=rows.map((row,i)=>{
      const when=new Date(row.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
      const title=`${when} • ${fmt(values[i],'m3')} m³/hr • ${Number(row.activeToons||0)} active of ${Number(row.sampledToons||0)} sampled`;
      return `<circle cx="${x(i).toFixed(1)}" cy="${y(values[i]).toFixed(1)}" r="3.2" class="fleet-activity-dot"><title>${esc(title)}</title></circle>`;
    }).join('');
    const targetLine=Number(target)>0?`<line x1="${L}" y1="${y(target).toFixed(1)}" x2="${W-R}" y2="${y(target).toFixed(1)}" class="fleet-target-line"/><text x="${W-R}" y="${(y(target)-5).toFixed(1)}" text-anchor="end" class="fleet-target-label">TARGET ${esc(compactNumber(target))} M³/HR</text>`:'';
    const labelIndexes=[0,Math.floor((rows.length-1)/2),rows.length-1];
    const labels=[...new Set(labelIndexes)].map(i=>`<text x="${x(i).toFixed(1)}" y="${H-10}" text-anchor="middle" class="fleet-chart-axis">${esc(new Date(rows[i].at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}))}</text>`).join('');
    el.innerHTML=`<svg class="fleet-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Live fleet mining rate from recent ESI ledger samples">${grid}<path d="${area}" class="fleet-activity-area"/><path d="${line}" class="fleet-activity-line"/>${targetLine}${dots}${labels}<text x="${W-R}" y="${T-7}" text-anchor="end" class="fleet-chart-unit">M³/HR</text></svg>`;
  }
  function renderFleetDailyChart(el,rows,metric){
    if(!el)return;
    const payout=Number(fleetSettings.payout||95)/100;
    const values=rows.map(row=>metric==='value'?Math.max(0,Number(row.jbv)||0)*payout:Math.max(0,Number(row.m3)||0));
    if(!values.some(value=>value>0)){
      el.innerHTML='<div class="visual-empty">Daily history will fill from linked EVE mining ledgers.</div>';
      return;
    }
    const W=760,H=250,L=58,R=16,T=22,B=34,pw=W-L-R,ph=H-T-B,max=Math.max(1,...values)*1.1;
    const slot=pw/Math.max(1,rows.length),bar=Math.max(2,Math.min(28,slot*.68));
    const y=value=>T+(1-value/max)*ph;
    let grid='';
    for(let i=0;i<=4;i++){
      const yy=T+i/4*ph,value=max*(1-i/4);
      grid+=`<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W-R}" y2="${yy.toFixed(1)}" class="fleet-chart-grid"/><text x="${L-7}" y="${(yy+3).toFixed(1)}" text-anchor="end" class="fleet-chart-axis">${esc(compactNumber(value))}</text>`;
    }
    const bars=rows.map((row,i)=>{
      const value=values[i],height=Math.max(value>0?1:0,(value/max)*ph),xx=L+i*slot+(slot-bar)/2,yy=T+ph-height;
      const label=metric==='value'?`${fmt(value)} ISK payout`:`${fmt(value,'m3')} m³`;
      return `<rect x="${xx.toFixed(1)}" y="${yy.toFixed(1)}" width="${bar.toFixed(1)}" height="${height.toFixed(1)}" rx="2" class="fleet-history-bar"><title>${esc(chartDateLabel(row.date)+' • '+label)}</title></rect>`;
    }).join('');
    const labelCount=Math.min(6,rows.length),indexes=new Set();
    if(rows.length===1)indexes.add(0);else for(let i=0;i<labelCount;i++)indexes.add(Math.round(i*(rows.length-1)/(labelCount-1)));
    const labels=[...indexes].map(i=>`<text x="${(L+i*slot+slot/2).toFixed(1)}" y="${H-10}" text-anchor="middle" class="fleet-chart-axis">${esc(chartDateLabel(rows[i].date))}</text>`).join('');
    el.innerHTML=`<svg class="fleet-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily fleet ${metric==='value'?'payout':'mining volume'} history">${grid}${bars}${labels}<text x="${W-R}" y="${T-7}" text-anchor="end" class="fleet-chart-unit">${metric==='value'?'ISK PAYOUT':'M³ MINED'}</text></svg>`;
  }
  function renderFleetOreMix(el,rows){
    if(!el)return;
    const totals=new Map();
    for(const row of rows)for(const [name,value] of Object.entries(row.ores||{}))totals.set(name,Number(totals.get(name)||0)+Math.max(0,Number(value)||0));
    const sorted=[...totals].filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]);
    if(!sorted.length){
      el.innerHTML='<div class="visual-empty">Ore mix will appear after synced ledger rows include ore types.</div>';
      return;
    }
    const grand=sorted.reduce((sum,[,value])=>sum+value,0),top=sorted.slice(0,8);
    const other=sorted.slice(8).reduce((sum,[,value])=>sum+value,0);
    if(other>0)top.push(['Other ores',other]);
    el.innerHTML=top.map(([name,value],index)=>{
      const share=grand>0?value/grand*100:0;
      return `<div class="ore-mix-row"><div><strong>${esc(name)}</strong><small>${fmt(value,'m3')} m³ • ${share.toFixed(1)}%</small></div><div class="ore-mix-track"><span style="width:${share.toFixed(2)}%;--ore-index:${index}"></span></div></div>`;
    }).join('');
  }
  function renderFleetPerformance(){
    if(!state||!$('fleetActivityChart'))return;
    const daily=fleetHistoryRows(fleetHistoryDays),samples=state.esi?.performance?.samples||[];
    const latest=samples.at(-1)||null,payout=Number(fleetSettings.payout||95)/100;
    const rangeM3=daily.reduce((sum,row)=>sum+Number(row.m3||0),0);
    const rangeValue=daily.reduce((sum,row)=>sum+Number(row.jbv||0),0)*payout;
    const best=daily.reduce((top,row)=>Number(row.m3||0)>Number(top?.m3||0)?row:top,null);
    const fleet=fleetStats(),target=Number(fleet.total||0);
    const liveRate=Number(latest?.actualM3PerHour||0);
    const sampleAge=latest?Date.now()-Date.parse(latest.at||''):Infinity;

    document.querySelectorAll('.fleet-range').forEach(button=>button.classList.toggle('active',Number(button.dataset.days)===fleetHistoryDays));
    document.querySelectorAll('.fleet-metric').forEach(button=>button.classList.toggle('active',button.dataset.metric===fleetHistoryMetric));
    $('fleetLiveStatus').textContent=state.esi?.syncing?'● SYNCING ESI':latest?(sampleAge<=45*60*1000?`● LIVE • ${ago(latest.at).toUpperCase()}`:`● LAST SAMPLE • ${ago(latest.at).toUpperCase()}`):'● WAITING FOR ESI';
    $('fleetLiveStatus').classList.toggle('stale',Boolean(latest&&sampleAge>45*60*1000));
    $('fleetLiveRate').textContent=latest?`${fmt(liveRate,'m3')} m³/hr`:'—';
    $('fleetLiveRateSub').textContent=latest?(liveRate>0?'latest detected mining interval':'no increase in latest interval'):'waiting for a mining interval';
    $('fleetActiveToons').textContent=latest?`${Number(latest.activeToons||0)} / ${Number(latest.sampledToons||0)}`:'—';
    $('fleetActiveToonsSub').textContent=latest?'active / sampled in latest sync':'detected in latest sample';
    $('fleetTodayM3').textContent=`${fmt(state.esi?.actual?.today?.m3||0,'m3')} m³`;
    $('fleetTodayPayout').textContent=`${fmt(actualValue(state.esi?.actual?.today?.jbv||0))} ISK`;
    $('fleetTodayPayoutSub').textContent=`tracked T3 value × ${(payout*100).toFixed(1)}% payout`;
    $('fleetRangeTotalLabel').textContent=`${fleetHistoryDays}D MINED`;
    $('fleetRangeTotal').textContent=`${fmt(rangeM3,'m3')} m³`;
    $('fleetRangeTotalSub').textContent=`${fmt(rangeValue)} ISK tracked payout`;
    $('fleetBestDay').textContent=best&&Number(best.m3)>0?`${fmt(best.m3,'m3')} m³`:'—';
    $('fleetBestDaySub').textContent=best&&Number(best.m3)>0?chartDateLabel(best.date):'no production history yet';
    $('fleetHistoryTitle').textContent=fleetHistoryMetric==='value'?'DAILY TRACKED PAYOUT':'DAILY MINING VOLUME';
    $('fleetHistorySubtitle').textContent=`last ${fleetHistoryDays} days • hover for daily totals`;
    $('fleetOreMixSubtitle').textContent=`last ${fleetHistoryDays} days • mined m³ by ore`;
    renderFleetActivityChart($('fleetActivityChart'),samples,target);
    renderFleetDailyChart($('fleetHistoryChart'),daily,fleetHistoryMetric);
    renderFleetOreMix($('fleetOreMix'),daily);
  }
  function renderMiningVisuals(){
    if(!state||!$('oreValueChart')||!$('fleetOutputChart'))return;

    const ores=state.source?.ores||[];
    const trendOnly=state.source?.trendOres||[];
    const trendOres=[...ores,...trendOnly.filter(extra=>!ores.some(ore=>ore.name===extra.name))];
    const oreNames=trendOres.map(ore=>ore.name);
    if(!oreNames.includes(oreTrendType))oreTrendType=oreNames[0]||'Kylixium';
    const oreSelect=$('oreTrendSelect');
    if(oreSelect&&document.activeElement!==oreSelect){
      oreSelect.innerHTML=trendOres.map(ore=>'<option value="'+esc(ore.name)+'">'+esc(ore.name)+(trendOnly.some(extra=>extra.name===ore.name)?' • A0 ORE':'')+'</option>').join('');
      oreSelect.value=oreTrendType;
    }
    const trendOre=trendOres.find(ore=>ore.name===oreTrendType)||trendOres[0]||null;
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

    function activeTimeLabel(seconds){
      const s=Math.max(0,Number(seconds)||0);
      if(!s)return'no ledger increase detected';
      const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);
      return h?(`${h}h ${m}m active`):(`${Math.max(1,m)}m active`);
    }

    const contributionRows=entries.map((entry,index)=>{
      const fullRate=Number(entry.rawM3)||0;
      const output=Number(entry.effectiveM3)||0;
      const ledger=entry.character?.ledgerActivity||null;
      const actual=Number(ledger?.actualM3PerHour);
      const hasActual=Boolean(ledger?.miningDetected)&&Number.isFinite(actual)&&actual>0;
      const targetPct=output>0&&hasActual?actual/output*100:null;
      const share=effective>0?output/effective*100:0;
      const delta=average>0?(output-average)/average*100:0;
      return `<div class="fleet-perf-row">
        <div class="fleet-perf-miner">
          <strong>${esc(entry.character.name)}</strong>
          <small>${esc(entry.fit?.shipName||'Ship')} • ${delta>=0?'+':''}${delta.toFixed(1)}% vs fleet avg</small>
        </div>
        <div class="fleet-rate-pair">
          <div><span>100% RATE</span><strong>${fmt(fullRate,'m3')}</strong><small>m³/hr</small></div>
          <div><span>@ ${uptime.toFixed(0)}% TARGET</span><strong>${fmt(output,'m3')}</strong><small>m³/hr</small></div>
          <div class="ledger-rate"><span>LEDGER ACTIVE RATE</span><strong>${hasActual?fmt(actual,'m3'):'—'}</strong><small>${hasActual?activeTimeLabel(ledger.activeSeconds):'starts after EVE ledger quantity increases'}</small></div>
        </div>
        <div class="fleet-share-track"><span style="width:${targetPct==null?0:Math.min(100,targetPct).toFixed(2)}%"></span></div>
        <div class="fleet-perf-number"><strong>${targetPct==null?'—':targetPct.toFixed(0)+'%'}</strong><small>of uptime target</small></div>
      </div>`;
    }).join('');

    const detectedRows=entries.map(entry=>{
      const p=entry.character?.ledgerActivity;
      const v=Number(p?.actualM3PerHour);
      return p?.miningDetected&&Number.isFinite(v)&&v>0?{actual:v,target:Number(entry.effectiveM3)||0}:null;
    }).filter(Boolean);
    const ledgerActual=detectedRows.reduce((sum,row)=>sum+row.actual,0);
    const detectedTarget=detectedRows.reduce((sum,row)=>sum+row.target,0);
    const actualVsTarget=detectedTarget>0?ledgerActual/detectedTarget*100:null;

    $('fleetOutputChart').innerHTML=`
      <div class="fleet-perf-kpis">
        <div class="ledger-kpi"><span>LEDGER ACTIVE RATE</span><strong>${detectedRows.length?fmt(ledgerActual,'m3'):'—'}</strong><small>${detectedRows.length} of ${entries.length} miners detected</small></div>
        <div><span>@ ${uptime.toFixed(0)}% TARGET</span><strong>${fmt(effective,'m3')}</strong><small>projected m³/hr</small></div>
        <div><span>100% RATE</span><strong>${fmt(potential,'m3')}</strong><small>full calculated m³/hr</small></div>
        <div><span>VS DETECTED TARGET</span><strong>${actualVsTarget==null?'—':actualVsTarget.toFixed(0)+'%'}</strong><small>actual rate ÷ target for detected miners</small></div>
      </div>
      <div class="fleet-capacity-chart">
        <div class="fleet-capacity-head"><span>ACTUAL VS UPTIME TARGET</span><strong>${detectedRows.length?fmt(ledgerActual,'m3'):'—'} / ${fmt(effective,'m3')} m³/hr</strong></div>
        <div class="fleet-capacity-track actual-target"><span style="width:${actualVsTarget==null?0:Math.min(100,actualVsTarget).toFixed(2)}%"></span></div>
        <div class="fleet-capacity-scale"><span>only miners with detected ledger increases</span><span>${uptime.toFixed(0)}% target for detected miners</span></div>
      </div>
      <div class="fleet-perf-list">${contributionRows}</div>
      <div class="fleet-perf-footer">
        <span>Ledger time counts only intervals where mined m³ increased.</span>
        <span>Idle intervals are excluded.</span>
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
    $('iceTrackValueSub').textContent=selected?(selected.name+' • '+Math.round(selected.pct*100)+'% of Jita refine • prices '+ago(state.market?.lastUpdatedAt)):'Waiting for Jita refined-product prices';
    $('iceBestJita').textContent=selected?.jita?fmt(selected.jita)+' ISK':'—';
    $('iceBestJitaSub').textContent=selected?(selected.name+' • refined ISK/block • Heavy Water excluded'):'Jita refined-product prices unavailable';
    $('iceBestCn').textContent=selected?.cn?fmt(selected.cn)+' ISK':'—';
    $('iceBestCnSub').textContent=selected?(selected.name+' • private-market ISK/block • Heavy Water excluded'):'C-N private refined-product prices unavailable';

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
          '<div><span>Tracking payout</span><strong>'+(row.track?fmt(row.track):'—')+'</strong></div>'+
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
          '<div><span>Payout/hr</span><strong>'+(track?fmt(track):'—')+'</strong></div>'+
          '<div><span>Jita refine/hr</span><strong>'+(jita?fmt(jita):'—')+'</strong></div>'+
          '<div><span>C-N refine/hr</span><strong>'+(cn?fmt(cn):'—')+'</strong></div>'+
        '</div>';
      }).join('');
      $('iceFleetOutput').innerHTML=body+
        '<div class="ice-fleet-total"><span>'+esc(iceTrackType)+' fleet total</span><strong>'+
        totalBlocks.toFixed(1)+' blocks/hr • '+fmt(totalM3,'m3')+' m³/hr</strong><small>Payout '+
        (totalTrack?fmt(totalTrack):'—')+'/hr • Jita refine '+(totalJita?fmt(totalJita):'—')+
        '/hr • C-N refine '+(totalCn?fmt(totalCn):'—')+'/hr</small></div>';
    }
  }
  function renderGasHuffing(){
    if(!state||!$('gasFleetOutput'))return;
    const gasData=state.source?.gas||null;
    const regions=gasData?.regions||{};
    const types=gasData?.types||{};
    const regionNames=Object.keys(regions);
    if(!gasData||!regionNames.length){
      $('gasFleetOutput').innerHTML='<div class="visual-empty">Gas data is not loaded yet.</div>';
      return;
    }

    if(!regions[gasRegion])gasRegion=regionNames[0];
    const region=regions[gasRegion]||{};
    const regionGases=Array.isArray(region.gases)?region.gases.filter(name=>types[name]):[];
    if(!regionGases.includes(gasType))gasType=region.defaultGas&&types[region.defaultGas]?region.defaultGas:(regionGases[0]||Object.keys(types)[0]||'');
    localStorage.setItem('jlrGasRegion',gasRegion);
    localStorage.setItem('jlrGasType',gasType);

    const regionSelect=$('gasRegionSelect');
    if(regionSelect&&document.activeElement!==regionSelect){
      regionSelect.innerHTML=regionNames.map(name=>'<option value="'+esc(name)+'">'+esc(name.toUpperCase())+'</option>').join('');
      regionSelect.value=gasRegion;
    }
    const typeSelect=$('gasTypeSelect');
    if(typeSelect&&document.activeElement!==typeSelect){
      typeSelect.innerHTML=regionGases.map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('');
      typeSelect.value=gasType;
    }

    const gas=types[gasType]||null;
    if(!gas){
      $('gasFleetOutput').innerHTML='<div class="visual-empty">The selected gas type is not loaded yet.</div>';
      return;
    }
    const market=gas.market||{};
    const gasVolume=Math.max(.001,Number(gas.volume)||10);
    const rawJita=Number(market.raw?.jita?.buy);
    const rawCn=Number(market.raw?.cn?.buy);
    const compressedJita=Number(market.compressed?.jita?.buy);
    const compressedCn=Number(market.compressed?.cn?.buy);
    const uptime=Math.min(100,Math.max(1,Number(fleetSettings.uptime)||100))/100;
    const gasFamily=/Mykoserocin/i.test(gasType)?'MYKOSEROCIN':'CYTOSEROCIN';

    $('gasRegionEyebrow').textContent=gasRegion.toUpperCase()+' • '+gasFamily;
    $('gasRawLabel').textContent='RAW JITA / UNIT';
    $('gasCompressedLabel').textContent='COMPRESSED JITA / UNIT';
    $('gasRawJita').textContent=Number.isFinite(rawJita)&&rawJita>0?fmt(rawJita)+' ISK':'—';
    $('gasRawJitaSub').textContent=Number.isFinite(rawCn)&&rawCn>0
      ?gasType+' • C-N '+fmt(rawCn)+' • prices '+ago(state.market?.lastUpdatedAt)
      :gasType+' • prices '+ago(state.market?.lastUpdatedAt);
    $('gasCompressedJita').textContent=Number.isFinite(compressedJita)&&compressedJita>0?fmt(compressedJita)+' ISK':'—';
    $('gasCompressedJitaSub').textContent=Number.isFinite(compressedCn)&&compressedCn>0
      ?'compressed 1:1 • C-N '+fmt(compressedCn)
      :'compressed 1:1 equivalent';
    $('gasOpsType').textContent=gasType;
    $('gasOpsRegion').textContent=gasRegion+' • '+gasVolume.toFixed(gasVolume%1?1:0)+' m³ per raw unit';
    $('gasSiteTitle').textContent='KNOWN '+gasRegion.toUpperCase()+' • '+gasType.toUpperCase()+' SITES';

    const boosterId=String(calcSettings.boosterCharacterId||'');
    const selected=(me?.characters||[]).filter(ch=>{
      const id=String(ch.characterId);
      return fleetSettings.members?.[id]?.enabled&&id!==boosterId;
    });
    const rows=selected.map(ch=>{
      const fit=selectedFleetFit(ch);
      return gasFitStats(ch,fit)||{character:ch,fit,notApplicable:true};
    });
    const valid=rows.filter(row=>!row.notApplicable&&!row.error&&row.m3PerHour>0);
    const actionable=rows.filter(row=>!row.notApplicable&&(row.error||!row.m3PerHour));
    const hiddenNonGas=rows.filter(row=>row.notApplicable).length;
    const fullM3=valid.reduce((sum,row)=>sum+Number(row.m3PerHour||0),0);
    const targetM3=fullM3*uptime;
    const fullUnits=fullM3/gasVolume;
    const targetUnits=fullUnits*uptime;
    const rawJitaHour=Number.isFinite(rawJita)&&rawJita>0?targetUnits*rawJita:0;
    const rawCnHour=Number.isFinite(rawCn)&&rawCn>0?targetUnits*rawCn:0;
    const compressedJitaHour=Number.isFinite(compressedJita)&&compressedJita>0?targetUnits*compressedJita:0;

    $('gasFleetM3').textContent=valid.length?fmt(targetM3,'m3')+' m³/hr':'—';
    $('gasFleetM3Sub').textContent=valid.length
      ?valid.length+' gas huffer'+(valid.length===1?'':'s')+' • '+Math.round(uptime*100)+'% uptime • '+fmt(fullM3,'m3')+' full rate'
      :'Select gas fits in Fleet & Fits';
    $('gasFleetIsk').textContent=rawJitaHour?fmt(rawJitaHour)+' ISK/hr':'—';
    $('gasFleetIskSub').textContent=rawJitaHour
      ?fmt(targetUnits)+' '+gasType+' units/hr • raw Jita buy'
      :'Waiting for gas fleet + Jita price';

    if(!rows.length){
      $('gasFleetOutput').innerHTML='<div class="gas-fit-status empty"><strong>NO GAS FLEET SELECTED</strong><small>Select gas huffers in Fleet & Fits to calculate output.</small></div>';
    }else if(!valid.length&&!actionable.length){
      $('gasFleetOutput').innerHTML='<div class="gas-fit-status empty"><strong>NO APPLICABLE GAS FITS</strong><small>'+fmt(hiddenNonGas)+' selected fleet member'+(hiddenNonGas===1?' is':'s are')+' currently using non-gas fits.</small></div>';
    }else{
      const body=[...valid,...actionable].map(row=>{
        if(row.error||!row.m3PerHour){
          return '<div class="gas-fit-issue"><div><strong>'+esc(row.character?.name||'Huffer')+'</strong><small>'+esc(row.fit?.name||'Gas fit')+'</small></div><span>'+esc(row.error||'Gas fit needs attention')+'</span></div>';
        }
        const m3=row.m3PerHour*uptime,units=m3/gasVolume;
        const jita=Number.isFinite(rawJita)&&rawJita>0?units*rawJita:0;
        const boostName=row.boost?.ship&&row.boost.ship!=='None'?row.boost.ship:'No boost';
        const range=row.range>0?(row.range/1000).toFixed(1)+' km':'—';
        return '<div class="ice-fleet-row gas-fleet-row">'+
          '<div><strong>'+esc(row.character.name)+'</strong><small>'+esc(row.fit.shipName)+' • '+esc(row.fit.name||'Saved fit')+' • '+esc(boostName)+' • '+range+' range</small></div>'+
          '<div><span>Cycle</span><strong>'+row.cycle.toFixed(1)+'s</strong></div>'+
          '<div><span>Units/hr</span><strong>'+fmt(units)+'</strong></div>'+
          '<div><span>m³/hr</span><strong>'+fmt(m3,'m3')+'</strong></div>'+
          '<div><span>Jita/hr</span><strong>'+(jita?fmt(jita):'—')+'</strong></div>'+
          '<div><span>Residue</span><strong>'+esc(row.residueSummary||'NONE')+'</strong></div>'+
        '</div>';
      }).join('');
      const hidden=hiddenNonGas
        ?'<div class="gas-fit-hidden"><strong>'+fmt(hiddenNonGas)+' NON-GAS FLEET MEMBER'+(hiddenNonGas===1?'':'S')+' HIDDEN</strong><span>Only applicable gas fits are shown here.</span></div>'
        :'';
      const total=valid.length
        ?'<div class="ice-fleet-total"><span>'+esc(gasType)+' fleet target</span><strong>'+
          fmt(targetUnits)+' units/hr • '+fmt(targetM3,'m3')+' m³/hr</strong><small>Raw Jita '+
          (rawJitaHour?fmt(rawJitaHour):'—')+'/hr • Raw C-N '+(rawCnHour?fmt(rawCnHour):'—')+
          '/hr • Compressed Jita '+(compressedJitaHour?fmt(compressedJitaHour):'—')+'/hr</small></div>'
        :'';
      $('gasFleetOutput').innerHTML=body+hidden+total;
    }

    const sites=(Array.isArray(region.sites)?region.sites:[]).filter(site=>site.gas===gasType);
    $('gasSiteTable').innerHTML=sites.length?sites.map(site=>{
      const units=Number(site.units)||0,m3=units*gasVolume;
      const clearHours=targetUnits>0?units/targetUnits:null;
      const clear=clearHours==null?'—':clearHours<1?(clearHours*60).toFixed(0)+' min':clearHours.toFixed(1)+' hr';
      return '<div class="gas-site-row '+(site.guarded?'guarded':'unguarded')+'">'+
        '<div><strong>'+esc(site.name)+'</strong><small>'+esc(site.security||site.region||gasRegion)+' • '+Number(site.clouds||1)+' cloud'+(Number(site.clouds||1)===1?'':'s')+'</small></div>'+
        '<div><span>Gas</span><strong>'+fmt(units)+' units</strong><small>'+fmt(m3,'m3')+' m³</small></div>'+
        '<div><span>Fleet clear</span><strong>'+clear+'</strong><small>'+Math.round(uptime*100)+'% uptime</small></div>'+
        '<div><span>Risk</span><strong>'+(site.guarded?'GUARDED':'UNGUARDED')+'</strong><small>'+esc(site.hazard||'—')+'</small></div>'+
      '</div>';
    }).join(''):'<div class="visual-empty">No '+esc(gasType)+' site references are loaded for '+esc(gasRegion)+'.</div>';

    $('gasModuleTable').innerHTML=Object.entries(GAS_MODULES).map(([name,spec])=>
      '<div class="gas-module-row">'+
        '<div><strong>'+esc(name)+'</strong><small>'+esc(spec.family==='SCOOP'?'Frigate scoop':'Barge / exhumer harvester')+'</small></div>'+
        '<div><span>Base cycle</span><strong>'+Number(spec.duration).toFixed(0)+'s</strong></div>'+
        '<div><span>Base yield</span><strong>'+Number(spec.yieldM3).toFixed(0)+' m³</strong></div>'+
        '<div><span>Residue</span><strong>'+(Number(spec.residueChance)>0?Math.round(Number(spec.residueChance)*100)+'% ×'+Number(spec.residueMultiplier):'NONE')+'</strong></div>'+
      '</div>'
    ).join('');
  }

  function renderRanking(){
    if(!state)return;
    const list=$('oreRanking');
    list.innerHTML='';
    const fleetRate=fleetM3();
    const uptime=Math.min(100,Math.max(1,Number(fleetSettings.uptime)||100));
    const payout=Number(fleetSettings.payout)||95;
    $('oreRankingSummary').textContent=fleetRate>0
      ?`${fmt(fleetRate,'m3')} m³/hr @ ${uptime.toFixed(0)}% uptime • ${payout.toFixed(1)}% payout • Jita max-refine basis`
      :'Select miners to calculate payout/hr and site clear time.';

    const head=document.createElement('div');
    head.className='rank-table-head';
    head.innerHTML='<span>ORE / SYSTEMS</span><span>FULL SITE</span><span>PAYOUT / HR</span><span>EST. CLEAR</span>';
    list.appendChild(head);

    for(const ore of state.source.ores){
      const clearHours=fleetRate>0?Number(ore.siteM3)/fleetRate:NaN;
      const clearMinutes=Number.isFinite(clearHours)?clearHours*60:NaN;
      const row=document.createElement('div');
      row.className='rank-row';
      row.innerHTML=`
        <div class="rank-main">
          <div class="rank-badge">#${ore.rank}</div>
          <div class="rank-ore-copy">
            <strong>${esc(ore.name)}</strong>
            <small>${ore.systems.join(' • ')}</small>
            <small>Jita refine ${ore.jbvPerM3.toFixed(2)} ISK/m³</small>
          </div>
        </div>
        <div class="rank-num"><strong>${fmt(ore.siteM3,'m3')} m³</strong><small>${fmt(ore.siteJBV)} ISK refined</small></div>
        <div class="rank-num"><strong>${fleetRate>0?fmt(projectedISK(ore))+'/hr':'—'}</strong><small>${payout.toFixed(1)}% payout</small></div>
        <div class="rank-num"><strong>${Number.isFinite(clearMinutes)?(clearMinutes<60?clearMinutes.toFixed(0)+' min':clearHours.toFixed(1)+' hr'):'—'}</strong><small>at selected fleet target</small></div>`;
      list.appendChild(row);
    }
  }
  function renderTimers(){
    if(!state)return;const active=definitions().map(d=>({d,f:field(d.system)})).filter(x=>x.f.status==='cleared'&&x.f.timerEndsAt).sort((a,b)=>Date.parse(a.f.timerEndsAt)-Date.parse(b.f.timerEndsAt));$('timerCount').textContent=`${active.length} respawning`;if(!active.length){$('activeTimers').innerHTML='<div class="timer-item"><div><strong>No fields currently respawning</strong><small>Marking a field RED starts its fixed 10-hour countdown here.</small></div></div>';return}$('activeTimers').innerHTML='';for(const x of active){const d=document.createElement('div');d.className='timer-item';d.innerHTML=`<div><strong>${x.d.system}${x.f.cherryPicked?' 🍒':''}</strong><small>${x.d.ore} • cleared ${ago(x.f.updatedAt)} • time remaining</small></div><div class="timer-value">${timer(x.f.timerEndsAt)}</div>`;$('activeTimers').appendChild(d)}
  }
  function renderSelected(){
    if(!state||!selectedSystem)return;
    const d=def(selectedSystem),f=field(selectedSystem);if(!d||!f)return;
    const status=f.status==='cleared'?`RED • RESPAWN ${timer(f.timerEndsAt)}`:statusText[f.status];
    $('selectedDetail').innerHTML=`<strong>#${d.rank} ${esc(d.ore)}</strong><span>${esc(status)}${f.autoReopenedAt?` • ESI VERIFIED ${esc(ago(f.autoReopenedAt))}`:''}${f.cherryPicked?' • 🍒 CHERRY':''} • ${fmt(projectedISK(state.source.ores[d.rank-1]))} payout/hr</span>`;
    const timerActive=f.status==='cleared'&&Date.parse(f.timerEndsAt)>Date.now();
    for(const id of ['markGreen','markYellow','markRed'])$(id).disabled=timerActive;
  }
  function renderNotes(){const f=field(selectedSystem),notes=f?.notes||[];$('fieldNotes').innerHTML=notes.length?notes.slice().reverse().map(n=>`<div class="field-note"><span>${esc(n.text)}</span><time>${esc(ago(n.createdAt))}</time></div>`).join(''):'<span class="field-notes-empty">No notes for this system yet.</span>'}
  function renderScanCharacters(){
    const select=$('scanCharacter'),button=$('pasteScan');
    if(!select||!button||!me)return;
    const chars=me.characters||[];
    if(!chars.some(c=>String(c.characterId)===String(scanCharacterId))){
      scanCharacterId=String(chars.find(c=>String(c.characterId)===String(me.primaryCharacterId))?.characterId||chars[0]?.characterId||'');
    }
    select.innerHTML=chars.length
      ?chars.map(c=>`<option value="${esc(c.characterId)}">${esc(c.name)}${c.locationAccess?'':' — UPDATE ACCESS'}</option>`).join('')
      :'<option value="">No linked toons</option>';
    select.value=scanCharacterId;
    select.disabled=!chars.length||scanBusy;
    const selected=chars.find(c=>String(c.characterId)===String(scanCharacterId));
    button.disabled=!selected||scanBusy;
    button.textContent=scanBusy?'CHECKING…':selected&&!selected.locationAccess?'UPDATE ACCESS':'📋 PASTE SCAN';
    if(selected&&!selected.locationAccess)setScanStatus('One-time EVE location access is required.','warning');
  }
  function renderCharacters(){
    if(!me)return;
    $('characterList').innerHTML='';
    if(!me.characters.length){
      $('characterList').innerHTML='<div class="character-row"><div></div><div><strong>No mining toons linked</strong><small>Add Toon connects a character for skills, saved fits, assets, and mining-ledger data.</small></div></div>';
      return;
    }
    for(const c of me.characters){
      const r=document.createElement('div');r.className='character-row';
      const savedFits=Number(c.savedFittingsCount ?? (c.fittings||[]).length)||0;
      const miningFits=(c.fittings||[]).length;
      const abyssal=Number(c.abyssalStripCount||0);
      const scopeState=c.needsReauth
        ?' • access update required for skills/fits/assets/location/contacts'
        :` • ${savedFits} saved fits • ${miningFits} mining fits${abyssal?` • ${abyssal} Abyssal strips`:''}`;
      const syncState=c.lastError?`⚠ sync error: ${esc(c.lastError)}`:`EVE data synced ${ago(c.lastSyncAt)}`;
      const marketButton=c.marketEligible
        ?`<button class="orb ${c.marketAuthorized?'green':'purple'} market-auth" data-id="${c.characterId}" type="button">${c.marketAuthorized?'C-N MARKET CONNECTED':'CONNECT C-N MARKET'}</button>`
        :'';
      r.innerHTML=`<img src="${esc(c.portrait)}" alt=""><div><strong>${esc(c.name)}</strong><small>${syncState}${scopeState}${c.marketAuthorized?' • private C-N market prices enabled':''}</small></div><div class="character-actions">${marketButton}${c.needsReauth?'<button class="orb blue reauth" type="button">UPDATE ACCESS</button>':''}<button class="orb red disconnect" data-id="${c.characterId}" type="button">DISCONNECT</button></div>`;
      $('characterList').appendChild(r);
    }
    $('characterList').querySelectorAll('.market-auth').forEach(b=>b.addEventListener('click',()=>{location.href=`/auth/eve/market/start?character=${encodeURIComponent(b.dataset.id)}`}));
    $('characterList').querySelectorAll('.reauth').forEach(b=>b.addEventListener('click',()=>{location.href='/auth/eve/start?intent=link'}));
    $('characterList').querySelectorAll('.disconnect').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Disconnect this mining toon from JLR?'))return;try{const p=await api(`/api/me/characters/${b.dataset.id}`,{method:'DELETE'});me=p.user;renderCharacters();renderCalculator();toast('Toon disconnected.')}catch(e){toast(e.message)}}));
  }
  function renderCalculator(){
    if(!me||!$('calcResults'))return;
    const data=calcData(),engine=window.JLRYieldMath;
    if(!data||!engine){$('calcResults').innerHTML='<div class="calc-empty">Mining output data is unavailable. Reload after the current deployment or data refresh completes.</div>';return}

    const chars=me.characters||[];
    const boosterSel=$('calcBoosterCharacter'),boosterFitSel=$('calcBoosterFitting');
    boosterSel.innerHTML='<option value="">No fleet booster</option>'+chars.map(ch=>`<option value="${ch.characterId}">${esc(ch.name)}</option>`).join('');
    if(!chars.some(ch=>String(ch.characterId)===String(calcSettings.boosterCharacterId)))calcSettings.boosterCharacterId='';
    boosterSel.value=calcSettings.boosterCharacterId;

    const booster=calcCharacter(calcSettings.boosterCharacterId);
    const boostFits=boosterFits(booster);
    boosterFitSel.innerHTML='<option value="">No saved booster fit</option>'+boostFits.map(f=>`<option value="${f.fittingId}">${esc(f.shipName)} — ${esc(f.name)}</option>`).join('');
    if(!boostFits.some(f=>String(f.fittingId)===String(calcSettings.boosterFittingId)))calcSettings.boosterFittingId=boostFits[0]?String(boostFits[0].fittingId):'';
    if(!calcSettings.boosterCharacterId)calcSettings.boosterFittingId='';
    boosterFitSel.value=calcSettings.boosterFittingId;
    const boosterFit=calcFitting(booster,calcSettings.boosterFittingId);

    const detectedBoostCharges=engine.detectBoostCharges(boosterFit);
    $('calcBoostCharges').textContent=detectedBoostCharges.names.length?detectedBoostCharges.names.join(' + '):'No supported mining burst charges detected';
    $('calcMindlink').checked=Boolean(calcSettings.mindlink);

    const boost=engine.boostBreakdown(data,booster?.skills||{},boosterFit,Boolean(calcSettings.mindlink));
    const boostActive=Boolean(boosterInFleet()&&boosterFit&&boost.ship!=='None');
    const boostStatus=boostActive?'ACTIVE':boosterFit?'READY — ADD BOOSTER TO FLEET':'NONE';
    const boostSource=boosterFit
      ?`${boost.ship} • ${boost.core} core • ${boost.burst} burst${calcSettings.mindlink?' • mindlink':''}`
      :'Select a booster toon and saved fit';
    $('boostStats').innerHTML=`
      <article class="calc-card boost-status-card ${boostActive?'boost-live':''}"><span>BOOST STATUS</span><strong>${esc(boostStatus)}</strong><small>${esc(boostSource)}</small></article>
      <article class="calc-card"><span>CYCLE REDUCTION</span><strong>${(Number(boost.cycleReduction||0)*100).toFixed(2)}%</strong><small>Mining Laser Optimization</small></article>
      <article class="calc-card"><span>EFFICIENCY BURST</span><strong>${(Number(boost.efficiencyBoost||0)*100).toFixed(1)}%</strong><small>Mining Laser Efficiency strength</small></article>
      <article class="calc-card"><span>RANGE BOOST</span><strong>${(Number(boost.rangeBonus||0)*100).toFixed(1)}%</strong><small>Mining Laser Field Enhancement</small></article>`;

    if(!chars.length){
      $('calcResults').innerHTML='<div class="calc-empty">Connect a mining toon first.</div>';
      return;
    }

    const boosterId=String(calcSettings.boosterCharacterId||'');
    const enabledMiners=chars.filter(ch=>fleetSettings.members?.[String(ch.characterId)]?.enabled&&String(ch.characterId)!==boosterId);
    const minerNeedsReauth=enabledMiners.some(ch=>ch.needsReauth||!Object.keys(ch.skills||{}).length);
    const boosterNeedsReauth=Boolean(boosterInFleet()&&booster&&boosterFit&&(booster.needsReauth||!Object.keys(booster.skills||{}).length));

    if(!enabledMiners.length){
      $('calcResults').innerHTML='<div class="calc-empty">Select your miners and saved fits above.</div>';
      return;
    }
    if(minerNeedsReauth){
      $('calcResults').innerHTML='<div class="calc-empty">Update access for the selected miner, then use Sync EVE Data.</div>';
      return;
    }
    if(boosterNeedsReauth){
      $('calcResults').innerHTML='<div class="calc-empty">Update access for the selected booster, then use Sync EVE Data.</div>';
      return;
    }

    const fleetView=fleetStats();
    const representative=fleetView.entries.find(x=>x.result);
    if(!representative){
      const firstError=fleetView.entries.find(x=>x.error)?.error;
      $('calcResults').innerHTML=`<div class="calc-empty">${firstError?`⚠ ${esc(firstError)}`:'Choose a supported saved mining fit, then use Sync EVE Data.'}</div>`;
      return;
    }

    const result=representative.result;
    const minerFit=representative.fit;
    const firstLaser=result.lasers[0];
    const detectedCrystal=engine.detectCrystal(minerFit);
    const fleetCount=fleetView.count,fleet=fleetView.total;
    const shipSub=fleetCount>1?`${esc(representative.character.name)} • ${fleetCount} miners selected`:`${esc(representative.character.name)} • ${esc(minerFit.name||'Saved fit')}`;

    $('calcResults').innerHTML=`
      <article class="calc-card compact-ship-stat"><span>REFERENCE MINER</span><strong>${esc(result.shipName)}</strong><small>${shipSub}</small></article>
      <article class="calc-card expanded-stat"><span>100% FIT RATE</span><strong>${fmt(representative.rawM3,'m3')} m³/hr</strong><small>${result.m3PerSecond.toFixed(2)} m³/s • selected fit + skills + boosts</small></article>
      <article class="calc-card cycle-stat"><span>STRIP CYCLE</span><strong>${firstLaser?firstLaser.duration.toFixed(2):'—'} sec</strong><small>${esc(result.shipName)} • crystal ${esc(detectedCrystal)}</small></article>
      <article class="calc-card expanded-stat"><span>FLEET @ ${Number(fleetSettings.uptime).toFixed(0)}%</span><strong>${fmt(fleet,'m3')} m³/hr</strong><small>${fleetCount} selected miners • uptime-adjusted output</small></article>`;

    localStorage.setItem('jlrMiningCalc',JSON.stringify(calcSettings));
  }
  function renderAll(){if(!state)return;renderFleet();renderTop();renderSelect();renderBoards();renderHits();renderFleetPerformance();renderMiningVisuals();renderIceMining();renderGasHuffing();if(doctrineMarket)renderDoctrineMarket();renderRanking();renderTimers();renderSelected();renderNotes();renderScanCharacters();renderCharacters();renderCalculator();renderMerIntel();}

  async function refreshMe(){const p=await api('/api/me');me=p.user;if(me){$('userName').textContent=me.displayName;$('userPortrait').src=me.portrait;syncDoctrineTabAccess()}return p.authenticated}
  async function loadState(){state=await api('/api/state');renderAll()}
  function connectSse(){
    if(eventSource)eventSource.close();
    eventSource=new EventSource('/api/events');
    eventSource.addEventListener('state',e=>{
      const previousSync=state?.esi?.lastSyncAt||null;
      state=JSON.parse(e.data);
      renderAll();
      renderDataStatus();
      if(state?.esi?.lastSyncAt&&state.esi.lastSyncAt!==previousSync){
        refreshMe().then(()=>renderAll()).catch(()=>{});
      }
    });
    eventSource.onerror=()=>{$('liveBadge').textContent='⚠ DATA CONNECTION LOST';$('liveBadge').title='Live dashboard updates disconnected; the page is attempting to reconnect.'};
  }

  function addToon(){location.href='/auth/eve/start?intent=link'}
  $('addToon').addEventListener('click',addToon);$('addToonTop').addEventListener('click',addToon);
  $('logout').addEventListener('click',async()=>{try{await api('/auth/logout',{method:'POST',body:'{}'})}catch{}location.href='/' });
  $('compactMode').addEventListener('click',()=>applyMode('compact'));$('expandedMode').addEventListener('click',()=>applyMode('expanded'));
  $('themeSelect').value=activeTheme;
  $('themeSelect').addEventListener('change',()=>applyTheme($('themeSelect').value));
  $('targetOreSelect').addEventListener('change',()=>{
    targetOre=$('targetOreSelect').value||'auto';
    localStorage.setItem('jlrTargetOre',targetOre);
    renderHits();
  });
  $('boardArrange').addEventListener('click',toggleBoardArrange);
  $('boardSize').addEventListener('click',cycleBoardSize);
  $('boardReset').addEventListener('click',resetBoardOrder);
  $('fleetArrange').addEventListener('click',()=>{fleetArrangeMode=!fleetArrangeMode;renderFleet()});
  $('fleetOrderReset').addEventListener('click',()=>{fleetSettings.order=[];localStorage.setItem('jlrFleet',JSON.stringify(fleetSettings));renderFleet();toast('Toon order reset.')});
  syncBoardControls();
  $('systemSelect').addEventListener('change',()=>chooseSystem($('systemSelect').value));
  $('scanCharacter').addEventListener('change',()=>{scanCharacterId=$('scanCharacter').value;localStorage.setItem('jlrScanCharacter',scanCharacterId);renderScanCharacters()});
  document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));renderBoards()}));

  function applyFieldUpdate(system,updatedField){state.fields[system]=updatedField;renderAll()}
  function applyPreviewBoardScan(preview){
    const scan=preview?.boardScan;
    if(!state||!preview?.system||!scan?.recorded)return;
    state.scans ||= {};
    state.scans[preview.system]={
      ...(state.scans[preview.system]||{}),
      lastScanAt:scan.lastScanAt,
      due:false,
      nextUpdateAt:scan.nextUpdateAt||null,
      scannerRowCount:Number(scan.scannerRowCount)||0,
      kinds:Array.isArray(scan.kinds)?scan.kinds:[],
      ice:scan.ice||null,
    };
    renderBoards();
  }
  function openScanPaste(){
    $('scanPasteText').value='';
    $('scanPastePanel').classList.remove('hidden');
    setTimeout(()=>$('scanPasteText').focus(),0);
  }
  function closeScanPaste(){$('scanPastePanel').classList.add('hidden')}
  async function analyzeProbeScan(text){
    if(scanBusy)return;
    const selected=(me?.characters||[]).find(c=>String(c.characterId)===String(scanCharacterId));
    if(!selected){toast('Choose a linked mining toon first.');return}
    if(!selected.locationAccess){location.href='/auth/eve/start?intent=link';return}
    scanBusy=true;renderScanCharacters();setScanStatus(`Checking ${selected.name} location…`);
    try{
      const preview=await api('/api/scans/preview',{method:'POST',body:JSON.stringify({characterId:selected.characterId,text})});
      applyPreviewBoardScan(preview);
      if(preview.a0?.tracked){
        if(preview.a0.scan?.detected){
          setScanStatus(`${preview.system}: A0 rare asteroid site detected — board updated for 12 hours.`,'success');
          toast(`${preview.system} A0 site added/updated on the board.`);
        }else{
          setScanStatus(`${preview.system}: A0 checked — no active site detected. Update due again in 12 hours.`,'success');
        }
      }
      if(!preview.tracked){
        if(preview.a0?.tracked)return;
        if(preview.boardScan?.recorded){
          const ice=preview.boardScan.ice;
          if(ice){
            const summary=ice.missing>0?`${ice.seen}/${ice.expected} ice fields seen • ${ice.missing} missing`:`${ice.seen}/${ice.expected} ice fields seen • all present`;
            setScanStatus(`${preview.system}: ${summary}. Next update requested in 12 hours.`,ice.missing>0?'warning':'success');
            toast(`${preview.system}: ${summary}.`);
          }else{
            setScanStatus(`${preview.system}: board scan time updated. Next update requested in 12 hours.`,'success');
            toast(`${preview.system} scan timestamp updated.`);
          }
          return;
        }
        setScanStatus(`${preview.characterName} is in ${preview.system}, which is not on the tracked T3/ICE/A0 board.`,'warning');
        toast(`No tracked T3, ICE, or A0 field for ${preview.system}.`);
        return;
      }
      chooseSystem(preview.system);
      const expected=preview.scan?.expectedNames?.[0]||`${preview.definition.ore} deposit`;
      if(preview.scan?.detected){
        if(preview.correction?.applied){
          applyFieldUpdate(preview.system,preview.field);
          setScanStatus(`${preview.system}: ${preview.definition.ore} detected on repost — false RED corrected to GREEN.`,'success');
          $('fieldMessage').textContent=`${preview.system} scan found ${preview.definition.ore}; the previous clear report was corrected and the respawn timer was cancelled.`;
          toast(`${preview.system}: repost corrected the previous clear report.`);
          sfx('systemSelect');
          return;
        }
        const result=await api(`/api/fields/${encodeURIComponent(preview.system)}`,{method:'PUT',body:JSON.stringify({status:'ready'})});
        applyFieldUpdate(preview.system,result.field);
        setScanStatus(`${preview.system}: ${preview.definition.ore} detected — marked GREEN.`,'success');
        $('fieldMessage').textContent=`${preview.system} scan found ${preview.definition.ore}; field marked GREEN and mineable.`;
        sfx('systemSelect');
        return;
      }
      pending={system:preview.system,source:'scan',ore:preview.definition.ore,scannerRows:preview.scan?.scannerRowCount||0};
      $('confirmTitle').textContent=`NO ${preview.definition.ore.toUpperCase()} DEPOSIT DETECTED`;
      $('confirmText').textContent=`${preview.characterName} is in ${preview.system}. The copied scan contained ${preview.scan?.scannerRowCount||0} scanner rows but no ${expected}. Only continue if the complete, unfiltered Probe Scanner list was copied.`;
      $('confirmYes').textContent='CONFIRM CLEAR + START 10H';
      $('confirmPanel').classList.remove('hidden');
      setScanStatus(`${preview.system}: deposit not detected — waiting for confirmation.`,'warning');
    }catch(e){
      setScanStatus(e.message,'error');
      toast(e.message);
    }finally{
      scanBusy=false;renderScanCharacters();
    }
  }
  $('pasteScan').addEventListener('click',async()=>{
    const selected=(me?.characters||[]).find(c=>String(c.characterId)===String(scanCharacterId));
    if(selected&&!selected.locationAccess){location.href='/auth/eve/start?intent=link';return}
    try{
      if(!navigator.clipboard?.readText)throw new Error('Clipboard access unavailable');
      const text=await navigator.clipboard.readText();
      if(!text.trim())throw new Error('Clipboard is empty');
      await analyzeProbeScan(text);
    }catch{openScanPaste()}
  });
  $('scanPasteCancel').addEventListener('click',closeScanPaste);
  $('scanPasteCheck').addEventListener('click',async()=>{
    const text=$('scanPasteText').value;
    if(!text.trim()){toast('Paste the Probe Scanner rows first.');return}
    closeScanPaste();
    await analyzeProbeScan(text);
  });
  async function setField(status,forceSystem=null){
    const system=forceSystem||$('systemSelect').value;
    if(status==='cleared'){
      pending={system};
      $('confirmTitle').textContent='ARE YOU SURE YOU WANT TO START TIMER?';
      $('confirmText').textContent=`${system} will be marked RED and start a fixed 10-hour respawn countdown. Status changes are locked until that timer expires.`;
      $('confirmYes').textContent='YES — START 10 HOURS';
      $('confirmPanel').classList.remove('hidden');
      return;
    }
    try{
      const result=await api(`/api/fields/${encodeURIComponent(system)}`,{method:'PUT',body:JSON.stringify({status})});
      applyFieldUpdate(system,result.field);
      $('fieldMessage').textContent=status==='ready'
        ?`${system} is GREEN and mineable.`
        :`${system} is YELLOW and marked picked/in progress.`;
    }catch(e){toast(e.message)}
  }
  $('markGreen').addEventListener('click',()=>setField('ready',selectedSystem));$('markYellow').addEventListener('click',()=>setField('picked',selectedSystem));$('markRed').addEventListener('click',()=>setField('cleared',selectedSystem));
  async function addNote(){const system=selectedSystem,text=$('fieldNote').value.trim();if(!text){toast('Type a note first.');return}try{const result=await api(`/api/fields/${encodeURIComponent(system)}/notes`,{method:'POST',body:JSON.stringify({text})});if(selectedSystem===system&&$('fieldNote').value.trim()===text)$('fieldNote').value='';applyFieldUpdate(system,result.field);toast(`Note added to ${system}.`)}catch(e){toast(e.message)}}
  $('addNote').addEventListener('click',addNote);$('fieldNote').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addNote()}});
  async function cherry(){const system=selectedSystem||$('systemSelect').value;try{await api(`/api/fields/${encodeURIComponent(system)}/cherry`,{method:'POST',body:'{}'});$('fieldMessage').textContent=`${system} reported 🍒 CHERRY PICKED. It will clear only when the 10-hour respawn ends.`;sfx('timer')}catch(e){toast(e.message)}}
  $('reportCherry').addEventListener('click',cherry);
  $('confirmNo').addEventListener('click',()=>{if(pending?.source==='scan')setScanStatus(`${pending.system}: no changes made.`);pending=null;$('confirmPanel').classList.add('hidden')});
  $('confirmYes').addEventListener('click',async()=>{if(!pending)return;const p=pending;pending=null;$('confirmPanel').classList.add('hidden');try{const result=await api(`/api/fields/${encodeURIComponent(p.system)}`,{method:'PUT',body:JSON.stringify({status:'cleared',confirm:true})});applyFieldUpdate(p.system,result.field);sfx('timer');$('fieldMessage').textContent=`${p.system} RED — 10-hour timer started.`;if(p.source==='scan')setScanStatus(`${p.system}: ${p.ore} absent — marked RED for 10 hours.`,'success')}catch(e){toast(e.message);if(p.source==='scan')setScanStatus(e.message,'error')}});
  $('syncNow').addEventListener('click',async()=>{
    const button=$('syncNow');
    const before=state?.esi?.lastSyncAt||null;
    button.disabled=true;
    button.textContent='SYNCING EVE…';
    try{
      await api('/api/esi/sync',{method:'POST',body:'{}'});
      toast('Syncing skills, saved fits, assets, and mining ledger from EVE...');
      let completed=false;
      for(let attempt=0;attempt<60;attempt++){
        await new Promise(resolve=>setTimeout(resolve,1000));
        const next=await api('/api/state');
        state=next;
        const finished=next.esi?.lastSyncAt&&next.esi.lastSyncAt!==before;
        if(finished){completed=true;break}
      }
      await refreshMe();
      renderAll();
      if(completed){
        const chars=me?.characters||[];
        const saved=chars.reduce((n,c)=>n+(Number(c.savedFittingsCount ?? (c.fittings||[]).length)||0),0);
        const mining=chars.reduce((n,c)=>n+(c.fittings||[]).length,0);
        const abyssal=chars.reduce((n,c)=>n+(Number(c.abyssalStripCount)||0),0);
        button.textContent='SYNCED ✓';
        toast(`${saved} saved fits • ${mining} mining fits${abyssal?` • ${abyssal} Abyssal`:''}`);
        setTimeout(()=>{button.textContent='SYNC EVE DATA';button.disabled=false},2200);
      }else{
        button.textContent='SYNC STILL RUNNING';
        toast('EVE data sync is taking longer than expected.');
        setTimeout(()=>{button.textContent='SYNC EVE DATA';button.disabled=false},3000);
      }
    }catch(e){
      button.textContent='SYNC FAILED';
      toast(e.message);
      setTimeout(()=>{button.textContent='SYNC EVE DATA';button.disabled=false},3000);
    }
  });

  $('oreTrendSelect').addEventListener('change',()=>{
    oreTrendType=$('oreTrendSelect').value||'Kylixium';
    localStorage.setItem('jlrOreTrend',oreTrendType);
    renderMiningVisuals();
  });
  document.querySelectorAll('.fleet-range').forEach(button=>button.addEventListener('click',()=>{
    const days=Number(button.dataset.days);
    if(![7,30,90].includes(days))return;
    fleetHistoryDays=days;
    localStorage.setItem('jlrFleetHistoryDays',String(days));
    renderFleetPerformance();
  }));
  document.querySelectorAll('.fleet-metric').forEach(button=>button.addEventListener('click',()=>{
    const metric=button.dataset.metric==='value'?'value':'m3';
    fleetHistoryMetric=metric;
    localStorage.setItem('jlrFleetHistoryMetric',metric);
    renderFleetPerformance();
  }));

  $('iceTypeSelect').addEventListener('change',()=>{
    iceTrackType=$('iceTypeSelect').value||'Blue Ice IV-Grade';
    localStorage.setItem('jlrIceType',iceTrackType);
    renderIceMining();
  });

  $('gasRegionSelect')?.addEventListener('change',()=>{
    gasRegion=$('gasRegionSelect').value||'Fountain';
    gasType='';
    localStorage.setItem('jlrGasRegion',gasRegion);
    localStorage.removeItem('jlrGasType');
    renderGasHuffing();
  });
  $('gasTypeSelect')?.addEventListener('change',()=>{
    gasType=$('gasTypeSelect').value||'';
    localStorage.setItem('jlrGasType',gasType);
    renderGasHuffing();
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
  $('fleetSearchInput')?.addEventListener('input',event=>{
    fleetSearchText=String(event.currentTarget.value||'');
    renderFleet();
  });
  $('fleetViewFilter')?.addEventListener('change',event=>{
    fleetViewFilter=['all','selected','miners','nofit'].includes(event.currentTarget.value)?event.currentTarget.value:'all';
    localStorage.setItem('jlrFleetViewFilter',fleetViewFilter);
    renderFleet();
  });
  $('fleetSelectAll')?.addEventListener('click',()=>{
    for(const character of me?.characters||[]){
      const id=String(character.characterId),fits=miningFits(character),isBooster=id===String(calcSettings.boosterCharacterId||'');
      const existing=fleetSettings.members[id]&&typeof fleetSettings.members[id]==='object'?fleetSettings.members[id]:{};
      if(fits.length||isBooster){const fallback=defaultFleetFit(fits);fleetSettings.members[id]={...existing,enabled:true,fittingId:existing.fittingId||(fallback?String(fallback.fittingId):'')}};
    }
    saveFleet();
    toast('All supported mining toons selected.');
  });
  $('fleetClearMiners')?.addEventListener('click',()=>{
    const boosterId=String(calcSettings.boosterCharacterId||'');
    for(const character of me?.characters||[]){
      const id=String(character.characterId);
      if(id===boosterId)continue;
      if(fleetSettings.members[id])fleetSettings.members[id].enabled=false;
    }
    saveFleet();
    toast(boosterId?'Miners cleared. Booster left enabled.':'All miners cleared.');
  });
  window.addEventListener('resize',updateUiScale,{passive:true});
  async function boot(){
    try{
      const config=await fetch('/api/config').then(r=>r.json());
      if(!config.ssoConfigured){$('setupWarning').classList.remove('hidden');$('setupWarning').textContent='Login is not configured yet.';}
      const auth=await fetch('/api/me',{credentials:'same-origin'}).then(r=>r.json());
      if(!auth.authenticated){showLogin();return}
      me=auth.user;syncDoctrineTabAccess();initTabs();showApp();$('userName').textContent=me.displayName;$('userPortrait').src=me.portrait;applyMode(localStorage.getItem('jlrMode')==='expanded'?'expanded':'compact');await loadMerIntel();await loadState();connectSse();
      const params=new URLSearchParams(location.search);if(params.get('linked'))toast('Mining toon connected.');if(params.get('login'))toast('Logged in.');if(params.get('market')==='authorized')toast('John market access authorized.');if(params.get('error'))toast(decodeURIComponent(params.get('error')));if(params.toString())history.replaceState({},'',location.pathname);
    }catch(e){console.error(e);showLogin();$('setupWarning').classList.remove('hidden');$('setupWarning').textContent=`JLR could not load: ${e.message}`}
  }
  setInterval(()=>{if(state){renderBoards();renderTimers();renderSelect();renderSelected();renderDataStatus();}},1000);
  boot();
})();
