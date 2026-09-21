'use strict';
(() => {
  function n(v, fallback=0){const x=Number(v);return Number.isFinite(x)?x:fallback}
  function optionalNumber(v,fallback=NaN){
    if(v===null||v===undefined||v==='')return fallback;
    const x=Number(v);
    return Number.isFinite(x)?x:fallback;
  }
  function level(skills,id){return n(skills?.[String(id)]?.level,0)}
  function items(fit){return Array.isArray(fit?.items)?fit.items:[]}
  function itemCount(row){return Math.max(1,n(row?.quantity,1))}
  function crystalKey(row){
    const name=String(row?.name||'');
    const m=name.match(/Type\s+([ABC])\s+(II|I)\b/i);
    return m?`${m[1].toUpperCase()}-Type ${m[2].toUpperCase()==='II'?'T2':'T1'}`:null;
  }
  function isCargoFlag(flag){
    const raw=String(flag??'').trim().toLowerCase();
    return raw==='5'||raw==='cargo'||raw.includes('cargo');
  }
  function detectCrystalDetails(fit){
    const crystals=items(fit).map(row=>({row,key:crystalKey(row)})).filter(x=>x.key);
    const unique=(rows)=>[...new Set(rows.map(x=>x.key))];

    // A crystal actually assigned outside Cargo takes priority. This prevents
    // spare crystals saved in cargo from changing the mining calculation.
    const loaded=unique(crystals.filter(x=>!isCargoFlag(x.row?.flag)));
    if(loaded.length===1)return{key:loaded[0],source:'loaded',ambiguous:false};
    if(loaded.length>1)return{key:'None',source:'loaded',ambiguous:true};

    // If no loaded crystal is visible, cargo is only used when it contains one
    // unambiguous A/B/C tier. Multiple spare crystal types are not guessed.
    const cargo=unique(crystals.filter(x=>isCargoFlag(x.row?.flag)));
    if(cargo.length===1)return{key:cargo[0],source:'cargo-fallback',ambiguous:false};
    if(cargo.length>1)return{key:'None',source:'cargo-fallback',ambiguous:true};

    return{key:'None',source:'none',ambiguous:false};
  }
  function detectCrystal(fit){return detectCrystalDetails(fit).key}
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
  function detectBoostCharges(fit){
    const names=items(fit).map(x=>String(x.name||''));
    const optimization=names.some(x=>/Mining Laser Optimization Charge/i.test(x));
    const efficiency=names.some(x=>/Mining Laser Efficiency Charge/i.test(x));
    const fieldEnhancement=names.some(x=>/Mining Laser Field Enhancement Charge/i.test(x));
    const preservation=names.some(x=>/Mining Equipment Preservation Charge/i.test(x));
    const detected=[];
    if(optimization)detected.push('Optimization');
    if(efficiency)detected.push('Efficiency');
    if(fieldEnhancement)detected.push('Field Enhancement');
    if(preservation)detected.push('Equipment Preservation');
    return {optimization,efficiency,fieldEnhancement,preservation,names:detected};
  }
  function detectEfficiencyCharge(fit){return detectBoostCharges(fit).efficiency}
  function detectOptimizationCharge(fit){return detectBoostCharges(fit).optimization}
  function firstRecognized(itemsList,map){
    for(const row of itemsList)if(Object.prototype.hasOwnProperty.call(map,String(row.name||'')))return String(row.name);
    return 'None';
  }
  function boostBreakdown(data,skills,fit,mindlink){
    const ship=String(fit?.shipName||'');
    if(!['Porpoise','Orca','Rorqual','Outrider'].includes(ship)){
      return {ship:'None',core:'None',burst:'T1',cycleReduction:0,efficiencyBoost:0,rangeBonus:0,commonMultiplier:1,charges:{optimization:false,efficiency:false,fieldEnhancement:false,preservation:false,names:[]}};
    }
    const core=detectCoreTier(fit),burst=detectBurstTier(fit);
    const row=data.boostShips?.[`${ship}-${core}`]||data.boostShips?.[`${ship}-None`];
    if(!row)return {ship,core,burst,cycleReduction:0,efficiencyBoost:0,rangeBonus:0,commonMultiplier:1,charges:detectBoostCharges(fit)};
    const ids=data.skillIds||{}, bonuses=data.skillBonuses||{}, b=data.boost||{};
    const commandSkill=level(skills,ship==='Rorqual'?ids.capitalIndustrialShips:(ship==='Outrider'?ids.commandDestroyers:ids.industrialCommandShips));
    const director=level(skills,ids.miningDirector);
    const burstBonus=burst==='T2'?n(b.burstModuleT2Bonus):n(b.burstModuleT1Bonus);
    const mindlinkBonus=mindlink?n(b.mindlinkBonus):0;
    const common=(1+burstBonus)*(1+n(row.coreBurstStrengthBonus))*(1+n(row.commandShipBonus)*commandSkill)*(1+n(bonuses.miningDirectorBurstPerLevel)*director)*(1+mindlinkBonus);
    const charges=detectBoostCharges(fit);
    const cycleReduction=charges.optimization?n(b.optimizationBase)*common:0;
    const efficiencyBoost=charges.efficiency?n(b.efficiencyBase)*common:0;
    const rangeBonus=charges.fieldEnhancement?n(b.fieldEnhancementBase)*common:0;
    return {ship,core,burst,commandSkill,director,cycleReduction,efficiencyBoost,rangeBonus,commonMultiplier:common,charges};
  }
  function normalizeDuration(v,fallback){
    const x=optionalNumber(v,NaN);
    if(!Number.isFinite(x))return n(fallback);
    return x>1000?x/1000:x;
  }
  function normalizeChance(v,fallback){
    const x=optionalNumber(v,NaN);
    if(!Number.isFinite(x))return n(fallback);
    return x>0.5?x/100:x;
  }
  function normalizeBonusYield(v,fallback){
    const x=optionalNumber(v,NaN);
    if(!Number.isFinite(x))return n(fallback);
    return x>10?x/100:x;
  }
  function calculate({data,minerSkills={},minerFit=null,crystalKey='None',boosterSkills={},boosterFit=null,mindlink=false}={}){
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
      const retryMs=Date.parse(String(minerFit.abyssalRetryAfter||''))-Date.now();
      const code=String(minerFit.abyssalErrorCode||'');
      if(code==='A01'||(Number.isFinite(retryMs)&&retryMs>0)){
        const mins=Number.isFinite(retryMs)&&retryMs>0?Math.max(1,Math.ceil(retryMs/60000)):null;
        throw new Error(`[A01] WAIT ESI — Abyssal data for "${minerFit.name||'this fit'}" is waiting on the next ESI asset snapshot${mins?` (~${mins}m)`:''}. Last saved rolls are not being mixed with another fit.`);
      }
      if(code==='A02'||minerFit.abyssalMatch==='ambiguous'){
        throw new Error(`[A02] MULTIPLE MATCHES — fresh ESI still has more than one physical ship matching "${minerFit.name||'this fit'}". JLR will not guess.`);
      }
      throw new Error(`[A03] NO MATCH — fresh ESI cannot verify the saved Abyssal items for "${minerFit.name||'this fit'}". The old item IDs may have been sold, moved, or replaced.`);
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
    const detectedCrystal=detectCrystalDetails(minerFit);
    let chosenCrystal=String(crystalKey||'None');
    if(chosenCrystal==='Auto')chosenCrystal=detectedCrystal.key;
    if(!data.crystals?.[chosenCrystal])chosenCrystal='None';
    const boost=boostBreakdown(data,boosterSkills,boosterFit,mindlink);

    let totalM3s=0,totalBasePerCycle=0,totalBonusPerCycle=0;
    const lasers=[];

    function addLaser({displayName,sourceName,quantity=1,miningAmount,duration,optimalRange,criticalSuccessChance,criticalSuccessBonusYield,abyssal=false,itemId='',typeId=0,locationFlag=''}){
      const modulated=/^Modulated (Deep Core )?Strip Miner II$/.test(sourceName);
      const crystal=modulated?(data.crystals?.[chosenCrystal]||data.crystals?.None):(data.crystals?.None||{yieldModifier:1,durationMultiplier:1});
      const baseYield=n(miningAmount)*n(crystal.yieldModifier,1)*
        (1+n(ship.roleYield))*
        (1+n(sb.miningYieldPerLevel)*mining)*
        (1+n(sb.astrogeologyYieldPerLevel)*astro)*
        (1+n(ship.miningBargeYieldPerLevel)*barge)*
        (1+n(ship.exhumerYieldPerLevel)*exhumers)*
        (1+upgradeBonus);
      const unboostedCritChance=n(criticalSuccessChance)*
        (1+n(sb.miningExploitationCritChancePerLevel)*exploitation)*
        (1+n(chipset.criticalSuccessChanceBonus));
      const critChance=unboostedCritChance*(1+n(boost.efficiencyBoost));
      const critYield=n(criticalSuccessBonusYield)*
        (1+n(sb.miningPrecisionCritYieldPerLevel)*precision)*
        (1+n(chipset.criticalSuccessYieldBonus));
      const unboostedBonusYield=baseYield*unboostedCritChance*critYield;
      const bonusYield=baseYield*critChance*critYield;
      const unboostedDuration=n(duration)*
        n(crystal.durationMultiplier,1)*
        (1+n(ship.exhumerDurationPerLevel)*exhumers)*
        (1+n(ship.roleDuration));
      const finalDuration=unboostedDuration*Math.max(0.001,1-n(boost.cycleReduction));
      const m3s=(baseYield+bonusYield)/finalDuration;
      const unboostedM3s=(baseYield+unboostedBonusYield)/unboostedDuration;
      const baseM3s=baseYield/finalDuration;
      const unboostedBaseM3s=baseYield/unboostedDuration;
      totalM3s+=m3s*quantity;
      totalBasePerCycle+=baseYield*quantity;
      totalBonusPerCycle+=bonusYield*quantity;
      const baseOptimalRange=n(optimalRange);
      const finalOptimalRange=baseOptimalRange>0?baseOptimalRange*(1+n(boost.rangeBonus)):0;
      lasers.push({
        name:displayName,sourceName,quantity,itemId:String(itemId||''),typeId:Number(typeId||0),locationFlag:String(locationFlag||''),
        baseYield,bonusYield,totalYield:baseYield+bonusYield,duration:finalDuration,m3s,
        baseOptimalRange,optimalRange:finalOptimalRange,crystal:modulated?chosenCrystal:'None',abyssal,
        withoutBuff:{baseYield,bonusYield:unboostedBonusYield,totalYield:baseYield+unboostedBonusYield,duration:unboostedDuration,baseM3s:unboostedBaseM3s,m3s:unboostedM3s,optimalRange:baseOptimalRange},
        withBuff:{baseYield,bonusYield,totalYield:baseYield+bonusYield,duration:finalDuration,baseM3s,m3s,optimalRange:finalOptimalRange},
      });
    }

    for(const row of normalLaserRows){
      const name=String(row.name||''),q=itemCount(row),laser=data.lasers[name];
      addLaser({
        displayName:name,sourceName:name,quantity:q,
        miningAmount:n(laser.miningAmount),
        duration:n(laser.duration),
        optimalRange:n(laser.optimalRange),
        criticalSuccessChance:n(laser.criticalSuccessChance),
        criticalSuccessBonusYield:n(laser.criticalSuccessBonusYield),
      });
    }

    // Treat every Abyssal strip miner as a unique physical module. Saved EVE
    // fittings can contain one row per high slot with the same mutated type ID;
    // do not reuse the first roll for each row. Prefer the matching HiSlot flag,
    // then fall back to the next unused module of that type.
    const dynamicByType=new Map();
    const seenDynamicItemIds=new Set();
    for(const mod of Array.isArray(minerFit.abyssalLasers)?minerFit.abyssalLasers:[]){
      const itemId=String(mod?.itemId||'');
      if(itemId&&seenDynamicItemIds.has(itemId))continue;
      if(itemId)seenDynamicItemIds.add(itemId);
      const key=String(mod.typeId);
      if(!dynamicByType.has(key))dynamicByType.set(key,[]);
      dynamicByType.get(key).push(mod);
    }
    const slotNumber=flag=>{
      const match=String(flag||'').match(/^HiSlot(\d+)$/i);
      return match?Number(match[1]):Number.MAX_SAFE_INTEGER;
    };
    for(const mods of dynamicByType.values()){
      mods.sort((a,b)=>slotNumber(a?.locationFlag)-slotNumber(b?.locationFlag)
        ||String(a?.itemId||'').localeCompare(String(b?.itemId||''),undefined,{numeric:true}));
    }
    const usedDynamicModules=new Set();
    function takeDynamicModule(typeId,preferredFlag=''){
      const mods=dynamicByType.get(String(typeId))||[];
      const available=mods.filter(mod=>!usedDynamicModules.has(mod));
      const wanted=String(preferredFlag||'');
      const chosen=(wanted?available.find(mod=>String(mod?.locationFlag||'')===wanted):null)||available[0]||null;
      if(chosen)usedDynamicModules.add(chosen);
      return chosen;
    }
    for(const row of abyssalRows){
      const needed=itemCount(row),selected=[];
      for(let index=0;index<needed;index++){
        const mod=takeDynamicModule(row.typeId,index===0?row.flag:'');
        if(!mod)throw new Error('Abyssal roll data is incomplete for this fit.');
        selected.push(mod);
      }
      for(const mod of selected){
        const sourceName=String(mod.sourceName||'');
        const base=data.lasers?.[sourceName];
        if(!base)throw new Error(`Abyssal source ${sourceName||mod.sourceTypeId||'unknown'} is not supported.`);
        addLaser({
          displayName:String(mod.name||row.name||'Abyssal Strip Miner'),
          sourceName,
          quantity:1,
          itemId:mod.itemId,
          typeId:mod.typeId,
          locationFlag:mod.locationFlag,
          miningAmount:optionalNumber(mod.miningAmount,n(base.miningAmount)),
          duration:normalizeDuration(mod.duration,base.duration),
          optimalRange:optionalNumber(mod.optimalRange,n(base.optimalRange)),
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
      crystalSource:chosenCrystal===detectedCrystal.key?detectedCrystal.source:'manual',
      crystalAmbiguous:chosenCrystal===detectedCrystal.key?detectedCrystal.ambiguous:false,
      chipset:chipsetName,
      miningUpgradeBonus:upgradeBonus,
      miningUpgrades:upgradeParts,
      boost,
      skills:{mining,astrogeology:astro,miningBarge:barge,exhumers,miningExploitation:exploitation,miningPrecision:precision},
      lasers,
      abyssalLasers:lasers.filter(x=>x.abyssal).sort((a,b)=>n(a.withBuff?.m3s)-n(b.withBuff?.m3s)||String(a.itemId).localeCompare(String(b.itemId),undefined,{numeric:true})),
      baseYieldPerCycle:totalBasePerCycle,
      expectedCriticalBonusPerCycle:totalBonusPerCycle,
      m3PerSecond:totalM3s,
      m3PerHour:totalM3s*3600,
    };
  }
  globalThis.JLRYieldMath={calculate,detectCrystal,detectCrystalDetails,detectCoreTier,detectBurstTier,detectBoostCharges,detectEfficiencyCharge,detectOptimizationCharge,boostBreakdown};
})();
