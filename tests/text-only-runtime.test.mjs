import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('public/app.js');
const index=read('public/index.html');
const tracker=read('public/tracker.js');
const core=read('public/tracker-core.js');
const server=read('server.mjs');
const support=read('services/tracker-support/server.mjs');
const supportCore=read('services/tracker-support/core.mjs');
const docker=read('services/tracker-support/Dockerfile');

for(const [name,text] of Object.entries({app,index,tracker,core,server,support,supportCore,docker})){
  assert.doesNotMatch(text,/SpeechRecognition|speechSynthesis|\bVosk\b|GPT-SoVITS|TRACKER_TTS|\/api\/voice\/|voice-reference|heavy-fighters\/voice|jlrVoice|jlrSpeak|brainMic|voiceText/i,name+' still contains retired spoken-audio runtime');
}

assert.doesNotMatch(index,/vendor\/vosk/i);
assert.doesNotMatch(support,/\/synthesize|reference_audio|reference_text|audio\/wav/i);
assert.doesNotMatch(docker,/ffmpeg|conda|GPT|SoVITS/i);

// The Heavy Fighter alert remains a local non-speech tone.
assert.match(tracker,/createOscillator/);
assert.match(tracker,/jlrPlayFighterAlarm/);
assert.match(tracker,/jlrStopFighterAlarm/);

console.log('Text-only runtime guard passed.');
