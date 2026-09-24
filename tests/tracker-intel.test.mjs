import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const tracker=fs.readFileSync(new URL('../public/tracker-core.js',import.meta.url),'utf8');
const trackerCss=fs.readFileSync(new URL('../public/tracker.css',import.meta.url),'utf8');
const trackerLoader=fs.readFileSync(new URL('../public/tracker.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.match(server,/trackerIntel:\s*\{ essReports: \{\}, interferenceReports: \{\}, hotZoneHistory: \[\] \}/,'Tracker intel state is persisted');
assert.match(server,/\/api\/tracker\/intel'/,'Tracker intel snapshot API exists');
assert.match(server,/\/api\/tracker\/intel\/report'/,'Tracker intel report API exists');
assert.match(server,/universe\/system_kills/,'region hot zones use public ESI system activity');
assert.match(server,/zkillboard\.com\/api\/losses\/regionID/,'region hot zones use regional zKill losses');
assert.match(server,/trackerIntelCurrentLocation/,'Tracker intel follows a linked toon location');
assert.match(server,/routeJumps\(location\.systemId,row\.systemId\)/,'reported intel includes jump distance');
assert.match(server,/kind==='ess'/,'ESS reports are supported');
assert.match(server,/kind==='interference'/,'interference reports are supported');

assert.match(tracker,/REGION HOT ZONES/,'Tracker UI includes Region Hot Zones');
assert.match(tracker,/NEARBY ESS/,'Tracker UI includes Nearby ESS');
assert.match(tracker,/SYSTEM INTERFERENCE/,'Tracker UI includes System Interference');
assert.match(tracker,/jlrTrackerHotMode/,'hot-zone mode is remembered');
assert.match(tracker,/REPORT CURRENT SYSTEM/,'ESS report uses current-system location');
assert.match(tracker,/PING CURRENT SYSTEM/,'interference report uses current-system location');
assert.match(tracker,/Signal interference increased in/,'interference increases can produce an Adam ping');
assert.match(trackerCss,/tracker-intel-grid/,'Tracker intel panels are styled');

assert.equal(pkg.version,'2.9.132','Tracker intel release is versioned');
assert.ok(index.includes('/tracker.css?v=2.9.132'),'browser loads Tracker intel CSS');
assert.ok(index.includes('/tracker.js?v=2.9.132'),'browser loads Tracker loader');
assert.ok(index.includes('/app.js?v=2.9.132'),'browser loads matching app release');
assert.match(trackerLoader,/tracker-core\.js\?v=2\.9\.131/,'Tracker core cache is busted');

console.log('Tracker intel add-on tests passed.');
