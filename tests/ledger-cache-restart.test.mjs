import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.match(server,/LEDGER_CACHE_FILE = path\.join\(DATA_DIR, 'ledger-cache\.json'\)/,'ledger snapshots have a persistent data-volume file');
assert.match(server,/const restoredLedgerCache = await loadLedgerCache\(state\.characters\)/,'ledger cache is restored before serving requests');
assert.match(server,/const ledgerRowsByCharacter = restoredLedgerCache\.rowsByCharacter/,'restored rows seed the live ledger map');
assert.match(server,/const ledgerSnapshotAtByCharacter = restoredLedgerCache\.snapshotAtByCharacter/,'restored baseline timestamps survive restarts');
assert.match(server,/if\(ledgerRowsByCharacter\.size\)rebuildDailyFleetFromLedgerCache\(\)/,'restored ledger rows rebuild payout totals immediately after restart');
assert.match(server,/async function loadLedgerCache\(characters=\{\}\)/,'ledger cache has a restart restore path');
assert.match(server,/function saveLedgerCache\(\)/,'ledger cache has a persistent write path');
assert.match(server,/await saveLedgerCache\(\)/,'successful ledger refreshes persist the restart cache');
assert.match(server,/const cacheHealthy=coverageRatio>=LEDGER_HEALTH_RATIO/,'ledger coverage has an explicit healthy threshold');
assert.match(server,/if\(cacheComplete\|\|\(fullCycle&&cacheHealthy\)\)\{\s*rebuildDailyFleetFromLedgerCache\(\);/s,'full fleet cycles publish once at least 80% of linked ledgers are cached');
assert.doesNotMatch(server,/if\(fullCycle\|\|cacheComplete\)/,'a failed full cycle can no longer zero a valid payout');
assert.match(server,/healthy partial/,'healthy partial fleet coverage is published instead of freezing the app payout');
assert.match(server,/if\(miningLedgerDebug\(\)\.cacheHealthy\)rebuildDailyFleetFromLedgerCache\(\)/,'market refresh can rebuild totals once ledger coverage is healthy');
assert.match(server,/Mining ledger cache below 80%:/,'sub-80% coverage preserves the previous fleet payout');
assert.match(server,/const LEDGER_HEALTH_RATIO = 0\.80/,'80% coverage is the healthy threshold');

assert.equal(pkg.version,'2.9.142','ledger restart protection is versioned');
assert.ok(index.includes('/app.js?v=2.9.142'),'browser loads the ledger restart fix');

console.log('Ledger restart cache regression tests passed.');
