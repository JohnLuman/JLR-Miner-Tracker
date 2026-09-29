import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {JlrSdeCatalog,sdeCompressionCandidate} from '../services/tracker-support/sde-catalog.mjs';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jlr-sde-test-'));
const dbPath=path.join(dir,'catalog.sqlite');
const db=new DatabaseSync(dbPath);
db.exec(`
CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE types(
 type_id INTEGER PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL,group_id INTEGER,market_group_id INTEGER,
 volume REAL NOT NULL DEFAULT 0,packaged_volume REAL NOT NULL DEFAULT 0,portion_size INTEGER NOT NULL DEFAULT 1,
 published INTEGER NOT NULL DEFAULT 0,base_price REAL
);
CREATE INDEX idx_types_name_key ON types(name_key);
CREATE TABLE compression(raw_type_id INTEGER PRIMARY KEY,compressed_type_id INTEGER NOT NULL);
CREATE TABLE materials(type_id INTEGER NOT NULL,material_type_id INTEGER NOT NULL,quantity INTEGER NOT NULL,PRIMARY KEY(type_id,material_type_id));
CREATE TABLE groups(group_id INTEGER PRIMARY KEY,category_id INTEGER,name TEXT NOT NULL DEFAULT '');
CREATE TABLE categories(category_id INTEGER PRIMARY KEY,name TEXT NOT NULL DEFAULT '');
CREATE TABLE market_groups(market_group_id INTEGER PRIMARY KEY,parent_group_id INTEGER,name TEXT NOT NULL DEFAULT '');
`);
db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('build_number','3552227');
db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('release_date','2026-09-28T11:08:00Z');
db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('imported_at','2026-09-29T22:00:00Z');
db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('type_count','4');
db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('compression_count','1');
db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('material_count','2');
db.prepare('INSERT INTO groups(group_id,category_id,name) VALUES(?,?,?)').run(450,25,'Asteroid');
db.prepare('INSERT INTO categories(category_id,name) VALUES(?,?)').run(25,'Asteroid');
db.prepare('INSERT INTO market_groups(market_group_id,parent_group_id,name) VALUES(?,?,?)').run(512,null,'Arkonor');
const ins=db.prepare('INSERT INTO types(type_id,name,name_key,group_id,market_group_id,volume,packaged_volume,portion_size,published,base_price) VALUES(?,?,?,?,?,?,?,?,?,?)');
ins.run(22,'Arkonor','arkonor',450,512,16,16,100,1,1000);
ins.run(28367,'Compressed Arkonor','compressed arkonor',450,512,0.16,0.16,100,1,1000);
ins.run(34,'Tritanium','tritanium',18,18,0.01,0.01,1,1,1);
ins.run(35,'Pyerite','pyerite',18,18,0.01,0.01,1,1,1);
db.prepare('INSERT INTO compression(raw_type_id,compressed_type_id) VALUES(?,?)').run(22,28367);
db.prepare('INSERT INTO materials(type_id,material_type_id,quantity) VALUES(?,?,?)').run(22,34,22000);
db.prepare('INSERT INTO materials(type_id,material_type_id,quantity) VALUES(?,?,?)').run(22,35,2500);
db.close();

const catalog=new JlrSdeCatalog({dbFile:dbPath});
const status=catalog.status();
assert.equal(status.ready,true);
assert.equal(status.buildNumber,3552227);

const resolved=catalog.resolveNames(['Arkonor','Compressed Arkonor','No Such Thing']);
assert.equal(resolved.items.length,2);
assert.deepEqual(resolved.missing,['No Such Thing']);

const matched=catalog.matchQuestion('What does Arkonor refine into?');
assert.equal(matched.items[0].name,'Arkonor');
const compressedMatch=catalog.matchQuestion('Is Compressed Arkonor worth more than Arkonor?');
assert.equal(compressedMatch.items[0].name,'Compressed Arkonor','longest embedded item name wins');

const raw=resolved.items.find(row=>row.name==='Arkonor');
const compressed=resolved.items.find(row=>row.name==='Compressed Arkonor');
assert.equal(raw.compressedTypeId,28367);
assert.equal(raw.compressedName,'Compressed Arkonor');
assert.equal(compressed.rawTypeId,22);
assert.equal(compressed.rawName,'Arkonor');
assert.equal(raw.categoryName,'Asteroid');
assert.equal(raw.marketGroupName,'Arkonor');
assert.deepEqual(sdeCompressionCandidate(raw),{
  sourceTypeId:22,sourceName:'Arkonor',targetTypeId:28367,targetName:'Compressed Arkonor',direction:'compress',
});
assert.equal(sdeCompressionCandidate(compressed).direction,'decompress');

const materials=catalog.materials([22]);
assert.equal(materials.items.length,1);
assert.equal(materials.items[0].portionSize,100);
assert.deepEqual(materials.items[0].materials.map(row=>[row.name,row.quantity]),[['Tritanium',22000],['Pyerite',2500]]);

fs.rmSync(dir,{recursive:true,force:true});
console.log('JLR SDE catalog tests passed.');
