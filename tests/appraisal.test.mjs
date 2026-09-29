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

const share=sanitizeAppraisalShare({title:'  Fleet Loot  ',appraisal:normalized},{id:'u1',displayName:'John'});
assert.equal(share.title,'Fleet Loot');
assert.equal(share.owner.name,'John');
assert.equal(share.appraisal.summary.split,22);
assert.equal(share.appraisal.pricing,'split');

console.log('JLR Appraisal tests passed.');

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const share=fs.readFileSync(new URL('../public/appraisal-share.js',import.meta.url),'utf8');

assert.match(server,/\/api\/appraisal\/markets/);
assert.match(server,/\/api\/appraisal\/share/);
assert.match(server,/\/appraisal\\\//);
assert.match(server,/JANICE_API_URL\+'\/appraisal\?'/);
assert.match(server,/fallbackJitaAppraisal/);
assert.match(app,/CREATE SHARE LINK/);
assert.match(app,/TOP 5% AVERAGE/);
assert.match(index,/APPRAISAL<\/button>/);
assert.match(share,/\/api\/appraisal\/share\//);
