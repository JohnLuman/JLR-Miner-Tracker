import fs from 'node:fs';
import assert from 'node:assert/strict';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../lib/tracker-support-client.mjs',import.meta.url),'utf8');
const support=fs.readFileSync(new URL('../services/tracker-support/server.mjs',import.meta.url),'utf8');
const docker=fs.readFileSync(new URL('../services/tracker-support/Dockerfile',import.meta.url),'utf8');
const importer=fs.readFileSync(new URL('../services/tracker-support/sde_import.py',import.meta.url),'utf8');
const appraisal=fs.readFileSync(new URL('../lib/appraisal/appraisal.mjs',import.meta.url),'utf8');
const live=fs.readFileSync(new URL('../public/appraisal-enhance.js',import.meta.url),'utf8');
const share=fs.readFileSync(new URL('../public/appraisal-share-enhance.js',import.meta.url),'utf8');

assert.match(importer,/developers\.eveonline\.com\/static-data\/tranquility\/latest\.jsonl/);
assert.match(importer,/eve-online-static-data-\{build\}-jsonl\.zip/);
assert.match(importer,/types\.jsonl/);
assert.match(importer,/compressibleTypes\.jsonl/);
assert.match(importer,/typeMaterials\.jsonl/);
assert.match(importer,/os\.replace\(temp_db, out_path\)/,'SDE DB replacement is atomic');

assert.match(docker,/sde-catalog\.mjs/);
assert.match(docker,/sde_import\.py/);

assert.match(support,/JlrSdeCatalog/);
assert.match(support,/\/v1\/sde\/match/,'Support exposes SDE question matching for Adam');
assert.match(support,/\/v1\/sde\/resolve/);
assert.match(support,/\/v1\/sde\/types/);
assert.match(support,/\/v1\/sde\/materials/);
assert.match(support,/refreshSdeCatalog/);
assert.match(support,/sdeCompressionCandidate/,'Support uses exact SDE compression relationships');
assert.match(support,/version:'2\.3\.0'/);

assert.match(client,/async sdeMatch/,'main service can ask Support to match item names in Adam questions');
assert.match(client,/async sdeResolve/);
assert.match(client,/async sdeTypes/);
assert.match(client,/async sdeMaterials/);

assert.match(server,/trackerSupport\.sdeMatch/,'Adam matches EVE item names through local SDE');
assert.match(server,/trackerBrainAppraisalAnswer/,'Adam has a dedicated grounded Appraisal answer path');
assert.match(server,/trackerSupport\.sdeResolve/,'Appraisal resolves names from local SDE first');
assert.match(server,/trackerSupport\.sdeMaterials/,'Appraisal uses SDE reprocessing materials');
assert.match(server,/staticSource:'sde'/);
assert.match(server,/recipeSource='ccp-sde'/);
assert.doesNotMatch(server,/async function appraisalResolveItem\(/,'legacy single-item ESI resolver is removed');

assert.match(appraisal,/staticData:/,'shared Appraisals preserve SDE provenance');
assert.match(appraisal,/recipeSource:/,'shared Appraisals preserve refine recipe provenance');
assert.match(live,/CCP SDE/);
assert.match(share,/STATIC DATA/);

console.log('JLR local SDE architecture tests passed.');
