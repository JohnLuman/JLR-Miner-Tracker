import fs from 'node:fs';
import assert from 'node:assert/strict';
import {appraisalSummary,appraisalSummaryWithRefine,sanitizeAppraisalShare} from '../lib/appraisal/appraisal.mjs';
import {appraisalSharePreview,renderAppraisalShareHtml} from '../lib/appraisal/share-preview.mjs';

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
    sellAt100:1800,
    eligibleBuy:1200,
    eligibleSplit:1300,
    eligibleSell:1400,
    pricingBasis:'Jita mineral buy / sell',
    items:[{typeId:35,name:'Pyerite',amount:1,valueAt100:1500,sellValueAt100:1800,recipeSource:'ccp-sde'}],
    minerals:[{mineral:'Pyerite',quantityAt100:1000,unitBuy:1.5,unitSell:1.8,valueAt100:1500,valueSellAt100:1800}],
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
assert.equal(share.appraisal.refine.sellAt100,1800);
assert.equal(share.appraisal.refine.items[0].sellValueAt100,1800);
assert.equal(share.appraisal.refine.minerals[0].unitSell,1.8);
assert.equal(share.appraisal.refine.minerals[0].mineral,'Pyerite');

const refineBuySummary=appraisalSummaryWithRefine(items,'refine-buy',share.appraisal.refine);
const refineSellSummary=appraisalSummaryWithRefine(items,'refine-sell',share.appraisal.refine);
assert.equal(refineBuySummary.value,1320);
assert.equal(refineSellSummary.value,1584);

assert.equal(appraisalSharePreview(share).payoutPercent,100,'legacy share links without ?p default to 100%');
const preview=appraisalSharePreview(share,{payoutPercent:95});
assert.equal(preview.payoutPercent,95);
assert.equal(preview.selectedValue,22);
assert.equal(preview.payoutValue,20.9);
assert.match(preview.title,/Fleet Loot .* SPLIT 22 ISK/);
assert.match(preview.description,/1\. Tritanium ×2\n2\. Pyerite ×1/,'Discord preview lists appraisal items one per line in original order');

const longPreview=appraisalSharePreview({
  ...share,
  appraisal:{
    ...share.appraisal,
    items:Array.from({length:10},(_,index)=>({
      resolved:true,
      typeId:1000+index,
      name:'Item '+(index+1),
      amount:index+1,
      buyTotal:10,
      splitTotal:11,
      sellTotal:12,
    })),
  },
});
assert.equal(longPreview.description.split('\n').length,9,'Discord preview caps the item list at nine lines');
assert.match(longPreview.description,/9\. Item 9 ×9 …$/,'when more items exist, the ninth line ends with an ellipsis');
assert.doesNotMatch(longPreview.description,/Item 10/,'items after line nine are omitted');

