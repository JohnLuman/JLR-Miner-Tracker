import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

let sceneRefreshes=0;
const context=vm.createContext({
  window:{
    JlrFieldPlayerLoss:{recent:()=>false},
    JlrMiningScene:{refresh(){sceneRefreshes++;}}
  },
  document:{createElement:()=>({className:'',title:'',setAttribute(){},innerHTML:''})},
  performance:{now:()=>0}
});
vm.runInContext(readFileSync(new URL('../public/field-mining-activity.js',import.meta.url),'utf8'),context);
const paint=context.window.JlrFieldMiningActivity.paint;
const at='2026-10-18T05:30:00Z';
const earlier='2026-10-18T05:27:00Z';
const card={
  dataset:{system:'PNQY-Y',boardKey:'t3:PNQY-Y',status:'picked'},
  icons:[],
  querySelector(selector){return selector==='.mining-activity-icon'?this.icons[0]||null:null;},
  append(icon){icon.remove=()=>{const idx=this.icons.indexOf(icon);if(idx>=0)this.icons.splice(idx,1);};this.icons.push(icon);}
};
const board={querySelectorAll:()=>[card]};
const state={
  serverNow:at,fieldAccess:{allowed:true},playerLosses:{},
  fields:{'PNQY-Y':{status:'picked',updatedAt:earlier}},
  miningActivity:{'t3:PNQY-Y':earlier}
};
paint(board,state);
assert.equal(card.icons.length,1,'picked T3 with recent ESI activity displays mining');

state.fields['PNQY-Y']={status:'cleared',updatedAt:at,timerEndsAt:'2026-10-18T15:30:00Z'};
paint(board,state);
assert.equal(card.icons.length,0,'RED field removes the icon immediately even on a stale hovered card');
assert.equal(card.dataset.status,'picked','test intentionally retains stale DOM metadata');

state.fields['PNQY-Y']={status:'ready',updatedAt:at};
paint(board,state);
assert.equal(card.icons.length,0,'new cycle ignores old activity');

state.miningActivity['t3:PNQY-Y']='2026-10-18T05:31:00Z';
state.serverNow='2026-10-18T05:31:01Z';
paint(board,state);
assert.equal(card.icons.length,1,'new cycle can display fresh mining again');
assert.ok(sceneRefreshes>=4);
console.log('Cleared T3 immediately hides stale mining scene; reset cycle ignores older ledger and allows new activity.');
