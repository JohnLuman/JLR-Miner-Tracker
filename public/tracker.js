'use strict';
(function(){
  const ALARM_VERSION='2.9.37';
  const ALARM_CHUNKS=6;
  const CORE_URL='/tracker-core.js?v=2.9.32';

  let alarmContext=null;
  let alarmBufferPromise=null;
  let alarmSource=null;
  let alarmHtmlPlayer=null;
  let alarmBlobUrl=null;
  let lastAlertText='';
  let lastAlertAt=0;

  function ensureAlarmContext(){
    if(!alarmContext){
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(AudioContext)alarmContext=new AudioContext();
    }
    return alarmContext;
  }

  async function loadAlarmBytes(){
    const requests=[];
    for(let index=0;index<ALARM_CHUNKS;index++){
      const part=String(index).padStart(2,'0');
      requests.push(fetch('/audio/who-lost-the-fighter-'+part+'.b64?v='+ALARM_VERSION,{cache:'no-store'}).then(function(response){
        if(!response.ok)throw new Error('Alarm audio part '+part+' failed: '+response.status);
        return response.text();
      }));
    }
    const chunks=await Promise.all(requests);
    const raw=atob(chunks.join('').replace(/\s+/g,''));
    const bytes=new Uint8Array(raw.length);
    for(let index=0;index<raw.length;index++)bytes[index]=raw.charCodeAt(index);
    if(bytes.length!==70317)throw new Error('Alarm audio was incomplete: '+bytes.length+' bytes.');
    return bytes;
  }

  function ensureHtmlPlayer(bytes){
    if(alarmHtmlPlayer)return alarmHtmlPlayer;
    if(!alarmBlobUrl)alarmBlobUrl=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));
    alarmHtmlPlayer=new Audio(alarmBlobUrl);
    alarmHtmlPlayer.preload='auto';
    alarmHtmlPlayer.volume=1;
    return alarmHtmlPlayer;
  }

  function loadAlarmBuffer(){
    if(alarmBufferPromise)return alarmBufferPromise;
    alarmBufferPromise=(async function(){
      const bytes=await loadAlarmBytes();
      const context=ensureAlarmContext();
      if(context){
        try{
          const copy=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
          const buffer=await context.decodeAudioData(copy);
          return {kind:'webaudio',buffer:buffer,bytes:bytes};
        }catch(error){
          console.warn('Who Lost the Fighter WebAudio decode failed; using HTML audio.',error);
        }
      }
      return {kind:'html',player:ensureHtmlPlayer(bytes),bytes:bytes};
    })().catch(function(error){
      alarmBufferPromise=null;
      console.warn('Who Lost the Fighter alarm failed to load.',error);
      throw error;
    });
    return alarmBufferPromise;
  }

  async function unlockAlarm(){
    const context=ensureAlarmContext();
    if(context&&context.state==='suspended'){
      try{await context.resume();}catch(error){}
    }
    loadAlarmBuffer().catch(function(){});
    return Boolean(!context||context.state==='running');
  }

  async function playSongAlarm(){
    try{
      const loaded=await loadAlarmBuffer();
      if(loaded.kind==='webaudio'){
        const context=ensureAlarmContext();
        if(!context)return false;
        if(context.state==='suspended'){
          try{await context.resume();}catch(error){}
        }
        if(context.state!=='running')return false;
        if(alarmSource){
          try{alarmSource.stop();}catch(error){}
          alarmSource=null;
        }
        const source=context.createBufferSource();
        const gain=context.createGain();
        source.buffer=loaded.buffer;
        gain.gain.setValueAtTime(1,context.currentTime);
        source.connect(gain);
        gain.connect(context.destination);
        source.onended=function(){if(alarmSource===source)alarmSource=null;};
        alarmSource=source;
        source.start(0);
        return true;
      }

      const player=loaded.player||ensureHtmlPlayer(loaded.bytes);
      player.pause();
      player.currentTime=0;
      player.muted=false;
      player.volume=1;
      await player.play();
      return true;
    }catch(error){
      console.warn('Who Lost the Fighter alarm playback failed.',error);
      return false;
    }
  }


  function stopSongAlarm(){
    let stopped=false;
    if(alarmSource){
      try{alarmSource.stop();stopped=true;}catch(error){}
      alarmSource=null;
    }
    if(alarmHtmlPlayer){
      try{
        alarmHtmlPlayer.pause();
        alarmHtmlPlayer.currentTime=0;
        stopped=true;
      }catch(error){}
    }
    return stopped;
  }

  function isFighterAlert(text){
    const value=String(text||'').trim();
    return /\bDOWN in\b/i.test(value)||/Heavy Fighters DOWN/i.test(value);
  }

  function handleToast(){
    const toast=document.getElementById('toast');
    if(!toast||toast.classList.contains('hidden'))return;
    const text=String(toast.textContent||'').trim();
    if(!isFighterAlert(text))return;
    const time=Date.now();
    if(text===lastAlertText&&time-lastAlertAt<3000)return;
    lastAlertText=text;
    lastAlertAt=time;
    playSongAlarm();
  }

  function watchTrackerUi(){
    document.addEventListener('click',function(event){
      const target=event.target instanceof Element?event.target:null;
      if(!target)return;
      if(target.closest('#trackerArm')||target.closest('#trackerTest'))unlockAlarm();
    },true);

    const relabel=function(){
      const button=document.getElementById('trackerTest');
      if(button&&button.textContent!=='▶ TEST WHO LOST THE FIGHTER'){
        button.textContent='▶ TEST WHO LOST THE FIGHTER';
        button.title='Play the 35-second Who Lost the Fighter alarm';
      }
    };
    const uiObserver=new MutationObserver(relabel);
    uiObserver.observe(document.documentElement,{subtree:true,childList:true});
    relabel();
  }

  window.jlrPlayFighterAlarm=playSongAlarm;
  window.jlrStopFighterAlarm=stopSongAlarm;
  window.jlrUnlockFighterAlarm=unlockAlarm;

    watchTrackerUi();
  loadAlarmBuffer().catch(function(){});

  const core=document.createElement('script');
  core.src=CORE_URL;
  core.async=false;
  core.dataset.jlrTrackerCore='1';
  core.onerror=function(){console.error('JLR Tracker core failed to load.');};
  document.head.appendChild(core);
})();
