import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function harness({owner=true,matching=true,stale=false,stream=true}={}){
  let clock=Date.now(),calls=0;
  class Clock extends Date { static now(){return clock+=1000;} }
  const listeners={};
  const context=vm.createContext({console,Date:Clock,Map,Set,Promise,AbortController,
    setTimeout:fn=>{queueMicrotask(fn);return 1;},clearTimeout(){},
    localStorage:{getItem:key=>key==='jlrHeavyFighterAlerts'?'true':null},
    document:{getElementById:()=>null},
    window:{jlrTestAccess:owner,addEventListener:(name,fn)=>{listeners[name]=fn;},jlrUnlockFighterAlarm:async()=>true,
      jlrAlarmRuntimeStatus:()=>({lastTrigger:{simulationRunId:'sim_expected',playing:true},overlayVisible:true,audioContext:'running',alarmActive:true})}});
  vm.runInContext(readFileSync(new URL('../public/alarm-diagnostics.js',import.meta.url),'utf8'),context);
  context.send=async()=>{
    calls++;
    context.flow.loss({simulated:true,simulationRunId:matching?'sim_expected':'sim_other',killmailId:123,
      receivedAt:new Date(clock-(stale?70000:0)).toISOString(),killmailTime:new Date(clock).toISOString(),victim:{allianceId:0}});
    return {runId:'sim_expected',deliveredClients:1,loss:{killmailId:123}};
  };
  let source=readFileSync(new URL('../public/tracker-core.js',import.meta.url),'utf8');
  source=source.replace('  bind();',`  render=()=>{};toast=()=>{};setBadge=()=>{};notifyLosses=()=>{};
    waitForTrackerStream=async()=>${stream};api=()=>send();
    globalThis.flow={run:simulateLoss,loss:handleLiveLoss,report:()=>trackerDiagnostic};`);
  vm.runInContext(source,context);
  return {context,calls:()=>calls};
}
let h=harness();await h.context.flow.run();
let report=h.context.flow.report();
assert.equal(report.stages.browserReceipt,'ok','SSE arriving before HTTP response is correlated');
assert.equal(report.stages.freshness,'ok');assert.equal(report.stages.overlay,'ok');
assert.equal(h.context.window.jlrAlarmDiagnostics.result(report),'INCOMPLETE','heard sound and silence require observations');
h=harness({matching:false});await h.context.flow.run();assert.equal(h.context.flow.report().stages.browserReceipt,'fail','other run cannot satisfy receipt');
h=harness({stale:true});await h.context.flow.run();assert.equal(h.context.flow.report().stages.freshness,'fail');
h=harness({stream:false});await h.context.flow.run();assert.equal(h.calls(),0,'no POST after stream timeout');assert.equal(h.context.flow.report().stages.stream,'fail');
h=harness({owner:false});await h.context.flow.run();assert.equal(h.calls(),0);assert.equal(h.context.flow.report(),null,'non-owner cannot start client diagnostic');
console.log('Diagnostic run correlation, stale event, stream timeout and client owner gate passed (mocked browser/HTTP).');
