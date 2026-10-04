'use strict';
(function(root){
  function create({wallNow=()=>Date.now(),tickNow=()=>performance.now()}={}){
    let sample=null;
    function observe(serverNow){
      const ms=Date.parse(String(serverNow||''));
      if(!Number.isFinite(ms))return false;
      sample={serverMs:ms,tick:tickNow()};return true;
    }
    function inspect(receivedAt){
      const receivedMs=Date.parse(String(receivedAt||''));
      const wall=wallNow(),estimated=sample?sample.serverMs+Math.max(0,tickNow()-sample.tick):wall;
      const valid=Number.isFinite(receivedMs),age=valid?estimated-receivedMs:null;
      return {clockSource:sample?'server':'local',rawAgeMs:valid?Math.round(wall-receivedMs):null,
        adjustedAgeMs:valid?Math.round(age):null,clockOffsetMs:Math.round(estimated-wall),
        fresh:valid&&age>=-5000&&age<=60000};
    }
    return {observe,inspect};
  }
  root.jlrTrackerClock={create};
})(typeof window==='undefined'?globalThis:window);
