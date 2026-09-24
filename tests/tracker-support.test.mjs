import assert from 'node:assert/strict';
import {TrackerSessionStore,trackerSupportAnswerContext} from '../services/tracker-support/core.mjs';

let now=1_000_000;
const store=new TrackerSessionStore({nowFn:()=>now,focusTtlMs:30*60*1000,ttlMs:12*60*60*1000});

const answer={
  handled:true,
  topic:'nearest-system',
  text:'Closest tracked system needing a scan update: Y-2ANO. 3 jumps from John Luman in C-N4OD. Its last Probe Scanner copy is out of date.',
  voiceText:'Y-2ANO is closest. 3 jumps.',
  closest:{system:'Y-2ANO',jumps:3},
  location:{system:'C-N4OD'},
};
store.remember('a'.repeat(48),{question:'Tracker, next system',currentTab:'fields',answer});

const distance=store.resolve('a'.repeat(48),{question:'How far is it?',currentTab:'fields'});
assert.equal(distance.contextUsed,true);
assert.equal(distance.answerOverride.focusSystem,'Y-2ANO');
assert.match(distance.answerOverride.text,/3 jumps from C-N4OD/);

const isolated=store.resolve('b'.repeat(48),{question:'How far is it?',currentTab:'fields'});
assert.equal(isolated.answerOverride,null,'different users never share focus context');

const why=store.resolve('a'.repeat(48),{question:'Why that system?',currentTab:'fields'});
assert.equal(why.answerOverride.topic,'support-context-why');
assert.match(why.answerOverride.text,/Probe Scanner copy is out of date/);

const rewritten=store.resolve('a'.repeat(48),{question:'Tell me more about that system',currentTab:'fields'});
assert.equal(rewritten.question,'Tell me more about Y-2ANO');

const context=trackerSupportAnswerContext(answer);
assert.equal(context.focusSystem,'Y-2ANO');
assert.equal(context.jumps,3);
assert.equal(context.originSystem,'C-N4OD');

now+=31*60*1000;
const expiredFocus=store.resolve('a'.repeat(48),{question:'How far is it?',currentTab:'fields'});
assert.equal(expiredFocus.answerOverride,null,'stale conversational focus is not reused');

const firstTurn=new TrackerSessionStore({nowFn:()=>now,focusTtlMs:30*60*1000,ttlMs:12*60*60*1000});
const firstNext=firstTurn.resolve('c'.repeat(48),{
  question:'Next one?',
  currentTab:'fields',
  context:{workflow:'scan-update',selectedSystem:'Y-2ANO',recentActions:[{kind:'scan-updated',at:now,tab:'fields',system:'Y-2ANO'}]},
});
assert.equal(firstNext.question,'closest tracked system needing a scan update','first Adam question can use the supplied scan workflow context');

const firstPerf=firstTurn.resolve('d'.repeat(48),{
  question:'Why is this low?',
  currentTab:'performance',
  context:{workflow:'performance-review',performance:{latestRate:600000,targetRate:900000,activeToons:28,sampledToons:30}},
});
assert.equal(firstPerf.question,'explain recent fleet performance variance','Fleet Performance short follow-up resolves from current tab context');

const selectedSystem=firstTurn.resolve('e'.repeat(48),{
  question:'Explain this system',
  currentTab:'fields',
  context:{selectedSystem:'K8L-X7'},
});
assert.equal(selectedSystem.question,'Explain K8L-X7','selected system resolves this-system references');

const snapshot=store.exportState();
const restored=new TrackerSessionStore({nowFn:()=>now});
restored.importState(snapshot);
assert.equal(restored.size,1);
console.log('Tracker support session tests passed.');
