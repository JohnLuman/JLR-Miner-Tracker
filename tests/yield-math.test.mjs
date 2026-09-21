import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

await import('../public/yield-math.js');
const data=JSON.parse(await fs.readFile(new URL('../source-data.json',import.meta.url),'utf8')).yieldCalculator;
const ids=data.skillIds;
const skillKeys=['mining','astrogeology','miningBarge','exhumers','miningExploitation','miningPrecision','miningDirector','industrialCommandShips','capitalIndustrialShips','commandDestroyers'];
const skills={};
for(const key of skillKeys)skills[String(ids[key])]={name:key,level:5};

const minerFit={
  fittingId:1,
  name:'Workbook Mackinaw Regression',
  shipName:'Mackinaw',
  items:[
    {name:'Modulated Strip Miner II',quantity:2},
    {name:'Mining Laser Upgrade II',quantity:3},
    {name:'Mining Survey Chipset II',quantity:1},
    {name:'Coherent Asteroid Mining Crystal Type B II',quantity:2},
  ],
};
const boosterFit={
  fittingId:2,
  name:'Perfect Workbook Rorqual',
  shipName:'Rorqual',
  items:[
    {name:'Capital Industrial Core II',quantity:1},
    {name:'Mining Foreman Burst II',quantity:2},
    {name:'Mining Laser Optimization Charge',quantity:1},
    {name:'Mining Laser Efficiency Charge',quantity:1},
  ],
};

assert.equal(globalThis.JLRYieldMath.detectCrystal(minerFit),'B-Type T2');
const result=globalThis.JLRYieldMath.calculate({
  data,
  minerSkills:skills,
  minerFit,
  crystalKey:'Auto',
  boosterSkills:skills,
  boosterFit,
  mindlink:true,
});

assert.ok(Math.abs(result.m3PerHour-data.regression.expectedM3PerHour)<0.01,`m3/hr ${result.m3PerHour}`);
assert.ok(Math.abs(result.boost.cycleReduction-data.regression.expectedCycleReduction)<1e-12,`cycle reduction ${result.boost.cycleReduction}`);
assert.ok(Math.abs(result.boost.efficiencyBoost-data.regression.expectedEfficiencyBoost)<1e-12,`efficiency ${result.boost.efficiencyBoost}`);
assert.equal(result.boost.rangeBonus,0);
assert.equal(result.lasers[0].baseOptimalRange,15000);
assert.equal(result.lasers[0].optimalRange,15000);

const outriderFit={
  fittingId:3,
  name:'Outrider Booster',
  shipName:'Outrider',
  items:[
    {name:'Mining Foreman Burst II',quantity:2},
    {name:'Mining Laser Optimization Charge',quantity:1},
    {name:'Mining Laser Efficiency Charge',quantity:1},
  ],
};
const outriderBoost=globalThis.JLRYieldMath.boostBreakdown(data,skills,outriderFit,true);
assert.ok(Math.abs(outriderBoost.cycleReduction-0.38671875)<1e-12,`Outrider cycle reduction ${outriderBoost.cycleReduction}`);
assert.ok(Math.abs(outriderBoost.efficiencyBoost-1.2890625)<1e-12,`Outrider efficiency ${outriderBoost.efficiencyBoost}`);

const efficiencyOnly={...outriderFit,items:[{name:'Mining Foreman Burst II',quantity:1},{name:'Mining Laser Efficiency Charge',quantity:1}]};
const efficiencyOnlyBoost=globalThis.JLRYieldMath.boostBreakdown(data,skills,efficiencyOnly,true);
assert.equal(efficiencyOnlyBoost.cycleReduction,0);
assert.ok(efficiencyOnlyBoost.efficiencyBoost>0);

const optimizationOnly={...outriderFit,items:[{name:'Mining Foreman Burst II',quantity:1},{name:'Mining Laser Optimization Charge',quantity:1}]};
const optimizationOnlyBoost=globalThis.JLRYieldMath.boostBreakdown(data,skills,optimizationOnly,true);
assert.ok(optimizationOnlyBoost.cycleReduction>0);
assert.equal(optimizationOnlyBoost.efficiencyBoost,0);

