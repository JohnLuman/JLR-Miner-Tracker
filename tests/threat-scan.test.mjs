import assert from 'node:assert/strict';
import { parseThreatPaste, compactThreatStats, threatActivityLabels, jlrThreatScore, threatIgnoreReason } from '../lib/threat-scan.mjs';

const local = parseThreatPaste([
  'FC Zoetrope',
  'Another Pilot\tExample Corp\tExample Alliance',
].join('\n'));
assert.deepEqual(local.names, ['FC Zoetrope', 'Another Pilot']);
assert.equal(local.shipNames.length, 0);

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
assert(jlrThreatScore(stats, tags) > 0);

const ignoreOptions={
  ownIds:new Set([101]),
  standingSets:{
    character:new Set([102]),
    corporation:new Set([201]),
    alliance:new Set([301]),
    faction:new Set(),
  },
};
assert.equal(threatIgnoreReason({id:101,corporation_id:999},ignoreOptions),'own');
assert.equal(threatIgnoreReason({id:102,corporation_id:999},ignoreOptions),'positive');
assert.equal(threatIgnoreReason({id:103,corporation_id:201},ignoreOptions),'positive');
assert.equal(threatIgnoreReason({id:104,alliance_id:301},ignoreOptions),'positive');
assert.equal(threatIgnoreReason({id:105,corporation_id:999},ignoreOptions),null);

console.log('Threat scanner regression passed');
