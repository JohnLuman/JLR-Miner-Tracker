import assert from 'node:assert/strict';
import {answerDoctrineQuestion,answerMiningMarketQuestion,isDoctrineDataQuestion,isAppraisalDataQuestion,appraisalQuestionNeedsMarket,appraisalMarketIdFromQuestion,appraisalQuantityFromQuestion,answerAppraisalStaticQuestion,answerAppraisalMarketQuestion} from '../lib/adam-data.mjs';

const snapshot={
  snapshotDate:'2026-09-20',
  status:{sources:{cn:'workbook-fallback',jita:'workbook-fallback',history:'workbook-fallback'}},
  summary:{zero:1,need:3,seed:2},
  rows:[
    {typeId:1,item:'High ROI Module',stock:0,sold30:2,daysStandard:0,required:60,cnSell:220,jitaSell:95,breakeven:110},
    {typeId:2,item:'High Volume Module',stock:5,sold30:30,daysStandard:0.16,required:895,cnSell:150,jitaSell:90,breakeven:100},
    {typeId:3,item:'No Price Module',stock:0,sold30:30,required:900,cnSell:0,jitaSell:90,breakeven:100},
    {typeId:4,item:'No Sales Module',stock:0,sold30:.01,required:1,cnSell:400,jitaSell:90,breakeven:100},
  ],
};

assert.equal(isDoctrineDataQuestion('What doctrine item has the best ROI?', 'fields'),true);
assert.equal(isDoctrineDataQuestion('What item should I buy for the best return on investment?', 'doctrine'),true);
assert.equal(isDoctrineDataQuestion('Top ROI?', 'doctrine'),true);
assert.equal(isDoctrineDataQuestion('How much stock do we have?', 'doctrine'),true);
assert.equal(isDoctrineDataQuestion('Which ore is best to mine?', 'doctrine'),false);
assert.equal(isDoctrineDataQuestion('What is Doctrine Market?', 'doctrine'),false);

const roi=answerDoctrineQuestion({question:'Best item to buy for ROI?',snapshot});
assert.equal(roi.focusItem,'High ROI Module');
assert.match(roi.text,/100\.0% estimated gross ROI/);
assert.match(roi.text,/Fountain sales are only a demand proxy/);
assert.match(roi.text,/workbook snapshot/);
assert.doesNotMatch(roi.text,/No Price Module|No Sales Module/);

const profit=answerDoctrineQuestion({question:'Which doctrine item has the most total profit?',snapshot});
assert.equal(profit.focusItem,'High Volume Module','profit ranking is separate from ROI ranking');

const budget=answerDoctrineQuestion({question:'Best item for 1m budget',snapshot});
assert.equal(budget.metrics.units,60,'recommended units cannot exceed the stock gap');

const followup=answerDoctrineQuestion({question:'How many should I buy?',snapshot,focusItem:roi.focusItem});
assert.equal(followup.focusItem,'High ROI Module');
assert.match(followup.text,/30-day restock gap about 60 units/);
assert.equal(answerDoctrineQuestion({question:'How many should I buy?',snapshot}).topic,'doctrine-item-needed');

const stock=answerDoctrineQuestion({question:'Which doctrine items need restock?',snapshot});
assert.equal(stock.topic,'doctrine-stock');
assert.match(stock.text,/1 items at zero/);

const ice=answerMiningMarketQuestion({question:'Best ice value?',ice:[{name:'Blue Ice',market:{trackingBlockValue:120}},{name:'Glacial Mass',market:{trackingBlockValue:80}}]});
assert.match(ice.text,/Blue Ice 120 JLR payout ISK\/block/);
assert.equal(answerMiningMarketQuestion({question:'What is the price?',currentTab:'ice',ice:[{name:'Blue Ice',market:{trackingBlockValue:120}}]}).topic,'market-item-needed');
assert.equal(answerMiningMarketQuestion({question:'Where is my toon?',currentTab:'ice'}),null);
assert.equal(answerMiningMarketQuestion({question:'Best field to mine?',currentTab:'fields',ores:[{name:'Ore',jbvPerM3:10}]}),null);

