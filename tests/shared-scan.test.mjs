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
assert.match(html,/dscan-share\.js\?v=5/,'public viewer cache-busts the read-only client');

assert.match(html,/id="scanHighlights"/,'public D-scan leads with a composition summary');
assert.match(html,/id="dscanObjectsDetails"/,'individual objects expand on demand');
assert.match(html,/id="copySummary"/,'copyable fleet composition is available');
assert.match(viewer,/Snapshot — Not Live/,'shared intel summary is marked as a snapshot');
assert.match(viewer,/mass:15000/,'known Hulk mass can be totaled');
assert.match(viewer,/unclassified/,'unknown objects are not assumed to be ships');

const catalog=JSON.parse(fs.readFileSync(new URL('../public/eve-ship-catalog.json',import.meta.url),'utf8'));
assert.equal(catalog.massUnit,'kg');
assert.ok(catalog.ships.length>=500,'ship database should have at least 500 EVE hulls');
const ships=new Map(catalog.ships.map(([name,group,massKg,typeId])=>[name.toLowerCase(),{group,massKg,typeId}]));
assert.deepEqual(ships.get('hulk'),{group:'Exhumer',massKg:15000000,typeId:22544});
assert.equal(ships.get('rifter').group,'Frigate');
assert.equal(ships.get('rorqual').group,'Capital Industrial Ship');
assert.equal(29*ships.get('hulk').massKg/1000,435000,'ship mass is shown in metric tonnes');
assert.match(viewer,/JLR D-SCAN INTELLIGENCE/,'summary copy has a compact heading');
assert.ok(viewer.includes('eve-ship-catalog.json'),'shared scan loads the full static ship catalog');
assert.match(app,/threatShareNewSystem/,'system can be entered when creating a scan link');
assert.match(server,/companionScanSystem/,'unambiguous fresh companion system can fill the system');

console.log('shared scan tests passed');
