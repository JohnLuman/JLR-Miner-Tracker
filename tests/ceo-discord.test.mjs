import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createDiscordActivity,discordId } from '../lib/ceo-discord.mjs';
import { createDiscordGateway,DISCORD_ACTIVITY_INTENTS } from '../lib/ceo-discord-gateway.mjs';
const guildId='111111111111111111',userId='222222222222222222',messageId='333333333333333333';
let at=Date.parse('2026-09-30T23:59:30Z');
const store={guildId,days:{'2020-01-01':{}},links:{}};
const activity=createDiscordActivity(store,{clock:()=>at});
activity.seed({id:guildId,name:'Test guild',afk_channel_id:'afk',members:[{user:{id:userId,username:'Member'}}],voice_states:[{user_id:userId,channel_id:'voice'}]});
activity.message({guild_id:guildId,id:messageId,author:{id:userId,username:'Member'},content:'SENSITIVE CONTENT',attachments:[{url:'secret'}]});
activity.message({guild_id:guildId,id:messageId,author:{id:userId}});
activity.message({guild_id:'999999999999999999',id:'555555555555555555',author:{id:userId}});
activity.message({guild_id:guildId,id:'555555555555555555',author:{id:userId,bot:true}});
at+=60000;activity.flush();
assert.equal(store.days['2026-09-30'][userId].voiceSeconds,30);assert.equal(store.days['2026-10-01'][userId].voiceSeconds,30);
assert.equal(activity.snapshot().totals.messages,1);assert.equal(store.days['2020-01-01'],undefined);
activity.pause();at+=600000;activity.resume();at+=60000;
assert.equal(activity.snapshot().totals.voiceSeconds,120,'Disconnected gap contributes no voice time');
activity.voice({guild_id:guildId,user_id:userId,channel_id:'afk'});at+=60000;assert.equal(activity.snapshot().totals.voiceSeconds,120);
activity.voice({guild_id:guildId,user_id:userId,channel_id:'voice',self_mute:true});at+=30000;
assert.equal(activity.snapshot().totals.voiceSeconds,150,'Voice presence includes muted time, without claiming speech');
store.links[userId]={characterId:42,characterName:'EVE Member'};
assert.equal(activity.snapshot({query:'EVE Member'}).records[0].characterId,42);
assert.equal(activity.snapshot().records[0].lastActiveAt,new Date(at).toISOString());
assert.doesNotMatch(JSON.stringify(store),/SENSITIVE CONTENT|attachments|secret|"content"/);
assert.equal(activity.consumeDirty(),true);assert.equal(activity.consumeDirty(),false);

const tasks=new Map();let nextTimer=0;
const timers={setTimeout:(fn,ms)=>{const id=++nextTimer;tasks.set(id,{fn,ms});return id;},clearTimeout:id=>tasks.delete(id)};
const sockets=[];
class Socket{
  constructor(url){this.url=url;this.readyState=1;this.listeners={};this.sent=[];sockets.push(this);}
  addEventListener(type,fn){this.listeners[type]=fn;}
  send(payload){this.sent.push(JSON.parse(payload));}
  emit(payload){this.listeners.message({data:JSON.stringify(payload)});}
  close(code){this.readyState=3;this.listeners.close?.({code});}
}
const events=[],statuses=[];
const gateway=createDiscordGateway({token:'fake-token',guildId,Socket,timers,random:()=>.5,fetchImpl:async()=>({ok:true,status:200,json:async()=>({url:'wss://gateway.discord.gg',session_start_limit:{remaining:10}})}),onDispatch:(type,data)=>events.push(type),onStatus:status=>statuses.push(status)});
gateway.start();await new Promise(resolve=>setImmediate(resolve));
let socket=sockets[0];socket.emit({op:10,d:{heartbeat_interval:45000}});
assert.equal(socket.sent[0].op,2);assert.equal(socket.sent[0].d.intents,641);assert.equal(DISCORD_ACTIVITY_INTENTS&32768,0,'Message Content intent is excluded');
socket.emit({op:0,s:1,t:'READY',d:{session_id:'session',resume_gateway_url:'wss://gateway-us.discord.gg'}});
socket.emit({op:0,s:2,t:'MESSAGE_CREATE',d:{guild_id:guildId}});socket.emit({op:0,s:2,t:'MESSAGE_CREATE',d:{guild_id:guildId}});
assert.equal(events.filter(type=>type==='MESSAGE_CREATE').length,1,'Resumed sequence is deduplicated');
socket.emit({op:0,s:3,t:'MESSAGE_CREATE',d:{guild_id:'999999999999999999'}});
assert.equal(events.filter(type=>type==='MESSAGE_CREATE').length,1,'Other guilds are not collected');
socket.close(4000);
const retry=[...tasks].find(([id,value])=>value.ms>=5000);tasks.delete(retry[0]);retry[1].fn();await new Promise(resolve=>setImmediate(resolve));
socket=sockets[1];socket.emit({op:10,d:{heartbeat_interval:45000}});
assert.match(socket.url,/gateway-us/);assert.equal(socket.sent[0].op,6);assert.equal(socket.sent[0].d.seq,3);
socket.emit({op:0,s:4,t:'RESUMED',d:{}});assert.equal(statuses.at(-1).connected,true);
const heart=[...tasks].find(([id,value])=>value.ms===22500);tasks.delete(heart[0]);heart[1].fn();assert.equal(socket.sent.at(-1).op,1);
socket.emit({op:11});
socket.close(4004);assert.equal(statuses.at(-1).status,'token-invalid');assert.equal(tasks.size,0,'Invalid token does not loop reconnects');
gateway.stop();

