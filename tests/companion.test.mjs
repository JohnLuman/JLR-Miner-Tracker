import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ps=fs.readFileSync(new URL('../public/downloads/JLR-Tracker-Companion.ps1',import.meta.url),'utf8');
const cmd=fs.readFileSync(new URL('../public/downloads/INSTALL-JLR-TRACKER-COMPANION.cmd',import.meta.url),'utf8');

assert.match(server,/\/api\/companion\/pair\/claim/);
assert.match(server,/\/api\/companion\/location/);
assert.match(server,/source:'companion'/);
assert.match(server,/COMPANION_LOCATION_TTL_MS/);
assert.match(server,/companionTokenHash/);
assert.match(app,/DESKTOP COMPANION/);
assert.match(app,/NOISE_SUPPRESS/);
assert.match(ps,/Encoding\]::Unicode/,'EVE chat logs are read as UTF-16LE/Unicode');
assert.match(ps,/Channel changed to Local/);
assert.match(ps,/Listener:/);
assert.match(ps,/\/api\/companion\/location/);
assert.match(ps,/ProtectedData/,'pair token is protected with Windows DPAPI');
assert.match(cmd,/JLR-Tracker-Companion\.ps1/);
console.log('Desktop companion integration tests passed.');
