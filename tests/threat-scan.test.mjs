import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parseThreatPaste, compactThreatStats, threatActivityLabels, fountainThreatTags, jlrThreatScore, threatIgnoreReason } from '../lib/threat-scan.mjs';

const local = parseThreatPaste([
  'FC Zoetrope',
  'Another Pilot\tExample Corp\tExample Alliance',
].join('\n'));
assert.deepEqual(local.names, ['FC Zoetrope', 'Another Pilot']);
assert.equal(local.shipNames.length, 0);

const largeLocalNames=Array.from({length:350},(_,index)=>`Large Scan Pilot ${String(index+1).padStart(3,'0')}`);
largeLocalNames[57]='Isanakka Oriki';
largeLocalNames[142]='Tamano Oilen';
const largeLocal=parseThreatPaste(largeLocalNames.join('\n'));
assert.equal(largeLocal.names.length,350);
assert(largeLocal.names.includes('Isanakka Oriki'));
assert(largeLocal.names.includes('Tamano Oilen'));

const dscan = parseThreatPaste([
  'Name\tType\tDistance',
  'Angry Miner\tHulk\t1,234 km',
  'Scout\tSabre\t2.4 AU',
  '900000000001\tCustom Name\tRedeemer\t450 km',
].join('\n'));
assert.deepEqual(dscan.names, []);
assert.deepEqual(dscan.shipNames, [
  { name: 'Hulk', count: 1 },
  { name: 'Sabre', count: 1 },
  { name: 'Redeemer', count: 1 },
]);

const dscanWithoutDistance = parseThreatPaste([
  'One Neutral',
  'Name\tType',
  'Hector Centauri\tHulk',
  'Barbaydos\tSabre',
].join('\n'));
assert.deepEqual(dscanWithoutDistance.names, ['One Neutral']);
assert.deepEqual(dscanWithoutDistance.shipNames, [
  { name: 'Hulk', count: 1 },
  { name: 'Sabre', count: 1 },
]);

const exported = parseThreatPaste('17715\tStabber Fleet Issue\t15 km');
assert.equal(exported.shipTypeIds.get(17715), 1);
assert.equal(exported.shipNames.length, 0);

const stats = compactThreatStats({
  dangerRatio: 56,
  gangRatio: 98,
  soloRatio: 2.2,
  shipsDestroyed: 50,
  shipsLost: 16,
  weeklyLabels: { awox: { shipsDestroyed: 1 } },
  rankings: { weekly: { all: { metrics: { shipsDestroyed: 11, shipsLost: 2, iskDestroyed: 813_674_585 } } } },
});
assert.equal(stats.weekly.shipsDestroyed, 11);
assert.equal(stats.soloRatio, 2.2);
assert.equal(stats.awoxCount, 1);
const tags = threatActivityLabels(stats, ['Sabre']);
assert(tags.some(tag => tag.label === 'AWOX'));
assert(tags.some(tag => tag.label === 'TACKLE'));
const legacyThreat=jlrThreatScore(stats,tags);
assert(legacyThreat > 0);
const outsideFountain=jlrThreatScore(stats,tags,{ready:true,kills7d:0,kills24h:0,finalBlows7d:0,losses7d:0,iskDestroyed7d:0,systems:[]});
const fountainTags=fountainThreatTags({ready:true,kills7d:8},['Arazu','Sabre','Redeemer']);
assert(fountainTags.some(tag=>tag.label==='FOUNTAIN RECON'));
assert(fountainTags.some(tag=>tag.label==='FOUNTAIN DICTOR'));
assert(fountainTags.some(tag=>tag.label==='FOUNTAIN BLOPS'));
const activeFountain=jlrThreatScore(stats,[...tags,...fountainTags],{
  ready:true,kills7d:8,kills24h:3,finalBlows7d:2,losses7d:1,iskDestroyed7d:8_000_000_000,
  systems:[30004618,30004619,30004620],lastKillAt:new Date().toISOString(),
});
assert(outsideFountain < legacyThreat);
assert(activeFountain > outsideFountain);

