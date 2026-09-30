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
