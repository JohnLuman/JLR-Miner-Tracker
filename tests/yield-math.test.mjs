import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

await import('../public/yield-math.js');
const data=JSON.parse(await fs.readFile(new URL('../source-data.json',import.meta.url),'utf8')).yieldCalculator;
const ids=data.skillIds;
const skillKeys=['mining','astrogeology','miningBarge','exhumers','miningExploitation','miningPrecision','miningDirector','industrialCommandShips','capitalIndustrialShips'];
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
    {name:'Mining Foreman Burst II',quantity:1},
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
  efficiencyCharge:true,
});

assert.ok(Math.abs(result.m3PerHour-data.regression.expectedM3PerHour)<0.01,`m3/hr ${result.m3PerHour}`);
assert.ok(Math.abs(result.boost.cycleReduction-data.regression.expectedCycleReduction)<1e-12,`cycle reduction ${result.boost.cycleReduction}`);
assert.ok(Math.abs(result.boost.efficiencyBoost-data.regression.expectedEfficiencyBoost)<1e-12,`efficiency ${result.boost.efficiencyBoost}`);
console.log('Yield Calc regression passed:',result.m3PerHour.toFixed(4),'m3/hr');