const ignoreOptions={
  ownIds:new Set([101]),
  standingData:{
    byOwner:{
      character:new Map([[102,10],[201,-10]]),
      corporation:new Map([[201,10],[301,10],[106,-10]]),
      alliance:new Map([[401,10]]),
    },
    memberCorporations:new Set([999]),
    memberAlliances:new Set([998]),
  },
};
assert.equal(threatIgnoreReason({id:101,corporation_id:999},ignoreOptions),'own');
assert.equal(threatIgnoreReason({id:102,corporation_id:999},ignoreOptions),'positive');
// A personal negative override must beat a lower-level corporation blue.
assert.equal(threatIgnoreReason({id:103,corporation_id:201},ignoreOptions),null);
assert.equal(threatIgnoreReason({id:104,alliance_id:301},ignoreOptions),'positive');
assert.equal(threatIgnoreReason({id:105,corporation_id:999},ignoreOptions),'positive');
// Character-target standings take priority over corporation-target standings.
assert.equal(threatIgnoreReason({id:106,corporation_id:201},ignoreOptions),null);
assert.equal(threatIgnoreReason({id:107,alliance_id:401},ignoreOptions),'positive');

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

assert.match(server,/const THREAT_FETCH_CONCURRENCY = 8/,'threat enrichment uses higher per-scan concurrency');
assert.match(server,/const THREAT_REMOTE_CONCURRENCY = 12/,'global threat enrichment is bounded across users');
assert.match(server,/const THREAT_ZKILL_TIMEOUT_MS = 5_500/,'zKill threat lookups have a hard latency budget');
assert.match(server,/async function threatUniverseIds/,'cold Local name resolution has a dedicated bounded fast path');
assert.match(server,/AbortSignal\.timeout\(4_500\)/,'cold Local name resolution cannot hold the first result indefinitely');
assert.match(server,/async function resolveThreatEntities/,'pilot and ship names share one cached resolver');
assert.match(server,/resolveThreatEntities\(parsed\.names,\(parsed\.shipNames\|\|\[\]\)\.map/,'one combined entity lookup serves Local and D-scan names');
assert.match(server,/const threatCharacterPromises = new Map\(\)/,'overlapping users dedupe per-pilot enrichment');
assert.match(server,/cachedPositiveStandingContactsForUser/,'quick results can use cached standings without waiting on a cold contacts refresh');
assert.match(server,/positiveStandings:cachedStandings,[\s\S]*fast:true/,'first threat response does not block on a fresh standings pull');
assert.match(server,/THREAT_SCAN_RESULT_CACHE_MS = 10 \* 60 \* 1000/,'exact repeated scans reuse complete results for ten minutes');
assert.match(server,/void savePvpDb\(\)\.catch/,'disk persistence no longer blocks full threat results');
assert.match(server,/performance:\{mode:fast\?'quick':'full'/,'threat responses expose server timing');
assert.match(app,/QUICK RESULTS READY/,'client labels the fast provisional result');
assert.match(app,/threatScanRenderSignature/,'identical background polls do not rebuild the full threat table');
assert.match(server,/Date\.now\(\)-Number\(running\.lastPartialAt\|\|0\)>=800/,'running scans periodically rebuild cheap partial results');
assert.match(server,/progress:\{[\s\S]*enriched:/,'background threat enrichment exposes progressive completion');
assert.match(app,/PROFILES READY/,'client shows progressive profile completion');
assert.match(app,/threatScanPollCount<=8\?700/,'client checks quickly for early enrichment completion');
assert.match(app,/threatScanPollCount<60/,'client keeps following long enrichments without the old 30-second cutoff');
assert.match(index,/\/app\.js\?v=2\.10\.\d+-threat-fast1/,'browser receives the optimized threat client');

const threatStyles=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
assert.match(app,/class="threat-settings"/,'Threat Scan filters live in a compact settings control');
assert.doesNotMatch(app,/class="glass threat-ignore-card"/,'large ignored-characters panel is removed from the main flow');
assert.match(app,/id="threatClearScan"/,'Threat Scan has a one-click clear text control');
assert.match(app,/threatScanText=''/,'clear text resets the pasted scan state');
assert.match(threatStyles,/\.threat-input-card textarea\{[\s\S]*?min-height:138px/,'Threat Scan paste box is materially taller');
assert.match(threatStyles,/\.threat-input-card textarea\{[\s\S]*?font-size:11px/,'Threat Scan paste text is readable');
assert.match(threatStyles,/\.threat-table-v2\{font-size:10px\}/,'Threat Scan result rows use a larger readable baseline');
console.log('Threat scanner regression passed');
