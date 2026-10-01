import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { latestA0Site, preserveA0ConfirmationHistory } from '../lib/a0-active-site.mjs';

const reports = preserveA0ConfirmationHistory({
  'L-1SW8': { detected: true, lastCheckedAt: '2026-10-01T03:00:00Z', distanceLy: 4.67 },
  'CHA2-Q': { detected: true, lastCheckedAt: '2026-10-01T03:10:00Z', distanceLy: 3 },
});
assert.equal(latestA0Site(reports).system, 'CHA2-Q');
assert.equal(reports['L-1SW8'].lastDetectedAt, '2026-10-01T03:00:00Z');
assert.equal(reports['L-1SW8'].detected, true, 'historical scan evidence is retained');

const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const begin = server.indexOf('function a0PublicFields() {');
const end = server.indexOf('\n}', begin) + 2;
const runtime = { state: { market: { a0Reports: reports, a0Fields: [] } }, latestA0Site, TITAN_BRIDGE_RANGE_LY: 6, A0_REPORT_TTL: 12 * 60 * 60_000, Date };
vm.runInNewContext(server.slice(begin, end) + '\nthis.rows=a0PublicFields;', runtime);
let rows = runtime.rows();
assert.equal(rows.find(row => row.system === 'L-1SW8').scan.superseded, true);
assert.equal(rows.find(row => row.system === 'L-1SW8').scan.detected, false);
assert.equal(rows.find(row => row.system === 'CHA2-Q').scan.detected, true);
assert.equal(rows.filter(row => row.scan.detected).length, 1);

reports['CHA2-Q'].detected = false;
reports['CHA2-Q'].lastCheckedAt = '2026-10-01T03:20:00Z';
assert.equal(latestA0Site(reports).active, false);
assert.equal(runtime.rows().filter(row => row.scan.detected).length, 0, 'clearing the current site never resurrects its predecessor');
reports['L-1SW8'].lastDetectedAt = reports['L-1SW8'].lastCheckedAt = '2026-10-01T03:30:00Z';
assert.equal(latestA0Site(reports).system, 'L-1SW8', 'a newly confirmed site can reappear');
assert.equal(latestA0Site({ unknown: { detected: true, lastCheckedAt: 'bad' } }), null);
assert.equal(latestA0Site({}), null);
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
assert.match(app, /entry.kind==='a0'&&!entry.row.scan\?\.superseded/);
assert.match(app, /const stateLine=scan.superseded\?'PREVIOUS SITE':due\?'SCAN DUE'/);
assert.doesNotMatch(app, /sys-ore">BLUE '\+esc\(spectral\)/);
assert.match(app, /boardScanLine\(row.system,\{lastScanAt:scan.lastCheckedAt,due\}\)/, 'A0 age and status use the same report');
console.log('Single A0 active site, history retention, clear-report suppression and card text passed.');
