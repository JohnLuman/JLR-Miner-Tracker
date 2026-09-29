import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parseForgePaste, aggregateForgeMaterials, forgeSummary, sanitizeForgeShare } from '../lib/forge/forge.mjs';

const parsed=parseForgePaste([
  '10 Hulk',
  'Rorqual x 2',
  'Kylixium\t250,000\tOre',
  'Tritanium 1000000',
].join('\n'));
assert.equal(parsed.valid,true);
assert.equal(parsed.rows.length,4);
assert.deepEqual(parsed.rows.map(row=>[row.name,row.quantity]),[
  ['Hulk',10],
  ['Rorqual',2],
  ['Kylixium',250000],
  ['Tritanium',1000000],
]);

const materials=aggregateForgeMaterials([
  {materials:[
    {typeId:34,name:'Tritanium',quantity:100,cost:400,costPerUnit:4},
    {typeId:35,name:'Pyerite',quantity:10,cost:180,costPerUnit:18},
  ]},
  {materials:[
    {typeId:34,name:'Tritanium',quantity:50,cost:200,costPerUnit:4},
  ]},
]);
assert.equal(materials.length,2);
assert.equal(materials.find(row=>row.typeId===34).quantity,150);
assert.equal(materials.find(row=>row.typeId===34).cost,600);

const items=[
  {name:'Hulk',quantity:2,kind:'manufacturing',totalCost:1000,materials:[]},
  {name:'Kylixium',quantity:100,kind:'ore',orePayoutValue:2500,materials:[]},
  {name:'Mystery',quantity:1,kind:'unresolved',materials:[]},
];
const summary=forgeSummary(items,materials);
assert.equal(summary.buildableLines,1);
assert.equal(summary.oreLines,1);
assert.equal(summary.unresolvedLines,1);
assert.equal(summary.orePayoutValue,2500);
assert.equal(summary.materialTypes,2);

const share=sanitizeForgeShare({
  title:'  Hulk batch  ',
  status:'ready',
  notes:'ready to go',
  plan:{me:10,te:20,items,materials},
},{id:'u1',displayName:'John'});
assert.equal(share.title,'Hulk batch');
assert.equal(share.status,'ready');
assert.equal(share.owner.name,'John');
assert.equal(share.plan.items.length,3);
assert.equal(share.plan.summary.materialTypes,2);

console.log('JLR Forge tests passed.');

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

// Keep legacy Forge endpoints alive so already-shared build links do not break.
assert.match(server,/\/api\/forge\/plan/);
assert.match(server,/\/api\/forge\/share/);
assert.match(server,/api\.everef\.net\/v1\/industry\/cost/);

// The dashboard itself is appraisal-only now.
assert.match(app,/JLR APPRAISAL/);
assert.doesNotMatch(app,/BUILD PLANNER/);
assert.doesNotMatch(app,/BUILD BOARD/);
assert.match(index,/data-tab="forge" type="button">APPRAISAL</);
assert.match(app,/appraisalCalculate/);
assert.match(app,/event\.ctrlKey\|\|event\.metaKey/,'Ctrl/Cmd+Enter runs appraisal while normal Enter remains a newline');
assert.match(index,/app\.js\?v=2\.10\.0-appraisal1/,'Appraisal UI is cache-busted');
