import assert from 'node:assert/strict';
import {TrackerSessionStore,trackerSupportAnswerContext,appraisalCompressionCandidateName,appraisalIntelTargets,summarizeAppraisalMarketHistory} from '../services/tracker-support/core.mjs';

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

const doctrineKey='f'.repeat(48);
firstTurn.remember(doctrineKey,{
  question:'Which doctrine item has the best ROI?',currentTab:'doctrine',
  answer:{topic:'doctrine-roi',text:'High ROI Module has the best estimated ROI.',focusItem:'High ROI Module'},
});
const itemFollowup=firstTurn.resolve(doctrineKey,{question:'How many should I buy?',currentTab:'doctrine'});
assert.match(itemFollowup.question,/High ROI Module/,'doctrine follow-up retains the item');
const whyItem=firstTurn.resolve(doctrineKey,{question:'Why that item?',currentTab:'doctrine'});
assert.equal(whyItem.answerOverride,null,'prior system answer must not override a doctrine item question');
assert.match(whyItem.question,/High ROI Module/);
assert.equal(trackerSupportAnswerContext({topic:'doctrine-item',focusItem:'High ROI Module'}).focusItem,'High ROI Module');

const appraisalKey='9'.repeat(48);
firstTurn.remember(appraisalKey,{
  question:'What is Arkonor?',currentTab:'forge',
  answer:{topic:'appraisal-static-item',text:'Arkonor static info.',focusItem:'Arkonor'},
});
const refineFollowup=firstTurn.resolve(appraisalKey,{question:'What does it refine into?',currentTab:'forge'});
assert.match(refineFollowup.question,/Arkonor/,'Appraisal follow-up carries the prior item into refine questions');
const compressionFollowup=firstTurn.resolve(appraisalKey,{question:'Is it worth more compressed?',currentTab:'forge'});
assert.match(compressionFollowup.question,/Arkonor/,'Appraisal follow-up carries the prior item into compression/value questions');
const typeFollowup=firstTurn.resolve(appraisalKey,{question:'What is its type id?',currentTab:'forge'});
assert.match(typeFollowup.question,/Arkonor/,'Appraisal follow-up carries the prior item into static-data questions');
const typoFollowup=firstTurn.resolve(appraisalKey,{question:'is it beter compresed?',currentTab:'fields'});
assert.match(typoFollowup.question,/Arkonor/,'misspelled Appraisal follow-up retains the prior item even off the Appraisal tab');

const snapshot=store.exportState();
const restored=new TrackerSessionStore({nowFn:()=>now});
restored.importState(snapshot);
assert.equal(restored.size,1);
const rawCandidate=appraisalCompressionCandidateName('Arkonor II-Grade');
assert.deepEqual(rawCandidate,{sourceName:'Arkonor II-Grade',targetName:'Compressed Arkonor II-Grade',direction:'compress'});
const compressedCandidate=appraisalCompressionCandidateName('Compressed Arkonor II-Grade');
assert.deepEqual(compressedCandidate,{sourceName:'Compressed Arkonor II-Grade',targetName:'Arkonor II-Grade',direction:'decompress'});

const intelTargets=appraisalIntelTargets([
  {resolved:true,typeId:1,name:'Low',amount:1,splitTotal:10},
  {resolved:true,typeId:2,name:'High',amount:1,splitTotal:100},
  {resolved:false,typeId:3,name:'Nope',amount:1,splitTotal:1000},
],{pricing:'split',limit:1});
assert.equal(intelTargets.length,1);
assert.equal(intelTargets[0].name,'High');

const history=summarizeAppraisalMarketHistory([
  {date:'2026-09-01',average:100,highest:110,lowest:90,volume:10,order_count:2},
  {date:'2026-09-02',average:110,highest:120,lowest:100,volume:20,order_count:3},
  {date:'2026-09-03',average:120,highest:130,lowest:110,volume:30,order_count:4},
  {date:'2026-09-04',average:130,highest:140,lowest:120,volume:40,order_count:5},
  {date:'2026-09-05',average:140,highest:150,lowest:130,volume:50,order_count:6},
  {date:'2026-09-06',average:150,highest:160,lowest:140,volume:60,order_count:7},
  {date:'2026-09-07',average:160,highest:170,lowest:150,volume:70,order_count:8},
]);
assert.equal(history.days,7);
assert.equal(history.latestAverage,160);
assert.equal(history.volume7,280);
assert.ok(history.avg7>100&&history.avg7<160);
console.log('Compression candidate helpers and market-history summary passed.');

console.log('Tracker support session tests passed.');
