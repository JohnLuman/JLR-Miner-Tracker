import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const tracker=fs.readFileSync(new URL('../public/tracker-core.js',import.meta.url),'utf8');
const trackerCss=fs.readFileSync(new URL('../public/tracker.css',import.meta.url),'utf8');
const trackerLoader=fs.readFileSync(new URL('../public/tracker.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.match(server,/TRACKER_INTEL_DEFAULT_REGION_ID = 10000058/,'Fountain is the default hot-zone region');
assert.match(server,/TRACKER_INTEL_HOT_CACHE_MS = 60 \* 60 \* 1000/,'hot-zone snapshots refresh every hour');
assert.match(server,/regionCatalog:\s*\[\]/,'Tracker persists an ESI region catalog');
assert.match(server,/regionHotZones:\s*\{\}/,'Tracker persists per-region hot-zone snapshots');
assert.match(server,/async function trackerIntelRegionCatalog/,'all EVE regions are discovered through ESI');
assert.match(server,/universe\/regions\/\?datasource=tranquility/,'region catalog uses ESI');
assert.match(server,/async function trackerIntelRegionById/,'selected regions are expanded to their systems');
assert.match(server,/refreshTrackerIntelRegionalCaches/,'cached regions have a background refresh loop');
assert.match(server,/TRACKER_INTEL_REGION_CATALOG_MS = 60 \* 60 \* 1000/,'the ESI region catalog refreshes hourly');
assert.match(server,/trackerIntelRegionCatalog\(\{force:true\}\)/,'the hourly background pass refreshes the full ESI region list');
assert.match(server,/url\.searchParams\.get\('regionId'\)/,'Tracker intel API accepts a selected region');
assert.match(server,/universe\/system_kills/,'regional hot zones use public ESI system activity');
assert.match(server,/zkillboard\.com\/api\/losses\/regionID/,'regional hot zones use regional zKill losses');
assert.match(server,/trackerIntelCurrentLocation/,'Tracker uses a linked toon location for jump distance when available');
assert.match(server,/routeJumps\(originSystemId,row\.systemId\)/,'automatic observations include jump distance');
assert.match(server,/entry\?\.source==='eve-client-public'/,'ESS and interference lists only accept automatic public-client observations');
assert.doesNotMatch(server,/url\.pathname==='\/api\/tracker\/intel\/report'/,'manual Tracker intel reporting endpoint is removed');

assert.match(tracker,/REGION HOT ZONES/,'Tracker UI includes Region Hot Zones');
assert.match(tracker,/id="trackerHotRegion"/,'Tracker UI has a region selector');
assert.match(tracker,/jlrTrackerHotRegion/,'selected region is remembered');
assert.match(tracker,/ESI region catalog \+ activity cache/,'regional snapshots distinguish ESI catalog data from cached activity');
assert.match(tracker,/automatic refresh every/,'regional snapshots explain the hourly refresh');
assert.match(tracker,/NEARBY ESS/,'Tracker UI includes Nearby ESS');
assert.match(tracker,/AUTO BOUNTY WATCH/,'ESS card is automatic-only');
assert.match(tracker,/SYSTEM INTERFERENCE/,'Tracker UI includes System Interference');
assert.match(tracker,/Signal interference ['"]\+direction\+['"] in/,'automatic interference value changes can produce an Adam ping');
assert.doesNotMatch(tracker,/REPORT CURRENT SYSTEM/,'manual ESS entry is removed');
assert.doesNotMatch(tracker,/PING CURRENT SYSTEM/,'manual interference entry is removed');
assert.match(tracker,/live ESS bank values do not/,'ESS UI does not falsely attribute client data to ESI');
assert.match(tracker,/Companion public F10 map feed/,'interference UI identifies its client-map source');
assert.match(tracker,/data-tracker-since/,'interference rows expose a live active-time clock');
assert.match(tracker,/data-tracker-until/,'ESS rows can expose a live payout clock when supplied');
assert.match(tracker,/Math\.abs\(delta\)>=0\.1/,'armed Tracker alerts on meaningful interference changes in either direction');
assert.match(server,/\/api\/companion\/tracker-map/,'Companion has an authenticated public-map ingestion route');
assert.match(server,/publicMapCollector/,'public client-map collector heartbeat is persisted');
assert.match(trackerCss,/tracker-intel-grid/,'Tracker intel panels are styled');
assert.match(trackerCss,/tracker-region-picker/,'region selector is styled');

assert.equal(pkg.version,'2.9.135','Tracker regional intel release is versioned');
assert.ok(index.includes('/tracker.css?v=2.9.135'),'browser loads Tracker intel CSS');
assert.ok(index.includes('/tracker.js?v=2.9.135'),'browser loads Tracker loader');
assert.ok(index.includes('/app.js?v=2.9.135'),'browser loads matching app release');
assert.match(trackerLoader,/tracker-core\.js\?v=2\.9\.135/,'Tracker core cache is busted');

console.log('Tracker regional intel tests passed.');