const rangeBoosterFit={
  fittingId:4,
  name:'Range Rorqual',
  shipName:'Rorqual',
  items:[
    {name:'Capital Industrial Core II',quantity:1},
    {name:'Mining Foreman Burst II',quantity:1},
    {name:'Mining Laser Field Enhancement Charge',quantity:1},
  ],
};
const rangeResult=globalThis.JLRYieldMath.calculate({
  data,
  minerSkills:skills,
  minerFit,
  crystalKey:'Auto',
  boosterSkills:skills,
  boosterFit:rangeBoosterFit,
  mindlink:true,
});
assert.ok(Math.abs(rangeResult.boost.rangeBonus-1.640625)<1e-12,`range bonus ${rangeResult.boost.rangeBonus}`);
assert.ok(Math.abs(rangeResult.lasers[0].optimalRange-39609.375)<1e-9,`range ${rangeResult.lasers[0].optimalRange}`);

const abyssalFit={
  fittingId:5,
  name:'Two Physical Abyssal Lasers',
  shipName:'Hulk',
  abyssalMatch:'matched',
  items:[
    {name:'Abyssal Modulated Strip Miner',typeId:90467,quantity:2},
    {name:'Mining Laser Upgrade II',quantity:3},
    {name:'Mining Survey Chipset II',quantity:1},
    {name:'Coherent Asteroid Mining Crystal Type B II',quantity:2},
  ],
  abyssalLasers:[
    {itemId:'900000000000002',typeId:90467,locationFlag:'HiSlot1',sourceName:'Modulated Strip Miner II',miningAmount:205,duration:59000,optimalRange:15500,criticalSuccessChance:0.012,criticalSuccessBonusYield:1.1},
    {itemId:'900000000000001',typeId:90467,locationFlag:'HiSlot0',sourceName:'Modulated Strip Miner II',miningAmount:180,duration:62000,optimalRange:14500,criticalSuccessChance:0.009,criticalSuccessBonusYield:0.9},
  ],
};
const abyssalResult=globalThis.JLRYieldMath.calculate({
  data,
  minerSkills:skills,
  minerFit:abyssalFit,
  crystalKey:'Auto',
  boosterSkills:skills,
  boosterFit,
  mindlink:true,
});
assert.equal(abyssalResult.abyssalLasers.length,2);
assert.equal(abyssalResult.abyssalLasers[0].itemId,'900000000000001','weakest Abyssal laser should be first');
assert.equal(abyssalResult.abyssalLasers[0].locationFlag,'HiSlot0');
for(const laser of abyssalResult.abyssalLasers){
  assert.ok(laser.withoutBuff.totalYield>0);
  assert.equal(laser.withoutBuff.baseM3s,laser.withoutBuff.baseYield/laser.withoutBuff.duration);
  assert.equal(laser.withBuff.baseM3s,laser.withBuff.baseYield/laser.withBuff.duration);
  assert.ok(laser.withBuff.m3s>laser.withBuff.baseM3s,'expected critical yield should be separate from the EVE-style base cycle line');
  assert.ok(laser.withoutBuff.duration>laser.withBuff.duration,'buff should reduce cycle duration');
  assert.ok(laser.withoutBuff.m3s<laser.withBuff.m3s,'buff should increase m3/s');
  assert.equal(laser.totalYield,laser.withBuff.totalYield,'legacy totalYield should remain the active-buff value');
  assert.equal(laser.duration,laser.withBuff.duration,'legacy duration should remain the active-buff value');
  assert.equal(laser.m3s,laser.withBuff.m3s,'legacy m3s should remain the active-buff value');
}

console.log('Yield Calc regression passed:',result.m3PerHour.toFixed(4),'m3/hr');
console.log('Outrider boost regression passed:',(outriderBoost.cycleReduction*100).toFixed(4)+'%');
console.log('Abyssal per-laser buff comparison passed:',abyssalResult.abyssalLasers.map(row=>row.withBuff.m3s.toFixed(2)).join(' < '),'m3/s');
