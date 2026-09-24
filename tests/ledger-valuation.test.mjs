import assert from 'node:assert/strict';
import {
  aggregateTrackedT3Ledger,
  janiceImmediateBuyPrices,
  refinedT3BuyValue,
  t3OreVariant,
  trackedT3OreVariant,
} from '../lib/ledger-valuation.mjs';

const MAX_REFINE_YIELD=0.90628105568;
const mineralPrices={Tritanium:5,Pyerite:10,Mexallon:50,Isogen:100,Nocxium:900,Zydrine:1_500,Megacyte:2_000};

assert.deepEqual(t3OreVariant(81901)?.minerals,{Tritanium:315,Pyerite:210,Mexallon:578});
assert.equal(t3OreVariant(81901)?.name,'Kylixium II-Grade');
assert.equal(trackedT3OreVariant('Kylixium',81901)?.grade,2);
assert.equal(trackedT3OreVariant('Ueganite',81901),null);

const kylixiumTwo=refinedT3BuyValue(81901,100,mineralPrices,MAX_REFINE_YIELD);
const kylixiumTwoExpected=(315*5+210*10+578*50)*MAX_REFINE_YIELD;
assert.ok(kylixiumTwo);
assert.ok(Math.abs(kylixiumTwo.value-kylixiumTwoExpected)<1e-8);
assert.equal(kylixiumTwo.volumeM3,120);

const typeById={
  '81901':{name:'Kylixium II-Grade',volume:1.2},
  '81903':{name:'Kylixium IV-Grade',volume:1.2},
  '82206':{name:'Ueganite II-Grade',volume:5},
  '1230':{name:'Veldspar',volume:0.1},
};
const systemById={
  '1':{name:'RP2-OQ'},
  '2':{name:'3WE-KY'},
  '3':{name:'Untracked System'},
};
const systemOreByName={'RP2-OQ':'Kylixium','3WE-KY':'Ueganite'};
const rows=[
  {date:'2026-09-21',solar_system_id:1,type_id:81901,quantity:100},
  {date:'2026-09-21',solar_system_id:1,type_id:81903,quantity:50},
  {date:'2026-09-21',solar_system_id:1,type_id:1230,quantity:1_000_000},
  {date:'2026-09-21',solar_system_id:2,type_id:81901,quantity:100},
  {date:'2026-09-21',solar_system_id:3,type_id:81901,quantity:100},
  {date:'2026-09-20',solar_system_id:2,type_id:82206,quantity:200},
];
const daily=aggregateTrackedT3Ledger({rows,typeById,systemById,systemOreByName,priceByMineral:mineralPrices,refineYield:MAX_REFINE_YIELD});
assert.equal(daily.length,2);
assert.equal(daily[0].date,'2026-09-21');
assert.equal(daily[0].m3,420);
assert.deepEqual(daily[0].ores,{'Kylixium II-Grade':360,'Kylixium IV-Grade':60});
const kylixiumFourHalf=(345*5+230*10+633*50)*0.5*MAX_REFINE_YIELD;
assert.ok(Math.abs(daily[0].jbv-(kylixiumTwoExpected*3+kylixiumFourHalf))<1e-8);
assert.equal(daily[0].unpricedM3,0);
assert.equal(daily[1].m3,1_000);

// Exact T3 ore mined outside a tracked field system still counts for payout.
const outsideTracked=aggregateTrackedT3Ledger({rows:[rows[4]],typeById,systemById,systemOreByName,priceByMineral:mineralPrices,refineYield:MAX_REFINE_YIELD});
assert.equal(outsideTracked[0].m3,120);
assert.ok(outsideTracked[0].jbv>0);

const missingPrice=aggregateTrackedT3Ledger({rows:rows.slice(0,1),typeById,systemById,systemOreByName,priceByMineral:{},refineYield:MAX_REFINE_YIELD});
assert.equal(missingPrice[0].m3,120);
assert.equal(missingPrice[0].jbv,0);
assert.equal(missingPrice[0].unpricedM3,120);

const janiceRows=[
  {itemType:{name:'Tritanium'},immediatePrices:{buyPrice:5.25}},
  {itemType:{name:'Pyerite'},immediatePrices:{buyPrice:11.5}},
];
assert.deepEqual(janiceImmediateBuyPrices(janiceRows,['Tritanium','Pyerite']),{Tritanium:5.25,Pyerite:11.5});
assert.equal(janiceImmediateBuyPrices(janiceRows,['Tritanium','Mexallon']),null);

console.log('ledger valuation tests passed');
