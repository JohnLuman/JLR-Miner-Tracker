'use strict';
(function(){
  const ALARM_VERSION='2.9.47';
  const CORE_URL='/tracker-core.js?v=2.9.47';

  let alarmContext=null;
  let alarmSource=null;
  let activeFetch=null;
  let activeUtterance=null;
  let activeMediaElement=null;
  let alarmGeneration=0;
  let lastVoiceMode='unknown';

  function reportVoiceMode(mode,detail){
    lastVoiceMode=mode;
    window.jlrVoiceMode=mode;
    try{
      window.dispatchEvent(new CustomEvent('jlr-voice-mode',{detail:{mode:mode,detail:String(detail||'')}}));
    }catch(error){}
  }

  function ensureAlarmContext(){
    if(!alarmContext){
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(AudioContext)alarmContext=new AudioContext();
    }
    return alarmContext;
  }

  function fallbackText(loss){
    if(loss&&loss.test)return 'Attention. J. L. R. custom voice systems are being tested. Heavy Fighter tracking is standing by.';
    const fighter=String(loss&&loss.shipTypeName||'Heavy Fighter').replace(/[^\w .,&()\-]/g,'').trim()||'Heavy Fighter';
    const system=String(loss&&loss.systemName||'an unknown system').replace(/[^\w .,&()\-]/g,'').trim()||'an unknown system';
    const value=Number(loss&&loss.totalValue)||0;
    let valueText='';
    if(value>=1e9)valueText=' Estimated loss value, '+(value/1e9).toFixed(value>=1e10?0:1)+' billion ISK.';
    else if(value>=1e6)valueText=' Estimated loss value, '+(value/1e6).toFixed(value>=1e7?0:1)+' million ISK.';
    else if(value>=1e3)valueText=' Estimated loss value, '+Math.round(value/1e3)+' thousand ISK.';
    return 'Attention. A '+fighter+' has been lost in '+system+'.'+valueText+' Please check J. L. R. Tracker for pilot and kill information.';
  }

  function stopVoiceAlert(){
    alarmGeneration++;
    let stopped=false;
    if(activeFetch){
      try{activeFetch.abort();stopped=true;}catch(error){}
      activeFetch=null;
    }
    if(alarmSource){
      try{alarmSource.stop();stopped=true;}catch(error){}
      alarmSource=null;
    }
    if(activeMediaElement){
      try{
        activeMediaElement.pause();
        activeMediaElement.removeAttribute('src');
        activeMediaElement.load();
        stopped=true;
      }catch(error){}
      activeMediaElement=null;
    }
    if('speechSynthesis' in window){
      const synth=window.speechSynthesis;
      if(activeUtterance||synth.speaking||synth.pending){
        try{synth.cancel();stopped=true;}catch(error){}
      }
      activeUtterance=null;
    }
    return stopped;
  }

  async function unlockAlarm(){
    const context=ensureAlarmContext();
    if(context&&context.state==='suspended'){
      try{await context.resume();}catch(error){}
    }
    if('speechSynthesis' in window)window.speechSynthesis.getVoices();
    return Boolean((context&&context.state==='running')||('speechSynthesis' in window));
  }

  function preferredFallbackVoice(){
    if(!('speechSynthesis' in window))return null;
    const voices=window.speechSynthesis.getVoices()||[];
    return voices.slice().sort(function(a,b){
      function score(v){
        const name=String(v&&v.name||'').toLowerCase();
        const lang=String(v&&v.lang||'').toLowerCase();
        let n=lang.startsWith('en-us')?30:lang.startsWith('en')?20:0;
        if(/natural|neural|online/.test(name))n+=25;
        if(/guy|ryan|mark|david|daniel|george/.test(name))n+=10;
        return n;
      }
      return score(b)-score(a);
    })[0]||null;
  }

  function playFallbackText(text,generation){
    if(generation!==alarmGeneration||!('speechSynthesis' in window))return false;
    try{
      reportVoiceMode('fallback','Browser voice fallback');
      const synth=window.speechSynthesis;
      synth.cancel();
      const utterance=new SpeechSynthesisUtterance(String(text||'J. L. R. voice notification.'));
      const voice=preferredFallbackVoice();
      if(voice)utterance.voice=voice;
      utterance.lang=voice&&voice.lang?voice.lang:'en-US';
      utterance.rate=.9;
      utterance.pitch=.82;
      utterance.volume=1;
      utterance.onend=function(){if(activeUtterance===utterance)activeUtterance=null;};
      utterance.onerror=function(){if(activeUtterance===utterance)activeUtterance=null;};
      activeUtterance=utterance;
      synth.speak(utterance);
      return true;
    }catch(error){
      console.warn('JLR fallback voice failed.',error);
      return false;
    }
  }

  function playFallbackSpeech(loss,generation){
    return playFallbackText(fallbackText(loss),generation);
  }

  async function playAudioResponse(response,generation,detail){
    if(generation!==alarmGeneration)return false;
    const type=String(response.headers.get('content-type')||'').toLowerCase();
    if(!type.startsWith('audio/'))throw new Error('JLR custom voice returned '+(type||'invalid content type'));
    const context=ensureAlarmContext();
    if(context&&context.state==='suspended'){
      try{await context.resume();}catch(error){}
    }
    if(!context||context.state!=='running')throw new Error('Browser audio context is not active.');
    const bytes=await response.arrayBuffer();
    if(generation!==alarmGeneration)return false;
    const buffer=await context.decodeAudioData(bytes.slice(0));
    if(generation!==alarmGeneration)return false;
    const source=context.createBufferSource();
    const gain=context.createGain();
    source.buffer=buffer;
    gain.gain.setValueAtTime(1,context.currentTime);
    source.connect(gain);
    gain.connect(context.destination);
    source.onended=function(){if(alarmSource===source)alarmSource=null;};
    alarmSource=source;
    source.start(0);
    reportVoiceMode('custom',detail||'Custom GPT-SoVITS voice');
    return true;
  }

  function playStreamUrl(url,generation,fallback,detail){
    if(generation!==alarmGeneration)return Promise.resolve(false);
    return new Promise(function(resolve){
      const audio=new Audio();
      activeMediaElement=audio;
      audio.preload='auto';
      audio.volume=1;
      audio.src=url;
      let settled=false;
      let started=false;
      const startedAt=performance.now();

      function cleanupAsCurrent(){
        if(activeMediaElement===audio)activeMediaElement=null;
      }
      function finish(value){
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        resolve(Boolean(value));
      }
      function useFallback(reason){
        if(generation!==alarmGeneration){cleanupAsCurrent();finish(false);return}
        if(reason)console.warn('JLR streaming voice unavailable; using browser fallback.',reason);
        try{audio.pause();audio.removeAttribute('src');audio.load()}catch(error){}
        cleanupAsCurrent();
        const ok=playFallbackText(fallback,generation);
        finish(ok);
      }

      audio.addEventListener('playing',function(){
        if(generation!==alarmGeneration){
          try{audio.pause()}catch(error){}
          cleanupAsCurrent();
          finish(false);
          return;
        }
        started=true;
        const latency=Math.max(0,Math.round(performance.now()-startedAt));
        reportVoiceMode('custom',(detail||'Streaming GPT-SoVITS voice')+' • '+latency+' ms to audio');
        window.jlrVoiceTransport='streaming';
        finish(true);
      },{once:true});
      audio.addEventListener('ended',cleanupAsCurrent,{once:true});
      audio.addEventListener('error',function(){
        if(!started)useFallback(new Error('Streaming audio element failed to load.'));
        else cleanupAsCurrent();
      },{once:true});

      const timer=setTimeout(function(){
        if(!started)useFallback(new Error('Streaming voice start timed out.'));
      },45000);

      try{
        const playPromise=audio.play();
        if(playPromise&&typeof playPromise.catch==='function'){
          playPromise.catch(function(error){if(!started)useFallback(error);});
        }
      }catch(error){
        useFallback(error);
      }
    });
  }

  async function playVoiceAlert(loss){
    stopVoiceAlert();
    const generation=alarmGeneration;
    const isTest=Boolean(loss&&loss.test);
    const killId=String(loss&&loss.killmailId||'').replace(/\D/g,'');
    const endpoint=isTest?'/api/tracker/heavy-fighters/voice/test?stream=1':(killId?'/api/tracker/heavy-fighters/voice/'+killId+'?stream=1':'');
    if(!endpoint)return playFallbackSpeech(loss,generation);
    // Do not await this here: invoking resume + audio.play inside the same user
    // gesture gives browsers the best chance to preserve autoplay permission.
    unlockAlarm();
    return playStreamUrl(endpoint,generation,fallbackText(loss),'Streaming GPT-SoVITS voice');
  }

  async function speakEvent(type,payload,localFallback){
    stopVoiceAlert();
    const generation=alarmGeneration;
    const fallback=String(localFallback||'J. L. R. voice notification.');
    const kind=String(type||'');
    let endpoint='';
    if(kind==='startup')endpoint='/api/voice/stream/startup';
    else if(kind==='scan'){
      const system=String(payload&&payload.system||'').trim();
      if(system)endpoint='/api/voice/stream/scan?system='+encodeURIComponent(system);
    }else if(kind==='scout'){
      const system=String(payload&&payload.system||'').trim();
      const characterId=String(payload&&payload.characterId||'').trim();
      if(system&&characterId)endpoint='/api/voice/stream/scout?system='+encodeURIComponent(system)+'&characterId='+encodeURIComponent(characterId);
    }

    unlockAlarm();
    if(endpoint)return playStreamUrl(endpoint,generation,fallback,'JLR '+kind+' streaming voice');

    // Compatibility path for future event types that do not have GET streaming
    // routes yet.
    try{
      const controller=new AbortController();
      activeFetch=controller;
      const body={type:kind,...(payload&&typeof payload==='object'?payload:{})};
      const response=await fetch('/api/voice/event',{
        method:'POST',
        credentials:'same-origin',
        cache:'no-store',
        headers:{'Content-Type':'application/json','Accept':'audio/*, application/json'},
        body:JSON.stringify(body),
        signal:controller.signal
      });
      if(activeFetch===controller)activeFetch=null;
      if(generation!==alarmGeneration)return false;
      if(!response.ok)return playFallbackText(fallback,generation);
      return await playAudioResponse(response,generation,'JLR '+kind+' custom voice');
    }catch(error){
      if(generation!==alarmGeneration)return false;
      return playFallbackText(fallback,generation);
    }
  }

  function watchTrackerUi(){
    const firstGestureUnlock=function(){
      window.jlrVoiceUserActivated=true;
      unlockAlarm();
      document.removeEventListener('pointerdown',firstGestureUnlock,true);
      document.removeEventListener('keydown',firstGestureUnlock,true);
    };
    document.addEventListener('pointerdown',firstGestureUnlock,true);
    document.addEventListener('keydown',firstGestureUnlock,true);
    document.addEventListener('click',function(event){
      const target=event.target instanceof Element?event.target:null;
      if(!target)return;
      if(target.closest('#trackerArm')||target.closest('#trackerTest')||target.closest('#pasteScan')||target.closest('#scanPasteCheck'))unlockAlarm();
    },true);

    const relabel=function(){
      const button=document.getElementById('trackerTest');
      if(button&&button.textContent!=='▶ TEST JLR CUSTOM VOICE'){
        button.textContent='▶ TEST JLR CUSTOM VOICE';
        button.title='Test the dynamic JLR custom voice worker';
      }
    };
    const observer=new MutationObserver(relabel);
    observer.observe(document.documentElement,{subtree:true,childList:true});
    relabel();
  }

  window.jlrPlayFighterAlarm=playVoiceAlert;
  window.jlrStopFighterAlarm=stopVoiceAlert;
  window.jlrUnlockFighterAlarm=unlockAlarm;
  window.jlrSpeakEvent=speakEvent;

  if('speechSynthesis' in window){
    window.speechSynthesis.onvoiceschanged=function(){window.speechSynthesis.getVoices();};
  }
  watchTrackerUi();

  const core=document.createElement('script');
  core.src=CORE_URL;
  core.async=false;
  core.dataset.jlrTrackerCore='1';
  core.onerror=function(){console.error('JLR Tracker core failed to load.');};
  document.head.appendChild(core);
})();
