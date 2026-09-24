import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.ok((app.match(/\\badam\\b/g)||[]).length>=2,'partial and final speech transcripts listen for Adam');
assert.ok(!app.includes('/\\btracker\\b/.exec(lower)'),'Tracker is no longer accepted as the wake word');
assert.ok(app.includes("replace(/^adam[\\s,.:;-]*/,'')"),'Adam is stripped from the start of a spoken command');
assert.ok(!app.includes("replace(/^tracker[\\s,.:;-]*/,'')"),'old Tracker command prefix is removed');
assert.ok(app.includes('Try: “Adam, how much have I made this hour?”'),'Adam examples use Adam');
assert.ok(app.includes('waiting for “Adam”'),'Adam mic hint names Adam');
assert.ok(server.includes('wake word Adam'),'server help describes Adam as the wake word');
assert.ok(server.includes('say adam'),'server voice-help intent recognizes questions about saying Adam');

assert.equal(pkg.version,'2.9.135','package version is the Adam wake-word release');
assert.ok(server.includes("version:'2.9.135'"),'server public version is 2.9.135');
assert.ok(index.includes('/app.js?v=2.9.135'),'browser cachebuster loads the Adam build');
assert.ok(index.includes('data-tab="brain" type="button">ADAM</button>'),'Brain tab is presented as Adam');
assert.ok(app.includes('ADAM // TRACKER OPERATIONS ASSISTANT'),'Adam is the user-facing assistant identity');
assert.ok(app.includes('TALK TO ADAM'),'voice controls use Adam naming');

console.log('Adam wake-word regression tests passed.');
