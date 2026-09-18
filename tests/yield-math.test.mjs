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

console.log('Yield Calc regression passed:',result.m3PerHour.toFixed(4),'m3/hr');
console.log('Outrider boost regression passed:',(outriderBoost.cycleReduction*100).toFixed(4)+'%');