const arkonorItem={
  typeId:22,name:'Arkonor',categoryName:'Asteroid',groupName:'Arkonor',marketGroupName:'Arkonor',
  volume:16,packagedVolume:16,portionSize:100,compressedTypeId:28367,compressedName:'Compressed Arkonor',
};
const arkonorMaterials={
  typeId:22,name:'Arkonor',portionSize:100,
  materials:[{typeId:34,name:'Tritanium',quantity:22000},{typeId:35,name:'Pyerite',quantity:2500}],
};
assert.equal(isAppraisalDataQuestion('What does Arkonor refine into?','fields'),true);
assert.equal(isAppraisalDataQuestion('What is Arkonor?','fields'),true);
assert.equal(appraisalQuestionNeedsMarket('What does Arkonor refine into?'),false);
assert.equal(appraisalQuestionNeedsMarket('Is compressed Arkonor worth more?'),true);
assert.equal(appraisalMarketIdFromQuestion('What is Arkonor worth in Amarr?'),3);
assert.equal(appraisalMarketIdFromQuestion('What is Arkonor worth?'),2);
assert.equal(appraisalQuantityFromQuestion('What is 1,250 Arkonor worth?','Arkonor'),1250);
assert.equal(appraisalQuantityFromQuestion('Arkonor x 500 price','Arkonor'),500);

const staticRefine=answerAppraisalStaticQuestion({
  question:'What does Arkonor refine into?',item:arkonorItem,materials:arkonorMaterials,sdeMeta:{buildNumber:3552227},
});
assert.equal(staticRefine.focusItem,'Arkonor');
assert.match(staticRefine.text,/22,000 Tritanium/);
assert.match(staticRefine.text,/CCP SDE build 3,552,227/);

const staticCompression=answerAppraisalStaticQuestion({
  question:'Can Arkonor compress?',item:arkonorItem,sdeMeta:{buildNumber:3552227},
});
assert.match(staticCompression.text,/Compressed Arkonor/);
assert.match(staticCompression.text,/exact SDE compression relationship/);

const appraisal={
  market:{id:2,name:'Jita 4-4'},pricing:'split',pricingVariant:'immediate',
  staticData:{buildNumber:3552227},
  marketData:{maxAgeMs:120000,staleCount:0,freshCount:1,sourceCounts:{'support-cache':1}},
  items:[{
    resolved:true,typeId:22,name:'Arkonor',amount:100,buy:1000,split:1100,sell:1200,
    buyTotal:100000,splitTotal:110000,sellTotal:120000,
  }],
};
const intel={
  compression:[{
    sourceTypeId:22,sourceName:'Arkonor',targetName:'Compressed Arkonor',direction:'compress',
    sourceValue:110000,targetValue:125000,valueDelta:15000,volumeReductionPct:99,
  }],
  decision:{
    refineRate:.9,rawValue:110000,compressedValue:125000,refinedValue:130000,
    winner:'refine',winnerLabel:'REFINE',winnerValue:130000,advantageValue:5000,
  },
  history:[{
    typeId:22,name:'Arkonor',avg7:1100,avg30:1000,trend7Pct:10,avgDailyVolume7:500,spreadPct:4,
  }],
};
const priceAnswer=answerAppraisalMarketQuestion({question:'What is 100 Arkonor worth?',item:arkonorItem,quantity:100,appraisal,intel});
assert.match(priceAnswer.text,/buy 100,000 ISK/);
assert.match(priceAnswer.text,/split 110,000 ISK/);
assert.match(priceAnswer.text,/2 minutes old/);

const compressionAnswer=answerAppraisalMarketQuestion({question:'Is compressed Arkonor worth more?',item:arkonorItem,quantity:100,appraisal,intel});
assert.match(compressionAnswer.text,/Compressed Arkonor/);
assert.match(compressionAnswer.text,/\+15,000 ISK/);

const decisionAnswer=answerAppraisalMarketQuestion({question:'Raw vs compressed vs refine, what is better?',item:arkonorItem,quantity:100,appraisal,intel});
assert.match(decisionAnswer.text,/highest-value option is REFINE/);
assert.match(decisionAnswer.text,/Advantage over the next option: 5,000 ISK/);

const historyAnswer=answerAppraisalMarketQuestion({question:'Show Arkonor liquidity and history',item:arkonorItem,quantity:100,appraisal,intel});
assert.match(historyAnswer.text,/7-day average 1,100 ISK/);
assert.match(historyAnswer.text,/current spread 4\.00%/);

console.log('Adam grounded data tests passed.');