const previewHtml=renderAppraisalShareHtml(
  '<!doctype html><html><head><title>JLR Appraisal</title></head><body></body></html>',
  {...share,title:'Fleet <Loot>'},
  {payoutPercent:95,canonicalUrl:'https://example.test/appraisal/token?p=95',imageUrl:'https://example.test/assets/jlr-appraisal-preview.png'}
);
assert.match(previewHtml,/property="og:title"/);
assert.match(previewHtml,/property="og:description"/);
assert.match(previewHtml,/&#10;/,'Open Graph description preserves item line breaks');
assert.match(previewHtml,/property="og:image"/);
assert.match(previewHtml,/property="og:image:secure_url"/);
assert.match(previewHtml,/property="og:image:type" content="image\/png"/);
assert.match(previewHtml,/twitter:card" content="summary"/);
assert.match(previewHtml,/property="og:image:width" content="256"/);
assert.match(previewHtml,/property="og:image:height" content="256"/);
assert.match(previewHtml,/Fleet &lt;Loot&gt;/);
assert.doesNotMatch(previewHtml,/<Loot>/,'preview metadata escapes user-controlled titles');

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const shareClient=fs.readFileSync(new URL('../public/appraisal-share.js',import.meta.url),'utf8');
const enhanceClient=fs.readFileSync(new URL('../public/appraisal-enhance.js',import.meta.url),'utf8');
const enhanceCss=fs.readFileSync(new URL('../public/appraisal-enhance.css',import.meta.url),'utf8');

assert.match(server,/\/api\/appraisal\/markets/);
assert.match(server,/\/api\/appraisal\/intel/,'main app exposes Support appraisal intel');
assert.match(server,/\/api\/internal\/support\/appraisal/,'Support can request alternate native appraisal pricing');
assert.match(server,/\/api\/appraisal\/share/);
assert.match(server,/\(\?:a\|appraisal\)/,'server accepts both short /a/ and legacy /appraisal/ public routes');
assert.match(server,/JLR_SHARE_ORIGIN/,'share host can be swapped independently of the app/SSO origin');
assert.match(server,/randomId\(6\)/,'new appraisal links use compact eight-character base64url tokens');
assert.match(server,/appraisalShareUrl\(req,token\)/,'new appraisal shares return the short public URL');
assert.match(server,/renderAppraisalShareHtml/,'shared appraisal HTML is server-rendered for Discord/Open Graph previews');
assert.match(server,/jlr-appraisal-preview\.png\?v=4/,'shared appraisal preview advertises the compact cache-busted JLR preview image');
assert.match(server,/Content-Length':st\.size/,'static image responses include a content length for Discord fetch reliability');
assert.match(server,/source:'jlr-native-esi'/,'native Appraisal identifies JLR as the pricing provider');
assert.match(server,/nativeAppraisalPriceSet/,'native Appraisal owns Buy\/Split\/Sell pricing math');
assert.match(server,/universe\/ids\/\?datasource=tranquility/,'native Appraisal resolves inventory types through CCP ESI');
assert.match(server,/NATIVE_APPRAISAL_MARKETS/,'native Appraisal owns its market catalog');
assert.doesNotMatch(server,/JANICE_API_KEY|JANICE_API_URL|janiceAppraisal|fallbackJitaAppraisal/i,'Appraisal server has no Janice dependency');
assert.match(app,/CREATE SHARE LINK/);
assert.match(app,/TOP 5% AVERAGE/);
assert.match(app,/value="refine-buy">REFINE BUY/,'price selector exposes Refine Buy');
assert.match(app,/value="refine-sell">REFINE SELL/,'price selector exposes Refine Sell');
assert.match(app,/Discord-ready JLR appraisal copied/,'share action copies a Discord-ready masked link and compact item list');
assert.match(app,/lines\[lines\.length-1\]\+=' …'/,'copied Discord list ends line nine with an ellipsis when more items exist');
assert.match(app,/JLR Native • CCP ESI Jita buy/);
assert.match(index,/APPRAISAL<\/button>/);
assert.match(index,/data-tab="appraisal"[^>]*>APPRAISAL<\/button>/,'Appraisal uses its own tab key');
assert.doesNotMatch(index,/data-tab="forge"/,'legacy Forge tab key is removed from the UI');
assert.match(shareClient,/\/api\/appraisal\/share\//);
assert.match(server,/function appraisalRefinePreview\(items,sdeMaterialRows=\[\]\)/,'server calculates an SDE-aware ore refine preview for appraisals');
assert.match(server,/replace\(\/\^compressed\\s\+\//,'compressed ore maps to the same reprocessing recipe');
assert.match(app,/ORE EFFICIENCY/,'Appraisal exposes its ore efficiency control');
assert.match(app,/REFINE DIFFERENCE/,'Appraisal compares refined value with raw ore value');
assert.match(app,/REFINED SELL @/,'Appraisal displays refined mineral sell value');
assert.match(server,/effectiveJitaMineralPrices\('sell'\)/,'server calculates refine sell value from Jita mineral sell orders');
assert.match(enhanceClient,/jlr-appraisal-select-trigger/,'Appraisal replaces browser-native selects with JLR themed menus');
assert.match(enhanceCss,/\.jlr-appraisal-select-menu/,'themed Appraisal dropdown menu styles are present');
assert.doesNotMatch(app,/JLR BUILD PLANS|forgeBuildPlans|\/api\/forge\/board/,'Appraisal no longer loads or renders legacy Forge build plans');
assert.match(app,/data-appraisal-copy=/,'Appraisal renders click-to-copy values');
assert.match(app,/copyAppraisalValue/,'Appraisal wires copy-to-clipboard behavior');
assert.match(shareClient,/REFINE ESTIMATE/,'shared appraisals render the saved refine estimate');
assert.match(shareClient,/REFINED SELL/,'shared appraisals render refined sell value');
assert.match(shareClient,/JLR MARKET NETWORK/,'shared appraisal carries JLR presentation');

console.log('JLR Native Appraisal tests passed.');
