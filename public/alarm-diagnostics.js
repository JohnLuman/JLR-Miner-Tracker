'use strict';
(function(root){
  const stages=['ownerRequest','stream','serverSend','browserReceipt','freshness','victimFilter','overlay','audio','heardSound','silence'];
  function create(){return {schema:2,startedAt:new Date().toISOString(),runId:'',stages:Object.fromEntries(stages.map(k=>[k,'pending']))};}
  function result(report){
    const values=stages.map(k=>report.stages[k]);
    return values.includes('fail')?'FAIL':values.every(v=>v==='ok')?'PASS':'INCOMPLETE';
  }
  function snapshot(report){
    return {schema:2,startedAt:report.startedAt,runId:/^sim_[a-zA-Z0-9_-]{1,64}$/.test(report.runId)?report.runId:'',
      timing:report.timing?{clockSource:report.timing.clockSource==='server'?'server':'local',...Object.fromEntries(['rawAgeMs','adjustedAgeMs','clockOffsetMs'].map(key=>[key,Number.isFinite(report.timing[key])?Math.max(-86400000,Math.min(86400000,Math.round(report.timing[key]))):null]))}:null,
      stages:Object.fromEntries(stages.map(k=>[k,['pending','ok','fail','unknown'].includes(report.stages[k])?report.stages[k]:'unknown'])),
      result:result(report)};
  }
  root.jlrAlarmDiagnostics={create,result,snapshot};
})(typeof window==='undefined'?globalThis:window);
