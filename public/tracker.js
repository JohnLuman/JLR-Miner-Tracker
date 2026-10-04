'use strict';
(function(){
  const ALARM_VERSION='2.10.20-alarm-diag2';
  const CORE_URL='/tracker-core.js?v=2.10.20-alarm-diag2';

  let alarmContext=null;
  let alarmNodes=[];
  let alarmTimer=null;
  let alarmOverlay=null;
  let alarmGeneration=0;
  const alarmTabId=Math.random().toString(36).slice(2)+Date.now().toString(36);
  let alarmLeaseKey='';
  let alarmLastTrigger=null;

  function claimAlarmLease(){
    const account=String(window.jlrAlarmAccountId||'global').trim()||'global';
    const key='jlrHeavyFighterAlarmOwner:'+account;
    const now=Date.now();
    try{
      const current=JSON.parse(localStorage.getItem(key)||'null');
      if(current?.tab!==alarmTabId&&Number(current?.expiresAt)>now)return false;
      localStorage.setItem(key,JSON.stringify({tab:alarmTabId,expiresAt:now+20_000}));
      if(JSON.parse(localStorage.getItem(key)||'null')?.tab!==alarmTabId)return false;
      alarmLeaseKey=key;
    }catch(error){}
    return true;
  }

  function releaseAlarmLease(){
    if(!alarmLeaseKey)return;
    try{
      const current=JSON.parse(localStorage.getItem(alarmLeaseKey)||'null');
      if(current?.tab===alarmTabId)localStorage.removeItem(alarmLeaseKey);
    }catch(error){}
    alarmLeaseKey='';
  }

  setInterval(function(){
    if(!alarmLeaseKey)return;
    try{
      const current=JSON.parse(localStorage.getItem(alarmLeaseKey)||'null');
      if(current?.tab!==alarmTabId){alarmLeaseKey='';return}
      localStorage.setItem(alarmLeaseKey,JSON.stringify({tab:alarmTabId,expiresAt:Date.now()+20_000}));
    }catch(error){}
  },5_000);
  window.addEventListener('pagehide',releaseAlarmLease);

  function ensureAlarmContext(){
    if(!alarmContext||alarmContext.state==='closed'){
      const AudioContextClass=window.AudioContext||window.webkitAudioContext;
      if(AudioContextClass)alarmContext=new AudioContextClass();
    }
    return alarmContext;
  }

  async function unlockAlarm(){
    const context=ensureAlarmContext();
    if(context&&context.state==='suspended'){
      try{await context.resume()}catch(error){}
    }
    return Boolean(context&&context.state==='running');
  }

  function ensureAlarmOverlay(){
    if(alarmOverlay&&document.body.contains(alarmOverlay))return alarmOverlay;
    const el=document.createElement('section');
    el.id='fighterLossAlarmOverlay';
    el.className='fighter-loss-alarm-overlay hidden';
    el.setAttribute('role','alert');
    el.innerHTML='<div class="fighter-loss-alarm-copy"><span>JLR LOSS ALARM</span><strong id="fighterLossAlarmTitle">HEAVY FIGHTER DOWN</strong><small id="fighterLossAlarmDetail">Open Tracker for details.</small></div><div class="fighter-loss-alarm-actions"><button id="fighterLossAlarmOpen" class="board-tool" type="button">OPEN TRACKER</button><button id="fighterLossAlarmStop" class="orb red" type="button">■ ACKNOWLEDGE / STOP</button></div>';
    document.body.appendChild(el);
    el.querySelector('#fighterLossAlarmStop')?.addEventListener('click',()=>stopFighterAlarm());
    el.querySelector('#fighterLossAlarmOpen')?.addEventListener('click',()=>{
      document.querySelector('.app-tab[data-tab="tracker"]')?.click();
    });
    alarmOverlay=el;
    return el;
  }

  function showAlarmOverlay(loss){
    const el=ensureAlarmOverlay();
    const title=el.querySelector('#fighterLossAlarmTitle');
    const detail=el.querySelector('#fighterLossAlarmDetail');
    if(title)title.textContent=loss?.test?'HEAVY FIGHTER ALARM TEST':loss?.simulated?'SIMULATED HEAVY FIGHTER LOSS':String(loss?.shipTypeName||'Heavy Fighter').toUpperCase()+' DOWN';
    if(detail){
      const system=String(loss?.systemName||'').trim();
      const value=Math.max(0,Number(loss?.totalValue)||0);
      const closestName=String(loss?.closest?.name||'').trim();
      const closestAu=Number(loss?.closest?.distanceAu);
      const closestDistance=Number.isFinite(closestAu)&&closestAu>=0
        ?' ('+closestAu.toFixed(closestAu>=10?1:closestAu>=1?2:closestAu>=.1?2:3)+' AU)'
        :'';
      const closest=closestName?' • Closest: '+closestName+closestDistance:'';
      detail.textContent=loss?.test
        ?'Dedicated local two-tone alarm • no spoken voice'
        :(loss?.simulated?'OWNER TEST • ':'')+(system||'Unknown system')+closest+(value?' • '+Math.round(value).toLocaleString()+' ISK':'');
    }
    el.classList.remove('hidden');
  }

  function stopAlarmNodes(){
    alarmGeneration++;
    let stopped=false;
    if(alarmTimer){clearTimeout(alarmTimer);alarmTimer=null;stopped=true}
    for(const node of alarmNodes.splice(0)){
      try{node.stop?.()}catch(error){}
      try{node.disconnect?.()}catch(error){}
      stopped=true;
    }
    if(alarmOverlay&&!alarmOverlay.classList.contains('hidden')){
      alarmOverlay.classList.add('hidden');
      stopped=true;
    }
    return stopped;
  }

  function stopFighterAlarm(){
    const stopped=stopAlarmNodes();
    releaseAlarmLease();
    window.dispatchEvent(new Event('jlr-alarm-stopped'));
    return stopped;
  }

  function playAlarmCycle(context,generation){
    if(generation!==alarmGeneration)return;
    for(const node of alarmNodes.splice(0)){
      try{node.stop?.()}catch(error){}
      try{node.disconnect?.()}catch(error){}
    }

    const now=context.currentTime+.03;
    const master=context.createGain();
    master.gain.setValueAtTime(.0001,now);
    master.connect(context.destination);
    alarmNodes.push(master);

    for(let i=0;i<8;i++){
      const start=now+i*.46;
      const osc=context.createOscillator();
      const gain=context.createGain();
      osc.type=i%2===0?'square':'sawtooth';
      osc.frequency.setValueAtTime(i%2===0?880:620,start);
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.exponentialRampToValueAtTime(.24,start+.025);
      gain.gain.setValueAtTime(.24,start+.29);
      gain.gain.exponentialRampToValueAtTime(.0001,start+.40);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start+.42);
      alarmNodes.push(osc,gain);
    }
    master.gain.exponentialRampToValueAtTime(.88,now+.02);
    master.gain.setValueAtTime(.88,now+3.55);
    master.gain.exponentialRampToValueAtTime(.0001,now+3.75);

    alarmTimer=setTimeout(()=>{
      alarmTimer=null;
      if(generation===alarmGeneration)playAlarmCycle(context,generation);
    },4050);
  }

  async function playFighterAlarm(loss){
    stopAlarmNodes();
    const context=ensureAlarmContext();
    if(context&&context.state==='suspended'){
      try{await context.resume()}catch(error){}
    }

    // Always surface the visual alarm, even when browser autoplay policy keeps
    // the AudioContext suspended. Only a tab that can actually play sound may
    // claim the cross-tab audio lease.
    showAlarmOverlay(loss||{});
    alarmLastTrigger={
      at:new Date().toISOString(),
      killmailId:loss?.killmailId==null?null:String(loss.killmailId),
      simulated:Boolean(loss?.simulated),
      localTest:Boolean(loss?.test),
      simulationRunId:String(loss?.simulationRunId||''),
      audioReady:Boolean(context&&context.state==='running'),
      playing:false,
    };
    if(!context||context.state!=='running'){
      if(!loss?.test)releaseAlarmLease();
      return false;
    }
    if(!loss?.test&&!claimAlarmLease())return false;

    const generation=alarmGeneration;
    playAlarmCycle(context,generation);
    alarmLastTrigger={...alarmLastTrigger,playing:true};
    return true;
  }

  function alarmRuntimeStatus(){
    return{
      overlayVisible:Boolean(alarmOverlay&&!alarmOverlay.classList.contains('hidden')),
      spokenVoice:false,
      alarmVersion:ALARM_VERSION,
      audioContext:alarmContext?.state||'none',
      alarmActive:Boolean(alarmTimer||alarmNodes.length),
      leaseHeld:Boolean(alarmLeaseKey),
      lastTrigger:alarmLastTrigger,
    };
  }

  function watchTrackerUi(){
    const firstGestureUnlock=()=>{
      void unlockAlarm();
      document.removeEventListener('pointerdown',firstGestureUnlock,true);
      document.removeEventListener('keydown',firstGestureUnlock,true);
    };
    document.addEventListener('pointerdown',firstGestureUnlock,true);
    document.addEventListener('keydown',firstGestureUnlock,true);

    const relabel=()=>{
      const button=document.getElementById('trackerTest');
      if(button&&button.textContent!=='▶ TEST LOSS ALARM'){
        button.textContent='▶ TEST LOSS ALARM';
        button.title='Test the dedicated local Heavy Fighter loss alarm';
      }
    };
    if(typeof MutationObserver==='function'){
      const observer=new MutationObserver(relabel);
      observer.observe(document.documentElement,{subtree:true,childList:true});
    }
    relabel();
  }

  // A local oscillator is the only audio path for Heavy Fighter alerts.
  window.jlrPlayFighterAlarm=playFighterAlarm;
  window.jlrStopFighterAlarm=stopFighterAlarm;
  window.jlrUnlockFighterAlarm=unlockAlarm;
  window.jlrAlarmRuntimeStatus=alarmRuntimeStatus;

  watchTrackerUi();

  const core=document.createElement('script');
  core.src=CORE_URL;
  core.async=false;
  core.dataset.jlrTrackerCore='1';
  core.onerror=function(){console.error('JLR Tracker core failed to load.')};
  document.head.appendChild(core);
})();
