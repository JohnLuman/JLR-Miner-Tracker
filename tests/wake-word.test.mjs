import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.match(app,/const ADAM_VOICE_ENABLED=false/,'Adam voice is hard-disabled in the live client');
assert.match(app,/if\(!ADAM_VOICE_ENABLED\)return null/,'microphone acquisition is gated off');
assert.doesNotMatch(app,/setTimeout\(\(\)=>startBrainListening\(\),1200\)/,'boot no longer starts microphone recognition');
assert.doesNotMatch(app,/await refreshBrainMicrophones\(\);\s*startBrainLongUptimeWatchdog\(\)/,'boot no longer enumerates microphones or starts the mic watchdog');
assert.match(index,/data-tab="brain" type="button">SCOUT<\/button>/,'live assistant tab is now Scout');
assert.doesNotMatch(index,/data-tab="brain" type="button">ADAM<\/button>/,'Adam tab is removed from live navigation');
assert.match(app,/JLR SCOUT \/\/ TRAVEL UPDATE WATCH/,'Scout replaces the live Adam control room');
assert.doesNotMatch(app,/NO MICROPHONE REQUIRED/,'Scout does not waste space explaining the retired microphone');
assert.match(app,/id="scoutCharacterSelect"/,'Scout includes a travel-toon selector');
assert.match(app,/CLOSEST FIELD UPDATES/,'Scout ranks nearby Field Tracker update targets');
assert.doesNotMatch(app,/assistant\.innerHTML=\`[\s\S]*TALK TO ADAM/,'live Scout template has no Adam chat panel');
assert.match(index,/id="scoutGlobalAlert"/,'Scout has a persistent app-wide update alert');
assert.match(app,/SCOUT • UPDATE/,'Scout tab highlights when a scan update is due');

assert.equal(pkg.version,'2.9.142','Scout no-mic release is versioned');
assert.ok(index.includes('/app.js?v=2.9.142'),'browser cachebuster loads the Scout build');

console.log('Scout no-microphone regression tests passed.');
