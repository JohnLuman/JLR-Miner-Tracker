import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseAppraisalPaste} from '../lib/appraisal/paste.mjs';
import {archivedBuildSharePublic,migrateLegacyBuildShares} from '../lib/appraisal/legacy-share.mjs';

const pasted=parseAppraisalPaste('10 Hulk\nCompressed Arkonor\t27,512\tOre');
assert.equal(pasted.valid,true);
assert.deepEqual(pasted.rows.map(({name,quantity})=>[name,quantity]),[
  ['Hulk',10],['Compressed Arkonor',27512],
]);

const old={id:'old',token:'older-token',title:'Hulk batch',status:'ready',
  plan:{items:[{name:'Hulk',quantity:10}],materials:[],summary:{buildableLines:1}}};
const migrated=migrateLegacyBuildShares({
  forge:{shares:{old}},
  appraisals:{legacyBuildShares:{newer:{id:'newer',token:'new-token'}}},
});
assert.equal(Object.keys(migrated).length,2,'migration keeps old and newly archived links');
assert.equal(archivedBuildSharePublic(migrated.old).plan.summary.buildableLines,1);
assert.equal(archivedBuildSharePublic(migrated.old).archived,true);
assert.equal(archivedBuildSharePublic({...old,status:'unknown'}).status,'planning');

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const enhance=fs.readFileSync(new URL('../public/appraisal-enhance.js',import.meta.url),'utf8');
assert.match(server,/migrateLegacyBuildShares\(parsed\)/);
assert.match(server,/delete parsed\.forge/);
assert.match(server,/GET'&&url\.pathname\.startsWith\('\/api\/forge\/share\/'\)/);
assert.doesNotMatch(server,/POST'&&url\.pathname(?:===|\.match\().*\/api\/forge\//);
assert.match(server,/appraisal-legacy-share\.html/);
assert.match(app,/appraisal\.id='appraisalPanel'/);
assert.match(enhance,/#appraisalPanel \.appraisal-panel/);
assert.match(enhance,/\.appraisal-actions/);
console.log('Appraisal paste and archived-share migration passed.');
