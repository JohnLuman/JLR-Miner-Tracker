import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const tracker=fs.readFileSync(new URL('../public/tracker.js',import.meta.url),'utf8');

assert.match(tracker,/function alarmRuntimeStatus\(\)/,'alarm runtime exposes health without a speech transport');
assert.match(tracker,/alarmActive:Boolean\(alarmTimer\|\|alarmNodes\.length\)/,'alarm runtime reports latched alarm state');
assert.match(tracker,/setInterval\(function\(\)[\s\S]*?90_000/,'single-tab alarm lease survives long sessions');
assert.match(tracker,/window\.jlrAlarmRuntimeStatus=alarmRuntimeStatus/,'alarm runtime can be inspected');
assert.doesNotMatch(app,/startBrainListening|brainMicWatchdogTimer/,'long sessions do not run microphone recovery');

console.log('Long-uptime alarm-only regression tests passed.');
