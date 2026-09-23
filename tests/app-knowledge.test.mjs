import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

const tabs=[...index.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]);
const expected=['fields','brain','fleet','performance','ice','gas','doctrine','pvp','tracker','threat','mer','toons','feedback'];
assert.deepEqual(tabs,expected,'tab list changed; Tracker app knowledge must be updated with every tab');

for(const tab of expected){
  assert.match(server,new RegExp('\\n  '+tab+':\\{'),'Tracker knowledge includes '+tab);
}

assert.match(server,/const TRACKER_APP_KNOWLEDGE = \{/,'server has a central app knowledge map');
assert.match(server,/const TRACKER_METRIC_KNOWLEDGE = \[/,'server has a central metric knowledge map');
assert.match(server,/id:'live-activity-rate'/,'Live Activity Rate has a dedicated explanation');
assert.match(server,/interval estimate from ESI, not instant laser telemetry/,'Live Activity Rate explains its data limitations');
assert.match(server,/const currentTab=trackerSpeechSafe\(body\?\.currentTab,40\)/,'Brain API sanitizes the active tab once');
assert.match(server,/trackerBrainLiveAnswer\(user,resolvedQuestion,\{[\s\S]*?currentTab,/,'Brain API passes the active tab into local Brain fallback');
assert.match(server,/trackerSupport\.resolveQuestion\(\{[\s\S]*?currentTab,/,'Brain API passes the active tab into shared Tracker support');
assert.match(app,/currentTab:activeTab/,'browser sends the active tab with Tracker questions');
assert.match(server,/what am i looking at/,'contextual current-tab questions are supported');

console.log('Tracker app knowledge regression tests passed.');
