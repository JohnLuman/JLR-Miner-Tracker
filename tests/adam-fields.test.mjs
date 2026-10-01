import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveAdamSystem, answerAdamFieldQuestion } from '../lib/adam-fields.mjs';

const at = Date.parse('2026-10-01T03:33:00Z');
const names = ['B170-R', 'RP2-OQ', 'APM-6K'];
const context = { currentTab: 'fields', selectedSystem: 'RP2-OQ' };
const scans = { 'B170-R': { lastScanAt: new Date(at - 5 * 60_000).toISOString(), due: false, source: 'probe-scan', t3: { detected: true }, ledger: { needsScan: true, lastActivityAt: new Date(at - 60_000).toISOString() } } };
const ask = (question, extra = {}) => answerAdamFieldQuestion({ question, names, scans, fields: { 'B170-R': { status: 'picked' } }, context, at, ...extra });

assert.equal(resolveAdamSystem('b170 needs update?', names).system, 'B170-R');
assert.equal(resolveAdamSystem('B170R', names).system, 'B170-R');
assert.equal(resolveAdamSystem('APM6K status', names).system, 'APM-6K');
assert.equal(resolveAdamSystem('update', names).system, null);
assert.equal(ask('b170 needs update?').focusSystem, 'B170-R', 'explicit shorthand beats the selected RP2-OQ card');
assert.equal(ask('b170 needs update?').needsScan, false, 'recent saved scan suppresses post-scan ledger warnings for one hour');
assert.match(ask('b170 needs update?').text, /5 minutes ago/);
assert.match(ask('b170 needs update?').text, /marked picked/);
assert.equal(ask('when was b170 last updated?').topic, 'field-scan', 'status question is answered before nearest-system intent');
assert.equal(ask('b170 needs udpate?').needsScan, false);
assert.equal(ask('b170 needs update?', { at: at + 12 * 60 * 60_000 }).needsScan, true);
assert.equal(ask('b170 needs update?', { at: at + 65 * 60_000 }).needsScan, true, 'new mining evidence after cooldown');
assert.equal(ask('b170 needs update?', { scans: {} }).lastScanAt, undefined);
assert.match(ask('b170 needs update?', { scans: {} }).text, /do not have a valid saved scan/);
assert.equal(ask('closest system needing an update'), null, 'navigation is not hijacked');
assert.equal(ask('update the app'), null);
assert.equal(ask('b17 needs update?', { names: [...names, 'B17Z-X'] }).topic, 'field-clarify');
assert.equal(ask('B170-R needs update?', { names: [...names, 'B170-XX'] }).focusSystem, 'B170-R', 'full names beat prefix ambiguity');
const recent = { ...context, recentActions: [{ kind: 'scan-updated', system: 'B170-R', at: at - 5 * 60_000 }] };
assert.equal(ask('did it work?', { context: recent }).focusSystem, 'B170-R');
assert.equal(ask('i already updated it', { context: recent }).focusSystem, 'B170-R');
assert.match(ask('did it work?', { context: recent, scans: {} }).text, /do not have a valid saved scan/, 'client actions are not proof of a committed scan');
assert.equal(ask('this system needs update?').focusSystem, 'RP2-OQ');

const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const route = server.slice(server.indexOf("url.pathname==='/api/tracker/brain/ask'"));
assert.ok(route.indexOf('answerAdamFieldQuestion') < route.indexOf('trackerSupport.resolveQuestion'), 'saved field state takes priority over conversational support overrides');
console.log('Adam field shorthand, committed scans, freshness, ambiguity and contextual confirmations passed.');
