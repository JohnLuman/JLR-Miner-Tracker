import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const source=fs.readFileSync(new URL('../public/tracker.js',import.meta.url),'utf8');
const serverSource=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');

assert.match(serverSource,/C-N4OD -> "see, en four oh dee"/,'system codes use a pause instead of speaking the hyphen');
assert.doesNotMatch(serverSource,/ch==='-'\?'tack'/,'system pronunciation must not say tack for hyphens');
assert.match(serverSource,/'0':'oh'/,'zero in EVE system codes is spoken as oh');

function voiceHarness(fail=false,sharedStorage=new Map()){
  const events=[];
  const listeners=new Map();
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
  const window={dispatchEvent(){},addEventListener(name,listener){listeners.set(name,listener)}};
  const localStorage={
    getItem(key){return sharedStorage.get(key)??null},
    setItem(key,value){sharedStorage.set(key,String(value))},
    removeItem(key){sharedStorage.delete(key)},
  };
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
    window,document,localStorage,fetch,Audio,Blob,URL,Headers,AbortController,performance,
    MutationObserver:class{observe(){}},CustomEvent:class{},Element:class{},
    setTimeout,clearTimeout,setInterval(){},console:{...console,error(){}},queueMicrotask,
  });
  return{window,events,listeners,get requests(){return requests}};
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

const sharedStorage=new Map();
const firstTab=voiceHarness(false,sharedStorage);
const secondTab=voiceHarness(false,sharedStorage);
firstTab.window.jlrVoiceAccountId='pilot-1';
secondTab.window.jlrVoiceAccountId='pilot-1';
assert.equal(await firstTab.window.jlrSpeakEvent('brain',{text:'Scan update due.',automatic:true}),true);
assert.equal(await secondTab.window.jlrSpeakEvent('brain',{text:'Scan update due.',automatic:true}),false);
assert.equal(secondTab.requests,0,'another tab does not announce the same automatic update');
assert.equal(await secondTab.window.jlrSpeakEvent('brain',{text:'Answer my direct question.'}),true,'manual questions still speak in either tab');
firstTab.listeners.get('pagehide')();
assert.equal(await secondTab.window.jlrSpeakEvent('brain',{text:'Scan update due.',automatic:true}),true,'the second tab takes over when the first closes');
console.log('Brain voice queue tests passed.');
