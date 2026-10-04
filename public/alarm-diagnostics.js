'use strict';
(function(root){
  const stages=['ownerRequest','stream','serverSend','browserReceipt','freshness','overlay','audio','heardSound','silence'];
  function create(){return {schema:1,startedAt:new Date().toISOString(),runId:'',stages:Object.fromEntries(stages.map(k=>[k,'pending']))};}
  function result(report){
    const values=stages.map(k=>report.stages[k]);
    return values.includes('fail')?'FAIL':values.every(v=>v==='ok')?'PASS':'INCOMPLETE';
  }
  function snapshot(report){
    return {schema:1,startedAt:report.startedAt,runId:/^sim_[a-zA-Z0-9_-]{1,64}$/.test(report.runId)?report.runId:'',
      stages:Object.fromEntries(stages.map(k=>[k,['pending','ok','fail','unknown'].includes(report.stages[k])?report.stages[k]:'unknown'])),
      result:result(report)};
  }
  root.jlrAlarmDiagnostics={create,result,snapshot};
})(typeof window==='undefined'?globalThis:window);
