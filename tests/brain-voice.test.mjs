import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const source=fs.readFileSync(new URL('../public/tracker.js',import.meta.url),'utf8');

function voiceHarness(fail=false){
  const events=[];
  let requests=0;
  class Audio{
    constructor(){this.listeners=new Map();this.stopped=false}
    addEventListener(name,listener){this.listeners.set(name,listener)}
    emit(name){this.listeners.get(name)?.()}
    play(){
      events.push('play');
      queueMicrotask(()=>{
        if(this.stopped)return;
        this.emit('playing');
        setTimeout(()=>{if(!this.stopped){events.push('ended');this.emit('ended')}},30);
      });
      return Promise.resolve();
    }
    pause(){this.stopped=true}
    removeAttribute(){}
    load(){}
  }
  const window={dispatchEvent(){}};
  const document={
    addEventListener(){},getElementById(){return null},
    documentElement:{},head:{appendChild(){}},
    createElement(){return{dataset:{}}},
  };
  const fetch=async(url,options)=>{
    assert.equal(url,'/api/voice/event');
    assert.equal(options.credentials,'same-origin');
    requests++;
    events.push('fetch-'+requests);
    if(fail)return{
      ok:false,status:503,
      headers:new Headers({'content-type':'application/json'}),
      json:async()=>({message:'Worker unavailable'}),
    };
    return{
      ok:true,headers:new Headers({'content-type':'audio/wav','x-jlr-voice-profile':'core'}),
      arrayBuffer:async()=>new ArrayBuffer(128),
    };
  };
  vm.runInNewContext(source,{
    window,document,fetch,Audio,Blob,URL,Headers,AbortController,performance,
    MutationObserver:class{observe(){}},CustomEvent:class{},Element:class{},
    setTimeout,clearTimeout,console:{...console,error(){}},queueMicrotask,
  });
  return{window,events,get requests(){return requests}};
}

const happy=voiceHarness();
const spoken=await happy.window.jlrSpeakEvent('brain',{text:'First sentence '+('ready '.repeat(14))+'. Second sentence '+('ready '.repeat(14))+'.'});
assert.equal(spoken,true);
assert.equal(happy.requests,2);
assert.ok(happy.events.indexOf('fetch-2')<happy.events.indexOf('ended'),'next chunk is requested while the first plays');
assert.equal(happy.window.jlrVoiceProfile,'core');
assert.equal(happy.window.jlrVoiceTransport,'verified-buffered');

const version=voiceHarness();
assert.equal(await version.window.jlrSpeakEvent('brain',{text:'Tracker is running version 2.9.113.'}),true);
assert.equal(version.requests,1,'a version number is one spoken sentence');

const broken=voiceHarness(true);
assert.equal(await broken.window.jlrSpeakEvent('brain',{text:'Test failure.'}),false);
assert.match(broken.window.jlrVoiceLastError,/Worker unavailable/);
assert.equal(broken.events.includes('play'),false);
console.log('Brain voice queue tests passed.');
