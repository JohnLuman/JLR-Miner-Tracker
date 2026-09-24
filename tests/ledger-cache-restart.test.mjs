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
assert.match(server,/if\(cacheComplete\|\|\(fullCycle&&cachedConnectedIds\.length>0\)\)\{\s*rebuildDailyFleetFromLedgerCache\(\);/s,'full fleet cycles publish available cached ledgers even when one linked toon has never synced');
assert.doesNotMatch(server,/if\(fullCycle\|\|cacheComplete\)/,'a failed full cycle can no longer zero a valid payout');
assert.match(server,/publishing available ledger totals/,'partial fleet coverage is published instead of freezing the app payout at zero');
assert.match(server,/if\(miningLedgerDebug\(\)\.cacheComplete\)rebuildDailyFleetFromLedgerCache\(\)/,'market refresh cannot independently rebuild fleet totals from a partial cache');
assert.match(server,/Mining ledger cache empty: 0\//,'zero cached ledgers still preserve the previous fleet payout');

assert.equal(pkg.version,'2.9.137','ledger restart protection is versioned');
assert.ok(index.includes('/app.js?v=2.9.137'),'browser loads the ledger restart fix');

console.log('Ledger restart cache regression tests passed.');
