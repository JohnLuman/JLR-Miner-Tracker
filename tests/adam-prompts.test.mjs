import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { explicitAdamHelpQuestion, adamOverviewQuestion, adamUnknownText } from '../lib/adam-prompts.mjs';
import { brainLiveIntent } from '../lib/brain-intel.mjs';

assert.equal(explicitAdamHelpQuestion('Adam, what can you do?'),true);
assert.equal(explicitAdamHelpQuestion('Help'),true);
assert.equal(explicitAdamHelpQuestion('Help me find the next system'),false,'an operational request must not trigger the capabilities speech');
assert.deepEqual(brainLiveIntent('Help me find the next system'),{kind:'nearest',updatesOnly:true});
assert.equal(adamOverviewQuestion('Explain the Fields board'),true);
assert.equal(adamOverviewQuestion('When will this field respawn?'),false,'a timer question is not a request for a feature overview');
assert.equal(adamOverviewQuestion('How much is this field worth?'),false,'a value question is not a request for a feature overview');
assert.equal(adamUnknownText({currentTab:'fields',selectedSystem:'APM-6K'}),'I can’t verify that for APM-6K from the information JLR currently has.');
assert.doesNotMatch(adamUnknownText({currentTab:'fields',selectedSystem:'APM-6K'}),/what i can do|i can help|ask me/i);

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const begin=server.indexOf('function trackerBrainAnswer(');
const end=server.indexOf('\nasync function a0CandidateForScan(',begin);
assert.ok(begin>0&&end>begin,'Adam fallback is available for integration checks');
const runtime={
  trackerSpeechSafe:value=>String(value||''),
  trackerBrainContext:value=>value||{},
  trackerBrainSnapshot:()=>({issues:[],attentionCount:0}),
  trackerBrainPrimaryName:()=> 'Pilot',
  trackerBrainKnowledgeAnswer:()=>null,
  explicitAdamHelpQuestion,adamOverviewQuestion,adamUnknownText,
  now:()=> '2026-09-25T02:20:00.000Z',
};
vm.runInNewContext(server.slice(begin,end)+'\nthis.answerFromServer=trackerBrainAnswer;',runtime);
const unknown=runtime.answerFromServer({characterIds:[]},'When will the asteroid belt in APM-6K appear?',{
  context:{currentTab:'fields',selectedSystem:'APM-6K'},currentTab:'fields',
});
assert.equal(unknown.topic,'not-verified');
assert.match(unknown.text,/can’t verify that for APM-6K/);
assert.doesNotMatch(unknown.text,/ask me|can help|can answer/i);
assert.equal(runtime.answerFromServer({characterIds:[]},'What can you do?').topic,'capabilities');
console.log('Adam prompt routing tests passed.');
