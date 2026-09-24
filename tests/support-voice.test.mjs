import assert from 'node:assert/strict';
import fs from 'node:fs';

const main=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const support=fs.readFileSync(new URL('../services/tracker-support/server.mjs',import.meta.url),'utf8');
const docker=fs.readFileSync(new URL('../services/tracker-support/Dockerfile',import.meta.url),'utf8');
const start=fs.readFileSync(new URL('../services/tracker-support/start.sh',import.meta.url),'utf8');

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

assert.match(docker,/RVC-Boss\/GPT-SoVITS/,'Support image installs GPT-SoVITS');
assert.match(docker,/--device CPU/,'Support installs the CPU inference path');
assert.match(docker,/download\.pytorch\.org\/whl\/cpu/,'Support forces CPU torchaudio wheels after requirements');
assert.match(docker,/import torch, torchaudio/,'Support build smoke-tests the CPU audio runtime');
assert.match(start,/api_v2\.py/,'Support starts GPT-SoVITS API');
assert.match(start,/127\.0\.0\.1/,'GPT-SoVITS binds only inside Support container');
assert.doesNotMatch(start,/cloudflared|ngrok|tunnel/i,'Support voice does not depend on a PC tunnel');

console.log('Tracker Support hosted voice architecture tests passed.');
