'use strict';
(() => {
  function n(v, fallback=0){const x=Number(v);return Number.isFinite(x)?x:fallback}
  function level(skills,id){return n(skills?.[String(id)]?.level,0)}
  function items(fit){return Array.isArray(fit?.items)?fit.items:[]}
  function itemCount(row){return Math.max(1,n(row?.quantity,1))}
  function detectCrystal(fit){
    for(const row of items(fit)){
      const name=String(row.name||'');
      const m=name.match(/Type\s+([ABC])\s+(II|I)\b/i);
      if(m)return `${m[1].toUpperCase()}-Type ${m[2].toUpperCase()==='II'?'T2':'T1'}`;
    }
    return 'None';
  }
  function detectCoreTier(fit){
    const names=items(fit).map(x=>String(x.name||''));
    if(names.some(x=>/Industrial Core II\b/i.test(x)))return 'T2';
    if(names.some(x=>/Industrial Core I\b/i.test(x)))return 'T1';
    return 'None';
  }
  function detectBurstTier(fit){
    const names=items(fit).map(x=>String(x.name||''));
    if(names.some(x=>/Mining Foreman Burst II\b/i.test(x)))return 'T2';
    if(names.some(x=>/Mining Foreman Burst I\b/i.test(x)))return 'T1';
    return 'T1';
  }
  function detectEfficiencyCharge(fit){
    return items(fit).some(x=>/Mining Laser Efficiency Charge/i.test(String(x.name||'')));
  }
  function firstRecognized(itemsList,map){
    for(const row of itemsList)if(Object.prototype.hasOwnProperty.call(map,String(row.name||'')))return String(row.name);
    return 'None';
  }
  function boostBreakdown(data,skills,fit,mindlink,efficiencyCharge){
    const ship=String(fit?.shipName||'');
    if(!['Porpoise','Orca','Rorqual'].includes(ship)){
      return {ship:'None',core:'None',burst:'T1',cycleReduction:0,efficiencyBoost:0,commonMultiplier:1};
    }
    const core=detectCoreTier(fit),burst=detectBurstTier(fit);
    const row=data.boostShips?.[`${ship}-${core}`]||data.boostShips?.[`${ship}-None`];
    if(!row)return {ship,core,burst,cycleReduction:0,efficiencyBoost:0,commonMultiplier:1};
    const ids=data.skillIds||{}, bonuses=data.skillBonuses||{}, b=data.boost||{};
    const commandSkill=level(skills,ship==='Rorqual'?ids.capitalIndustrialShips:ids.industrialCommandShips);
    const director=level(skills,ids.miningDirector);
    const burstBonus=burst==='T2'?n(b.burstModuleT2Bonus):n(b.burstModuleT1Bonus);
    const mindlinkBonus=mindlink?n(b.mindlinkBonus):0;
    const common=(1+burstBonus)*(1+n(row.coreBurstStrengthBonus))*(1+n(row.commandShipBonus)*commandSkill)*(1+n(bonuses.miningDirectorBurstPerLevel)*director)*(1+mindlinkBonus);
    const cycleReduction=n(b.optimizationBase)*common;
    const efficiencyBoost=efficiencyCharge?n(b.efficiencyBase)*common:0;
    return {ship,core,burst,commandSkill,director,cycleReduction,efficiencyBoost,commonMultiplier:common};
  }
  function calculate({data,minerSkills={},minerFit=null,crystalKey='None',boosterSkills={},boosterFit=null,mindlink=false,efficiencyCharge=false}={}){
    if(!data)throw new Error('Yield calculator data is missing.');
    if(!minerFit)throw new Error('Select a saved mining fit.');
    const shipName=String(minerFit.shipName||'');
    const ship=data.ships?.[shipName];
    if(!ship)throw new Error(`${shipName||'This hull'} is not supported by the workbook Yield Calc.`);
    const fitItems=items(minerFit);
    const laserRows=fitItems.filter(row=>Object.prototype.hasOwnProperty.call(data.lasers||{},String(row.name||'')));
    const abyssalRows=fitItems.filter(row=>/Abyssal.*Strip Miner/i.test(String(row.name||'')));
    if(!laserRows.length&&abyssalRows.length)throw new Error('Abyssal strip miner detected — exact roll stats are required.');
    if(!laserRows.length)throw new Error('No supported strip miner was found in this saved fit.');
    const ids=data.skillIds||{}, sb=data.skillBonuses||{};
    const mining=level(minerSkills,ids.mining);
    const astro=level(minerSkills,ids.astrogeology);
    const barge=level(minerSkills,ids.miningBarge);
    const exhumers=level(minerSkills,ids.exhumers);
    const exploitation=level(minerSkills,ids.miningExploitation);
    const precision=level(minerSkills,ids.miningPrecision);
    let upgradeBonus=0;
    const upgradeParts=[];
    for(const row of fitItems){
      const name=String(row.name||'');
      if(Object.prototype.hasOwnProperty.call(data.miningUpgrades||{},name)){
        const q=itemCount(row),bonus=n(data.miningUpgrades[name]);
        upgradeBonus+=bonus*q; upgradeParts.push({name,quantity:q,bonus});
      }
    }
    const chipsetName=firstRecognized(fitItems,data.chipsets||{});
    const chipset=data.chipsets?.[chipsetName]||data.chipsets?.None||{};
    let chosenCrystal=String(crystalKey||'None');
    if(chosenCrystal==='Auto')chosenCrystal=detectCrystal(minerFit);
    if(!data.crystals?.[chosenCrystal])chosenCrystal='None';
    const boost=boostBreakdown(data,boosterSkills,boosterFit,mindlink,efficiencyCharge);
    let totalM3s=0,totalBasePerCycle=0,totalBonusPerCycle=0;
    const lasers=[];
    for(const row of laserRows){
      const name=String(row.name||''), q=itemCount(row), laser=data.lasers[name];
      const modulated=/^Modulated (Deep Core )?Strip Miner II$/.test(name);
      const c=modulated?(data.crystals?.[chosenCrystal]||data.crystals?.None):(data.crystals?.None||{yieldModifier:1,durationMultiplier:1});
      const baseYield=n(laser.miningAmount)*n(c.yieldModifier,1)*
        (1+n(ship.roleYield))*
        (1+n(sb.miningYieldPerLevel)*mining)*
        (1+n(sb.astrogeologyYieldPerLevel)*astro)*
        (1+n(ship.miningBargeYieldPerLevel)*barge)*
        (1+n(ship.exhumerYieldPerLevel)*exhumers)*
        (1+upgradeBonus);
      const critChance=n(laser.criticalSuccessChance)*
        (1+n(sb.miningExploitationCritChancePerLevel)*exploitation)*
        (1+n(chipset.criticalSuccessChanceBonus))*
        (1+n(boost.efficiencyBoost));
      const critYield=n(laser.criticalSuccessBonusYield)*
        (1+n(sb.miningPrecisionCritYieldPerLevel)*precision)*
        (1+n(chipset.criticalSuccessYieldBonus));
      const bonusYield=baseYield*critChance*critYield;
      const duration=n(laser.duration)*
        n(c.durationMultiplier,1)*
        (1+n(ship.exhumerDurationPerLevel)*exhumers)*
        (1+n(ship.roleDuration))*
        Math.max(0.001,1-n(boost.cycleReduction));
      const m3s=(baseYield+bonusYield)/duration;
      totalM3s+=m3s*q;
      totalBasePerCycle+=baseYield*q;
      totalBonusPerCycle+=bonusYield*q;
      lasers.push({name,quantity:q,baseYield,bonusYield,totalYield:baseYield+bonusYield,duration,m3s,crystal:modulated?chosenCrystal:'None'});
    }
    return {
      sourceSheet:data.sourceSheet||'Yield Calc',
      shipName,
      fitName:minerFit.name||'Unnamed fit',
      crystal:chosenCrystal,
      chipset:chipsetName,
      miningUpgradeBonus:upgradeBonus,
      miningUpgrades:upgradeParts,
      boost,
      skills:{mining,astrogeology:astro,miningBarge:barge,exhumers,miningExploitation:exploitation,miningPrecision:precision},
      lasers,
      baseYieldPerCycle:totalBasePerCycle,
      expectedCriticalBonusPerCycle:totalBonusPerCycle,
      m3PerSecond:totalM3s,
      m3PerHour:totalM3s*3600,
    };
  }
  globalThis.JLRYieldMath={calculate,detectCrystal,detectCoreTier,detectBurstTier,detectEfficiencyCharge,boostBreakdown};
})();
