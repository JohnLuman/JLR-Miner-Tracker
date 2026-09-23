import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const tracker=fs.readFileSync(new URL('../public/tracker.js',import.meta.url),'utf8');

assert.match(tracker,/voice queue watchdog/,'voice queue has a stale-session watchdog');
assert.match(tracker,/90000/,'conversational voice requests have a hard timeout');
assert.match(tracker,/125000/,'streaming voice requests have a hard timeout');
assert.match(tracker,/manual conversational voice retry/,'manual Tracker replies retry once after transport recovery');
assert.match(tracker,/window\.jlrRecoverVoice=recoverVoiceTransport/,'voice recovery hook is exposed');
assert.match(tracker,/window\.jlrVoiceRuntimeStatus=voiceRuntimeStatus/,'voice runtime health is exposed');

assert.match(app,/function ensureBrainLongRunHealth/,'microphone pipeline has a long-uptime watchdog');
assert.match(app,/LONG_UPTIME_RECOVERY/,'mic recovery is recorded in diagnostics');
assert.match(app,/brainMicWatchdogLastFrameAt=Date\.now\(\)/,'local audio frames refresh watchdog health');
assert.match(app,/track\.addEventListener\('ended'/,'ended microphone tracks restart automatically');
assert.match(app,/startBrainLongUptimeWatchdog\(\)/,'long-uptime watchdog starts during boot');
assert.match(app,/Voice recovery count:/,'diagnostics expose automatic voice recoveries');

console.log('Long-uptime Tracker regression tests passed.');
