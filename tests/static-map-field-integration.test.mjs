import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const source=JSON.parse(fs.readFileSync(new URL('../source-data.json',import.meta.url),'utf8'));

assert.equal(source.fieldMapSnapshot?.capturedAt,'2026-10-02');
assert.match(String(source.fieldMapSnapshot?.source||''),/User-supplied Fountain Sovereignty Hub map/i);
assert.match(server,/normalizeMapFieldSnapshot/);
assert.match(server,/mapFields:FIELD_MAP_SNAPSHOT.fields/);
assert.match(app,/function mapFieldBoardNode/);
assert.match(app,/function mapFieldForT3/);
assert.match(index,/data-filter="map"[^>]*>ARRAYS</button>/);
assert.doesNotMatch(app,/SOV HUB STATUS MAP/,'the supplied map is data source material, not a CEO dashboard image');
assert.doesNotMatch(app,/fountain-sov-hub-map-2026-10-02/,'the supplied map asset is no longer embedded in CEO Command');
assert.doesNotMatch(server,/esi-structures.read_corporation.v1/,'field import must not require a new Renius ESI scope');
assert.doesNotMatch(server,//structures/sovereignty-hubs/,'field import must use the supplied map, not live CEO Sovereignty Hub ESI');
console.log('Static user-map Field Tracker integration assertions passed.');
