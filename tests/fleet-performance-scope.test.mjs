import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

assert.match(server,/function fleetPerformanceSnapshotForUser\(user,requestedCharacterIds\)/,'server exposes a scoped Fleet Performance snapshot builder');
assert.match(server,/const allowed=new Set\(\(user\?\.characterIds\|\|\[\]\)\.map\(String\)\)/,'requested Fleet Performance IDs are restricted to the logged-in user');
assert.match(server,/characterIds\.flatMap\(id=>ledgerRowsByCharacter\.get\(id\)\|\|\[\]\)/,'daily history only aggregates selected character ledgers');
assert.match(server,/characters,\n\s*};/,'performance samples retain per-character contributions for filtering');
assert.match(server,/url\.pathname==='\/api\/fleet-performance'/,'authenticated scoped Fleet Performance endpoint exists');
assert.match(server,/fleetPerformanceSnapshotForUser\(user,body\?\.characterIds\|\|\[\]\)/,'endpoint uses only requested authorized members');

assert.match(app,/function selectedFleetPerformanceIds\(\)/,'client derives the assigned Fleet Setup member list');
assert.match(app,/fleetSettings\.members\?\.\[id\]\?\.enabled/,'only enabled Fleet Setup members are included');
assert.match(app,/id!==boosterId/,'booster is excluded from miner performance totals');
assert.match(app,/api\('\/api\/fleet-performance'/,'client requests the authenticated scoped performance snapshot');
assert.match(app,/const performance=scopedFleetPerformance\(\)/,'Fleet Performance renders the scoped snapshot');
assert.match(app,/samples=performance\.samples\|\|\[\]/,'live chart uses scoped samples');
assert.match(app,/performance\.actual\?\.today\?\.m3/,'today volume uses assigned-fleet actuals');
assert.doesNotMatch(app,/const daily=fleetHistoryRows\(fleetHistoryDays\),samples=state\.esi\?\.performance\?\.samples/,'Fleet Performance must not use the global sample stream');

console.log('Assigned Fleet Performance scope tests passed.');
