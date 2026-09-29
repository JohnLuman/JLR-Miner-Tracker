import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const tracker=fs.readFileSync(new URL('../public/tracker.js',import.meta.url),'utf8');

assert.match(tracker,/function alarmRuntimeStatus\(\)/,'alarm runtime exposes health without a speech transport');
assert.match(tracker,/alarmActive:Boolean\(alarmTimer\|\|alarmNodes\.length\)/,'alarm runtime reports latched alarm state');
assert.match(tracker,/setInterval\(function\(\)[\s\S]*?90_000/,'single-tab alarm lease survives long sessions');
assert.match(tracker,/window\.jlrRecoverVoice=async function\(\)\{return true\}/,'retired voice recovery hook is a safe compatibility no-op');
assert.doesNotMatch(tracker,/voice queue watchdog|manual conversational voice retry/,'retired TTS queue watchdog is gone');

assert.match(app,/function ensureBrainLongRunHealth/,'legacy microphone diagnostics code remains available for safe inspection');
assert.match(app,/LONG_UPTIME_RECOVERY/,'mic recovery remains recorded in diagnostics code');
assert.doesNotMatch(app,/await refreshBrainMicrophones\(\);\s*startBrainLongUptimeWatchdog\(\)/,'live boot does not start the retired microphone watchdog');
assert.match(app,/const ADAM_VOICE_ENABLED=false/,'retired microphone pipeline remains hard-disabled');

console.log('Long-uptime alarm-only regression tests passed.');
