import assert from 'node:assert/strict';
import {weightedEdgePrice,nativeAppraisalPriceSet} from '../lib/appraisal/native-market.mjs';

const buys=[
  {price:100,volume_remain:10},
  {price:90,volume_remain:90},
];
const sells=[
  {price:110,volume_remain:10},
  {price:120,volume_remain:90},
];

assert.equal(weightedEdgePrice(buys,{side:'buy',fraction:.05}),100);
assert.equal(weightedEdgePrice(sells,{side:'sell',fraction:.05}),110);

const immediate=nativeAppraisalPriceSet({buyOrders:buys,sellOrders:sells,variant:'immediate'});
assert.equal(immediate.buy,100);
assert.equal(immediate.sell,110);
assert.equal(immediate.split,105);
assert.equal(immediate.buyOrderCount,2);
assert.equal(immediate.sellOrderCount,2);
assert.equal(immediate.buyVolume,100);
assert.equal(immediate.sellVolume,100);

const top5=nativeAppraisalPriceSet({buyOrders:[
  {price:100,volume_remain:2},
  {price:90,volume_remain:98},
],sellOrders:[
  {price:110,volume_remain:2},
  {price:120,volume_remain:98},
],variant:'top5percent'});
assert.equal(top5.buy,96);
assert.equal(top5.sell,114);
assert.equal(top5.split,105);

console.log('Native Appraisal pricing math tests passed.');
