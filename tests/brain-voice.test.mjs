import assert from 'node:assert/strict';
import fs from 'node:fs';

const tracker=fs.readFileSync(new URL('../public/tracker.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

assert.doesNotMatch(tracker,/SpeechSynthesisUtterance|speechSynthesis/,'Tracker client has no browser speech fallback');
assert.doesNotMatch(tracker,/\/api\/voice\/stream/,'Tracker client no longer calls spoken-voice endpoints');
assert.match(tracker,/window\.jlrSpeakEvent=async function\(\)\{return false\}/,'legacy speak hook is a permanent no-op');
assert.match(tracker,/window\.jlrVoiceMode='disabled'/,'runtime reports spoken voice disabled');
assert.match(tracker,/window\.jlrPlayFighterAlarm=playFighterAlarm/,'local Heavy Fighter alarm remains available');
assert.match(tracker,/createOscillator\(\)/,'loss alarm remains a local non-speech oscillator');
assert.match(tracker,/no spoken voice/,'alarm test explicitly identifies itself as non-spoken');

assert.match(server,/VOICE_REMOVED/,'server blocks retired spoken-voice routes');
assert.match(server,/url\.pathname\.startsWith\('\/api\/voice\/'\)/,'all general voice endpoints are blocked');
assert.match(server,/heavy-fighters\\\/voice/,'Heavy Fighter TTS endpoints are blocked');
assert.match(app,/async function speakJlr[\s\S]*?return true;/,'legacy app speech calls are harmless no-ops');
assert.match(app,/Spoken output is disabled/,'Adam remains text-only');

console.log('Spoken voice removal / alarm-only tests passed.');
