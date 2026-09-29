import fs from 'node:fs';
import assert from 'node:assert/strict';
import { appraisalSummary, normalizeJaniceAppraisal, sanitizeAppraisalShare } from '../lib/appraisal/appraisal.mjs';

const payload={
  created:'2026-09-29T08:00:00Z',
  market:{id:2,name:'Jita 4-4'},
  pricing:'split',
  pricingVariant:'immediate',
  items:[
    {
      amount:2,buyOrderCount:10,buyVolume:100,sellOrderCount:8,sellVolume:80,totalVolume:200,
      itemType:{eid:34,name:'Tritanium',volume:100,packagedVolume:100},
      effectivePrices:{buyPrice:4,splitPrice:5,sellPrice:6,buyPriceTotal:8,splitPriceTotal:10,sellPriceTotal:12},
    },
    {
      amount:1,totalVolume:50,itemType:{eid:35,name:'Pyerite',volume:50,packagedVolume:50},
      effectivePrices:{buyPrice:10,splitPrice:12,sellPrice:14,buyPriceTotal:10,splitPriceTotal:12,sellPriceTotal:14},
    },
  ],
};
const normalized=normalizeJaniceAppraisal(payload);
assert.equal(normalized.items.length,2);
assert.equal(normalized.summary.buy,18);
assert.equal(normalized.summary.split,22);
assert.equal(normalized.summary.sell,26);
assert.equal(normalized.summary.value,22);
assert.equal(normalized.summary.volume,250);

const buySummary=appraisalSummary(normalized.items,'buy');
assert.equal(buySummary.value,18);

normalized.refine={
  kind:'ore',
  defaultRate:.90628105568,
  selectedRate:.88,
  recognizedLines:1,
  recognizedUnits:100,
  buyAt100:1500,
  eligibleBuy:1200,
  eligibleSplit:1300,
  eligibleSell:1400,
  pricingBasis:'Jita mineral buy',
  minerals:[{mineral:'Pyerite',quantityAt100:1000,unitBuy:1.5,valueAt100:1500}],
};
const share=sanitizeAppraisalShare({title:'  Fleet Loot  ',appraisal:normalized},{id:'u1',displayName:'John'});
assert.equal(share.title,'Fleet Loot');
assert.equal(share.owner.name,'John');
assert.equal(share.appraisal.summary.split,22);
assert.equal(share.appraisal.pricing,'split');
assert.equal(share.appraisal.refine.selectedRate,.88);
assert.equal(share.appraisal.refine.buyAt100,1500);
assert.equal(share.appraisal.refine.minerals[0].mineral,'Pyerite');

console.log('JLR Appraisal tests passed.');

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const shareClient=fs.readFileSync(new URL('../public/appraisal-share.js',import.meta.url),'utf8');

assert.match(server,/\/api\/appraisal\/markets/);
assert.match(server,/\/api\/appraisal\/share/);
assert.match(server,/\/appraisal\\\//);
assert.match(server,/JANICE_API_URL\+'\/appraisal\?'/);
assert.match(server,/fallbackJitaAppraisal/);
assert.match(app,/CREATE SHARE LINK/);
assert.match(app,/TOP 5% AVERAGE/);
assert.match(index,/APPRAISAL<\/button>/);
assert.match(shareClient,/\/api\/appraisal\/share\//);
assert.match(server,/function appraisalRefinePreview\(items\)/,'server calculates an ore refine preview for appraisals');
assert.match(server,/replace\(\/\^compressed\\s\+\//,'compressed ore maps to the same reprocessing recipe');
assert.match(app,/ORE EFFICIENCY/,'Appraisal exposes a Janice-style ore efficiency control');
assert.match(app,/REFINE DIFFERENCE/,'Appraisal compares refined value with raw ore value');
assert.match(shareClient,/REFINE ESTIMATE/,'shared appraisals render the saved refine estimate');
assert.match(shareClient,/JLR MARKET NETWORK/,'shared appraisal carries JLR presentation');
