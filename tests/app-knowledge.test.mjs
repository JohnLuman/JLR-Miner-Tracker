import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

const tabs=[...index.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]);
const expected=['fields','fleet','performance','tracker','ice','gas','appraisal','doctrine','pvp','threat','mer','brain','toons','feedback'];
assert.deepEqual(tabs,expected,'tab list changed; Tracker app knowledge must be updated with every tab');

for(const tab of expected){
  assert.match(server,new RegExp('\\n  '+tab+':\\{'),'Tracker knowledge includes '+tab);
}

assert.match(server,/const TRACKER_APP_KNOWLEDGE = \{/,'server has a central app knowledge map');
assert.match(server,/const TRACKER_METRIC_KNOWLEDGE = \[/,'server has a central metric knowledge map');
assert.match(server,/id:'live-activity-rate'/,'Live Activity Rate has a dedicated explanation');
assert.match(server,/interval estimate from ESI, not instant laser telemetry/,'Live Activity Rate explains its data limitations');
assert.match(server,/const currentTab=trackerCleanText\(body\?\.currentTab,40\)/,'Brain API sanitizes the active tab once');
assert.match(server,/trackerBrainLiveAnswer\(user,resolvedQuestion,\{[\s\S]*?currentTab,/,'Brain API passes the active tab into local Brain fallback');
assert.match(server,/trackerSupport\.resolveQuestion\(\{[\s\S]*?currentTab,/,'Brain API passes the active tab into shared Tracker support');
assert.match(app,/currentTab:context\.currentTab/,'browser sends the current Adam work context with typed questions');
assert.match(app,/function adamContextSnapshot\(\)/,'browser builds structured Adam context');
assert.match(app,/context,\s*\}\),/,'Adam request sends structured context with the question');
assert.match(server,/const context=trackerBrainContext\(body\?\.context\)/,'Brain API sanitizes structured context');
assert.match(server,/trackerSupport\.resolveQuestion\(\{[\s\S]*?context,/,'Brain API passes structured context into shared support');
assert.match(server,/Reds or hostiles|reds, hostiles/,'Fleet variance explanation explicitly preserves interruption uncertainty');
assert.match(app,/jlrAdamOreSurveyContext/,'Adam persists the last ore survey for follow-up questions');
assert.match(app,/function adamLooksLikeOrePaste\(text\)/,'Adam detects ore paste formats before normal chat fallback');
assert.match(app,/volumeIndex===3/,'Adam recognizes inventory rows with a base-ore column before volume');
assert.match(app,/function adamOreSurveySystemAssignment\(text\)/,'Adam recognizes a follow-up system assignment for an ore survey');
assert.match(app,/upper\.startsWith\(candidate\+'-'\)/,'Adam resolves shorthand such as 3WE to the full tracked system name');
assert.match(app,/lastOreSurvey:/,'Adam sends the saved ore survey in structured context');
assert.match(server,/function trackerBrainOreSurveyAnswer\(question,rawContext\)/,'server can answer follow-ups from ore survey context');
assert.match(server,/oreContextAnswer=trackerBrainOreSurveyAnswer\(question,context\)/,'ore survey follow-ups are grounded before shared support fallback');

assert.match(server,/what am i looking at/,'contextual current-tab questions are supported');

console.log('Tracker app knowledge regression tests passed.');
