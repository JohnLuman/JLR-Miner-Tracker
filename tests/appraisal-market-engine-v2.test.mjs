import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sanitizeAppraisalShare} from '../lib/appraisal/appraisal.mjs';

const supportServer=fs.readFileSync(new URL('../services/tracker-support/server.mjs',import.meta.url),'utf8');
const supportClient=fs.readFileSync(new URL('../lib/tracker-support-client.mjs',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const enhance=fs.readFileSync(new URL('../public/appraisal-enhance.js',import.meta.url),'utf8');
const shareEnhance=fs.readFileSync(new URL('../public/appraisal-share-enhance.js',import.meta.url),'utf8');

assert.match(supportServer,/APPRAISAL_PRICE_FILE/,'Support has persistent Appraisal snapshot storage');
assert.match(supportServer,/\/v1\/appraisal\/prices\/get/);
assert.match(supportServer,/\/v1\/appraisal\/prices\/put/);
assert.match(supportServer,/saveAppraisalPriceSnapshots/);
assert.match(supportServer,/APPRAISAL_PRICE_RETAIN_MS/);
assert.match(supportServer,/appraisalDecisionIntel/);
assert.match(supportServer,/buyBookDays/);
assert.match(supportServer,/spreadPct/);

assert.match(supportClient,/appraisalPriceSnapshots/);
assert.match(supportClient,/rememberAppraisalPriceSnapshots/);
assert.match(supportClient,/marketDataStale/);
assert.match(supportClient,/valueAt100/);

assert.match(server,/trackerSupport\.appraisalPriceSnapshots/,'native Appraisal reads the shared Support snapshot cache');
assert.match(server,/trackerSupport\.rememberAppraisalPriceSnapshots/,'native Appraisal publishes fresh prices to Support');
assert.match(server,/support-stale/,'native Appraisal can fall back to retained stale prices when ESI is unavailable');
assert.match(server,/appraisalMarketDataSummary/);
assert.match(server,/marketDataSource/);
assert.match(server,/refineItems\.push/);

assert.match(enhance,/DECISION ENGINE/);
assert.match(enhance,/RAW vs COMPRESSED vs REFINE/);
assert.match(enhance,/LIQUIDITY \+ HISTORY/);
assert.match(enhance,/BOOK DAYS B\/S/);
assert.match(enhance,/JLR SHARED CACHE/);
assert.match(enhance,/STALE FALLBACK/);
assert.match(shareEnhance,/MARKET DATA/);

const appraisal={
  generatedAt:'2026-09-29T22:00:00Z',
  source:'jlr-native-esi',
  market:{id:2,name:'Jita 4-4'},
  pricing:'split',
  pricingVariant:'immediate',
  items:[{
    resolved:true,typeId:34,name:'Tritanium',amount:100,totalVolume:1,
    buyOrderCount:3,buyVolume:1000,sellOrderCount:4,sellVolume:2000,
    buy:5,split:5.5,sell:6,buyTotal:500,splitTotal:550,sellTotal:600,
    marketDataAt:'2026-09-29T21:59:00Z',marketDataAgeMs:60000,
    marketDataStale:false,marketDataSource:'support-cache',
  }],
  marketData:{
    generatedAt:'2026-09-29T22:00:00Z',freshMs:300000,rows:1,staleCount:0,freshCount:1,
    oldestAt:'2026-09-29T21:59:00Z',newestAt:'2026-09-29T21:59:00Z',maxAgeMs:60000,
    sourceCounts:{'support-cache':1},
  },
  refine:{
    kind:'ore',defaultRate:.9,selectedRate:.88,recognizedLines:1,recognizedUnits:100,
    buyAt100:800,eligibleBuy:500,eligibleSplit:550,eligibleSell:600,pricingBasis:'Jita mineral buy',
    items:[{typeId:34,name:'Tritanium',amount:100,buyTotal:500,splitTotal:550,sellTotal:600,valueAt100:800}],
    minerals:[],
  },
};
const share=sanitizeAppraisalShare({title:'Market Engine Test',appraisal},{id:'u1',displayName:'Pilot'});
assert.equal(share.appraisal.marketData.staleCount,0);
assert.equal(share.appraisal.marketData.sourceCounts['support-cache'],1);
assert.equal(share.appraisal.items[0].marketDataSource,'support-cache');
assert.equal(share.appraisal.refine.items[0].valueAt100,800);

console.log('JLR Appraisal market-engine v2 tests passed.');
