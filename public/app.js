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
  const THEME_IDS = new Set(['void','citadel','forge']);
  let activeTheme = THEME_IDS.has(localStorage.getItem('jlrTheme')) ? localStorage.getItem('jlrTheme') : 'void';
  document.documentElement.dataset.theme=activeTheme;
  let toastTimer = null;
  let eventSource = null;
  let scanCharacterId = localStorage.getItem('jlrScanCharacter') || '';
  let scanBusy = false;

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
  const audibleSelects='#calcBoosterCharacter,#calcBoosterFitting,.fleet-fit-select';
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
    popup.setAttribute('aria-label',select.labels?.[0]?.querySelector('span')?.textContent?.trim()||select.getAttribute('aria-label')||'Saved mining fit');
    Array.from(select.options).forEach((option,index)=>{
      const button=document.createElement('button');
      button.type='button';button.className='sound-menu-option';button.id=`${id}-option-${index}`;
      button.dataset.index=String(index);button.setAttribute('role','option');
      button.setAttribute('aria-selected',String(index===select.selectedIndex));
      button.textContent=option.textContent;button.disabled=option.disabled;
      popup.appendChild(button);
    });
    document.body.appendChild(popup);
    soundMenu={select,popup,activeIndex:-1,lastPreviewIndex:-1};
    select.setAttribute('aria-expanded','true');select.setAttribute('aria-controls',id);
    select.focus({preventScroll:true});
    const rect=select.getBoundingClientRect();
    const width=Math.min(window.innerWidth-16,Math.max(rect.width,270));
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
  function applyTab(tab){
    const valid=['fields','fleet','ice','toons'];
    activeTab=valid.includes(tab)?tab:'fields';
    localStorage.setItem('jlrTab',activeTab);
    document.querySelectorAll('.app-tab').forEach(button=>button.classList.toggle('active',button.dataset.tab===activeTab));
    document.querySelectorAll('.tab-panel').forEach(panel=>panel.classList.toggle('active',panel.dataset.tab===activeTab));
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
    const ice=makePanel('ice');
    const toons=makePanel('toons');

    const quick=document.querySelector('.quick-update');
    const calculator=document.querySelector('.shared-calculator');
    const board=document.querySelector('.board-panel');
    const hits=document.querySelector('.hit-panel');
    [quick,calculator,board,hits].filter(Boolean).forEach(el=>fields.appendChild(el));

    const advanced=document.createElement('div');
    advanced.className='tab-advanced expanded-grid';
    const ranking=document.querySelector('.ranking-panel');
    const timers=document.querySelector('.timers-panel');
    if(ranking)advanced.appendChild(ranking);
    if(timers)advanced.appendChild(timers);
    if(advanced.children.length)fields.appendChild(advanced);

    const setup=document.querySelector('.setup-drawer');
    const visuals=document.querySelector('.mining-visuals-panel');
    const actual=document.querySelector('.actual-panel');
    [setup,visuals,actual].filter(Boolean).forEach(el=>fleet.appendChild(el));

    const icePanel=document.querySelector('.ice-mining-panel');
    if(icePanel)ice.appendChild(icePanel);

    const toonPanel=document.querySelector('.esi-panel');
    if(toonPanel)toons.appendChild(toonPanel);

    document.querySelector('.compact-row')?.remove();
    $('expandedArea')?.remove();

    document.querySelectorAll('.app-tab').forEach(button=>button.addEventListener('click',()=>applyTab(button.dataset.tab)));
    applyTab(activeTab);
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
    if(hint)hint.textContent=boardArrangeMode?'Drag any T3 or ICE box to reorder • favorites stay pinned first':'☆ favorite any T3 or ICE system to pin it to the front';
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
    if(soundMenu?.select.closest('#fleetMemberList'))closeSoundMenu();
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
        const fitOptions=fits.length?fits.map(f=>`<option value="${f.fittingId}" ${String(f.fittingId)===String(cfg.fittingId)?'selected':''}>${esc(f.shipName)} — ${esc(f.name)}</option>`).join(''):'<option value="">No supported saved mining fit</option>';
        let output='Excluded from fleet output';
        if(cfg.enabled){
          if(entry?.result)output=`${fmt(entry.effectiveM3,'m3')} m³/hr @ ${Number(fleetSettings.uptime).toFixed(0)}%`;
          else output=entry?.error||'Select a supported saved mining fit';
        }
        const isBooster=id===String(calcSettings.boosterCharacterId||'');
        const boosterFitText=isBooster?(boosterFit?`${boosterFit.shipName} — ${boosterFit.name}` :'No saved booster fit'):'';
        if(isBooster)row.classList.add('booster');
        row.innerHTML=`
          <label class="fleet-member-toggle"><input class="fleet-member-check" data-id="${id}" type="checkbox" ${cfg.enabled?'checked':''} ${!isBooster&&!fits.length?'disabled':''}><img src="${esc(character.portrait)}" alt=""><span><strong>${esc(character.name)}</strong><small>${isBooster?(cfg.enabled?'Selected booster • in fleet':'Selected booster • not in fleet'):fits.length?`${fits.length} mining fit${fits.length===1?'':'s'}`:'No mining fits'}</small></span></label>
          ${isBooster?`<div class="fleet-booster-fit-inline">${esc(boosterFitText)}</div>`:`<select class="fleet-fit-select" data-id="${id}" ${fits.length?'':'disabled'}>${fitOptions}</select>`}
          <strong class="fleet-member-output">${esc(isBooster?(cfg.enabled?'BOOST ONLY • m³ excluded':'Booster excluded from fleet'):output)}</strong>`;
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
    b.innerHTML=`${f.cherryPicked?'<span class="cherry-pin">🍒</span>':''}<button class="favorite-toggle" type="button" aria-pressed="${favorite}" title="${favorite?'Remove from favorites':'Favorite this system'}">${favorite?'★':'☆'}</button>${boardArrangeMode?'<span class="drag-grip" aria-hidden="true">⠿</span>':''}<span class="sys-name">${esc(d.system)}</span><span class="sys-ore">#${d.rank} ${esc(d.ore)}</span>${includeTimer?`<span class="sys-state">${line}${distanceText}</span>`:''}`;
    b.title=`${d.system} • ${d.ore} • ${statusText[f.status]}${favorite?' • Favorite':''}${f.autoReopenedAt?` • ESI mining detected ${ago(f.autoReopenedAt)}`:''}${Number.isFinite(distance)?` • ${distance.toFixed(2)} LY from C-N4OD`:''}${f.cherryPicked?' • Cherry Picked':''}${f.notes?.length?` • ${f.notes.length} notes`:''}`;

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
    card.innerHTML='<button class="favorite-toggle" type="button" aria-pressed="'+favorite+'" title="'+(favorite?'Remove from favorites':'Favorite this system')+'">'+(favorite?'★':'☆')+'</button>'+
      (boardArrangeMode?'<span class="drag-grip" aria-hidden="true">⠿</span>':'')+
      '<span class="sys-name">'+esc(row.system)+'</span>'+
      '<span class="sys-ore">'+fields+' ICE FIELD'+(fields===1?'':'S')+'</span>'+
      '<span class="sys-state">IN TITAN RANGE'+(Number.isFinite(distance)?' • '+distance.toFixed(2)+' LY':'')+'</span>';
    card.title=row.system+' • '+fields+' ice field'+(fields===1?'':'s')+(favorite?' • Favorite':'')+(Number.isFinite(distance)?' • '+distance.toFixed(2)+' LY from C-N4OD':'')+' • within configured Titan bridge range';
    card.querySelector('.favorite-toggle').addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();toggleBoardFavorite('ice',row.system);sfx('select');
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

    for(const d of definitions()){
      const f=field(d.system);
      counts[f.status]++;
      if(f.cherryPicked)counts.cherry++;
    }

    for(const entry of orderedBoardEntries()){
      if(entry.kind==='t3'){
        if(filter==='all'||filter===entry.f.status||(filter==='cherry'&&entry.f.cherryPicked))board.appendChild(node(entry.d,entry.f,true));
      }else if(filter==='all'||filter==='ice'){
        board.appendChild(iceBoardNode(entry.row));
      }
    }

    $('statusCounts').textContent=`${counts.ready} mineable • ${counts.picked} picked • ${counts.cleared} respawning • ${counts.cherry} cherry • ${iceFields.length} ice systems`;
    $('systemCountLabel').textContent=`${definitions().length} T3 • ${iceFields.length} ICE`;
  }
  function renderHits(){
    if(!state)return;
    const arr=definitions()
      .map(d=>({d,f:field(d.system)}))
      .filter(x=>x.f.status!=='cleared')
      .sort((a,b)=>Number(a.f.cherryPicked)-Number(b.f.cherryPicked)||a.d.rank-b.d.rank||a.d.order-b.d.order)
      .slice(0,8);

    const host=$('hitOrder');
    host.innerHTML='';

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
      host.innerHTML='<div class="target-empty">No mineable T3 fields right now. Cleared fields will return after their respawn timers finish.</div>';
    }
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
        ?' • access update required for skills/fits/assets/location'
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

    if(!chars.length){
      $('calcResults').innerHTML='<div class="calc-empty">Connect a mining toon first.</div>';
      return;
    }

    const boosterId=String(calcSettings.boosterCharacterId||'');
    const enabledMiners=chars.filter(ch=>fleetSettings.members?.[String(ch.characterId)]?.enabled&&String(ch.characterId)!==boosterId);
    const minerNeedsReauth=enabledMiners.some(ch=>ch.needsReauth||!Object.keys(ch.skills||{}).length);
    const boosterNeedsReauth=Boolean(boosterInFleet()&&booster&&boosterFit&&(booster.needsReauth||!Object.keys(booster.skills||{}).length));

    if(!enabledMiners.length){
      $('calcResults').innerHTML='<div class="calc-empty">Select your miners and saved fits in Fleet Setup.</div>';
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
      <article class="calc-card boost-stat"><span>CYCLE REDUCTION</span><strong>${(result.boost.cycleReduction*100).toFixed(2)}%</strong><small>${result.boost.ship==='None'?'No active fleet booster':esc(result.boost.ship+' • '+result.boost.core+' • Burst '+result.boost.burst)}</small></article>
      <article class="calc-card expanded-stat"><span>FLEET @ ${Number(fleetSettings.uptime).toFixed(0)}%</span><strong>${fmt(fleet,'m3')} m³/hr</strong><small>${fleetCount} selected miners • uptime-adjusted output</small></article>`;

    localStorage.setItem('jlrMiningCalc',JSON.stringify(calcSettings));
  }
  function renderAll(){if(!state)return;renderFleet();renderTop();renderSelect();renderBoards();renderHits();renderMiningVisuals();renderIceMining();renderRanking();renderTimers();renderSelected();renderNotes();renderScanCharacters();renderCharacters();renderCalculator();}

  async function refreshMe(){const p=await api('/api/me');me=p.user;if(me){$('userName').textContent=me.displayName;$('userPortrait').src=me.portrait}return p.authenticated}
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
  $('boardArrange').addEventListener('click',toggleBoardArrange);
  $('boardSize').addEventListener('click',cycleBoardSize);
  $('boardReset').addEventListener('click',resetBoardOrder);
  syncBoardControls();
  $('systemSelect').addEventListener('change',()=>chooseSystem($('systemSelect').value));
  $('scanCharacter').addEventListener('change',()=>{scanCharacterId=$('scanCharacter').value;localStorage.setItem('jlrScanCharacter',scanCharacterId);renderScanCharacters()});
  document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));renderBoards()}));

  function applyFieldUpdate(system,updatedField){state.fields[system]=updatedField;renderAll()}
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
      if(!preview.tracked){
        setScanStatus(`${preview.characterName} is in ${preview.system}, which is not on the T3 board.`,'warning');
        toast(`No tracked T3 field for ${preview.system}.`);
        return;
      }
      chooseSystem(preview.system);
      const expected=preview.scan?.expectedNames?.[0]||`${preview.definition.ore} deposit`;
      if(preview.scan?.detected){
        const activeTimer=preview.field?.status==='cleared'&&Date.parse(preview.field.timerEndsAt)>Date.now();
        if(activeTimer){
          setScanStatus(`${preview.system}: ${preview.definition.ore} detected; active timer was left unchanged.`,'warning');
          toast('Deposit detected, but the locked respawn timer is still active.');
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

  $('iceTypeSelect').addEventListener('change',()=>{
    iceTrackType=$('iceTypeSelect').value||'Blue Ice IV-Grade';
    localStorage.setItem('jlrIceType',iceTrackType);
    renderIceMining();
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
  window.addEventListener('resize',updateUiScale,{passive:true});
  async function boot(){
    try{
      const config=await fetch('/api/config').then(r=>r.json());
      if(!config.ssoConfigured){$('setupWarning').classList.remove('hidden');$('setupWarning').textContent='Login is not configured yet.';}
      const auth=await fetch('/api/me',{credentials:'same-origin'}).then(r=>r.json());
      if(!auth.authenticated){showLogin();return}
      me=auth.user;initTabs();showApp();$('userName').textContent=me.displayName;$('userPortrait').src=me.portrait;applyMode(localStorage.getItem('jlrMode')==='expanded'?'expanded':'compact');await loadState();connectSse();
      const params=new URLSearchParams(location.search);if(params.get('linked'))toast('Mining toon connected.');if(params.get('login'))toast('Logged in.');if(params.get('market')==='authorized')toast('John market access authorized.');if(params.get('error'))toast(decodeURIComponent(params.get('error')));if(params.toString())history.replaceState({},'',location.pathname);
    }catch(e){console.error(e);showLogin();$('setupWarning').classList.remove('hidden');$('setupWarning').textContent=`JLR could not load: ${e.message}`}
  }
  setInterval(()=>{if(state){renderBoards();renderTimers();renderSelect();renderSelected();renderDataStatus();}},1000);
  boot();
})();
