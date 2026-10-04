import assert from 'node:assert/strict';
import {normalizeMapFieldSnapshot,mapFieldSummary} from '../lib/static-map-field-catalog.mjs';

const snapshot=normalizeMapFieldSnapshot({
  source:'User map',
  capturedAt:'2026-10-02',
  fields:[
    {system:'RP2-OQ',mineral:'Mexallon',ore:'Kylixium',tier:3,powerState:'online'},
    {system:'RP2-OQ',mineral:'Pyerite',ore:'Mordinium',tier:2,powerState:'pending'},
    {system:'APM-6K',mineral:'Mexallon',ore:'Kylixium',tier:3,powerState:'offline'},
  ],
});
assert.equal(snapshot.fields.length,3);
assert.equal(snapshot.fields[0].tier,2);
assert.equal(snapshot.fields[0].source,'user-map-2026-10-02');
assert.deepEqual(mapFieldSummary(snapshot),{
  total:3,tier2:1,tier3:2,online:1,pending:1,offline:1,low:0,unknown:0,systems:2,
});
assert.throws(()=>normalizeMapFieldSnapshot({fields:[
  {system:'A',mineral:'Mexallon',ore:'Kylixium',tier:2,powerState:'online'},
  {system:'A',mineral:'Mexallon',ore:'Kylixium',tier:2,powerState:'online'},
]}),/Duplicate map field/);
console.log('Static user-supplied map field catalog tests passed.');
