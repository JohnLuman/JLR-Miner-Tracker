import fs from 'node:fs';
import assert from 'node:assert/strict';
import {appraisalSummary,sanitizeAppraisalShare} from '../lib/appraisal/appraisal.mjs';

const items=[
  {
    resolved:true,typeId:34,name:'Tritanium',amount:2,
    volumePerUnit:100,packagedVolumePerUnit:100,totalVolume:200,totalPackagedVolume:200,
    buyOrderCount:10,buyVolume:100,sellOrderCount:8,sellVolume:80,
    buy:4,split:5,sell:6,buyTotal:8,splitTotal:10,sellTotal:12,
  },
  {
    resolved:true,typeId:35,name:'Pyerite',amount:1,
    volumePerUnit:50,packagedVolumePerUnit:50,totalVolume:50,totalPackagedVolume:50,
    buy:10,split:12,sell:14,buyTotal:10,splitTotal:12,sellTotal:14,
  },
];

const summary=appraisalSummary(items,'split');
assert.equal(summary.buy,18);
assert.equal(summary.split,22);
assert.equal(summary.sell,26);
assert.equal(summary.value,22);
assert.equal(summary.volume,250);

const appraisal={
  generatedAt:'2026-09-29T08:00:00Z',
  datasetTime:null,
  source:'jlr-native-esi',
  market:{id:2,name:'Jita 4-4'},
  pricing:'split',
  pricingVariant:'immediate',
  failures:'',
  items,
  summary,
  refine:{
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
  },
};
const share=sanitizeAppraisalShare({title:'  Fleet Loot  ',appraisal},{id:'u1',displayName:'John'});
assert.equal(share.title,'Fleet Loot');
assert.equal(share.owner.name,'John');
assert.equal(share.appraisal.summary.split,22);
assert.equal(share.appraisal.pricing,'split');
assert.equal(share.appraisal.source,'jlr-native-esi');
assert.equal(share.appraisal.refine.selectedRate,.88);
assert.equal(share.appraisal.refine.buyAt100,1500);
assert.equal(share.appraisal.refine.minerals[0].mineral,'Pyerite');

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const shareClient=fs.readFileSync(new URL('../public/appraisal-share.js',import.meta.url),'utf8');

assert.match(server,/\/api\/appraisal\/markets/);
assert.match(server,/\/api\/appraisal\/intel/,'main app exposes Support appraisal intel');
assert.match(server,/\/api\/internal\/support\/appraisal/,'Support can request alternate native appraisal pricing');
assert.match(server,/\/api\/appraisal\/share/);
assert.match(server,/\/appraisal\\\//);
assert.match(server,/source:'jlr-native-esi'/,'native Appraisal identifies JLR as the pricing provider');
assert.match(server,/nativeAppraisalPriceSet/,'native Appraisal owns Buy\/Split\/Sell pricing math');
assert.match(server,/universe\/ids\/\?datasource=tranquility/,'native Appraisal resolves inventory types through CCP ESI');
assert.match(server,/NATIVE_APPRAISAL_MARKETS/,'native Appraisal owns its market catalog');
assert.doesNotMatch(server,/JANICE_API_KEY|JANICE_API_URL|janiceAppraisal|fallbackJitaAppraisal/i,'Appraisal server has no Janice dependency');
assert.match(app,/CREATE SHARE LINK/);
assert.match(app,/TOP 5% AVERAGE/);
assert.match(app,/JLR Native • CCP ESI Jita buy/);
assert.match(index,/APPRAISAL<\/button>/);
assert.match(shareClient,/\/api\/appraisal\/share\//);
assert.match(server,/function appraisalRefinePreview\(items,sdeMaterialRows=\[\]\)/,'server calculates an SDE-aware ore refine preview for appraisals');
assert.match(server,/replace\(\/\^compressed\\s\+\//,'compressed ore maps to the same reprocessing recipe');
assert.match(app,/ORE EFFICIENCY/,'Appraisal exposes its ore efficiency control');
assert.match(app,/REFINE DIFFERENCE/,'Appraisal compares refined value with raw ore value');
assert.doesNotMatch(app,/JLR BUILD PLANS|forgeBuildPlans|\/api\/forge\/board/,'Appraisal no longer loads or renders legacy Forge build plans');
assert.match(app,/data-appraisal-copy=/,'Appraisal renders click-to-copy values');
assert.match(app,/copyAppraisalValue/,'Appraisal wires copy-to-clipboard behavior');
assert.match(shareClient,/REFINE ESTIMATE/,'shared appraisals render the saved refine estimate');
assert.match(shareClient,/JLR MARKET NETWORK/,'shared appraisal carries JLR presentation');

console.log('JLR Native Appraisal tests passed.');
