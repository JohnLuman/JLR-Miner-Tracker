import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const window={},listeners={};
const document={hidden:true,addEventListener(name,fn){listeners[name]=fn},querySelectorAll(){return []}};
vm.runInNewContext(fs.readFileSync(new URL('../public/mining-scene.js',import.meta.url),'utf8'),{window,document});
const {kindFor,refresh}=window.JlrMiningScene;
const card=(...classes)=>({classList:{contains:name=>classes.includes(name)}});
assert.equal(kindFor(card()),'t3');
assert.equal(kindFor(card('map-field-node','tier-2')),'t2');
assert.equal(kindFor(card('ice-system-node')),'ice');
assert.equal(kindFor(card('a0-system-node')),'a0');
refresh();listeners.visibilitychange(); // No timer or animation-frame API is required.
console.log('Mining material routing and idle/hidden scene lifecycle passed.');
