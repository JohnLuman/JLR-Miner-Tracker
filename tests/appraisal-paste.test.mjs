import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseAppraisalPaste } from '../lib/appraisal/paste.mjs';

const inventory=parseAppraisalPaste('Tritanium\t12,345\tMineral');
assert.equal(inventory.valid,true);
assert.equal(inventory.rows[0].name,'Tritanium');
assert.equal(inventory.rows[0].quantity,12345);

const marketRow=parseAppraisalPaste(
  'Industrial Jump Portal Generator I\tIndustrial Jump Portal Generator\tHigh\t5,000 m3\t688,289,244.19 ISK'
);
assert.equal(marketRow.valid,true);
assert.equal(marketRow.rows.length,1);
assert.equal(marketRow.rows[0].name,'Industrial Jump Portal Generator I');
assert.equal(marketRow.rows[0].quantity,1);
assert.ok(marketRow.rows[0].name.length<=100);

const multiple=parseAppraisalPaste([
  'Industrial Jump Portal Generator I\tIndustrial Jump Portal Generator\tHigh\t5,000 m3\t688,289,244.19 ISK',
  'Expanded Cargohold II\tExpanded Cargohold\tLow\t5 m3\t1,200,000 ISK',
].join('\n'));
assert.deepEqual(multiple.rows.map(row=>row.name),[
  'Industrial Jump Portal Generator I',
  'Expanded Cargohold II',
]);

const header=parseAppraisalPaste('Item Name\tGroup\tSlot\tVolume\tValue');
assert.equal(header.valid,false);
assert.equal(header.rejected.length,1,'tabular headers are ignored instead of sent to ESI');

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
assert.match(server,/name\.length>=2&&name\.length<=100/,'Appraisal ESI fallback rejects overlong names before universe/ids');

console.log('Appraisal paste regression passed');
