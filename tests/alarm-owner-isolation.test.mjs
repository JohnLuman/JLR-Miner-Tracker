import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const access=source.slice(source.indexOf('function userHasLinkedCharacterName('),source.indexOf('function ceoLinkedCharacter('));
const send=source.slice(source.indexOf('function sendTrackerEventForUser('),source.indexOf('function freshTrackerLiveLosses('));
const start=source.indexOf("  if(req.method==='POST'&&url.pathname==='/api/tracker/heavy-fighters/test-loss'){");
assert.ok(start>=0);
const guard=source.slice(start,source.indexOf('    try{',start));
const owner={},other={};const writes=[];
const ctx=vm.createContext({state:{characters:{1:{name:'John Leman Raholan'},2:{name:'Renius'}}},JLR_OWNER_CHARACTER_NAME:'John Leman Raholan',
  trackerLiveClients:new Set([owner,other]),trackerLiveClientUsers:new Map([[owner,'cam'],[other,'renius']]),
  sendTrackerEventTo:(res,event,payload)=>{writes.push({res,event,payload});return true;},
  req:{method:'POST'},url:{pathname:'/api/tracker/heavy-fighters/test-loss'},res:{},json:(_res,status,payload)=>({status,payload})});
vm.runInContext(access+send+'\nfunction checkRoute(user){'+guard+'return {status:200};}}',ctx);
assert.equal(ctx.checkRoute({characterIds:['1']}).status,200);
assert.equal(ctx.checkRoute({characterIds:['2']}).status,403);
assert.equal(ctx.checkRoute(null).status,403);
const payload={simulationRunId:'sim_case'};
assert.equal(ctx.sendTrackerEventForUser('cam','loss',payload),1);
assert.equal(writes.length,1);assert.equal(writes[0].res,owner);assert.equal(writes[0].event,'loss');
console.log('Existing owner-route guard and account stream isolation passed (extracted server functions, mocked connections).');
