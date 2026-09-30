import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const alarm=fs.readFileSync(new URL('../public/tracker.js',import.meta.url),'utf8');
const tracker=fs.readFileSync(new URL('../public/tracker-core.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const support=fs.readFileSync(new URL('../services/tracker-support/server.mjs',import.meta.url),'utf8');
const docker=fs.readFileSync(new URL('../services/tracker-support/Dockerfile',import.meta.url),'utf8');

assert.doesNotMatch(index,/vendor\/vosk|speech-recognition|microphone/i);
assert.doesNotMatch(app,/Vosk|SpeechRecognition|getUserMedia|jlrBrainMicArmed|speakJlr|speechSynthesis/);
assert.doesNotMatch(main,/loadVosk|serveVosk|model-en-us-0\.15|streamTrackerVoiceToResponse|trackerVoiceWorkerAudio/);
assert.doesNotMatch(support,/GPT_SOVITS|synthesizeVoice|VOICE_REFERENCE|ensureVoiceReference/);
assert.doesNotMatch(docker,/GPT-SoVITS|torchaudio|pytorch|conda/i);
assert.doesNotMatch(tracker,/voice\/status|loadVoiceStatus|jlr-voice-mode/);
assert.match(main,/VOICE_REMOVED/,'old speech URLs remain explicitly retired');
assert.match(alarm,/window\.jlrPlayFighterAlarm=playFighterAlarm/);
assert.match(alarm,/createOscillator\(\)/,'non-spoken loss alarm still sounds');
assert.match(support,/buildSupportAppraisalIntel/,'Appraisal support remains active');
console.log('Voice runtime removal and alarm isolation passed.');
