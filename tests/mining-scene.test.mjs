import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const window={matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(){}};
const document={addEventListener(){},hidden:true};
vm.runInNewContext(fs.readFileSync(new URL('../public/mining-scene.js',import.meta.url),'utf8'),{window,document});
const {frame,period}=window.JlrMiningScene;
assert.equal(frame(0),0);
assert.equal(frame(period-1),47);
assert.equal(frame(period),0,'one full turn meets the start without a rotation reset');
assert.equal(frame(period*5+period/2),24);
assert.equal(frame(period/2,true),0,'reduced motion freezes the scene');
window.JlrMiningScene.refresh(); // Hidden tabs must not schedule animation work.
console.log('Mining scene loop, full-turn timing, reduced motion and hidden-tab suspension passed.');
