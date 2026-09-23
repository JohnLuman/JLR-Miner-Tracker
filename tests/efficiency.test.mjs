import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ps=fs.readFileSync(new URL('../public/downloads/JLR-Tracker-Companion.ps1',import.meta.url),'utf8');

assert.match(server,/let saveRequested = false/,'state persistence coalesces bursts of save requests');
assert.match(server,/do \{\s*saveRequested = false;\s*await writeState\(\);\s*\} while \(saveRequested\)/s,'coalesced saves still persist changes arriving during a write');
assert.match(server,/trackerBrainSnapshot\(scans=scanActivityPublic\(\),debug=miningLedgerDebug\(\)\)/,'Brain can reuse public-state scan and ledger calculations');
assert.match(server,/trackerBrain:trackerBrainSnapshot\(scans,ledgerDebug\)/,'public state reuses expensive scan/debug snapshots');
assert.match(server,/if\(!sseClients\.size\)/,'broadcast skips public-state serialization when no SSE clients are connected');
assert.match(server,/\/api\/companion\/locations/,'server accepts batched companion location heartbeats');
assert.match(server,/readBody\(req,64_000\)/,'batch endpoint has a bounded request size');

assert.match(ps,/\/api\/companion\/locations/,'companion sends batched location heartbeats');
assert.match(ps,/\$script:AuthToken/,'companion decrypts the pairing token once per process instead of every heartbeat');
assert.match(ps,/Read-JlrUtf16Slice/,'companion reads small UTF-16 slices before falling back to a full log read');
assert.match(ps,/NextDirectoryRefresh/,'companion caches Local log discovery between directory scans');
assert.match(ps,/\$pending = @\(\)/,'companion groups changed and heartbeat-due toons into one send');

assert.match(app,/function scheduleStateRender\(\)/,'rapid SSE updates are coalesced into one browser render frame');
assert.match(app,/document\.hidden/,'background tabs pause nonessential UI work');
assert.match(app,/activeTab!=='brain'/,'companion UI polling pauses outside the Brain tab');
assert.match(app,/if\(activeTab==='fields'\)/,'one-second field redraw work is scoped to the visible Fields tab');

console.log('Efficiency regression tests passed.');
