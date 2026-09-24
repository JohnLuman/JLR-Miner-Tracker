'use strict';
(function(){
  const ALARM_VERSION='2.9.133';
  const CORE_URL='/tracker-core.js?v=2.9.133';

  let alarmContext=null;
  let alarmSource=null;
  let activeFetch=null;
  let activeUtterance=null;
  let activeMediaElement=null;
  let activeBrainObjectUrl=null;
  const brainFetches=new Set();
  let alarmGeneration=0;
  let lastVoiceMode='unknown';
  let voiceQueue=[];
  let voiceQueueRunning=false;
  let voiceQueueActiveSince=0;
  let voiceQueueLastProgressAt=Date.now();
  let voiceRecoveryCount=0;
  const autoVoiceTabId=Math.random().toString(36).slice(2)+Date.now().toString(36);
  let autoVoiceKey='';

  // Only one open tab per signed-in account announces automatic updates. The
  // shared lease contains a tab ID and expiry, never a toon or system name.
  function autoVoiceAllowed(){
    const account=String(window.jlrVoiceAccountId||'').trim();
    if(!account)return true;
    const key='jlrAutoVoiceOwner:'+account;
    const now=Date.now();
    try{
      const current=JSON.parse(localStorage.getItem(key)||'null');
      if(current?.tab!==autoVoiceTabId&&Number(current?.expiresAt)>now)return false;
      localStorage.setItem(key,JSON.stringify({tab:autoVoiceTabId,expiresAt:now+90_000}));
      if(JSON.parse(localStorage.getItem(key)||'null')?.tab!==autoVoiceTabId)return false;
      autoVoiceKey=key;
    }catch(error){ /* Private storage unavailable: keep local voice usable. */ }
    return true;
  }

  function releaseAutoVoice(){
    if(!autoVoiceKey)return;
    try{
      if(JSON.parse(localStorage.getItem(autoVoiceKey)||'null')?.tab===autoVoiceTabId)localStorage.removeItem(autoVoiceKey);
    }catch(error){}
    autoVoiceKey='';
  }

  setInterval(function(){
    if(!autoVoiceKey)return;
    try{
      const current=JSON.parse(localStorage.getItem(autoVoiceKey)||'null');
      if(current?.tab!==autoVoiceTabId){autoVoiceKey='';return;}
      localStorage.setItem(autoVoiceKey,JSON.stringify({tab:autoVoiceTabId,expiresAt:Date.now()+90_000}));
    }catch(error){}
  },15_000);
  window.addEventListener('pagehide',releaseAutoVoice);

  async function warmVoiceRuntime(reason='voice warmup'){
    const context=ensureAlarmContext();
    if(context&&context.state==='suspended'){
      try{await context.resume()}catch(error){}
    }else if(context&&context.state==='closed'){
      alarmContext=null;
      const fresh=ensureAlarmContext();
      if(fresh&&fresh.state==='suspended'){
        try{await fresh.resume()}catch(error){}
      }
    }
    if('speechSynthesis' in window){
      try{window.speechSynthesis.getVoices()}catch(error){}
    }
    return true;
  }

  async function recoverVoiceTransport(reason='voice recovery'){
    voiceRecoveryCount++;
    voiceQueueLastProgressAt=Date.now();
    if(activeFetch){
      try{activeFetch.abort()}catch(error){}
      activeFetch=null;
    }
    for(const controller of brainFetches){
      try{controller.abort()}catch(error){}
    }
    brainFetches.clear();
    if(alarmSource){
      try{alarmSource.stop()}catch(error){}
      alarmSource=null;
    }
    if(activeMediaElement){
      try{
        activeMediaElement.pause();
        activeMediaElement.removeAttribute('src');
        activeMediaElement.load();
      }catch(error){}
      activeMediaElement=null;
    }
    if(activeBrainObjectUrl){
      try{URL.revokeObjectURL(activeBrainObjectUrl)}catch(error){}
      activeBrainObjectUrl=null;
    }
    if('speechSynthesis' in window){
      try{window.speechSynthesis.cancel()}catch(error){}
      activeUtterance=null;
    }
    window.jlrVoiceLastError='';
    reportVoiceMode('recovering',reason);
    await warmVoiceRuntime(reason);
    return true;
  }

  function voiceRuntimeStatus(){
    return{
      queueRunning:Boolean(voiceQueueRunning),
      queued:voiceQueue.length,
      activeForMs:voiceQueueActiveSince?Math.max(0,Date.now()-voiceQueueActiveSince):0,
      lastProgressMs:Math.max(0,Date.now()-voiceQueueLastProgressAt),
      recoveryCount:voiceRecoveryCount,
      audioContext:alarmContext?.state||'none',
      activeFetch:Boolean(activeFetch||brainFetches.size),
      activeAudio:Boolean(activeMediaElement||alarmSource||activeUtterance),
    };
  }

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

  function spokenSystem(value){
    const raw=String(value||'').replace(/[^A-Za-z0-9\- ]/g,'').trim();
    if(!raw)return'an unknown system';
    if(!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(raw))return raw;
    const digits={'0':'zero','1':'one','2':'two','3':'three','4':'four','5':'five','6':'six','7':'seven','8':'eight','9':'nine'};
    return [...raw].map(ch=>ch==='-'?'tack':(digits[ch]||ch)).join(' ');
  }

  function fallbackText(loss){
    if(loss&&loss.test)return 'Tracker voice online. Heavy Fighter tracking ready.';
    const fighter=String(loss&&loss.shipTypeName||'Heavy Fighter').replace(/[^\w .,&()\-]/g,'').trim()||'Heavy Fighter';
    const system=spokenSystem(loss&&loss.systemName||'an unknown system');
    const value=Number(loss&&loss.totalValue)||0;
    let valueText='';
    if(value>=1e9)valueText=' Estimated loss value, '+(value/1e9).toFixed(value>=1e10?0:1)+' billion ISK.';
    else if(value>=1e6)valueText=' Estimated loss value, '+(value/1e6).toFixed(value>=1e7?0:1)+' million ISK.';
    else if(value>=1e3)valueText=' Estimated loss value, '+Math.round(value/1e3)+' thousand ISK.';
    return fighter+' lost in '+system+'.'+valueText+' Check Tracker for details.';
  }

  function stopVoiceAlert(){
    alarmGeneration++;
    let stopped=false;
    const pending=voiceQueue.splice(0);
    for(const item of pending){
      try{item.resolve(false);}catch(error){}
    }
    if(activeFetch){
      try{activeFetch.abort();stopped=true;}catch(error){}
      activeFetch=null;
    }
    for(const controller of brainFetches){
      controller.abort();
      stopped=true;
    }
    brainFetches.clear();
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
    if(activeBrainObjectUrl){
      URL.revokeObjectURL(activeBrainObjectUrl);
      activeBrainObjectUrl=null;
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
      const utterance=new SpeechSynthesisUtterance(String(text||'Tracker voice notification.'));
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

  async function playAudioResponse(response,generation,detail,playbackRate=1){
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
    source.playbackRate.setValueAtTime(Math.max(.85,Math.min(1.25,Number(playbackRate)||1)),context.currentTime);
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
        window.jlrVoiceTransport='browser-fallback';
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
        window.jlrVoiceFirstAudioMs=latency;
        window.jlrVoiceTransport='streaming';
        window.jlrVoiceProfile='core';
        window.jlrVoiceLastError='';
        reportVoiceMode('custom',(detail||'Streaming GPT-SoVITS voice')+' • '+latency+' ms to audio');
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

  function voiceIsActive(){
    const synth='speechSynthesis' in window?window.speechSynthesis:null;
    return Boolean(activeMediaElement||alarmSource||activeUtterance||(synth&&(synth.speaking||synth.pending)));
  }

  function waitForVoiceIdle(generation){
    return new Promise(function(resolve){
      const started=Date.now();
      const tick=function(){
        if(generation!==alarmGeneration||!voiceIsActive()||Date.now()-started>120000){resolve();return}
        setTimeout(tick,100);
      };
      tick();
    });
  }

  function voicePriorityRank(priority){
    return priority==='critical'?4:priority==='high'?3:priority==='attention'?2:priority==='normal'?1:0;
  }

  function enqueueVoiceTask(run,label,options){
    const opts=options&&typeof options==='object'?options:{};
    const priority=String(opts.priority||'normal');
    const rank=voicePriorityRank(priority);
    const dedupeKey=String(opts.dedupeKey||'');
    return new Promise(function(resolve){
      if(dedupeKey&&voiceQueue.some(function(item){return item.dedupeKey===dedupeKey;})){
        resolve(false);
        return;
      }

      // Avoid an unbounded backlog if a browser tab wakes from suspension.
      // Drop the oldest lowest-priority queued item first.
      if(voiceQueue.length>=8){
        let dropIndex=0;
        for(let i=1;i<voiceQueue.length;i++){
          if(voiceQueue[i].rank<voiceQueue[dropIndex].rank)dropIndex=i;
        }
        const dropped=voiceQueue.splice(dropIndex,1)[0];
        try{dropped.resolve(false);}catch(error){}
      }

      voiceQueue.push({
        run:run,
        resolve:resolve,
        label:String(label||'JLR voice'),
        priority:priority,
        rank:rank,
        dedupeKey:dedupeKey,
        queuedAt:Date.now()
      });
      voiceQueue.sort(function(a,b){return b.rank-a.rank||a.queuedAt-b.queuedAt;});
      processVoiceQueue();
    });
  }

  async function processVoiceQueue(){
    if(voiceQueueRunning)return;
    voiceQueueRunning=true;
    voiceQueueActiveSince=Date.now();
    voiceQueueLastProgressAt=Date.now();
    try{
      while(voiceQueue.length){
        const item=voiceQueue.shift();
        const generation=alarmGeneration;
        let started=false;
        voiceQueueLastProgressAt=Date.now();
        try{
          started=Boolean(await item.run(generation));
        }catch(error){
          console.warn(item.label+' failed.',error);
          started=false;
        }
        voiceQueueLastProgressAt=Date.now();
        try{item.resolve(started);}catch(error){}
        // playStreamUrl resolves as soon as speech starts. Keep this queue slot
        // until the actual audio/utterance ends so the next event cannot cut it off.
        if(started)await waitForVoiceIdle(generation);
        voiceQueueLastProgressAt=Date.now();
      }
    }finally{
      voiceQueueRunning=false;
      voiceQueueActiveSince=0;
      voiceQueueLastProgressAt=Date.now();
      if(voiceQueue.length)processVoiceQueue();
    }
  }

  async function playStrictCustomTest(generation){
    window.jlrVoiceLastError='';
    const controller=new AbortController();
    activeFetch=controller;
    try{
      // Strict diagnostic path: fetch the real streaming endpoint, but buffer it
      // before playback so HTTP/auth/worker errors are visible instead of silently
      // becoming browser speechSynthesis. The nonce also defeats intermediary caches.
      const response=await fetch('/api/tracker/heavy-fighters/voice/test?stream=1&strict=1&nonce='+Date.now(),{
        method:'GET',
        credentials:'same-origin',
        cache:'no-store',
        headers:{'Accept':'audio/*, application/json'},
        signal:controller.signal
      });
      if(activeFetch===controller)activeFetch=null;
      if(generation!==alarmGeneration)return false;
      if(!response.ok){
        const type=String(response.headers.get('content-type')||'');
        let detail='';
        try{
          if(type.includes('application/json')){
            const body=await response.json();
            detail=String(body&&body.message||body&&body.error||'');
          }else{
            detail=String(await response.text());
          }
        }catch(error){}
        throw new Error('Custom voice test HTTP '+response.status+(detail?': '+detail.slice(0,220):''));
      }
      const played=await playAudioResponse(response,generation,'STRICT JLR GPT-SoVITS TEST');
      if(!played)throw new Error('Custom voice test returned audio but playback did not start.');
      window.jlrVoiceLastError='';
      return true;
    }catch(error){
      if(activeFetch===controller)activeFetch=null;
      if(generation!==alarmGeneration)return false;
      const message=String(error&&error.message||error||'Custom voice test failed.');
      window.jlrVoiceLastError=message;
      reportVoiceMode('error',message);
      console.error('STRICT JLR custom voice test failed.',error);
      return false;
    }
  }

  async function playCustomEndpoint(url,generation,detail){
    const controller=new AbortController();
    let timedOut=false;
    const timeout=setTimeout(()=>{
      timedOut=true;
      try{controller.abort()}catch(error){}
    },125000);
    activeFetch=controller;
    try{
      const response=await fetch(url,{
        method:'GET',
        credentials:'same-origin',
        cache:'no-store',
        headers:{'Accept':'audio/*, application/json'},
        signal:controller.signal
      });
      if(activeFetch===controller)activeFetch=null;
      if(generation!==alarmGeneration)return false;
      if(!response.ok){
        const type=String(response.headers.get('content-type')||'');
        let message='';
        try{
          if(type.includes('application/json')){
            const body=await response.json();
            message=String(body&&body.message||body&&body.error||'');
          }else message=String(await response.text());
        }catch(error){}
        throw new Error('JLR custom voice HTTP '+response.status+(message?': '+message.slice(0,220):''));
      }
      return await playAudioResponse(response,generation,detail||'JLR custom voice');
    }catch(error){
      if(activeFetch===controller)activeFetch=null;
      if(generation!==alarmGeneration)return false;
      const message=timedOut
        ?'JLR custom voice request timed out and was reset.'
        :String(error&&error.message||error||'JLR custom voice failed.');
      window.jlrVoiceLastError=message;
      reportVoiceMode('error',message);
      console.error((detail||'JLR custom voice')+' failed.',error);
      return false;
    }finally{
      clearTimeout(timeout);
    }
  }

  async function playVoiceAlert(loss){
    if(!loss?.test&&!autoVoiceAllowed())return false;
    stopVoiceAlert();
    const generation=alarmGeneration;
    const isTest=Boolean(loss&&loss.test);
    const killId=String(loss&&loss.killmailId||'').replace(/\D/g,'');
    if(isTest){
      unlockAlarm();
      return playStrictCustomTest(generation);
    }
    const endpoint=killId?'/api/tracker/heavy-fighters/voice/'+killId+'?stream=1':'';
    if(!endpoint)return false;
    unlockAlarm();
    return playCustomEndpoint(endpoint+'&nonce='+Date.now(),generation,'JLR Heavy Fighter custom voice');
  }

  function splitBrainVoiceText(text,maxLen){
    const clean=String(text||'').replace(/\s+/g,' ').trim();
    const limit=Math.max(120,Number(maxLen)||220);
    if(!clean)return[];
    const sentences=clean.split(/(?<=[.!?])\s+/);
    const chunks=[];
    let current='';
    const pushCurrent=()=>{if(current.trim())chunks.push(current.trim());current='';};
    for(const sentenceRaw of sentences){
      const sentence=String(sentenceRaw||'').trim();
      if(!sentence)continue;
      if(sentence.length<=limit){
        if(!current)current=sentence;
        else if((current+' '+sentence).length<=limit)current+=' '+sentence;
        else{pushCurrent();current=sentence;}
        continue;
      }
      pushCurrent();
      const words=sentence.split(/\s+/);
      let piece='';
      for(const word of words){
        if(!piece)piece=word;
        else if((piece+' '+word).length<=limit)piece+=' '+word;
        else{chunks.push(piece);piece=word;}
      }
      if(piece)chunks.push(piece);
    }
    pushCurrent();
    return chunks;
  }

  async function fetchBufferedBrainAudio(text,generation,detail){
    if(generation!==alarmGeneration)return null;
    const controller=new AbortController();
    let timedOut=false;
    const timeout=setTimeout(()=>{
      timedOut=true;
      try{controller.abort()}catch(error){}
    },90000);
    brainFetches.add(controller);
    try{
      const response=await fetch('/api/voice/event',{
        method:'POST',
        credentials:'same-origin',
        cache:'no-store',
        headers:{'Content-Type':'application/json','Accept':'audio/*, application/json'},
        body:JSON.stringify({type:'brain',text:String(text||'')}),
        signal:controller.signal
      });
      if(generation!==alarmGeneration)return null;
      if(!response.ok){
        const type=String(response.headers.get('content-type')||'');
        let message='';
        try{
          if(type.includes('application/json')){
            const body=await response.json();
            message=String(body&&body.message||body&&body.error||'');
          }else message=String(await response.text());
        }catch(error){}
        throw new Error('JLR conversational voice HTTP '+response.status+(message?': '+message.slice(0,220):''));
      }
      const profile=String(response.headers.get('x-jlr-voice-profile')||'custom');
      const mime=String(response.headers.get('content-type')||'').split(';')[0].trim();
      if(!mime.startsWith('audio/'))throw new Error('Custom voice returned '+(mime||'an invalid content type'));
      const bytes=await response.arrayBuffer();
      if(generation!==alarmGeneration)return null;
      if(!bytes.byteLength||bytes.byteLength>8_000_000)throw new Error('Custom voice returned an invalid audio size.');
      return{blob:new Blob([bytes],{type:mime}),profile};
    }catch(error){
      if(generation!==alarmGeneration)return null;
      if(error?.name==='AbortError'&&!timedOut)return null;
      const message=timedOut
        ?'JLR conversational voice request timed out and was reset.'
        :String(error&&error.message||error||'JLR conversational voice failed.');
      console.error((detail||'JLR conversational custom voice')+' failed.',error);
      return{error:message};
    }finally{
      clearTimeout(timeout);
      brainFetches.delete(controller);
    }
  }

  function playBrainAudioChunk(prepared,generation,detail){
    if(generation!==alarmGeneration)return Promise.resolve(false);
    return new Promise(function(resolve){
      const audio=new Audio();
      activeMediaElement=audio;
      audio.preload='auto';
      audio.volume=1;
      audio.playbackRate=1.18;
      try{audio.preservesPitch=true}catch(error){}
      try{audio.webkitPreservesPitch=true}catch(error){}
      const objectUrl=URL.createObjectURL(prepared.blob);
      activeBrainObjectUrl=objectUrl;
      audio.src=objectUrl;
      let settled=false;
      let started=false;
      const startedAt=performance.now();

      const cleanup=()=>{
        if(activeMediaElement===audio)activeMediaElement=null;
        if(activeBrainObjectUrl===objectUrl)activeBrainObjectUrl=null;
        URL.revokeObjectURL(objectUrl);
      };
      const finish=value=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        resolve(Boolean(value));
      };
      audio.addEventListener('playing',function(){
        if(generation!==alarmGeneration){
          try{audio.pause()}catch(error){}
          cleanup();
          finish(false);
          return;
        }
        started=true;
        const latency=Math.max(0,Math.round(performance.now()-startedAt));
        window.jlrVoiceTransport='verified-buffered';
        window.jlrVoiceProfile=prepared.profile;
        window.jlrVoiceLastError='';
        reportVoiceMode('custom',(detail||'JLR conversational voice')+' • '+prepared.profile+' • '+latency+' ms to playback');
        finish(true);
      },{once:true});
      audio.addEventListener('ended',cleanup,{once:true});
      audio.addEventListener('error',function(){
        cleanup();
        if(generation!==alarmGeneration){finish(false);return;}
        const message='Custom voice audio failed during playback.';
        window.jlrVoiceLastError=message;
        reportVoiceMode('error',message);
        finish(false);
      },{once:true});
      const timer=setTimeout(function(){
        if(started)return;
        try{audio.pause();audio.removeAttribute('src');audio.load()}catch(error){}
        cleanup();
        window.jlrVoiceLastError='Custom voice audio did not begin within 10 seconds.';
        reportVoiceMode('error',window.jlrVoiceLastError);
        finish(false);
      },10000);

      try{
        const playPromise=audio.play();
        if(playPromise&&typeof playPromise.catch==='function'){
          playPromise.catch(function(error){
            if(started)return;
            cleanup();
            window.jlrVoiceLastError=String(error?.message||error||'Live core voice playback was blocked.');
            reportVoiceMode('error',window.jlrVoiceLastError);
            finish(false);
          });
        }
      }catch(error){
        cleanup();
        window.jlrVoiceLastError=String(error?.message||error||'Live core voice playback failed.');
        reportVoiceMode('error',window.jlrVoiceLastError);
        finish(false);
      }
    });
  }

  async function playCustomBrainText(text,generation,detail){
    if(generation!==alarmGeneration)return false;
    window.jlrVoiceLastError='';
    const chunks=splitBrainVoiceText(text,140);
    if(!chunks.length)return false;
    let allCustom=true;
    for(let i=0;i<chunks.length;i++){
      if(generation!==alarmGeneration)return false;
      const chunk=chunks[i];
      const label=(detail||'JLR brain custom voice')+' • '+(i+1)+'/'+chunks.length;
      const endpoint='/api/voice/stream/brain?text='+encodeURIComponent(chunk)+'&nonce='+Date.now();
      const ok=await playStreamUrl(endpoint,generation,chunk,label);
      if(!ok)return false;
      if(window.jlrVoiceTransport!=='streaming')allCustom=false;
      await waitForVoiceIdle(generation);
      if(window.jlrVoiceLastError&&allCustom)return false;
    }
    if(allCustom){
      window.jlrVoiceLastError='';
      window.jlrVoiceProfile='core';
      reportVoiceMode('custom',detail||'JLR conversational core voice');
    }
    return true;
  }

  async function speakEvent(type,payload,localFallback){
    const fallback=String(localFallback||'Tracker voice notification.');
    const kind=String(type||'');
    if(payload?.automatic&&!autoVoiceAllowed())return false;
    let endpoint='';
    if(kind==='startup')endpoint='/api/voice/stream/startup';
    else if(kind==='briefing')endpoint='/api/voice/stream/briefing?force=1';
    else if(kind==='why'){
      const system=String(payload&&payload.system||'').trim();
      if(system)endpoint='/api/voice/stream/why?system='+encodeURIComponent(system);
    }else if(kind==='scan'){
      const system=String(payload&&payload.system||'').trim();
      if(system)endpoint='/api/voice/stream/scan?system='+encodeURIComponent(system);
    }else if(kind==='scout'){
      const system=String(payload&&payload.system||'').trim();
      const characterId=String(payload&&payload.characterId||'').trim();
      if(system&&characterId)endpoint='/api/voice/stream/scout?system='+encodeURIComponent(system)+'&characterId='+encodeURIComponent(characterId);
    }else if(kind==='field'){
      const system=String(payload&&payload.system||'').trim();
      if(system)endpoint='/api/voice/stream/field?system='+encodeURIComponent(system);
    }

    // Resume any browser audio state that may have been suspended while the PC
    // or tab was idle before this request enters the queue.
    await warmVoiceRuntime('voice request');
    return enqueueVoiceTask(async function(generation){
      if(kind==='brain'||kind==='repeat'){
        const text=String(payload&&payload.text||fallback||'').trim();
        if(!text)return false;
        let ok=await playCustomBrainText(text,generation,'JLR '+kind+' custom voice');
        if(!ok&&generation===alarmGeneration&&!payload?.automatic){
          await recoverVoiceTransport('manual conversational voice retry');
          if(generation!==alarmGeneration)return false;
          ok=await playCustomBrainText(text,generation,'JLR '+kind+' custom voice retry');
        }
        return ok;
      }
      if(endpoint){
        const joiner=endpoint.includes('?')?'&':'?';
        return playCustomEndpoint(endpoint+joiner+'nonce='+Date.now(),generation,'JLR '+kind+' custom voice');
      }

      // Compatibility path for future event types without a dedicated GET stream.
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
        if(!response.ok){
          const detail=await response.text().catch(()=>'');
          throw new Error('JLR voice event HTTP '+response.status+(detail?': '+detail.slice(0,180):''));
        }
        return await playAudioResponse(response,generation,'JLR '+kind+' custom voice');
      }catch(error){
        if(generation!==alarmGeneration)return false;
        const message=String(error&&error.message||error||'JLR voice event failed.');
        window.jlrVoiceLastError=message;
        reportVoiceMode('error',message);
        console.error('JLR '+kind+' voice failed.',error);
        return false;
      }
    },'JLR '+kind+' voice',{
      priority:kind==='scout'||kind==='field'?'attention':kind==='why'?'high':kind==='startup'||kind==='briefing'?'info':'normal',
      dedupeKey:kind+':'+String(payload&&payload.system||'global')
    });
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
      if(target.closest('#trackerArm')||target.closest('#trackerTest')||target.closest('#trackerMicToggle')||target.closest('#pasteScan')||target.closest('#scanPasteCheck'))unlockAlarm();
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
  window.jlrStopVoice=stopVoiceAlert;
  window.jlrUnlockFighterAlarm=unlockAlarm;
  window.jlrSpeakEvent=speakEvent;
  window.jlrVoiceIsActive=voiceIsActive;
  window.jlrAutoVoiceAllowed=autoVoiceAllowed;
  window.jlrReleaseAutoVoice=releaseAutoVoice;
  window.jlrWarmVoice=warmVoiceRuntime;
  window.jlrRecoverVoice=recoverVoiceTransport;
  window.jlrVoiceRuntimeStatus=voiceRuntimeStatus;

  setInterval(function(){
    if(!voiceQueueRunning)return;
    if(Date.now()-voiceQueueLastProgressAt<180000)return;
    console.warn('JLR voice queue watchdog resetting a stale voice transport.');
    void recoverVoiceTransport('voice queue watchdog');
  },30000);

  const resumeVoiceRuntime=function(){
    if(document.visibilityState&&document.visibilityState!=='visible')return;
    if(voiceQueueRunning&&Date.now()-voiceQueueLastProgressAt>=120000){
      void recoverVoiceTransport('page resumed after long idle');
    }else{
      void warmVoiceRuntime('page resumed');
    }
  };
  document.addEventListener('visibilitychange',resumeVoiceRuntime);
  window.addEventListener('pageshow',resumeVoiceRuntime);
  window.addEventListener('online',resumeVoiceRuntime);

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
