import assert from 'node:assert/strict';
import {answerDoctrineQuestion,answerMiningMarketQuestion,isDoctrineDataQuestion} from '../lib/adam-data.mjs';

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

console.log('Adam grounded data tests passed.');
