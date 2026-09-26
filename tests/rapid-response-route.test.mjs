import assert from 'node:assert/strict';
import { chooseRapidResponseRoutes, wandererRiskPenalty, wandererWarnings } from '../lib/rapid-response-route.mjs';

const whA = {id:'A',sourceId:1,targetId:2};
const whB = {id:'B',sourceId:3,targetId:4};

{
  const routes = chooseRapidResponseRoutes([
    {key:'gate',transitions:9,gateJumps:9,wormholes:[],wormholeCount:0,riskPenalty:0},
    {key:'a-fast',transitions:4,gateJumps:3,wormholes:[whA],wormholeCount:1,riskPenalty:0},
    {key:'a-backup',transitions:5,gateJumps:4,wormholes:[whA],wormholeCount:1,riskPenalty:0},
    {key:'b',transitions:6,gateJumps:5,wormholes:[whB],wormholeCount:1,riskPenalty:0},
  ]);
  assert.deepEqual(routes.map(row=>row.key), ['a-fast','b'], 'route 2 should prefer an independent wormhole path');
}

{
  const routes = chooseRapidResponseRoutes([
    {key:'same-1',transitions:4,gateJumps:3,wormholes:[whA],wormholeCount:1,riskPenalty:0},
    {key:'same-2',transitions:5,gateJumps:4,wormholes:[whA],wormholeCount:1,riskPenalty:0},
  ]);
  assert.deepEqual(routes.map(row=>row.key), ['same-1','same-2'], 'falls back to the next route when no independent route exists');
}

{
  const routes = chooseRapidResponseRoutes([
    {key:'riskier',transitions:4,gateJumps:3,wormholes:[whA],wormholeCount:1,riskPenalty:5},
    {key:'healthier',transitions:4,gateJumps:3,wormholes:[whB],wormholeCount:1,riskPenalty:0},
  ]);
  assert.equal(routes[0].key, 'healthier', 'equal-length routes should prefer healthier connections');
}


{
  const routes = chooseRapidResponseRoutes([
    {key:'all-live',systemIds:[1,2,3],transitions:2,gateJumps:2,wormholes:[],wormholeCount:0,riskPenalty:0},
    {key:'gate',systemIds:[1,2,3],transitions:2,gateJumps:2,wormholes:[],wormholeCount:0,riskPenalty:0},
    {key:'alternate',systemIds:[1,4,3],transitions:2,gateJumps:2,wormholes:[],wormholeCount:0,riskPenalty:0},
  ]);
  assert.equal(routes.length, 2, 'identical paths should be deduplicated');
  assert.deepEqual(routes.map(row=>row.systemIds), [[1,2,3],[1,4,3]]);
}

assert.equal(wandererRiskPenalty({mass_status:2,time_status:1,locked:true}), 10);
assert.deepEqual(wandererWarnings({mass_status:2,time_status:1,locked:true}), ['mass critical','about 1h or less','locked']);

console.log('rapid response route tests passed');