const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
function route(path,method='GET'){const start=source.indexOf("  if(req.method==='"+method+"'&&url.pathname==='"+path+"'){");assert.ok(start>0);return source.slice(start,source.indexOf('\n  if(',start+5));}
for(const allowed of [false,true]){
  let calls=0,payload;
  const context={req:{method:'GET'},res:{},url:new URL('https://example.test/api/ceo/discord'),requireCeoViewer:()=>allowed,ceoDiscordSnapshot:()=>{calls++;return {totals:{}};},json:(res,status,data)=>payload={status,data}};
  vm.createContext(context);await vm.runInContext('(async()=>{'+route('/api/ceo/discord')+'})()',context);assert.equal(calls,allowed?1:0);
}
const snapshotStart=source.indexOf('function ceoDiscordSnapshot('),snapshotEnd=source.indexOf('function sameOrigin(',snapshotStart);
const snapshotContext={state:{ceoAdmin:{discord:{tokenEnc:'SECRET',guildId,botId:'444444444444444444',guilds:{}}}},discordActivity:null,discordLive:{status:'not-configured'},createDiscordActivity};
vm.createContext(snapshotContext);vm.runInContext(source.slice(snapshotStart,snapshotEnd),snapshotContext);
assert.doesNotMatch(JSON.stringify(snapshotContext.ceoDiscordSnapshot()),/SECRET|tokenEnc/);

const existing={enabled:true,tokenEnc:'OLD_SECRET',guildId,guilds:{}};let writes=0,starts=0,payload;
const configContext={req:{method:'POST'},res:{},url:new URL('https://example.test/api/ceo/discord/config'),requireCeoViewer:()=>true,sameOrigin:()=>true,discordConfigBusy:false,state:{ceoAdmin:{discord:existing}},readBody:async()=>({guildId,token:'fake-new-token-valid-length'}),discordId:()=>true,fetch:async()=>({ok:false,status:401}),AbortSignal,json:(res,status,data)=>payload={status,data},save:async()=>writes++,startCeoDiscord:()=>starts++,ceoDiscordSnapshot:()=>({configured:true}),discordGateway:null,discordActivity:null};
vm.createContext(configContext);await vm.runInContext('(async()=>{'+route('/api/ceo/discord/config','POST')+'})()',configContext);
assert.equal(payload.status,400);assert.equal(existing.tokenEnc,'OLD_SECRET');assert.equal(writes,0);assert.equal(starts,0);
configContext.readBody=async()=>({enabled:false});await vm.runInContext('(async()=>{'+route('/api/ceo/discord/config','POST')+'})()',configContext);
assert.equal(existing.enabled,false);assert.equal(existing.tokenEnc,'OLD_SECRET');assert.equal(writes,1);
console.log('Discord counters, privacy, UTC days, gaps, exact guild isolation, Gateway resume/heartbeat and protected setup tests passed.');

