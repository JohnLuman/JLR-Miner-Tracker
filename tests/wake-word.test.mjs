import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.match(app,/const ADAM_VOICE_ENABLED=false/,'Adam voice is hard-disabled in the live client');
assert.match(app,/if\(!ADAM_VOICE_ENABLED\)return null/,'microphone acquisition is gated off');
assert.doesNotMatch(app,/setTimeout\(\(\)=>startBrainListening\(\),1200\)/,'boot no longer starts microphone recognition');
assert.doesNotMatch(app,/await refreshBrainMicrophones\(\);\s*startBrainLongUptimeWatchdog\(\)/,'boot no longer enumerates microphones or starts the mic watchdog');
assert.match(index,/data-tab="brain" type="button">ADAM<\/button>/,'context assistant is presented as Adam');
assert.doesNotMatch(index,/data-tab="brain" type="button">SCOUT<\/button>/,'Scout is a subsystem instead of the main tab identity');
assert.match(app,/JLR ADAM \/\/ CONTEXT ASSISTANT/,'Adam context workspace is restored');
assert.match(app,/id="adamQuestion"/,'Adam exposes typed contextual questions');
assert.match(app,/id="adamAsk"/,'Adam has an explicit ask action');
assert.match(app,/function adamContextSnapshot\(\)/,'Adam builds current JLR context for each question');
assert.match(app,/SCOUT \/ TRAVEL WATCH/,'Scout travel logic remains inside Adam');
assert.match(app,/id="scoutCharacterSelect"/,'Scout includes a travel-toon selector');
assert.match(app,/CLOSEST FIELD UPDATES/,'Scout ranks nearby Field Tracker update targets');
assert.match(index,/id="scoutGlobalAlert"/,'Scout has a persistent app-wide update alert');
assert.match(app,/ADAM • UPDATE/,'Adam tab highlights when Scout needs a scan update');

assert.equal(pkg.version,'2.9.144','Adam context release remains on the current app version');
assert.ok(index.includes('/app.js?v=2.9.144'),'browser cachebuster loads the Adam build');

console.log('Adam context / retired-microphone regression tests passed.');
