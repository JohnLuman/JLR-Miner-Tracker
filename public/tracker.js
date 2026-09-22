'use strict';
(function(){
  const ALARM_VERSION='2.9.39';
  const CORE_URL='/tracker-core.js?v=2.9.39';
  const ALERT_TEXT='Attention. A Heavy Fighter loss has been detected. Please check the JLR Tracker for the system, pilot, corporation, and loss details. JLR Tracker is standing by.';

  let activeUtterance=null;

  function availableVoices(){
    if(!('speechSynthesis' in window))return [];
    return window.speechSynthesis.getVoices()||[];
  }

  function voiceScore(voice){
    const name=String(voice&&voice.name||'').toLowerCase();
    const lang=String(voice&&voice.lang||'').toLowerCase();
    let score=0;
    if(lang.startsWith('en-us'))score+=30;
    else if(lang.startsWith('en-gb'))score+=24;
    else if(lang.startsWith('en'))score+=18;
    if(/natural|neural|online/.test(name))score+=30;
    if(/guy|ryan|mark|david|daniel|george|male/.test(name))score+=22;
    if(/microsoft|google|apple/.test(name))score+=8;
    if(/zira|samantha|victoria|female/.test(name))score-=6;
    return score;
  }

  function preferredVoice(){
    return availableVoices().slice().sort(function(a,b){return voiceScore(b)-voiceScore(a);})[0]||null;
  }

  async function unlockAlarm(){
    if(!('speechSynthesis' in window))return false;
    availableVoices();
    return true;
  }

  async function playVoiceAlert(){
    if(!('speechSynthesis' in window))return false;
    try{
      window.speechSynthesis.cancel();
      const utterance=new SpeechSynthesisUtterance(ALERT_TEXT);
      const voice=preferredVoice();
      if(voice)utterance.voice=voice;
      utterance.lang=voice&&voice.lang?voice.lang:'en-US';
      utterance.rate=.86;
      utterance.pitch=.76;
      utterance.volume=1;
      utterance.onend=function(){if(activeUtterance===utterance)activeUtterance=null;};
      utterance.onerror=function(){if(activeUtterance===utterance)activeUtterance=null;};
      activeUtterance=utterance;
      window.speechSynthesis.speak(utterance);
      return true;
    }catch(error){
      console.warn('Heavy Fighter voice alert playback failed.',error);
      activeUtterance=null;
      return false;
    }
  }

  function stopVoiceAlert(){
    if(!('speechSynthesis' in window))return false;
    const wasSpeaking=Boolean(activeUtterance||window.speechSynthesis.speaking||window.speechSynthesis.pending);
    window.speechSynthesis.cancel();
    activeUtterance=null;
    return wasSpeaking;
  }

  function watchTrackerUi(){
    document.addEventListener('click',function(event){
      const target=event.target instanceof Element?event.target:null;
      if(!target)return;
      if(target.closest('#trackerArm')||target.closest('#trackerTest'))unlockAlarm();
    },true);

    const relabel=function(){
      const button=document.getElementById('trackerTest');
      if(button&&button.textContent!=='▶ TEST NATURAL VOICE ALERT'){
        button.textContent='▶ TEST NATURAL VOICE ALERT';
        button.title='Play the calm natural-voice Heavy Fighter alert';
      }
    };
    const observer=new MutationObserver(relabel);
    observer.observe(document.documentElement,{subtree:true,childList:true});
    relabel();
  }

  window.jlrPlayFighterAlarm=playVoiceAlert;
  window.jlrStopFighterAlarm=stopVoiceAlert;
  window.jlrUnlockFighterAlarm=unlockAlarm;

  if('speechSynthesis' in window){
    window.speechSynthesis.onvoiceschanged=function(){availableVoices();};
    availableVoices();
  }

  watchTrackerUi();

  const core=document.createElement('script');
  core.src=CORE_URL;
  core.async=false;
  core.dataset.jlrTrackerCore='1';
  core.onerror=function(){console.error('JLR Tracker core failed to load.');};
  document.head.appendChild(core);
})();
