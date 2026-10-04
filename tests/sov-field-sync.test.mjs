import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

assert.match(server,/const CEO_SOV_HUB_SCOPE = 'esi-structures\.read_corporation\.v1'/,'new corporation Sovereignty Hub read scope is declared');
assert.match(server,/const CEO_AUTH_SCOPES = Object\.freeze\(\[\.\.\.CEO_SCOPES,CEO_SOV_HUB_SCOPE\]\)/,'new scope is requested without redefining legacy CEO core scopes');
assert.match(server,/for\(const scope of CEO_SCOPES\)if\(!identity\.scopes\.includes\(scope\)\)/,'legacy CEO access token remains usable with the pre-existing core scope set');
assert.match(server,/const requestedScopes=includeWallet\?\[\.\.\.CEO_AUTH_SCOPES,CEO_WALLET_SCOPE\]:\[\.\.\.CEO_AUTH_SCOPES\]/,'Renius authorization requests live Sov Hub field access');
assert.match(server,/\/structures\/sovereignty-hubs\?datasource=tranquility/,'JLR uses the Sovereignty Hub listing endpoint');
assert.match(server,/\/structures\/sovereignty-hubs\/\$\{hubId\}\?datasource=tranquility/,'JLR reads each Sovereignty Hub detail record');
assert.match(server,/buildSovFieldCatalog/,'Sovereignty Hub upgrades are converted to field catalog rows');
assert.match(server,/\/api\/ceo\/sovereignty-hubs/,'CEO Command exposes a restricted field sync endpoint');
assert.match(server,/source:\{[^\n]*sovFields:/,'sanitized cached field catalog is included in the shared app state');
assert.match(app,/LIVE T2\/T3 FIELD DISCOVERY/,'CEO Command has live field discovery status');
assert.match(app,/REFRESH FIELD CATALOG/,'CEO Command can request a fresh field catalog');
assert.doesNotMatch(app,/SOV HUB STATUS MAP/,'obsolete map snapshot is not shown in CEO Command');
assert.doesNotMatch(app,/fountain-sov-hub-map-2026-10-02/,'CEO Command no longer loads the screenshot');
assert.ok(index.includes('/app.js?v=2.10.21'),'browser app cache key uses the live field discovery release');
console.log('Sovereignty Hub field sync integration tests passed.');