// Configuration validation is read-only until both token and guild access pass.
const previousGuild='777777777777777777';existing.guilds[previousGuild]={guildId:previousGuild,days:{saved:{}}};
configContext.readBody=async()=>({guildId,token:'fake-new-token-valid-length'});
configContext.fetch=async url=>({ok:true,status:200,json:async()=>url.endsWith('/users/@me')?{id:'444444444444444444',bot:true}:{id:guildId,name:'Test guild'}});
configContext.encrypt=()=> 'SEALED_TOKEN';await vm.runInContext('(async()=>{'+route('/api/ceo/discord/config','POST')+'})()',configContext);
assert.equal(configContext.state.ceoAdmin.discord.tokenEnc,'SEALED_TOKEN');assert.ok(configContext.state.ceoAdmin.discord.guilds[previousGuild].days.saved);
assert.equal(configContext.discordConfigBusy,false);
const linkState={ceoAdmin:{discord:{guildId,guilds:{[guildId]:{days:{today:{[userId]:{}}},links:{}}}}}};
const linkContext={req:{method:'POST'},res:{},url:new URL('https://example.test/api/ceo/discord/link'),requireCeoViewer:()=>true,sameOrigin:()=>true,state:linkState,readBody:async()=>({userId,characterId:42}),discordId,ceoFinanceCache:{data:{members:{roster:[{characterId:42,name:'Verified EVE member'}]}}},now:()=>new Date(at).toISOString(),save:async()=>{},json:(res,status,data)=>payload={status,data}};
vm.createContext(linkContext);await vm.runInContext('(async()=>{'+route('/api/ceo/discord/link','POST')+'})()',linkContext);
assert.equal(linkState.ceoAdmin.discord.guilds[guildId].links[userId].characterName,'Verified EVE member');
linkContext.readBody=async()=>({userId,characterId:999});await vm.runInContext('(async()=>{'+route('/api/ceo/discord/link','POST')+'})()',linkContext);assert.equal(payload.status,409);
assert.equal(linkState.ceoAdmin.discord.guilds[guildId].links[userId].characterId,42,'Rejected match preserves the prior manual link');

const elements=new Map(),listeners=new Map();
const get=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',href:'',textContent:'',hidden:false,classList:{toggle(name,value){get(id).hidden=value;},remove(){get(id).hidden=false;}}});return elements.get(id);};
const uiData={configured:false,enabled:false,guildId:null,inviteUrl:null,connection:{connected:false,status:'not-configured'},totals:{users:101,messages:101,voiceSeconds:3600},voicePresent:0,days:30,periodStart:'2026-09-01',periodEnd:'2026-09-30',note:'Presence, not speech.',records:Array.from({length:101},(_,i)=>({userId:String(Number(userId)+i),name:i===0?'<User>':'User '+i,messages:1,voiceSeconds:0,lastActiveAt:null}))};
let body;
const browser={window:{},URLSearchParams,setTimeout,clearTimeout,setInterval:()=>0,document:{getElementById:get,querySelector:()=>null,addEventListener:(type,callback)=>listeners.set(type,callback)},fetch:async(url,options)=>{if(options?.body)body=JSON.parse(options.body);return {ok:true,json:async()=>uiData};}};
vm.createContext(browser);vm.runInContext(fs.readFileSync(new URL('../public/ceo-discord.js',import.meta.url),'utf8'),browser);
await browser.window.JlrCeoDiscord.load();assert.equal((get('ceoDiscordRecords').innerHTML.match(/<details/g)||[]).length,50);
assert.match(get('ceoDiscordRecords').innerHTML,/&lt;User&gt;/);
listeners.get('click')({target:{closest:selector=>selector==='#ceoDiscordNext'?{}:null}});assert.match(get('ceoDiscordCount').textContent,/page 2/);
get('ceoDiscordGuild').value=guildId;get('ceoDiscordToken').value='FAKE_PRIVATE_TOKEN';
browser.fetch=async(url,options)=>{body=JSON.parse(options.body);return {ok:false,status:409,json:async()=>({message:'Install the bot',inviteUrl:'https://discord.com/oauth2/authorize?client_id=444444444444444444'})};};
await browser.window.JlrCeoDiscord.configure(true);
assert.equal(body.token,'FAKE_PRIVATE_TOKEN');assert.equal(get('ceoDiscordToken').value,'');assert.equal(get('ceoDiscordInvite').hidden,false);
assert.doesNotMatch(get('ceoDiscordRecords').innerHTML,/FAKE_PRIVATE_TOKEN/);assert.match(get('ceoDiscordWarning').textContent,/Install/);
console.log('Discord setup preservation, manual identity links, browser pagination and token cleanup passed.');
