'use strict';
(function(){
  const ALARM_VERSION='2.9.146';
  const CORE_URL='/tracker-core.js?v=2.9.146-alert60';

  let alarmContext=null;
  let alarmNodes=[];
  let alarmTimer=null;
  let alarmOverlay=null;
  let alarmGeneration=0;
  const alarmTabId=Math.random().toString(36).slice(2)+Date.now().toString(36);
  let alarmLeaseKey='';

  function claimAlarmLease(){
    const account=String(window.jlrVoiceAccountId||'global').trim()||'global';
    const key='jlrHeavyFighterAlarmOwner:'+account;
    const now=Date.now();
    try{
      const current=JSON.parse(localStorage.getItem(key)||'null');
      if(current?.tab!==alarmTabId&&Number(current?.expiresAt)>now)return false;
      localStorage.setItem(key,JSON.stringify({tab:alarmTabId,expiresAt:now+90_000}));
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
      localStorage.setItem(alarmLeaseKey,JSON.stringify({tab:alarmTabId,expiresAt:Date.now()+90_000}));
    }catch(error){}
  },15_000);
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
    if(title)title.textContent=loss?.test?'HEAVY FIGHTER ALARM TEST':String(loss?.shipTypeName||'Heavy Fighter').toUpperCase()+' DOWN';
    if(detail){
      const system=String(loss?.systemName||'').trim();
      const value=Math.max(0,Number(loss?.totalValue)||0);
      detail.textContent=loss?.test
        ?'Dedicated local two-tone alarm • no spoken voice'
        :(system||'Unknown system')+(value?' • '+Math.round(value).toLocaleString()+' ISK':'');
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
    if(!loss?.test&&!claimAlarmLease())return false;
    stopAlarmNodes();
    const context=ensureAlarmContext();
    if(!context){
      if(!loss?.test)releaseAlarmLease();
      return false;
    }
    if(context.state==='suspended'){
      try{await context.resume()}catch(error){}
    }
    if(context.state!=='running'){
      if(!loss?.test)releaseAlarmLease();
      return false;
    }
    const generation=alarmGeneration;
    showAlarmOverlay(loss||{});
    playAlarmCycle(context,generation);
    return true;
  }

  function alarmRuntimeStatus(){
    return{
      spokenVoice:false,
      alarmVersion:ALARM_VERSION,
      audioContext:alarmContext?.state||'none',
      alarmActive:Boolean(alarmTimer||alarmNodes.length),
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

  // Alarm-only compatibility surface. Spoken voice output is intentionally
  // unavailable and cannot fall back to browser speech or a remote TTS worker.
  window.jlrVoiceMode='disabled';
  window.jlrVoiceProfile='disabled';
  window.jlrVoiceTransport='none';
  window.jlrVoiceLastError='';
  window.jlrPlayFighterAlarm=playFighterAlarm;
  window.jlrStopFighterAlarm=stopFighterAlarm;
  window.jlrStopVoice=stopFighterAlarm;
  window.jlrUnlockFighterAlarm=unlockAlarm;
  window.jlrSpeakEvent=async function(){return false};
  window.jlrVoiceIsActive=function(){return false};
  window.jlrAutoVoiceAllowed=function(){return false};
  window.jlrReleaseAutoVoice=releaseAlarmLease;
  window.jlrWarmVoice=unlockAlarm;
  window.jlrRecoverVoice=async function(){return true};
  window.jlrVoiceRuntimeStatus=alarmRuntimeStatus;

  watchTrackerUi();

  const core=document.createElement('script');
  core.src=CORE_URL;
  core.async=false;
  core.dataset.jlrTrackerCore='1';
  core.onerror=function(){console.error('JLR Tracker core failed to load.')};
  document.head.appendChild(core);
})();
