import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/tracker.js',import.meta.url),'utf8');
const resume=source.slice(source.indexOf('  async function resumeAlarmContext('),source.indexOf('  function ensureAlarmOverlay('));
const play=source.slice(source.indexOf('  async function playFighterAlarm('),source.indexOf('  function alarmRuntimeStatus('));
function harness({running=false}={}){
  let finish;const timers=[];
  const audio={state:running?'running':'suspended',resume:()=>new Promise(resolve=>{finish=resolve;})};
  const ctx=vm.createContext({Date,Promise,audio,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}});
  vm.runInContext(`let alarmGeneration=0,alarmLastTrigger=null,shown=0,played=0;
    function ensureAlarmContext(){return audio;}
    function stopAlarmNodes(){alarmGeneration++;}
    function showAlarmOverlay(){shown++;}
    function releaseAlarmLease(){}
    function claimAlarmLease(){return true;}
    function playAlarmCycle(){played++;}
    ${resume}\n${play}
    globalThis.check=()=>({shown,played,alarmLastTrigger});`,ctx);
  return {ctx,expire:()=>timers.forEach(fn=>fn()),resolve:()=>{audio.state='running';finish();}};
}
let h=harness();let pending=h.ctx.playFighterAlarm({simulationRunId:'sim_test'});
assert.equal(h.ctx.check().shown,1,'visual alert appears before suspended audio settles');
h.expire();assert.equal(await pending,false,'pending resume times out instead of hanging');
assert.equal(h.ctx.check().played,0);
h=harness();pending=h.ctx.unlockAlarm();h.expire();assert.equal(await pending,false,'unlock also has a bounded wait');
h=harness();pending=h.ctx.playFighterAlarm({});h.ctx.stopAlarmNodes();h.resolve();
assert.equal(await pending,false);assert.equal(h.ctx.check().played,0,'STOP prevents a late resume from restarting audio');
h=harness({running:true});assert.equal(await h.ctx.playFighterAlarm({}),true);assert.equal(h.ctx.check().played,1,'ready audio still plays');
console.log('Pending audio timeout, immediate visual alarm, STOP race and ready playback passed.');
