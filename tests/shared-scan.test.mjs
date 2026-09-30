import fs from 'node:fs';
import assert from 'node:assert/strict';
import { sharedScanKind, sharedLocalNames, parseSharedDscanRows } from '../lib/shared-scan.mjs';

const local=[
  'A Good Rogering',
  'Aheras Yeda Katelo',
  'MyPasswordIs ILoveMittens',
  'Yeda Parmala',
].join('\n');
assert.equal(sharedScanKind(local),'local');
assert.deepEqual(sharedLocalNames(local),[
  'A Good Rogering',
  'Aheras Yeda Katelo',
  'MyPasswordIs ILoveMittens',
  'Yeda Parmala',
]);

const dscan=[
  'Raitaru\tRaitaru\t2.3 AU',
  'Hulk\tHulk\t1,234 km',
  'Mobile Tractor Unit\tMobile Tractor Unit\t50 km',
].join('\n');
assert.equal(sharedScanKind(dscan),'dscan');
assert.deepEqual(parseSharedDscanRows(dscan).map(row=>row.type),['Raitaru','Hulk','Mobile Tractor Unit']);
assert.equal(parseSharedDscanRows(dscan)[1].distance,'1,234 km');

const spaced='Hulk   Hulk   88 km\nRorqual   Rorqual   1.2 AU';
assert.equal(sharedScanKind(spaced),'dscan');
assert.equal(parseSharedDscanRows(spaced).length,2);

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const viewer=fs.readFileSync(new URL('../public/dscan-share.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/dscan-share.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

assert.match(server,/async function updateJlrDscanShare/,'shared links support owner updates');
assert.match(server,/dscanText/,'shared links persist a D-scan layer');
assert.match(server,/localText/,'shared links persist a Local layer');
assert.match(server,/manualRecons/,'shared links persist manual recon intel');
assert.match(server,/canEdit:Boolean/,'public share response exposes creator edit capability without exposing owner id');
assert.match(server,/sharedScanUpdateMatch/,'owner update endpoint is registered');
assert.doesNotMatch(html,/SAVE UPDATE|UPDATE THIS SAME LINK|OWNER CONTROLS/,'public shared intel page stays read-only');
assert.doesNotMatch(viewer,/saveShare|reconRowsFromEditor|data-recon-preset/,'public viewer contains no edit workflow');
assert.match(app,/EDIT SHARED LINK/,'JLR Threat Scan owns the shared-link editor');
assert.match(app,/saveThreatShareEditor/,'JLR Threat Scan can update the same shared link');
assert.match(app,/manualRecons:threatShareReconRows/,'JLR editor saves manual recon rows');
assert.match(app,/dscanText:\$\('threatShareDscan'\)/,'JLR editor updates D-scan separately');
assert.match(app,/localText:\$\('threatShareLocal'\)/,'JLR editor updates Local separately');
assert.match(html,/dscan-share\.js\?v=3/,'public viewer cache-busts the read-only client');

console.log('shared scan tests passed');
