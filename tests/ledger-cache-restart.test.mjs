import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.match(server,/LEDGER_CACHE_FILE = path\.join\(DATA_DIR, 'ledger-cache\.json'\)/,'ledger snapshots have a persistent data-volume file');
assert.match(server,/const restoredLedgerCache = await loadLedgerCache\(state\.characters\)/,'ledger cache is restored before serving requests');
assert.match(server,/const ledgerRowsByCharacter = restoredLedgerCache\.rowsByCharacter/,'restored rows seed the live ledger map');
assert.match(server,/const ledgerSnapshotAtByCharacter = restoredLedgerCache\.snapshotAtByCharacter/,'restored baseline timestamps survive restarts');
assert.match(server,/async function loadLedgerCache\(characters=\{\}\)/,'ledger cache has a restart restore path');
assert.match(server,/function saveLedgerCache\(\)/,'ledger cache has a persistent write path');
assert.match(server,/await saveLedgerCache\(\)/,'successful ledger refreshes persist the restart cache');
assert.match(server,/if\(cacheComplete\)\{\s*rebuildDailyFleetFromLedgerCache\(\);/s,'fleet totals rebuild only from a complete linked-character cache');
assert.doesNotMatch(server,/if\(fullCycle\|\|cacheComplete\)/,'a failed full cycle can no longer zero a valid payout');
assert.match(server,/preserving previous dailyFleet totals/,'partial ESI cycles explicitly preserve the last complete payout');
assert.match(server,/if\(miningLedgerDebug\(\)\.cacheComplete\)rebuildDailyFleetFromLedgerCache\(\)/,'market refresh cannot rebuild fleet totals from a partial cache');

assert.equal(pkg.version,'2.9.133','ledger restart protection is versioned');
assert.ok(index.includes('/app.js?v=2.9.133'),'browser loads the ledger restart fix');

console.log('Ledger restart cache regression tests passed.');
