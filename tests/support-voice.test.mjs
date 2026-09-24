import assert from 'node:assert/strict';
import fs from 'node:fs';

const main=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const support=fs.readFileSync(new URL('../services/tracker-support/server.mjs',import.meta.url),'utf8');
const docker=fs.readFileSync(new URL('../services/tracker-support/Dockerfile',import.meta.url),'utf8');
const start=fs.readFileSync(new URL('../services/tracker-support/start.sh',import.meta.url),'utf8');
const tracker=fs.readFileSync(new URL('../public/tracker.js',import.meta.url),'utf8');

assert.match(main,/\/api\/internal\/support\/voice-reference/,'main exposes the private cached core reference bridge');
assert.match(main,/trackerSupportInternalAuth/,'voice reference bridge uses Support shared-secret auth');
assert.match(main,/trackerCoreVoiceReference/,'main selects a cached core voice reference');
assert.match(main,/process\.env\.TRACKER_SUPPORT_URL \|\| process\.env\.TRACKER_TTS_WORKER_URL/,'custom voice prefers Tracker Support');
assert.match(main,/TRACKER_SUPPORT_SHARED_SECRET \|\| process\.env\.TRACKER_TTS_WORKER_TOKEN/,'custom voice uses the Support shared secret');

assert.match(support,/url\.pathname==='\/synthesize'/,'Support owns buffered TTS endpoint');
assert.match(support,/url\.pathname==='\/synthesize-stream'/,'Support owns stream-compatible TTS endpoint');
assert.match(support,/127\.0\.0\.1:9880\/tts/,'Support calls container-local GPT-SoVITS');
assert.match(support,/api\/internal\/support\/voice-reference/,'Support privately bootstraps the core reference from main JLR');
assert.match(support,/VOICE_REFERENCE_FILE/,'Support persists the core voice reference');
assert.match(support,/async function streamSynthesizeVoice/,'Support has a true streaming proxy instead of buffering the whole WAV');
assert.match(support,/text_split_method:'cut2'/,'Support avoids tiny cut5 clauses that can hit the CPU semantic ceiling');
assert.match(support,/min_chunk_length:4/,'Support emits small early semantic chunks for lower first-audio latency');
assert.match(support,/streaming_modes:\[2,3\]/,'Support advertises the streaming modes it actually implements');
assert.match(support,/VOICE_HEALTH_TIMEOUT_MS/,'Support health probe allows normal CPU response latency');
assert.match(tracker,/\/api\/voice\/stream\/brain\?text=/,'Adam conversational replies use the browser streaming endpoint');
assert.match(tracker,/window\.jlrVoiceFirstAudioMs=latency/,'stream playback records true first-audio latency');


assert.match(docker,/RVC-Boss\/GPT-SoVITS/,'Support image installs GPT-SoVITS');
assert.match(docker,/--device CPU/,'Support installs the CPU inference path');
assert.match(docker,/download\.pytorch\.org\/whl\/cpu/,'Support forces CPU torchaudio wheels after requirements');
assert.match(docker,/import torch, torchaudio/,'Support build smoke-tests the CPU audio runtime');
assert.match(start,/api_v2\.py/,'Support starts GPT-SoVITS API');
assert.match(start,/127\.0\.0\.1/,'GPT-SoVITS binds only inside Support container');
assert.doesNotMatch(start,/cloudflared|ngrok|tunnel/i,'Support voice does not depend on a PC tunnel');

console.log('Tracker Support hosted voice architecture tests passed.');
