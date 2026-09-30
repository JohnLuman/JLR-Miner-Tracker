import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const tracker=fs.readFileSync(new URL('../public/tracker.js',import.meta.url),'utf8');

assert.match(tracker,/function alarmRuntimeStatus\(\)/,'alarm runtime exposes health without a speech transport');
assert.match(tracker,/alarmActive:Boolean\(alarmTimer\|\|alarmNodes\.length\)/,'alarm runtime reports latched alarm state');
assert.match(tracker,/setInterval\(function\(\)[\s\S]*?expiresAt:Date\.now\(\)\+20_000/,'single-tab alarm lease is continuously renewed during long sessions');
assert.match(tracker,/\},5_000\);/,'alarm lease heartbeat refreshes every five seconds for fast dead-tab failover');
assert.match(tracker,/window\.addEventListener\('pagehide',releaseAlarmLease\)/,'alarm lease is explicitly released when a tab closes');
assert.match(tracker,/window\.jlrAlarmRuntimeStatus=alarmRuntimeStatus/,'alarm runtime can be inspected');
assert.doesNotMatch(app,/startBrainListening|brainMicWatchdogTimer/,'long sessions do not run microphone recovery');

console.log('Long-uptime alarm-only regression tests passed.');
