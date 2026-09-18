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
  function normalizeDuration(v,fallback){
    const x=n(v,NaN);
    if(!Number.isFinite(x))return n(fallback);
    return x>1000?x/1000:x;
  }
  function normalizeChance(v,fallback){
    const x=n(v,NaN);
    if(!Number.isFinite(x))return n(fallback);
    return x>0.5?x/100:x;
  }
  function normalizeBonusYield(v,fallback){
    const x=n(v,NaN);
    if(!Number.isFinite(x))return n(fallback);
    return x>10?x/100:x;
  }
  function calculate({data,minerSkills={},minerFit=null,crystalKey='None',boosterSkills={},boosterFit=null,mindlink=false,efficiencyCharge=false}={}){
    if(!data)throw new Error('Yield calculator data is missing.');
    if(!minerFit)throw new Error('Select a saved mining fit.');
    const shipName=String(minerFit.shipName||'');
    const ship=data.ships?.[shipName];
    if(!ship)throw new Error(`${shipName||'This hull'} is not supported.`);
    const fitItems=items(minerFit);
    const normalLaserRows=fitItems.filter(row=>Object.prototype.hasOwnProperty.call(data.lasers||{},String(row.name||'')));
    const abyssalRows=fitItems.filter(row=>/Abyssal.*Strip Miner/i.test(String(row.name||'')));
    if(!normalLaserRows.length&&!abyssalRows.length)throw new Error('No supported strip miner was found in this saved fit.');
    if(abyssalRows.length&&minerFit.abyssalMatch!=='matched'){
      if(minerFit.abyssalMatch==='ambiguous')throw new Error('More than one matching Abyssal-fitted ship was found. Leave only the intended ship fitted, then Refresh.');
      throw new Error('Abyssal strip miner found, but its exact rolled module could not be matched from this character’s fitted assets.');
    }

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

    function addLaser({displayName,sourceName,quantity=1,miningAmount,duration,criticalSuccessChance,criticalSuccessBonusYield,abyssal=false}){
      const modulated=/^Modulated (Deep Core )?Strip Miner II$/.test(sourceName);
      const crystal=modulated?(data.crystals?.[chosenCrystal]||data.crystals?.None):(data.crystals?.None||{yieldModifier:1,durationMultiplier:1});
      const baseYield=n(miningAmount)*n(crystal.yieldModifier,1)*
        (1+n(ship.roleYield))*
        (1+n(sb.miningYieldPerLevel)*mining)*
        (1+n(sb.astrogeologyYieldPerLevel)*astro)*
        (1+n(ship.miningBargeYieldPerLevel)*barge)*
        (1+n(ship.exhumerYieldPerLevel)*exhumers)*
        (1+upgradeBonus);
      const critChance=n(criticalSuccessChance)*
        (1+n(sb.miningExploitationCritChancePerLevel)*exploitation)*
        (1+n(chipset.criticalSuccessChanceBonus))*
        (1+n(boost.efficiencyBoost));
      const critYield=n(criticalSuccessBonusYield)*
        (1+n(sb.miningPrecisionCritYieldPerLevel)*precision)*
        (1+n(chipset.criticalSuccessYieldBonus));
      const bonusYield=baseYield*critChance*critYield;
      const finalDuration=n(duration)*
        n(crystal.durationMultiplier,1)*
        (1+n(ship.exhumerDurationPerLevel)*exhumers)*
        (1+n(ship.roleDuration))*
        Math.max(0.001,1-n(boost.cycleReduction));
      const m3s=(baseYield+bonusYield)/finalDuration;
      totalM3s+=m3s*quantity;
      totalBasePerCycle+=baseYield*quantity;
      totalBonusPerCycle+=bonusYield*quantity;
      lasers.push({name:displayName,sourceName,quantity,baseYield,bonusYield,totalYield:baseYield+bonusYield,duration:finalDuration,m3s,crystal:modulated?chosenCrystal:'None',abyssal});
    }

    for(const row of normalLaserRows){
      const name=String(row.name||''),q=itemCount(row),laser=data.lasers[name];
      addLaser({
        displayName:name,sourceName:name,quantity:q,
        miningAmount:n(laser.miningAmount),
        duration:n(laser.duration),
        criticalSuccessChance:n(laser.criticalSuccessChance),
        criticalSuccessBonusYield:n(laser.criticalSuccessBonusYield),
      });
    }

    const dynamicByType=new Map();
    for(const mod of Array.isArray(minerFit.abyssalLasers)?minerFit.abyssalLasers:[]){
      const key=String(mod.typeId);
      if(!dynamicByType.has(key))dynamicByType.set(key,[]);
      dynamicByType.get(key).push(mod);
    }
    for(const row of abyssalRows){
      const needed=itemCount(row),mods=dynamicByType.get(String(row.typeId))||[];
      if(mods.length<needed)throw new Error('Abyssal roll data is incomplete for this fit.');
      for(const mod of mods.slice(0,needed)){
        const sourceName=String(mod.sourceName||'');
        const base=data.lasers?.[sourceName];
        if(!base)throw new Error(`Abyssal source ${sourceName||mod.sourceTypeId||'unknown'} is not supported.`);
        addLaser({
          displayName:String(mod.name||row.name||'Abyssal Strip Miner'),
          sourceName,
          quantity:1,
          miningAmount:Number.isFinite(Number(mod.miningAmount))?Number(mod.miningAmount):n(base.miningAmount),
          duration:normalizeDuration(mod.duration,base.duration),
          criticalSuccessChance:normalizeChance(mod.criticalSuccessChance,base.criticalSuccessChance),
          criticalSuccessBonusYield:normalizeBonusYield(mod.criticalSuccessBonusYield,base.criticalSuccessBonusYield),
          abyssal:true,
        });
      }
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
      abyssalLasers:lasers.filter(x=>x.abyssal),
      baseYieldPerCycle:totalBasePerCycle,
      expectedCriticalBonusPerCycle:totalBonusPerCycle,
      m3PerSecond:totalM3s,
      m3PerHour:totalM3s*3600,
    };
  }
  globalThis.JLRYieldMath={calculate,detectCrystal,detectCoreTier,detectBurstTier,detectEfficiencyCharge,boostBreakdown};
})();
