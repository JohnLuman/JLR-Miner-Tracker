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
assert.match(server,/routeJumps\(originSystemId,row\.systemId\)/,'hot-zone rows include jump distance when location is available');

assert.match(tracker,/REGION HOT ZONES/,'Tracker UI includes Region Hot Zones');
assert.match(tracker,/id="trackerHotRegion"/,'Tracker UI has a region selector');
assert.match(tracker,/jlrTrackerHotRegion/,'selected region is remembered');
assert.match(tracker,/ESI region catalog \+ activity cache/,'regional snapshots distinguish ESI catalog data from cached activity');
assert.match(tracker,/automatic refresh every/,'regional snapshots explain the hourly refresh');
assert.doesNotMatch(tracker,/AUTO BOUNTY WATCH/,'Auto Bounty Watch is removed');
assert.doesNotMatch(tracker,/NEARBY ESS/,'Nearby ESS panel is removed');
assert.doesNotMatch(tracker,/CRAB WATCH/,'CRAB Watch is removed');
assert.doesNotMatch(tracker,/SYSTEM INTERFERENCE/,'System Interference panel is removed');
assert.doesNotMatch(tracker,/trackerEssHtml/,'ESS watch renderer is removed');
assert.doesNotMatch(tracker,/trackerInterferenceHtml/,'interference watch renderer is removed');
assert.doesNotMatch(server,/\/api\/companion\/tracker-map/,'unused public-map watch ingestion endpoint is removed');
assert.doesNotMatch(server,/trackerIntelIngestPublicMap/,'unused ESS/interference ingestion logic is removed');
assert.match(tracker,/trackerOverviewHtml\(losses,status,sourceUrl\)/,'Tracker renders Hot Zones and Heavy Fighter losses in one overview');
assert.match(trackerCss,/\.tracker-overview-grid\{display:grid;grid-template-columns:/,'Hot Zones and recent Heavy Fighter losses sit side by side on wide screens');
assert.match(trackerCss,/\.tracker-overview-grid>/,'paired overview scopes Hot Zones inside the intel workspace');
assert.doesNotMatch(tracker,/tracker-intel-valuebar/,'Hot Zones does not render misleading full-width red bars');
assert.match(trackerCss,/tracker-region-picker/,'region selector is styled');

assert.equal(pkg.version,'2.9.143','Hot Zones-only Tracker release is versioned');
assert.ok(index.includes('/tracker.css?v=2.9.143'),'browser loads Tracker intel CSS');
assert.ok(index.includes('/tracker.js?v=2.9.143'),'browser loads Tracker loader');
assert.ok(index.includes('/app.js?v=2.9.143'),'browser loads matching app release');
assert.match(trackerLoader,/tracker-core\.js\?v=2\.9\.142/,'Tracker core cache is busted');

assert.match(tracker,/TEST LOSS ALARM/,'Heavy Fighter Tracker exposes the redesigned local loss alarm test');
assert.doesNotMatch(tracker,/TEST JLR CUSTOM VOICE/,'Heavy Fighter alarm no longer depends on custom voice');
assert.match(trackerLoader,/Repeating two-tone Heavy Fighter alarm/,'loss alarm loops locally without TTS latency');
assert.match(trackerLoader,/ACKNOWLEDGE \/ STOP/,'loss alarm requires an explicit acknowledge/stop action');
assert.match(trackerLoader,/playFighterAlarmCycle\(context,generation\)/,'loss alarm repeats until acknowledged');

console.log('Tracker regional intel and loss-alarm tests passed.');
