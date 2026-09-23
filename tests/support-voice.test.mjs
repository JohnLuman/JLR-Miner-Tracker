import assert from 'node:assert/strict';
import fs from 'node:fs';

const main=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const support=fs.readFileSync(new URL('../services/tracker-support/server.mjs',import.meta.url),'utf8');
const docker=fs.readFileSync(new URL('../services/tracker-support/Dockerfile',import.meta.url),'utf8');
const start=fs.readFileSync(new URL('../services/tracker-support/start.sh',import.meta.url),'utf8');

assert.match(main,/\/api\/internal\/support\/voice-reference/,'main app exposes private cached core reference bridge');
assert.match(main,/trackerSupportInternalAuth/,'voice reference bridge requires Support shared-secret auth');
assert.match(main,/trackerCoreVoiceReference/,'main app selects a cached core reference');

assert.match(support,/url\.pathname==='\/synthesize'/,'Support owns buffered TTS endpoint');
assert.match(support,/url\.pathname==='\/synthesize-stream'/,'Support owns streaming-compatible TTS endpoint');
assert.match(support,/GPT_SOVITS_URL/,'Support calls local GPT-SoVITS engine');
assert.match(support,/127\.0\.0\.1:9880\/tts/,'GPT-SoVITS defaults to container-local API');
assert.match(support,/api\/internal\/support\/voice-reference/,'Support privately bootstraps its reference from main JLR');
assert.match(support,/VOICE_REFERENCE_FILE/,'Support persists the core voice reference');

assert.match(docker,/RVC-Boss\/GPT-SoVITS/,'Support image installs GPT-SoVITS');
assert.match(docker,/--device CPU/,'Support image explicitly installs CPU inference dependencies');
assert.match(start,/api_v2\.py/,'Support starts GPT-SoVITS API');
assert.match(start,/127\.0\.0\.1/,'GPT-SoVITS binds only inside Support container');
assert.doesNotMatch(start,/cloudflared|ngrok|tunnel/i,'Support voice does not depend on a PC tunnel');

console.log('Tracker Support hosted voice architecture tests passed.');
