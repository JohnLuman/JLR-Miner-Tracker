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

console.log('shared scan tests passed');

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const viewer=fs.readFileSync(new URL('../public/dscan-share.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/dscan-share.html',import.meta.url),'utf8');

assert.match(server,/async function updateJlrDscanShare/,'shared links support owner updates');
assert.match(server,/dscanText/,'shared links persist a D-scan layer');
assert.match(server,/localText/,'shared links persist a Local layer');
assert.match(server,/manualRecons/,'shared links persist manual recon intel');
assert.match(server,/canEdit:Boolean/,'public share response exposes creator edit capability without exposing owner id');
assert.match(server,/\/api\\\/dscan-share\\\/\([^/]+\)\\\/update/,'owner update endpoint is registered');
assert.match(viewer,/SAVE UPDATE/,'viewer includes persistent-link update controls');
assert.match(viewer,/data-recon-preset/,'viewer includes recon quick-add controls');
assert.match(viewer,/manualRecons:reconRowsFromEditor/,'viewer saves manual recon rows');
assert.match(viewer,/localText:\$\('editLocal'\)\.value/,'viewer updates Local separately from D-scan');
assert.match(viewer,/dscanText:\$\('editDscan'\)\.value/,'viewer updates D-scan separately from Local');
assert.match(html,/UPDATE THIS SAME LINK/,'owner UI explains stable-link behavior');
assert.match(html,/dscan-share\.js\?v=2/,'shared viewer cache-busts the editable client');
