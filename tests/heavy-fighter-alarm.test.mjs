import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {
  DEFAULT_HEAVY_FIGHTER_ALERT_MAX_AGE_MS,
  heavyFighterAlertFresh,
  reportableHeavyFighterVictim,
  buildSimulatedHeavyFighterLoss,
} from '../lib/heavy-fighter-alert.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const nowMs=Date.parse('2026-10-03T23:00:00.000Z');
const fresh=buildSimulatedHeavyFighterLoss({
  killmailId:900000000001,
  nowIso:new Date(nowMs-15_000).toISOString(),
  shipTypeId:12345,
  shipTypeName:'Test Heavy Fighter',
  systemId:30000001,
  systemName:'TEST-1',
  runId:'suite-1',
});
assert.equal(fresh.simulated,true);
assert.equal(fresh.live,true);
assert.equal(fresh.simulationRunId,'suite-1');
assert.equal(heavyFighterAlertFresh(fresh,nowMs),true,'fresh simulated loss should qualify for alerting');
assert.equal(heavyFighterAlertFresh({...fresh,receivedAt:new Date(nowMs-DEFAULT_HEAVY_FIGHTER_ALERT_MAX_AGE_MS-1).toISOString()},nowMs),false,'stale simulated loss must not alert');
assert.equal(heavyFighterAlertFresh({...fresh,receivedAt:new Date(nowMs+1000).toISOString()},nowMs),false,'future receivedAt must not alert');
assert.equal(reportableHeavyFighterVictim(fresh,1900696668),true,'test victim must pass normal non-INIT filter');
assert.equal(reportableHeavyFighterVictim({victim:{allianceId:1900696668}},1900696668),false,'INIT victim must remain filtered');

const [server,core,alarm]=await Promise.all([
  readFile(join(root,'server.mjs'),'utf8'),
  readFile(join(root,'public/tracker-core.js'),'utf8'),
  readFile(join(root,'public/tracker.js'),'utf8'),
]);
assert.match(server,/\/api\/tracker\/heavy-fighters\/test-loss/,'owner simulation endpoint is missing');
assert.match(server,/jlrOwnerAccess\(user\)/,'simulation endpoint must enforce JLR owner access');
assert.match(server,/sendTrackerEventForUser/,'simulated losses must be scoped to the owner account stream');
assert.match(core,/SIMULATE LOSS/,'owner test lab must expose a simulated-loss control');
assert.match(core,/window\.jlrTestAccess/,'test lab must be hidden unless owner test access is present');
assert.match(core,/handleLiveLoss/,'simulated stream events must travel through normal client loss handling');
assert.match(alarm,/simulated/,'alarm overlay must identify simulated events');
console.log('Heavy Fighter alarm simulation and owner-only test assertions passed.');
