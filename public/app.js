'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  let me = null;
  let state = null;
  let filter = 'all';
  let selectedSystem = '';
  let pending = null;
  let audio = null;
  let audioUnlocked = false;
  let audioResumePending = false;
  let soundEnabled = localStorage.getItem('jlrSoundEnabled') !== 'false';
  const THEME_IDS = new Set(['void','citadel','industrial','serpentis','blood','angel','edencom','aurora','neon','glacier','solar']);
  const savedThemeRaw=localStorage.getItem('jlrTheme');
  const savedTheme=savedThemeRaw==='forge'?'industrial':savedThemeRaw;
  if(savedThemeRaw==='forge')localStorage.setItem('jlrTheme','industrial');
  let activeTheme = THEME_IDS.has(savedTheme) ? savedTheme : 'void';
  document.documentElement.dataset.theme=activeTheme;
  let toastTimer = null;
  let eventSource = null;
  let companionClipboardSource = null;
  let companionClipboardBusy = false;
  let fleetPerformanceRefreshPromise = null;
  let fleetPerformanceSnapshotPromise = null;
  let fleetPerformanceSnapshotRequestKey = '';
  let fleetPerformanceData = null;
  let fleetPerformanceSelectionKey = '';
  let fleetPerformanceError = '';
  let scanCharacterId = localStorage.getItem('jlrScanCharacter') || '';
  let scanBusy = false;
  let scoutLocationTimer = null;
  let scoutLocationBusy = false;
  let companionStatusTimer = null;
  let companionStatusBusy = false;
  let appraisalData = null;
  let appraisalBusy = false;
  let appraisalMarkets = [];
  let appraisalMarketsBusy = false;
  let appraisalRefineRateTouched = false;
  let stateRenderFrame = 0;
  let stateRenderPending = false;
  const scoutLastSystem = new Map();
  const scoutLocations = new Map();
  const scoutLocationErrors = new Map();
  let scoutLocationCursor = 0;
  let scoutFollowEnabled = localStorage.getItem('jlrScoutFollow') !== 'false';
  let scoutSelectedCharacterId = localStorage.getItem('jlrScoutCharacter') || '';
  let scoutTargets = [];
  let scoutNearestScan = null;
  let adamNavigationRecommendation = null;
  let scoutTargetsLoading = false;
  let scoutTargetsRefreshPending = false;
  let scoutTargetsError = '';
  let scoutTargetsOriginSystem = '';
  let scoutPromptKey = '';
  let adamCurrentTimer = null;
  let merIntel = null;
  let merIntelError = '';
  let pvpIntel = null;
  let pvpIntelError = '';
  let pvpIntelLoading = false;
  let pvpIntelPoll = null;
  let pvpIntelPollCount = 0;
  const savedPvpMemberRankMode=localStorage.getItem('jlrPvpMemberRankMode');
  let pvpMemberRankMode=['overall','activity','isk','damage','lifetime'].includes(savedPvpMemberRankMode)?savedPvpMemberRankMode:'overall';
  let pvpPinnedCharacterId=localStorage.getItem('jlrPvpPinnedCharacter')||'';
  let pvpToonMenuOpen=false;
  let pvpLifetimeDamage=null;
  let pvpLifetimeDamageLoading=false;
  let pvpLifetimeDamageError='';
  let pvpLifetimeDamagePoll=null;
  let threatScanData=null;
  let threatScanLoading=false;
  let threatScanError='';
  let threatScanPoll=null;
  let threatScanPollCount=0;
  let threatScanRequestSeq=0;
  let threatScanText='';
  let threatIgnorePositive=localStorage.getItem('jlrThreatIgnorePositive')!=='false';
  let threatIgnoreOwn=localStorage.getItem('jlrThreatIgnoreOwn')!=='false';
  let threatShareLoading=false;
  let threatShareUrl=localStorage.getItem('jlrThreatShareUrl')||'';
  let threatShareError='';
  let threatShareEditOpen=false;
  let threatShareEditLoading=false;
  let threatShareSaving=false;
  let threatShareRecord=null;
  let threatShareEditError='';
  let ceoCommandStatus=null;
  let ceoCommandLoading=false;
  let ceoFinanceData=null;
  let ceoFinanceLoading=false;
  let ceoSelectedMonth='';
  let ceoLoyaltyBusy=false;
  let ledgerAuditLoading=false;
  let myLedgerSummary=null;
  let brainLastSystem='';
  let adamAskBusy=false;
  let adamWorkingTab=localStorage.getItem('jlrAdamWorkingTab')||'fields';
  let adamLastDoctrineItem='';
  let adamLastDoctrineItemAt=0;
  let adamRecentActions=[];
  try{adamRecentActions=JSON.parse(localStorage.getItem('jlrAdamRecentActions')||'[]')}catch{}
  if(!Array.isArray(adamRecentActions))adamRecentActions=[];
  adamRecentActions=adamRecentActions.filter(row=>row&&Date.now()-Number(row.at||0)<6*60*60*1000).slice(-16);
  let adamOreSurveyContext=null;
  try{adamOreSurveyContext=JSON.parse(localStorage.getItem('jlrAdamOreSurveyContext')||'null')}catch{}
  if(!adamOreSurveyContext||Date.now()-Number(adamOreSurveyContext.at||0)>6*60*60*1000)adamOreSurveyContext=null;
  const DEFAULT_FLEET = { members:{}, uptime:100, payout:95, order:[] };
  function loadFleet() {
    try {
      const raw=JSON.parse(localStorage.getItem('jlrFleet')||'{}');
      return {
        members:raw.members&&typeof raw.members==='object'?raw.members:{},
        uptime:Math.min(100,Math.max(1,Number(raw.uptime)||100)),
        payout:Math.min(100,Math.max(1,Number(raw.payout)||95)),
        order:Array.isArray(raw.order)?raw.order.map(String):[],
      };
    } catch { return { ...DEFAULT_FLEET, members:{}, order:[] }; }
  }
  let fleetSettings = loadFleet();
  let fleetArrangeMode=false;
  let fleetUpgradeMode=localStorage.getItem('jlrFleetUpgradeMode')==='true';
  let fleetDragId='';
  let fleetSearchText='';
  let fleetViewFilter=['all','selected','miners','nofit'].includes(localStorage.getItem('jlrFleetViewFilter'))?localStorage.getItem('jlrFleetViewFilter'):'all';
  let fleetSortMode=['yield-asc','alpha','custom'].includes(localStorage.getItem('jlrFleetSortMode'))?localStorage.getItem('jlrFleetSortMode'):'yield-asc';
  const DEFAULT_CALC = { boosterCharacterId:'', boosterFittingId:'', mindlink:true };
  function loadCalc(){try{return{...DEFAULT_CALC,...JSON.parse(localStorage.getItem('jlrMiningCalc')||'{}')}}catch{return{...DEFAULT_CALC}}}
  let calcSettings=loadCalc();
  delete calcSettings.efficiencyCharge;
  delete calcSettings.minerCharacterId;
  delete calcSettings.fittingId;
  delete calcSettings.crystal;
  let iceTrackType=localStorage.getItem('jlrIceType')||'Blue Ice IV-Grade';
  let gasRegion=localStorage.getItem('jlrGasRegion')||'Fountain';
  let gasType=localStorage.getItem('jlrGasType')||'Celadon Cytoserocin';
  let doctrineMarket=null;
  let doctrineMarketLoading=false;
  let doctrineMarketError='';
  let doctrineMarketPoll=null;
  let doctrineView=['restock','seed','alerts','all'].includes(localStorage.getItem('jlrDoctrineView'))?localStorage.getItem('jlrDoctrineView'):'restock';
  let doctrineSearch='';
  let doctrineClass='all';
  let doctrineCategory='all';
  function loadDoctrineShoppingList(){
    try{
      const rows=JSON.parse(localStorage.getItem('jlrDoctrineShoppingList')||'[]');
      return Array.isArray(rows)?rows
        .map(row=>({typeId:Number(row?.typeId)||0,qty:Math.max(1,Math.floor(Number(row?.qty)||1))}))
        .filter(row=>row.typeId):[];
    }catch{return[]}
  }
  let doctrineShoppingList=loadDoctrineShoppingList();
  let doctrineShoppingMode=localStorage.getItem('jlrDoctrineShoppingMode')==='shortfall'?'shortfall':'full';
  let doctrineShoppingOpen=localStorage.getItem('jlrDoctrineShoppingOpen')==='true';
  let oreTrendType=localStorage.getItem('jlrOreTrend')||'Kylixium';
  const savedFleetHistoryDays=Number(localStorage.getItem('jlrFleetHistoryDays'));
  let fleetHistoryDays=[7,30,90].includes(savedFleetHistoryDays)?savedFleetHistoryDays:7;
  let fleetHistoryMetric=localStorage.getItem('jlrFleetHistoryMetric')==='value'?'value':'m3';
  let fleetRateMetric=localStorage.getItem('jlrFleetRateMetric')==='efficiency'?'efficiency':'rate';
  let fleetChartPinnedDate='';
  let targetOre=localStorage.getItem('jlrTargetOre')||'auto';
  const BOARD_SIZES=['small','medium','large'];
  function normalizeBoardKey(value){
    const key=String(value||'');
    return key.includes(':')?key:`t3:${key}`;
  }
  function loadBoardPrefs(){
    try{
      const raw=JSON.parse(localStorage.getItem('jlrFieldBoard')||'{}');
      return {
        order:Array.isArray(raw.order)?raw.order.map(normalizeBoardKey):[],
        favorites:Array.isArray(raw.favorites)?raw.favorites.map(normalizeBoardKey):[],
        size:BOARD_SIZES.includes(raw.size)?raw.size:'medium',
      };
    }catch{return{order:[],favorites:[],size:'medium'}}
  }
  let boardPrefs=loadBoardPrefs();
  let boardArrangeMode=false;
  let boardDragKey='';
  let boardSuppressClickUntil=0;
  const statusText = {ready:'GREEN • MINEABLE',picked:'YELLOW • PICKED',cleared:'RED • RESPAWN'};

  function themeIconMarkup(key){
    const k=String(key||'void').toLowerCase();
    const icons={
      void:'<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="9"/><ellipse cx="32" cy="32" rx="25" ry="12" transform="rotate(-24 32 32)"/><circle cx="51" cy="20" r="3" class="fill"/></svg>',
      citadel:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 7 51 16v14c0 14-8 23-19 29C21 53 13 44 13 30V16Z"/><path d="M24 42V24h16v18M20 30h24M29 18h6"/></svg>',
      industrial:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m32 7 8 5 9-1 4 8 7 5-2 9 2 9-7 5-4 8-9-1-8 5-8-5-9 1-4-8-7-5 2-9-2-9 7-5 4-8 9 1Z"/><circle cx="32" cy="32" r="10"/><path d="M22 45 43 20M38 18l7 7"/></svg>',
      serpentis:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M47 13c-8-5-22-2-23 7-1 8 18 7 18 16 0 10-15 15-26 9"/><path d="M17 45c8 6 22 5 25-4"/><circle cx="45" cy="15" r="3" class="fill"/></svg>',
      blood:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 45 24 38 55H26l-7-31Z"/><path d="M20 24h24M32 11v44M25 35l7-7 7 7"/><circle cx="32" cy="24" r="4" class="fill"/></svg>',
      angel:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M31 21 17 12 5 18l13 10L7 34l15 4-8 11 18-8"/><path d="m33 21 14-9 12 6-13 10 11 6-15 4 8 11-18-8"/></svg>',
      edencom:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 52 16v15c0 13-8 22-20 28C20 53 12 44 12 31V16Z"/><path d="m36 15-12 20h9l-5 15 15-22h-9Z" class="fill"/></svg>',
      aurora:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M5 42c10-22 17-26 27-10s16 15 27-8"/><path d="M7 50c11-13 20-12 28-2s14 8 22-4"/><path d="M10 29c8-15 16-14 24-4s14 8 20-3"/></svg>',
      neon:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m32 7 22 12v26L32 57 10 45V19Z"/><path d="m10 19 22 12 22-12M32 31v26M21 25l22-12M21 51V25M43 51V13"/></svg>',
      glacier:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M31 4 50 23 42 57H18L10 31Z"/><path d="m31 4-5 25 16 28M10 31l16-2 24-6M26 29l-8 28"/></svg>',
      solar:'<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="12" class="fill"/><circle cx="32" cy="32" r="18"/><path d="M32 3v10M32 51v10M3 32h10M51 32h10M11 11l7 7M46 46l7 7M53 11l-7 7M18 46l-7 7"/></svg>',
    };
    return icons[k]||icons.void;
  }
  function syncThemeControl(theme=activeTheme){
    const select=$('themeSelect');
    const icon=$('themeSelectIcon');
    if(!select)return;
    if(select.value!==theme)select.value=theme;
    const option=select.options[select.selectedIndex];
    if(icon){
      icon.dataset.themeIcon=String(option?.dataset?.themeIcon||theme||'void');
      icon.innerHTML=themeIconMarkup(icon.dataset.themeIcon);
      icon.title=String(option?.textContent||'Theme').trim();
    }
  }
  function applyTheme(theme){
    const next=THEME_IDS.has(theme)?theme:'void';
    activeTheme=next;
    document.documentElement.dataset.theme=next;
    localStorage.setItem('jlrTheme',next);
    syncThemeControl(next);
  }

  function fmt(v, kind='num') {
    v = Number(v || 0);
    const abs = Math.abs(v);
    if (abs >= 1e12) return `${(v/1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${(v/1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(v/1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(v/1e3).toFixed(kind==='m3'?0:1)}K`;
    return v.toFixed(0);
  }
  function timer(iso) {
    if (!iso) return 'NO TIMER';
    let s = Math.max(0, Math.floor((Date.parse(iso)-Date.now())/1000));
    const h=Math.floor(s/3600); s%=3600; const m=Math.floor(s/60); s%=60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function ago(iso) {
    if (!iso) return 'not yet'; const ms=Date.now()-Date.parse(iso); if(!Number.isFinite(ms))return 'time unavailable';
    const m=Math.max(0,Math.floor(ms/60000)); if(m<1)return 'just now'; if(m<60)return `${m}m ago`; const h=Math.floor(m/60); if(h<24)return `${h}h ${m%60}m ago`; return `${Math.floor(h/24)}d ago`;
  }
  function until(iso){
    if(!iso)return'';
    const ms=Date.parse(iso)-Date.now();
    if(!Number.isFinite(ms))return'';
    if(ms<=0)return'ready now';
    const m=Math.ceil(ms/60000);
    if(m<60)return`in ${m}m`;
    const h=Math.floor(m/60),rem=m%60;
    return rem?`in ${h}h ${rem}m`:`in ${h}h`;
  }
  function esiCacheLabel(cache){
    if(!cache)return'';
    const source=cache.lastModified?ago(cache.lastModified):'time unavailable';
    const next=until(cache.freshUntil);
    return next?`ESI source ${source} • cache ${next}`:`ESI source ${source}`;
  }
  function renderDataStatus(){
    const el=$('liveBadge');
    const versionEl=$('appVersion');
    if(versionEl)versionEl.textContent='v'+String(state?.app?.version||'2.10.12');
    if(!el)return;
    if(state?.esi?.syncing){
      el.textContent='● SYNCING EVE DATA';
      el.title='Skills, saved fits, assets, and mining ledger are being refreshed.';
    }else if(state?.esi?.lastError){
      el.textContent='⚠ EVE SYNC ERROR';
      el.title=String(state.esi.lastError);
    }else if(state?.esi?.lastSyncAt){
      const dbg=state?.esi?.ledgerDebug||null;
      if(dbg&&!dbg.cacheComplete){
        el.textContent='● EVE LEDGER '+Number(dbg.cachedCharacters||0)+'/'+Number(dbg.linkedCharacters||0);
        el.title='Mining-ledger coverage is '+Number(dbg.cachedCharacters||0)+' of '+Number(dbg.linkedCharacters||0)+'. Available cached characters are included in the app payout; missing characters are excluded until they sync.';
      }else{
        el.textContent='● EVE DATA '+ago(state.esi.lastSyncAt).toUpperCase();
        el.title='Latest successful EVE character-data sync: '+ago(state.esi.lastSyncAt)+'.';
      }
    }else{
      el.textContent='● EVE DATA PENDING';
      el.title='No successful EVE character-data sync has completed yet.';
    }
  }
  function adamRecordAction(kind,detail={}){
    const row={
      kind:String(kind||'').slice(0,60),
      at:Date.now(),
      tab:String(detail.tab||activeTab||'').slice(0,40),
      system:String(detail.system||'').slice(0,80),
      characterName:String(detail.characterName||'').slice(0,120),
      detail:String(detail.detail||'').slice(0,160),
    };
    if(!row.kind)return;
    const previous=adamRecentActions.at(-1);
    if(previous&&previous.kind===row.kind&&previous.tab===row.tab&&previous.system===row.system&&previous.characterName===row.characterName){
      adamRecentActions[adamRecentActions.length-1]=row;
    }else{
      adamRecentActions.push(row);
      adamRecentActions=adamRecentActions.slice(-16);
    }
    localStorage.setItem('jlrAdamRecentActions',JSON.stringify(adamRecentActions));
    renderAdamContext();
  }
  function adamSaveOreSurveyContext(survey,system=''){
    const groups=(Array.isArray(survey?.groups)?survey.groups:[]).slice(0,12).map(group=>({
      name:String(group?.name||'').slice(0,80),
      rocks:Math.max(0,Number(group?.rocks)||0),
      volumeM3:Math.max(0,Number(group?.volumeM3)||0),
      pricedValueISK:Math.max(0,Number(group?.pricedValueISK)||0),
      pricedRows:Math.max(0,Number(group?.pricedRows)||0),
      unpricedRows:Math.max(0,Number(group?.unpricedRows)||0),
      nearestMeters:Number.isFinite(Number(group?.nearestMeters))?Math.max(0,Number(group.nearestMeters)):null,
    })).filter(group=>group.name);
    adamOreSurveyContext={
      at:Date.now(),
      system:String(system||'').slice(0,80),
      rowCount:Math.max(0,Number(survey?.rowCount)||0),
      totalVolumeM3:Math.max(0,Number(survey?.totalVolumeM3)||0),
      pricedValueISK:Math.max(0,Number(survey?.pricedValueISK)||0),
      unpricedRowCount:Math.max(0,Number(survey?.unpricedRowCount)||0),
      pricingBasis:String(survey?.pricingBasis||'').slice(0,40),
      sourceFormat:String(survey?.sourceFormat||'').slice(0,40),
      groups,
    };
    localStorage.setItem('jlrAdamOreSurveyContext',JSON.stringify(adamOreSurveyContext));
    return adamOreSurveyContext;
  }
  function adamResolveTrackedSystem(value){
    const candidate=String(value||'').trim().toUpperCase();
    if(!candidate)return'';
    const systems=Object.keys(state?.fields||{});
    const exact=systems.find(system=>String(system).toUpperCase()===candidate);
    if(exact)return exact;
    const compact=candidate.replace(/[^A-Z0-9]/g,'');
    if(!compact)return'';
    const matches=systems.filter(system=>{
      const upper=String(system).toUpperCase();
      const systemCompact=upper.replace(/[^A-Z0-9]/g,'');
      return upper.startsWith(candidate+'-')||systemCompact.startsWith(compact);
    });
    return matches.length===1?matches[0]:'';
  }
  function adamOreSurveySystemAssignment(text){
    if(!adamOreSurveyContext||Date.now()-Number(adamOreSurveyContext.at||0)>6*60*60*1000)return'';
    const raw=String(text||'').trim();
    const patterns=[
      /^(?:this|that|it)\s+(?:is|was)\s+(?:in\s+)?([a-z0-9-]{2,16})[.!?]*$/i,
      /^(?:it'?s|its)\s+(?:in\s+)?([a-z0-9-]{2,16})[.!?]*$/i,
      /^(?:the\s+)?system\s+(?:is\s+)?([a-z0-9-]{2,16})[.!?]*$/i,
      /^in\s+([a-z0-9-]{2,16})[.!?]*$/i,
      /^([a-z0-9-]{2,16})[.!?]*$/i,
    ];
    for(const pattern of patterns){
      const match=raw.match(pattern);
      if(!match)continue;
      const resolved=adamResolveTrackedSystem(match[1]);
      if(resolved)return resolved;
    }
    return'';
  }
  function adamOreSurveyLinkedText(system){
    const survey=adamOreSurveyContext||{};
    const unpriced=Math.max(0,Number(survey.unpricedRowCount)||0);
    const payout=survey.pricingBasis==='jlr-95-refined';
    const refined=payout||survey.pricingBasis==='jlr-refined';
    const rowWord=survey.sourceFormat==='ore-inventory'?'stacks':'rocks';
    return 'Got it — I linked the last ore survey to '+system+'. '
      +Math.max(0,Number(survey.rowCount)||0)+' '+rowWord+' • '
      +fmt(survey.totalVolumeM3||0,'m3')+' m³ • '
      +fmt(survey.pricedValueISK||0)+' ISK '+(payout?'95% JBV payout value':(refined?'refined value':'from priced rocks'))
      +(unpriced?' • '+unpriced+' rock'+(unpriced===1?'':'s')+' still unpriced':'')+'.';
  }

  function adamPerformanceContext(){
    try{
      const performance=scopedFleetPerformance();
      const samples=Array.isArray(performance?.samples)?performance.samples:[];
      const latest=samples.at(-1)||null;
      const previous=samples.length>1?samples[samples.length-2]:null;
      const target=Number(fleetStats()?.total||0);
      return{
        latestRate:Math.max(0,Number(latest?.actualM3PerHour)||0),
        previousRate:Math.max(0,Number(previous?.actualM3PerHour)||0),
        targetRate:Math.max(0,target),
        activeToons:Math.max(0,Number(latest?.activeToons)||0),
        sampledToons:Math.max(0,Number(latest?.sampledToons)||0),
        sampleAt:String(latest?.at||''),
      };
    }catch{return{latestRate:null,previousRate:null,targetRate:null,activeToons:null,sampledToons:null,sampleAt:''}}
  }
  function adamWorkflow(){
    const cutoff=Date.now()-30*60*1000;
    const recent=adamRecentActions.filter(row=>Number(row?.at||0)>=cutoff);
    const sourceTab=activeTab==='brain'?(adamWorkingTab||'fields'):activeTab;
    const recentScan=recent.some(row=>row.kind==='scan-updated');
    const recentScout=recent.some(row=>row.kind==='location-check'||row.kind==='scout-target');
    const recentOreSurvey=recent.some(row=>row.kind==='ore-survey'||row.kind==='ore-survey-system');
    if(activeTab==='brain'&&recentOreSurvey)return'ore-survey';
    if(sourceTab==='fields'&&recentScan)return'scan-update';
    if(activeTab==='brain'&&recentScout)return'scout-routing';
    if(sourceTab==='performance')return'performance-review';
    if(sourceTab==='fleet')return'fleet-setup';
    if(sourceTab==='fields')return'field-review';
    if(sourceTab==='threat')return'threat-review';
    if(sourceTab==='doctrine')return'doctrine-market';
    return sourceTab?sourceTab+'-review':'general';
  }
  function adamContextSnapshot(){
    const selectedCharacter=(me?.characters||[]).find(row=>String(row.characterId)===String(scanCharacterId))||null;
    const workflow=adamWorkflow();
    const currentContextTab=activeTab==='brain'&&workflow!=='scout-routing'?(adamWorkingTab||'fields'):activeTab;
    const fieldContext=currentContextTab==='fields'||currentContextTab==='brain';
    return{
      currentTab:currentContextTab,
      workflow,
      selectedSystem:fieldContext?(selectedSystem||$('systemSelect')?.value||''):'',
      selectedCharacterId:fieldContext?String(selectedCharacter?.characterId||scanCharacterId||''):'',
      selectedCharacterName:fieldContext?String(selectedCharacter?.name||''):'',
      selectedFleetCount:typeof selectedFleetPerformanceIds==='function'?selectedFleetPerformanceIds().length:0,
      selectedMetric:currentContextTab==='performance'?String(fleetHistoryMetric||'m3'):'',
      targetOre:String(targetOre||''),
      historyMetric:String(fleetHistoryMetric||''),
      historyDays:Number(fleetHistoryDays)||7,
      fieldStatus:selectedSystem&&state?.fields?.[selectedSystem]?String(state.fields[selectedSystem].status||''):'',
      selectedDoctrineItem:Date.now()-adamLastDoctrineItemAt<30*60*1000?adamLastDoctrineItem:'',
      performance:adamPerformanceContext(),
      recentActions:adamRecentActions.filter(row=>Date.now()-Number(row?.at||0)<60*60*1000).slice(-8),
      lastOreSurvey:adamOreSurveyContext&&Date.now()-Number(adamOreSurveyContext.at||0)<6*60*60*1000?adamOreSurveyContext:null,
    };
  }
  function adamContextLabel(context=adamContextSnapshot()){
    const parts=[String(context.currentTab||'JLR').replace(/-/g,' ').toUpperCase()];
    if(context.selectedSystem)parts.push(context.selectedSystem);
    if(context.workflow==='scan-update')parts.push('SCAN WORKFLOW');
    else if(context.currentTab==='performance'&&Number(context.selectedFleetCount)>0)parts.push(context.selectedFleetCount+' MINERS');
    else if(context.selectedCharacterName&&(context.currentTab==='fields'||context.currentTab==='brain'))parts.push(context.selectedCharacterName);
    return parts.join(' • ');
  }
  function adamPrompt(context=adamContextSnapshot()){
    const tab=context.currentTab;
    if(tab==='performance')return'Ask Adam what changed, why the rate moved, or what the ledger can actually prove…';
    if(tab==='fields')return'Ask Adam where to go next, what this system needs, or anything about the scan workflow…';
    if(tab==='fleet')return'Ask Adam about a fit, boost, miner, output target, or what you are looking at…';
    if(tab==='toons')return'Ask Adam about a toon, ESI access, location readiness, or sync state…';
    if(tab==='threat')return'Ask Adam about this threat view or what the current data means…';
    if(tab==='doctrine')return'Ask Adam which item has the best ROI, how much to buy, or what stock and sales show…';
    if(tab==='appraisal')return'Ask Adam about this appraisal, Jita buy/split/sell, volume, or what the numbers mean…';
    if(context.workflow==='scout-routing'||tab==='brain')return'Ask Adam where to go, what is closest, or what needs attention…';
    return'Ask Adam naturally about whatever you are looking at…';
  }
  function renderAdamContext(){
    const context=adamContextSnapshot();
    const contextText=adamContextLabel(context);
    const prompt=adamPrompt(context);
    const label=$('adamContextLabel');
    if(label)label.textContent=contextText;
    const quickLabel=$('adamQuickContext');
    if(quickLabel)quickLabel.textContent=contextText;
    if($('adamQuestion'))$('adamQuestion').placeholder=prompt;
    if($('adamQuickQuestion'))$('adamQuickQuestion').placeholder=prompt;
  }
  function adamLooksLikeOrePaste(text){
    return String(text||'').split(/\r?\n/).some(line=>{
      const cells=String(line||'').split('\t').map(cell=>cell.trim()).filter(Boolean);
      if(cells.length<4||!/^[\d,]+$/.test(cells[1]||''))return false;
      const volumeIndex=cells.findIndex((cell,index)=>index>=2&&/^[\d,.]+\s*m(?:3|³)$/i.test(cell));
      if(volumeIndex<2)return false;
      if(!/^(?:-|[\d,.]+\s*ISK)$/i.test(cells[volumeIndex+1]||''))return false;
      // Asteroid survey rows carry distance after value. Inventory/appraisal
      // rows instead carry a base-ore column before volume.
      return volumeIndex===2
        ?/^[\d,.]+\s*(?:km|m)$/i.test(cells[volumeIndex+2]||'')
        :volumeIndex===3;
    });
  }
  async function askAdamText(question){
    const text=String(question||'').trim();
    if(!text||adamAskBusy)return;
    const isProbeScan=/(?:^|\n)\s*[A-Z]{3}-\d{3}\s+Cosmic\s+(?:Anomaly|Signature)\b/i.test(text);
    const isOreSurvey=adamLooksLikeOrePaste(text);
    const inputs=[$('adamQuestion'),$('adamQuickQuestion')].filter(Boolean);
    const buttons=[$('adamAsk'),$('adamQuickAsk')].filter(Boolean);
    const replies=[$('adamReply'),$('adamQuickReply')].filter(Boolean);
    adamAskBusy=true;
    if($('adamUserText'))$('adamUserText').textContent=text;
    $('adamUserMessage')?.classList.remove('hidden');
    if($('adamQuickUserText'))$('adamQuickUserText').textContent=text;
    $('adamQuickUserMessage')?.classList.remove('hidden');
    for(const button of buttons){
      button.disabled=true;
      button.dataset.idleText=button.dataset.idleText||button.textContent;
      button.textContent='THINKING…';
    }
    for(const reply of replies){
      reply.classList.add('loading');
      reply.textContent='Checking JLR context…';
    }
    try{
      const oreSurveySystem=adamOreSurveySystemAssignment(text);
      if(oreSurveySystem){
        adamSaveOreSurveyContext(adamOreSurveyContext,oreSurveySystem);
        brainLastSystem=oreSurveySystem;
        if(state?.fields?.[oreSurveySystem])chooseSystem(oreSurveySystem);
        adamRecordAction('ore-survey-system',{
          system:oreSurveySystem,
          detail:String(adamOreSurveyContext?.rowCount||0)+' '+(adamOreSurveyContext?.sourceFormat==='ore-inventory'?'stacks':'rocks')+' • '+fmt(adamOreSurveyContext?.totalVolumeM3||0,'m3')+' m³',
        });
        const answer=adamOreSurveyLinkedText(oreSurveySystem);
        for(const reply of replies){reply.classList.remove('loading');reply.textContent=answer}
        for(const input of inputs)input.value='';
        return;
      }
      if(isOreSurvey){
        const survey=await api('/api/tracker/brain/ore-survey',{
          method:'POST',
          body:JSON.stringify({text}),
        });
        adamSaveOreSurveyContext(survey);
        const answer=String(survey?.text||'Adam read the ore survey.');
        for(const reply of replies){reply.classList.remove('loading');reply.textContent=answer}
        for(const input of inputs)input.value='';
        adamRecordAction('ore-survey',{
          detail:String(survey?.rowCount||0)+' '+(survey?.sourceFormat==='ore-inventory'?'stacks':'rocks')+' • '+fmt(survey?.totalVolumeM3||0,'m3')+' m³',
        });
        return;
      }
      if(isProbeScan){
        await analyzeProbeScan(text,{fromAdam:true});
        const scanStatus=$('scanStatus');
        const answer=String(scanStatus?.textContent||'Adam could not process that scan.').trim();
        for(const reply of replies){reply.classList.remove('loading');reply.textContent=answer}
        if(scanStatus?.className!=='error')for(const input of inputs)input.value='';
        return;
      }
      const context=adamContextSnapshot();
      const answerCharacterId=scoutSelectedCharacterId||scanCharacterId;
      const navigationQuestion=window.JlrAdamNavigation?.followup(text,adamNavigationRecommendation,{characterId:answerCharacterId,location:scoutLocations.get(String(answerCharacterId)),scans:state?.scans||{}})||text;
      const response=await api('/api/tracker/brain/ask',{
        method:'POST',
        body:JSON.stringify({
          question:navigationQuestion,
          characterId:answerCharacterId,
          payoutPct:Number(fleetSettings.payout),
          currentTab:context.currentTab,
          context,
        }),
      });
      const nextRecommendation=window.JlrAdamNavigation?.recommendation(response,answerCharacterId)||null;
      if(nextRecommendation)adamNavigationRecommendation=nextRecommendation;
      if(adamNavigationRecommendation&&response.location)scoutLocations.set(String(answerCharacterId),response.location);
      renderScoutTargets();
      const answer=String(response?.text||'I do not have an answer for that yet.');
      if(response?.focusItem){adamLastDoctrineItem=String(response.focusItem).slice(0,120);adamLastDoctrineItemAt=Date.now()}
      if(response?.focusSystem)brainLastSystem=String(response.focusSystem);
      else if(response?.closest?.system)brainLastSystem=String(response.closest.system);
      for(const reply of replies){
        reply.classList.remove('loading');
        reply.textContent=answer;
      }
      for(const input of inputs)input.value='';
      adamRecordAction('adam-question',{system:response?.focusSystem||response?.closest?.system||'',detail:String(response?.topic||'answer')});
    }catch(error){
      const message=String(error?.message||error||'Adam could not answer that.');
      for(const reply of replies){
        reply.classList.remove('loading');
        reply.textContent=message;
      }
    }finally{
      adamAskBusy=false;
      for(const button of buttons){
        button.disabled=false;
        button.textContent=button.dataset.idleText||'ASK';
      }
      renderAdamContext();
    }
  }

  function appraisalIsk(value){
    const n=Math.max(0,Number(value)||0);
    if(n>=1e12)return (n/1e12).toFixed(2)+'T';
    if(n>=1e9)return (n/1e9).toFixed(2)+'B';
    if(n>=1e6)return (n/1e6).toFixed(2)+'M';
    if(n>=1e3)return (n/1e3).toFixed(1)+'K';
    return Math.round(n).toLocaleString();
  }
  function appraisalPrice(value){
    const n=Math.max(0,Number(value)||0);
    return n.toLocaleString(undefined,{maximumFractionDigits:2});
  }
  function appraisalCopyNumber(value,maxFractionDigits=2){
    const n=Number(value);
    if(!Number.isFinite(n))return'';
    return n.toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:maxFractionDigits});
  }
  async function copyAppraisalValue(target){
    const value=String(target?.dataset?.appraisalCopy||'').trim();
    if(!value)return;
    const unit=String(target?.dataset?.appraisalUnit||'').trim();
    const text=unit?value+' '+unit:value;
    try{
      await navigator.clipboard.writeText(text);
      toast('Copied '+text+'.');
    }catch(error){
      toast('Could not copy appraisal value.');
    }
  }
  function appraisalVolume(value){
    const n=Math.max(0,Number(value)||0);
    if(n>=1e9)return (n/1e9).toFixed(2)+'B m³';
    if(n>=1e6)return (n/1e6).toFixed(2)+'M m³';
    if(n>=1e3)return (n/1e3).toFixed(1)+'K m³';
    return n.toLocaleString(undefined,{maximumFractionDigits:2})+' m³';
  }
  function appraisalModeLabel(value){
    const key=String(value||'split');
    if(key==='buy')return'BUY';
    if(key==='sell')return'SELL';
    if(key==='refine-buy')return'REFINE BUY';
    if(key==='refine-sell')return'REFINE SELL';
    return'SPLIT';
  }
  function appraisalVariantLabel(value){
    return String(value||'immediate')==='top5percent'?'TOP 5% AVG':'IMMEDIATE';
  }
  function appraisalRefineRatePct(){
    const refine=appraisalData?.refine||{};
    const fallback=Math.max(0,Math.min(1,Number(refine.selectedRate??refine.defaultRate??0)||0))*100;
    const input=$('appraisalRefineRate');
    const raw=Number(input?.value);
    return Math.max(0,Math.min(100,Number.isFinite(raw)?raw:fallback));
  }
  function syncAppraisalSelectedRefineValue(){
    const mode=String(appraisalData?.pricing||'');
    if(!appraisalData?.summary||!['refine-buy','refine-sell'].includes(mode))return;
    const refine=appraisalData.refine||{};
    const rate=appraisalRefineRatePct()/100;
    const refineBuy=Math.max(0,Number(refine.buyAt100)||0)*rate;
    const refineSell=Math.max(0,Number(refine.sellAt100)||0)*rate;
    appraisalData.summary.refineBuy=refineBuy;
    appraisalData.summary.refineSell=refineSell;
    appraisalData.summary.value=mode==='refine-sell'?refineSell:refineBuy;
    refine.selectedRate=rate;
  }
  function renderAppraisalRefine(){
    const section=$('appraisalRefineSection');
    const summary=$('appraisalRefineSummary');
    const breakdown=$('appraisalRefineBreakdown');
    const input=$('appraisalRefineRate');
    if(!section||!summary||!breakdown)return;
    const refine=appraisalData?.refine||null;
    if(!refine){
      summary.innerHTML='<div class="visual-empty">Run an appraisal to calculate ore refine value.</div>';
      breakdown.innerHTML='';
      return;
    }
    const defaultPct=Math.max(0,Math.min(100,Number(refine.selectedRate??refine.defaultRate??0)*100));
    if(input&&!appraisalRefineRateTouched)input.value=defaultPct.toFixed(2);
    const ratePct=appraisalRefineRatePct();
    const rate=ratePct/100;
    const lines=Math.max(0,Number(refine.recognizedLines)||0);
    const refinedValue=Math.max(0,Number(refine.buyAt100)||0)*rate;
    const refinedSellValue=Math.max(0,Number(refine.sellAt100)||0)*rate;
    const rawBuy=Math.max(0,Number(refine.eligibleBuy)||0);
    const delta=refinedValue-rawBuy;
    if(!lines){
      summary.innerHTML='<div class="visual-empty">No refinable ore was recognized in this appraisal. Market appraisal values above are unchanged.</div>';
      breakdown.innerHTML='<small class="appraisal-refine-note">JLR refine currently recognizes ore and compressed ore. Modules, ships, loot, and other items stay appraisal-only.</small>';
      return;
    }
    const deltaLabel=(delta>=0?'+':'−')+appraisalIsk(Math.abs(delta))+' ISK';
    const deltaClass=delta>=0?'positive':'negative';
    summary.innerHTML=`
      <article class="appraisal-refine-primary appraisal-copy-card" role="button" tabindex="0" data-appraisal-copy="${appraisalCopyNumber(refinedValue)}" data-appraisal-unit="ISK" title="Click to copy exact refined buy value"><span>REFINED BUY @ ${ratePct.toFixed(2)}%</span><strong>${appraisalIsk(refinedValue)} ISK</strong><small>Jita mineral buy estimate</small></article>
      <article class="appraisal-refine-primary appraisal-copy-card" role="button" tabindex="0" data-appraisal-copy="${appraisalCopyNumber(refinedSellValue)}" data-appraisal-unit="ISK" title="Click to copy exact refined sell value"><span>REFINED SELL @ ${ratePct.toFixed(2)}%</span><strong>${appraisalIsk(refinedSellValue)} ISK</strong><small>Jita mineral sell estimate</small></article>
      <article class="appraisal-copy-card" role="button" tabindex="0" data-appraisal-copy="${appraisalCopyNumber(rawBuy)}" data-appraisal-unit="ISK" title="Click to copy exact raw ore value"><span>RAW ORE BUY</span><strong>${appraisalIsk(rawBuy)} ISK</strong><small>recognized ore lines only</small></article>
      <article class="${deltaClass} appraisal-copy-card" role="button" tabindex="0" data-appraisal-copy="${appraisalCopyNumber(delta)}" data-appraisal-unit="ISK" title="Click to copy exact refine difference"><span>REFINE DIFFERENCE</span><strong>${deltaLabel}</strong><small>refined buy − raw buy</small></article>
      <article class="appraisal-copy-card" role="button" tabindex="0" data-appraisal-copy="${lines}" title="Click to copy refinable line count"><span>REFINABLE</span><strong>${lines.toLocaleString()} LINE${lines===1?'':'S'}</strong><small>${Math.max(0,Number(refine.recognizedUnits)||0).toLocaleString()} units</small></article>`;
    const minerals=(Array.isArray(refine.minerals)?refine.minerals:[]).slice(0,12);
    breakdown.innerHTML=minerals.length
      ?'<div class="appraisal-refine-minerals">'+minerals.map(row=>{
          const qty=Math.max(0,Number(row.quantityAt100)||0)*rate;
          const value=Math.max(0,Number(row.valueAt100)||0)*rate;
          return '<div><span>'+esc(row.mineral)+'</span><strong>'+Math.floor(qty).toLocaleString()+'</strong><small>'+appraisalIsk(value)+' ISK</small></div>';
        }).join('')+'</div><small class="appraisal-refine-note">Estimate uses '+esc(refine.pricingBasis||'Jita mineral buy')+'. Partial reprocessing batches are valued proportionally for appraisal comparison.</small>'
      :'<small class="appraisal-refine-note">Mineral breakdown is unavailable for this appraisal.</small>';
  }
  async function loadAppraisalMarkets(){
    if(appraisalMarketsBusy)return;
    appraisalMarketsBusy=true;
    const select=$('appraisalMarket');
    const previous=select?.value||'2';
    if(select&&!appraisalMarkets.length)select.innerHTML='<option value="2">LOADING MARKETS…</option>';
    try{
      const payload=await api('/api/appraisal/markets');
      appraisalMarkets=Array.isArray(payload?.markets)?payload.markets:[];
      if(select){
        select.innerHTML=appraisalMarkets.map(row=>'<option value="'+Number(row.id)+'">'+esc(row.name)+'</option>').join('')||'<option value="2">Jita 4-4</option>';
        const hasPrevious=Array.from(select.options).some(option=>option.value===previous);
        select.value=hasPrevious?previous:String(appraisalMarkets[0]?.id||2);
      }
    }catch(error){
      appraisalMarkets=[{id:2,name:'Jita 4-4'}];
      if(select)select.innerHTML='<option value="2">Jita 4-4</option>';
    }finally{
      appraisalMarketsBusy=false;
    }
  }
  function renderAppraisal(){
    if(!$('appraisalPanel'))return;
    const summary=$('appraisalSummary'),items=$('appraisalItems'),share=$('appraisalShare');
    if(!appraisalData){
      if(summary)summary.innerHTML='';
      if(items)items.innerHTML='<div class="visual-empty">Paste an EVE item list and click APPRAISE.</div>';
      if(share)share.disabled=true;
      renderAppraisalRefine();
      return;
    }
    const s=appraisalData.summary||{};
    const selected=appraisalModeLabel(appraisalData.pricing);
    if(summary)summary.innerHTML=`
      <article class="appraisal-primary appraisal-copy-card" role="button" tabindex="0" data-appraisal-copy="${appraisalCopyNumber(s.value)}" data-appraisal-unit="ISK" title="Click to copy exact appraisal value"><span>${esc(selected)} APPRAISAL</span><strong>${appraisalIsk(s.value)} ISK</strong></article>
      <article class="appraisal-copy-card" role="button" tabindex="0" data-appraisal-copy="${appraisalCopyNumber(s.buy)}" data-appraisal-unit="ISK" title="Click to copy exact Jita buy value"><span>JITA BUY</span><strong>${appraisalIsk(s.buy)} ISK</strong></article>
      <article class="appraisal-copy-card" role="button" tabindex="0" data-appraisal-copy="${appraisalCopyNumber(s.split)}" data-appraisal-unit="ISK" title="Click to copy exact split value"><span>SPLIT</span><strong>${appraisalIsk(s.split)} ISK</strong></article>
      <article class="appraisal-copy-card" role="button" tabindex="0" data-appraisal-copy="${appraisalCopyNumber(s.sell)}" data-appraisal-unit="ISK" title="Click to copy exact Jita sell value"><span>JITA SELL</span><strong>${appraisalIsk(s.sell)} ISK</strong></article>
      <article class="appraisal-copy-card" role="button" tabindex="0" data-appraisal-copy="${appraisalCopyNumber(s.volume)}" data-appraisal-unit="m³" title="Click to copy exact volume"><span>VOLUME</span><strong>${appraisalVolume(s.volume)}</strong></article>
      <article class="appraisal-copy-card" role="button" tabindex="0" data-appraisal-copy="${Math.max(0,Number(s.resolvedLines)||0)}" title="Click to copy item type count"><span>ITEM TYPES</span><strong>${Number(s.resolvedLines||0).toLocaleString()}</strong></article>`;
    if(items){
      const rows=Array.isArray(appraisalData.items)?appraisalData.items:[];
      items.innerHTML=`<div class="appraisal-table-wrap"><table class="appraisal-table">
        <thead><tr><th>ITEM</th><th>QTY</th><th>VOLUME</th><th>BUY / EA</th><th>SPLIT / EA</th><th>SELL / EA</th><th>BUY TOTAL</th><th>SELL TOTAL</th></tr></thead>
        <tbody>${rows.length?rows.map(row=>row.resolved===false
          ?`<tr class="appraisal-unresolved"><td><strong>${esc(row.name)}</strong><small>UNRESOLVED</small></td><td colspan="7">—</td></tr>`
          :`<tr><td><strong>${esc(row.name)}</strong><small>${Number(row.buyOrderCount||0).toLocaleString()} buy orders • ${Number(row.sellOrderCount||0).toLocaleString()} sell orders</small></td><td class="appraisal-copy-cell" role="button" tabindex="0" data-appraisal-copy="${Math.max(0,Number(row.amount)||0)}" title="Click to copy quantity">${Number(row.amount||0).toLocaleString()}</td><td class="appraisal-copy-cell" role="button" tabindex="0" data-appraisal-copy="${appraisalCopyNumber(row.totalVolume)}" data-appraisal-unit="m³" title="Click to copy exact volume">${appraisalVolume(row.totalVolume)}</td><td class="appraisal-copy-cell" role="button" tabindex="0" data-appraisal-copy="${appraisalCopyNumber(row.buy)}" data-appraisal-unit="ISK" title="Click to copy exact buy price">${appraisalPrice(row.buy)}</td><td class="appraisal-copy-cell" role="button" tabindex="0" data-appraisal-copy="${appraisalCopyNumber(row.split)}" data-appraisal-unit="ISK" title="Click to copy exact split price">${appraisalPrice(row.split)}</td><td class="appraisal-copy-cell" role="button" tabindex="0" data-appraisal-copy="${appraisalCopyNumber(row.sell)}" data-appraisal-unit="ISK" title="Click to copy exact sell price">${appraisalPrice(row.sell)}</td><td class="appraisal-copy-cell" role="button" tabindex="0" data-appraisal-copy="${appraisalCopyNumber(row.buyTotal)}" data-appraisal-unit="ISK" title="Click to copy exact buy total">${appraisalIsk(row.buyTotal)}</td><td class="appraisal-copy-cell" role="button" tabindex="0" data-appraisal-copy="${appraisalCopyNumber(row.sellTotal)}" data-appraisal-unit="ISK" title="Click to copy exact sell total">${appraisalIsk(row.sellTotal)}</td></tr>`).join(''):'<tr><td colspan="8">No appraisal rows.</td></tr>'}</tbody>
      </table></div>`;
    }
    if(share)share.disabled=!Array.isArray(appraisalData.items)||!appraisalData.items.some(row=>row.resolved!==false);
    renderAppraisalRefine();
  }
  async function calculateAppraisal(){
    if(appraisalBusy)return;
    const text=String($('appraisalPaste')?.value||'').trim();
    if(!text){toast('Paste an EVE item list first.');return}
    appraisalBusy=true;
    $('appraisalCalculate').disabled=true;
    $('appraisalStatus').textContent='Pricing pasted items…';
    try{
      appraisalData=await api('/api/appraisal',{method:'POST',body:JSON.stringify({
        text,
        market:Number($('appraisalMarket')?.value||2),
        pricing:String($('appraisalPricing')?.value||'split'),
        pricingVariant:String($('appraisalVariant')?.value||'immediate'),
      })});
      syncAppraisalSelectedRefineValue();
      renderAppraisal();
      const s=appraisalData.summary||{};
      const unresolved=Number(s.unresolvedLines||0);
      $('appraisalStatus').textContent=
        (appraisalData.market?.name||'Jita 4-4')+' • '+appraisalVariantLabel(appraisalData.pricingVariant)+' • '
        +Number(s.resolvedLines||0)+' item type'+(Number(s.resolvedLines)===1?'':'s')
        +' • '+appraisalIsk(s.value)+' ISK'
        +(unresolved?' • '+unresolved+' unresolved':'');
      adamRecordAction('appraisal',{detail:appraisalModeLabel(appraisalData.pricing)+' • '+appraisalIsk(s.value)+' ISK'});
    }catch(error){
      $('appraisalStatus').textContent='Appraisal error: '+String(error.message||error);
      toast('Appraisal failed.');
    }finally{
      appraisalBusy=false;
      $('appraisalCalculate').disabled=false;
      renderAppraisal();
    }
  }
  async function shareAppraisal(){
    if(!appraisalData||appraisalBusy)return;
    const text=String($('appraisalPaste')?.value||'').trim();
    if(!text)return;
    appraisalBusy=true;
    $('appraisalShare').disabled=true;
    try{
      const payload=await api('/api/appraisal/share',{method:'POST',body:JSON.stringify({
        title:String($('appraisalTitle')?.value||'').trim()||'JLR Appraisal',
        text,
        market:Number($('appraisalMarket')?.value||2),
        pricing:String($('appraisalPricing')?.value||'split'),
        pricingVariant:String($('appraisalVariant')?.value||'immediate'),
        refineRate:appraisalRefineRatePct(),
      })});
      const url=String(payload?.shareUrl||payload?.directShareUrl||'');
      if(url){
        try{await navigator.clipboard.writeText(url);toast('JLR appraisal link copied. Discord will build the appraisal preview from the link.')}
        catch{toast('JLR appraisal created. Open it from the returned link.')}
      }
    }catch(error){
      toast('Could not create appraisal link: '+String(error.message||error));
    }finally{
      appraisalBusy=false;
      renderAppraisal();
    }
  }

  function addAppraisalQuickEntry(){
    const input=$('appraisalQuickEntry');
    const paste=$('appraisalPaste');
    const value=String(input?.value||'').trim();
    if(!value||!paste)return;
    paste.value=(String(paste.value||'').trim()?String(paste.value).trimEnd()+'\n':'')+value;
    input.value='';
    void calculateAppraisal();
  }

  async function refreshCompanionStatus(){
    if(document.hidden||activeTab!=='brain'||companionStatusBusy)return;
    const status=$('brainCompanionStatus');
    const detail=$('brainCompanionDetail');
    const feed=$('brainCompanionFeedTrack');
    if(!status||!detail)return;
    companionStatusBusy=true;
    try{
      const payload=await api('/api/companion/status');
      const devices=Array.isArray(payload?.devices)?payload.devices:[];
      const locations=Array.isArray(payload?.locations)?payload.locations:[];
      const companionActive=Boolean(payload?.companionActive);
      status.textContent=companionActive?'● COMPANION ACTIVE':(devices.length?'○ COMPANION READY':'○ EVE LOCATION');
      detail.textContent=companionActive
        ?locations.length+' toon'+(locations.length===1?'':'s')+' updating from the Windows companion.'
        :(devices.length
          ?'Companion is paired and waiting for EVE movement.'
          :'Using EVE location checks. Windows companion setup is optional.');
      if(feed){
        if(locations.length){
          const parts=locations.map(row=>{
            const device=String(row.deviceName||'Windows PC');
            const toon=String(row.characterName||'Toon');
            const system=String(row.system||'Unknown');
            return device+' • '+toon+' → '+system+' • '+ago(row.checkedAt);
          });
          const line=parts.join('     ✦     ');
          feed.textContent=line+'     ✦     '+line;
          feed.classList.add('active');
          feed.style.setProperty('--companion-feed-seconds',Math.max(18,locations.length*4)+'s');
        }else{
          feed.textContent=devices.length?'COMPANION READY • waiting for movement…':'EVE LOCATION CHECKS ACTIVE';
          feed.classList.remove('active');
          feed.style.removeProperty('--companion-feed-seconds');
        }
      }
    }catch(error){
      status.textContent='⚠ STATUS UNAVAILABLE';
      detail.textContent=String(error?.message||error);
      if(feed){
        feed.textContent='COMPANION FEED UNAVAILABLE';
        feed.classList.remove('active');
      }
    }finally{
      companionStatusBusy=false;
    }
  }
  function startCompanionStatusWatch(){
    if(companionStatusTimer)clearInterval(companionStatusTimer);
    refreshCompanionStatus();
    companionStatusTimer=setInterval(()=>refreshCompanionStatus(),5000);
  }

  async function handleCompanionClipboardEvent(payload){
    const id=String(payload?.id||'');
    if(!id||localStorage.getItem('jlrCompanionClipboardLast')===id||companionClipboardBusy)return;
    // Mark first so a reconnect cannot double-submit an expensive threat scan.
    localStorage.setItem('jlrCompanionClipboardLast',id);
    companionClipboardBusy=true;
    try{
      const kind=String(payload?.kind||'');
      const character=(me?.characters||[]).find(ch=>
        String(ch.characterId)===String(payload?.characterId||'')||
        String(ch.name||'').toLowerCase()===String(payload?.characterName||'').toLowerCase()
      );
      if(character){
        scanCharacterId=String(character.characterId);
        localStorage.setItem('jlrScanCharacter',scanCharacterId);
        renderScanCharacters();
      }

      if(kind==='ore-survey'&&payload?.survey){
        const system=String(payload.system||'');
        adamSaveOreSurveyContext(payload.survey,system);
        if(system){
          brainLastSystem=system;
          if(state?.fields?.[system])chooseSystem(system);
        }
        if($('brainReply'))$('brainReply').textContent=String(payload.survey.text||'Adam auto-imported the EVE ore survey.');
        adamRecordAction('clipboard-ore-survey',{
          system,
          characterName:String(payload.characterName||''),
          detail:String(payload.survey.rowCount||0)+' rocks • '+fmt(payload.survey.totalVolumeM3||0,'m3')+' m³',
        });
        applyTab('brain');
        renderAdamContext();
        toast('Adam auto-imported the EVE Ore Survey.');
        return;
      }

      if(kind==='probe-scan'&&payload?.preview){
        const preview=payload.preview;
        applyPreviewBoardScan(preview);
        applyPreviewWormholeGas(preview);
        const system=String(preview.system||payload.system||'');
        if(system&&state?.fields?.[system])chooseSystem(system);
        adamRecordAction('clipboard-probe-scan',{
          system,
          characterName:String(payload.characterName||preview.characterName||''),
          detail:'Probe Scanner auto-imported',
        });
        const gasOnly=Boolean(preview?.gasWormhole?.recorded)&&!Boolean(preview?.boardScan?.recorded||preview?.a0?.tracked||preview?.tracked);
        applyTab(gasOnly?'gas':'fields');
        setScanStatus((system?system+': ':'')+'Probe Scanner auto-imported from EVE.','success');
        toast((system?system+' • ':'')+'Probe Scanner imported automatically.');
        return;
      }

      if(kind==='threat-scan'&&String(payload?.text||'').trim()){
        applyTab('threat');
        await runThreatScan(String(payload.text));
        adamRecordAction('clipboard-threat-scan',{
          system:String(payload.system||''),
          characterName:String(payload.characterName||''),
          detail:'Local / D-scan auto-imported',
        });
        toast('Local / D-scan auto-imported to Threat Scan.');
      }
    }catch(error){
      console.warn('Companion clipboard import failed',error);
      toast('Adam clipboard import failed: '+String(error?.message||error));
    }finally{
      companionClipboardBusy=false;
    }
  }

  function connectCompanionClipboardStream(){
    if(companionClipboardSource)companionClipboardSource.close();
    companionClipboardSource=new EventSource('/api/companion/clipboard/stream');
    companionClipboardSource.addEventListener('clipboard',event=>{
      try{void handleCompanionClipboardEvent(JSON.parse(event.data))}
      catch(error){console.warn('Bad companion clipboard event',error)}
    });
  }
  async function createCompanionPairCode(){
    const status=$('brainCompanionStatus');
    const codeEl=$('brainCompanionCode');
    const expiry=$('brainCompanionExpiry');
    try{
      const payload=await api('/api/companion/pair/start',{method:'POST',body:'{}'});
      const code=String(payload?.code||'');
      if(codeEl)codeEl.textContent=code||'—';
      if(expiry)expiry.textContent=code?'Expires in 10 minutes.':'Pair code was not returned.';
      if(status)status.textContent='PAIR CODE READY';
      toast(code?'Companion pair code ready.':'Could not create a companion pair code.');
    }catch(error){toast(String(error?.message||error))}
  }
  async function copyCompanionPairCode(){
    const code=String($('brainCompanionCode')?.textContent||'').trim();
    if(!code||code==='—'){toast('Create a pair code first.');return}
    try{
      await navigator.clipboard.writeText(code);
      toast('Pair code copied.');
    }catch(error){toast('Could not copy the pair code.')}
  }
  async function revokeCompanionDevices(){
    try{
      await api('/api/companion/revoke',{method:'POST',body:'{}'});
      if($('brainCompanionCode'))$('brainCompanionCode').textContent='—';
      if($('brainCompanionExpiry'))$('brainCompanionExpiry').textContent='All companion access has been revoked.';
      await refreshCompanionStatus();
      toast('Desktop companion access revoked.');
    }catch(error){toast(String(error?.message||error))}
  }

  function feedbackTypeLabel(type){
    return {bug:'BUG',suggestion:'FEATURE IDEA',speech:'SPEECH / VOICE',data:'DATA ISSUE',ui:'UI / UX',other:'OTHER'}[String(type||'')]||'FEEDBACK';
  }
  function feedbackAreaLabel(area){
    return {general:'GENERAL',fields:'FIELDS',brain:'ADAM',fleet:'FLEET & FITS',performance:'FLEET PERFORMANCE',ice:'ICE',gas:'GAS',doctrine:'DOCTRINE MARKET',pvp:'INIT PVP',tracker:'TRACKER',threat:'THREAT SCAN',mer:'MER INTEL',toons:'TOONS'}[String(area||'')]||String(area||'GENERAL').toUpperCase();
  }
  function renderFeedbackHub(){
    const source=$('feedbackDraftSource');
    if(source)source.textContent='FROM '+String(feedbackOpenedFrom||'general').replace(/-/g,' ').toUpperCase();
    const area=$('feedbackArea');
    if(area&&area.dataset.seeded!=='1'){
      const seed=[...area.options].some(option=>option.value===feedbackOpenedFrom)?feedbackOpenedFrom:'general';
      area.value=seed;
      area.dataset.seeded='1';
    }
    const recent=$('feedbackRecent');
    if(recent)recent.classList.toggle('feedback-owner-full',feedbackOwner);
    const recentTitle=$('feedbackRecentTitle');
    const recentSubtitle=$('feedbackRecentSubtitle');
    if(recentTitle)recentTitle.textContent=feedbackOwner?'OWNER • ALL USER SUBMISSIONS':'MY RECENT SUBMISSIONS';
    if(recentSubtitle)recentSubtitle.textContent=feedbackOwner
      ?((feedbackOwnerCharacter||'OWNER ESI')+' VERIFIED • NEWEST FIRST')
      :'Newest first';
    if(!recent)return;
    if(feedbackHistoryLoading){
      recent.innerHTML='<div class="visual-empty">'+(feedbackOwner?'Loading all user submissions…':'Loading your submissions…')+'</div>';
      return;
    }
    if(!feedbackHistory.length){
      recent.innerHTML='<div class="visual-empty">'+(feedbackOwner?'No user feedback has been submitted yet.':'No feedback submitted from this account yet.')+'</div>';
      return;
    }
    recent.innerHTML=feedbackHistory.slice(0,feedbackOwner?100:15).map(row=>`<article class="feedback-history-row">
      <div class="feedback-history-top"><span class="feedback-kind ${esc(row.type||'other')}">${esc(feedbackTypeLabel(row.type))}</span><span class="feedback-status">${esc(String(row.status||'received').toUpperCase())}</span></div>
      <strong>${esc(row.title||row.message||'Feedback')}</strong>
      <p>${esc(row.message||'')}</p>
      <small>${feedbackOwner&&row.displayName?('PILOT '+esc(row.displayName)+' • '):''}${esc(feedbackAreaLabel(row.area))} • ${esc(String(row.impact||'normal').toUpperCase())} • ${esc(new Date(row.at).toLocaleString())}</small>
    </article>`).join('');
  }
  async function loadFeedbackHistory(force=false){
    if(feedbackHistoryLoading)return;
    if(feedbackHistory.length&&!force){renderFeedbackHub();return}
    feedbackHistoryLoading=true;
    renderFeedbackHub();
    try{
      const payload=await api('/api/tracker/feedback');
      feedbackHistory=Array.isArray(payload?.rows)?payload.rows:[];
      feedbackOwner=Boolean(payload?.owner);
      feedbackOwnerCharacter=feedbackOwner?String(payload?.ownerCharacter||''):'';
    }catch(error){
      console.warn('Feedback history load failed',error);
      if(force)toast('Could not refresh feedback history.');
    }finally{
      feedbackHistoryLoading=false;
      renderFeedbackHub();
    }
  }

  function renderTrackerBrain(){
    const status=$('trackerBrainStatus');
    const brain=state?.trackerBrain||null;
    if(status){
      const attention=Number(brain?.attentionCount||0);
      const high=Number(brain?.counts?.critical||0)+Number(brain?.counts?.high||0);
      status.textContent=high>0?'⚠ PRIORITY '+high:attention>0?'● ATTENTION '+attention:'● ONLINE';
    }
    renderScoutFollow();
    renderAdamContext();
    const decisions=$('brainDecisionList');
    const issues=Array.isArray(brain?.issues)?brain.issues:[];
    if(decisions){
      decisions.innerHTML=issues.length?issues.slice(0,8).map(issue=>`<button class="brain-decision-row" type="button" data-system="${esc(issue.system||'')}">
        <span class="tracker-assist-priority ${esc(issue.priority||'info')}">${esc(String(issue.priority||'info').toUpperCase())}</span>
        <strong>${esc(issue.title||'Tracker update')}</strong>
        <small>${esc(issue.reason||'')}</small>
      </button>`).join(''):'<div class="visual-empty">No current Adam recommendations require attention.</div>';
    }
  }

  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function toast(msg){$('toast').textContent=msg;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),3000)}
  function setScanStatus(message,tone=''){
    const el=$('scanStatus');
    if(!el)return;
    el.textContent=message;
    el.className=tone;
  }

  function renderScoutTargets(){
    const host=$('scoutTargetList');
    const summary=$('scoutTargetSummary');
    const nearest=$('adamNearestMining');
    const quickNearest=$('adamQuickNearest');
    if(!host)return;
    const selected=(me?.characters||[]).find(ch=>String(ch.characterId)===String(scoutSelectedCharacterId));
    const location=scoutLocations.get(String(scoutSelectedCharacterId));
    const selectedNavigation=window.JlrAdamNavigation?.select(adamNavigationRecommendation,{characterId:scoutSelectedCharacterId||scanCharacterId,location,scans:state?.scans||{}});
    const navigation=selectedNavigation?.updatesOnly?selectedNavigation:null;
    const shownTarget=navigation?navigation.target:scoutNearestScan;
    const scanTarget=Boolean(navigation?.updatesOnly);
    const targetLabel=scanTarget?'NEXT SCAN':'NEAREST SCAN';
    const targetDescription='needs a scan update';
    if(summary){
      summary.textContent=location?.system
        ?String(selected?.name||'Selected toon')+' • '+location.system+' • closest scan updates'
        :'Select a location-enabled toon to rank nearby scan updates.';
    }
    if(nearest){
      if(scoutTargetsLoading&&!navigation){
        nearest.innerHTML='<div class="adam-nearest-copy"><span>NEAREST SCAN</span><strong>CHECKING…</strong><small>Calculating from the current Adam travel-toon location.</small></div>';
      }else if(shownTarget?.system){
        nearest.innerHTML='<div class="adam-nearest-copy"><span>'+targetLabel+'</span><strong>'+esc(shownTarget.system)+'</strong><small>'+Number(shownTarget.jumps||0)+' jump'+(Number(shownTarget.jumps||0)===1?'':'s')+' from '+esc(location?.system||'current location')+' • '+targetDescription+'</small></div><button class="adam-copy-system" type="button" data-copy-system="'+esc(shownTarget.system)+'">COPY SYSTEM</button>';
      }else{
        nearest.innerHTML='<div class="adam-nearest-copy"><span>'+targetLabel+'</span><strong>—</strong><small>'+(navigation?esc(navigation.text):'No tracked systems currently need a scan update.')+'</small></div>';
      }
    }
    if(quickNearest){
      if(shownTarget?.system){
        quickNearest.classList.remove('hidden');
        quickNearest.innerHTML='<span>'+(scanTarget?'NEXT SCAN':'NEAREST SCAN')+'</span><strong>'+esc(shownTarget.system)+'</strong><small>'+Number(shownTarget.jumps||0)+'J</small><button class="adam-copy-system" type="button" data-copy-system="'+esc(shownTarget.system)+'">COPY</button>';
      }else{
        quickNearest.classList.add('hidden');
        quickNearest.innerHTML='';
      }
    }
    if(scoutTargetsLoading){
      host.innerHTML='<div class="visual-empty">Calculating closest update systems…</div>';
      return;
    }
    if(scoutTargetsError){
      host.innerHTML='<div class="visual-empty">'+esc(scoutTargetsError)+'</div>';
      return;
    }
    if(!scoutTargets.length){
      host.innerHTML='<div class="visual-empty">No tracked systems currently need a scan update.</div>';
      return;
    }
    host.innerHTML=scoutTargets.map((row,index)=>{
      const age=row.lastScanAt?ago(row.lastScanAt):'never scanned';
      return '<button class="scout-target-row" type="button" data-scout-field="'+esc(row.system)+'">'+
        '<b>#'+(index+1)+'</b><div><strong>'+esc(row.system)+'</strong><small>'+esc(row.reason||'SCAN UPDATE')+' • '+esc(age)+'</small></div>'+
        '<span>'+Number(row.jumps||0)+'J</span><em>OPEN →</em>'+
      '</button>';
    }).join('');
  }

  async function loadScoutTargets(force=false){
    if(!me)return;
    if(scoutTargetsLoading){if(force)scoutTargetsRefreshPending=true;return;}
    const chars=(me.characters||[]).filter(ch=>ch.locationAccess);
    if(!chars.length){
      scoutNearestScan=null;scoutTargets=[];scoutTargetsError='No toon currently has EVE location access.';renderScoutTargets();return;
    }
    if(!chars.some(ch=>String(ch.characterId)===String(scoutSelectedCharacterId))){
      const preferred=chars.find(ch=>String(ch.characterId)===String(scanCharacterId))
        ||chars.find(ch=>String(ch.characterId)===String(me.primaryCharacterId))
        ||chars[0];
      scoutSelectedCharacterId=String(preferred.characterId);
      localStorage.setItem('jlrScoutCharacter',scoutSelectedCharacterId);
    }
    if(!force&&scoutTargets.length&&scoutTargetsOriginSystem===String(scoutLocations.get(scoutSelectedCharacterId)?.system||'')){
      renderScoutTargets();
      return;
    }
    scoutTargetsLoading=true;scoutTargetsError='';renderScoutTargets();
    try{
      const response=await api('/api/scout/targets',{method:'POST',body:JSON.stringify({characterId:scoutSelectedCharacterId})});
      if(String(response?.characterId)!==String(scoutSelectedCharacterId))return;
      if(response?.location?.system){
        scoutLocations.set(String(scoutSelectedCharacterId),response.location);
        scoutTargetsOriginSystem=String(response.location.system);
      }
      scoutNearestScan=response?.nearestScan&&typeof response.nearestScan==='object'?response.nearestScan:null;
      scoutTargets=Array.isArray(response?.targets)?response.targets:[];
    }catch(error){
      scoutNearestScan=null;
      scoutTargets=[];
      scoutTargetsError=String(error?.message||error||'Could not calculate nearby field updates.');
    }finally{
      scoutTargetsLoading=false;
      renderScoutFollow();
      renderScoutTargets();
      if(scoutTargetsRefreshPending){scoutTargetsRefreshPending=false;void loadScoutTargets(true);}
    }
  }

  function renderScoutFollow(){
    const status=$('brainFollowStatus'),list=$('brainFollowList');
    if(!status||!list||!me)return;
    const chars=(me.characters||[]).filter(c=>c.locationAccess);
    if(chars.length&&!chars.some(ch=>String(ch.characterId)===String(scoutSelectedCharacterId))){
      const preferred=chars.find(ch=>String(ch.characterId)===String(scanCharacterId))
        ||chars.find(ch=>String(ch.characterId)===String(me.primaryCharacterId))
        ||chars[0];
      scoutSelectedCharacterId=String(preferred.characterId);
      localStorage.setItem('jlrScoutCharacter',scoutSelectedCharacterId);
    }
    const selector=$('scoutCharacterSelect');
    if(selector){
      const previous=String(selector.value||'');
      selector.innerHTML=chars.length
        ?chars.map(ch=>'<option value="'+esc(ch.characterId)+'">'+esc(ch.name)+'</option>').join('')
        :'<option value="">NO LOCATION-ENABLED TOONS</option>';
      selector.disabled=!chars.length;
      selector.value=chars.some(ch=>String(ch.characterId)===String(scoutSelectedCharacterId))?scoutSelectedCharacterId:(previous||'');
    }
    status.textContent=scoutFollowEnabled
      ?'Following '+chars.length+' location-enabled toon'+(chars.length===1?'':'s')+' while this page is open • scan-due alerts appear at the top of JLR'
      :'Auto follow is off.';
    list.innerHTML=scoutFollowEnabled?chars.map(ch=>{
      const row=scoutLocations.get(String(ch.characterId));
      const source=row?.locationSource==='companion'?'COMPANION':'ESI';
      const locationError=scoutLocationErrors.get(String(ch.characterId));
      const detail=row?.system?esc(row.system)+' • '+source+' • '+(row.needsScan?'SCAN DUE':row.tracked?'CURRENT':'untracked')+' • '+esc(ago(row.checkedAt))
        :locationError==='COMPANION_WAITING'?'WAITING FOR COMPANION'
        :locationError?'Location fallback failed • retrying':'Waiting for location check';
      return '<div class="brain-follow-row"><strong>'+esc(ch.name)+'</strong><span'+(row?.needsScan?' class="scan-due"':'')+'>'+detail+'</span></div>';
    }).join(''):'<div class="brain-follow-row">Enable Auto Follow to watch your toons.</div>';
    renderScoutTargets();
  }

  function adamMarkCurrent(){
    const tab=document.querySelector('.app-tab[data-tab="brain"]');
    if(!tab)return;
    if(adamCurrentTimer)clearTimeout(adamCurrentTimer);
    tab.classList.remove('scout-update');
    tab.classList.add('adam-current');
    tab.textContent='ADAM • CURRENT';
    adamCurrentTimer=setTimeout(()=>{
      if(tab.classList.contains('scout-update'))return;
      tab.classList.remove('adam-current');
      tab.textContent='ADAM';
      adamCurrentTimer=null;
    },8000);
  }

  function scoutShowPrompt(snapshot){
    const panel=$('brainScanPrompt');
    const global=$('scoutGlobalAlert');
    if(!panel&&!global)return;
    const text=String(snapshot.characterName||'Toon')+' is in '+snapshot.system+' • tracked scan is due. Send a new Probe Scanner copy when safe.';
    if(panel){panel.classList.remove('hidden');panel.dataset.characterId=String(snapshot.characterId);}
    if($('brainScanPromptText'))$('brainScanPromptText').textContent=text;
    if(global){global.classList.remove('hidden');global.dataset.characterId=String(snapshot.characterId);}
    if($('scoutGlobalAlertText'))$('scoutGlobalAlertText').textContent=text;
    const key=String(snapshot.characterId)+':'+String(snapshot.system);
    const tab=document.querySelector('.app-tab[data-tab="brain"]');
    if(tab){if(adamCurrentTimer){clearTimeout(adamCurrentTimer);adamCurrentTimer=null}tab.classList.remove('adam-current');tab.classList.add('scout-update');tab.textContent='⚠ ADAM • UPDATE';}
    document.title='⚠ SCAN UPDATE • JLR';
    if(scoutPromptKey!==key){scoutPromptKey=key;toast('🛰 '+snapshot.characterName+': '+snapshot.system+' needs a scan update.')}
  }

  async function pollScoutLocation(force=false){
    if((document.hidden&&!force)||scoutLocationBusy||scanBusy||!me||!scoutFollowEnabled)return;
    const chars=(me.characters||[]).filter(c=>c.locationAccess);
    if(!chars.length){renderScoutFollow();return}
    const selected=chars.find(c=>String(c.characterId)===String(scoutSelectedCharacterId));
    const others=chars.filter(c=>String(c.characterId)!==String(selected?.characterId));
    const batch=[];
    if(selected)batch.push(String(selected.characterId));
    for(let i=0;i<Math.min(4-batch.length,others.length);i++)batch.push(String(others[(scoutLocationCursor+i)%others.length].characterId));
    if(others.length)scoutLocationCursor=(scoutLocationCursor+Math.min(4-Boolean(selected),others.length))%others.length;
    scoutLocationBusy=true;
    try{
      const response=await api('/api/scout/locations',{method:'POST',body:JSON.stringify({characterIds:batch})});
      if(!scoutFollowEnabled)return;
      let prompt=null;
      for(const snapshot of response?.locations||[]){
        const id=String(snapshot.characterId);
        scoutLocationErrors.delete(id);
        const entered=Boolean(snapshot.system&&snapshot.system!==scoutLastSystem.get(id));
        if(snapshot.system)scoutLastSystem.set(id,snapshot.system);
        scoutLocations.set(id,snapshot);
        if(scoutPromptKey.startsWith(id+':')&&(scoutPromptKey!==id+':'+snapshot.system||!snapshot.needsScan)){
          scoutPromptKey='';
          $('brainScanPrompt')?.classList.add('hidden');
          $('scoutGlobalAlert')?.classList.add('hidden');
          const scoutTab=document.querySelector('.app-tab[data-tab="brain"]');
          if(scoutTab)adamMarkCurrent();
          document.title='JLR Tracker';
        }
        if(snapshot.needsScan){
          if(id===String(scanCharacterId)&&!scanBusy)setScanStatus(snapshot.system+': SCAN UPDATE NEEDED','warning');
          // Visual Scout and Adam attention follows its own display timing.
          // Keep the global alert active for any due tracked system until a fresh scan clears it.
          if(!prompt)prompt=snapshot;
        }else if(id===String(scanCharacterId)&&entered&&!scanBusy){
          setScanStatus(snapshot.system+(snapshot.tracked?': scan status current.':' — not on a tracked mining board.'),snapshot.tracked?'success':'');
        }
      }
      for(const failure of response?.errors||[])scoutLocationErrors.set(String(failure.characterId),String(failure.error||'ESI_LOCATION_FAILED'));
      renderScoutFollow();
      const selectedSnapshot=scoutLocations.get(String(scoutSelectedCharacterId));
      if(selectedSnapshot?.system&&String(selectedSnapshot.system)!==String(scoutTargetsOriginSystem))void loadScoutTargets(true);
      if(prompt)scoutShowPrompt(prompt);
    }catch(error){
      if(force)console.warn('Adam location check failed',error);
    }finally{
      scoutLocationBusy=false;
    }
  }

  function startScoutLocationWatch(){
    if(scoutLocationTimer)clearInterval(scoutLocationTimer);
    if($('brainFollowEnabled'))$('brainFollowEnabled').value=scoutFollowEnabled?'on':'off';
    renderScoutFollow();
    if(!scoutFollowEnabled)return;
    pollScoutLocation(true);
    if(activeTab==='brain')void loadScoutTargets(false);
    scoutLocationTimer=setInterval(()=>pollScoutLocation(false),30*1000);
  }

  function compactNumber(v){
    const n=Number(v);
    if(!Number.isFinite(n))return'—';
    const a=Math.abs(n);
    if(a>=1e9)return(n/1e9).toFixed(a>=1e10?0:1)+'B';
    if(a>=1e6)return(n/1e6).toFixed(a>=1e7?0:1)+'M';
    if(a>=1e3)return(n/1e3).toFixed(a>=1e4?0:1)+'K';
    return n.toFixed(a>=100?0:a>=10?1:2);
  }
  function chartDateLabel(date){
    const d=new Date(String(date)+'T00:00:00Z');
    if(!Number.isFinite(d.getTime()))return String(date||'');
    return d.toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
  }
  function marketHistoryPoints(bucket,key,currentJita,currentCn){
    const source=Array.isArray(state?.market?.history?.[bucket]?.[key])?state.market.history[bucket][key]:[];
    const points=source.slice(-31).map(row=>({
      date:String(row.date||''),
      jita:Number.isFinite(Number(row.jita))?Number(row.jita):null,
      cn:Number.isFinite(Number(row.cn))?Number(row.cn):null,
    })).filter(row=>row.date);
    const today=new Date().toISOString().slice(0,10);
    if(!points.some(row=>row.date===today)){
      points.push({
        date:today,
        jita:Number.isFinite(Number(currentJita))&&Number(currentJita)>0?Number(currentJita):null,
        cn:Number.isFinite(Number(currentCn))&&Number(currentCn)>0?Number(currentCn):null,
      });
    }
    return points.sort((a,b)=>a.date.localeCompare(b.date)).slice(-31);
  }
  function renderMarketLineChart(el,points,{unit='',decimals=2}={}){
    if(!el)return;
    const rows=(points||[]).filter(row=>row&&row.date).slice(-31);
    const vals=rows.flatMap(row=>[row.jita,row.cn]).filter(v=>Number.isFinite(Number(v))&&Number(v)>0).map(Number);
    if(!vals.length){
      el.innerHTML='<div class="visual-empty">Market history is collecting its first daily point.</div>';
      return;
    }

    const W=760,H=230,L=54,R=118,T=24,B=30;
    const pw=W-L-R,ph=H-T-B;
    let min=Math.min(...vals),max=Math.max(...vals);
    if(min===max){min*=.97;max*=1.03}
    else{const pad=(max-min)*.10;min=Math.max(0,min-pad);max+=pad}
    const range=Math.max(1e-9,max-min);
    const x=i=>rows.length<=1?L+pw/2:L+(i/(rows.length-1))*pw;
    const y=v=>T+(max-Number(v))/range*ph;

    let grid='';
    const ticks=3;
    for(let i=0;i<=ticks;i++){
      const yy=T+(i/ticks)*ph;
      const value=max-(i/ticks)*range;
      grid+='<line x1="'+L+'" y1="'+yy.toFixed(1)+'" x2="'+(W-R)+'" y2="'+yy.toFixed(1)+'" class="market-grid"/>'+
        '<text x="'+(L-7)+'" y="'+(yy+3).toFixed(1)+'" text-anchor="end" class="market-axis-label">'+esc(compactNumber(value))+'</text>';
    }

    const labelCount=Math.min(5,rows.length),tickIndexes=new Set();
    if(rows.length===1)tickIndexes.add(0);
    else for(let i=0;i<labelCount;i++)tickIndexes.add(Math.round(i*(rows.length-1)/(labelCount-1)));
    const xLabels=[...tickIndexes].map(i=>
      '<text x="'+x(i).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" class="market-axis-label">'+esc(chartDateLabel(rows[i].date))+'</text>'
    ).join('');

    function seriesPath(key){
      let d='',started=false;
      for(let i=0;i<rows.length;i++){
        const v=Number(rows[i][key]);
        if(!(Number.isFinite(v)&&v>0)){started=false;continue}
        d+=(started?' L ':'M ')+x(i).toFixed(1)+' '+y(v).toFixed(1);
        started=true;
      }
      return d;
    }
    function validPoints(key){
      return rows.map((row,i)=>({i,v:Number(row[key]),date:row.date})).filter(p=>Number.isFinite(p.v)&&p.v>0);
    }
    function hoverTargets(key,label){
      return validPoints(key).map(p=>
        '<circle cx="'+x(p.i).toFixed(1)+'" cy="'+y(p.v).toFixed(1)+'" r="7" class="market-hit"><title>'+
        esc(chartDateLabel(p.date)+' • '+label+' '+p.v.toFixed(decimals)+(unit?' '+unit:''))+'</title></circle>'
      ).join('');
    }
    function deltaText(points){
      if(points.length<2||points[0].v<=0)return'';
      const delta=(points.at(-1).v-points[0].v)/points[0].v*100;
      if(Math.abs(delta)<.05)return' • 0.0%';
      return ' • '+(delta>0?'▲':'▼')+Math.abs(delta).toFixed(1)+'%';
    }

    const jitaPoints=validPoints('jita'),cnPoints=validPoints('cn');
    const jitaLast=jitaPoints.at(-1)||null,cnLast=cnPoints.at(-1)||null;
    let jitaLabelY=jitaLast?y(jitaLast.v):0,cnLabelY=cnLast?y(cnLast.v):0;
    if(jitaLast&&cnLast&&Math.abs(jitaLabelY-cnLabelY)<15){
      if(jitaLabelY<=cnLabelY){jitaLabelY-=7;cnLabelY+=7}
      else{jitaLabelY+=7;cnLabelY-=7}
    }
    const clampLabelY=value=>Math.max(T+7,Math.min(T+ph-4,value));
    jitaLabelY=clampLabelY(jitaLabelY);cnLabelY=clampLabelY(cnLabelY);

    const jitaPath=seriesPath('jita'),cnPath=seriesPath('cn');
    const latestDots=(jitaLast?'<circle cx="'+x(jitaLast.i).toFixed(1)+'" cy="'+y(jitaLast.v).toFixed(1)+'" r="3.8" class="market-dot market-dot-jita"/>':'')+
      (cnLast?'<circle cx="'+x(cnLast.i).toFixed(1)+'" cy="'+y(cnLast.v).toFixed(1)+'" r="3.8" class="market-dot market-dot-cn"/>':'');
    const endLabels=(jitaLast?'<text x="'+(W-R+9)+'" y="'+jitaLabelY.toFixed(1)+'" class="market-end-label market-end-jita">JITA '+esc(compactNumber(jitaLast.v))+esc(deltaText(jitaPoints))+'</text>':'')+
      (cnLast?'<text x="'+(W-R+9)+'" y="'+cnLabelY.toFixed(1)+'" class="market-end-label market-end-cn">C-N '+esc(compactNumber(cnLast.v))+esc(deltaText(cnPoints))+'</text>':'');
    const first=rows[0]?.date;
    const collecting=rows.length<30?'<div class="market-history-note">History started '+esc(chartDateLabel(first))+' • '+rows.length+' daily point'+(rows.length===1?'':'s')+' collected</div>':'';

    el.innerHTML='<div class="market-chart-shell">'+
      '<svg class="market-line-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Jita versus C-N market trend">'+
        grid+xLabels+
        (jitaPath?'<path d="'+jitaPath+'" class="market-line market-line-jita"/>':'')+
        (cnPath?'<path d="'+cnPath+'" class="market-line market-line-cn"/>':'')+
        hoverTargets('jita','Jita')+hoverTargets('cn','C-N')+latestDots+endLabels+
        '<text x="'+L+'" y="'+(T-9)+'" class="market-unit-label">'+esc(unit)+'</text>'+
      '</svg>'+collecting+
    '</div>';
  }
  function updateSoundStatus(){
    const button=$('soundStatus');
    if(!button)return;
    button.textContent=soundEnabled?'SOUND ON':'SOUND OFF';
    button.classList.toggle('active',soundEnabled);
    button.setAttribute('aria-pressed',String(soundEnabled));
    button.title=soundEnabled?'Sounds are on. Click to turn them off.':'Sounds are off. Click to turn them on.';
  }
  function unlockAudio(){
    if(audioUnlocked&&audio)return audio;
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return null;
    audio=new AC();
    audioUnlocked=true;
    audio.addEventListener('statechange',updateSoundStatus);
    updateSoundStatus();
    return audio;
  }
  function tryResumeAudio(){
    if(!audio||audio.state!=='suspended'||audioResumePending)return;
    audioResumePending=true;
    // Installed apps and previously approved sites may allow this immediately.
    // If a browser blocks it, keep at most one pending request and retry on a gesture.
    audio.resume().catch(()=>{}).finally(()=>{
      audioResumePending=false;
      updateSoundStatus();
    });
  }
  function sfx(kind='click'){
    if(!soundEnabled)return false;
    unlockAudio();
    if(!audio)return false;
    // Attempt to resume without queuing a sound: a blocked resume may not
    // resolve until the next click, when this old hover cue would be stale.
    tryResumeAudio();
    if(audio.state!=='running')return false;

    const o=audio.createOscillator(),g=audio.createGain(),n=audio.currentTime;
    o.connect(g);g.connect(audio.destination);
    if(kind==='fieldUpdate'){
      o.type='sine';o.frequency.setValueAtTime(660,n);o.frequency.exponentialRampToValueAtTime(880,n+.09);
      g.gain.setValueAtTime(.009,n);g.gain.exponentialRampToValueAtTime(.001,n+.13);o.start(n);o.stop(n+.14);
    }else if(kind==='hover'){
      o.type='sine';o.frequency.setValueAtTime(560,n);o.frequency.exponentialRampToValueAtTime(710,n+.045);
      g.gain.setValueAtTime(.018,n);g.gain.exponentialRampToValueAtTime(.001,n+.060);o.start(n);o.stop(n+.065);
    }else if(kind==='threatHover'){
      // Short scanner/targeting chirp for moving across threat intel readouts.
      o.type='triangle';o.frequency.setValueAtTime(820,n);o.frequency.exponentialRampToValueAtTime(1080,n+.035);
      g.gain.setValueAtTime(.025,n);g.gain.exponentialRampToValueAtTime(.001,n+.055);o.start(n);o.stop(n+.060);
    }else if(kind==='systemHover'){
      o.type='triangle';o.frequency.setValueAtTime(470,n);o.frequency.exponentialRampToValueAtTime(680,n+.07);
      g.gain.setValueAtTime(.035,n);g.gain.exponentialRampToValueAtTime(.001,n+.090);o.start(n);o.stop(n+.095);
    }else if(kind==='systemSelect'){
      o.type='triangle';o.frequency.setValueAtTime(350,n);o.frequency.exponentialRampToValueAtTime(760,n+.10);
      g.gain.setValueAtTime(.034,n);g.gain.exponentialRampToValueAtTime(.001,n+.13);o.start(n);o.stop(n+.135);
    }else if(kind==='selectOpen'){
      o.type='sine';o.frequency.setValueAtTime(330,n);o.frequency.exponentialRampToValueAtTime(430,n+.045);
      g.gain.setValueAtTime(.030,n);g.gain.exponentialRampToValueAtTime(.001,n+.065);o.start(n);o.stop(n+.070);
    }else if(kind==='select'){
      o.type='triangle';o.frequency.setValueAtTime(540,n);o.frequency.exponentialRampToValueAtTime(930,n+.09);
      g.gain.setValueAtTime(.045,n);g.gain.exponentialRampToValueAtTime(.001,n+.12);o.start(n);o.stop(n+.125);
    }else if(kind==='selectPreview'){
      o.type='sine';o.frequency.setValueAtTime(610,n);o.frequency.exponentialRampToValueAtTime(790,n+.055);
      g.gain.setValueAtTime(.032,n);g.gain.exponentialRampToValueAtTime(.001,n+.075);o.start(n);o.stop(n+.080);
    }else if(kind==='toggleOn'){
      o.type='square';o.frequency.setValueAtTime(310,n);o.frequency.exponentialRampToValueAtTime(540,n+.065);
      g.gain.setValueAtTime(.040,n);g.gain.exponentialRampToValueAtTime(.001,n+.100);o.start(n);o.stop(n+.105);
    }else if(kind==='toggleOff'){
      o.type='square';o.frequency.setValueAtTime(420,n);o.frequency.exponentialRampToValueAtTime(230,n+.065);
      g.gain.setValueAtTime(.040,n);g.gain.exponentialRampToValueAtTime(.001,n+.100);o.start(n);o.stop(n+.105);
    }else if(kind==='toggle'){
      o.type='square';o.frequency.setValueAtTime(250,n);o.frequency.exponentialRampToValueAtTime(430,n+.055);
      g.gain.setValueAtTime(.020,n);g.gain.exponentialRampToValueAtTime(.001,n+.075);o.start(n);o.stop(n+.08);
    }else if(kind==='timer'){
      o.type='sawtooth';o.frequency.setValueAtTime(330,n);o.frequency.exponentialRampToValueAtTime(100,n+.14);
      g.gain.setValueAtTime(.025,n);g.gain.exponentialRampToValueAtTime(.001,n+.15);o.start(n);o.stop(n+.16);
    }else{
      o.type='square';o.frequency.setValueAtTime(290,n);o.frequency.exponentialRampToValueAtTime(470,n+.05);
      g.gain.setValueAtTime(.014,n);g.gain.exponentialRampToValueAtTime(.001,n+.07);o.start(n);o.stop(n+.08);
    }
    return true;
  }
  let systemHoverKey='';
  // Try on load when sound is enabled so a site/app with audio permission can
  // play the first hover. The user's mute preference persists in this browser.
  if(soundEnabled){
    unlockAudio();
    tryResumeAudio();
  }
  updateSoundStatus();

  // Browsers can block WebAudio until a real user gesture. Prime on pointer/key
  // down before opening a menu, and show the current state in the header.
  async function primeAudioFromGesture(e){
    if(!soundEnabled)return false;
    unlockAudio();
    if(audio?.state==='suspended'){
      try{await audio.resume()}catch{}
    }
    updateSoundStatus();
    if(audio?.state!=='running')return false;

    const target=e?.target;
    if(target?.matches?.('select')&&(e.type==='pointerdown'||(target.matches(audibleSelects)&&soundMenu?.select!==target)))sfx('selectOpen');
    return true;
  }
  document.addEventListener('pointerdown',primeAudioFromGesture,{capture:true});
  document.addEventListener('keydown',(e)=>{
    if(e.key==='Enter'||e.key===' '||e.key==='ArrowUp'||e.key==='ArrowDown')primeAudioFromGesture(e);
  },{capture:true});

  document.addEventListener('pointerover',(e)=>{
    if(e.target.closest('.sound-menu'))return;
    const threatReadout=e.target.closest('.threat-table-v2 tbody td');
    if(threatReadout){
      const previous=e.relatedTarget?.closest?.('.threat-table-v2 tbody td');
      if(previous!==threatReadout)sfx('threatHover');
      return;
    }
    const system=e.target.closest('.system-node');
    if(system){
      const key=system.dataset.system||system.querySelector('.sys-name')?.textContent||'system';
      if(key!==systemHoverKey){
        const played=sfx('systemHover');
        if(played)systemHoverKey=key;
      }
      return;
    }
    const target=e.target.closest('button,summary,.app-tab,select,.fleet-member-toggle');
    if(!target)return;
    const previous=e.relatedTarget?.closest?.('button,summary,.app-tab,select,.fleet-member-toggle');
    if(previous!==target)sfx('hover');
  });
  document.addEventListener('pointerout',(e)=>{
    const system=e.target.closest('.system-node');
    if(!system)return;
    const x=e.clientX,y=e.clientY;
    setTimeout(()=>{
      const under=document.elementFromPoint(x,y)?.closest?.('.system-node');
      if(!under)systemHoverKey='';
      else systemHoverKey=under.dataset.system||under.querySelector('.sys-name')?.textContent||systemHoverKey;
    },0);
  });
  document.addEventListener('click',(e)=>{
    if(e.target.closest('.sound-menu'))return;
    if(e.target.closest('#soundStatus'))return;
    if(e.target.closest('.system-node')){sfx('systemSelect');return}
    if(e.target.closest('button,summary,.app-tab'))sfx('click');
  });
  $('soundStatus').addEventListener('click',async()=>{
    soundEnabled=!soundEnabled;
    localStorage.setItem('jlrSoundEnabled',String(soundEnabled));
    if(soundEnabled){
      unlockAudio();
      if(audio?.state==='suspended'){
        try{await audio.resume()}catch{}
      }
      updateSoundStatus();
      sfx('select');
    }else{
      updateSoundStatus();
    }
  });

  // Listen to both input and change because native select behavior differs by
  // browser/OS. De-dupe the pair so one selection produces one commit tone.
  const controlSoundState=new WeakMap();
  function controlSound(e){
    const target=e.target;
    if(!target?.matches?.('select,input[type="checkbox"],input[type="radio"]'))return;
    const signature=target.matches('select')?`select:${target.value}`:`toggle:${target.checked}`;
    const previous=controlSoundState.get(target);
    const stamp=performance.now();
    if(previous&&previous.signature===signature&&stamp-previous.stamp<180)return;
    controlSoundState.set(target,{signature,stamp});
    if(target.matches('select'))sfx('select');
    else sfx(target.checked?'toggleOn':'toggleOff');
  }
  document.addEventListener('input',controlSound,{capture:true});
  document.addEventListener('change',controlSound,{capture:true});

  // Native <select> popups are drawn by the browser/OS, so moving over their
  // options does not produce page events. Use an app-owned popup for the fit
  // and booster selectors while retaining their existing change handlers.
  const audibleSelects='#calcBoosterCharacter,#calcBoosterFitting,.fleet-fit-select,#doctrineClass,#doctrineCategory,#themeSelect';
  let soundMenu=null, soundMenuSerial=0;
  function closeSoundMenu(refocus=false){
    if(!soundMenu)return;
    const {select,popup}=soundMenu;
    soundMenu=null;
    popup.remove();
    select.removeAttribute('aria-expanded');
    select.removeAttribute('aria-controls');
    select.removeAttribute('aria-activedescendant');
    if(refocus&&select.isConnected)select.focus({preventScroll:true});
  }
  function highlightSoundOption(index,preview=false){
    if(!soundMenu||index<0||soundMenu.select.options[index]?.disabled)return;
    const {popup,select}=soundMenu;
    const button=popup.querySelector(`[data-index="${index}"]`);
    if(!button)return;
    popup.querySelector('.active')?.classList.remove('active');
    button.classList.add('active');
    select.setAttribute('aria-activedescendant',button.id);
    if(preview&&soundMenu.lastPreviewIndex!==index){
      sfx('selectPreview');
      soundMenu.lastPreviewIndex=index;
    }
    soundMenu.activeIndex=index;
    button.scrollIntoView({block:'nearest'});
  }
  function openSoundMenu(select){
    if(select.disabled||!select.options.length)return;
    closeSoundMenu();
    const popup=document.createElement('div');
    const id=`sound-menu-${++soundMenuSerial}`;
    popup.className='sound-menu';popup.id=id;popup.setAttribute('role','listbox');
    if(select.id==='themeSelect')popup.classList.add('theme-menu');
    popup.setAttribute('aria-label',select.labels?.[0]?.querySelector('span')?.textContent?.trim()||select.getAttribute('aria-label')||'Saved mining fit');
    Array.from(select.options).forEach((option,index)=>{
      const button=document.createElement('button');
      button.type='button';button.className='sound-menu-option';button.id=`${id}-option-${index}`;
      button.dataset.index=String(index);button.setAttribute('role','option');
      button.setAttribute('aria-selected',String(index===select.selectedIndex));
      button.disabled=option.disabled;
      if(select.id==='themeSelect'){
        button.dataset.themeValue=String(option.value||'');
        button.classList.add('theme-menu-option');
        const image=document.createElement('span');
        image.className='theme-menu-image theme-glyph';
        image.dataset.themeIcon=String(option.dataset.themeIcon||option.value||'void');
        image.setAttribute('aria-hidden','true');
        image.innerHTML=themeIconMarkup(image.dataset.themeIcon);
        const copy=document.createElement('span');
        copy.className='theme-menu-copy';
        const name=document.createElement('strong');
        name.textContent=option.textContent;
        const note=document.createElement('small');
        note.textContent=String(option.dataset.themeNote||'');
        copy.append(name,note);
        button.append(image,copy);
      }else{
        button.textContent=option.textContent;
      }
      popup.appendChild(button);
    });
    document.body.appendChild(popup);
    soundMenu={select,popup,activeIndex:-1,lastPreviewIndex:-1};
    select.setAttribute('aria-expanded','true');select.setAttribute('aria-controls',id);
    select.focus({preventScroll:true});
    const rect=select.getBoundingClientRect();
    const width=Math.min(window.innerWidth-16,select.id==='themeSelect'?Math.max(rect.width,390):Math.max(rect.width,270));
    popup.style.width=`${width}px`;
    popup.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-width-8))}px`;
    const height=popup.offsetHeight,spaceBelow=window.innerHeight-rect.bottom-8,spaceAbove=rect.top-8;
    const above=spaceBelow<Math.min(height,220)&&spaceAbove>spaceBelow;
    popup.style.top=`${above?Math.max(8,rect.top-height-4):Math.min(rect.bottom+4,window.innerHeight-height-8)}px`;
    const selected=select.selectedIndex;
    highlightSoundOption(selected>=0&&!select.options[selected].disabled?selected:Array.from(select.options).findIndex(o=>!o.disabled));

    // Keep focus on the select so arrow keys, Escape and Tab keep working.
    popup.addEventListener('pointerdown',e=>e.preventDefault());
    popup.addEventListener('pointerover',e=>{
      const option=e.target.closest('.sound-menu-option');
      if(option&&!option.disabled)highlightSoundOption(Number(option.dataset.index),true);
    });
    popup.addEventListener('click',e=>{
      const option=e.target.closest('.sound-menu-option');
      if(option&&!option.disabled)commitSoundOption(Number(option.dataset.index));
    });
  }
  function commitSoundOption(index){
    if(!soundMenu)return;
    const {select}=soundMenu,option=select.options[index];
    if(!option||option.disabled)return;
    const changed=select.value!==option.value;
    select.value=option.value;
    closeSoundMenu(true);
    if(changed){
      select.dispatchEvent(new Event('input',{bubbles:true}));
      select.dispatchEvent(new Event('change',{bubbles:true}));
    }else sfx('select');
  }
  document.addEventListener('pointerdown',e=>{
    const select=e.target.closest?.(audibleSelects);
    if(select&&e.pointerType!=='touch'&&e.button===0){
      e.preventDefault();
      if(soundMenu?.select===select)closeSoundMenu(true);
      else openSoundMenu(select);
    }else if(soundMenu&&!soundMenu.popup.contains(e.target))closeSoundMenu();
  },{capture:true});
  document.addEventListener('keydown',e=>{
    const select=e.target.closest?.(audibleSelects);
    if(!select||select.disabled)return;
    if(e.key==='Tab'){closeSoundMenu();return}
    if(e.key==='Escape'&&soundMenu?.select===select){e.preventDefault();closeSoundMenu(true);return}
    if(!['Enter',' ','ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
    e.preventDefault();
    if(soundMenu?.select!==select){openSoundMenu(select);return}
    if(e.key==='Enter'||e.key===' '){commitSoundOption(soundMenu.activeIndex);return}
    const available=Array.from(select.options).map((o,i)=>o.disabled?-1:i).filter(i=>i>=0);
    if(!available.length)return;
    const current=available.indexOf(soundMenu.activeIndex);
    const next=e.key==='Home'?available[0]:e.key==='End'?available.at(-1):
      available[(current+(e.key==='ArrowDown'?1:available.length-1))%available.length];
    highlightSoundOption(next,true);
  },{capture:true});
  document.addEventListener('focusin',e=>{
    if(soundMenu&&e.target!==soundMenu.select&&!soundMenu.popup.contains(e.target))closeSoundMenu();
  });
  window.addEventListener('resize',()=>closeSoundMenu());

  async function api(url, options={}) {
    const headers={...(options.headers||{})}; if(options.body&&!headers['Content-Type'])headers['Content-Type']='application/json';
    const r=await fetch(url,{...options,headers,credentials:'same-origin'}); const ct=r.headers.get('content-type')||''; const p=ct.includes('application/json')?await r.json():await r.text();
    if(r.status===401){showLogin();throw new Error('Please log in with EVE Online.')} if(!r.ok)throw new Error(p?.message||p?.error||p||`Request failed ${r.status}`); return p;
  }

  function showLogin(){$('app').classList.add('hidden');$('loginView').classList.remove('hidden');}
  function showApp(){$('loginView').classList.add('hidden');$('app').classList.remove('hidden');}
  let activeTab=localStorage.getItem('jlrTab')||'fields';
  if(activeTab==='forge'){
    activeTab='appraisal';
    localStorage.setItem('jlrTab',activeTab);
  }
  let feedbackOpenedFrom=activeTab;
  let feedbackHistory=[];
  let feedbackHistoryLoading=false;
  let feedbackOwner=false;
  let feedbackOwnerCharacter='';
  function doctrineAllowed(){return Boolean(me?.doctrineMarketAccess?.allowed)}
  function trackerAllowed(){return Boolean(me?.trackerAccess?.allowed)}
  function ceoAllowed(){return Boolean(me?.ceoAccess?.allowed)}
  function syncCeoTabAccess(){
    const button=document.querySelector('.app-tab[data-tab="ceo"]');
    const allowed=ceoAllowed();
    if(button){
      button.classList.toggle('hidden',!allowed);
      button.setAttribute('aria-hidden',String(!allowed));
      button.title=allowed
        ?(me?.ceoAccess?.role==='CEO'?'Renius CEO access':'JLR owner access')
        :'Restricted to the JLR owner and Renius';
    }
    if(!allowed&&activeTab==='ceo'){
      activeTab='fields';
      localStorage.setItem('jlrTab',activeTab);
    }
  }
  function renderCeoCommand(){
    const host=$('ceoCommandPanel');
    if(!host)return;
    const status=ceoCommandStatus;
    const statusText=$('ceoCommandStatusText');
    const auth=$('ceoAuthorize');
    const scopeList=$('ceoScopeList');
    if(!status){
      if(statusText)statusText.textContent=ceoCommandLoading?'Checking CEO backend…':'CEO backend status has not loaded yet.';
      if(auth)auth.classList.add('hidden');
      return;
    }
    if(statusText){
      statusText.textContent=status.authorizationUpgradeRequired
        ?'Renius is verified as CEO, but this token needs a core CEO ESI scope refresh.'
        :status.connected
          ?'Renius CEO ESI is connected'+(status.corporationName?' • '+status.corporationName:'')+(status.walletScopeGranted?' • corp wallet connected':status.legacyWalletScopeGranted?' • core online; corp wallet scope is legacy':' • core online; corp wallet scope is separate')+'.'
          :status.canAuthorize
            ?'Backend is ready. Renius can authorize the corporation read scopes here.'
            :'Backend is ready. Waiting for Renius to authorize the corporation read scopes.';
    }
    if(auth){
      const showAuth=Boolean(status.canAuthorize);
      auth.classList.toggle('hidden',!showAuth);
      auth.disabled=!status.authorizeUrl;
      auth.dataset.authorizeUrl=status.authorizeUrl||'';
      auth.textContent=status.connected&&!status.walletScopeGranted?'CONNECT CORP WALLET':status.connected||status.authorizationUpgradeRequired?'UPDATE RENIUS CEO ESI':'AUTHORIZE RENIUS CEO ESI';
    }
    const repair=$('ceoWalletRepair');
    if(repair){
      repair.classList.toggle('hidden',!status.connected||Boolean(status.walletScopeGranted));
      repair.innerHTML='<strong>ONE PERMISSION LEFT: CORPORATION WALLET</strong><p>Members and other granted CEO permissions remain available. Wallet balances and income need one more EVE approval.</p>'+(status.canAuthorize
        ?'<ol><li>Click <b>CONNECT CORP WALLET</b> above.</li><li>Choose Renius and approve the corporation wallet permission in EVE.</li><li>Return here. JLR checks the permission and refreshes CEO data automatically.</li></ol>'
        :'<p>Renius can finish this from his own CEO COMMAND tomorrow. Your account can refresh the available data.</p>');
    }
    const badge=$('ceoConnectionBadge');
    if(badge){
      badge.textContent=status.authorizationUpgradeRequired?'● CEO ESI UPDATE REQUIRED':status.connected?'● CEO ESI CONNECTED':'○ CEO ESI NOT CONNECTED';
      badge.classList.toggle('connected',Boolean(status.connected&&!status.authorizationUpgradeRequired));
    }
    const client=$('ceoOauthClient');
    if(client)client.textContent=status.oauthClientId?'OAuth client '+status.oauthClientId:'';
    if(scopeList){
      const granted=new Set(status.grantedScopes||[]);
      const coreRows=(status.requestedScopes||[]).map(scope=>
        '<div class="ceo-scope-row '+(granted.has(scope)?'granted':'pending')+'"><span>'+
        (granted.has(scope)?'✓':'○')+'</span><code>'+esc(scope)+'</code></div>'
      ).join('');
      const walletScope=String(status.walletScope||'');
      const walletRow=walletScope
        ?'<div class="ceo-scope-row '+(status.walletScopeGranted?'granted':'optional')+'"><span>'+(status.walletScopeGranted?'✓':'◇')+'</span><code>'+esc(walletScope)+(status.walletScopeGranted?' • CONNECTED':' • SETUP NEEDED')+'</code></div>'
        :'';
      scopeList.innerHTML=coreRows+walletRow||'<div class="visual-empty">No CEO scopes configured.</div>';
    }
  }
  function ceoMoney(value){return Math.round(Number(value)||0).toLocaleString()+' ISK'}
  const CEO_PIE_COLORS=['#9c5cff','#ff496c','#51d6ff','#ffc75a','#6bf09a','#ff8b4c','#7d8cff','#e66dff','#6fe6c0','#d9e36a'];
  function ceoPieStyle(rows){
    const list=(rows||[]).filter(row=>Number(row.value)>0);
    const total=list.reduce((sum,row)=>sum+Number(row.value||0),0);
    if(!(total>0))return'conic-gradient(#272b36 0 100%)';
    let cursor=0;
    return'conic-gradient('+list.map((row,index)=>{
      const start=cursor;
      cursor+=Number(row.value||0)/total*100;
      return CEO_PIE_COLORS[index%CEO_PIE_COLORS.length]+' '+start.toFixed(3)+'% '+cursor.toFixed(3)+'%';
    }).join(',')+')';
  }
  function ceoLegend(rows,total){
    const list=(rows||[]).filter(row=>Number(row.value)>0);
    return list.map((row,index)=>{
      const pct=total>0?Number(row.value||0)/total*100:0;
      return '<div class="ceo-legend-row"><i style="background:'+CEO_PIE_COLORS[index%CEO_PIE_COLORS.length]+'"></i><span>'+esc(row.name)+'</span><b>'+esc(ceoMoney(row.value))+'</b><small>'+pct.toFixed(1)+'%</small></div>';
    }).join('')||'<div class="visual-empty">No values available yet.</div>';
  }
  function renderCeoFinance(){
    const data=ceoFinanceData;
    if($('ceoFinanceLoading'))$('ceoFinanceLoading').classList.toggle('hidden',!ceoFinanceLoading);
    const refresh=$('ceoFinanceRefresh');
    if(refresh){refresh.disabled=ceoFinanceLoading||!ceoCommandStatus?.connected;refresh.textContent=ceoFinanceLoading?'REFRESHING…':'REFRESH CEO DATA';}
    if($('ceoOverviewCorporation'))$('ceoOverviewCorporation').textContent=ceoCommandStatus?.corporationName||'Waiting for CEO connection';
    if($('ceoOverviewIdentity'))$('ceoOverviewIdentity').textContent=ceoCommandStatus?.corporationId?'Corporation ID '+ceoCommandStatus.corporationId+' • CEO Renius':'';
    if($('ceoOverviewMembers'))$('ceoOverviewMembers').textContent=data?(data.errors||[]).some(row=>row.section==='members')?'Unavailable':Number(data.members?.count||0).toLocaleString():'—';
    if($('ceoOverviewWallet'))$('ceoOverviewWallet').textContent=data?.walletAccess?.available?ceoMoney(data.finance?.totalBalance||0):'Wallet permission / pull needed';
    if($('ceoOverviewMonths'))$('ceoOverviewMonths').textContent=data?String((data.finance?.months||[]).length)+' ESI months':'—';
    if(!data)return;
    const errors=data.errors||[];
    const failedSections=new Set(errors.map(row=>String(row.section||'')));
    const walletBlocked=data.walletAccess?.available===false||failedSections.has('wallets')||[...failedSections].some(section=>section.startsWith('wallet-journal-'));
    const divisionsBlocked=failedSections.has('divisions');
    const trackingBlocked=failedSections.has('membertracking');

    const months=[...(data.finance?.months||[])];
    if(!ceoSelectedMonth||!months.some(row=>row.month===ceoSelectedMonth))ceoSelectedMonth=months[0]?.month||'';
    const month=months.find(row=>row.month===ceoSelectedMonth)||null;
    const monthSelect=$('ceoIncomeMonth');
    if(monthSelect){
      const current=monthSelect.value;
      monthSelect.innerHTML=months.map(row=>'<option value="'+esc(row.month)+'">'+esc(row.label||row.month+' • ESI')+'</option>').join('');
      monthSelect.value=ceoSelectedMonth||current;
      monthSelect.disabled=!months.length;
    }
    const incomeBlocked=walletBlocked;
    if($('ceoIncomeSource'))$('ceoIncomeSource').textContent='ESI JOURNAL • Positive corporation wallet entries grouped by EVE reference type. JLR retains observed entries so history grows over time.';
    const sources=(month?.sources||[]).map(row=>({name:row.name,value:Number(row.value)||0}));
    const sourceTotal=sources.reduce((sum,row)=>sum+row.value,0);
    if($('ceoIncomePie'))$('ceoIncomePie').style.background=incomeBlocked?'conic-gradient(#2a2020 0 100%)':ceoPieStyle(sources);
    if($('ceoIncomeLegend'))$('ceoIncomeLegend').innerHTML=incomeBlocked
      ?'<div class="visual-empty">ESI WALLET ACCESS DENIED</div>'
      :ceoLegend(sources,sourceTotal);
    if($('ceoIncomeTotals'))$('ceoIncomeTotals').innerHTML=incomeBlocked
      ?'<strong>WALLET JOURNAL ACCESS REQUIRED</strong>'
      :month
        ?'<span>IN '+esc(ceoMoney(month.income))+'</span><span>OUT '+esc(ceoMoney(month.expenses))+'</span><strong>NET '+esc(ceoMoney(month.net))+'</strong>'
        :'<span>No journal month available yet.</span>';

    const wallets=(data.finance?.wallets||[]).map(row=>({name:row.name,value:Math.max(0,Number(row.balance)||0)}));
    const walletTotal=wallets.reduce((sum,row)=>sum+row.value,0);
    if($('ceoWalletPie'))$('ceoWalletPie').style.background=walletBlocked?'conic-gradient(#2a2020 0 100%)':ceoPieStyle(wallets);
    if($('ceoWalletLegend'))$('ceoWalletLegend').innerHTML=walletBlocked
      ?'<div class="visual-empty">ESI WALLET ACCESS DENIED</div>'
      :divisionsBlocked
        ?'<div class="visual-empty">ESI DIVISION ACCESS DENIED</div>'
        :ceoLegend(wallets,walletTotal);
    if($('ceoWalletTotal'))$('ceoWalletTotal').textContent=walletBlocked?'WALLET ESI UNAVAILABLE':ceoMoney(data.finance?.totalBalance||0);
    const walletNote=$('ceoWalletNote');
    if(walletNote){
      const wa=data.walletAccess||{};
      walletNote.textContent=walletBlocked
        ?(!wa.granted?'Corporation wallet permission is missing. Renius can finish the setup above; available CEO data still works.':'The wallet permission is granted, but ESI could not return wallet data. Refresh CEO data to retry; see access details below.')
        :'Corporation wallet ESI is live.';
      walletNote.classList.toggle('blocked',walletBlocked);
    }
    if($('ceoMemberCount'))$('ceoMemberCount').textContent=failedSections.has('members')?'Unavailable':Number(data.members?.count||0).toLocaleString();

    const roleHealth=$('ceoRoleHealth');
    if(roleHealth){
      const assigned=data.roleHealth?.assigned||[];
      const requirements=data.roleHealth?.requirements||[];
      roleHealth.innerHTML=
        '<div class="ceo-role-title"><strong>CEO / ESI ACCESS HEALTH</strong><small>'+esc(assigned.length?assigned.join(' • '):'Renius verified as corporation CEO')+'</small></div>'+
        '<div class="ceo-role-grid">'+requirements.map(row=>
          '<div class="ceo-role-row '+(row.ready?'ready':'blocked')+'"><span>'+(row.ready?'✓':'!')+'</span><div><b>'+esc(row.feature)+'</b><small>'+esc((row.documentedRoles||[]).join(' / ')||'ESI access check')+'</small></div></div>'
        ).join('')+'</div>'+
        ((!walletBlocked&&!divisionsBlocked&&!trackingBlocked)?'':'<p class="ceo-role-note">Renius is already verified as CEO. Do not change his corporation roles just for JLR; the blocked rows above are ESI endpoint denials and JLR will show the exact response below.</p>');
    }

    const memberMonthSelect=$('ceoMemberMonth');
    const selectedMemberMonth=memberMonthSelect?.value||'';
    if(memberMonthSelect){memberMonthSelect.innerHTML='<option value="">All observed months</option>'+(data.finance?.months||[]).map(row=>'<option value="'+esc(row.month)+'">'+esc(row.month)+'</option>').join('');memberMonthSelect.value=selectedMemberMonth;}
    const memberMonth=memberMonthSelect?.value||'';
    const financeRows=(data.members?.finance||[]).map(row=>memberMonth?{...row,...(row.months?.[memberMonth]||{corpWalletIn:0,corpWalletOut:0,corpWalletNet:0,journalEntries:0})}:row);
    window.JlrCeoJournal?.setMembers(financeRows);
    window.JlrCeoDiscord?.setMembers(financeRows);
    const memberSelect=$('ceoLoyaltyMember');
    if(memberSelect){
      const selected=memberSelect.value;
      memberSelect.innerHTML='<option value="">Choose member…</option>'+financeRows.map(row=>
        '<option value="'+esc(String(row.characterId))+'">'+esc(row.name)+' • '+Number(row.loyalty?.balance||0).toLocaleString()+' pts</option>'
      ).join('');
      if(financeRows.some(row=>String(row.characterId)===selected))memberSelect.value=selected;
    }
    const memberRows=$('ceoMemberFinanceRows');
    if(memberRows){
      const filtered=window.JlrCeoMembers?.select(financeRows,{query:$('ceoMemberSearch')?.value||'',activity:$('ceoMemberActivity')?.value||'all',sort:$('ceoMemberSort')?.value||'name'})||financeRows;
      const memberCount=$('ceoMemberResultCount');
      if(memberCount)memberCount.textContent=failedSections.has('members')?'Corporation roster unavailable':filtered.length+' of '+financeRows.length+' members • ESI snapshot';
      const memberDate=value=>trackingBlocked?'Tracking unavailable':window.JlrCeoMembers?.formatDate(value)||'Not reported';
      memberRows.innerHTML=filtered.length?filtered.map(row=>{
        const net=Number(row.corpWalletNet)||0;
        return '<details class="ceo-member-record"><summary class="ceo-member-row">'+
          '<div class="ceo-member-name"><strong>'+esc(row.name)+'</strong><small>Last login: '+esc(memberDate(row.logonDate))+'</small></div>'+
          '<div><small>TO CORP</small><b>'+esc(walletBlocked?'Unavailable':ceoMoney(row.corpWalletIn||0))+'</b></div>'+
          '<div><small>FROM CORP</small><b>'+esc(walletBlocked?'Unavailable':ceoMoney(row.corpWalletOut||0))+'</b></div>'+
          '<div><small>NET TO CORP</small><b class="'+(!walletBlocked?(net>=0?'positive':'negative'):'')+'">'+esc(walletBlocked?'Unavailable':ceoMoney(net))+'</b></div>'+
          '<div><small>ENTRIES</small><b>'+esc(walletBlocked?'Unavailable':Number(row.journalEntries||0).toLocaleString())+'</b></div>'+
        '</summary><div class="ceo-member-details">'+
          '<div><small>JOINED CORPORATION</small><b>'+esc(memberDate(row.startDate))+'</b></div>'+
          '<div><small>LAST LOGIN</small><b>'+esc(memberDate(row.logonDate))+'</b></div>'+
          '<div><small>LAST LOGOUT</small><b>'+esc(memberDate(row.logoffDate))+'</b></div>'+
          '<div><small>WALLET JOURNAL REFERENCES</small><b>'+esc(walletBlocked?'Unavailable':Number(row.journalEntries||0).toLocaleString())+'</b></div>'+
          '<div><small>CHARACTER ID</small><b>'+esc(String(row.characterId))+'</b></div>'+
          '</div><div class="ceo-member-journal-action"><button type="button" class="board-tool" data-ceo-member-journal="'+esc(String(row.characterId))+'" data-ceo-member-month="'+esc(memberMonth)+'">VIEW WALLET ACTIVITY</button><small>Entries naming this member as either party. Amounts show the corporation wallet direction.</small></div>'+ ('<details class="ceo-optional-loyalty"><summary>Optional loyalty history</summary>'+(window.JlrCeoMembers?.loyaltyHistory(row.loyalty)||'')+'</details>')+'</details>';
      }).join(''):'<div class="visual-empty">'+(financeRows.length?'No members match these filters.':failedSections.has('members')?'Corporation roster could not be loaded.':'No corporation members returned.')+'</div>';
    }

    const adjustButton=$('ceoLoyaltyAdjust');
    if(adjustButton){
      adjustButton.disabled=ceoLoyaltyBusy;
      adjustButton.textContent=ceoLoyaltyBusy?'SAVING…':'ADJUST POINTS';
    }

    if($('ceoFinanceStamp'))$('ceoFinanceStamp').textContent=data.generatedAt?'ESI '+new Date(data.generatedAt).toLocaleString():'';
    const warnings=$('ceoFinanceWarnings');
    if(warnings){
      warnings.classList.toggle('hidden',!errors.length);
      const uniqueMessages=[...new Set(errors.map(row=>String(row.message||'').trim()).filter(Boolean))];
      warnings.innerHTML=errors.length
        ?'<strong>ESI ACCESS CHECK</strong> '+esc(uniqueMessages.length?uniqueMessages.join(' • '):errors.map(row=>row.section).join(', '))
        :'';
    }
  }
    async function adjustCeoLoyalty(){
    if(ceoLoyaltyBusy)return;
    const characterId=String($('ceoLoyaltyMember')?.value||'');
    const points=Math.trunc(Number($('ceoLoyaltyPoints')?.value));
    const note=String($('ceoLoyaltyNote')?.value||'').trim();
    if(!characterId){toast('Choose a corporation member first.');return}
    if(!Number.isFinite(points)||points===0){toast('Enter a positive or negative loyalty point adjustment.');return}
    ceoLoyaltyBusy=true;renderCeoFinance();
    try{
      await api('/api/ceo/loyalty/adjust',{method:'POST',body:JSON.stringify({characterId,points,note})});
      if($('ceoLoyaltyPoints'))$('ceoLoyaltyPoints').value='';
      if($('ceoLoyaltyNote'))$('ceoLoyaltyNote').value='';
      ceoFinanceData=null;
      await loadCeoFinance(true);
      toast('Loyalty points updated.');
    }catch(error){toast('Loyalty: '+String(error.message||error))}
    finally{ceoLoyaltyBusy=false;renderCeoFinance()}
  }
  async function loadCeoFinance(force=false){
    if(!ceoAllowed()||!ceoCommandStatus?.connected||ceoFinanceLoading)return;
    if(ceoFinanceData&&!force){renderCeoFinance();return}
    ceoFinanceLoading=true;renderCeoFinance();window.JlrCeoHealth?.schedule();
    try{ceoFinanceData=await api('/api/ceo/finance'+(force?'?force=1':''));void window.JlrCeoJournal?.load()}
    catch(error){toast('CEO finance: '+String(error.message||error))}
    finally{ceoFinanceLoading=false;renderCeoFinance();window.JlrCeoHealth?.schedule()}
  }
  async function loadCeoCommand(force=false){
    if(!ceoAllowed()||ceoCommandLoading)return;
    void window.JlrCeoMoons?.load(force);
    void window.JlrCeoOperations?.load(force);
    void window.JlrCeoJournal?.load();
    void window.JlrCeoHealth?.load();
    void window.JlrCeoDiscord?.load();
    if(ceoCommandStatus&&!force){
      renderCeoCommand();
      if(ceoCommandStatus.connected&&!ceoCommandStatus.authorizationUpgradeRequired)void loadCeoFinance(false);
      return;
    }
    ceoCommandLoading=true;
    renderCeoCommand();
    try{ceoCommandStatus=await api('/api/ceo/status')}
    catch(error){
      ceoCommandStatus={connected:false,canAuthorize:false,requestedScopes:[],grantedScopes:[],error:String(error.message||error)};
      toast('CEO Command status: '+String(error.message||error));
    }finally{
      ceoCommandLoading=false;
      renderCeoCommand();
      if(ceoCommandStatus?.connected&&!ceoCommandStatus?.authorizationUpgradeRequired)void loadCeoFinance(force);
    }
  }
  function syncTrackerTabAccess(){
    const button=document.querySelector('.app-tab[data-tab="tracker"]');
    const allowed=trackerAllowed();
    if(button){
      button.classList.toggle('hidden',!allowed);
      button.setAttribute('aria-hidden',String(!allowed));
      button.title=allowed
        ?('Corporation verified'+(me?.trackerAccess?.corporationName?' • '+me.trackerAccess.corporationName:''))
        :'Restricted to the configured corporation';
    }
    if(!allowed&&activeTab==='tracker'){
      activeTab='fields';
      localStorage.setItem('jlrTab',activeTab);
    }
  }
  function syncDoctrineTabAccess(){
    const button=document.querySelector('.app-tab[data-tab="doctrine"]');
    const allowed=doctrineAllowed();
    if(button){
      button.classList.toggle('hidden',!allowed);
      button.setAttribute('aria-hidden',String(!allowed));
      button.title=allowed
        ?(me?.doctrineMarketAccess?.reason==='INIT_MEMBER'?'INIT member verified':'INIT blue verified')
        :'Requires a linked INIT or INIT-blue character';
    }
    if(!allowed&&activeTab==='doctrine'){
      activeTab='fields';
      localStorage.setItem('jlrTab',activeTab);
    }
  }
  const NAV_TAB_LABELS={fields:'FIELDS',fleet:'FLEET',performance:'PERFORMANCE',tracker:'TRACKER',ice:'ICE',gas:'GAS',appraisal:'APPRAISAL',doctrine:'DOCTRINE',pvp:'INIT PVP',threat:'THREAT',mer:'MER',brain:'ADAM',toons:'TOONS',ceo:'CEO COMMAND',feedback:'FEEDBACK'};
  function closeNavDropdowns(except=null){
    document.querySelectorAll('.nav-menu[open]').forEach(menu=>{if(menu!==except)menu.open=false});
  }
  function syncNavDropdowns(tab=activeTab){
    document.querySelectorAll('.nav-menu').forEach(menu=>{
      const button=menu.querySelector('.app-tab[data-tab="'+tab+'"]');
      menu.classList.toggle('active',!!button);
      const current=menu.querySelector('.nav-menu-current');
      if(current)current.textContent=button?(NAV_TAB_LABELS[tab]||String(button.textContent||'').trim()):'';
    });
  }
  function initNavDropdowns(){
    const nav=document.querySelector('.nav-dropdown-bar');
    if(!nav||nav.dataset.dropdownReady==='1')return;
    nav.dataset.dropdownReady='1';
    nav.querySelectorAll('.nav-menu').forEach(menu=>menu.addEventListener('toggle',()=>{if(menu.open)closeNavDropdowns(menu)}));
    nav.querySelectorAll('.nav-menu .app-tab').forEach(button=>button.addEventListener('click',()=>closeNavDropdowns()));
    document.addEventListener('pointerdown',event=>{if(!event.target.closest('.nav-menu'))closeNavDropdowns()});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeNavDropdowns()});
    syncNavDropdowns(activeTab);
  }

  function applyTab(tab){
    const valid=['fields','brain','fleet','performance','ice','gas','appraisal','pvp','threat','mer','toons','feedback'];
    if(doctrineAllowed())valid.splice(5,0,'doctrine');
    if(trackerAllowed()){
      const pvpIndex=valid.indexOf('pvp');
      valid.splice(pvpIndex+1,0,'tracker');
    }
    if(ceoAllowed())valid.push('ceo');
    const nextTab=valid.includes(tab)?tab:'fields';
    if(nextTab==='feedback'&&activeTab!=='feedback')feedbackOpenedFrom=activeTab;
    const previousTab=activeTab;
    if(nextTab==='brain'&&previousTab&&previousTab!=='brain'){
      adamWorkingTab=previousTab;
      localStorage.setItem('jlrAdamWorkingTab',adamWorkingTab);
    }else if(nextTab!=='brain'){
      adamWorkingTab=nextTab;
      localStorage.setItem('jlrAdamWorkingTab',adamWorkingTab);
    }
    activeTab=nextTab;
    if(previousTab!==activeTab)adamRecordAction('tab-open',{tab:activeTab,detail:activeTab==='brain'?'from '+adamWorkingTab:''});
    localStorage.setItem('jlrTab',activeTab);
    document.querySelectorAll('.app-tab').forEach(button=>button.classList.toggle('active',button.dataset.tab===activeTab));
    document.querySelectorAll('.tab-panel').forEach(panel=>panel.classList.toggle('active',panel.dataset.tab===activeTab));
    syncNavDropdowns(activeTab);
    if(activeTab!=='pvp'&&pvpIntelPoll){clearTimeout(pvpIntelPoll);pvpIntelPoll=null}
    if(activeTab==='fields'&&state){
      renderBoards();renderTimers();renderSelect();renderSelected();
    }
    if(activeTab==='doctrine'&&!doctrineMarket&&!doctrineMarketLoading)loadDoctrineMarket();
    if(activeTab==='performance')refreshFleetPerformanceData(false);
    if(activeTab==='appraisal'){
      renderAppraisal();
      void loadAppraisalMarkets();
    }
    if(activeTab==='brain'){
      renderAdamContext();
      refreshCompanionStatus();
      if(scoutFollowEnabled)pollScoutLocation(true);
      void loadScoutTargets(false);
    }
    if(activeTab==='pvp'&&!pvpIntel&&!pvpIntelLoading)loadPvpIntel();
    if(activeTab==='threat')renderThreatScan();
    if(activeTab==='ceo')void loadCeoCommand(false);
    if(activeTab==='feedback'){
      renderFeedbackHub();
      loadFeedbackHistory(false);
    }
  }
  function initTabs(){
    const host=$('tabHost');
    if(!host||host.dataset.ready==='1')return;
    host.dataset.ready='1';

    const makePanel=(name)=>{
      const panel=document.createElement('div');
      panel.className='tab-panel';
      panel.dataset.tab=name;
      host.appendChild(panel);
      return panel;
    };
    const fields=makePanel('fields');
    const brain=makePanel('brain');
    const fleet=makePanel('fleet');
    const performance=makePanel('performance');
    const ice=makePanel('ice');
    const gas=makePanel('gas');
    const appraisal=makePanel('appraisal');
    appraisal.id='appraisalPanel';
    const doctrine=makePanel('doctrine');
    doctrine.id='doctrineMarketPanel';
    const pvp=makePanel('pvp');
    pvp.id='pvpIntelPanel';
    const tracker=makePanel('tracker');
    tracker.id='heavyFighterTrackerPanel';
    const threat=makePanel('threat');
    threat.id='threatScanPanel';
    const mer=makePanel('mer');
    mer.id='merIntelPanel';
    const toons=makePanel('toons');
    const ceo=makePanel('ceo');
    ceo.id='ceoCommandPanel';
    const feedback=makePanel('feedback');
    feedback.id='feedbackPanel';

    ceo.innerHTML=`
      <section class="ceo-command-shell">
        <section class="glass ceo-command-hero">
          <div>
            <span class="eyebrow">PRIVATE // JLR OWNER + RENIUS</span>
            <h2>CEO COMMAND</h2>
            <p id="ceoCommandStatusText">Checking CEO backend…</p>
          </div>
          <div class="ceo-command-actions">
            <span id="ceoConnectionBadge" class="status-pill">○ CEO ESI NOT CONNECTED</span>
            <button id="ceoAuthorize" class="orb purple hidden" type="button">AUTHORIZE RENIUS CEO ESI</button>
          </div>
        </section>
        <section id="ceoWalletRepair" class="glass ceo-wallet-repair hidden" aria-live="polite"></section>
        <section class="glass ceo-overview-card"><span class="eyebrow">CORPORATION OVERVIEW</span><h3 id="ceoOverviewCorporation">Waiting for CEO connection</h3><small id="ceoOverviewIdentity"></small><div class="ceo-operation-summary"><div><small>MEMBERS IN ESI ROSTER</small><strong id="ceoOverviewMembers">—</strong></div><div><small>CURRENT CORPORATION WALLET</small><strong id="ceoOverviewWallet">Unavailable</strong></div><div><small>OBSERVED INCOME HISTORY</small><strong id="ceoOverviewMonths">—</strong></div></div></section>
        <section class="glass ceo-health-card"><div class="ceo-card-title"><div><span class="eyebrow">DATA HEALTH</span><h3>CEO READINESS</h3></div><button id="ceoHealthRefresh" class="board-tool" type="button">REFRESH STATUS</button></div><p>Pull status for each section. Refreshing this status does not pull ESI data. Open each operations tab to load it; use its refresh button for a new pull. Status updates after a section finishes loading.</p><small id="ceoHealthSummary">Checking data health…</small><div id="ceoHealthRows"></div></section>
        <section class="ceo-command-grid">
          <article class="glass ceo-command-card ceo-chart-card"><div class="ceo-card-title"><div><span class="eyebrow">MONTHLY INCOME</span><h3>INCOME SOURCES</h3></div><select id="ceoIncomeMonth" aria-label="Income month"></select></div><p id="ceoIncomeSource">Current ESI wallet entries grouped by month.</p><div class="ceo-chart-row"><div id="ceoIncomePie" class="ceo-pie"></div><div id="ceoIncomeLegend" class="ceo-legend"><div class="visual-empty">Waiting for Renius CEO ESI.</div></div></div><div id="ceoIncomeTotals" class="ceo-finance-totals"></div></article>
          <article class="glass ceo-command-card ceo-chart-card"><span class="eyebrow">CORE FINANCE</span><h3>WALLET BREAKDOWN</h3><p>Live corporation wallet divisions and current balances.</p><div class="ceo-chart-row"><div id="ceoWalletPie" class="ceo-pie"></div><div id="ceoWalletLegend" class="ceo-legend"><div class="visual-empty">Waiting for Renius CEO ESI.</div></div></div><div class="ceo-big-number"><small>TOTAL CORP WALLET</small><strong id="ceoWalletTotal">—</strong></div><div id="ceoWalletNote" class="ceo-wallet-note"></div></article>
          <article class="glass ceo-command-card ceo-journal-card" id="ceoJournalCard"><div class="ceo-card-title"><div><span class="eyebrow">WALLET JOURNAL</span><h3>TRANSACTION EXPLORER</h3></div><button id="ceoJournalRefresh" class="board-tool" type="button">REFRESH VIEW</button></div><p>Inspect saved ESI journal entries. Use REFRESH CEO DATA to pull new entries from EVE. History contains entries observed by JLR, rather than a complete corporation accounting record. Member filtering matches either party exactly. These are corporation wallet amounts, not personal earnings.</p><small id="ceoJournalStamp"></small><div id="ceoJournalWarning" class="ceo-wallet-note blocked hidden"></div><div id="ceoJournalSummary" class="ceo-operation-summary"></div><div class="ceo-journal-filters"><input id="ceoJournalSearch" type="search" maxlength="160" aria-label="Search wallet journal" placeholder="Search reason, reference type, journal or party ID…"><select id="ceoJournalParty" aria-label="Wallet journal member"><option value="">All parties / members</option></select><select id="ceoJournalMonth" aria-label="Wallet journal month"><option value="">All observed months</option></select><select id="ceoJournalDivision" aria-label="Wallet journal division"><option value="">All divisions</option>${Array.from({length:7},(_,i)=>'<option value="'+(i+1)+'">Division '+(i+1)+'</option>').join('')}</select><select id="ceoJournalDirection" aria-label="Wallet journal direction"><option value="">All entries</option><option value="in">Money in</option><option value="out">Money out</option><option value="zero">Zero amount</option></select></div><div class="ceo-operation-pager"><small id="ceoJournalCount"></small><button id="ceoJournalPrev" class="board-tool" type="button" disabled>PREVIOUS</button><button id="ceoJournalNext" class="board-tool" type="button" disabled>NEXT</button></div><div id="ceoJournalRecords" class="ceo-operation-records"></div></article>
          <article class="glass ceo-command-card ceo-member-card"><span class="eyebrow">MEMBERS</span><h3>MEMBER WALLET TRANSACTIONS</h3><p>Money into and out of corporation wallets involving each member. Choose a month, then open a member to inspect the matching journal entries.</p><div class="ceo-member-head"><div class="ceo-big-number"><small>CORP MEMBERS</small><strong id="ceoMemberCount">—</strong></div><div id="ceoRoleHealth" class="ceo-role-health"></div></div><details class="ceo-optional-loyalty"><summary>Optional manual loyalty points</summary><p>Separate reward points, unrelated to ISK transactions.</p><div class="ceo-loyalty-controls"><select id="ceoLoyaltyMember" aria-label="Corporation member"><option value="">Choose member…</option></select><input id="ceoLoyaltyPoints" type="number" step="1" min="-100000" max="100000" placeholder="+/- points"><input id="ceoLoyaltyNote" maxlength="160" placeholder="Reason / note"><button id="ceoLoyaltyAdjust" class="board-tool" type="button">ADJUST POINTS</button></div></details><div class="ceo-member-filters"><input id="ceoMemberSearch" type="search" aria-label="Search corporation members" placeholder="Search member name or character ID…"><select id="ceoMemberMonth" aria-label="Member transaction month"><option value="">All observed months</option></select><select id="ceoMemberActivity" aria-label="Filter member login dates"><option value="all">All members</option><option value="recent">Logged in within 7 days</option><option value="older">Last login over 30 days ago</option><option value="unknown">Login date not reported</option></select><select id="ceoMemberSort" aria-label="Sort corporation members"><option value="name">Name A–Z</option><option value="login">Most recent login</option><option value="joined">Most recently joined</option><option value="deposits">Largest deposits</option><option value="withdrawals">Largest withdrawals</option></select></div><small id="ceoMemberResultCount"></small><p>Expand a member for join and login dates. Dates reflect the ESI snapshot and do not indicate who is online now.</p><div class="ceo-member-table-head"><span>MEMBER</span><span>TO CORP</span><span>FROM CORP</span><span>NET TO CORP</span><span>ENTRIES</span></div><div id="ceoMemberFinanceRows" class="ceo-member-finance"><div class="visual-empty">Waiting for corporation roster…</div></div></article>

          <article class="glass ceo-command-card ceo-sov-source-card">
            <span class="eyebrow">FOUNTAIN FIELD DATA</span>
            <h3>USER MAP TRANSCRIPTION</h3>
            <p>The Fields board uses a private INIT map snapshot, restricted to verified locations within 6 LY of C-N4OD. T2 arrays are cyan and labeled T2. Infrastructure status is separate from scanned site availability.</p>
          </article>
          <article class="glass ceo-command-card ceo-moon-card"><div class="ceo-card-title"><div><span class="eyebrow">CORPORATION ESI</span><h3>METENOX + STRUCTURES</h3></div><button id="ceoMoonRefresh" class="board-tool" type="button">REFRESH METENOX + STRUCTURES</button></div><p id="ceoMoonSource">Loading current Metenox drills…</p><div id="ceoMoonSummary" class="ceo-moon-summary"></div><small id="ceoMoonCount"></small><div id="ceoMoonRecords" class="ceo-moon-records"></div><div class="ceo-live-head"><h3>CORPORATION STRUCTURES</h3><small id="ceoStructuresStamp"></small></div><div id="ceoStructuresWarning" class="ceo-wallet-note blocked hidden"></div><p id="ceoStructureSummary"></p><div class="ceo-structure-filters"><input id="ceoStructureSearch" type="search" aria-label="Search corporation structures" placeholder="Search system, type, service or structure ID…"><select id="ceoStructureFilter" aria-label="Filter structure upkeep"><option value="all">All structures</option><option value="fuel">Low fuel / expiry passed</option><option value="offline">Offline services</option><option value="unknown">Fuel expiry not reported</option></select></div><small id="ceoStructureCount"></small><div id="ceoLiveStructures"></div></article>
          <article class="glass ceo-command-card ceo-operations-card"><div class="ceo-card-title"><div><span class="eyebrow">CORPORATION OPERATIONS</span><h3>ASSETS • JOBS • CONTRACTS • ORDERS</h3></div><button id="ceoOperationRefresh" class="board-tool" type="button">REFRESH ASSETS</button></div><div class="ceo-operation-tabs" role="tablist" aria-label="Corporation operations"><button type="button" role="tab" aria-selected="true" data-ceo-operation-tab="assets">ASSETS</button><button type="button" role="tab" aria-selected="false" data-ceo-operation-tab="jobs">INDUSTRY JOBS</button><button type="button" role="tab" aria-selected="false" data-ceo-operation-tab="contracts">CONTRACTS</button><button type="button" role="tab" aria-selected="false" data-ceo-operation-tab="orders">MARKET ORDERS</button></div><p id="ceoOperationStamp">Loading corporation operations…</p><div id="ceoOperationWarning" class="ceo-wallet-note blocked hidden"></div><div id="ceoOperationSummary" class="ceo-operation-summary"></div><div class="ceo-operation-filters"><input id="ceoOperationSearch" type="search" aria-label="Search corporation operations" placeholder="Search items, names, locations or IDs…"><select id="ceoOperationFilter" aria-label="Filter corporation operations"><option value="">All storage</option></select><select id="ceoOperationSort" aria-label="Sort corporation operations"><option value="name">Name A–Z</option><option value="amount">Most units</option></select></div><p id="ceoOperationNote"></p><div class="ceo-operation-pager"><small id="ceoOperationCount"></small><button id="ceoOperationPrev" class="board-tool" type="button" disabled>PREVIOUS</button><button id="ceoOperationNext" class="board-tool" type="button" disabled>NEXT</button></div><div id="ceoOperationRecords" class="ceo-operation-records"></div></article>
          <article class="glass ceo-command-card ceo-discord-card"><div class="ceo-card-title"><div><span class="eyebrow">COMMUNICATIONS</span><h3>DISCORD PARTICIPATION</h3></div><button id="ceoDiscordRefresh" class="board-tool" type="button">REFRESH ACTIVITY</button></div><strong id="ceoDiscordStatus">Checking Discord setup…</strong><p id="ceoDiscordNote">Message counts and voice-channel presence. No message contents or audio are stored.</p><div id="ceoDiscordWarning" class="ceo-wallet-note blocked hidden"></div><div id="ceoDiscordSummary" class="ceo-moon-summary"></div><div class="ceo-moon-filters"><input id="ceoDiscordSearch" type="search" maxlength="100" aria-label="Search Discord activity" placeholder="Search Discord name, ID or linked EVE member…"><select id="ceoDiscordDays" aria-label="Discord activity period"><option value="7">7 UTC days</option><option value="30" selected>30 UTC days</option><option value="90">90 UTC days</option></select><select id="ceoDiscordSort" aria-label="Sort Discord activity"><option value="messages">Most messages</option><option value="voice">Most voice-channel time</option><option value="name">Name A–Z</option></select></div><div class="ceo-operation-pager"><small id="ceoDiscordCount"></small><button id="ceoDiscordPrev" class="board-tool" type="button">PREVIOUS</button><button id="ceoDiscordNext" class="board-tool" type="button">NEXT</button></div><div id="ceoDiscordRecords" class="ceo-operation-records"></div><details class="ceo-discord-setup"><summary>Link Discord accounts to corporation members</summary><p>Choose the matching accounts yourself. Names are not automatically matched and activity does not award loyalty points.</p><div class="ceo-discord-link"><select id="ceoDiscordUser" aria-label="Discord account"><option value="">Choose observed Discord account…</option></select><select id="ceoDiscordMember" aria-label="EVE member"><option value="">Choose EVE member…</option></select><button id="ceoDiscordLink" class="board-tool" type="button">LINK MEMBER</button><button id="ceoDiscordUnlink" class="board-tool" type="button">UNLINK</button></div></details><details class="ceo-discord-setup"><summary>Connect or update the Discord bot</summary><ol><li>Open the <a href="https://discord.com/developers/applications" target="_blank" rel="noopener">Discord Developer Portal</a>, create a dedicated application, and get its bot token.</li><li>Enable Developer Mode in Discord, then right-click the corporation server and copy its server ID.</li><li>Enter the server ID and token below. If installation is needed, JLR supplies the bot invite link. Install it with View Channels access, then connect again.</li></ol><p>JLR uses standard Guilds, Guild Messages, and Guild Voice States intents. Message Content, Server Members, and Presence privileged intents are not required. The token is encrypted on the server; it is never returned to this page.</p><div class="ceo-discord-link"><input id="ceoDiscordGuild" inputmode="numeric" maxlength="22" aria-label="Discord server ID" placeholder="Discord server ID"><input id="ceoDiscordToken" type="password" autocomplete="off" maxlength="300" aria-label="Discord bot token" placeholder="Bot token — leave blank to keep saved token"><button id="ceoDiscordConnect" class="board-tool" type="button">CONNECT BOT</button><button id="ceoDiscordPause" class="board-tool hidden" type="button">PAUSE TRACKING</button></div><a id="ceoDiscordInvite" class="board-tool hidden" href="https://discord.com/developers/applications" target="_blank" rel="noopener">INSTALL BOT IN DISCORD</a><p>Pause stops collection and preserves saved counts. No Discord messages are sent by this bot. Tracking starts after connection, and missed activity during downtime is not estimated.</p></details></article>
        </section>
        <div class="ceo-finance-foot"><span id="ceoFinanceLoading" class="hidden">Refreshing corporation ESI…</span><span id="ceoFinanceStamp"></span><button id="ceoFinanceRefresh" class="orb silver" type="button">REFRESH CEO DATA</button></div>
        <div id="ceoFinanceWarnings" class="ceo-finance-warnings hidden"></div>
        <section class="glass ceo-scope-panel">
          <div class="brain-card-head"><strong>CEO ESI PERMISSION SET</strong><small>Dedicated Renius token • normal JLR toon permissions stay unchanged</small></div><div id="ceoOauthClient" class="ceo-oauth-client"></div>
          <div id="ceoScopeList" class="ceo-scope-list"><div class="visual-empty">Loading requested scopes…</div></div>
        </section>
      </section>`;

    $('ceoAuthorize')?.addEventListener('click',()=>{
      const url=String(ceoCommandStatus?.authorizeUrl||$('ceoAuthorize')?.dataset?.authorizeUrl||'');
      if(url)window.location.assign(url);
    });
    $('ceoFinanceRefresh')?.addEventListener('click',()=>{void loadCeoFinance(true);void window.JlrCeoMoons?.load(true);void window.JlrCeoOperations?.refreshAll();void window.JlrCeoDiscord?.load();});
    $('ceoLoyaltyAdjust')?.addEventListener('click',()=>void adjustCeoLoyalty());
    $('ceoMemberSearch')?.addEventListener('input',renderCeoFinance);
    $('ceoMemberActivity')?.addEventListener('change',renderCeoFinance);
    $('ceoMemberMonth')?.addEventListener('change',renderCeoFinance);
    $('ceoMemberSort')?.addEventListener('change',renderCeoFinance);
    $('ceoIncomeMonth')?.addEventListener('change',event=>{
      ceoSelectedMonth=String(event.target.value||'');
      renderCeoFinance();
    });

    appraisal.innerHTML=`
      <section class="appraisal-shell">
        <section class="glass appraisal-panel">
          <div class="appraisal-head">
            <div>
              <span class="eyebrow">JLR MARKET NETWORK // APPRAISAL</span>
              <h2>JLR APPRAISAL</h2>
              <p>Paste inventory, cargo, ore, modules, loot, or a simple item list. JLR prices it, shows Buy / Split / Sell together, and can create a JLR share link.</p>
            </div>
            <span class="status-pill">● LIVE MARKET DATA</span>
          </div>
          <div class="appraisal-controls">
            <label class="appraisal-field appraisal-title-field"><span>APPRAISAL NAME</span><input id="appraisalTitle" maxlength="120" placeholder="Example: Fleet loot split"></label>
            <label class="appraisal-field"><span>MARKET</span><select id="appraisalMarket"><option value="2">Jita 4-4</option></select></label>
            <label class="appraisal-field"><span>PRICE</span><select id="appraisalPricing"><option value="split" selected>SPLIT</option><option value="buy">BUY</option><option value="sell">SELL</option><option value="refine-buy">REFINE BUY</option><option value="refine-sell">REFINE SELL</option></select></label>
            <label class="appraisal-field"><span>PRICING BASIS</span><select id="appraisalVariant"><option value="immediate" selected>IMMEDIATE</option><option value="top5percent">TOP 5% AVERAGE</option></select></label>
          </div>
          <div class="appraisal-quick-entry">
            <label class="appraisal-field"><span>TYPE ITEM / QTY</span><input id="appraisalQuickEntry" autocomplete="off" placeholder="10 Hulk — press Enter"></label>
            <button id="appraisalQuickAdd" class="orb purple" type="button">ADD ↵</button>
          </div>
          <textarea id="appraisalPaste" class="appraisal-paste" rows="10" maxlength="100000" placeholder="Paste a full EVE list here, or use TYPE ITEM / QTY above…&#10;10 Hulk&#10;Tritanium 1000000&#10;Compressed Arkonor&#9;27512&#10;&#10;Ctrl+Enter = Appraise pasted list"></textarea>
          <div class="appraisal-actions">
            <button id="appraisalPasteClipboard" class="orb silver" type="button">PASTE CLIPBOARD</button>
            <button id="appraisalCalculate" class="orb purple" type="button">APPRAISE</button>
            <button id="appraisalShare" class="orb silver" type="button" disabled>CREATE SHARE LINK</button>
          </div>
          <div id="appraisalStatus" class="appraisal-status">Ready. Buy = current buy-side value, Sell = sell-side value, Split = midpoint.</div>
          <div id="appraisalSummary" class="appraisal-summary"></div>
          <section class="appraisal-results">
            <div class="brain-card-head"><strong>APPRAISAL ITEMS</strong><small>Market values shown per item and for the full pasted quantity</small></div>
            <div id="appraisalItems" class="appraisal-list"><div class="visual-empty">Paste an EVE item list and click APPRAISE.</div></div>
          </section>
          <section id="appraisalRefineSection" class="appraisal-refine">
            <div class="appraisal-refine-head">
              <div><span class="eyebrow">JLR REPROCESS // ORE</span><strong>REFINE ESTIMATE</strong><small>Compare raw ore buy value with the minerals after reprocessing.</small></div>
              <label class="appraisal-refine-rate"><span>ORE EFFICIENCY</span><div><input id="appraisalRefineRate" type="number" min="0" max="100" step="0.01" value="90.63" inputmode="decimal"><b>%</b></div></label>
            </div>
            <div id="appraisalRefineSummary" class="appraisal-refine-summary"><div class="visual-empty">Run an appraisal to calculate ore refine value.</div></div>
            <div id="appraisalRefineBreakdown" class="appraisal-refine-breakdown"></div>
          </section>
        </section>
      </section>`;

    $('appraisalCalculate')?.addEventListener('click',()=>void calculateAppraisal());
    $('appraisalQuickAdd')?.addEventListener('click',()=>addAppraisalQuickEntry());
    $('appraisalQuickEntry')?.addEventListener('keydown',event=>{
      if(event.key!=='Enter'||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
      event.preventDefault();
      addAppraisalQuickEntry();
    });
    $('appraisalPaste')?.addEventListener('keydown',event=>{
      if(event.key!=='Enter'||!(event.ctrlKey||event.metaKey)||event.shiftKey||event.altKey||event.isComposing)return;
      event.preventDefault();
      void calculateAppraisal();
    });
    $('appraisalShare')?.addEventListener('click',()=>void shareAppraisal());
    $('appraisalPanel')?.addEventListener('click',event=>{
      const target=event.target instanceof Element?event.target.closest('[data-appraisal-copy]'):null;
      if(target)void copyAppraisalValue(target);
    });
    $('appraisalPanel')?.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      const target=event.target instanceof Element?event.target.closest('[data-appraisal-copy]'):null;
      if(!target)return;
      event.preventDefault();
      void copyAppraisalValue(target);
    });
    $('appraisalRefineRate')?.addEventListener('input',()=>{
      appraisalRefineRateTouched=true;
      syncAppraisalSelectedRefineValue();
      renderAppraisal();
    });
    $('appraisalPasteClipboard')?.addEventListener('click',async()=>{
      try{
        const text=await navigator.clipboard.readText();
        if(!text.trim())throw new Error('Clipboard is empty');
        $('appraisalPaste').value=text;
        toast('Clipboard pasted into JLR Appraisal.');
      }catch(error){toast(String(error.message||'Clipboard unavailable'))}
    });
    for(const id of ['appraisalMarket','appraisalPricing','appraisalVariant']){
      $(id)?.addEventListener('change',()=>{
        if(!appraisalData)return;
        $('appraisalStatus').textContent='Refreshing appraisal settings…';
        void calculateAppraisal();
      });
    }
    const quick=document.querySelector('.quick-update');
    let assistant=document.querySelector('.tracker-assistant-panel');
    if(!assistant)assistant=document.createElement('section');
    assistant.className='glass tracker-assistant-panel';
    assistant.innerHTML=`
      <div class="tracker-brain-head">
        <div class="tracker-brain-title">
          <span class="eyebrow">JLR ADAM // CONTEXT ASSISTANT</span>
          <div class="tracker-brain-title-row">
            <strong>ADAM OPERATIONS</strong>
            <span id="trackerBrainStatus" class="status-pill">● CONTEXT READY</span>
          </div>
        </div>
        <div class="tracker-assist-actions">
          <button id="scoutCheckNow" class="orb purple" type="button">↻ CHECK LOCATIONS</button>
        </div>
      </div>
      <div class="adam-context-strip">
        <span>WORKING CONTEXT</span>
        <strong id="adamContextLabel">JLR</strong>
        <small>Adam uses the tab, selected system/toon, recent scan workflow, fleet review state, and prior answers.</small>
      </div>
      <div class="tracker-brain-grid scout-ops-grid">
        <section class="brain-card adam-query-card">
          <div class="brain-card-head"><strong>ADAM</strong><small>Ask naturally — Adam already has the working context</small></div>
          <div class="adam-conversation">
            <div id="adamUserMessage" class="adam-message adam-message-user hidden"><span>YOU</span><p id="adamUserText"></p></div>
            <div class="adam-message adam-message-adam"><span>ADAM</span><p id="adamReply">I’m here. Ask me about what you’re looking at, what changed, or where to go next.</p></div>
          </div>
          <div class="adam-question-row">
            <textarea id="adamQuestion" rows="2" maxlength="100000" placeholder="Ask Adam or paste Probe Scanner rows…"></textarea>
            <button id="adamAsk" class="adam-send" type="button" aria-label="Send question to Adam">SEND ↵</button>
          </div>
        </section>

        <section class="brain-card scout-watch-card">
          <div class="brain-card-head"><strong>TRAVEL WATCH</strong><small>Location-aware scan workflow</small></div>
          <div class="brain-setting-grid scout-setting-grid">
            <label class="brain-setting"><span>TRAVEL TOON</span><select id="scoutCharacterSelect"><option value="">SELECT TOON</option></select></label>
            <label class="brain-setting"><span>AUTO FOLLOW TOONS</span><select id="brainFollowEnabled"><option value="on">ON</option><option value="off">OFF</option></select></label>
          </div>
          <div id="brainScanPrompt" class="brain-scan-prompt hidden" role="status"><span id="brainScanPromptText"></span><button id="brainScanOpen" class="board-tool" type="button">OPEN SCANNER</button></div>
          <div id="adamNearestMining" class="adam-nearest-mining"><div class="adam-nearest-copy"><span>NEAREST SCAN</span><strong>CHECKING…</strong><small>Calculating from the current Adam travel-toon location.</small></div></div>
          <div class="brain-follow-head"><strong>CLOSEST SCAN UPDATES</strong><small id="scoutTargetSummary">Select a toon to calculate routes.</small></div>
          <div id="scoutTargetList" class="scout-target-list"><div class="visual-empty">Waiting for location…</div></div>
          <div class="brain-follow-head scout-linked-head"><strong>LINKED TOONS</strong><small id="brainFollowStatus">Checking location access…</small></div>
          <div id="brainFollowList" class="brain-follow-list"></div>
        </section>

        <section class="brain-card">
          <div class="brain-card-head"><strong>LOCATION TRACKING</strong><small>Automatic movement source</small></div>
          <div class="brain-follow-head"><strong id="brainCompanionStatus">CHECKING…</strong><small id="brainCompanionDetail">Checking location tracking.</small></div>
          <div class="brain-companion-feed">
            <span>TOON FEED</span>
            <div class="brain-companion-feed-window"><div id="brainCompanionFeedTrack" class="brain-companion-feed-track">WAITING FOR LOCATION FEED…</div></div>
          </div>
          <details class="brain-advanced-tools">
            <summary>COMPANION SETUP</summary>
            <div class="brain-advanced-tools-body">
              <div class="brain-companion-code">
                <div><span>PAIR CODE</span><strong id="brainCompanionCode">—</strong><small id="brainCompanionExpiry"></small></div>
                <button id="brainCompanionCopy" class="board-tool" type="button">COPY CODE</button>
              </div>
              <div class="tracker-assist-actions">
                <button id="brainCompanionPair" class="orb purple" type="button">CREATE PAIR CODE</button>
                <button id="brainCompanionRefresh" class="board-tool" type="button">REFRESH</button>
                <button id="brainCompanionRevoke" class="board-tool subtle" type="button">REVOKE DEVICES</button>
                <a class="board-tool" href="/downloads/INSTALL-JLR-TRACKER-COMPANION.cmd" download>DOWNLOAD WINDOWS COMPANION</a>
              </div>
            </div>
          </details>
        </section>

        <section class="brain-card scout-decisions-card">
          <div class="brain-card-head"><strong>ADAM RECOMMENDATIONS</strong><small>Current JLR items that may need attention</small></div>
          <div id="brainDecisionList" class="brain-decision-list"></div>
        </section>
      </div>`;
    feedback.innerHTML=`
      <section class="feedback-shell">
        <header class="glass feedback-hero">
          <div>
            <span class="eyebrow">JLR DEVELOPMENT // USER INPUT</span>
            <h2>FEEDBACK HUB</h2>
            <p>Tell us what happened or what you want changed. JLR automatically attaches safe app context so you do not have to explain the technical details.</p>
          </div>
          <div class="feedback-hero-note">
            <strong>WHAT HELPS MOST</strong>
            <span>What happened • what you expected • anything that would help us reproduce it</span>
          </div>
        </header>

        <a class="jlr-donate-banner jlr-donate-banner-feedback" href="https://www.paypal.com/ncp/payment/J7UYHR2RJFS6N" target="_blank" rel="noopener noreferrer" aria-label="Donate to help keep JLR online and mining">
          <span class="jlr-donate-orb" aria-hidden="true"></span>
          <span class="jlr-donate-brand"><strong>JLR</strong><small>SERVER</small></span>
          <span class="jlr-donate-divider" aria-hidden="true"></span>
          <span class="jlr-donate-main"><strong>DONATE</strong><small>HELP KEEP JLR ONLINE AND MINING</small></span>
          <span class="jlr-donate-arrow" aria-hidden="true">›</span>
        </a>

        <div class="feedback-layout">
          <section class="glass feedback-compose">
            <div class="feedback-section-head"><div><strong>NEW SUBMISSION</strong><small>Choose the closest category</small></div><span id="feedbackDraftSource" class="status-pill">FROM FIELDS</span></div>

            <div class="feedback-type-grid" role="group" aria-label="Feedback type">
              <button class="feedback-type active" data-feedback-type="bug" type="button"><b>BUG</b><span>Something is broken</span></button>
              <button class="feedback-type" data-feedback-type="suggestion" type="button"><b>FEATURE IDEA</b><span>Something JLR should add</span></button>
              <button class="feedback-type" data-feedback-type="data" type="button"><b>DATA ISSUE</b><span>Wrong, stale, or missing values</span></button>
              <button class="feedback-type" data-feedback-type="ui" type="button"><b>UI / UX</b><span>Layout, readability, or controls</span></button>
              <button class="feedback-type" data-feedback-type="other" type="button"><b>OTHER</b><span>Anything else</span></button>
            </div>

            <label class="feedback-field feedback-main-message"><span>WHAT HAPPENED / WHAT SHOULD CHANGE?</span><textarea id="feedbackMessage" maxlength="2000" placeholder="Describe the problem or idea in your own words."></textarea></label>

            <div class="feedback-context-note">
              <strong>CONTEXT ATTACHED AUTOMATICALLY</strong>
              <span>JLR version, source tab, selected system, display mode, EVE-data health, ledger coverage, and browser details. Passwords and EVE tokens are never included.</span>
            </div>

            <details class="feedback-more-details">
              <summary>ADD OPTIONAL DETAILS</summary>
              <div class="feedback-more-details-body">
                <label class="feedback-field"><span>SHORT TITLE <small>optional — JLR creates one if blank</small></span><input id="feedbackTitle" maxlength="120" placeholder="Short description"></label>
                <div class="feedback-meta-grid">
                  <label><span>AREA</span><select id="feedbackArea">
                    <option value="general">GENERAL</option>
                    <option value="fields">FIELDS</option>
                    <option value="brain">ADAM</option>
                    <option value="fleet">FLEET & FITS</option>
                    <option value="performance">FLEET PERFORMANCE</option>
                    <option value="ice">ICE</option>
                    <option value="gas">GAS</option>
                    <option value="doctrine">DOCTRINE MARKET</option>
                    <option value="pvp">INIT PVP</option>
                    <option value="tracker">TRACKER</option>
                    <option value="threat">THREAT SCAN</option>
                    <option value="mer">MER INTEL</option>
                    <option value="toons">TOONS</option>
                  </select></label>
                  <label><span>IMPACT</span><select id="feedbackImpact">
                    <option value="normal">NORMAL</option>
                    <option value="low">LOW / MINOR</option>
                    <option value="high">HIGH / IMPORTANT</option>
                    <option value="critical">BLOCKING / CRITICAL</option>
                  </select></label>
                </div>
                <div class="feedback-detail-grid">
                  <label class="feedback-field"><span>STEPS TO REPRODUCE <small>optional</small></span><textarea id="feedbackSteps" maxlength="1500" placeholder="What did you do before it happened?"></textarea></label>
                  <label class="feedback-field"><span>EXPECTED RESULT <small>optional</small></span><textarea id="feedbackExpected" maxlength="1000" placeholder="What should have happened instead?"></textarea></label>
                </div>
              </div>
            </details>

            <div class="feedback-submit-row">
              <button id="feedbackSubmit" class="orb green" type="button">SUBMIT TO JLR</button>
              <span id="feedbackSubmitHint">Your submission is stored with JLR for review.</span>
            </div>
          </section>

          <aside class="feedback-side">
            <section class="glass feedback-guide">
              <div class="feedback-section-head"><div><strong>QUICK GUIDE</strong><small>Pick the category that gets us closest</small></div></div>
              <div class="feedback-guide-list">
                <div><b>BUG</b><span>Something worked differently than intended.</span></div>
                <div><b>FEATURE IDEA</b><span>A new tool, metric, alert, or workflow.</span></div>
                <div><b>DATA ISSUE</b><span>Values do not match EVE, zKill, market data, or another source.</span></div>
                <div><b>UI / UX</b><span>Hard to read, clipped, confusing, or too many clicks.</span></div>
              </div>
            </section>
            <section class="glass feedback-recent-card">
              <div class="feedback-section-head"><div><strong id="feedbackRecentTitle">MY RECENT SUBMISSIONS</strong><small id="feedbackRecentSubtitle">Newest first</small></div><button id="feedbackRefresh" class="board-tool subtle" type="button">REFRESH</button></div>
              <div id="feedbackRecent" class="feedback-recent"><div class="visual-empty">No submissions loaded yet.</div></div>
            </section>
          </aside>
        </div>
      </section>`;

    const calculator=document.querySelector('.shared-calculator');
    const timers=document.querySelector('.timers-panel');
    const board=document.querySelector('.board-panel');
    const hits=document.querySelector('.hit-panel');
    brain.appendChild(assistant);
    setTimeout(()=>startCompanionStatusWatch(),0);
    const fieldSidebar=document.createElement('div');
    fieldSidebar.className='field-sidebar';
    [quick,timers].filter(Boolean).forEach(el=>fieldSidebar.appendChild(el));
    if(fieldSidebar.children.length)fields.appendChild(fieldSidebar);
    [board,hits].filter(Boolean).forEach(el=>fields.appendChild(el));

    const advanced=document.createElement('div');
    advanced.className='tab-advanced expanded-grid';
    const ranking=document.querySelector('.ranking-panel');
    if(ranking)advanced.appendChild(ranking);
    if(advanced.children.length)fields.appendChild(advanced);

    const setup=document.querySelector('.setup-drawer');
    [setup,calculator].filter(Boolean).forEach(el=>fleet.appendChild(el));

    const command=document.querySelector('.fleet-command-panel');
    const visuals=document.querySelector('.mining-visuals-panel');
    const actual=document.querySelector('.actual-panel');
    [command,visuals,actual].filter(Boolean).forEach(el=>performance.appendChild(el));

    const icePanel=document.querySelector('.ice-mining-panel');
    if(icePanel)ice.appendChild(icePanel);
    const gasPanel=document.querySelector('.gas-huffing-panel');
    if(gasPanel)gas.appendChild(gasPanel);

    const toonPanel=document.querySelector('.esi-panel');
    if(toonPanel)toons.appendChild(toonPanel);

    document.querySelector('.compact-row')?.remove();
    $('expandedArea')?.remove();

    initNavDropdowns();
    document.querySelectorAll('.app-tab').forEach(button=>button.addEventListener('click',()=>applyTab(button.dataset.tab)));
    applyTab(activeTab);
  }

  function doctrineScrollSnapshot(host=$('doctrineMarketPanel')){
    if(!host)return null;
    const table=host.querySelector('.doctrine-table-wrap');
    const shopping=host.querySelector('.doctrine-shopping-list');
    return{
      tableTop:Math.max(0,Number(table?.scrollTop)||0),
      tableLeft:Math.max(0,Number(table?.scrollLeft)||0),
      shoppingTop:Math.max(0,Number(shopping?.scrollTop)||0),
      pageX:Math.max(0,Number(window.scrollX)||0),
      pageY:Math.max(0,Number(window.scrollY)||0),
    };
  }
  function restoreDoctrineScroll(snapshot,host=$('doctrineMarketPanel')){
    if(!snapshot||!host)return;
    const table=host.querySelector('.doctrine-table-wrap');
    if(table){
      table.scrollTop=snapshot.tableTop;
      table.scrollLeft=snapshot.tableLeft;
    }
    const shopping=host.querySelector('.doctrine-shopping-list');
    if(shopping)shopping.scrollTop=snapshot.shoppingTop;
    if(activeTab==='doctrine'){
      requestAnimationFrame(()=>{
        if(activeTab==='doctrine')window.scrollTo(snapshot.pageX,snapshot.pageY);
      });
    }
  }

  async function loadDoctrineMarket(force=false){
    if(!doctrineAllowed()){
      doctrineMarket=null;
      doctrineMarketError='Doctrine Market requires a linked INIT or INIT-blue character.';
      renderDoctrineMarket();
      return;
    }
    if(doctrineMarketLoading)return;
    const preserveScroll=Boolean(doctrineMarket);
    doctrineMarketLoading=true;doctrineMarketError='';
    if(doctrineMarketPoll){clearTimeout(doctrineMarketPoll);doctrineMarketPoll=null}
    if(!preserveScroll){
      renderDoctrineMarket();
    }else{
      const refreshButton=$('doctrineRefresh');
      if(refreshButton){
        refreshButton.disabled=true;
        refreshButton.textContent='REFRESHING…';
      }
    }
    let shouldPoll=false;
    try{
      const payload=force
        ?await api('/api/doctrine-market/refresh',{method:'POST',body:'{}'})
        :await api('/api/doctrine-market');
      doctrineMarket=payload;
      shouldPoll=Boolean(payload?.status?.refreshing);
    }catch(error){
      console.error('Doctrine Market load failed',error);
      doctrineMarketError='Doctrine market data is temporarily unavailable. Try again in a moment.';
    }finally{
      doctrineMarketLoading=false;
      renderDoctrineMarket({preserveScroll});
      if(shouldPoll&&activeTab==='doctrine'){
        doctrineMarketPoll=setTimeout(()=>loadDoctrineMarket(false),5000);
      }
    }
  }
  function doctrinePercent(value){
    const n=Number(value);
    return Number.isFinite(n)?(n*100).toFixed(Math.abs(n)>=1?0:1)+'%':'—';
  }
  function doctrineMoney(value){
    const n=Number(value);
    return Number.isFinite(n)&&n!==0?fmt(n)+' ISK':'—';
  }
  function doctrineState(row){
    if(row.stock<=0)return{key:'zero',label:'ZERO STOCK'};
    if(row.daysDynamic<2)return{key:'critical',label:'< 2 DAYS'};
    if(row.daysDynamic<7)return{key:'low',label:'LOW'};
    if(row.required>0)return{key:'restock',label:'RESTOCK'};
    return{key:'healthy',label:'OK'};
  }
  function saveDoctrineShoppingList(){
    localStorage.setItem('jlrDoctrineShoppingList',JSON.stringify(doctrineShoppingList));
  }
  function doctrineSevenDayTarget(row){
    return Math.max(1,Math.ceil(Math.max(.01,Number(row?.sold7)||.01)*7));
  }
  function doctrineShoppingQty(row,mode=doctrineShoppingMode){
    const target=doctrineSevenDayTarget(row);
    if(mode==='shortfall')return Math.max(0,target-Math.max(0,Math.floor(Number(row?.stock)||0)));
    return target;
  }
  function recalculateDoctrineShoppingList(){
    const byId=new Map((doctrineMarket?.rows||[]).map(row=>[Number(row.typeId),row]));
    let removed=0,updated=0;
    doctrineShoppingList=doctrineShoppingList.map(item=>{
      const row=byId.get(Number(item.typeId));
      if(!row)return null;
      const qty=doctrineShoppingQty(row);
      if(qty<=0){removed++;return null}
      if(Number(item.qty)!==qty)updated++;
      return{typeId:Number(item.typeId),qty};
    }).filter(Boolean);
    saveDoctrineShoppingList();
    renderDoctrineMarket({preserveScroll:true});
    const mode=doctrineShoppingMode==='shortfall'?'7-day shortfall':'full 7-day supply';
    toast('Shopping list recalculated for '+mode+'.'+(removed?' '+removed+' covered item'+(removed===1?'':'s')+' removed.':''));
  }
  function addDoctrineShoppingItem(typeId){
    const id=Number(typeId);
    const row=(doctrineMarket?.rows||[]).find(item=>Number(item.typeId)===id);
    if(!row)return;
    const existing=doctrineShoppingList.find(item=>Number(item.typeId)===id);
    if(existing){
      toast(row.item+' is already on the shopping list.');
      return;
    }
    const qty=doctrineShoppingQty(row);
    if(qty<=0){
      toast(row.item+' already has at least 7 days of stock in C-N.');
      return;
    }
    doctrineShoppingList.push({typeId:id,qty});
    saveDoctrineShoppingList();
    renderDoctrineMarket({preserveScroll:true});
    toast(row.item+' added at '+(doctrineShoppingMode==='shortfall'?'the 7-day shortfall':'a full 7-day supply')+'.');
  }
  function removeDoctrineShoppingItem(typeId){
    const id=Number(typeId);
    doctrineShoppingList=doctrineShoppingList.filter(item=>Number(item.typeId)!==id);
    saveDoctrineShoppingList();
    renderDoctrineMarket({preserveScroll:true});
  }
  async function copyDoctrineMultibuy(){
    const byId=new Map((doctrineMarket?.rows||[]).map(row=>[Number(row.typeId),row]));
    const lines=doctrineShoppingList.map(item=>{
      const row=byId.get(Number(item.typeId));
      if(!row)return null;
      return row.item+'\t'+Math.max(1,Math.floor(Number(item.qty)||1));
    }).filter(Boolean);
    if(!lines.length){toast('Add items to the shopping list first.');return}
    const text=lines.join('\n');
    let copied=false;
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(text);
        copied=true;
      }
    }catch{}
    if(!copied){
      try{
        const helper=document.createElement('textarea');
        helper.value=text;
        helper.setAttribute('readonly','');
        helper.setAttribute('aria-hidden','true');
        helper.style.position='fixed';
        helper.style.left='-9999px';
        helper.style.opacity='0';
        document.body.appendChild(helper);
        helper.focus();
        helper.select();
        copied=document.execCommand('copy');
        helper.remove();
      }catch{}
    }
    toast(copied?'Shopping list copied. Paste it into EVE Multi-Buy.':'Could not copy automatically.');
  }
  function renderDoctrineMarket({preserveScroll=false}={}){
    const host=$('doctrineMarketPanel');
    if(!host)return;
    const scrollSnapshot=preserveScroll?doctrineScrollSnapshot(host):null;
    if(doctrineMarketLoading&&!doctrineMarket){
      host.innerHTML='<section class="glass doctrine-loading"><strong>LOADING DOCTRINE MARKET…</strong><span>Loading current doctrine market data.</span></section>';
      return;
    }
    if(doctrineMarketError){
      host.innerHTML='<section class="glass doctrine-error"><strong>DOCTRINE MARKET UNAVAILABLE</strong><span>'+esc(doctrineMarketError)+'</span><button id="doctrineRetry" class="orb blue" type="button">TRY AGAIN</button></section>';
      $('doctrineRetry')?.addEventListener('click',()=>loadDoctrineMarket(true));
      return;
    }
    if(!doctrineMarket){
      host.innerHTML='<section class="glass doctrine-loading">Open this tab to load doctrine market data.</section>';
      return;
    }

    const summary=doctrineMarket.summary||{};
    const allRows=doctrineMarket.rows||[];
    const classes=[...new Set(allRows.map(x=>x.classification).filter(Boolean))].sort();
    const categories=[...new Set(allRows.map(x=>x.category).filter(Boolean))].sort();
    const q=doctrineSearch.trim().toLowerCase();

    let rows=allRows.filter(row=>{
      if(doctrineClass!=='all'&&row.classification!==doctrineClass)return false;
      if(doctrineCategory!=='all'&&row.category!==doctrineCategory)return false;
      if(q&&!row.item.toLowerCase().includes(q)&&!String(row.typeId).includes(q))return false;
      if(doctrineView==='restock')return row.required>0;
      if(doctrineView==='seed')return row.seedMargin>0&&row.cnSell>0&&row.jitaSell>0;
      if(doctrineView==='alerts')return row.cnJita>1.3;
      return true;
    });

    if(doctrineView==='restock'){
      rows.sort((a,b)=>
        Number(b.stock<=0)-Number(a.stock<=0)||
        a.daysDynamic-b.daysDynamic||
        b.required-a.required||
        a.item.localeCompare(b.item)
      );
    }else if(doctrineView==='seed'){
      rows.sort((a,b)=>b.seedMargin-a.seedMargin||b.seed10Profit-a.seed10Profit||a.item.localeCompare(b.item));
    }else if(doctrineView==='alerts'){
      rows.sort((a,b)=>b.cnJita-a.cnJita||a.daysDynamic-b.daysDynamic||a.item.localeCompare(b.item));
    }else{
      rows.sort((a,b)=>a.item.localeCompare(b.item));
    }

    const display=rows.slice(0,200);
    const tableRows=display.map(row=>{
      const state=doctrineState(row);
      const ratio=row.cnJita>0?row.cnJita.toFixed(2)+'x':'—';
      const required=row.required>0?fmt(row.required):'—';
      return '<tr class="doctrine-row doctrine-'+state.key+'" draggable="true" data-doctrine-type-id="'+esc(String(row.typeId))+'" title="Drag to Shopping List">'+
        '<td><span class="doctrine-state '+state.key+'">'+esc(state.label)+'</span></td>'+
        '<td class="doctrine-item"><div class="doctrine-item-main"><div><strong>'+esc(row.item)+'</strong><small>'+esc(row.classification)+' • '+esc(row.category)+' • ID '+esc(String(row.typeId))+'</small></div><button class="doctrine-list-add" type="button" data-add-doctrine="'+esc(String(row.typeId))+'" title="Add 7-day supply to Shopping List">ADD</button></div></td>'+
        '<td><strong>'+fmt(row.stock)+'</strong></td>'+
        '<td>'+row.sold7.toFixed(1)+'</td>'+
        '<td>'+row.sold30.toFixed(1)+'</td>'+
        '<td><strong>'+row.daysDynamic.toFixed(1)+'</strong><small>std '+row.daysStandard.toFixed(1)+'</small></td>'+
        '<td><strong class="'+(row.required>0?'negative':'')+'">'+required+'</strong></td>'+
        '<td>'+doctrineMoney(row.cnSell)+'</td>'+
        '<td>'+doctrineMoney(row.jitaSell)+'</td>'+
        '<td><strong class="'+(row.cnJita>1.3?'negative':row.cnJita>0&&row.cnJita<1?'positive':'')+'">'+ratio+'</strong></td>'+
        '<td><strong class="'+(row.seedMargin>0?'positive':'negative')+'">'+doctrinePercent(row.seedMargin)+'</strong><small>'+doctrineMoney(row.breakeven)+'</small></td>'+
      '</tr>';
    }).join('');

    const marketById=new Map(allRows.map(row=>[Number(row.typeId),row]));
    const shoppingRows=doctrineShoppingList.map(item=>{
      const row=marketById.get(Number(item.typeId));
      return row?{...item,row}:null;
    }).filter(Boolean);
    const shoppingJitaTotal=shoppingRows.reduce((sum,item)=>sum+Math.max(1,Number(item.qty)||1)*Math.max(0,Number(item.row.jitaSell)||0),0);
    const shoppingHtml=shoppingRows.map(item=>{
      const target=doctrineSevenDayTarget(item.row);
      const shortfall=doctrineShoppingQty(item.row,'shortfall');
      return '<div class="doctrine-shop-row" draggable="true" data-shop-type-id="'+esc(String(item.typeId))+'">'+
        '<div class="doctrine-shop-name"><strong>'+esc(item.row.item)+'</strong><small>7D target '+fmt(target)+' • shortfall '+fmt(shortfall)+' • '+item.row.sold7.toFixed(1)+'/day</small></div>'+
        '<label class="doctrine-shop-qty"><span>QTY</span><input type="number" min="1" step="1" value="'+Math.max(1,Math.floor(Number(item.qty)||1))+'" data-shop-qty="'+esc(String(item.typeId))+'" aria-label="Quantity for '+esc(item.row.item)+'"></label>'+
        '<button class="doctrine-shop-remove" type="button" data-remove-doctrine="'+esc(String(item.typeId))+'" aria-label="Remove '+esc(item.row.item)+'">REMOVE</button>'+
      '</div>';
    }).join('');
    const status=doctrineMarket.status||{};
    const refreshing=Boolean(status.refreshing||doctrineMarketLoading);
    host.innerHTML=`
      <section class="glass doctrine-shell">
        <div class="doctrine-hero">
          <div>
            <span class="eyebrow">INITIATIVE • DOCTRINE MARKET</span>
            <strong>DOCTRINE MARKET INTEL</strong>
            <small>C-N stock • Fountain demand • Jita pricing</small>
          </div>
          <button id="doctrineRefresh" class="board-tool" type="button" ${refreshing?'disabled':''}>${refreshing?'REFRESHING…':'REFRESH LIVE'}</button>
        </div>

        <div class="doctrine-kpis">
          <article><span>TRACKED ITEMS</span><strong>${fmt(summary.count||allRows.length)}</strong><small>full doctrine-market list</small></article>
          <article><span>RESTOCK NEEDED</span><strong>${fmt(summary.need)}</strong><small>required quantity above zero</small></article>
          <article class="critical"><span>UNDER 2 DAYS</span><strong>${fmt(summary.under2)}</strong><small>dynamic days of supply</small></article>
          <article class="critical"><span>ZERO STOCK</span><strong>${fmt(summary.zero)}</strong><small>currently unavailable</small></article>
          <article><span>PRICE ALERTS</span><strong>${fmt(summary.alerts)}</strong><small>C-N above 130% of Jita</small></article>
          <article><span>SEED TO 30D</span><strong>${fmt(summary.seed30)} ISK</strong><small>tracker estimate</small></article>
        </div>

        <div class="doctrine-command">
          <div class="doctrine-modes" role="group" aria-label="Doctrine market view">
            <button class="doctrine-mode ${doctrineView==='restock'?'active':''}" data-doctrine-view="restock" type="button">PRIORITY RESTOCK</button>
            <button class="doctrine-mode ${doctrineView==='seed'?'active':''}" data-doctrine-view="seed" type="button">SEEDING OPPORTUNITIES</button>
            <button class="doctrine-mode ${doctrineView==='alerts'?'active':''}" data-doctrine-view="alerts" type="button">PRICE ALERTS</button>
            <button class="doctrine-mode ${doctrineView==='all'?'active':''}" data-doctrine-view="all" type="button">ALL ITEMS</button>
          </div>
          <div class="doctrine-filters">
            <label><span>SEARCH</span><input id="doctrineSearch" type="search" autocomplete="off" placeholder="Item or type ID…" value="${esc(doctrineSearch)}"></label>
            <label><span>CLASS</span><select id="doctrineClass"><option value="all">ALL</option>${classes.map(x=>'<option value="'+esc(x)+'" '+(doctrineClass===x?'selected':'')+'>'+esc(x.toUpperCase())+'</option>').join('')}</select></label>
            <label><span>TYPE</span><select id="doctrineCategory"><option value="all">ALL</option>${categories.map(x=>'<option value="'+esc(x)+'" '+(doctrineCategory===x?'selected':'')+'>'+esc(x.toUpperCase())+'</option>').join('')}</select></label>
          </div>
        </div>

        <div class="doctrine-summary-line">
          <strong>${fmt(rows.length)} MATCHING ITEMS</strong>
          <span>Showing ${fmt(display.length)}${rows.length>display.length?' of '+fmt(rows.length):''}</span>
        </div>

        <div class="doctrine-workspace">
          <div class="doctrine-table-wrap">
            <table class="doctrine-table">
              <thead><tr><th>STATE</th><th>ITEM</th><th>STOCK</th><th>7D/DAY</th><th>30D/DAY</th><th>DAYS</th><th>REQUIRED</th><th>C-N SELL</th><th>JITA SELL</th><th>C-N/JITA</th><th>SEED MARGIN</th></tr></thead>
              <tbody>${tableRows||'<tr><td colspan="11" class="doctrine-empty">No items match these filters.</td></tr>'}</tbody>
            </table>
          </div>

          <div class="doctrine-side-column">
          <aside id="doctrineShoppingDrop" class="doctrine-shopping ${doctrineShoppingOpen?'open':'collapsed'}">
            <button id="doctrineShoppingToggle" class="doctrine-shopping-toggle" type="button" aria-expanded="${String(doctrineShoppingOpen)}">
              <div class="doctrine-shopping-toggle-title">
                <span>SHOPPING LIST</span>
                <strong>${fmt(shoppingRows.length)} ITEM${shoppingRows.length===1?'':'S'}</strong>
              </div>
              <div class="doctrine-shopping-toggle-summary">
                <span>${shoppingJitaTotal?fmt(shoppingJitaTotal)+' ISK':'EMPTY'}</span>
                <strong class="doctrine-shopping-chevron">${doctrineShoppingOpen?'▲':'▼'}</strong>
              </div>
            </button>
            <div class="doctrine-shopping-body" ${doctrineShoppingOpen?'':'hidden'}>
              <div class="doctrine-shopping-head">
                <span>${doctrineShoppingMode==='shortfall'?'7D SHORTFALL MODE':'FULL 7D SUPPLY MODE'}</span>
                <button id="doctrineShoppingClear" class="doctrine-shop-clear" type="button" ${shoppingRows.length?'':'disabled'}>CLEAR</button>
              </div>
              <div class="doctrine-shopping-mode">
                <div class="doctrine-shopping-mode-buttons" role="group" aria-label="Shopping list quantity mode">
                  <button class="${doctrineShoppingMode==='full'?'active':''}" data-shop-mode="full" type="button">FULL 7D SUPPLY</button>
                  <button class="${doctrineShoppingMode==='shortfall'?'active':''}" data-shop-mode="shortfall" type="button">7D SHORTFALL</button>
                </div>
                <button id="doctrineShoppingRecalc" class="doctrine-shopping-recalc" type="button" ${shoppingRows.length?'':'disabled'}>APPLY TO LIST</button>
              </div>
              <div class="doctrine-shopping-hint">${doctrineShoppingMode==='shortfall'?'New items buy only what C-N needs to reach seven days of stock.':'New items use a full seven days of demand.'}</div>
              <div class="doctrine-shopping-list">
                ${shoppingHtml||'<div class="doctrine-shopping-empty"><strong>DROP ITEMS HERE</strong><span>Or use ADD beside any doctrine item.</span></div>'}
              </div>
              <div class="doctrine-shopping-total">
                <span>EST. JITA TOTAL</span>
                <strong>${shoppingJitaTotal?fmt(shoppingJitaTotal)+' ISK':'—'}</strong>
              </div>
              <button id="doctrineShoppingCopy" class="doctrine-multibuy-copy" type="button" ${shoppingRows.length?'':'disabled'}>COPY FOR EVE MULTIBUY</button>
            </div>
          </aside>
          <a class="doctrine-nyx-buyback" href="https://discord.com/channels/1275408985171820585/1465988346185515078" target="_blank" rel="noopener noreferrer" aria-label="Open the Nyx Buyback Discord channel">
            <img src="data:image/webp;base64,UklGRnglAABXRUJQVlA4IGwlAABw5wCdASoIAukAP1WSv1Wxqi6trtY9ajAqiWw65bY/itUmJvsdd7XTAxr8nz2+tHbb/P0wcbjtbQj+E/7vOr6lf7LvP+eZ09HooPS0x/mZf4/q3zP3EDhGpJvkPF/+W2MWokec5aMeUN2FyTGDgvemk4P7tw0Yq+Ps80hIasUpyqmozHt3/1RYRL88+1XUM6XjbnnFJYlgEX36Bi5o7xo+i+Cg6D1bBQofyMlqU8zjfkwE1PHwMi66TUvBa1fVGEqc9v8Nwbj72F8KJbFq1E683CN5Ni+Hdnh0SDR/yVa8HPeBS6df5pVfi9RCF5PXS8hnN0Eptr+c9Ux9QmS85f05n8IsTlChBEJpfeU+CMPhfyOXnwwbvGK2kNJmpJkvchhI8dBtv6/M4FALCTfsvlt+LSw7JU+h64ap/NUGKNmGRRTmszZZA2HCf+kvBDokh5HOfDLfGnPBChsCzvM+WoEHVS094canbgD1OINPSf0TxGY95RPcfiDxhbjMm3/4QdskEMICFHlXV+RL+OVxTNKokxrqFBfm5VDnir5G+O0My+mpmJCooNBfi8d2w2o3HjeOAp27qmo6kzLI9SNTvszhVyVfG7GhDxIYOufvfp0kiolqT71lnI5G5YrVoyfPAJxTHpotP9cst0Ma8SdQpWQHMsqqLGViqZRUuvDu2ewKEBwB3X1zW3Q62faPssdBcaDr4Pb35noOVID+KKhIrf+/9PFVIMgRpvWoqmM0Hu3XhqhPefc2rUbXu0/bbmdUMUOy1+KZqMB9HAgCm26C3MxsDqpb3nGF3eMm90hcP+Yej1PeDHmA49X2Vng7pUwOYQ/B88sOH17+ZxXSxnO6UcQqw3/n3cQcGM0cUrUBQ+8VZCFar7Vcapa1i3w2ZrF82/OwEI3ZqVD4p1gMlHmRonBzNwmP0HVa5GPhNVi/TwKawPvWPwBKIIAVCqUT/fn76DCwkaYjxKUW5WjLEwsi8T66C1hwZBYSz5BksXnFvaga/NVdTMVni7a26WoPhxjZapvyScSwEszTEABK7kAj0yl1J8vtM4Dwsf+KxHCOUdyyjmKbAaQl2AH7nvRIcsqfodY4wqJVZQaoRl3KMnkOhXXZA5oQHo08hCPeQrrP1uid2QCsLcxbgehRPlryUnU+Y+r9wuX+eNtDtOfFImNmVr/ghcJcCwuLdi55hkQT9r2pEZL5C/8CRbyVC7iOYWXRiyYceRr/S7buOSSxmnbOept+yI0RuQvCclx7NA0l5/Vb28rGK7mpknRtR1cVNycXz7ZTlW/smdpfikMIxQ/M5kqqOSS241PzFbsq4fISDFL2wbYJiLNmGuyHHsh4721j2gqtkbT43DYFxD4U/5PHEBAQfURR3KArld4wZBz9mJy8NVEVWzB2QTvF5FDOgyAMyLjPAM0S881YAC7MKiXzDC7U+VNz9aLnn1MX+A55OxxjKyeG3qdssBLmSz3GKgNH9ESYaOS2acwMlAnSLqN9X6JD7DvCs6qjKyDcLufcceXQD0c5mqRiR9nArmFGRjAcCkwUTrhopJ3AbBjD8dZnMKjGCNVRC361WMI4yS/enwS+EkZ4NmIONcrDmYlw+05rEHiwXHHu4+7aq8GmyMfTB2z5A6KSBQQD//AssnyaZS9mZfuRdT65dAAi6VmSPLniBdLqpMcw1ymp3n1nlFdFA/jV+yjncPi5Tvel+PaQte9Dbsoj+Vmqk1GNN2R1oI1Yeoe4TpZmJu0j3OHvLWHwc6LMZRLtm68kwyfGnQfv+W46JybWuDftUvAwKZP7s2eKC7bxDafVeURFyK14t4/68rryOu+ftPOjul9n4qzHhq+h8KuTMFTlIgwA3g0WkQ8dH19VnqriAGSST6aiYqOSktkCrpUylbp1INIJOBXlLMRdSfgp8SJWYcHpLO8B7As+/5x3lQmqNRgOUPdw/NiKkt/N7LlILQ9xORmiDh/Wl45V+OTmgQdcZHp3AjhCLvDdyVqo+OpVXHNsY1qQLI8GMq7YphKM1Zbt1mQruzIVydgj0ABr84NqJWj9gxehYdGDb5rwVlhM/t1/SZsfJ3zcxG9zv9J/tQhjj2/LCf1OGm0Gu743PrFgw/hHTC4hj2by0+FuioNCatVICrLEKGP3eLm5poLW98SC8B1ydl8OcHCL1NnRH9VG8ypqBkW0oLG8hc6mleXV17et7BnTHr4TiTUbBVCV+Yx7vzhCRvXV8HVuvmmef3eLbsaxM5Rt2kAQT+WJnZ0lzUO1QYDQ6jTTFymuGE4sO3/qdgswDQh7YE/4XirvBtDP3WOghAERgEA9wt/c/BhuTbszikbKVY5VtdAt3rQ5HkvDdzCPESIcr0Bkqyrl9Dkdvz1r2XlvUII0hwAuPIs+2BVFlmjYJcNrNA717rZBAZBYBxBJ+RNOM+6u2cdHzs6jDZVvvy8YRfakV+7Z4I3cLwS3NBulw9fla9EQHFJgQXdrJz1+Vt8/eNSVAwqFTMAA/vTzU/1PhKLXGgM9NlprL89rHGR+mD1D1y3t9KgQFwzKoyYYIJfTnGPS4gvZNannJ0fNZKtOPmPItVZZGuz7yUO59/SH95oOIjVvpp7S5moHuGdG9I+H/Cc8X3NdOKP3gm+GVF7nCZstfahwvTDLrR6FOc8qy3chPRlGmZcoYrc5AOcqE8vWKSvWsUM0YeEIVNFgJq7Ke+CZtKt3iKVDcf0GejdnADlEywBvJ3g0j0wjO+tG68c3R9tkfFUlWQjK8ofW4VO+fyB7TMtZhieUMpLxCXAhmFf2sG7JEGLj8eBtQ8x9OwgwBWGuRmXAoV1iXVeaktoRXpj6A0ltO2GmMj9gDYRfzy5esZzZ7QSTd30ZxVFxLbhOhHXncyO2FT7DwBQUTQswR+jiXutwWFDhHvhRjTGLb2/l3qyJjLL2eqVt+vUmBcRdAoQuJDjqwa4u3XcHO37QSphzLGHia2pIxsca4nf5OVodCWArQydlD2XWLyfgeR2t1GvjyB/RHrZOc5lS/0bROpWKmRm+w6j++hYXhvJYPWORgZIVXp0kvvGkR7DFtOnhghvR30qcHsIsutIo9c04Uk6KzIT8U36KWjO/OIjIeZVyNnwG0876edmWaerHbDR5QxsqWX2T3VZsWedyj2ZiwNHiMDyO39XhvM89ndHmhKtoz/iuVq5Rco382wl2Rs0ilhjTHtTLWwy4U+l4e9HXkiGNCZ4Q6XYsCzV7XYlpjneD0xjpAUGSgQdctOdXMyimlvZpbczdaIQ6l6ZeS3U14BQ/QNXHNbKehgGaoaUdpSzpSACF+MabxtxicXX1L1zBAQTllYWDWWWL1k6PHFEICxPICmqi6S+pn0dVA80jkk3lCa4wN6iltD9TWE0waXORClQG3huGwRxMCTHspKYGRhUCukW35LgFXgPaRYth3Qmjs0/lVQsuARthtsocKtXjCQXmfDetr+YancVFubrL2Ggy5yBP+HFmQiPX5Iyui+i7CnqdWkNtT6WTaEphw1SHJjIi6k8ePWW3GVSnyphP1AstMZEugBvbkQCCoTHpkoW8vmyMu6rgfBspC9FPqPvVMrpCgBRht8GwB4zGOqZ3R2ExjZD3lYXVRDy0j6fSCK7O5ooDNCF8ro+e1DXDUUTwz9GQstLBkzJ0/DV9Ag8hyNsnMFr7tH+33cvwBu/mL7UYpUwS8ylXPQB3gsMfgedLqwzycBbn9U1UCIJUKxR9ebIaV2SJsUkBZnuOMjbD/QBM8t2C83lxpqDlcqNNx5Y4QWnfoGP6Sk0jn4XzFbfaSj7VfV5YRp15Fo1EbCiYzVNf7/bD6avn/gxcGokkdDC2UHk8cIlbElGjxERD3EyOeVzfOvWBi6ojk6cfyGJYPhUsqJDupd8d/9MhWW3zqyP07iqn/9WVRxtV8HvXvp2HDGrIBTQfRSrdOwvaCLiR4aEmSAG4mB/oj33wdhqeiFUYp9LQwE1G2qPOi6PjnLZ1s8j3KhdohD4745WzKVed3R7bER4OOzb6+SV92S7XHZqzSDkrF4n3/+0sdG1VzOYIN/HpDic5KpTXhG0G/Wr1rWBIXoPybXXYBotVv/dNLqLeLmuLFbbf6ji1p0G4P5JNLE123tqcwUebxckSadvSP8pJnxeZgMjopesDDU2cB/ZQsizROy6l9w1b6FZAzkQSu+L49xaSHtdIS/32aLOfuMUemUwQ3HcisO4eBvlo4esTZ7FBV+XJfxoZ+1oZptHJ8O+pQFnmN5LL/BLwFkBzrjN6kBiAQ0tTYXPThy35dEfEC81tiWzOKV7cNqOfKNImKlIUpd6DH0gJ31+HFZ23fhrzz+tRZB3V7OgbHyelFIoqyOOYlcDeutvQb4TlBYx80ZOfbewyOtoO5hPHOEvS8JmW9/oI+kmYXWdt9EJunrYng12ikUbRADr2hyK1GQU+gKJEWV66Nle/st8aejezk8aRzxD7YWfwQ22cumh4Ihkt0D36MLtDuTk8yFOJCFaSWHUMvGVyj8YJSXEYt9f9fUK/KP5Z33ajrp1F4uDMY4J3gYUiShKdF/38s+h32hBAbJHbcmTxdq91bB8hgO/cjvEeW3f2jrJPtqlPizFbNBoEkIcE9bZb7udpi3RfYr83DVXJJ9v+dWto//41omTOBk9B2Sm2yJTjzh8t0FHT+EuUv7K3/AkQeOzZy+z8XqNbzP3XV0L+TRB6j9hKBG65ljkmxkjLJDX7XHF/m7GukVaZljxa6B8+1uvgtQvNO7j13UBCVEw8QNUV46g0N7fdH1Wk9kfgnwjkO8ryJOj32rHRUovAzHIFzZZPQolwNT2H1xtruHAyYZDW1+mC04hVpxvFYPrwI+9YcL8vb22zpobgD6mUNd2pHdFftD5Q1xI84xfUp+Vjau0t74eISllfmoHvyR0zHg2tfmt+GOMA7oyPnPTzARaR+U89EapAOUsjHBD4nMI2+jzyFO29SdQCTTmj7pmtgV4IpF8EoXTPn5yvzH9xStSKRCCanxy/q/kFcWn1iAw5tjDgL5Wb5RWgHRY3oN2F30Ivw1n3X7anbq8M0mkkoBKyo27n6YvkaxAeR6Bne0wIVD1wYrI+FEN7UyC3d1Hb4d/U7IRZiL3ejwVtHGQPIx1GrZMpVJQpRr6bNoRjqQVo+P7o0+buAz5pHvv34kd7/8sAZHrIQ3TUq0AAwn4fv7Mi9ItLwa2DwMfXKjG/udinkhcncb3FyS17mLxmQ6Ql3nyt9jcqhgHmn/56/ibrNeNE1GTczFQfROay9IK8n5llxW4unVPOBMtnsugvVsKclrjTKLeJtuDFT6QnNdcWDmBPaECpAWKkaEHMsYPu8aiFLcgUmpHxMH2baU8tz/aSdVZuxILgnKFxGGjQxI9c99zAaDQmMeRTm6AfnD8BILU0BaQ3Ra0fNU/PWIAgOU/yF/V4iP3K6gjktNG7wNhvnCJSt4noQCerLEJP4Llz7qWtjGY/CqEd4duDw2MOcBJdyUBe/cy9R5YKB2epr7lbzPadDfPkchue+7prkZFbTjaPOtZmoXqsyL7JdxrNezxZcvaV5h8kVp2iaYBAvYhJGG+ADUJZJ08fEWrl95/AiLExmoixjmgbVatQwqbxyef+6zHsLWQOAgO5ii/3jcqUmUqABtgVJPhfiqIIJtx/iB0mbty+GpgQW1TwRYIjiPsdgTXlcU0qZz2aB8FwGwLfMN1vMxn3CVf1JSaGSy4XV2tzU3qG1fMe0GyC1JyATd9ieo11bhCjZA+E6vrbjHD5f6xYmS/Qlogrn9zZPize3LQNSuLpxz/G6TOOQJDgjey9prTyefcQqksMRpiQDRJdU52K/RAylV2Nz5GlXrV7qeftTRes47eniaInzzmxW9bZGpT866SOzSRn3NE5D4CBUru0+RcZmw7UhQ/x3afsmNRnQTOiAX+U4n1L3fNYmEADsp775ec37p6BD9XUjz6OqGTGeF4xDuz9APLHtHZR0YlgLyp7lughR2R6zkBHaMc6fxExzgPNTO8ymkgJynPyMKIoTUd/G9+8qxpHNe0+ERvYGOYL0WO5clTKrXCPkYIOWFWkWa16oKaTI8l5ISsL+ztTdTNFqkumN6R4E3pQIrM9rVdL8/XL8i+mET5/85T6hYKaxXudyeMLaI/p5w9npLLRfDM5ctQ7qecFrEMTjqXv1nseSorQS3T8BlVakAGjdp8bmwJRw4uJmPXL4PFM3F9xyhZHs8RBOLwsz7xCyJ5nhkutQAzafp+hzOp6atucyOoyztMZW0hQ2vahj6gaNqkSQx5sg/PbOLSBPZUIiVSNkaLr8UiayG7+OfyDEQqQj2LWLeTU82tw0Xquu9Lzlvq7zBqcrZOo0V7xsNqsFi1smSAsD/kVPD5mvWDI03YwlqfEYNQT90ZZDxbNDXljq/BqYZpRkjDUlfMalhj9iy4jn5yvjenJdQfbKL06lMpIaBwp2biLkzguSEYbBBWzMEphwYzTxZpEOaeVQxdTno+7WfvmnUjrShKLCwyJ9vuyIIYvk2xISLPQnJ+5c6aMgJgLgcIMgUmCmaUUmegnnRxbM1As3JvXhJOu0MFhPAkvbJMfOTQ1W2mpOWE0BEJ8HmTm74is8o2/b9DzIt0J1LV2e11o7Dqh5ec1mvkSl/a/UHZlTy/7hw7KJB45YVTcnyYGbTf22bobKnaZ5T9XMJi7QmI7oj2dgvuVXsxAiJtpbG1uLZSeDt97Z9vHKjPrR2Stz5EINtcVa53rPA77WF7IPV6BS5IVGz7qS6AiA/SjIb/+jGvEl9NIh7CaFa8Vh5Jy9fMEWgpRJi2PFbS5C8PflnB6TSdI8itPcEtZLiXMhXx0ZnslxWQx0g5Oc5W3V32Yx/M/qufZbX1omPL3ARqQDOd59RRq9Yq1uE7WoMnZuMAxvTdyu1haVz3GVu/J7VEri+/p2EyOKLJvwMCom9Zh6IMnAXCgF34zelHdh9jBAYBgwCZASqY9S2RG58R50vbf2mOrNJ6jXuY1i3G2em1dTjnl+/B38XMnIzLqN4rda7iLMVFp+3ocTR6Q0H9iu3OOJpB3xLQ1ijzc8oGKabEu+acoLvZxfass5SrmPNlBXof9FRnWu1dNB5L76nkNbyrioJmwbWE9OrbV6ByxzIwTEbfWQOgGxCyJOQdEpmA+YXYWpYnd4tPYTJEN8AnCMiKslTtbT4qStzFlVGGobOM0TSsDHw6Sl5zcI3jhyya8cYYefhE0p99ck2C57enhNPftqKjxXHmZnVFpf9pXYJn/Ryov3nNiqhX9o15RfZ1cz42O4uVTSQyHnuu/24dDVuspAcevEF9XWkpr0hRTY62AGckDcrpqFVHhJAMOy5s/+YxbbYLTMvm49wv5L6C/AKPWWopHIVrl0JBzVHAMaCm0f8mkYl0LKLE262uMU0Do3rgwwMxFwxyfVP8TKXvyx3higiCvPHSR6JpW/0oiHX4ups0TrnUhdxgIybb3xtHpgwKO/O4wglpqi38JRVSruWymKpVe5Mo6VdqoYjyBu4yLyCTvMQLFlsKE0II2/0LUFhhJwt+fw/TppZkKl32hHbwk/1wqYOTkLYFjCpQspRTJauEpgNcCrOfwWNs2DKPGF+jjr5STfzWTMdGOl5yCia7Wda+7mfR3IjfYsCYmNgIC2eK1U0GKLCUB6UJUNo5l8O3wqIbH7OlimvMpkEMs+ZZVkBLWbOtmvQIx6hGiOTTcgp0725N/R9WAIjPXGnJfwOtKd01ommsDYrV9hV6qh9uzpc5DjjvR/qzpl7RSCa9+AbjpH9MtVZTYlFXSOefmqc6LGWhtxRPWGvuixWuS87l72Rod++WYcUlsvR8T9dJM+tfvsvbLqXZL7vo2m+mUzoakrb15agDMEA4Zb8wzgA+kLWBW3JinUYTEJRe2Kn2YKb/gqZ13AdQ40ImTM+o2n6Vbz+IoBHo0P3njFgldKYH4TBrVKZvAVbvJuTjLeqWbruME8hE7DxPQJ4a/vAAlcHhR5Eb84hSONz7IO6xXpvPVsXI5p6Jr0tDIvLMLAj4aDxGISLSBs8aPaVX3e+AI8FkTVKQ/qppW+aIWQ+o66ojjeyNVNa750hc57CKhPv9ivwlPIgLk7wUggkzYrB9nCGM/7x7PGNQGDFeauaT5hFUu9e8BjUcBo+Ee+ZwOXtriDYrBoVFZc0qgry8SymNaUPEdI8OWk4NYQUWZ/ILQOkOnefVrTWBGTKvTGfSsNq3vnbbvT538NC9cGPDr3v14bfG0Qw6E/5bS7LrBnDoZD7LIZK0kbJnTxjTyPqUizPEwRhhtv5vstcO6xqGczBGmlF33RNJRpbCTi9y7tvvWyq5r7Wl3qTSVgXgsDp+vcpDMlfRYHE/+lkJTshnEvVVGudeEpS6p8dL8Hid3uw7GGlxL1xjq4m4lMnb6oe0W2UiY5unZZZK3a8Fa3epAAU19tQ0jCR79oqJw+XBngMOuYryAU/fa2JaKgKm1C9CPw0pIXn9CN0prjgRdEmY4YDf8grZKp3V+m5E7xjfUKFwlqHDz+HZmyj9Zg8hlTPchKsqSaJk76s1wYKAq98UMKF6gggBSzuyrH4OhCVwPPIZPvcytIpl6keCTajCamyNoV+V9BD9BTOc9hECjmsGEO0NeOag2IQuaJ8wJ1DOCZJpAs30iatnn9d68vOzPZ9/T186wp7/dqQexmvK3UDomPmxLyayZmCslY/npwIvHyuU+mortI8IGOjSFMonkJD49zLvjEJJ4lSU9Rz/KgOfd6v8yz3/HzmS8DwSeOs5m8tP34bHXQs+grxpDcfpcoi4UWeUIyMGO7r6NijGJee9ZeccMoUTISB9vrr8iGx9VJCEL5GsD+7hdWUC4D+vvIxZGEx66ujWwQJFJBYCf30YjcgrF1dviBVGF0DZTw7fYZRkKIVdiPdr014mbkpE8DKqsUji6wgV++HLlDtnHW5IFitkDv/WGOjZb+Apo1Jy7fSLxD+tS5cClswjUHDxQoGcA+xcIbnS7hnWLwVn5B05O4x7q2CL9PossY9RSB2WLadiOnI31inuqo2VejhDbKFYINCDXhGwEEtfsYwVldJVEmvx/p9lkDgQLdpH+leMMafcfJQNGYGoOQklUQuuVl3EXEfTwTN6/PYaDEIz0K4o6XiFNXvCb5Vw0YCr/lC5vUgaWvUgM9WYPxAZfIwIJr956A/3+ASxs5Pi8jB4GlKe5yFMrRUfDcOIBc0JhK/MOHQCsrha40wkfHZYHfMwPnLdOyuZIrcTMVGL4zYCRX/ugiYhMND4URWCuerl4L/l80h7YR5qFAtht7jiourW2PbDpwGdaMqrTEP9GTqGBxenZrMnasgz+G32wpbnsvA74/ajbLoKgjWn6ghKQawuxxP7XapCQIWxRYxL8mwZHUA5qR5DuJQEHhXoE5ceiq01tLAen9l3dq+GmVjESU2FqawE8E2zSYxRGHN/6mlUwjlQyLWxfriZBAlu5mRKAxc2pC6t4K7uwV4NfxR26yU/zh4UWpnM40naSDJzSENt9wpXKwHxmhhFC7djVJMUBLPxsNFCGWNDgZqZQQCCd7kpV9823MtcC6/QvTYPvn/rYUSlz23vEjTQ7vRC1V3yT+KIIxAiMpfqqKqUl5CUddzDZVUxda9hpm1zNgFetK06IMdW4Z4WJUbL6M8C+BNVBL4itH1d64E70l7Hy4sLck8tJ8qFnOZVU6v8wUk7S85jueAHqKaEAe1bmdLy3EMhUgBoKe03ockCHBA6zrFwnPpjDt58Mv7TL3pAxuVEEim0eqIGq7jYoUAzzY2lcIEkJPBVJe41FtYsSKkejzbYI2LlF8fHmXgLQoQruFuNQZqPyqFtwYKdaxQTJ878XT7A2h5xJ8Vxjq5YTiYxnRToIS8UUN/RS18ClYPY6c/mxiMqoss6wUjDZBHaXsJ6OB5vT+pphnYSO+gEWykr3ZKSn57QavSI4nJ2Yg3tCZ4wkk4oyHZWm0aTOlTUVW6wPgCUIfBSAWi4dHsP4hjwcgQnZxrOSqbLJHtlYcFhcCZNO1Lphk05JYGP+/gh0furDXcfUanpp1zxbRgUvqwUs/wdLZGCVLwKZnyMB1pTjqGC/2lrm4o7Tb/x9UUqT818bBgtCMQwQhsf1nBWlBKX8+s3smsftMpFxzTeefdrXMH2UZMKWgJ6+a6Ec9rghtQLkpyqeQsdcB0RHKOmqpDA9xmdnTvDdcf6lnlZ1LIovy+P+ZB49RUQfjgF+YJTKi7VFwKJYgc7k5D8fzlYs3Vg9rfBit6zodAIvVtlYwIqR8tMC2aef8d0Ai0rwSbT9xoBNMPlsPtHT8BW86b2yOWKLHk2M/5g3BmV+4Y1aa3f2gVt1UMggQVNTvI5kAtLOc7zQQzesJ9mpQTU2DxrARlPW9xDO7rwqZTOSvThD56HiZ399ZLbl5fxniUGjjaVylJbX7oCQaBMFIjFk3hNEtLt+33ZnL9bC5K0Cj9d9o23KZACIu9feIPu7UX4nOyfrIZHBaRVUzPa+Mhzs9QPJAUBdVLR6EASTh1o/MJDCXWynxxJoBkyUOvSxQlB2gL0RAif6Cf03xAr/7nXEy3EZNiJCPZsbf3ERxwG6xokiS0+jV3PgkJWM89g5wMA4OOOqQGIK7+ZcIN3KyUx+5LfVoFEuT1BnZh6rF2BOSLTQz/m14o1418U8uSul85xRX92Z0Fai6bVd5fVr1MJrwB4Im99o3M2APzib2xzSgHJETM+7I6H0jVntsNkAiE/JgNZcWV68bC1rh8bvyaNJjMEKDFBMIfcc9RSQXdRON922SMxGy+Bgpajwq6dXn0uFqI/NVqWpDuxfIk8AnJVMR4vbZjRh8NQnq20MT03b9kfMVGc6euwVfM9RrUSMghUJ0jap/RZYbesnZVIvcPzEPawi7CO2t1wOn2trDP8FvAFWs7jrHwzmuulvTCXuUTxrMygp6t3sDWt6GaXcXP6ydoWRPGbAoF4ccsEwZjMTpptA4yC/glYzVz9xwaxDX1Z+c0QXKaEC6mSpjmxlTS8i/4/Q3/jXtMCZbFLjhf3KzH4RRJ4Rc+gcY0hYrfB2myXJlc60WjzSTTZhvtEBbfz58DtqPURkL1337FYNFQD/qn204w8SJ6SZUkq/kufFr5zTOfktKL76qckOFzQoI0HUrktRtE0Zy2UUCxl3jByf8wHpny34KBg5VYZhBlwjBDyEuwhwkaxsDt0C1bvcF5Iwm/dTPEv/ukiIzG+AoaBsmCRat53SsnYnHdtK7tK+2Jv1IzmlQMNscOfFDanQ7TstxboSus3f9OkJaQ7DWiSigYakciqdJaV21XHL9bShJMlT0dshwt9MCns4YBCZwYR5iXEiT51Kqb6bm1iSgCroFMYtxCihUJBaiGdcUCiF2jQ48iGYiqPHEBO4FpNKQ9GXm+rjnnUUOVUWuETTiusSB0aKXTdzxE4EOH2La8nxjfuUk+e2AAids9jt2YZnI+27uK3xP7ScWCHJmyEPccGjKtw1V19MR7MFGz+60AKNOh6sp4EaD9COAnUO2e2UaK7PplFZpopADzQz2qYswU5t9T9DmKDAYoCEDs5jG9t1zGzD99z/QtNv3nLuMAxuIoENb2tdac4bSTeczbMCsoNL4+LwMn93OYAj7rTv0ryTGXrhzaOD/9EyAMv2jSMQVHK9z+J1CTtubtju8xjajawmYIokAseqBJXe914X4a0rM4l9DhpwcWOwgCdbQION0hOdOrMKiJmDGPDntQIbcmB5OR/nkgQlNnn99km9927/gNQ7QO8h5TFJkRLugp9ddB/01gt85s2qpVU5SLKB1uBYP9lRcFHwx7217yhtFyEcXLmVsQ9KLoUX8XfcSjq/RgR9UPH5BGsrScR0rBuUx5VnBki3U0qlgiTWbXoSYrxcKYofZ8vxrjMZee48D1WdJY7A9L58gCXTXelg3hUdc4hgZWJSqSaRtlod0PaBXnjIM9de9FBnwi8p/HFStUGbT6/7DUfB40x2ClbU/XYiOELg2spuR7fcV8wFAfv6CpCHSj0URXDo+oEZeQPlAKhCAJZ8VZsAGpxxMS2Ys3eCEalFiwdxp0dYgJKv1GVz8cqFOTdEjvp4ma1qb/2iWuQQc5veaTJ1voyub85laQyMBQr/x2wGhJkizfANgQaLTA2A6UYxIv/vm5y/IOsEVb7pNLj4HympURT6NCzQQEFob0EgtW7o3Xw+7L4twGkCv55bp92eGb9aPmC+A36pESEgDgGuPlwbbszSALaK6aI96+EJMXACyBoMG9IN64UpzmQ9+vHGKtlBbzswcXa/IUF2yUmOyBq3tGNwjSbWrOZgNtvKAelRv23iHH0ruTJj2Er6/rmV/yI6UA41ND5JLxMmAcFvEBCGyjBMUCJ4eNPwCoZfNKsMQNgEBiTBt0wkbIySgt8mXpb6FGAb8OossUkDX0TIv3+S8ZZ2qwUvo15gQxm5B+JmRc5zjzGLQycwRlt6hjRv1uM2ffG0ju3UxoCXVgxEJ7H724BbS9KzK1afKgWKqaY+5YwMqXq5d9de9Y/l07pdg1q5tIxFF1yk0jIEo80PgH9JVao3c1zepuPGkZy+gBFC+/d0S7Vhc2cVOtbArVhf+KkR4/dtNqyZnnQ77yiAMv2PdgyNfx/W4Hfg9mLlZplIsX0D+rmoLJzPQDwHT8X3It1+KXFL69O4MukqLWE0VskCe9fEWq8Yd9MHNzAZ8f35Qu2SqCHt8gj7kpTC2Lnmy8Xtd3FN1Pgyc8T62xhohMzxDAlxxzQAfGCdNAAAEUAH4AAoQAAAAAAAAAAAACt1qu4qUiPbTUeAAAAA" alt="Nyx Buyback — open the Discord channel">
            <span>OPEN BUYBACK CHANNEL ↗</span>
          </a>
          </div>
        </div>

      </section>`;

    if(scrollSnapshot)restoreDoctrineScroll(scrollSnapshot,host);

    $('doctrineShoppingToggle')?.addEventListener('click',()=>{
      doctrineShoppingOpen=!doctrineShoppingOpen;
      localStorage.setItem('jlrDoctrineShoppingOpen',String(doctrineShoppingOpen));
      renderDoctrineMarket({preserveScroll:true});
    });
    host.querySelectorAll('[data-add-doctrine]').forEach(button=>button.addEventListener('click',event=>{
      event.stopPropagation();
      addDoctrineShoppingItem(button.dataset.addDoctrine);
    }));
    host.querySelectorAll('.doctrine-row[data-doctrine-type-id]').forEach(row=>{
      row.addEventListener('dragstart',event=>{
        const id=row.dataset.doctrineTypeId;
        event.dataTransfer.effectAllowed='copy';
        event.dataTransfer.setData('text/plain',id);
        row.classList.add('dragging');
      });
      row.addEventListener('dragend',()=>row.classList.remove('dragging'));
    });
    const shopDrop=$('doctrineShoppingDrop');
    if(shopDrop){
      shopDrop.addEventListener('dragover',event=>{
        event.preventDefault();
        event.dataTransfer.dropEffect='copy';
        shopDrop.classList.add('drag-over');
      });
      shopDrop.addEventListener('dragleave',event=>{
        if(!shopDrop.contains(event.relatedTarget))shopDrop.classList.remove('drag-over');
      });
      shopDrop.addEventListener('drop',event=>{
        event.preventDefault();
        shopDrop.classList.remove('drag-over');
        addDoctrineShoppingItem(event.dataTransfer.getData('text/plain'));
      });
    }
    host.querySelectorAll('[data-shop-mode]').forEach(button=>button.addEventListener('click',()=>{
      doctrineShoppingMode=button.dataset.shopMode==='shortfall'?'shortfall':'full';
      localStorage.setItem('jlrDoctrineShoppingMode',doctrineShoppingMode);
      renderDoctrineMarket({preserveScroll:true});
    }));
    $('doctrineShoppingRecalc')?.addEventListener('click',recalculateDoctrineShoppingList);
    host.querySelectorAll('[data-shop-qty]').forEach(input=>input.addEventListener('change',()=>{
      const item=doctrineShoppingList.find(row=>Number(row.typeId)===Number(input.dataset.shopQty));
      if(!item)return;
      item.qty=Math.max(1,Math.floor(Number(input.value)||1));
      saveDoctrineShoppingList();
      renderDoctrineMarket({preserveScroll:true});
    }));
    host.querySelectorAll('[data-remove-doctrine]').forEach(button=>button.addEventListener('click',()=>removeDoctrineShoppingItem(button.dataset.removeDoctrine)));
    $('doctrineShoppingClear')?.addEventListener('click',()=>{
      doctrineShoppingList=[];
      saveDoctrineShoppingList();
      renderDoctrineMarket({preserveScroll:true});
      toast('Shopping list cleared.');
    });
    $('doctrineShoppingCopy')?.addEventListener('click',copyDoctrineMultibuy);
    host.querySelectorAll('[data-doctrine-view]').forEach(button=>button.addEventListener('click',()=>{
      doctrineView=button.dataset.doctrineView;
      localStorage.setItem('jlrDoctrineView',doctrineView);
      renderDoctrineMarket();
    }));
    $('doctrineSearch')?.addEventListener('input',event=>{
      doctrineSearch=String(event.currentTarget.value||'');
      renderDoctrineMarket();
      requestAnimationFrame(()=>$('doctrineSearch')?.focus());
    });
    $('doctrineClass')?.addEventListener('change',event=>{doctrineClass=event.currentTarget.value||'all';renderDoctrineMarket()});
    $('doctrineCategory')?.addEventListener('change',event=>{doctrineCategory=event.currentTarget.value||'all';renderDoctrineMarket()});
    $('doctrineRefresh')?.addEventListener('click',()=>loadDoctrineMarket(true));
  }

  function ordinalRank(value){
    const n=Math.trunc(Number(value)||0);
    if(n<=0)return '—';
    const mod100=n%100;
    const mod10=n%10;
    const suffix=(mod100>=11&&mod100<=13)?'th':mod10===1?'st':mod10===2?'nd':mod10===3?'rd':'th';
    return `${n}${suffix}`;
  }
  function pvpRankBadge(rank,isMine=false){
    return `<span class="pvp-rank${isMine?' mine':''}">${ordinalRank(rank)}</span>`;
  }
  function renderPvpIntel(){
    const host=$('pvpIntelPanel');
    if(!host)return;
    if(pvpIntelLoading&&!pvpIntel){
      host.innerHTML='<section class="glass pvp-loading"><strong>BUILDING INIT 7-DAY LEADERBOARD…</strong><span>Reading cached zKillboard data or refreshing the shared alliance cache.</span></section>';
      return;
    }
    if(pvpIntelError){
      host.innerHTML=`<section class="glass pvp-error"><strong>INIT PVP LEADERBOARD UNAVAILABLE</strong><span>${esc(pvpIntelError)}</span><button id="pvpRetry" class="orb blue" type="button">TRY AGAIN</button></section>`;
      $('pvpRetry')?.addEventListener('click',()=>loadPvpIntel(true));
      return;
    }
    if(!pvpIntel){
      host.innerHTML='<section class="glass pvp-loading">Open this tab to load INIT PvP rankings.</section>';
      return;
    }
    const d=pvpIntel;
    if(pvpMemberRankMode==='lifetime'&&!pvpLifetimeDamage&&!pvpLifetimeDamageLoading)setTimeout(()=>loadPvpLifetimeDamage(),0);
    const corpRows=(d.corporations||[]).map(row=>`
      <tr class="${row.isMyCorp?'mine':''}">
        <td>${pvpRankBadge(row.rank,row.isMyCorp)}</td>
        <td><a class="pvp-killboard-link" href="https://zkillboard.com/corporation/${encodeURIComponent(row.corporationId)}/" target="_blank" rel="noopener noreferrer" title="Open ${esc(row.name||('Corp '+row.corporationId))} on zKillboard"><strong>${esc(row.name||('Corp '+row.corporationId))}</strong></a>${row.isMyCorp?'<small>YOUR CORP</small>':''}</td>
        <td>${fmt(row.shipsDestroyed)}</td>
        <td>${fmt(row.pointsDestroyed)}</td>
        <td>${fmt(row.iskDestroyed)} ISK</td>
        <td>${row.zkillGlobalRank?('#'+fmt(row.zkillGlobalRank)):'—'}</td>
      </tr>`).join('');
    const linkedPvpToons=Array.isArray(d.linkedCorpCharacters)?d.linkedCorpCharacters:[];
    if(!linkedPvpToons.some(row=>String(row.characterId)===String(pvpPinnedCharacterId))){
      pvpPinnedCharacterId=String(linkedPvpToons.find(row=>row.primary)?.characterId||linkedPvpToons[0]?.characterId||'');
      if(pvpPinnedCharacterId)localStorage.setItem('jlrPvpPinnedCharacter',pvpPinnedCharacterId);
    }

    const lifetimeMode=pvpMemberRankMode==='lifetime';
    const memberRankField=pvpMemberRankMode==='overall'?'rankOverall':pvpMemberRankMode==='isk'?'rankIsk':pvpMemberRankMode==='damage'?'rankDamage':'rankActivity';
    let memberRows=lifetimeMode
      ?[...(pvpLifetimeDamage?.rows||[])]
      :[...(d.myCorpMembers||[])];

    if(lifetimeMode&&pvpPinnedCharacterId&&!memberRows.some(row=>String(row.characterId)===String(pvpPinnedCharacterId))){
      const linked=linkedPvpToons.find(row=>String(row.characterId)===String(pvpPinnedCharacterId));
      if(linked)memberRows.push({rank:null,characterId:linked.characterId,name:linked.name,killmails:0,finalBlows:0,damageDone:0,iskOnKillmails:0});
    }

    memberRows.sort((a,b)=>{
      const aPinned=String(a.characterId)===String(pvpPinnedCharacterId);
      const bPinned=String(b.characterId)===String(pvpPinnedCharacterId);
      if(aPinned!==bPinned)return aPinned?-1:1;
      if(lifetimeMode)return Number(a.rank||999999)-Number(b.rank||999999);
      return Number(a?.[memberRankField]||999999)-Number(b?.[memberRankField]||999999);
    });

    const myMembers=memberRows.map(row=>`
      <tr class="mine${String(row.characterId)===String(pvpPinnedCharacterId)?' pvp-own-toon':''}">
        <td>${pvpRankBadge(lifetimeMode?row.rank:row?.[memberRankField],true)}</td>
        <td><a class="pvp-killboard-link" href="https://zkillboard.com/character/${encodeURIComponent(row.characterId)}/" target="_blank" rel="noopener noreferrer" title="Open ${esc(row.name||('Character '+row.characterId))} on zKillboard"><strong>${esc(row.name||('Character '+row.characterId))}</strong></a>${pvpMemberRankMode==='overall'&&Number.isFinite(Number(row.overallScore))?'<small>OVERALL '+Number(row.overallScore).toFixed(1)+'</small>':''}</td>
        <td>${fmt(row.killmails)}</td>
        <td>${fmt(row.finalBlows)}</td>
        <td>${fmt(row.damageDone)}</td>
        <td>${fmt(row.iskOnKillmails)} ISK</td>
      </tr>`).join('');
    const allianceRows=(d.characters||[]).map(row=>`
      <tr class="${row.isMyCorp?'mine':''}">
        <td>${pvpRankBadge(row.rank,row.isMyCorp)}</td>
        <td>${row.isMyCorp?`<a class="pvp-killboard-link" href="https://zkillboard.com/character/${encodeURIComponent(row.characterId)}/" target="_blank" rel="noopener noreferrer" title="Open ${esc(row.name||('Character '+row.characterId))} on zKillboard"><strong>${esc(row.name||('Character '+row.characterId))}</strong></a>`:`<strong>${esc(row.name||('Character '+row.characterId))}</strong>`}${row.isMyCorp?'<small>YOUR CORP</small>':''}</td>
        <td>${fmt(row.killmails)}</td>
        <td>${fmt(row.finalBlows)}</td>
        <td>${fmt(row.damageDone)}</td>
        <td>${fmt(row.iskOnKillmails)} ISK</td>
      </tr>`).join('');
    const myRank=d.myCorporation?.rank||null;
    host.innerHTML=`
      <div class="pvp-shell">
        <section class="glass pvp-hero">
          <div>
            <span class="pvp-eyebrow">ZKILLBOARD • ROLLING 7 DAYS</span>
            <h2>INIT PVP LEADERBOARDS</h2>
            <p>Corporations use zKillboard's Weekly 7d stats; pilots use INIT killmail participation for their 7-day placement.</p>
          </div>
          <button id="pvpRefresh" class="orb blue" type="button">REFRESH</button>
        </section>

        <section class="pvp-summary-grid">
          <article class="glass pvp-summary-card">
            <span>YOUR CORP</span>
            <strong>${d.myCorporation?.corporationId?`<a class="pvp-killboard-link" href="https://zkillboard.com/corporation/${encodeURIComponent(d.myCorporation.corporationId)}/" target="_blank" rel="noopener noreferrer" title="Open ${esc(d.myCorporation?.name||'Corporation')} on zKillboard">${esc(d.myCorporation?.name||'Unknown')}</a>`:`${esc(d.myCorporation?.name||'Unknown')}`}</strong>
            <small>${myRank?`#${myRank} of ${d.activeCorporations} active INIT corps`:'No kills recorded in this window'}${d.myCorporation?.statsVerified?' • zKill Weekly 7d':''}</small>
          </article>
          <article class="glass pvp-summary-card">
            <span>YOUR ACTIVE PILOTS</span>
            <strong>${fmt(d.myCorpMembers?.length||0)}</strong>
            <small>corp members appearing on INIT killmails</small>
          </article>
          <article class="glass pvp-summary-card">
            <span>INIT ACTIVE PILOTS</span>
            <strong>${fmt(d.activeCharacters||0)}</strong>
            <small>ranked from zKillboard attacker records</small>
          </article>
          <article class="glass pvp-summary-card">
            <span>${d.localArchive?'LOCAL KILLMAIL DATABASE':'KILLMAILS PROCESSED'}</span>
            <strong>${fmt(d.killmailsProcessed||0)}</strong>
            <small>${d.localArchive
              ?`${fmt(d.killmailsStored||d.killmailsProcessed||0)} stored • ${d.truncated?'local history is filling • exact after 7 tracked days':'complete rolling 7-day coverage'}`
              :d.truncated?'API page cap reached • rankings may be partial':`${fmt(d.pagesFetched||0)} API pages • validated crawl`}</small>
          </article>
        </section>

        <div class="pvp-two-col">
          <section class="glass pvp-section">
            <div class="pvp-section-head"><strong>INIT CORPORATIONS</strong><span>your corp is highlighted</span></div>
            <div class="pvp-table-wrap">
              <table class="pvp-table">
                <thead><tr><th>INIT RANK</th><th>CORPORATION</th><th>SHIPS</th><th>POINTS</th><th>ISK DESTROYED</th><th>ZKILL 7D RANK</th></tr></thead>
                <tbody>${corpRows||'<tr><td colspan="6">No corp activity found.</td></tr>'}</tbody>
              </table>
            </div>
          </section>

          <section class="glass pvp-section">
            <div class="pvp-section-head pvp-member-head pvp-member-controls-only">
              <div class="pvp-section-title"><strong>${esc(String(d.myCorporation?.name||'YOUR CORP').toUpperCase())}</strong><span>• CORP PILOT RANKING</span></div>
              <div class="pvp-member-rank-controls" role="group" aria-label="Corp member ranking mode">
                ${linkedPvpToons.length>1?(()=>{
                  const selectedToon=linkedPvpToons.find(row=>String(row.characterId)===String(pvpPinnedCharacterId))||linkedPvpToons[0];
                  return `<div class="pvp-toon-picker${pvpToonMenuOpen?' open':''}">
                    <button id="pvpPinnedToonButton" class="pvp-toon-trigger" type="button" aria-haspopup="listbox" aria-expanded="${pvpToonMenuOpen}" title="Choose which linked ESI toon stays pinned to the top">
                      <span>${esc(selectedToon?.name||'Select toon')}</span><b>▾</b>
                    </button>
                    ${pvpToonMenuOpen?`<div id="pvpPinnedToonMenu" class="pvp-toon-menu" role="listbox" aria-label="Choose linked ESI toon">
                      ${linkedPvpToons.map(row=>`<button class="pvp-toon-option${String(row.characterId)===String(pvpPinnedCharacterId)?' selected':''}" type="button" role="option" aria-selected="${String(row.characterId)===String(pvpPinnedCharacterId)}" data-id="${esc(row.characterId)}">
                        <span>${esc(row.name)}</span>${row.primary?'<small>PRIMARY</small>':''}
                      </button>`).join('')}
                    </div>`:''}
                  </div>`;
                })():''}
                <button id="pvpRankOverall" class="orb ${pvpMemberRankMode==='overall'?'blue':''}" type="button" aria-pressed="${pvpMemberRankMode==='overall'}">BEST OVERALL • CORP</button>
                <button id="pvpRankActivity" class="orb ${pvpMemberRankMode==='activity'?'blue':''}" type="button" aria-pressed="${pvpMemberRankMode==='activity'}">KILLMAILS / FINALS</button>
                <button id="pvpRankIsk" class="orb ${pvpMemberRankMode==='isk'?'blue':''}" type="button" aria-pressed="${pvpMemberRankMode==='isk'}">ISK ON KILLS</button>
                <button id="pvpRankDamage" class="orb ${pvpMemberRankMode==='damage'?'blue':''}" type="button" aria-pressed="${pvpMemberRankMode==='damage'}">MOST DAMAGE • 7D</button>
                <button id="pvpRankLifetime" class="orb ${pvpMemberRankMode==='lifetime'?'blue':''}" type="button" aria-pressed="${pvpMemberRankMode==='lifetime'}">LIFETIME DAMAGE</button>
              </div>
            </div>
            <div class="pvp-table-wrap">
              <table class="pvp-table">
                <thead><tr><th>${lifetimeMode?'CORP RANK':pvpMemberRankMode==='overall'?'CORP RANK':pvpMemberRankMode==='isk'?'ISK RANK':pvpMemberRankMode==='damage'?'DAMAGE RANK':'KILL RANK'}</th><th>PILOT</th><th>KILLMAILS</th><th>FINAL</th><th>${lifetimeMode?'LIFETIME DAMAGE':pvpMemberRankMode==='damage'?'DAMAGE • 7D':'DAMAGE'}</th><th>ISK ON KILLS</th></tr></thead>
                <tbody>${lifetimeMode&&!pvpLifetimeDamage?.ready?`<tr><td colspan="6" class="pvp-lifetime-status">${pvpLifetimeDamageError?esc(pvpLifetimeDamageError):`LOCAL DATABASE BUILDING • ${fmt(pvpLifetimeDamage?.monthsScanned||0)}/${fmt(pvpLifetimeDamage?.totalMonths||0)} MONTHS CACHED`}</td></tr>`:''}${myMembers||`<tr><td colspan="6">${lifetimeMode?'No lifetime damage cached yet.':'No active corp pilots found in this 7-day window.'}</td></tr>`}</tbody>
              </table>
            </div>
          </section>
        </div>

        <section class="glass pvp-section">
          <div class="pvp-section-head"><strong>INIT PILOT LEADERBOARD</strong><span>rank numbers are INIT-wide • top 100 active pilots</span></div>
          <div class="pvp-table-wrap">
            <table class="pvp-table">
              <thead><tr><th>INIT RANK</th><th>PILOT</th><th>KILLMAILS</th><th>FINAL</th><th>DAMAGE</th><th>ISK ON KILLS</th></tr></thead>
              <tbody>${allianceRows||'<tr><td colspan="6">No pilot activity found.</td></tr>'}</tbody>
            </table>
          </div>
        </section>

        <section class="pvp-footnote">
          <strong>RANKING METHOD</strong>
          <span>Corporation rows use zKillboard's own Weekly 7d stats. BEST OVERALL is a corp-only 7-day score with equal weight for killmail participation, final blows, damage, and ISK on kills. Other pilot rankings are INIT-wide from JLR's local rolling killmail database. LIFETIME DAMAGE uses the separate historical local database.</span>
          <small>Updated ${d.generatedAt?ago(d.generatedAt):'recently'} • ${d.stale?'showing last good cache after refresh error • ':''}${d.localArchive?'local archive refreshes every 15 minutes':'shared server cache'} • source: zKillboard public API</small>
        </section>
      </div>`;
    $('pvpRefresh')?.addEventListener('click',()=>loadPvpIntel(true));
    $('pvpPinnedToonButton')?.addEventListener('click',event=>{
      event.stopPropagation();
      pvpToonMenuOpen=!pvpToonMenuOpen;
      renderPvpIntel();
    });
    document.querySelectorAll('.pvp-toon-option').forEach(button=>button.addEventListener('click',event=>{
      event.stopPropagation();
      pvpPinnedCharacterId=String(button.dataset.id||'');
      localStorage.setItem('jlrPvpPinnedCharacter',pvpPinnedCharacterId);
      pvpToonMenuOpen=false;
      renderPvpIntel();
    }));
    $('pvpRankOverall')?.addEventListener('click',()=>{
      pvpMemberRankMode='overall';
      localStorage.setItem('jlrPvpMemberRankMode',pvpMemberRankMode);
      renderPvpIntel();
    });
    $('pvpRankActivity')?.addEventListener('click',()=>{
      pvpMemberRankMode='activity';
      localStorage.setItem('jlrPvpMemberRankMode',pvpMemberRankMode);
      renderPvpIntel();
    });
    $('pvpRankIsk')?.addEventListener('click',()=>{
      pvpMemberRankMode='isk';
      localStorage.setItem('jlrPvpMemberRankMode',pvpMemberRankMode);
      renderPvpIntel();
    });
    $('pvpRankDamage')?.addEventListener('click',()=>{
      pvpMemberRankMode='damage';
      localStorage.setItem('jlrPvpMemberRankMode',pvpMemberRankMode);
      renderPvpIntel();
    });
    $('pvpRankLifetime')?.addEventListener('click',()=>{
      pvpMemberRankMode='lifetime';
      localStorage.setItem('jlrPvpMemberRankMode',pvpMemberRankMode);
      renderPvpIntel();
      loadPvpLifetimeDamage();
    });
  }
  document.addEventListener('click',event=>{
    if(!pvpToonMenuOpen)return;
    if(event.target?.closest?.('.pvp-toon-picker'))return;
    pvpToonMenuOpen=false;
    renderPvpIntel();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&pvpToonMenuOpen){
      pvpToonMenuOpen=false;
      renderPvpIntel();
    }
  });

  async function loadPvpLifetimeDamage(force=false){
    if(pvpLifetimeDamageLoading)return;
    pvpLifetimeDamageLoading=true;
    pvpLifetimeDamageError='';
    try{
      const data=await api(`/api/zkill/lifetime-damage${force?'?refresh=1':''}`);
      pvpLifetimeDamage=data;
      if(!data?.ready){
        clearTimeout(pvpLifetimeDamagePoll);
        pvpLifetimeDamagePoll=setTimeout(()=>loadPvpLifetimeDamage(false),8000);
      }
    }catch(error){
      pvpLifetimeDamageError=String(error?.message||error||'Lifetime corp damage could not be loaded.');
    }finally{
      pvpLifetimeDamageLoading=false;
      renderPvpIntel();
    }
  }

  async function loadPvpIntel(force=false,backgroundPoll=false){
    if(pvpIntelLoading)return;
    if(!backgroundPoll)pvpIntelPollCount=0;
    if(pvpIntelPoll){clearTimeout(pvpIntelPoll);pvpIntelPoll=null}
    pvpIntelLoading=true;pvpIntelError='';renderPvpIntel();
    let shouldPoll=false;
    try{
      pvpIntel=await api(`/api/zkill/leaderboard${force?'?refresh=1':''}`);
      shouldPoll=Boolean(pvpIntel?.refreshing);
    }catch(error){
      pvpIntelError=String(error?.message||error||'PvP rankings could not be loaded.');
    }finally{
      pvpIntelLoading=false;
      renderPvpIntel();
      if(shouldPoll&&activeTab==='pvp'&&pvpIntelPollCount<20){
        pvpIntelPollCount++;
        pvpIntelPoll=setTimeout(()=>loadPvpIntel(false,true),3000);
      }
    }
  }


  function threatAgeLabel(birthday){
    const born=Date.parse(String(birthday||''));
    if(!Number.isFinite(born))return '—';
    const days=Math.max(0,(Date.now()-born)/86400000);
    if(days>=365)return `${Math.floor(days/365)}y`;
    if(days>=30)return `${Math.floor(days/30)}m`;
    return `${Math.max(1,Math.floor(days))}d`;
  }
  function threatBadges(ch){
    const tags=Array.isArray(ch?.tags)?ch.tags:[];
    if(ch?.statsError&&!tags.length)return[{label:'LIMITED DATA',kind:'dim'}];
    return tags.length?tags:[{label:'NO MAJOR FLAGS',kind:'dim'}];
  }
  function threatShipImages(ch){
    const characterId=Number(ch?.id)||0;
    const characterName=String(ch?.name||'pilot');
    return (Array.isArray(ch?.ships)?ch.ships:[]).slice(0,5).map(ship=>{
      const id=Number(ship?.shipTypeID)||0;
      const name=String(ship?.shipName||'Unknown ship');
      if(!id)return '';
      const appearances=fmt(ship?.appearances||0);
      const href=characterId
        ?`https://zkillboard.com/character/${encodeURIComponent(characterId)}/scanalyzer/`
        :`https://zkillboard.com/ship/${encodeURIComponent(id)}/`;
      return `<a class="threat-ship-link" href="${href}" target="_blank" rel="noopener noreferrer" title="${esc(name)} • ${appearances} appearances • click for zKillboard ship history" aria-label="Open ${esc(characterName)} ${esc(name)} ship history on zKillboard"><img src="https://images.evetech.net/types/${id}/render?size=64" alt="${esc(name)}"></a>`;
    }).join('');
  }
  function threatScoreClass(score){
    const n=Number(score)||0;
    return n>=85?'critical':n>=70?'high':n>=50?'watch':'';
  }
  function threatNumber(value){
    if(value===null||value===undefined||value==='')return null;
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  }
  function threatScanRenderSignature(data){
    if(!data)return'';
    return [
      Boolean(data.refreshing),
      Number(data.pendingIntel)||0,
      Number(data.staleIntel)||0,
      Number(data.displayedPilotCount)||0,
      String(data.scannedAt||''),
      Number(data.performance?.backgroundMs)||0,
      String(data.enrichmentError||''),
    ].join('|');
  }
  function renderThreatScan(){
    const host=$('threatScanPanel');
    if(!host)return;
    const data=threatScanData;
    const chars=Array.isArray(data?.chars)?data.chars:[];
    const highDanger=chars.filter(ch=>Number(ch?.jlrThreat)>=70).length;
    const signalCount=chars.filter(ch=>(ch?.tags||[]).some(tag=>/CYNO|FC|BAIT|BLOPS|TITAN|SUPER/i.test(String(tag?.label||'')))).length;
    const dscanShips=Array.isArray(data?.ships)?data.ships:[];
    const hasContactsAccess=Boolean(me?.characters?.some(character=>character.contactsAccess));

    const shipStrip=dscanShips.length?`
      <section class="glass threat-dscan-strip">
        <div class="threat-results-head"><strong>D-SCAN COMPOSITION</strong><span>${fmt(data.totalShips||0)} ships detected</span></div>
        <div class="threat-dscan-list">${dscanShips.slice(0,18).map(ship=>`
          <span><img src="https://images.evetech.net/types/${encodeURIComponent(ship.shipTypeID)}/render?size=64" alt=""><b>${fmt(ship.count)}×</b> ${esc(ship.name)}</span>`).join('')}</div>
      </section>`:'';

    const rows=chars.map(ch=>{
      const s=ch?.stats||{},weekly=s.weekly||{};
      const score=Number(ch?.jlrThreat)||0;
      const kills=Number(weekly.shipsDestroyed)||0;
      const losses=Number(weekly.shipsLost)||0;
      const kd=losses>0?(kills/losses).toFixed(2):(kills>0?'∞':'—');
      const gang=threatNumber(s.gangRatio);
      const soloValue=threatNumber(s.soloRatio);
      const solo=soloValue!==null?soloValue:(gang!==null?Math.max(0,100-gang):null);
      const avgGang=threatNumber(s.avgGangSize);
      const sec=threatNumber(ch?.secStatus);
      const tags=threatBadges(ch).map(tag=>`<span class="threat-tag ${esc(tag.kind||'blue')}">${esc(tag.label)}</span>`).join('');
      const partner=ch?.topPartners?.[0];
      const intelPending=Boolean(ch?.intelPending);
      return `<tr class="${threatScoreClass(score)}${intelPending?' intel-pending':''}">
        <td class="threat-pilot-cell">
          <div class="threat-pilot">
            <img src="https://images.evetech.net/characters/${encodeURIComponent(ch.id)}/portrait?size=64" alt="">
            <div>
              <a href="https://zkillboard.com/character/${encodeURIComponent(ch.id)}/" target="_blank" rel="noopener noreferrer"><strong>${esc(ch.name)}</strong></a>
              <small>${intelPending?'QUICK RESULT • COMBAT INTEL LOADING':esc(ch.corporationName||'No corporation')+(ch.allianceName?esc(' • '+ch.allianceName):'')}</small>
            </div>
          </div>
        </td>
        <td class="threat-age-cell"><strong>${threatAgeLabel(ch.birthday)}</strong><small>CHAR AGE</small></td>
        <td class="threat-score-cell"><strong>${score}</strong><div><i style="width:${score}%"></i></div></td>
        <td>${sec!==null?sec.toFixed(1):'—'}</td>
        <td><strong>${fmt(kills)} / ${fmt(losses)}</strong><small>K/D ${kd}</small></td>
        <td><strong>${solo===null?'—':Math.round(solo)+'%'}</strong><small>${gang!==null?Math.round(gang)+'% gang':'no gang data'}</small></td>
        <td>${avgGang!==null?avgGang.toFixed(1):'—'}</td>
        <td><strong>${fmt(weekly.iskDestroyed||0)}</strong><small>ISK destroyed</small></td>
        <td class="threat-tags">${tags}</td>
        <td class="threat-ships">${threatShipImages(ch)||'<span>—</span>'}</td>
        <td>${partner?`<a class="pvp-killboard-link" href="https://zkillboard.com/character/${encodeURIComponent(partner.characterID)}/" target="_blank" rel="noopener noreferrer">${esc(partner.name)}</a><small>${fmt(partner.sharedKills)} shared</small>`:'—'}</td>
      </tr>`;
    }).join('');

    const unresolved=Array.isArray(data?.unresolvedNames)?data.unresolvedNames:[];
    const unresolvedShips=Array.isArray(data?.unresolvedShipNames)?data.unresolvedShipNames:[];
    const ignored=Number(data?.ignored?.total)||0;
    const parsedPilots=Number(data?.parsedPilotCount??data?.rawLineCount??chars.length)||0;
    const resolvedPilots=Number(data?.resolvedPilotCount??data?.candidateCount??chars.length)||0;
    const displayedPilots=Number(data?.displayedPilotCount??chars.length)||0;
    const truncatedPilots=Number(data?.truncatedCount)||0;
    const cacheText=data?`${fmt(parsedPilots)} parsed • ${fmt(resolvedPilots)} resolved • ${fmt(ignored)} filtered • ${fmt(displayedPilots)} displayed • ${fmt(data.cache?.hits||0)} local hits • ${fmt(data.cache?.refreshed||0)} refreshed${unresolved.length?' • '+fmt(unresolved.length)+' pilots unresolved':''}${unresolvedShips.length?' • '+fmt(unresolvedShips.length)+' ship types unresolved':''}${truncatedPilots?' • '+fmt(truncatedPilots)+' over 1,000-pilot safety limit':''}`:'';
    const quickMs=Math.max(0,Number(data?.performance?.responseMs??data?.performance?.totalMs)||0);
    const pendingIntel=Math.max(0,Number(data?.pendingIntel)||0);
    const progressTotal=Math.max(0,Number(data?.progress?.total)||0);
    const progressDone=Math.max(0,Number(data?.progress?.enriched)||0);
    const progressText=progressTotal?(' • '+fmt(progressDone)+'/'+fmt(progressTotal)+' PROFILES READY'):'';
    const threatStatus=threatScanLoading
      ?'RESOLVING PILOTS…'
      :threatScanError
        ?esc(threatScanError)
        :data?.refreshing
          ?`QUICK RESULTS READY${quickMs?' IN '+Math.round(quickMs)+' MS':''}${progressText} • ${fmt(pendingIntel)} PROFILE${pendingIntel===1?'':'S'} ENRICHING${data?.standingsPending?' • STANDINGS FILTER FINISHING':''}`
          :data
            ?`JLR threat engine • ${cacheText}${quickMs?' • response '+Math.round(quickMs)+' ms':''}`
            :'Paste names or D-scan, then scan.';

    host.innerHTML=`
      <div class="threat-shell">
        <section class="glass threat-hero">
          <div>
            <span class="threat-eyebrow">JLR LOCAL / D-SCAN INTELLIGENCE</span>
            <h2>THREAT SCAN</h2>
          </div>
          <div class="threat-actions">
            <button id="threatPasteScan" class="orb blue" type="button">📋 PASTE & SCAN</button>
            <button id="threatRunScan" class="orb silver" type="button">SCAN TEXT</button>
            <button id="threatShareScan" class="orb purple" type="button" title="Publish this pasted Local or D-scan as a JLR-hosted share link and automatically copy the URL" ${threatShareLoading?'disabled':''}>${threatShareLoading?'CREATING…':threatShareUrl?'📋 COPY INTEL LINK':'🔗 CREATE + COPY LINK'}</button>
            <details class="threat-settings">
              <summary>⚙ SETTINGS</summary>
              <div class="threat-settings-menu">
                <strong>SCAN FILTERS</strong>
                <label class="threat-check${hasContactsAccess?'':' disabled'}">
                  <input id="threatIgnorePositive" type="checkbox" ${threatIgnorePositive&&hasContactsAccess?'checked':''} ${hasContactsAccess?'':'disabled'}>
                  <span>Ignore positive standings</span>
                </label>
                <label class="threat-check">
                  <input id="threatIgnoreOwn" type="checkbox" ${threatIgnoreOwn?'checked':''}>
                  <span>Ignore your linked characters</span>
                </label>
                ${hasContactsAccess
                  ?`<small>Positive standings use ${esc(data?.standingsSource?.name||'an authorized linked toon')}.</small>`
                  :'<small>Positive standings need EVE contacts access. <button id="threatUpdateAccess" type="button">UPDATE ACCESS</button></small>'}
              </div>
            </details>
          </div>
        </section>

        <section class="glass threat-input-card">
          <textarea id="threatScanInput" spellcheck="false" placeholder="Paste Local names or copied D-scan rows here…">${esc(threatScanText)}</textarea>
          <div class="threat-input-foot">
            <span>${threatStatus}${threatShareError?` • ${esc(threatShareError)}`:''}</span>
            <div class="threat-input-foot-actions">
              ${data?.scannedAt?`<small>updated ${ago(data.scannedAt)}</small>`:''}
              <button id="threatClearScan" class="threat-clear-text" type="button" ${threatScanText?'':'disabled'}>CLEAR TEXT</button>
            </div>
          </div>
          ${threatShareUrl?`<div class="threat-share-ready">
            <span>JLR SHARE LINK READY</span>
            <a href="${esc(threatShareUrl)}" target="_blank" rel="noopener noreferrer">${esc(threatShareUrl)}</a>
            <div class="threat-share-ready-actions">
              <button id="threatEditShare" type="button">${threatShareEditOpen?'CLOSE EDIT':'EDIT SHARED LINK'}</button>
              <button id="threatNewShare" type="button">NEW SHARE</button>
            </div>
          </div>`:''}
          ${threatShareEditOpen?`<section class="threat-share-editor">
            <div class="threat-share-editor-head">
              <div><strong>EDIT SHARED LINK</strong><span>Changes save to the same public URL.</span></div>
              ${threatShareEditLoading?'<small>Loading…</small>':''}
            </div>
            ${threatShareEditError?`<div class="threat-share-editor-error">${esc(threatShareEditError)}</div>`:''}
            ${threatShareRecord?`
              <label><span>SYSTEM</span><input id="threatShareSystem" maxlength="80" value="${esc(threatShareRecord.system||'')}" placeholder="Example: C-N4OD"></label>
              <div class="threat-share-editor-grid">
                <label><span>D-SCAN</span><textarea id="threatShareDscan" spellcheck="false" placeholder="Paste D-scan here…">${esc(threatShareRecord.dscanText||'')}</textarea></label>
                <label><span>LOCAL</span><textarea id="threatShareLocal" spellcheck="false" placeholder="Paste Local names here…">${esc(threatShareRecord.localText||'')}</textarea></label>
              </div>
              <label><span>MANUAL RECON <small>one per line, e.g. Huginn x2</small></span><textarea id="threatShareRecon" class="threat-share-recon" spellcheck="false" placeholder="Huginn x1&#10;Lachesis x2">${esc((threatShareRecord.manualRecons||[]).map(row=>row.name+' x'+row.count).join('\n'))}</textarea></label>
              <div class="threat-share-editor-actions">
                <button id="threatSaveShareEdit" class="orb purple" type="button" ${threatShareSaving?'disabled':''}>${threatShareSaving?'SAVING…':'SAVE SAME LINK'}</button>
              </div>`:''}
          </section>`:''}
        </section>

        ${data?`
        <section class="threat-summary">
          <article class="glass"><span>PILOTS IDENTIFIED</span><strong>${fmt(resolvedPilots)}</strong></article>
          <article class="glass"><span>JLR THREAT 70+</span><strong>${fmt(highDanger)}</strong></article>
          <article class="glass"><span>TACTICAL SIGNALS</span><strong>${fmt(signalCount)}</strong></article>
          <article class="glass"><span>D-SCAN SHIPS</span><strong>${fmt(data.totalShips||0)}</strong></article>
        </section>

        ${shipStrip}

        <section class="glass threat-results">
          <div class="threat-results-head"><strong>PILOT INTELLIGENCE</strong><span>JLR threat score • public ESI + cached zKill stats</span></div>
          <div class="threat-table-wrap">
            <table class="threat-table threat-table-v2">
              <thead><tr><th>CHARACTER</th><th>AGE</th><th>JLR THREAT</th><th>SEC</th><th>7D K/L</th><th>SOLO</th><th>AVG GANG</th><th>7D ISK</th><th>TAGS</th><th>RECENT SHIPS</th><th>PARTNER</th></tr></thead>
              <tbody>${rows||`<tr><td colspan="11" class="threat-empty">${dscanShips.length?'D-scan ships found. No pilot names could be resolved from this paste. Paste Local names as well for pilot threat intel.':'No EVE characters were identified from that paste.'}</td></tr>`}</tbody>
            </table>
          </div>
        </section>

        <section class="threat-source-note">
          <strong>JLR THREAT ENGINE</strong>
          <span>Identity, corporation, alliance, age and security come from public ESI. PvP behavior comes from zKillboard's public GET stats API and is cached in our local PvP database for 6 hours. CREATE INTEL LINK publishes the pasted Local or D-scan to JLR and copies the JLR-hosted share URL.</span>
        </section>`:''}
      </div>`;

    const input=$('threatScanInput');
    input?.addEventListener('input',()=>{
      threatShareError='';
      threatScanText=input.value;
      const clearButton=$('threatClearScan');
      if(clearButton)clearButton.disabled=!input.value.trim();
    });
    input?.addEventListener('keydown',event=>{
      if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();runThreatScan(input.value)}
    });
    $('threatIgnorePositive')?.addEventListener('change',event=>{
      threatIgnorePositive=Boolean(event.target.checked);
      localStorage.setItem('jlrThreatIgnorePositive',String(threatIgnorePositive));
      threatScanData=null;
      threatScanError='Filters changed. Run the scan again.';
      renderThreatScan();
    });
    $('threatIgnoreOwn')?.addEventListener('change',event=>{
      threatIgnoreOwn=Boolean(event.target.checked);
      localStorage.setItem('jlrThreatIgnoreOwn',String(threatIgnoreOwn));
      threatScanData=null;
      threatScanError='Filters changed. Run the scan again.';
      renderThreatScan();
    });
    $('threatUpdateAccess')?.addEventListener('click',()=>{location.href='/auth/eve/start?intent=link'});
    $('threatClearScan')?.addEventListener('click',()=>{
      threatScanText='';
      threatScanData=null;
      threatScanError='';
      threatShareError='';
      renderThreatScan();
    });
    $('threatEditShare')?.addEventListener('click',async()=>{
      threatShareEditOpen=!threatShareEditOpen;
      threatShareEditError='';
      renderThreatScan();
      if(threatShareEditOpen&&!threatShareRecord)await loadThreatShareEditor();
    });
    $('threatNewShare')?.addEventListener('click',()=>{
      threatShareUrl='';
      threatShareRecord=null;
      threatShareEditOpen=false;
      threatShareEditError='';
      localStorage.removeItem('jlrThreatShareUrl');
      renderThreatScan();
    });
    $('threatSaveShareEdit')?.addEventListener('click',()=>saveThreatShareEditor());
    $('threatRunScan')?.addEventListener('click',()=>runThreatScan(input?.value||''));
    $('threatShareScan')?.addEventListener('click',()=>shareThreatScan(input?.value||''));
    $('threatPasteScan')?.addEventListener('click',async()=>{
      try{
        if(!navigator.clipboard?.readText)throw new Error('Clipboard access is unavailable in this browser. Paste into the box instead.');
        const text=await navigator.clipboard.readText();
        threatShareError='';
        threatScanText=text;
        await runThreatScan(text);
      }catch(error){
        threatScanError=String(error?.message||error);
        renderThreatScan();
        setTimeout(()=>$('threatScanInput')?.focus(),0);
      }
    });
  }
  function threatShareToken(){
    try{return new URL(threatShareUrl,location.origin).pathname.split('/').filter(Boolean).at(-1)||''}
    catch{return''}
  }
  function threatShareReconRows(text){
    return String(text||'').replace(/\r/g,'').split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{
      const match=line.match(/^(.*?)(?:\s+[x×*]\s*(\d+)|\s+(\d+))$/i);
      const name=String(match?.[1]||line).trim();
      const count=Math.max(1,Math.min(9999,Number(match?.[2]||match?.[3]||1)));
      return{name,count};
    }).filter(row=>row.name).slice(0,24);
  }
  async function loadThreatShareEditor(){
    const token=threatShareToken();
    if(!token)return;
    threatShareEditLoading=true;
    threatShareEditError='';
    renderThreatScan();
    try{
      const result=await api('/api/dscan-share/'+encodeURIComponent(token));
      if(!result?.share?.canEdit)throw new Error('This share is not editable by the current JLR account.');
      threatShareRecord=result.share;
    }catch(error){
      threatShareEditError=String(error?.message||error||'Could not load the shared link.');
    }finally{
      threatShareEditLoading=false;
      renderThreatScan();
    }
  }
  async function saveThreatShareEditor(){
    const token=threatShareToken();
    if(!token||threatShareSaving)return;
    const draft={
      system:$('threatShareSystem')?.value||'',
      dscanText:$('threatShareDscan')?.value||'',
      localText:$('threatShareLocal')?.value||'',
      manualRecons:threatShareReconRows($('threatShareRecon')?.value||''),
    };
    threatShareSaving=true;
    threatShareEditError='';
    try{
      const result=await api('/api/dscan-share/'+encodeURIComponent(token)+'/update',{
        method:'POST',
        body:JSON.stringify(draft),
      });
      threatShareRecord=result?.share||threatShareRecord;
      toast('Shared intel updated on the same JLR link.');
    }catch(error){
      threatShareEditError=String(error?.message||error||'Could not update the shared link.');
    }finally{
      threatShareSaving=false;
      renderThreatScan();
    }
  }
  async function copyThreatShareUrl(){
    if(!threatShareUrl)return false;
    let copied=false;
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(threatShareUrl);
        copied=true;
      }
    }catch{}
    if(!copied){
      try{
        const helper=document.createElement('textarea');
        helper.value=threatShareUrl;
        helper.setAttribute('readonly','');
        helper.setAttribute('aria-hidden','true');
        helper.style.position='fixed';
        helper.style.left='-9999px';
        helper.style.opacity='0';
        document.body.appendChild(helper);
        helper.focus();
        helper.select();
        copied=document.execCommand('copy');
        helper.remove();
      }catch{}
    }
    if(copied){
      toast('JLR share link copied. Paste it into your intel channel.');
      return true;
    }
    toast('JLR share link is ready below. Click COPY INTEL LINK or select the link to copy.');
    return false;
  }
  async function shareThreatScan(text){
    const value=String(text||'').trim();
    threatScanText=String(text||'');
    if(threatShareUrl){await copyThreatShareUrl();return}
    if(value.length<2){
      threatShareError='Paste a D-scan, Local list, or fleet scan first.';
      renderThreatScan();
      return;
    }
    if(threatShareLoading)return;
    threatShareLoading=true;
    threatShareError='';
    renderThreatScan();
    try{
      const result=await api('/api/threat-share',{method:'POST',body:JSON.stringify({text:value})});
      threatShareUrl=String(result?.url||'');
      if(!threatShareUrl)throw new Error('JLR did not return a shared scan link.');
      threatShareRecord=result?.share||null;
      localStorage.setItem('jlrThreatShareUrl',threatShareUrl);
      renderThreatScan();
      await copyThreatShareUrl();
    }catch(error){
      threatShareError=String(error?.message||error||'Could not create the intel link.');
    }finally{
      threatShareLoading=false;
      renderThreatScan();
    }
  }
  async function runThreatScan(text,backgroundPoll=false,requestSeq=null){
    const value=String(text||'').trim();
    if(!backgroundPoll)requestSeq=++threatScanRequestSeq;
    if(requestSeq!==threatScanRequestSeq)return;
    threatScanText=String(text||'');
    if(value.length<2){
      threatScanError='Paste at least one pilot name or D-scan row.';
      renderThreatScan();
      return;
    }
    if(threatScanLoading)return;
    if(!backgroundPoll){
      threatScanPollCount=0;
      if(threatScanPoll){clearTimeout(threatScanPoll);threatScanPoll=null}
      threatScanLoading=true;
      threatScanError='';
      renderThreatScan();
    }
    let shouldPoll=false;
    let renderNeeded=!backgroundPoll;
    try{
      const contactsAvailable=Boolean(me?.characters?.some(character=>character.contactsAccess));
      const result=await api('/api/threat-scan',{method:'POST',body:JSON.stringify({
        text:value,
        ignoreOwn:threatIgnoreOwn,
        ignorePositive:threatIgnorePositive&&contactsAvailable,
      })});
      if(requestSeq!==threatScanRequestSeq)return;
      const previousSignature=threatScanRenderSignature(threatScanData);
      const nextSignature=threatScanRenderSignature(result);
      threatScanData=result;
      shouldPoll=Boolean(threatScanData?.refreshing);
      renderNeeded=renderNeeded||previousSignature!==nextSignature;
    }catch(error){
      if(!backgroundPoll){
        threatScanError=String(error?.message||error||'Threat scan failed.');
        renderNeeded=true;
      }
    }finally{
      if(!backgroundPoll)threatScanLoading=false;
      if(renderNeeded)renderThreatScan();
      if(shouldPoll&&threatScanPollCount<60){
        threatScanPollCount++;
        const delay=threatScanPollCount<=8?700:threatScanPollCount<=20?1400:threatScanPollCount<=40?2500:4000;
        threatScanPoll=setTimeout(()=>runThreatScan(value,true,requestSeq),delay);
      }
    }
  }


  function merPct(value){return `${(Number(value||0)*100).toFixed(1)}%`}
  function merRank(row){return row&&row.rank?`#${row.rank} / ${row.of}`:'—'}
  function renderMerIntel(){
    const host=$('merIntelPanel');
    if(!host)return;
    if(merIntelError){
      host.innerHTML=`<section class="glass mer-error"><strong>MER INTEL UNAVAILABLE</strong><span>${esc(merIntelError)}</span></section>`;
      return;
    }
    if(!merIntel){
      host.innerHTML='<section class="glass mer-loading">Loading Fountain + INIT MER data…</section>';
      return;
    }
    const m=merIntel;
    const econ=m.fountain?.economic||{};
    const mining=Object.values(m.fountain?.mining||{});
    const init=m.init?.fountain||{};
    const global=m.init?.global||{};
    const hotspots=(m.init?.fountainHotspots||[]).slice(0,8);
    const econCards=[
      econ.mined_value,econ.produced_value,econ.trade_value,econ.npc_bounties,econ.destroyed_value,econ.loyalty_points
    ].filter(Boolean).map(row=>`
      <article class="mer-kpi">
        <span>${esc(row.label)}</span>
        <strong>${fmt(row.value)}</strong>
        <small>${merRank(row)} among MER regions / locations</small>
      </article>`).join('');
    const miningRows=mining.map(row=>`
      <div class="mer-mining-row">
        <div><span>${esc(row.label)} mined</span><strong>${fmt(row.minedM3,'m3')} m³</strong></div>
        <div><span>Regional rank</span><strong>${merRank(row)}</strong></div>
        <div><span>Waste</span><strong>${merPct(row.wasteRate)}</strong></div>
      </div>`).join('');
    const hotspotRows=hotspots.map((row,index)=>`
      <tr>
        <td><strong>${index+1}</strong></td>
        <td><strong>${esc(row.system)}</strong></td>
        <td>${fmt(row.initKillRecords)}</td>
        <td>${fmt(row.initLossRecords)}</td>
        <td>${fmt(row.ccpDestroyed)} ISK</td>
      </tr>`).join('');
    host.innerHTML=`
      <div class="mer-shell">
        <section class="glass mer-hero">
          <div>
            <span class="mer-eyebrow">MONTHLY ECONOMIC REPORT • ${esc(m.reportLabel||m.period)}</span>
            <h2>FOUNTAIN + INIT INTEL</h2>
            <p>Only the MER data that directly describes Fountain or identifies The Initiative. in the kill dump.</p>
          </div>
          <div class="mer-badges">
            <span>FOUNTAIN</span>
            <span>INIT. • ${esc(String(m.alliance?.allianceId||''))}</span>
          </div>
        </section>

        <section class="glass mer-section">
          <div class="mer-section-head"><strong>FOUNTAIN ECONOMY</strong><span>regional August totals</span></div>
          <div class="mer-kpi-grid">${econCards}</div>
        </section>

        <div class="mer-two-col">
          <section class="glass mer-section">
            <div class="mer-section-head"><strong>FOUNTAIN MINING</strong><span>volume + waste + regional rank</span></div>
            <div class="mer-mining-list">${miningRows}</div>
            <div class="mer-moon-strip">
              <div><span>METENOX MOON MATERIALS</span><strong>${fmt(m.fountain?.moonMaterials?.metenoxMining)}</strong><small>MER quantity</small></div>
              <div><span>REFINERY MOON MATERIALS</span><strong>${fmt(m.fountain?.moonMaterials?.refineryMining)}</strong><small>MER quantity</small></div>
            </div>
          </section>

          <section class="glass mer-section">
            <div class="mer-section-head"><strong>INIT COMBAT • FOUNTAIN</strong><span>MER kill-dump slice</span></div>
            <div class="mer-combat-grid">
              <article><span>KILL RECORDS</span><strong>${fmt(init.killRecords)}</strong><small>${merPct(init.shareOfInitKillRecords)} of INIT kill records</small></article>
              <article><span>LOSS RECORDS</span><strong>${fmt(init.lossRecords)}</strong><small>${merPct(init.shareOfInitLossRecords)} of INIT loss records</small></article>
              <article><span>CCP VALUE DESTROYED</span><strong>${fmt(init.ccpDestroyed)}</strong><small>Fountain</small></article>
              <article><span>CCP VALUE LOST</span><strong>${fmt(init.ccpLost)}</strong><small>Fountain</small></article>
              <article><span>VALUE EFFICIENCY</span><strong>${merPct(init.ccpEfficiency)}</strong><small>destroyed / (destroyed + lost)</small></article>
              <article><span>FOUNTAIN PRESENCE</span><strong>${merPct(init.shareOfFountainKillRecordsAsKiller)}</strong><small>of Fountain records list INIT as killer</small></article>
            </div>
            <div class="mer-global-line">
              <span>INIT ALL-NEW-EDEN AUGUST</span>
              <strong>${fmt(global.killRecords)} kill records • ${fmt(global.lossRecords)} losses • ${fmt(global.ccpDestroyed)} destroyed • ${fmt(global.ccpLost)} lost</strong>
            </div>
          </section>
        </div>

        <section class="glass mer-section">
          <div class="mer-section-head"><strong>INIT • FOUNTAIN HOTSPOTS</strong><span>systems with the most INIT-involved MER records</span></div>
          <div class="mer-table-wrap">
            <table class="mer-table">
              <thead><tr><th>#</th><th>SYSTEM</th><th>INIT KILL REC.</th><th>INIT LOSS REC.</th><th>CCP VALUE DESTROYED</th></tr></thead>
              <tbody>${hotspotRows}</tbody>
            </table>
          </div>
        </section>

        <section class="mer-scope-note">
          <strong>WHAT THIS TAB MEANS</strong>
          <span>Fountain economy/mining totals are regional and are not attributed to INIT by the MER. INIT-specific numbers here come from alliance ID ${esc(String(m.alliance?.allianceId||''))} in the MER kill dump. A kill row contains one killer alliance, not every participant.</span>
          <small>Source: ${esc(m.source||'EVE Online Monthly Economic Report')}</small>
        </section>
      </div>`;
  }
  async function loadMerIntel(){
    merIntelError='';
    try{
      const response=await fetch('/mer-fountain-init.json',{cache:'no-cache'});
      if(!response.ok)throw new Error(`MER data request failed (${response.status})`);
      merIntel=await response.json();
    }catch(error){
      merIntel=null;
      merIntelError=String(error?.message||error||'MER data could not be loaded.');
    }
    renderMerIntel();
  }

  function updateUiScale(){
    const app=$('app');
    if(!app||app.classList.contains('hidden'))return;
    const viewport=Math.max(320,document.documentElement.clientWidth||window.innerWidth||320);
    if(viewport<1700){
      app.style.zoom='1';
      return;
    }
    const expanded=app.classList.contains('expanded');
    const designWidth=expanded?1600:1120;
    const maxScale=expanded?1.6:1.55;
    const targetWidth=viewport*.90;
    const scale=Math.max(1,Math.min(maxScale,targetWidth/designWidth));
    app.style.zoom=String(Math.round(scale*1000)/1000);
  }
  function applyMode(mode){
    $('app').classList.toggle('compact',mode==='compact');
    $('app').classList.toggle('expanded',mode==='expanded');
    $('compactMode').classList.toggle('active',mode==='compact');
    $('expandedMode').classList.toggle('active',mode==='expanded');
    localStorage.setItem('jlrMode',mode);
    requestAnimationFrame(updateUiScale);
  }

  function fleetStats(){
    const data=calcData(),engine=window.JLRYieldMath,chars=me?.characters||[];
    const uptime=Math.min(100,Math.max(1,Number(fleetSettings.uptime)||100))/100;
    if(!data||!engine)return{count:0,total:0,average:0,entries:[]};
    const booster=calcCharacter(calcSettings.boosterCharacterId);
    const boosterFit=calcFitting(booster,calcSettings.boosterFittingId);
    const activeBooster=boosterInFleet();
    const entries=[];
    for(const character of chars){
      const id=String(character.characterId),cfg=fleetSettings.members?.[id]||{};
      if(!cfg.enabled||id===String(calcSettings.boosterCharacterId||''))continue;
      const fits=miningFits(character);
      const fit=fits.find(x=>String(x.fittingId)===String(cfg.fittingId))||defaultFleetFit(fits);
      if(!fit){entries.push({character,fit:null,error:'No mining fit'});continue}
      if(isGasFit(fit)){entries.push({character,fit,error:'Gas fit — output is calculated on the Gas tab',gas:true});continue}
      try{
        const result=engine.calculate({
          data,
          minerSkills:character.skills||{},
          minerFit:fit,
          crystalKey:'Auto',
          boosterSkills:activeBooster?(booster?.skills||{}):{},
          boosterFit:activeBooster?boosterFit:null,
          mindlink:activeBooster&&Boolean(calcSettings.mindlink),
        });
        entries.push({character,fit,result,rawM3:result.m3PerHour,effectiveM3:result.m3PerHour*uptime});
      }catch(error){entries.push({character,fit,error:String(error.message||error)})}
    }
    const valid=entries.filter(x=>x.result);
    const total=valid.reduce((sum,x)=>sum+x.effectiveM3,0);
    const average=valid.length?total/valid.length:0;
    return{count:valid.length,total,average,entries};
  }
  function perShip(){return fleetStats().average}
  function fleetM3(){return fleetStats().total}
  function projectedISK(ore){return fleetM3()*Number(ore.jbvPerM3)*(Number(fleetSettings.payout)/100)}
  function actualValue(raw){return Number(raw||0)*(Number(fleetSettings.payout)/100)}
  function saveFleet(){
    localStorage.setItem('jlrFleet',JSON.stringify(fleetSettings));
    renderAll();
    if(me)void refreshFleetPerformanceSnapshot(false).then(()=>{if(activeTab==='performance')renderFleetPerformance()});
  }
  function saveCalc(){
    localStorage.setItem('jlrMiningCalc',JSON.stringify(calcSettings));
    if(state){renderFleet();renderTop();renderIceMining();renderGasHuffing()}
    renderCalculator();
  }
  function calcData(){return state?.source?.yieldCalculator||null}
  function skillLabel(character,id){const s=character?.skills?.[String(id)];return s?`${s.name} ${s.level}`:'Not synced'}
  function skillLabelKey(character,key){const id=calcData()?.skillIds?.[key];return id?skillLabel(character,id):'Not synced'}
  function calcCharacter(id){return me?.characters?.find(c=>String(c.characterId)===String(id))||null}
  function calcFitting(character,id){return character?.fittings?.find(f=>String(f.fittingId)===String(id))||null}
  function fitSortAscending(a,b){
    const options={numeric:true,sensitivity:'base'};
    return String(a?.shipName||'').localeCompare(String(b?.shipName||''),undefined,options)
      ||String(a?.name||'').localeCompare(String(b?.name||''),undefined,options)
      ||String(a?.fittingId||'').localeCompare(String(b?.fittingId||''),undefined,options);
  }
  const GAS_MODULES={
    'Gas Cloud Scoop I':{family:'SCOOP',duration:30,yieldM3:10,residueChance:0,residueMultiplier:0},
    'Gas Cloud Scoop II':{family:'SCOOP',duration:40,yieldM3:20,residueChance:.34,residueMultiplier:1},
    "'Crop' Gas Cloud Scoop":{family:'SCOOP',duration:40,yieldM3:20,residueChance:1,residueMultiplier:2},
    "'Plow' Gas Cloud Scoop":{family:'SCOOP',duration:40,yieldM3:20,residueChance:1,residueMultiplier:4},
    'Syndicate Gas Cloud Scoop':{family:'SCOOP',duration:30,yieldM3:20,residueChance:0,residueMultiplier:0},
    'Gas Cloud Harvester I':{family:'HARVESTER',duration:100,yieldM3:50,residueChance:0,residueMultiplier:0},
    'Gas Cloud Harvester II':{family:'HARVESTER',duration:80,yieldM3:100,residueChance:.34,residueMultiplier:1},
    'ORE Gas Cloud Harvester':{family:'HARVESTER',duration:80,yieldM3:100,residueChance:0,residueMultiplier:0},
  };
  const GAS_SHIP_BONUSES={
    Venture:{miningFrigate:0.05,roleYield:1},
    Prospect:{miningFrigate:0.05,roleYield:1},
    'Venture Consortium Issue':{miningFrigate:0.05,roleYield:1},
    Endurance:{},
    Covetor:{barge:0.03,roleDuration:0.30},
    Retriever:{barge:0.02,roleDuration:0.125},
    Procurer:{barge:0.02},
    Hulk:{barge:0.03,exhumers:0.03,roleDuration:0.30},
    Mackinaw:{barge:0.03,exhumers:0.03,roleDuration:0.125},
    Skiff:{},
  };
  function gasModulesInFit(fit){
    return (Array.isArray(fit?.items)?fit.items:[]).filter(row=>Object.prototype.hasOwnProperty.call(GAS_MODULES,String(row.name||'')));
  }
  function isGasFit(fit){return gasModulesInFit(fit).length>0}
  function isOreFit(fit){return Boolean(calcData()?.ships?.[fit?.shipName])&&!isGasFit(fit)}
  function miningFits(character){
    const data=calcData();
    return(character?.fittings||[])
      .filter(f=>Boolean(data?.ships?.[f.shipName])||isGasFit(f))
      .sort(fitSortAscending);
  }
  function defaultFleetFit(fits){return fits.find(isOreFit)||fits[0]||null}
  function abyssalFitBadge(fit){
    if(fit?.abyssalMatch==='matched'){
      if(fit?.abyssalVerification==='pending')return' • A01 WAIT ESI';
      if(String(fit.abyssalMatchMethod||'').startsWith('persistent'))return' • ABYSSAL BOUND';
      if(fit.abyssalMatchMethod==='saved-fit-cache')return' • ABYSSAL SAVED';
      return fit.abyssalMatchMethod==='ship-name'?' • ABYSSAL EXACT':' • ABYSSAL MATCHED';
    }
    if(fit?.abyssalErrorCode==='A01'||(fit?.abyssalVerification==='unresolved'&&fit?.abyssalRetryAfter&&Date.parse(fit.abyssalRetryAfter)>Date.now()))return' • A01 WAIT ESI';
    if(fit?.abyssalErrorCode==='A02'||fit?.abyssalMatch==='ambiguous')return' • A02 MULTI MATCH';
    if(fit?.abyssalErrorCode==='A03'||fit?.abyssalMatch==='missing'||fit?.abyssalVerification==='invalid')return' • A03 NO MATCH';
    return'';
  }
  function compactAbyssalError(message,fit){
    const text=String(message||'');
    const code=String(fit?.abyssalErrorCode||text.match(/\[(A0\d)\]/)?.[1]||'');
    if(code==='A01')return{main:'A01 • WAIT ESI',sub:'next ESI asset check',detail:text};
    if(code==='A02')return{main:'A02 • MULTI MATCH',sub:'multiple physical ships',detail:text};
    if(code==='A03')return{main:'A03 • NO MATCH',sub:'saved Abyssals not verified',detail:text};
    return{main:text||'NO SUPPORTED FIT',sub:'check saved fit / EVE sync',detail:text};
  }
  function groupedFitOptions(fits,selectedId){
    if(!fits.length)return'<option value="">No supported saved mining or gas fit</option>';
    const groups=new Map();
    for(const fit of fits){
      const hull=String(fit.shipName||'Other');
      if(!groups.has(hull))groups.set(hull,[]);
      groups.get(hull).push(fit);
    }
    return[...groups].map(([hull,rows])=>`<optgroup label="${esc(hull)}">${rows.map(f=>`<option value="${esc(f.fittingId)}" ${String(f.fittingId)===String(selectedId)?'selected':''}>${isGasFit(f)?'[GAS] ':''}${esc(f.shipName)} — ${esc(f.name)}${esc(abyssalFitBadge(f))}</option>`).join('')}</optgroup>`).join('');
  }
  function boosterFits(character){return(character?.fittings||[]).filter(f=>['Porpoise','Orca','Rorqual','Outrider'].includes(f.shipName))}
  function boosterInFleet(){
    const id=String(calcSettings.boosterCharacterId||'');
    return Boolean(id&&fleetSettings.members?.[id]?.enabled);
  }


  const ICE_HARVESTERS={
    'Ice Harvester I':240,
    'Ice Harvester II':200,
    'ORE Ice Harvester':200,
  };
  const ICE_UPGRADES={
    'Ice Harvester Upgrade I':0.05,
    'Frigoris Restrained Ice Harvester Upgrade':0.08,
    'Ice Harvester Upgrade II':0.09,
    "'Anguis' Ice Harvester Upgrade":0.09,
    "'Ingenii' Ice Harvester Upgrade":0.10,
  };
  const ICE_SHIP_BONUSES={
    Covetor:{barge:0.03,exhumers:0,role:0.30},
    Retriever:{barge:0.02,exhumers:0,role:0.125},
    Procurer:{barge:0.02,exhumers:0,role:0},
    Hulk:{barge:0.03,exhumers:0.04,role:0.30},
    Mackinaw:{barge:0.04,exhumers:0,role:0.125},
    Skiff:{barge:0.04,exhumers:0,role:0},
  };
  function skillLevel(character,id){return Number(character?.skills?.[String(id)]?.level||0)}
  function gasFitStats(character,fit){
    if(!character||!fit||!isGasFit(fit))return null;
    const ship=GAS_SHIP_BONUSES[fit.shipName]||{};
    const gasRows=gasModulesInFit(fit);
    if(!Object.prototype.hasOwnProperty.call(character.skills||{},'25544'))return{character,fit,error:'Use Sync EVE Data to load the Gas Cloud Harvesting skill'};

    const miningFrigate=skillLevel(character,32918);
    const gasSkill=skillLevel(character,25544);
    const barge=skillLevel(character,17940);
    const exhumers=skillLevel(character,22551);
    if(ship.miningFrigate&&!Object.prototype.hasOwnProperty.call(character.skills||{},'32918')){
      return{character,fit,error:'Use Sync EVE Data to load the Mining Frigate skill'};
    }

    const booster=calcCharacter(calcSettings.boosterCharacterId);
    const boosterFit=calcFitting(booster,calcSettings.boosterFittingId);
    const activeBooster=boosterInFleet();
    const boost=window.JLRYieldMath?.boostBreakdown(
      calcData(),
      activeBooster?(booster?.skills||{}):{},
      activeBooster?boosterFit:null,
      activeBooster&&Boolean(calcSettings.mindlink),
    )||{cycleReduction:0,rangeBonus:0,ship:'None'};

    const durationMultiplier=
      Math.max(.05,1-Number(ship.miningFrigate||0)*miningFrigate)*
      Math.max(.05,1-Number(ship.barge||0)*barge)*
      Math.max(.05,1-Number(ship.exhumers||0)*exhumers)*
      Math.max(.05,1-Number(ship.roleDuration||0))*
      Math.max(.05,1-Number(boost.cycleReduction||0));
    const yieldMultiplier=1+Number(ship.roleYield||0);

    let m3PerHour=0,moduleCount=0,activationsPerHour=0;
    const modules=[];
    for(const row of gasRows){
      const name=String(row.name||''),q=Math.max(1,Number(row.quantity||1)),spec=GAS_MODULES[name];
      const duration=Number(spec.duration)*durationMultiplier;
      const yieldM3=Number(spec.yieldM3)*yieldMultiplier;
      const perModuleM3Hr=duration>0?yieldM3*(3600/duration):0;
      moduleCount+=q;
      activationsPerHour+=duration>0?(3600/duration)*q:0;
      m3PerHour+=perModuleM3Hr*q;
      modules.push({
        name,quantity:q,family:spec.family,duration,yieldM3,
        residueChance:Number(spec.residueChance||0),
        residueMultiplier:Number(spec.residueMultiplier||0),
        range:1500*(1+Number(boost.rangeBonus||0)),
      });
    }
    const cycle=activationsPerHour>0?moduleCount*3600/activationsPerHour:0;
    const gasVolume=Math.max(.001,Number(state?.source?.gas?.volume)||10);
    const unitsPerHour=m3PerHour/gasVolume;
    const residue=modules.map(row=>row.residueChance>0?`${Math.round(row.residueChance*100)}% ×${row.residueMultiplier}`:'NONE');
    const residueSummary=[...new Set(residue)].join(' / ');
    return{
      character,fit,ship:fit.shipName,modules,moduleCount,cycle,m3PerHour,unitsPerHour,gasSkill,miningFrigate,barge,exhumers,boost,
      range:Math.max(0,...modules.map(row=>Number(row.range)||0)),
      residueSummary,
    };
  }
  function selectedFleetFit(character){
    const cfg=fleetSettings.members?.[String(character?.characterId)]||{};
    const fits=miningFits(character);
    return fits.find(f=>String(f.fittingId)===String(cfg.fittingId))||defaultFleetFit(fits);
  }
  function iceFitStats(character,fit){
    if(!character||!fit)return null;
    const ship=ICE_SHIP_BONUSES[fit.shipName];
    if(!ship)return null;
    const items=Array.isArray(fit.items)?fit.items:[];
    const harvesters=items.filter(row=>Object.prototype.hasOwnProperty.call(ICE_HARVESTERS,String(row.name||'')));
    if(!harvesters.length)return null;
    if(!Object.prototype.hasOwnProperty.call(character.skills||{},'16281'))return{character,fit,error:'Use Sync EVE Data to load the Ice Harvesting skill'};

    const iceSkill=skillLevel(character,16281);
    const barge=skillLevel(character,17940);
    const exhumers=skillLevel(character,22551);
    let upgradeReduction=0,rigReduction=0;
    for(const row of items){
      const name=String(row.name||''),q=Math.max(1,Number(row.quantity||1));
      if(Object.prototype.hasOwnProperty.call(ICE_UPGRADES,name))upgradeReduction+=Number(ICE_UPGRADES[name])*q;
      if(name==='Medium Ice Harvester Accelerator I')rigReduction+=0.12*q;
    }

    const booster=calcCharacter(calcSettings.boosterCharacterId);
    const boosterFit=calcFitting(booster,calcSettings.boosterFittingId);
    const activeBooster=boosterInFleet();
    const boost=window.JLRYieldMath?.boostBreakdown(
      calcData(),
      activeBooster?(booster?.skills||{}):{},
      activeBooster?boosterFit:null,
      activeBooster&&Boolean(calcSettings.mindlink),
    )||{cycleReduction:0,ship:'None'};

    const common=
      Math.max(.05,1-.05*iceSkill)*
      Math.max(.05,1-ship.barge*barge)*
      Math.max(.05,1-ship.exhumers*exhumers)*
      Math.max(.05,1-ship.role)*
      Math.max(.05,1-upgradeReduction)*
      Math.max(.05,1-rigReduction)*
      Math.max(.05,1-Number(boost.cycleReduction||0));

    let blocksPerHour=0,harvesterCount=0;
    const modules=[];
    for(const row of harvesters){
      const name=String(row.name||''),q=Math.max(1,Number(row.quantity||1));
      const duration=Number(ICE_HARVESTERS[name])*common;
      harvesterCount+=q;
      blocksPerHour+=(3600/duration)*q;
      modules.push({name,quantity:q,duration});
    }
    const cycle=blocksPerHour>0?harvesterCount*3600/blocksPerHour:0;
    return{character,fit,ship:fit.shipName,modules,harvesterCount,cycle,blocksPerHour,m3PerHour:blocksPerHour*1000,iceSkill,barge,exhumers,upgradeReduction,rigReduction,boost};
  }
  function iceClass(name){
    if(name==='Blue Ice IV-Grade')return'blue';
    if(name==='Glare Crust')return'glare';
    if(name==='Dark Glitter')return'dark';
    if(name==='Gelidus')return'gelidus';
    if(name==='Krystallos')return'krystallos';
    return'other';
  }

  function definitions(){return [...(state?.source?.systems||[])].sort((a,b)=>a.rank-b.rank||a.order-b.order||a.system.localeCompare(b.system))}
  function mapFields(){return Array.isArray(state?.source?.mapFields)?state.source.mapFields:[]}
  function mapFieldForT3(d){return mapFields().find(row=>Number(row.tier)===3&&String(row.system)===String(d?.system)&&String(row.ore)===String(d?.ore))||null}
  function boardKey(kind,system){return `${kind}:${system}`}
  function saveBoardPrefs(){localStorage.setItem('jlrFieldBoard',JSON.stringify(boardPrefs))}
  function favoriteBoardKeys(){return new Set(boardPrefs.favorites)}
  function isBoardFavorite(kind,system){return favoriteBoardKeys().has(boardKey(kind,system))}
  function boardEntries(){
    const entries=[];
    const liveT3=new Set();
    for(const d of definitions()){
      entries.push({kind:'t3',key:boardKey('t3',d.system),system:d.system,d,f:field(d.system)});
      liveT3.add(String(d.system)+'|'+String(d.ore));
    }
    const mapGroups=new Map();
    for(const row of mapFields()){
      if(Number(row.tier)===3&&liveT3.has(String(row.system)+'|'+String(row.ore)))continue;
      const id=Number(row.tier)===2?'t2|'+row.system:row.id||[row.system,row.mineral,row.tier].join('|');
      if(mapGroups.has(id)){mapGroups.get(id).rows.push(row);continue}
      const grouped={...row,id,rows:[row]};
      mapGroups.set(id,grouped);
      entries.push({kind:'map',key:boardKey('map',id),system:row.system,row:grouped});
    }
    for(const row of Array.isArray(state?.source?.iceFields)?state.source.iceFields:[])entries.push({kind:'ice',key:boardKey('ice',row.system),system:row.system,row});
    for(const row of Array.isArray(state?.source?.a0Fields)?state.source.a0Fields:[])entries.push({kind:'a0',key:boardKey('a0',row.system),system:row.system,row});
    return entries;
  }
  function orderedBoardEntries(){
    const entries=boardEntries(),favorites=favoriteBoardKeys();
    const original=new Map(entries.map((entry,index)=>[entry.key,index]));
    const custom=new Map(boardPrefs.order.map((key,index)=>[normalizeBoardKey(key),index]));
    return entries.sort((a,b)=>{
      const af=favorites.has(a.key),bf=favorites.has(b.key);
      if(af!==bf)return af?-1:1;
      const ai=custom.has(a.key)?custom.get(a.key):100000+(original.get(a.key)||0);
      const bi=custom.has(b.key)?custom.get(b.key):100000+(original.get(b.key)||0);
      return ai-bi;
    });
  }
  function syncBoardControls(){
    const board=$('fieldBoard'),arrange=$('boardArrange'),size=$('boardSize'),hint=$('boardArrangeHint');
    if(board){
      for(const value of BOARD_SIZES)board.classList.toggle(`board-size-${value}`,boardPrefs.size===value);
      board.classList.toggle('arranging',boardArrangeMode);
    }
    if(arrange){
      arrange.classList.toggle('active',boardArrangeMode);
      arrange.setAttribute('aria-pressed',String(boardArrangeMode));
      arrange.textContent=boardArrangeMode?'✓ ARRANGING':'↕ ARRANGE';
    }
    if(size)size.textContent=`BOX SIZE • ${boardPrefs.size==='small'?'S':boardPrefs.size==='large'?'L':'M'}`;
    if(hint)hint.textContent=boardArrangeMode?'Drag any T3, ARRAY, ICE or A0 box to reorder • favorites stay pinned first':'☆ favorite any T3, ARRAY, ICE or A0 box to pin it to the front';
  }
  function toggleBoardFavorite(kind,system){
    const key=boardKey(kind,system),favorites=favoriteBoardKeys();
    if(favorites.has(key))favorites.delete(key);else favorites.add(key);
    boardPrefs.favorites=[...favorites];
    saveBoardPrefs();
    renderBoards();
  }
  function moveBoardItem(sourceKey,targetKey){
    if(!sourceKey||!targetKey||sourceKey===targetKey)return;
    const favorites=favoriteBoardKeys();
    if(favorites.has(sourceKey)!==favorites.has(targetKey))return;
    const ids=orderedBoardEntries().map(entry=>entry.key);
    const from=ids.indexOf(sourceKey),to=ids.indexOf(targetKey);
    if(from<0||to<0)return;
    ids.splice(to,0,ids.splice(from,1)[0]);
    boardPrefs.order=ids;
    saveBoardPrefs();
    renderBoards();
  }
  function cycleBoardSize(){
    const index=BOARD_SIZES.indexOf(boardPrefs.size);
    boardPrefs.size=BOARD_SIZES[(index+1)%BOARD_SIZES.length];
    saveBoardPrefs();syncBoardControls();
  }
  function resetBoardOrder(){
    boardPrefs.order=[];
    saveBoardPrefs();renderBoards();
    toast('Field board order reset. Favorites were kept.');
  }
  function toggleBoardArrange(){
    boardArrangeMode=!boardArrangeMode;
    if(boardArrangeMode){
      filter='all';
      document.querySelectorAll('.filter').forEach(button=>button.classList.toggle('active',button.dataset.filter==='all'));
    }
    renderBoards();
  }
  function field(system){return state?.fields?.[system]||null}
  function def(system){return definitions().find(x=>x.system===system)||null}
  function mapScanReminderLine(row){
    const real=Date.parse(state?.scans?.[row?.system]?.lastScanAt||'');
    const start=Math.max(Number.isFinite(real)?real:0,Date.parse(row?.scanReminderStartedAt||'')||0);
    if(!start)return{text:'NEEDS A SCAN',stale:true,title:'Awaiting a Probe Scanner report'};
    if(row?.needsScan&&(!Number.isFinite(real)||real<Date.parse(row.cycleStartedAt||'')))return{text:'NEEDS A SCAN',stale:true,title:'Respawn timer finished; confirm the new field with a scan'};
    const due=start+12*60*60*1000;
    return{text:Date.now()>=due?'NEEDS A SCAN':'',stale:Date.now()>=due,title:Date.now()>=due?'Probe Scanner update requested':'Scan reminder current'};
  }
  function boardScanLine(system,scanOverride=null,useMapReminder=true){
    const row=scanOverride||state?.scans?.[system]||null;
    const at=row?.lastScanAt||null;
    const ms=Date.parse(at||'');
    const reminder=mapFields().find(row=>Number(row.tier)===3&&row.system===system&&row.scanReminderStartedAt);
    if(useMapReminder&&reminder&&(!Number.isFinite(ms)||Date.parse(reminder.scanReminderStartedAt)>ms))return mapScanReminderLine(reminder);
    if(!Number.isFinite(ms)){
      return{text:'NEEDS A SCAN',stale:true,title:'No Probe Scanner update recorded yet'};
    }
    const stale=row?.due||Date.now()-ms>=12*60*60*1000;
    const age=ago(at).toUpperCase();
    return{
      text:stale?'NEEDS A SCAN':'',
      stale,
      title:stale?`Last Probe Scanner update ${ago(at)}; update requested after 12 hours`:`Last Probe Scanner update ${ago(at)}`,
    };
  }

  function boardEvidenceLine(system){
    const ledger=state?.scans?.[system]?.ledger||null;
    if(!ledger)return null;
    const pct=Number(ledger.depletionPct);
    const pctKnown=Number.isFinite(pct);
    const mined=Math.max(0,Number(ledger.minedM3SinceSite)||0);
    const site=Math.max(0,Number(ledger.siteM3)||0);
    const verified=ledger.baselineDetected&&ledger.baselineAt&&ledger.verifiedFromScanAt===ledger.baselineAt;
    const confirmedMined=verified?Math.max(0,Number(ledger.verifiedM3SinceScan)||0):0;
    const fieldState=state?.fields?.[system];
    if(fieldState?.status==='cleared'&&fieldState.autoClearReason==='esi-ledger-cap'){
      const verified=Math.max(0,Number(fieldState.autoClearM3)||0);
      return{
        text:`AUTO RED • ${fmt(verified,'m3')} / ${fmt(site,'m3')} m³`,
        tone:'danger',
        title:`Linked ESI ledgers reported ${Math.round(verified).toLocaleString()} m³ after a Probe Scanner report confirmed this T3 site. Reaching the estimated ${Math.round(site).toLocaleString()} m³ field cap started the 10-hour timer. A new scan showing the deposit is still present can correct it.`,
      };
    }
    const minedText=site>0&&verified
      ?`${fmt(confirmedMined,'m3')} / ${fmt(site,'m3')} m³ VERIFIED`
      :mined>0?`ESI TODAY • ${fmt(mined,'m3')} m³`:null;

    if(ledger.likelyDepleted&&pctKnown){
      return{
        text:`${minedText||'LEDGER • '+Math.round(pct)+'% REPORTED MINED'} • SCAN NOW`,
        tone:'danger',
        title:`ESI reports ${Math.round(mined).toLocaleString()} m³ in this system, but only ${Math.round(confirmedMined).toLocaleString()} m³ is verified after the current-site scan. Daily totals can include an earlier site. Automatic RED requires ${Math.round(site).toLocaleString()} m³ verified after a scan confirming this deposit; scan now to check whether it is gone.`,
      };
    }
    if(ledger.needsScan&&pctKnown){
      return{
        text:`${minedText||'LEDGER • '+Math.round(pct)+'% REPORTED MINED'} • SCAN`,
        tone:'warning',
        title:`ESI reports ${Math.round(mined).toLocaleString()} m³ in this system; ${Math.round(confirmedMined).toLocaleString()} m³ is verified after the current-site scan. The estimated site cap is ${Math.round(site).toLocaleString()} m³. Scan recommended.`,
      };
    }
    if(minedText){
      return{
        text:minedText,
        tone:ledger.active?'active':'',
        title:ledger.seeded&&!ledger.active
          ?`Today's linked ESI ledger already contains ${Math.round(mined).toLocaleString()} m³ mined in this system. ESI's daily ledger does not provide the exact mining time, so this confirms today's mining but not that mining is active right now.`
          :`Linked ESI ledgers report ${Math.round(mined).toLocaleString()} m³ in this system. ${Math.round(confirmedMined).toLocaleString()} m³ was verified after a scan confirming this site${site>0?' against a '+Math.round(site).toLocaleString()+' m³ site cap':''}. Last activity ${ago(ledger.lastActivityAt)}.`,
      };
    }
    if(ledger.active){
      return{
        text:minedText||'LEDGER • MINING DETECTED',
        tone:'active',
        title:`ESI mining-ledger activity detected ${ago(ledger.lastActivityAt)}. This confirms mining activity, not field depletion.`,
      };
    }
    if(ledger.lastActivityAt){
      return{
        text:`LEDGER • ${ago(ledger.lastActivityAt).toUpperCase()}`,
        tone:'',
        title:`Last tracked mining-ledger activity ${ago(ledger.lastActivityAt)}.`,
      };
    }
    return null;
  }

  function renderTop(){
    if(!state)return;
    const ores=state.source.ores;
    const targets=definitions().map(d=>({d,f:field(d.system)}))
      .filter(x=>x.f.status!=='cleared')
      .sort((a,b)=>Number(a.f.cherryPicked)-Number(b.f.cherryPicked)||a.d.rank-b.d.rank||a.d.order-b.d.order);
    const target=targets[0]||null;
    const top=target?ores[target.d.rank-1]:ores[0];
    const fleetNow=fleetStats();
    const uptimePct=Math.min(100,Math.max(1,Number(fleetSettings.uptime)||100));
    $('perShipKpi').textContent=fmt(fleetNow.average,'m3');
    $('perShipSub').textContent=fleetNow.count?`${fleetNow.count} selected • avg @ ${uptimePct.toFixed(0)}% uptime • m³/hr`:'No miners selected';
    $('fleetKpi').textContent=fmt(fleetNow.total,'m3');
    $('fleetSub').textContent=fleetNow.count?`${fleetNow.count} miners • ${uptimePct.toFixed(0)}% uptime target • m³/hr`:'Select miners in Fleet';
    if($('fleetUptimeMeter'))$('fleetUptimeMeter').style.width=uptimePct.toFixed(1)+'%';
    const targetDistance=target&&Number.isFinite(Number(target.d.distanceLy))?` • ${Number(target.d.distanceLy).toFixed(2)} LY`:'';

    const payout=Number(fleetSettings.payout)/100;
    const jitaPerM3=Number(top?.market?.jita?.refinedBuyPerM3 ?? top?.market?.jita?.buyPerM3 ?? top?.jbvPerM3);
    const cnPerM3=Number(top?.market?.cn?.refinedBuyPerM3 ?? top?.market?.cn?.buyPerM3);
    const fleetRate=fleetM3();
    const jitaHourly=Number.isFinite(jitaPerM3)?fleetRate*jitaPerM3*payout:null;
    const cnHourly=Number.isFinite(cnPerM3)&&cnPerM3>0?fleetRate*cnPerM3*payout:null;

    $('jitaValueKpi').textContent=jitaHourly===null?'—':`${fmt(jitaHourly)}/hr`;
    $('jitaValueSub').textContent=Number.isFinite(jitaPerM3)?`${jitaPerM3.toFixed(2)} ISK/m³ • ${(payout*100).toFixed(1)}% payout • prices ${ago(state.market?.lastUpdatedAt)}`:'Jita refined-mineral price unavailable';
    $('cnValueKpi').textContent=cnHourly===null?'—':`${fmt(cnHourly)}/hr`;
    $('cnValueSub').textContent=cnHourly===null?'C-N private mineral price unavailable':`${cnPerM3.toFixed(2)} ISK/m³ • ${(payout*100).toFixed(1)}% payout • prices ${ago(state.market?.lastUpdatedAt)}`;

    const ledgerDebug=state.esi?.ledgerDebug||null;
    const appTodayM3=Math.max(0,Number(state.esi.actual.today.m3)||0);
    const appTodayPayout=Math.max(0,actualValue(state.esi.actual.today.jbv));
    $('actualTodayIsk').textContent=fmt(appTodayPayout)+' ISK';
    const payoutPriceBasis='JLR Native • CCP ESI Jita buy';
    const unpricedM3=Math.max(0,Number(state.esi.actual.today.unpricedM3)||0);
    const appCached=Number(ledgerDebug?.cachedCharacters||0);
    const appLinked=Number(ledgerDebug?.linkedCharacters||0);
    const appCoverageBadge=$('appLedgerCoverageBadge');
    const appCoverageRatio=appLinked>0?appCached/appLinked:0;
    const appCoverageHealthy=Boolean(ledgerDebug&&(ledgerDebug.cacheHealthy??appCoverageRatio>=.8));
    if(appCoverageBadge){
      appCoverageBadge.textContent=ledgerDebug?(appCached+'/'+appLinked+' '+(appCoverageHealthy?'HEALTHY':'SYNCING')):'WAITING';
      appCoverageBadge.classList.toggle('partial',Boolean(ledgerDebug&&!appCoverageHealthy));
    }
    const appPayoutCard=$('actualTodayIsk')?.closest('.kpi');
    if(appPayoutCard){
      appPayoutCard.classList.toggle('partial',Boolean(ledgerDebug&&!appCoverageHealthy));
      if(ledgerDebug){
        const debug=[
          'cache '+appCached+'/'+appLinked,
          'today rows '+Number(ledgerDebug.todayRows||0),
          'valid T3 '+Number(ledgerDebug.matchedT3Rows||0),
          'outside tracked fields '+Number(ledgerDebug.outsideTrackedSystemRows||0),
          'unresolved systems '+Number(ledgerDebug.unresolvedSystemRows??ledgerDebug.unmatchedSystemRows??0),
          'non-T3 '+Number(ledgerDebug.unmatchedOreRows||0),
          'needs EVE access '+Number(ledgerDebug.needsAccessCharacters||0),
          'coverage '+Number(ledgerDebug.coveragePercent??appCoverageRatio*100).toFixed(1)+'%',
        ];
        appPayoutCard.title='Combined payout value for all linked JLR characters. '+debug.join(' • ')+(state.esi.lastSyncAt?' • synced '+ago(state.esi.lastSyncAt):'');
      }
    }
    const eveDay=String(ledgerDebug?.day||String(state.serverNow||'').slice(0,10)||'');
    const eveDayMs=Date.parse(eveDay+'T00:00:00Z');
    const previousEveDay=Number.isFinite(eveDayMs)?new Date(eveDayMs-86400000).toISOString().slice(0,10):'';
    const previousEveRow=(state.esi?.performance?.daily||[]).find(row=>String(row?.date||'')===previousEveDay)||null;
    const previousEveM3=Math.max(0,Number(previousEveRow?.m3)||0);
    const previousEvePayout=Math.max(0,actualValue(previousEveRow?.jbv));
    const todayLedgerRows=Math.max(0,Number(ledgerDebug?.todayRows)||0);
    const todayT3Rows=Math.max(0,Number(ledgerDebug?.matchedT3Rows)||0);
    const appTodaySub=$('actualTodayIskSub');
    const newEveDay=unpricedM3<=0&&appTodayM3<=0&&todayT3Rows<=0&&previousEveM3>0;
    appPayoutCard?.classList.toggle('eve-day-reset',newEveDay);
    let appPayoutDetail='';

    if(unpricedM3>0){
      appTodaySub.textContent='EVE day '+eveDay+' UTC • '+fmt(appTodayM3,'m3')+' m³\n'+fmt(unpricedM3,'m3')+' m³ awaiting price';
      appPayoutDetail='EVE day '+eveDay+' UTC • '+fmt(appTodayM3,'m3')+' m³ mined • '+fmt(unpricedM3,'m3')+' m³ awaiting price • '+payoutPriceBasis;
    }else if(newEveDay){
      appTodaySub.textContent='NEW EVE DAY • reset 00:00 UTC\nYesterday '+fmt(previousEveM3,'m3')+' m³ • '+fmt(previousEvePayout)+' ISK';
      appPayoutDetail='Previous EVE day '+previousEveDay+': '+fmt(previousEveM3,'m3')+' m³ • '+fmt(previousEvePayout)+' ISK';
    }else if(appTodayM3<=0&&todayLedgerRows>0&&todayT3Rows<=0){
      appTodaySub.textContent='EVE day '+eveDay+' UTC\n'+todayLedgerRows+' mining rows • 0 T3 ore rows';
      appPayoutDetail='EVE day '+eveDay+' UTC • '+todayLedgerRows+' mining rows seen • 0 T3 ore rows • payout counts T3 ore only';
    }else if(appTodayM3<=0){
      appTodaySub.textContent='EVE day '+eveDay+' UTC\nNo T3 rows • '+(payout*100).toFixed(1)+'% payout';
      appPayoutDetail='EVE day '+eveDay+' UTC • no T3 ledger rows since 00:00 UTC • '+(payout*100).toFixed(1)+'% payout';
    }else{
      appTodaySub.textContent='EVE day '+eveDay+' UTC • '+fmt(appTodayM3,'m3')+' m³\nT3 • '+(payout*100).toFixed(1)+'% payout • '+payoutPriceBasis;
      appPayoutDetail='EVE day '+eveDay+' UTC • '+fmt(appTodayM3,'m3')+' m³ mined • exact T3 grade • '+(payout*100).toFixed(1)+'% payout • '+payoutPriceBasis;
    }
    appTodaySub.title=appPayoutDetail;
    appTodaySub.setAttribute('aria-label',appPayoutDetail);

    const myTotals=myLedgerSummary?.totals||null;
    const myRawValue=Math.max(0,Number(myTotals?.jbv)||0);
    const myM3=Math.max(0,Number(myTotals?.m3)||0);
    const myUnpricedM3=Math.max(0,Number(myTotals?.unpricedM3)||0);
    if($('actualMyTodayIsk'))$('actualMyTodayIsk').textContent=myLedgerSummary?fmt(myRawValue*payout):'—';
    if($('actualMyTodayIskSub')){
      const myCached=Number(myLedgerSummary?.cachedCharacters||0);
      const myLinked=Number(myLedgerSummary?.linkedCharacters||0);
      const myBadge=$('myLedgerCoverageBadge');
      const myCoverageRatio=myLinked>0?myCached/myLinked:0;
      const myCoverageHealthy=Boolean(myLedgerSummary&&myCoverageRatio>=.8);
      if(myBadge){
        myBadge.textContent=myLedgerSummary?(myCached+'/'+myLinked+' '+(myCoverageHealthy?'HEALTHY':'SYNCING')):'LOADING';
        myBadge.classList.toggle('partial',Boolean(myLedgerSummary&&!myCoverageHealthy));
      }
      if($('myLedgerPayoutCard'))$('myLedgerPayoutCard').classList.toggle('partial',Boolean(myLedgerSummary&&!myCoverageHealthy));
      $('actualMyTodayIskSub').textContent=myLedgerSummary
        ?(myUnpricedM3>0
          ?'EVE day UTC • '+fmt(myM3,'m3')+' m³\n'+fmt(myUnpricedM3,'m3')+' m³ awaiting price'
          :'EVE day UTC • '+fmt(myM3,'m3')+' m³\nT3 • '+(payout*100).toFixed(1)+'% payout • click for audit')
        :'Loading your toon ledger…';
    }
    $('actualExpTodayM3').textContent=`${fmt(state.esi.actual.today.m3,'m3')} m³`;
    $('actualExpTodayValue').textContent=`${fmt(actualValue(state.esi.actual.today.jbv))} ISK`;
    $('actualWeekM3').textContent=`${fmt(state.esi.actual.week.m3,'m3')} m³`;
    $('actualWeekValue').textContent=`${fmt(actualValue(state.esi.actual.week.jbv))} ISK`;
    const accessNeeded=(me?.characters||[]).filter(c=>c.needsReauth).length;
    $('esiStatus').textContent=accessNeeded?`${state.esi.linkedCharacters} LINKED • ${accessNeeded} NEED ACCESS`:`${state.esi.linkedCharacters} LINKED • ACCESS CURRENT`;
    $('lastSync').textContent=state.esi.lastSyncAt?`EVE data synced ${ago(state.esi.lastSyncAt)}`:(state.esi.lastError?`Sync error: ${state.esi.lastError}`:'No successful sync yet');
    renderDataStatus();
  }
  function fleetLaserDetails(entry){
    if(!entry?.result)return null;
    const lasers=Array.isArray(entry.result.lasers)?entry.result.lasers:[];
    if(!lasers.length)return null;
    const uptime=Math.min(100,Math.max(1,Number(fleetSettings.uptime)||100))/100;
    const expanded=[];
    const ranges=[];
    let fallbackSlot=1;
    for(const row of lasers){
      const quantity=Math.max(1,Number(row?.quantity)||1);
      const rate=Math.max(0,Number(row?.m3s)||0)*3600*uptime;
      const range=Number(row?.optimalRange);
      const slotMatch=String(row?.locationFlag||'').match(/^HiSlot(\d+)$/i);
      const firstSlot=slotMatch?Number(slotMatch[1])+1:null;
      for(let index=0;index<quantity;index++){
        const slot=firstSlot!==null?firstSlot+index:fallbackSlot++;
        expanded.push({slot,rate});
        if(Number.isFinite(range)&&range>0)ranges.push(range);
      }
    }
    expanded.sort((a,b)=>a.slot-b.slot);
    const rateText=expanded.map(row=>`L${row.slot} ${fmt(row.rate,'m3')}`).join(' • ');
    const rateTitle=expanded.map(row=>`Laser ${row.slot}: ${Math.round(row.rate).toLocaleString()} m³/hr @ ${Math.round(uptime*100)}% uptime`).join(' • ');
    let rangeText='—';
    if(ranges.length){
      const min=Math.min(...ranges),max=Math.max(...ranges);
      const km=value=>value>=1000?(value/1000).toFixed(value>=10000?1:2)+' km':Math.round(value)+' m';
      rangeText=Math.abs(max-min)>50?`${km(min)}–${km(max)}`:km(max);
    }
    return{count:expanded.length,rateText,rateTitle,rangeText};
  }
  function abyssalCycleText(stats){
    const yieldM3=Number(stats?.baseYield),duration=Number(stats?.duration),m3s=Number(stats?.baseM3s);
    if(!Number.isFinite(yieldM3)||!Number.isFinite(duration)||!Number.isFinite(m3s)||duration<=0)return'—';
    return`${Math.round(yieldM3).toLocaleString()} m³ per ${duration.toFixed(1)}s (${m3s.toFixed(1)} m³/s)`;
  }
  function abyssalLaserSlot(laser,fallback){
    const match=String(laser?.locationFlag||'').match(/^HiSlot(\d+)$/i);
    return match?`HIGH SLOT ${Number(match[1])+1}`:`LASER ${fallback}`;
  }
  function upgradeLaserKey(characterId,laser,index=0){
    const itemId=String(laser?.itemId||'');
    if(itemId)return itemId;
    return String(characterId||'')+':'+String(laser?.locationFlag||'laser-'+index);
  }
  function buildUpgradeRanks(byId,activeBoost){
    const metric=activeBoost?'withBuff':'withoutBuff';
    const candidates=[];
    for(const [characterId,entry] of byId){
      const lasers=Array.isArray(entry?.result?.abyssalLasers)?entry.result.abyssalLasers:[];
      lasers.forEach((laser,index)=>{
        const rate=Number(laser?.[metric]?.m3s||0);
        if(rate>0)candidates.push({key:upgradeLaserKey(characterId,laser,index),characterId,rate});
      });
    }
    candidates.sort((a,b)=>a.rate-b.rate||a.key.localeCompare(b.key,undefined,{numeric:true}));
    const best=Math.max(0,...candidates.map(row=>row.rate));
    return new Map(candidates.map((row,index)=>[row.key,{
      rank:index+1,
      total:candidates.length,
      rate:row.rate,
      belowBestPct:best>0?Math.max(0,(best-row.rate)/best*100):0,
    }]));
  }
  function abyssalLaserComparison(entry,activeBoost,upgradeRanks=null,characterId=''){
    const source=Array.isArray(entry?.result?.abyssalLasers)?entry.result.abyssalLasers:[];
    if(!source.length)return'';
    const slotNo=laser=>{
      const match=String(laser?.locationFlag||'').match(/^HiSlot(\d+)$/i);
      return match?Number(match[1])+1:Number.MAX_SAFE_INTEGER;
    };
    const rows=[...source].sort((a,b)=>slotNo(a)-slotNo(b)||String(a?.itemId||'').localeCompare(String(b?.itemId||''),undefined,{numeric:true}));
    return`<div class="abyssal-laser-grid" aria-label="Abyssal lasers by high slot">${rows.map((laser,index)=>{
      const itemId=String(laser?.itemId||''),itemLabel=itemId?` • ITEM …${itemId.slice(-6)}`:'';
      const title=`${abyssalLaserSlot(laser,index+1)}${itemId?` • item ${itemId}`:''}`;
      const rank=upgradeRanks?.get(upgradeLaserKey(characterId,laser,index))||null;
      const rankBadge=rank?`<b class="abyssal-upgrade-badge">PRIORITY #${rank.rank}</b>`:'';
      const upgradeLine=rank?`<div class="abyssal-upgrade-note"><span>UPGRADE VIEW</span><strong>#${rank.rank} of ${rank.total} • ${rank.belowBestPct.toFixed(1)}% below fleet best</strong></div>`:'';
      return`<article class="abyssal-laser-card${rank&&rank.rank<=3?' upgrade-priority':''}" title="${esc(title)}">
        <div class="abyssal-laser-head"><span><strong>${esc(abyssalLaserSlot(laser,index+1))}</strong><small>${esc(String(laser?.sourceName||laser?.name||'Abyssal Strip Miner')+itemLabel)}</small></span>${rankBadge}</div>
        <div class="abyssal-laser-state"><span>WITHOUT BUFF</span><strong>${esc(abyssalCycleText(laser?.withoutBuff))}</strong></div>
        <div class="abyssal-laser-state with-buff${activeBoost?' active':' off'}"><span>WITH BUFF${activeBoost?'':' • OFF'}</span><strong>${activeBoost?esc(abyssalCycleText(laser?.withBuff)):'SELECT / ENABLE BOOSTER'}</strong></div>
        <div class="abyssal-laser-expected"><span>EXPECTED + CRITS</span><strong>${esc(activeBoost?`${fmt(Number(laser?.withoutBuff?.m3s||0)*3600,'m3')} → ${fmt(Number(laser?.withBuff?.m3s||0)*3600,'m3')} m³/hr`:`${fmt(Number(laser?.withoutBuff?.m3s||0)*3600,'m3')} m³/hr • BUFF OFF`)}</strong></div>
        ${upgradeLine}
      </article>`;
    }).join('')}</div>`;
  }
  function fleetCharacterMatches(character){
    const id=String(character.characterId);
    const cfg=fleetSettings.members?.[id]||{};
    const fits=miningFits(character);
    if(fleetViewFilter==='selected'&&!cfg.enabled)return false;
    if(fleetViewFilter==='miners'&&!fits.length)return false;
    if(fleetViewFilter==='nofit'&&fits.length)return false;
    const query=String(fleetSearchText||'').trim().toLowerCase();
    if(!query)return true;
    const haystack=[
      character.name,
      ...fits.flatMap(fit=>[fit.shipName,fit.name]),
      id,
    ].map(value=>String(value||'').toLowerCase()).join(' ');
    return haystack.includes(query);
  }

  function fleetCharacterNameSort(a,b){
    return String(a?.name||'').localeCompare(String(b?.name||''),undefined,{numeric:true,sensitivity:'base'})
      ||String(a?.characterId||'').localeCompare(String(b?.characterId||''),undefined,{numeric:true});
  }

  function renderFleet(){
    if(!me)return;
    if(document.activeElement!==$('uptime'))$('uptime').value=Number(fleetSettings.uptime)||100;
    if(document.activeElement!==$('payout'))$('payout').value=Number(fleetSettings.payout)||95;

    const sourceChars=me.characters||[];
    const originalOrder=new Map(sourceChars.map((character,index)=>[String(character.characterId),index]));
    const customOrder=new Map((fleetSettings.order||[]).map((id,index)=>[String(id),index]));
    for(const character of sourceChars){
      const id=String(character.characterId),fits=miningFits(character);
      const existing=fleetSettings.members[id]&&typeof fleetSettings.members[id]==='object'?fleetSettings.members[id]:{};
      const chosen=fits.find(x=>String(x.fittingId)===String(existing.fittingId))||defaultFleetFit(fits);
      fleetSettings.members[id]={enabled:Boolean(existing.enabled),fittingId:chosen?String(chosen.fittingId):''};
    }
    if(!sourceChars.some(character=>String(character.characterId)===String(calcSettings.boosterCharacterId))){
      calcSettings.boosterCharacterId='';
      calcSettings.boosterFittingId='';
    }
    const selectedBooster=calcCharacter(calcSettings.boosterCharacterId);
    const selectedBoostFits=boosterFits(selectedBooster);
    if(calcSettings.boosterCharacterId&&!selectedBoostFits.some(fit=>String(fit.fittingId)===String(calcSettings.boosterFittingId))){
      calcSettings.boosterFittingId=selectedBoostFits[0]?String(selectedBoostFits[0].fittingId):'';
    }
    if(!calcSettings.boosterCharacterId)calcSettings.boosterFittingId='';
    localStorage.setItem('jlrMiningCalc',JSON.stringify(calcSettings));

    const booster=calcCharacter(calcSettings.boosterCharacterId);
    const boosterFit=calcFitting(booster,calcSettings.boosterFittingId);
    const boosterBreakdown=window.JLRYieldMath?.boostBreakdown(
      calcData(),
      booster?.skills||{},
      boosterFit,
      Boolean(calcSettings.mindlink),
    )||null;
    const activeBoost=Boolean(boosterInFleet()&&booster&&boosterFit&&boosterBreakdown?.ship&&boosterBreakdown.ship!=='None');
    const list=$('fleetMemberList');
    if(soundMenu?.select.closest('#fleetMemberList'))closeSoundMenu();
    list.innerHTML='';
    const stats=fleetStats(),byId=new Map(stats.entries.map(x=>[String(x.character.characterId),x]));
    const upgradeRanks=buildUpgradeRanks(byId,activeBoost);
    const upgradePriorityById=new Map();
    for(const [characterId,entry] of byId){
      const lasers=Array.isArray(entry?.result?.abyssalLasers)?entry.result.abyssalLasers:[];
      const ranks=lasers.map((laser,index)=>upgradeRanks.get(upgradeLaserKey(characterId,laser,index))?.rank).filter(Number.isFinite);
      if(ranks.length)upgradePriorityById.set(characterId,Math.min(...ranks));
    }
    list.classList.toggle('fleet-upgrade-mode',fleetUpgradeMode);
    const yieldSortStates=new Map(sourceChars.map(character=>{
      const id=String(character.characterId),cfg=fleetSettings.members?.[id]||{},entry=byId.get(id);
      if(id===String(calcSettings.boosterCharacterId||''))return[id,{group:0,yield:0}];
      if(cfg.enabled&&entry?.error&&!entry?.gas)return[id,{group:1,yield:0}];
      if(cfg.enabled&&entry?.result)return[id,{group:2,yield:Number(entry.effectiveM3)||0}];
      if(cfg.enabled&&entry?.gas)return[id,{group:3,yield:0}];
      if(miningFits(character).length)return[id,{group:4,yield:0}];
      return[id,{group:5,yield:0}];
    }));
    const chars=[...sourceChars].sort((a,b)=>{
      if(fleetUpgradeMode){
        const ap=upgradePriorityById.get(String(a.characterId))??Number.MAX_SAFE_INTEGER;
        const bp=upgradePriorityById.get(String(b.characterId))??Number.MAX_SAFE_INTEGER;
        return ap-bp||fleetCharacterNameSort(a,b);
      }
      if(fleetSortMode==='alpha')return fleetCharacterNameSort(a,b);
      if(fleetSortMode==='custom'){
        const aId=String(a.characterId),bId=String(b.characterId);
        const aOrder=customOrder.has(aId)?customOrder.get(aId):100000+(originalOrder.get(aId)||0);
        const bOrder=customOrder.has(bId)?customOrder.get(bId):100000+(originalOrder.get(bId)||0);
        return aOrder-bOrder;
      }
      const aState=yieldSortStates.get(String(a.characterId)),bState=yieldSortStates.get(String(b.characterId));
      return aState.group-bState.group||aState.yield-bState.yield||fleetCharacterNameSort(a,b);
    });
    const visibleChars=chars.filter(fleetCharacterMatches).filter(character=>!fleetUpgradeMode||upgradePriorityById.has(String(character.characterId)));
    const selectedCount=chars.filter(character=>Boolean(fleetSettings.members?.[String(character.characterId)]?.enabled)).length;
    const visibleCount=$('fleetVisibleCount');
    if(visibleCount)visibleCount.textContent=fleetUpgradeMode
      ?`UPGRADE MODE • ${visibleChars.length} ABYSSAL MINERS • ${upgradeRanks.size} LASERS`
      :`SHOWING ${visibleChars.length} / ${chars.length} • ${selectedCount} SELECTED`;
    const searchInput=$('fleetSearchInput');
    if(searchInput&&document.activeElement!==searchInput&&searchInput.value!==fleetSearchText)searchInput.value=fleetSearchText;
    const viewSelect=$('fleetViewFilter');
    if(viewSelect&&viewSelect.value!==fleetViewFilter)viewSelect.value=fleetViewFilter;
    const sortSelect=$('fleetSortMode');
    if(sortSelect&&sortSelect.value!==fleetSortMode)sortSelect.value=fleetSortMode;
    if(sortSelect)sortSelect.disabled=fleetUpgradeMode;
    const upgradeButton=$('fleetUpgradeMode');
    if(upgradeButton){
      upgradeButton.classList.toggle('active',fleetUpgradeMode);
      upgradeButton.setAttribute('aria-pressed',String(fleetUpgradeMode));
      upgradeButton.textContent=fleetUpgradeMode?'✓ UPGRADE MODE':'⚙ UPGRADE MODE';
      upgradeButton.title=fleetUpgradeMode?'Showing selected Abyssal miners with the lowest-output laser first':'Rank selected Abyssal lasers from lowest to highest output';
    }
    if(!chars.length){
      list.innerHTML='<div class="fleet-empty">Connect miners to build your fleet.</div>';
    }else if(!visibleChars.length){
      list.innerHTML=fleetUpgradeMode
        ?'<div class="fleet-empty">UPGRADE MODE: no selected miners currently have verified Abyssal strip miners. Select miners / fits first.</div>'
        :'<div class="fleet-empty">No toons match this fleet view. Clear the search or change SHOW.</div>';
    }else{
      for(const character of visibleChars){
        const id=String(character.characterId),cfg=fleetSettings.members[id],fits=miningFits(character),entry=byId.get(id);
        const row=document.createElement('div');row.className=`fleet-member${cfg.enabled?' selected':''}`;
        row.dataset.id=id;
        row.draggable=fleetArrangeMode;
        const fitOptions=groupedFitOptions(fits,cfg.fittingId);
        const isBooster=id===String(calcSettings.boosterCharacterId||'');
        const boosterFitText=isBooster?(boosterFit?`${boosterFit.shipName} — ${boosterFit.name}` :'No saved booster fit'):'';
        const laser=fleetLaserDetails(entry);
        const abyssalComparison=!isBooster&&cfg.enabled&&entry?.result?abyssalLaserComparison(entry,activeBoost,fleetUpgradeMode?upgradeRanks:null,id):'';
        let outputMain='EXCLUDED',outputSub='not counted',outputTitle='';
        let metricOne='—',metricOneLabel='M³/HR BY LASER',metricOneTitle='';
        let metricTwo='—',metricTwoLabel='LASER RANGE';
        let metricThree='NONE',metricThreeLabel='BOOST SOURCE';
        if(isBooster){
          const charges=boosterBreakdown?.charges?.names||[];
          outputMain=activeBoost?'BOOST ACTIVE':cfg.enabled?'BOOST FIT READY':'BOOSTER OFF';
          outputSub=boosterFit
            ?`${boosterFit.shipName} • ${boosterBreakdown?.core||'None'} core • ${boosterBreakdown?.burst||'T1'} burst${calcSettings.mindlink?' • mindlink':''}`
            :(cfg.enabled?'select a saved booster fit':'not in fleet');
          metricOne=boosterBreakdown?`${(Number(boosterBreakdown.cycleReduction||0)*100).toFixed(2)}%`:'—';
          metricOneLabel='CYCLE REDUCTION';
          metricTwo=boosterBreakdown?`${(Number(boosterBreakdown.efficiencyBoost||0)*100).toFixed(1)}%`:'—';
          metricTwoLabel='EFFICIENCY BURST';
          metricThree=boosterBreakdown?`${(Number(boosterBreakdown.rangeBonus||0)*100).toFixed(1)}%`:'—';
          metricThreeLabel='RANGE BOOST';
          if(charges.length)outputSub+=` • ${charges.join(' + ')}`;
        }else if(cfg.enabled&&entry?.result){
          outputMain=`${fmt(entry.effectiveM3,'m3')} m³/hr @ ${Number(fleetSettings.uptime).toFixed(0)}%`;
          outputSub=`${activeBoost?`BOOSTED • ${boosterBreakdown.ship}`:'UNBOOSTED'} • ${laser?.count||0} laser${laser?.count===1?'':'s'}`;
          metricOne=laser?.rateText||'—';
          metricOneTitle=laser?.rateTitle||'';
          metricOneLabel=`M³/HR BY LASER @ ${Number(fleetSettings.uptime).toFixed(0)}%`;
          metricTwo=laser?.rangeText||'—';
          metricThree=activeBoost?boosterBreakdown.ship:'NONE';
        }else if(cfg.enabled){
          const compactError=compactAbyssalError(entry?.error||'NO SUPPORTED FIT',entry?.fit);
          outputMain=compactError.main;
          outputSub=compactError.sub;
          outputTitle=compactError.detail;
          metricThree=activeBoost?boosterBreakdown.ship:'NONE';
        }
        if(isBooster)row.classList.add('booster');
        if(fleetArrangeMode)row.classList.add('arranging');
        row.innerHTML=`
          ${fleetArrangeMode?'<span class="fleet-drag-grip" aria-hidden="true">⠿</span>':''}
          <label class="fleet-member-toggle"><input class="fleet-member-check" data-id="${id}" type="checkbox" ${cfg.enabled?'checked':''} ${!isBooster&&!fits.length?'disabled':''}><img src="${esc(character.portrait)}" alt=""><span><strong>${esc(character.name)}</strong><small>${isBooster?(cfg.enabled?'Selected booster • in fleet':'Selected booster • not in fleet'):fits.length?`${fits.length} mining fit${fits.length===1?'':'s'}`:'No mining fits'}</small></span></label>
          <div class="fleet-fit-wrap">
            <span>${isBooster?'BOOSTER FIT':'SAVED MINING FIT'}</span>
            ${isBooster?`<div class="fleet-booster-fit-inline">${esc(boosterFitText)}</div>`:`<select class="fleet-fit-select" data-id="${id}" ${fits.length?'':'disabled'}>${fitOptions}</select>`}
          </div>
          <div class="fleet-member-performance">
            <div class="fleet-member-metrics">
              <span class="fleet-member-output" ${outputTitle?`title="${esc(outputTitle)}"`:''}><strong>${esc(outputMain)}</strong><small>${esc(outputSub)}</small></span>
              <span ${metricOneTitle?`title="${esc(metricOneTitle)}"`:''}><strong>${esc(metricOne)}</strong><small>${esc(metricOneLabel)}</small></span>
              <span title="Strip-miner optimal range includes the detected Mining Laser Field Enhancement boost. Implant range bonuses are not modeled."><strong>${esc(metricTwo)}</strong><small>${esc(metricTwoLabel)}</small></span>
              <span class="${activeBoost?'fleet-boost-live':''}"><strong>${esc(metricThree)}</strong><small>${esc(metricThreeLabel)}</small></span>
            </div>
            ${abyssalComparison}
          </div>`;
        list.appendChild(row);
      }
    }

    const arrange=$('fleetArrange'),reset=$('fleetOrderReset'),hint=$('fleetArrangeHint');
    if(arrange){
      arrange.classList.toggle('active',fleetArrangeMode);
      arrange.setAttribute('aria-pressed',String(fleetArrangeMode));
      arrange.textContent=fleetArrangeMode?'✓ ARRANGING TOONS':'↕ ARRANGE TOONS';
    }
    if(reset)reset.disabled=!(fleetSettings.order||[]).length;
    if(hint)hint.textContent=fleetUpgradeMode
      ?'Upgrade Mode: lowest-output Abyssal laser first across the selected fleet'
      :fleetArrangeMode
        ?'Drag a toon above or below another'
        :fleetSortMode==='yield-asc'?'Toons: worst → best output':fleetSortMode==='alpha'?'Toons: A → Z':'Toons: custom order';

    list.querySelectorAll('.fleet-member').forEach(row=>{
      row.addEventListener('dragstart',event=>{
        if(!fleetArrangeMode){event.preventDefault();return}
        fleetDragId=String(row.dataset.id||'');
        row.classList.add('dragging');
        if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',fleetDragId)}
      });
      row.addEventListener('dragover',event=>{
        if(!fleetArrangeMode||!fleetDragId||fleetDragId===String(row.dataset.id||''))return;
        event.preventDefault();
        list.querySelectorAll('.drag-before,.drag-after').forEach(item=>{if(item!==row)item.classList.remove('drag-before','drag-after')});
        const after=event.clientY>row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;
        row.classList.toggle('drag-after',after);
        row.classList.toggle('drag-before',!after);
        if(event.dataTransfer)event.dataTransfer.dropEffect='move';
      });
      row.addEventListener('dragleave',event=>{
        if(event.relatedTarget&&row.contains(event.relatedTarget))return;
        row.classList.remove('drag-before','drag-after');
      });
      row.addEventListener('drop',event=>{
        if(!fleetArrangeMode||!fleetDragId)return;
        event.preventDefault();
        const targetId=String(row.dataset.id||'');
        const after=row.classList.contains('drag-after');
        const ids=chars.map(character=>String(character.characterId));
        const from=ids.indexOf(fleetDragId);
        if(from>=0&&targetId&&targetId!==fleetDragId){
          ids.splice(from,1);
          const targetIndex=ids.indexOf(targetId);
          ids.splice(Math.max(0,targetIndex+(after?1:0)),0,fleetDragId);
          fleetSettings.order=ids;
          localStorage.setItem('jlrFleet',JSON.stringify(fleetSettings));
          renderFleet();
        }
      });
      row.addEventListener('dragend',()=>{
        fleetDragId='';
        list.querySelectorAll('.dragging,.drag-before,.drag-after').forEach(item=>item.classList.remove('dragging','drag-before','drag-after'));
      });
    });

    list.querySelectorAll('.fleet-member-check').forEach(input=>input.addEventListener('change',()=>{
      const id=input.dataset.id;if(!fleetSettings.members[id])fleetSettings.members[id]={enabled:false,fittingId:''};
      fleetSettings.members[id].enabled=input.checked;saveFleet();
    }));
    list.querySelectorAll('.fleet-fit-select').forEach(select=>select.addEventListener('change',()=>{
      const id=select.dataset.id;if(!fleetSettings.members[id])fleetSettings.members[id]={enabled:false,fittingId:''};
      fleetSettings.members[id].fittingId=select.value;saveFleet();
    }));

    const boostLabel=booster&&boosterFit&&boosterInFleet()?` • ${boosterFit.shipName} boost`:'';
    $('setupSummary').textContent=stats.count?`${stats.count} miners • ${fmt(stats.total,'m3')} m³/hr @ ${Number(fleetSettings.uptime).toFixed(0)}%${boostLabel} • ${Number(fleetSettings.payout).toFixed(1)}% payout`:`No miners selected${boostLabel}`;
    localStorage.setItem('jlrFleet',JSON.stringify(fleetSettings));
  }
  function renderSelect(){
    if(!state)return;
    const systemSelect=$('systemSelect');
    if(document.activeElement===systemSelect)return;
    const old=selectedSystem||systemSelect.value; systemSelect.innerHTML='';
    for(const ore of state.source.ores){const g=document.createElement('optgroup');g.label=`#${ore.rank} ${ore.name.toUpperCase()}`;for(const d of definitions().filter(x=>x.rank===ore.rank)){const f=field(d.system),o=document.createElement('option');o.value=d.system;const esi=f.status==='picked'&&f.autoReopenedAt?' • ESI VERIFIED':'';o.textContent=`${d.system} — ${f.status==='cleared'?`RED • RESPAWN ${timer(f.timerEndsAt)}`:statusText[f.status]}${esi}${f.cherryPicked?' 🍒 CHERRY':''}`;g.appendChild(o)}systemSelect.appendChild(g)}
    selectedSystem=definitions().some(x=>x.system===old)?old:(definitions()[0]?.system||'');
    systemSelect.value=selectedSystem;
  }
  function chooseSystem(system){selectedSystem=system;$('systemSelect').value=system;$('fieldNote').value='';adamRecordAction('system-select',{system});renderSelect();renderBoards();renderSelected();renderNotes();renderAdamContext()}
  function node(d,f,includeTimer=true){
    const b=document.createElement('div');
    const key=boardKey('t3',d.system);
    const favorite=isBoardFavorite('t3',d.system);
    b.className='system-node';
    b.dataset.status=f.status;
    b.dataset.system=d.system;
    b.dataset.boardKey=key;
    b.setAttribute('role','button');
    b.setAttribute('tabindex','0');
    b.setAttribute('aria-label',`${d.system}, ${d.ore}, ${statusText[f.status]}`);
    b.classList.toggle('favorite',favorite);
    b.classList.toggle('arrange-mode',boardArrangeMode);
    b.draggable=boardArrangeMode;
    if(d.system===selectedSystem)b.classList.add('selected');
    const line=f.status==='cleared'?`RESPAWN ${timer(f.timerEndsAt)}`:f.status==='picked'?(f.autoReopenedAt?'PICKED • ESI':'PICKED'):'';
    const distance=d.distanceLy==null?NaN:Number(d.distanceLy);
    const distanceText=Number.isFinite(distance)?`${line?' • ':''}${distance.toFixed(2)} LY`:'';
    const scanLine=boardScanLine(d.system);
    const evidence=boardEvidenceLine(d.system);
    const evidenceHtml=evidence?`<span class="sys-evidence ${esc(evidence.tone||'')}">${esc(evidence.text)}</span>`:'';
    const mapRow=mapFieldForT3(d);
    const mapHtml='';
    b.innerHTML=`${f.cherryPicked?'<span class="cherry-pin">🍒</span>':''}<button class="favorite-toggle" type="button" aria-pressed="${favorite}" title="${favorite?'Remove from favorites':'Favorite this system'}">${favorite?'★':'☆'}</button>${boardArrangeMode?'<span class="drag-grip" aria-hidden="true">⠿</span>':''}<span class="sys-name">${esc(d.system)}</span><span class="sys-ore">T3 ${esc(d.ore)}</span>${includeTimer?`<span class="sys-state">${line}${distanceText}</span>`:''}${mapHtml}<span class="sys-scan${scanLine.stale?' stale':''}">${esc(scanLine.text)}</span>${evidenceHtml}`;
    b.title=`${d.system} • ${d.ore} • ${statusText[f.status]}${favorite?' • Favorite':''}${f.autoReopenedAt?` • ESI mining detected ${ago(f.autoReopenedAt)}`:''}${Number.isFinite(distance)?` • ${distance.toFixed(2)} LY from C-N4OD`:''} • ${scanLine.title}${evidence?' • '+evidence.title:''}${f.cherryPicked?' • Cherry Picked':''}${f.notes?.length?` • ${f.notes.length} notes`:''}`;

    b.querySelector('.favorite-toggle').addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();toggleBoardFavorite('t3',d.system);sfx('select');
    });
    b.addEventListener('click',e=>{
      if(e.target.closest('.favorite-toggle'))return;
      if(Date.now()<boardSuppressClickUntil)return;
      chooseSystem(d.system);
    });
    b.addEventListener('keydown',e=>{
      if(e.target!==b)return;
      if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseSystem(d.system)}
    });
    attachBoardDrag(b,key);
    return b;
  }

  function attachBoardDrag(card,key){
    card.addEventListener('dragstart',e=>{
      if(!boardArrangeMode){e.preventDefault();return}
      boardDragKey=key;
      card.classList.add('dragging');
      if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',key)}
    });
    card.addEventListener('dragover',e=>{
      if(!boardArrangeMode||!boardDragKey||boardDragKey===key)return;
      const favorites=favoriteBoardKeys();
      if(favorites.has(boardDragKey)!==favorites.has(key))return;
      e.preventDefault();
      card.classList.add('drag-over');
      if(e.dataTransfer)e.dataTransfer.dropEffect='move';
    });
    card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
    card.addEventListener('drop',e=>{
      e.preventDefault();card.classList.remove('drag-over');
      moveBoardItem(boardDragKey,key);
    });
    card.addEventListener('dragend',()=>{
      boardDragKey='';
      boardSuppressClickUntil=Date.now()+180;
      document.querySelectorAll('.system-node.dragging,.system-node.drag-over').forEach(node=>node.classList.remove('dragging','drag-over'));
    });
  }

  function mapFieldBoardNode(row){
    const card=document.createElement('div');
    const key=boardKey('map',row.id||[row.system,row.mineral,row.tier].join('|'));
    const favorite=favoriteBoardKeys().has(key);
    const power=String(row.powerState||'unknown').toLowerCase();
    const rows=row.rows||[row];
    const reminder=mapScanReminderLine(rows.reduce((old,item)=>Date.parse(item.scanReminderStartedAt||'')<Date.parse(old.scanReminderStartedAt||'')?item:old,row));
    card.className='system-node map-field-node tier-'+Number(row.tier);
    card.dataset.status=(row.rows||[row]).every(item=>item.status==='cleared')?'cleared':'map';
    card.dataset.powerState=power;
    card.dataset.system=row.system;
    card.dataset.boardKey=key;
    card.classList.toggle('favorite',favorite);
    card.classList.toggle('arrange-mode',boardArrangeMode);
    card.draggable=boardArrangeMode;
    card.setAttribute('role','group');
    card.innerHTML='<button class="favorite-toggle" type="button" aria-pressed="'+favorite+'" title="'+(favorite?'Remove from favorites':'Favorite this array')+'">'+(favorite?'★':'☆')+'</button>'+
      (boardArrangeMode?'<span class="drag-grip" aria-hidden="true">⠿</span>':'')+
      '<span class="sys-name">'+esc(row.system)+'</span>'+
      rows.map(item=>'<span class="sys-ore'+(item.status==='cleared'?' cleared':'')+'">T'+Number(item.tier)+' '+esc(item.ore==='Awaiting scan'?item.mineral:item.ore)+
        (item.status==='cleared'?' • CLEARED • '+esc(timer(item.timerEndsAt)):'')+'</span>').join('')+ 
      '<span class="sys-state">'+Number(row.distanceLy).toFixed(2)+' LY</span>'+
      '<span class="sys-evidence">'+fmt(rows.reduce((sum,item)=>sum+(Number(item.minedM3)||0),0),'m3')+' / '+fmt(rows.reduce((sum,item)=>sum+(Number(item.siteM3)||0),0),'m3')+' m³</span>'+ 
      '<span class="sys-scan'+(reminder.stale?' stale':'')+'" title="'+esc(reminder.title)+'">'+esc(reminder.text)+'</span>';
    card.title=row.system+' • T'+Number(row.tier)+' '+row.mineral+' • '+Number(row.distanceLy).toFixed(2)+' LY from C-N4OD • Awaiting scan';
    card.querySelector('.favorite-toggle').addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      const favorites=favoriteBoardKeys();
      if(favorites.has(key))favorites.delete(key);else favorites.add(key);
      boardPrefs.favorites=[...favorites];saveBoardPrefs();renderBoards();sfx('select');
    });
    card.setAttribute('role','button');card.tabIndex=0;
    const openControls=()=>{
      if(boardArrangeMode||Date.now()<boardSuppressClickUntil)return;
      const dialog=document.createElement('dialog');dialog.className='map-field-controls';
      dialog.innerHTML='<h3>'+esc(row.system)+' • T'+Number(row.tier)+' FIELDS</h3>';
      for(const item of rows){
        const line=document.createElement('div');line.className='map-field-control-row';
        const label=document.createElement('span');label.textContent=item.ore+' • '+fmt(Number(item.minedM3)||0,'m3')+' / '+fmt(Number(item.siteM3)||0,'m3')+' m³'+(item.status==='cleared'?' • CLEARED • '+timer(item.timerEndsAt):'');line.appendChild(label);
        if(Number(item.tier)===2&&item.status!=='cleared'){
          const clear=document.createElement('button');clear.type='button';clear.className='orb';clear.textContent='CLEAR + 4H';
          clear.addEventListener('click',async()=>{
            if(!window.confirm('Mark '+item.system+' T2 '+item.ore+' mined out? This starts its 4-hour respawn timer.'))return;
            clear.disabled=true;
            try{await api('/api/fields/map/'+encodeURIComponent(item.id)+'/clear',{method:'POST',body:JSON.stringify({confirm:true})});dialog.close();toast(item.ore+' marked cleared.');}
            catch(error){clear.disabled=false;toast(error.message);}
          });line.appendChild(clear);
        }
        dialog.appendChild(line);
      }
      const close=document.createElement('button');close.type='button';close.className='orb';close.textContent='CLOSE';close.addEventListener('click',()=>dialog.close());dialog.appendChild(close);
      dialog.addEventListener('close',()=>dialog.remove());document.body.appendChild(dialog);dialog.showModal();
    };
    card.addEventListener('click',e=>{if(!e.target.closest('.favorite-toggle'))openControls()});
    card.addEventListener('keydown',e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openControls()}});
    attachBoardDrag(card,key);
    return card;
  }

  function iceBoardNode(row){
    const card=document.createElement('div');
    const key=boardKey('ice',row.system);
    const favorite=isBoardFavorite('ice',row.system);
    card.className='system-node ice-system-node';
    card.dataset.status='ice';
    card.dataset.system=row.system;
    card.dataset.boardKey=key;
    card.classList.toggle('favorite',favorite);
    card.classList.toggle('arrange-mode',boardArrangeMode);
    card.draggable=boardArrangeMode;
    card.setAttribute('role','group');
    const fields=Math.max(1,Number(row.iceBelts)||1);
    const distance=Number(row.distanceLy);
    const scanLine=boardScanLine(row.system,null,false);
    const iceScan=state?.scans?.[row.system]?.ice||null;
    const seen=iceScan?Math.min(fields,Math.max(0,Number(iceScan.seen)||0)):null;
    const missing=seen==null?null:Math.max(0,fields-seen);
    const coverage=seen==null
      ?`ICE ?/${fields} • NEED SCAN`
      :missing>0
        ?`ICE ${seen}/${fields} SEEN • ${missing} MISSING`
        :`ICE ${seen}/${fields} SEEN • ALL PRESENT`;
    card.innerHTML='<button class="favorite-toggle" type="button" aria-pressed="'+favorite+'" title="'+(favorite?'Remove from favorites':'Favorite this system')+'">'+(favorite?'★':'☆')+'</button>'+
      (boardArrangeMode?'<span class="drag-grip" aria-hidden="true">⠿</span>':'')+
      '<span class="sys-name">'+esc(row.system)+'</span>'+
      '<span class="sys-ore">'+fields+' ICE FIELD'+(fields===1?'':'S')+'</span>'+
      '<span class="sys-state">IN TITAN RANGE'+(Number.isFinite(distance)?' • '+distance.toFixed(2)+' LY':'')+'</span>'+
      '<span class="sys-ice-coverage'+(missing>0||seen==null?' missing':'')+'">'+esc(coverage)+'</span>'+
      '<span class="sys-scan'+(scanLine.stale?' stale':'')+'">'+esc(scanLine.text)+'</span>';
    card.title=row.system+' • '+fields+' ice field'+(fields===1?'':'s')+(favorite?' • Favorite':'')+(Number.isFinite(distance)?' • '+distance.toFixed(2)+' LY from C-N4OD':'')+' • '+coverage+' • '+scanLine.title+' • within configured Titan bridge range';
    card.querySelector('.favorite-toggle').addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();toggleBoardFavorite('ice',row.system);sfx('select');
    });
    attachBoardDrag(card,key);
    return card;
  }

  function a0BoardNode(row){
    const card=document.createElement('div');
    const key=boardKey('a0',row.system);
    const favorite=isBoardFavorite('a0',row.system);
    const scan=row.scan||{};
    const checkedMs=Date.parse(scan.lastCheckedAt||'');
    const due=scan.due||!Number.isFinite(checkedMs)||Date.now()-checkedMs>=12*60*60*1000;
    const a0State=due?'needs-update':scan.detected?'active':'clear';
    card.className='system-node a0-system-node';
    card.dataset.status='a0';
    card.dataset.a0State=a0State;
    card.dataset.system=row.system;
    card.dataset.boardKey=key;
    card.classList.toggle('favorite',favorite);
    card.classList.toggle('arrange-mode',boardArrangeMode);
    card.draggable=boardArrangeMode;
    card.setAttribute('role','group');
    const distance=Number(row.distanceLy);
    const spectral=String(row.spectralClass||'A0');
    const stateLine=scan.superseded?'PREVIOUS SITE':due?'SCAN DUE':scan.detected?'A0 SITE ACTIVE':'NO A0 SITE';
    const scanLine=boardScanLine(row.system,{lastScanAt:scan.lastCheckedAt,due});
    card.innerHTML='<button class="favorite-toggle" type="button" aria-pressed="'+favorite+'" title="'+(favorite?'Remove from favorites':'Favorite this system')+'">'+(favorite?'★':'☆')+'</button>'+
      (boardArrangeMode?'<span class="drag-grip" aria-hidden="true">⠿</span>':'')+
      '<span class="sys-name">'+esc(row.system)+'</span>'+
      '<span class="sys-ore">RARE ASTEROIDS'+(Number.isFinite(distance)?' • '+distance.toFixed(2)+' LY':'')+'</span>'+
      '<span class="sys-state">'+esc(stateLine)+'</span>'+
      '<span class="sys-scan'+(scanLine.stale?' stale':'')+'">'+esc(scanLine.text)+'</span>';
    card.title=row.system+' • '+spectral+' star'+(favorite?' • Favorite':'')+(Number.isFinite(distance)?' • '+distance.toFixed(2)+' LY from C-N4OD':'')+(due?' • Needs Probe Scanner update':scan.detected?' • A0 rare asteroid site detected':' • Checked; no active A0 site detected')+' • refresh due every 12 hours';
    card.querySelector('.favorite-toggle').addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();toggleBoardFavorite('a0',row.system);sfx('select');
    });
    attachBoardDrag(card,key);
    return card;
  }

  function renderBoards(){
    if(!state)return;
    const board=$('fieldBoard');
    syncBoardControls();
    window.JlrFieldUpdateFeedback?.observe(state);
    board.innerHTML='';
    let counts={ready:0,picked:0,cleared:0,cherry:0};
    if(state.fieldAccess&&!state.fieldAccess.allowed){
      board.innerHTML='<div class="target-empty"><strong>INIT members only</strong><span>Link a character currently in INIT to view field locations and reports.</span></div>';
      $('systemCountLabel').textContent='FIELDS LOCKED';$('statusCounts').textContent='INIT access required';return;
    }
    const mapRows=mapFields();
    const iceFields=Array.isArray(state.source?.iceFields)?state.source.iceFields:[];
    const a0Fields=Array.isArray(state.source?.a0Fields)?state.source.a0Fields:[];
    const a0Due=a0Fields.filter(row=>!row.scan?.superseded).filter(row=>row.scan?.due||!row.scan?.lastCheckedAt||Date.now()-Date.parse(row.scan.lastCheckedAt)>=12*60*60*1000).length;
    const a0Filter=document.querySelector('.filter[data-filter="a0"]');
    if(a0Filter)a0Filter.textContent=a0Due?`A0 • ${a0Due} UPDATE`:'A0 ✓';

    for(const d of definitions()){
      const f=field(d.system);
      counts[f.status]++;
      if(f.cherryPicked)counts.cherry++;
    }

    for(const entry of orderedBoardEntries()){
      if(entry.kind==='t3'){
        if(filter==='all'||filter===entry.f.status||(filter==='cherry'&&entry.f.cherryPicked)||(filter==='map'&&mapFieldForT3(entry.d)))board.appendChild(node(entry.d,entry.f,true));
      }else if(entry.kind==='map'&&(filter==='all'||filter==='map')){
        board.appendChild(mapFieldBoardNode(entry.row));
      }else if(entry.kind==='ice'&&(filter==='all'||filter==='ice')){
        board.appendChild(iceBoardNode(entry.row));
      }else if(entry.kind==='a0'&&!entry.row.scan?.superseded&&(filter==='a0'||(filter==='all'&&entry.row.scan?.detected))){
        // Only the latest confirmed A0 site stays on the main board.
        // Its own A0 report supplies both freshness status and scan age.
        board.appendChild(a0BoardNode(entry.row));
      }
    }

    window.JlrFieldUpdateFeedback?.paint(board,()=>{if(!document.hidden)sfx('fieldUpdate')});
    const mapSummary=state.source?.mapFieldSnapshot?.summary||{};
    $('statusCounts').textContent=`${counts.ready} green • ${counts.picked} picked • ${counts.cleared} respawning • ${counts.cherry} cherry • ${Number(mapSummary.tier2||0)} T2 arrays • ${Number(mapSummary.tier3||0)} T3 map arrays • ${iceFields.length} ice • ${a0Fields.length} A0 • ${a0Due} need update`;
    $('systemCountLabel').textContent=`${definitions().length} T3 • ${mapRows.length} MAP ARRAYS • ${iceFields.length} ICE • ${a0Fields.length} A0`;
    if(filter==='map'&&!mapRows.length)board.innerHTML='<div class="target-empty"><strong>No private arrays are configured.</strong><span>Field locations are loaded from private server configuration.</span></div>';
    if(filter==='a0'&&!a0Fields.length)board.innerHTML='<div class="target-empty"><strong>No A0 systems found within 6 LY.</strong><span>The server scans Fountain star spectral classes through ESI. Active rare-asteroid anomalies themselves are not exposed remotely.</span></div>';
  }
  function renderHits(){
    if(!state)return;
    const ores=state.source?.ores||[];
    const oreNames=ores.map(ore=>ore.name);
    if(targetOre!=='auto'&&!oreNames.includes(targetOre))targetOre='auto';

    const oreSelect=$('targetOreSelect');
    if(oreSelect&&document.activeElement!==oreSelect){
      oreSelect.innerHTML='<option value="auto">AUTO • BEST VALUE</option>'+ores.map(ore=>'<option value="'+esc(ore.name)+'">#'+ore.rank+' • '+esc(ore.name.toUpperCase())+'</option>').join('');
      oreSelect.value=targetOre;
    }

    const all=definitions()
      .map(d=>({d,f:field(d.system)}))
      .filter(x=>targetOre==='auto'||x.d.ore===targetOre);
    const arr=all
      .filter(x=>x.f.status!=='cleared')
      .sort((a,b)=>Number(a.f.cherryPicked)-Number(b.f.cherryPicked)||a.d.rank-b.d.rank||a.d.order-b.d.order)
      .slice(0,12);

    const host=$('hitOrder');
    host.innerHTML='';

    const summary=$('targetSummary');
    if(summary){
      if(targetOre==='auto')summary.textContent='highest-value mineable fields first • 🍒 cherry-picked fields go last';
      else summary.textContent=`${arr.length} available ${targetOre} system${arr.length===1?'':'s'} • click a card to select it on the field board`;
    }

    for(const [i,x] of arr.entries()){
      const b=document.createElement('button');
      b.type='button';
      b.className=`target-card ${x.f.cherryPicked?'cherry':x.f.status==='picked'?'yellow':'green'} ${i===0?'priority-first':''}`;

      const distance=x.d.distanceLy==null?NaN:Number(x.d.distanceLy);
      const payout=projectedISK(state.source.ores[x.d.rank-1]);
      const stateLabel=x.f.cherryPicked?'CHERRY PICKED':x.f.status==='picked'?(x.f.autoReopenedAt?'PICKED • ESI VERIFIED':'PICKED'):'MINEABLE';
      const priorityLabel=i===0?'MINE FIRST':i===1?'NEXT':'PRIORITY';

      b.innerHTML=`
        <span class="target-rank">
          <strong>${i+1}</strong>
          <small>${priorityLabel}</small>
        </span>
        <span class="target-main">
          <strong>${esc(x.d.system)}</strong>
          <span class="target-ore">#${x.d.rank} ${esc(x.d.ore)}</span>
          <span class="target-state">${stateLabel}</span>
        </span>
        <span class="target-meta">
          <span>DISTANCE FROM C-N</span>
          <strong>${Number.isFinite(distance)?distance.toFixed(2)+' LY':'—'}</strong>
        </span>
        <span class="target-meta target-payout">
          <span>FLEET PAYOUT / HR</span>
          <strong>${fmt(payout)}</strong>
          <small>ISK/hr</small>
        </span>`;

      b.setAttribute('aria-label',`Priority ${i+1}: ${x.d.system}, ${x.d.ore}, ${Number.isFinite(distance)?distance.toFixed(2)+' light years from C-N4OD, ':''}${fmt(payout)} ISK per hour, ${stateLabel}`);
      b.addEventListener('click',()=>chooseSystem(x.d.system));
      host.appendChild(b);
    }

    if(!arr.length){
      const respawning=all.filter(x=>x.f.status==='cleared').sort((a,b)=>Date.parse(a.f.timerEndsAt||0)-Date.parse(b.f.timerEndsAt||0));
      if(targetOre!=='auto'&&respawning.length){
        const next=respawning[0];
        host.innerHTML=`<div class="target-empty"><strong>No ${esc(targetOre)} systems are mineable right now.</strong><span>${respawning.length} system${respawning.length===1?' is':'s are'} respawning. Next: ${esc(next.d.system)} in ${esc(timer(next.f.timerEndsAt))}.</span></div>`;
      }else{
        host.innerHTML='<div class="target-empty"><strong>No mineable T3 fields right now.</strong><span>Cleared fields will return after their respawn timers finish.</span></div>';
      }
    }
  }
  function selectedFleetPerformanceIds(){
    const boosterId=String(calcSettings.boosterCharacterId||'');
    return (me?.characters||[])
      .map(character=>String(character.characterId))
      .filter(id=>id!==boosterId&&Boolean(fleetSettings.members?.[id]?.enabled));
  }
  function fleetPerformanceKey(ids=selectedFleetPerformanceIds()){
    return [...ids].map(String).sort().join(',');
  }
  function scopedFleetPerformance(){
    const ids=selectedFleetPerformanceIds();
    const key=fleetPerformanceKey(ids);
    const dataKey=fleetPerformanceKey(Array.isArray(fleetPerformanceData?.characterIds)?fleetPerformanceData.characterIds:[]);
    if(key!==dataKey){
      return{scope:'assigned-fleet',characterIds:ids,daily:[],samples:[],actual:{today:{m3:0,jbv:0,unpricedM3:0},week:{m3:0,jbv:0,unpricedM3:0}}};
    }
    return fleetPerformanceData||{scope:'assigned-fleet',characterIds:ids,daily:[],samples:[],actual:{today:{m3:0,jbv:0,unpricedM3:0},week:{m3:0,jbv:0,unpricedM3:0}}};
  }
  async function refreshFleetPerformanceSnapshot(force=false){
    const characterIds=selectedFleetPerformanceIds();
    const key=fleetPerformanceKey(characterIds);
    if(!force&&fleetPerformanceData&&fleetPerformanceSelectionKey===key)return fleetPerformanceData;
    if(fleetPerformanceSnapshotPromise){
      if(fleetPerformanceSnapshotRequestKey===key)return fleetPerformanceSnapshotPromise;
      return fleetPerformanceSnapshotPromise.finally(()=>refreshFleetPerformanceSnapshot(true));
    }
    fleetPerformanceSnapshotRequestKey=key;
    const pending=api('/api/fleet-performance',{
      method:'POST',
      body:JSON.stringify({characterIds}),
    }).then(payload=>{
      fleetPerformanceData=payload;
      fleetPerformanceSelectionKey=key;
      fleetPerformanceError='';
      return payload;
    }).catch(error=>{
      console.warn('Assigned Fleet Performance snapshot failed',error);
      fleetPerformanceError=String(error?.message||error||'Fleet performance request failed.');
      if(fleetPerformanceSelectionKey!==key)fleetPerformanceData=null;
      return null;
    }).finally(()=>{
      if(fleetPerformanceSnapshotPromise===pending){
        fleetPerformanceSnapshotPromise=null;
        fleetPerformanceSnapshotRequestKey='';
      }
    });
    fleetPerformanceSnapshotPromise=pending;
    return pending;
  }
  function fleetHistoryRows(days=fleetHistoryDays){
    const source=Array.isArray(scopedFleetPerformance()?.daily)?scopedFleetPerformance().daily:[];
    const byDate=new Map(source.map(row=>[String(row.date||''),row]));
    const today=new Date();
    today.setUTCHours(0,0,0,0);
    const rows=[];
    for(let offset=days-1;offset>=0;offset--){
      const date=new Date(today.getTime()-offset*86400000).toISOString().slice(0,10);
      const row=byDate.get(date)||{};
      rows.push({date,m3:Number(row.m3||0),jbv:Number(row.jbv||0),ores:row.ores&&typeof row.ores==='object'?row.ores:{}});
    }
    return rows;
  }
  function fleetChartDate(value){
    const parsed=Date.parse(String(value||''));
    return Number.isFinite(parsed)?new Date(parsed).toISOString().slice(0,10):'';
  }
  function updateFleetChartLinkedDate(hoverDate=''){
    const linkedDate=hoverDate||fleetChartPinnedDate;
    document.querySelectorAll('[data-fleet-chart-date]').forEach(node=>{
      const same=Boolean(linkedDate)&&node.dataset.fleetChartDate===linkedDate;
      const pinned=Boolean(fleetChartPinnedDate)&&node.dataset.fleetChartDate===fleetChartPinnedDate;
      node.classList.toggle('fleet-chart-linked',same);
      node.classList.toggle('fleet-chart-pinned',pinned);
    });
  }
  function positionFleetChartTooltip(el,tooltip,event,node){
    if(!el||!tooltip||!node)return;
    const host=el.getBoundingClientRect();
    const box=node.getBoundingClientRect();
    const clientX=Number(event?.clientX)||box.left+box.width/2;
    const clientY=Number(event?.clientY)||box.top;
    const x=Math.max(10,Math.min(host.width-10,clientX-host.left));
    const y=Math.max(8,clientY-host.top-10);
    tooltip.style.left=x+'px';
    tooltip.style.top=y+'px';
  }
  function bindFleetChartInteractions(el,selector,detailForIndex){
    if(!el)return;
    let tooltip=el.querySelector('.fleet-chart-tooltip');
    if(!tooltip){
      tooltip=document.createElement('div');
      tooltip.className='fleet-chart-tooltip';
      tooltip.hidden=true;
      el.appendChild(tooltip);
    }
    const nodes=[...el.querySelectorAll(selector)];
    const show=(node,event,lock=false)=>{
      const index=Number(node.dataset.chartIndex);
      const detail=detailForIndex(index,node);
      if(!detail)return;
      tooltip.innerHTML=detail;
      tooltip.hidden=false;
      tooltip.classList.toggle('pinned',lock);
      tooltip.dataset.pinned=lock?'true':'false';
      positionFleetChartTooltip(el,tooltip,event,node);
      updateFleetChartLinkedDate(node.dataset.fleetChartDate||'');
    };
    const hide=()=>{
      if(tooltip.dataset.pinned==='true')return;
      tooltip.hidden=true;
      updateFleetChartLinkedDate('');
    };
    for(const node of nodes){
      node.addEventListener('pointerenter',event=>show(node,event,false));
      node.addEventListener('pointermove',event=>positionFleetChartTooltip(el,tooltip,event,node));
      node.addEventListener('pointerleave',hide);
      node.addEventListener('focus',event=>show(node,event,false));
      node.addEventListener('blur',hide);
      node.addEventListener('click',event=>{
        event.preventDefault();
        const date=node.dataset.fleetChartDate||'';
        const samePinned=Boolean(date)&&fleetChartPinnedDate===date;
        fleetChartPinnedDate=samePinned?'':date;
        tooltip.dataset.pinned='false';
        if(fleetChartPinnedDate)show(node,event,true);
        else{
          tooltip.hidden=true;
          tooltip.classList.remove('pinned');
          updateFleetChartLinkedDate('');
        }
      });
      node.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){
          event.preventDefault();
          node.click();
        }else if(event.key==='Escape'){
          fleetChartPinnedDate='';
          tooltip.dataset.pinned='false';
          tooltip.hidden=true;
          tooltip.classList.remove('pinned');
          updateFleetChartLinkedDate('');
        }
      });
    }
    updateFleetChartLinkedDate('');
  }
  function renderFleetActivityChart(el,samples,target,todayAverage=null,metric='rate'){
    if(!el)return;
    const rows=(samples||[]).filter(row=>Number.isFinite(Date.parse(row?.at||''))).slice(-48);
    if(!rows.length){
      const selected=selectedFleetPerformanceIds().length;
      const message=fleetPerformanceError
        ?'Fleet activity could not be loaded • '+esc(fleetPerformanceError)
        :selected<=0
          ?'No fleet selected • choose miners in Fleet & Fits'
          :(fleetPerformanceSnapshotPromise||state?.esi?.syncing)
            ?'Refreshing fleet mining ledger…'
            :'No mining intervals recorded yet for the selected fleet';
      el.innerHTML='<div class="visual-empty fleet-state-empty">'+message+'</div>';
      return;
    }
    const efficiencyMode=metric==='efficiency';
    if(efficiencyMode&&!(Number(target)>0)){
      el.innerHTML='<div class="visual-empty fleet-state-empty">Select fitted miners so JLR has a fleet target for efficiency %.</div>';
      return;
    }
    const W=760,H=205,L=52,R=118,T=20,B=28,pw=W-L-R,ph=H-T-B;
    const rates=rows.map(row=>Math.max(0,Number(row.actualM3PerHour)||0));
    const values=efficiencyMode?rates.map(rate=>rate/Number(target)*100):rates;
    const avgRate=Number.isFinite(Number(todayAverage))?Math.max(0,Number(todayAverage)):null;
    const avgValue=avgRate===null?null:(efficiencyMode?avgRate/Number(target)*100:avgRate);
    const targetValue=efficiencyMode?100:Number(target)||0;
    const max=Math.max(efficiencyMode?120:1,targetValue,avgValue||0,...values)*1.08;
    const x=i=>rows.length<=1?L+pw/2:L+i/(rows.length-1)*pw;
    const y=v=>T+(1-Math.min(max,Math.max(0,Number(v)||0))/max)*ph;
    const axisValue=value=>efficiencyMode?Math.round(value)+'%':compactNumber(value);
    let grid='';
    for(let i=0;i<=3;i++){
      const yy=T+i/3*ph,value=max*(1-i/3);
      grid+='<line x1="'+L+'" y1="'+yy.toFixed(1)+'" x2="'+(W-R)+'" y2="'+yy.toFixed(1)+'" class="fleet-chart-grid"/>'+
        '<text x="'+(L-7)+'" y="'+(yy+3).toFixed(1)+'" text-anchor="end" class="fleet-chart-axis">'+esc(axisValue(value))+'</text>';
    }
    const line='M '+rows.map((row,i)=>x(i).toFixed(1)+' '+y(values[i]).toFixed(1)).join(' L ');
    const targetLine=targetValue>0
      ?'<line x1="'+L+'" y1="'+y(targetValue).toFixed(1)+'" x2="'+(W-R)+'" y2="'+y(targetValue).toFixed(1)+'" class="fleet-target-line"/>'+
       '<text x="'+(W-R+7)+'" y="'+Math.max(T+7,y(targetValue)-4).toFixed(1)+'" class="fleet-target-label">'+(efficiencyMode?'TARGET 100%':'TARGET '+esc(compactNumber(targetValue)))+'</text>'
      :'';
    const averageLine=avgValue!==null
      ?'<line x1="'+L+'" y1="'+y(avgValue).toFixed(1)+'" x2="'+(W-R)+'" y2="'+y(avgValue).toFixed(1)+'" class="fleet-average-line"/>'+
       '<text x="'+(W-R+7)+'" y="'+Math.max(T+14,Math.min(T+ph-3,y(avgValue)+10)).toFixed(1)+'" class="fleet-average-label">TODAY AVG '+esc(efficiencyMode?avgValue.toFixed(0)+'%':compactNumber(avgValue))+'</text>'
      :'';
    const latestIndex=rows.length-1,latest=rows[latestIndex],latestValue=values[latestIndex],latestRate=rates[latestIndex];
    const latestTitle=new Date(latest.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+
      ' • '+fmt(latestRate,'m3')+' m³/hr • '+(Number(target)>0?(latestRate/Number(target)*100).toFixed(0)+'% of target • ':'')+Number(latest.activeToons||0)+' active of '+Number(latest.sampledToons||0)+' sampled';
    const points=rows.map((row,i)=>{
      const date=fleetChartDate(row.at);
      return '<circle cx="'+x(i).toFixed(1)+'" cy="'+y(values[i]).toFixed(1)+'" r="2.2" class="fleet-activity-point" data-fleet-chart-date="'+esc(date)+'"></circle>';
    }).join('');
    const hover=rows.map((row,i)=>{
      const when=new Date(row.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
      const pct=Number(target)>0?rates[i]/Number(target)*100:null;
      const title=when+' • '+fmt(rates[i],'m3')+' m³/hr'+(pct!=null?' • '+pct.toFixed(0)+'% of target':'');
      const date=fleetChartDate(row.at);
      return '<circle cx="'+x(i).toFixed(1)+'" cy="'+y(values[i]).toFixed(1)+'" r="8" tabindex="0" role="button" aria-label="'+esc(title)+'" class="fleet-chart-hit" data-chart-index="'+i+'" data-fleet-chart-date="'+esc(date)+'"><title>'+esc(title)+'</title></circle>';
    }).join('');
    const latestDot='<circle cx="'+x(latestIndex).toFixed(1)+'" cy="'+y(latestValue).toFixed(1)+'" r="4" class="fleet-activity-dot"><title>'+esc(latestTitle)+'</title></circle>';
    const latestPct=Number(target)>0?latestRate/Number(target)*100:null;
    const latestLabelText=efficiencyMode?(latestPct==null?'—':latestPct.toFixed(0)+'%'):(compactNumber(latestRate)+(latestPct!=null?' • '+latestPct.toFixed(0)+'%':''));
    const latestLabel='<text x="'+(W-R+7)+'" y="'+Math.max(T+8,Math.min(T+ph-2,y(latestValue)+3)).toFixed(1)+'" class="fleet-latest-label">'+esc(latestLabelText)+'</text>';
    const labelIndexes=[0,Math.floor((rows.length-1)/2),rows.length-1];
    const labels=[...new Set(labelIndexes)].map(i=>'<text x="'+x(i).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" class="fleet-chart-axis">'+esc(new Date(rows[i].at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}))+'</text>').join('');
    el.innerHTML='<svg class="fleet-chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+(efficiencyMode?'Fleet efficiency percent versus fitted target':'Sampled fleet mining rate from recent ESI ledger changes')+'">'+
      grid+'<path d="'+line+'" class="fleet-activity-line"/>'+targetLine+averageLine+points+hover+latestDot+latestLabel+labels+
      '<text x="'+L+'" y="'+(T-7)+'" class="fleet-chart-unit">'+(efficiencyMode?'% OF TARGET':'M³/HR')+'</text></svg>';
    bindFleetChartInteractions(el,'.fleet-chart-hit',(index)=>{
      const row=rows[index];
      if(!row)return'';
      const rate=rates[index];
      const pct=Number(target)>0?rate/Number(target)*100:null;
      const when=new Date(row.at).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
      return '<strong>'+esc(when)+'</strong>'+
        '<span>'+esc(fmt(rate,'m3'))+' m³/hr'+(pct!=null?' • '+pct.toFixed(0)+'%':'')+'</span>'+
        '<small>'+Number(row.activeToons||0)+' active / '+Number(row.sampledToons||0)+' sampled'+(pct!=null?' • fitted target '+esc(fmt(target,'m3'))+' m³/hr':'')+'</small>'+
        '<em>Click to '+(fleetChartPinnedDate===fleetChartDate(row.at)?'unpin':'pin')+' this day across graphs</em>';
    });
  }
  function renderFleetDailyChart(el,rows,metric){
    if(!el)return;
    const payout=Number(fleetSettings.payout||95)/100;
    const values=rows.map(row=>metric==='value'?Math.max(0,Number(row.jbv)||0)*payout:Math.max(0,Number(row.m3)||0));
    if(!values.some(value=>value>0)){
      el.innerHTML='<div class="visual-empty">Daily history will fill from linked EVE mining ledgers.</div>';
      return;
    }
    const W=760,H=205,L=52,R=16,T=20,B=28,pw=W-L-R,ph=H-T-B,max=Math.max(1,...values)*1.1;
    const slot=pw/Math.max(1,rows.length),bar=Math.max(2,Math.min(22,slot*.62));
    let grid='';
    for(let i=0;i<=3;i++){
      const yy=T+i/3*ph,value=max*(1-i/3);
      grid+='<line x1="'+L+'" y1="'+yy.toFixed(1)+'" x2="'+(W-R)+'" y2="'+yy.toFixed(1)+'" class="fleet-chart-grid"/>'+
        '<text x="'+(L-7)+'" y="'+(yy+3).toFixed(1)+'" text-anchor="end" class="fleet-chart-axis">'+esc(compactNumber(value))+'</text>';
    }
    const maxValue=Math.max(...values),bestIndex=values.lastIndexOf(maxValue),todayIndex=rows.length-1;
    const bars=rows.map((row,i)=>{
      const value=values[i],height=Math.max(value>0?1:0,(value/max)*ph),xx=L+i*slot+(slot-bar)/2,yy=T+ph-height;
      const label=metric==='value'?fmt(value)+' ISK payout':fmt(value,'m3')+' m³';
      const cls='fleet-history-bar'+(i===bestIndex?' best':'')+(i===todayIndex?' today':'');
      return '<rect x="'+xx.toFixed(1)+'" y="'+yy.toFixed(1)+'" width="'+bar.toFixed(1)+'" height="'+height.toFixed(1)+'" rx="2" tabindex="0" role="button" aria-label="'+esc(chartDateLabel(row.date)+' • '+label)+'" data-chart-index="'+i+'" data-fleet-chart-date="'+esc(String(row.date||''))+'" class="'+cls+'"><title>'+esc(chartDateLabel(row.date)+' • '+label+(i===bestIndex?' • best day':'')+(i===todayIndex?' • today':''))+'</title></rect>';
    }).join('');
    const labelCount=Math.min(5,rows.length),indexes=new Set();
    if(rows.length===1)indexes.add(0);else for(let i=0;i<labelCount;i++)indexes.add(Math.round(i*(rows.length-1)/(labelCount-1)));
    const labels=[...indexes].map(i=>'<text x="'+(L+i*slot+slot/2).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" class="fleet-chart-axis">'+esc(chartDateLabel(rows[i].date))+'</text>').join('');
    el.innerHTML='<svg class="fleet-chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Daily fleet '+(metric==='value'?'payout':'mining volume')+' history">'+
      grid+bars+labels+'<text x="'+L+'" y="'+(T-7)+'" class="fleet-chart-unit">'+(metric==='value'?'ISK PAYOUT':'M³ MINED')+'</text></svg>';
    bindFleetChartInteractions(el,'.fleet-history-bar',(index)=>{
      const row=rows[index];
      if(!row)return'';
      const volume=Math.max(0,Number(row.m3)||0);
      const paid=Math.max(0,Number(row.jbv)||0)*payout;
      return '<strong>'+esc(chartDateLabel(row.date))+'</strong>'+
        '<span>'+esc(fmt(volume,'m3'))+' m³ mined</span>'+
        '<small>'+esc(fmt(paid))+' ISK tracked payout • '+(payout*100).toFixed(1)+'% payout basis</small>'+
        '<em>Click to '+(fleetChartPinnedDate===String(row.date||'')?'unpin':'pin')+' this day across both graphs</em>';
    });
  }
  function fleetDayProgressSeries(samples,dateKey){
    let total=0;
    const rows=(samples||[])
      .filter(row=>fleetChartDate(row?.at)===dateKey&&Number.isFinite(Date.parse(row?.at||'')))
      .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    const out=[{minute:0,total:0,at:dateKey+'T00:00:00.000Z'}];
    for(const row of rows){
      total+=Math.max(0,Number(row?.intervalM3)||0);
      const d=new Date(row.at);
      const minute=d.getUTCHours()*60+d.getUTCMinutes()+d.getUTCSeconds()/60;
      out.push({minute,total,at:row.at});
    }
    return out;
  }
  function renderFleetDayProgressChart(el,samples){
    if(!el)return;
    const todayKey=String(state?.serverNow||new Date().toISOString()).slice(0,10);
    const todayMs=Date.parse(todayKey+'T00:00:00Z');
    const yesterdayKey=Number.isFinite(todayMs)?new Date(todayMs-86400000).toISOString().slice(0,10):'';
    const today=fleetDayProgressSeries(samples,todayKey);
    const yesterday=fleetDayProgressSeries(samples,yesterdayKey);
    const todayHas=today.length>1&&today.at(-1).total>0;
    const yesterdayHas=yesterday.length>1&&yesterday.at(-1).total>0;
    if(!todayHas&&!yesterdayHas){
      el.innerHTML='<div class="visual-empty fleet-state-empty">Cumulative EVE-day production will appear after selected-fleet ledger intervals are recorded.</div>';
      return;
    }
    const W=760,H=205,L=52,R=112,T=20,B=28,pw=W-L-R,ph=H-T-B;
    const all=[...(todayHas?today:[]),...(yesterdayHas?yesterday:[])];
    const max=Math.max(1,...all.map(row=>row.total))*1.08;
    const x=minute=>L+Math.max(0,Math.min(1440,Number(minute)||0))/1440*pw;
    const y=value=>T+(1-Math.min(max,Math.max(0,Number(value)||0))/max)*ph;
    let grid='';
    for(let i=0;i<=3;i++){
      const yy=T+i/3*ph,value=max*(1-i/3);
      grid+='<line x1="'+L+'" y1="'+yy.toFixed(1)+'" x2="'+(W-R)+'" y2="'+yy.toFixed(1)+'" class="fleet-chart-grid"/>'+
        '<text x="'+(L-7)+'" y="'+(yy+3).toFixed(1)+'" text-anchor="end" class="fleet-chart-axis">'+esc(compactNumber(value))+'</text>';
    }
    const lineFor=(rows,cls)=>rows.length
      ?'<path d="M '+rows.map(row=>x(row.minute).toFixed(1)+' '+y(row.total).toFixed(1)).join(' L ')+'" class="'+cls+'"/>'
      :'';
    const series=[];
    if(yesterdayHas)series.push({key:'yesterday',date:yesterdayKey,label:'YESTERDAY',rows:yesterday,cls:'fleet-progress-yesterday'});
    if(todayHas)series.push({key:'today',date:todayKey,label:'TODAY',rows:today,cls:'fleet-progress-today'});
    const paths=series.map(row=>lineFor(row.rows,row.cls)).join('');
    const hits=series.flatMap(seriesRow=>seriesRow.rows.slice(1).map((row,index)=>{
      const title=seriesRow.label+' • '+new Date(row.at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit',timeZone:'UTC'})+' UTC • '+fmt(row.total,'m3')+' m³ cumulative';
      return '<circle cx="'+x(row.minute).toFixed(1)+'" cy="'+y(row.total).toFixed(1)+'" r="8" tabindex="0" role="button" class="fleet-progress-hit fleet-chart-hit" data-progress-series="'+seriesRow.key+'" data-chart-index="'+index+'" data-fleet-chart-date="'+seriesRow.date+'" aria-label="'+esc(title)+'"><title>'+esc(title)+'</title></circle>';
    })).join('');
    const ends=series.map(seriesRow=>{
      const row=seriesRow.rows.at(-1);
      return '<text x="'+(W-R+7)+'" y="'+Math.max(T+8,Math.min(T+ph-2,y(row.total)+(seriesRow.key==='today'?-4:10))).toFixed(1)+'" class="fleet-progress-label '+seriesRow.cls+'-label">'+seriesRow.label+' '+esc(compactNumber(row.total))+'</text>';
    }).join('');
    const labels=[0,360,720,1080,1440].map(minute=>'<text x="'+x(minute).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" class="fleet-chart-axis">'+String(Math.floor(minute/60)).padStart(2,'0')+':00</text>').join('');
    el.innerHTML='<svg class="fleet-chart-svg fleet-progress-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Cumulative EVE-day fleet production today versus yesterday">'+
      grid+paths+hits+ends+labels+'<text x="'+L+'" y="'+(T-7)+'" class="fleet-chart-unit">CUMULATIVE M³ • UTC</text></svg>';
    bindFleetChartInteractions(el,'.fleet-progress-hit',(index,node)=>{
      const key=node?.dataset?.progressSeries;
      const seriesRow=series.find(row=>row.key===key);
      const row=seriesRow?.rows?.slice(1)?.[index];
      if(!row||!seriesRow)return'';
      const when=new Date(row.at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit',timeZone:'UTC'});
      return '<strong>'+seriesRow.label+' • '+esc(when)+' UTC</strong>'+
        '<span>'+esc(fmt(row.total,'m3'))+' m³</span>'+
        '<small>cumulative selected-fleet volume by this point in the EVE day</small>'+
        '<em>Click to '+(fleetChartPinnedDate===seriesRow.date?'unpin':'pin')+' '+seriesRow.label.toLowerCase()+' across graphs</em>';
    });
  }

  function renderFleetOreMix(el,rows){
    if(!el)return;
    const totals=new Map();
    for(const row of rows)for(const [name,value] of Object.entries(row.ores||{}))totals.set(name,Number(totals.get(name)||0)+Math.max(0,Number(value)||0));
    const sorted=[...totals].filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]);
    if(!sorted.length){
      el.innerHTML='<div class="visual-empty">Ore mix will appear after synced ledger rows include ore types.</div>';
      return;
    }

    const grand=sorted.reduce((sum,[,value])=>sum+value,0);
    const topThree=sorted.slice(0,3).reduce((sum,[,value])=>sum+value,0);
    const topThreeShare=grand>0?topThree/grand*100:0;
    const [topName,topValue]=sorted[0];
    const topShare=grand>0?topValue/grand*100:0;
    const palette=['mix-a','mix-b','mix-c','mix-d','mix-e','mix-f','mix-g','mix-h'];

    const segments=sorted.map(([name,value],index)=>{
      const share=grand>0?value/grand*100:0;
      return '<i class="'+palette[index%palette.length]+'" style="width:'+share.toFixed(3)+'%" title="'+esc(name)+' • '+share.toFixed(1)+'% • '+fmt(value,'m3')+' m³"></i>';
    }).join('');

    const rowsHtml=sorted.map(([name,value],index)=>{
      const share=grand>0?value/grand*100:0;
      return '<div class="ore-mix-compact-row">'+
        '<span class="ore-mix-swatch '+palette[index%palette.length]+'"></span>'+
        '<strong title="'+esc(name)+'">'+esc(name)+'</strong>'+
        '<b>'+fmt(value,'m3')+' m³</b>'+
        '<small>'+share.toFixed(1)+'%</small>'+
      '</div>';
    }).join('');

    el.innerHTML=
      '<div class="ore-mix-kpis">'+
        '<div><span>TOTAL MINED</span><strong>'+fmt(grand,'m3')+' m³</strong><small>'+sorted.length+' ore type'+(sorted.length===1?'':'s')+'</small></div>'+
        '<div><span>TOP ORE</span><strong>'+esc(topName)+'</strong><small>'+fmt(topValue,'m3')+' m³ • '+topShare.toFixed(1)+'%</small></div>'+
        '<div><span>TOP 3 SHARE</span><strong>'+topThreeShare.toFixed(1)+'%</strong><small>concentration of mined volume</small></div>'+
      '</div>'+
      '<div class="ore-mix-composition" aria-label="Ore mix composition">'+segments+'</div>'+
      '<div class="ore-mix-compact-list">'+rowsHtml+'</div>';
  }
  function renderFleetPerformance(){
    if(!state||!$('fleetActivityChart'))return;
    const performance=scopedFleetPerformance();
    const daily=fleetHistoryRows(fleetHistoryDays),samples=performance.samples||[];
    const latest=samples.at(-1)||null,payout=Number(fleetSettings.payout||95)/100;
    const rangeM3=daily.reduce((sum,row)=>sum+Number(row.m3||0),0);
    const rangeValue=daily.reduce((sum,row)=>sum+Number(row.jbv||0),0)*payout;
    const historyStart=daily.length?chartDateLabel(daily[0].date):'—';
    const historyEnd=daily.length?chartDateLabel(daily[daily.length-1].date):'—';
    if($('fleetHistoryVolumeLabel'))$('fleetHistoryVolumeLabel').textContent=fleetHistoryDays+'D VOLUME';
    if($('fleetHistoryVolume'))$('fleetHistoryVolume').textContent=fmt(rangeM3,'m3')+' m³';
    if($('fleetHistoryPeriod'))$('fleetHistoryPeriod').textContent=historyStart+' — '+historyEnd;
    if($('fleetHistoryValueLabel'))$('fleetHistoryValueLabel').textContent=fleetHistoryDays+'D PAYOUT';
    if($('fleetHistoryValue'))$('fleetHistoryValue').textContent=fmt(rangeValue)+' ISK';
    if($('fleetHistoryValueSub'))$('fleetHistoryValueSub').textContent='tracked T3 • '+(payout*100).toFixed(1)+'% payout';
    const best=daily.reduce((top,row)=>Number(row.m3||0)>Number(top?.m3||0)?row:top,null);
    const fleet=fleetStats(),target=Number(fleet.total||0);
    const liveRate=Number(latest?.actualM3PerHour||0);
    const sampleAge=latest?Date.now()-Date.parse(latest.at||''):Infinity;
    const liveTargetPct=latest&&target>0?liveRate/target*100:null;

    document.querySelectorAll('.fleet-range').forEach(button=>button.classList.toggle('active',Number(button.dataset.days)===fleetHistoryDays));
    document.querySelectorAll('.fleet-metric').forEach(button=>button.classList.toggle('active',button.dataset.metric===fleetHistoryMetric));
    document.querySelectorAll('.fleet-rate-metric').forEach(button=>button.classList.toggle('active',button.dataset.rateMetric===fleetRateMetric));
    if($('fleetRateChartTitle'))$('fleetRateChartTitle').textContent=fleetRateMetric==='efficiency'?'EFFICIENCY OVER TIME':'SAMPLED RATE OVER TIME';
    const assignedCount=Math.max(0,Number(performance.characterIds?.length)||0);
    const cachedCount=Math.max(0,Number(performance.cachedCharacters)||0);
    const partialCoverage=assignedCount>0&&cachedCount>0&&cachedCount<assignedCount;
    const staleSample=Boolean(latest&&sampleAge>45*60*1000);
    let fleetDataState='ready';
    let fleetDataLabel=latest?'● READY':'● EMPTY';
    let fleetDataReason=latest?'Recent mining sample available.':'No mining sample is available for the selected fleet yet.';
    if(fleetPerformanceError){
      fleetDataState='error';
      fleetDataLabel='⚠ ERROR';
      fleetDataReason=fleetPerformanceError;
    }else if(state.esi?.syncing||fleetPerformanceSnapshotPromise){
      fleetDataState='waiting';
      fleetDataLabel='● SYNCING';
      fleetDataReason='JLR is refreshing the selected fleet mining ledger.';
    }else if(partialCoverage){
      fleetDataState='partial';
      fleetDataLabel='● PARTIAL '+cachedCount+'/'+assignedCount;
      fleetDataReason='Some selected miners are missing cached ledger data, so totals may be incomplete.';
    }else if(staleSample){
      fleetDataState='stale';
      fleetDataLabel='● STALE • SAMPLE '+ago(latest.at).toUpperCase();
      fleetDataReason='The most recent mining sample is older than 45 minutes.';
    }else if(latest){
      fleetDataState='ready';
      fleetDataLabel='● READY • SAMPLE '+ago(latest.at).toUpperCase();
      fleetDataReason='Recent mining sample available for review.';
    }else if(assignedCount<=0){
      fleetDataState='empty';
      fleetDataLabel='● NO FLEET';
      fleetDataReason='Select miners in Fleet & Fits to build a fleet review.';
    }
    const fleetStatus=$('fleetLiveStatus');
    if(fleetStatus){
      fleetStatus.textContent=fleetDataLabel;
      fleetStatus.title=fleetDataReason;
      fleetStatus.dataset.state=fleetDataState;
    }
    if($('fleetInsightText')&&$('fleetInsightDetail')&&$('fleetInsightMeter')&&$('fleetInsightPct')){
      const insight=$('fleetInsight');
      const activeToons=Math.max(0,Number(latest?.activeToons)||0);
      const sampledToons=Math.max(0,Number(latest?.sampledToons)||0);
      const missingToons=Math.max(0,sampledToons-activeToons);
      const previous=samples.length>1?samples[samples.length-2]:null;
      const previousRate=Math.max(0,Number(previous?.actualM3PerHour)||0);
      const sampleDropPct=previousRate>0&&liveRate<previousRate?(1-liveRate/previousRate)*100:null;
      const reason=$('fleetInsightReason');

      if(liveTargetPct!=null&&liveRate>0){
        const pct=Math.max(0,liveTargetPct);
        if(missingToons>0){
          $('fleetInsightText').textContent=missingToons+' MINER'+(missingToons===1?'':'S')+' SHOWED NO NEW MINING LEDGER VOLUME IN THE LATEST SAMPLE';
          $('fleetInsightDetail').textContent=activeToons+'/'+sampledToons+' miners showed new ledger volume • sampled fleet rate '+pct.toFixed(0)+'% of fitted target';
          if(reason)reason.textContent=sampleDropPct!=null&&sampleDropPct>=5
            ?'Rate dropped '+sampleDropPct.toFixed(0)+'% from the previous sample • a missed ledger interval can also be caused by reds/hostiles, movement, hauling, or another interruption.'
            :'A missed ledger interval does not prove a miner was idle • interruptions such as reds/hostiles or movement can also cause it.';
        }else{
          $('fleetInsightText').textContent=(sampledToons||activeToons)+'/'+(sampledToons||activeToons)+' MINERS SHOWED NEW LEDGER VOLUME IN THE LATEST SAMPLE';
          $('fleetInsightDetail').textContent=pct>=100
            ?'Sampled rate met the fitted target • every sampled miner showed new volume'
            :'Sampled rate was ~'+Math.max(0,100-pct).toFixed(0)+'% below fitted target • all sampled miners showed new volume';
          if(reason)reason.textContent=pct>=100
            ?'Review the history and miner comparison below for the completed mining session.'
            :'Ledger data cannot identify the cause by itself • reds/hostiles, travel, compression, hauling, pauses, or mining efficiency can all reduce the measured rate.';
        }
        $('fleetInsightMeter').style.width=Math.min(100,pct).toFixed(1)+'%';
        $('fleetInsightPct').textContent=pct.toFixed(0)+'%';
        insight?.classList.toggle('ahead',pct>=100);
        insight?.classList.toggle('low',pct<60);
      }else if(latest){
        $('fleetInsightText').textContent='NO MINING IN THE LATEST LEDGER INTERVAL';
        $('fleetInsightDetail').textContent='Latest sample '+ago(latest.at)+' • fitted target '+fmt(target,'m3')+' m³/hr';
        if(reason)reason.textContent='This usually means the mining session ended or no miner produced a new ledger entry in that interval.';
        $('fleetInsightMeter').style.width='0%';
        $('fleetInsightPct').textContent='0%';
        insight?.classList.remove('ahead');
        insight?.classList.add('low');
      }else{
        $('fleetInsightText').textContent='WAITING FOR A MINING LEDGER SAMPLE';
        $('fleetInsightDetail').textContent='JLR will compare recent mining samples with the selected fleet target.';
        if(reason)reason.textContent='Once ESI records mining, this area will summarize contribution and rate variance.';
        $('fleetInsightMeter').style.width='0%';
        $('fleetInsightPct').textContent='—';
        insight?.classList.remove('ahead','low');
      }
    }
    $('fleetLiveRate').textContent=latest?`${fmt(liveRate,'m3')} m³/hr`:'—';
    $('fleetLiveRateSub').textContent=latest?(liveRate>0?'latest ESI ledger delta • sampled':'no new mining volume in latest sample'):'waiting for a mining ledger change';
    const eveDayKey=String(state?.serverNow||new Date().toISOString()).slice(0,10);
    const todayRateSamples=samples
      .filter(row=>fleetChartDate(row?.at)===eveDayKey)
      .map(row=>Math.max(0,Number(row?.actualM3PerHour)||0))
      .filter(Number.isFinite);
    const todayAverageRate=todayRateSamples.length
      ?todayRateSamples.reduce((sum,value)=>sum+value,0)/todayRateSamples.length
      :null;
    if($('fleetTodayAvgRate'))$('fleetTodayAvgRate').textContent=todayAverageRate===null?'—':`${fmt(todayAverageRate,'m3')} m³/hr`;
    if($('fleetTodayAvgRateSub'))$('fleetTodayAvgRateSub').textContent=todayRateSamples.length
      ?todayRateSamples.length+' sample'+(todayRateSamples.length===1?'':'s')+' • UTC/EVE day mean'
      :'waiting for today’s sampled ledger rates';
    $('fleetActiveToons').textContent=latest?`${Number(latest.activeToons||0)} / ${Number(latest.sampledToons||0)}`:'—';
    $('fleetActiveToonsSub').textContent=latest?'miners with new volume / sampled':'miners in latest sample';
    const eveDayM3=Math.max(0,Number(performance.actual?.today?.m3)||0);
    const eveDayJbv=Math.max(0,Number(performance.actual?.today?.jbv)||0);
    const fleetValueState=fleetPerformanceError?'ERROR':(partialCoverage?'PARTIAL':(state.esi?.syncing||fleetPerformanceSnapshotPromise?'SYNCING':''));
    $('fleetTodayM3').textContent=eveDayM3>0?`${fmt(eveDayM3,'m3')} m³`:(fleetValueState||'—');
    $('fleetTodayPayout').textContent=eveDayJbv>0?`${fmt(actualValue(eveDayJbv))} ISK`:(fleetValueState||(liveRate>0?'PENDING':'—'));
    $('fleetTodayPayoutSub').textContent=eveDayJbv>0
      ?`current EVE day • exact T3 value × ${(payout*100).toFixed(1)}% payout`
      :(liveRate>0?'mining detected • waiting for current EVE-day T3 ledger rows':'no current EVE-day T3 ledger rows yet');
    $('fleetRangeTotalLabel').textContent=`${fleetHistoryDays}D MINED`;
    $('fleetRangeTotal').textContent=`${fmt(rangeM3,'m3')} m³`;
    $('fleetRangeTotalSub').textContent=`${fmt(rangeValue)} ISK tracked payout`;
    $('fleetBestDay').textContent=best&&Number(best.m3)>0?`${fmt(best.m3,'m3')} m³`:'—';
    $('fleetBestDaySub').textContent=best&&Number(best.m3)>0?chartDateLabel(best.date):'no production history yet';
    $('fleetHistoryTitle').textContent=fleetHistoryMetric==='value'?'DAILY PAYOUT':'DAILY OUTPUT';
    $('fleetHistorySubtitle').textContent=fleetHistoryMetric==='value'
      ?`How much tracked payout did the selected fleet generate each day? • last ${fleetHistoryDays} days`
      :`How much did the selected fleet mine each day? • last ${fleetHistoryDays} days`;
    $('fleetOreMixSubtitle').textContent=`What made up the mined volume? • selected fleet • last ${fleetHistoryDays} days`;
    renderFleetActivityChart($('fleetActivityChart'),samples,target,todayAverageRate,fleetRateMetric);
    renderFleetDailyChart($('fleetHistoryChart'),daily,fleetHistoryMetric);
    renderFleetDayProgressChart($('fleetDayProgressChart'),samples);
    renderFleetOreMix($('fleetOreMix'),daily);
  }
  function renderMiningVisuals(){
    if(!state||!$('oreValueChart')||!$('fleetOutputChart'))return;

    const ores=state.source?.ores||[];
    const trendOnly=state.source?.trendOres||[];
    const trendOres=[...ores,...trendOnly.filter(extra=>!ores.some(ore=>ore.name===extra.name))];
    const oreNames=trendOres.map(ore=>ore.name);
    if(!oreNames.includes(oreTrendType))oreTrendType=oreNames[0]||'Kylixium';
    const oreSelect=$('oreTrendSelect');
    if(oreSelect&&document.activeElement!==oreSelect){
      oreSelect.innerHTML=trendOres.map(ore=>'<option value="'+esc(ore.name)+'">'+esc(ore.name)+(trendOnly.some(extra=>extra.name===ore.name)?' • A0 ORE':'')+'</option>').join('');
      oreSelect.value=oreTrendType;
    }
    const trendOre=trendOres.find(ore=>ore.name===oreTrendType)||trendOres[0]||null;
    const currentJita=Number(trendOre?.market?.jita?.refinedBuyPerM3 ?? trendOre?.market?.jita?.buyPerM3 ?? trendOre?.jbvPerM3);
    const currentCn=Number(trendOre?.market?.cn?.refinedBuyPerM3 ?? trendOre?.market?.cn?.buyPerM3);
    const oreHistory=marketHistoryPoints('ore',trendOre?.name||oreTrendType,currentJita,currentCn);
    renderMarketLineChart($('oreValueChart'),oreHistory,{unit:'ISK/m³',decimals:2});

    const fleet=fleetStats();
    const entries=fleet.entries.filter(x=>x.result);
    if(!entries.length){
      $('fleetOutputChart').innerHTML='<div class="visual-empty">Select miners in Fleet & Fits to see fleet performance.</div>';
      return;
    }

    const uptime=Math.min(100,Math.max(1,Number(fleetSettings.uptime)||100));
    const potential=entries.reduce((sum,x)=>sum+Number(x.rawM3||0),0);
    const effective=Number(fleet.total||0);
    const lost=Math.max(0,potential-effective);
    const average=entries.length?effective/entries.length:0;
    const best=entries.reduce((top,row)=>!top||Number(row.effectiveM3)>Number(top.effectiveM3)?row:top,null);

    function activeTimeLabel(seconds){
      const s=Math.max(0,Number(seconds)||0);
      if(!s)return'no ledger increase detected';
      const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);
      return h?(`${h}h ${m}m active`):(`${Math.max(1,m)}m active`);
    }

    const contributionRows=entries.map((entry,index)=>{
      const fullRate=Number(entry.rawM3)||0;
      const output=Number(entry.effectiveM3)||0;
      const ledger=entry.character?.ledgerActivity||null;
      const actual=Number(ledger?.actualM3PerHour);
      const hasActual=Boolean(ledger?.miningDetected)&&Number.isFinite(actual)&&actual>0;
      const targetPct=output>0&&hasActual?actual/output*100:null;
      const share=effective>0?output/effective*100:0;
      return `<div class="fleet-perf-row compact">
        <div class="fleet-perf-miner">
          <strong>${esc(entry.character.name)}</strong>
          <small>${esc(entry.fit?.shipName||'Ship')} • ${share.toFixed(1)}% fleet target share</small>
        </div>
        <div class="fleet-perf-cell"><span>TARGET</span><strong>${fmt(output,'m3')}</strong><small>m³/hr</small></div>
        <div class="fleet-perf-cell ledger"><span>ACTIVE AVG</span><strong>${hasActual?fmt(actual,'m3'):'—'}</strong><small>${hasActual?activeTimeLabel(ledger.activeSeconds):'no active interval'}</small></div>
        <div class="fleet-perf-cell pct"><span>OF TARGET</span><strong>${targetPct==null?'—':targetPct.toFixed(0)+'%'}</strong><small>${fmt(fullRate,'m3')} at 100%</small></div>
      </div>`;
    }).join('');

    const detectedRows=entries.map(entry=>{
      const p=entry.character?.ledgerActivity;
      const v=Number(p?.actualM3PerHour);
      return p?.miningDetected&&Number.isFinite(v)&&v>0?{actual:v,target:Number(entry.effectiveM3)||0}:null;
    }).filter(Boolean);
    const ledgerActual=detectedRows.reduce((sum,row)=>sum+row.actual,0);
    const detectedTarget=detectedRows.reduce((sum,row)=>sum+row.target,0);
    const actualVsTarget=detectedTarget>0?ledgerActual/detectedTarget*100:null;

    $('fleetOutputChart').innerHTML=`
      <div class="fleet-perf-kpis">
        <div class="ledger-kpi"><span>ACTIVE AVG RATE</span><strong>${detectedRows.length?fmt(ledgerActual,'m3'):'—'}</strong><small>${detectedRows.length}/${entries.length} miners with tracked active time</small></div>
        <div><span>${uptime.toFixed(0)}% TARGET</span><strong>${fmt(effective,'m3')}</strong><small>selected fleet m³/hr</small></div>
        <div><span>100% RATE</span><strong>${fmt(potential,'m3')}</strong><small>full calculated m³/hr</small></div>
        <div><span>AVG / TARGET</span><strong>${actualVsTarget==null?'—':actualVsTarget.toFixed(0)+'%'}</strong><small>active-time averages only</small></div>
      </div>
      <div class="fleet-performance-summary-line">
        <span>ACTIVE AVG VS DETECTED TARGET</span>
        <strong>${detectedRows.length?fmt(ledgerActual,'m3'):'—'} / ${detectedTarget>0?fmt(detectedTarget,'m3'):'—'} m³/hr</strong>
        <b class="${actualVsTarget!=null&&actualVsTarget>=90?'good':actualVsTarget!=null&&actualVsTarget<60?'low':''}">${actualVsTarget==null?'WAITING':actualVsTarget.toFixed(0)+'%'}</b>
      </div>
      <div class="fleet-perf-list compact">${contributionRows}</div>
      <div class="fleet-perf-footer"><span>Active average uses only tracked intervals where mined m³ increased. The chart above shows the latest sampled interval separately.</span><span>${entries.length} miner${entries.length===1?'':'s'} selected</span></div>`;
  }


  function renderIceMining(){
    if(!state||!$('iceValueChart'))return;
    const iceRows=(state.source?.ice||[]).map(ice=>{
      const market=ice.market||{};
      const rawJita=Number(market.rawMarket?.jita?.buy);
      const track=Number(market.trackingBlockValue);
      const jita=Number(market.jita?.refinedBlockValue);
      const cn=Number(market.cn?.refinedBlockValue);
      return{
        name:ice.name,
        market,
        rawJita:Number.isFinite(rawJita)&&rawJita>0?rawJita:0,
        track:Number.isFinite(track)&&track>0?track:0,
        jita:Number.isFinite(jita)&&jita>0?jita:0,
        cn:Number.isFinite(cn)&&cn>0?cn:0,
        pct:Number(market.trackingPct||0),
      };
    });

    const names=iceRows.map(x=>x.name);
    if(!names.includes(iceTrackType))iceTrackType=names[0]||'Blue Ice IV-Grade';
    const select=$('iceTypeSelect');
    if(select&&document.activeElement!==select){
      select.innerHTML=iceRows.map(row=>'<option value="'+esc(row.name)+'">'+esc(row.name)+'</option>').join('');
      select.value=iceTrackType;
    }
    const selected=iceRows.find(x=>x.name===iceTrackType)||iceRows[0]||null;

    $('iceTrackValue').textContent=selected?.track?fmt(selected.track)+' ISK':'—';
    $('iceTrackValueSub').textContent=selected?(selected.name+' • '+Math.round(selected.pct*100)+'% of Jita refine • prices '+ago(state.market?.lastUpdatedAt)):'Waiting for Jita refined-product prices';
    $('iceBestJita').textContent=selected?.jita?fmt(selected.jita)+' ISK':'—';
    $('iceBestJitaSub').textContent=selected?(selected.name+' • refined ISK/block • Heavy Water excluded'):'Jita refined-product prices unavailable';
    $('iceBestCn').textContent=selected?.cn?fmt(selected.cn)+' ISK':'—';
    $('iceBestCnSub').textContent=selected?(selected.name+' • private-market ISK/block • Heavy Water excluded'):'C-N private refined-product prices unavailable';

    const range=Number(state.market?.titanBridgeRangeLy||6);
    const fields=Array.isArray(state.source?.iceFields)?state.source.iceFields:[];
    $('iceFieldCount').textContent=String(fields.length);
    $('iceBridgeRange').textContent='≤ '+range.toFixed(1)+' LY from C-N4OD';

    if(!iceRows.length){
      $('iceBlockTable').innerHTML='<div class="visual-empty">Ice market data is not loaded yet.</div>';
      $('iceValueChart').innerHTML='<div class="visual-empty">Ice market data is not loaded yet.</div>';
    }else{
      $('iceBlockTable').innerHTML=iceRows.map(row=>
        '<div class="ice-block-row">'+
          '<div><strong>'+esc(row.name)+'</strong><small>'+Math.round(row.pct*100)+'% Jita refine tracking</small></div>'+
          '<div><span>Jita refine</span><strong>'+(row.jita?fmt(row.jita):'—')+'</strong></div>'+
          '<div><span>Tracking payout</span><strong>'+(row.track?fmt(row.track):'—')+'</strong></div>'+
        '</div>'
      ).join('');

      const iceHistory=marketHistoryPoints('ice',selected?.name||iceTrackType,selected?.jita,selected?.cn);
      renderMarketLineChart($('iceValueChart'),iceHistory,{unit:'ISK/block',decimals:0});
    }

    const boosterId=String(calcSettings.boosterCharacterId||'');
    const selectedMiners=(me?.characters||[]).filter(ch=>{
      const id=String(ch.characterId);
      return fleetSettings.members?.[id]?.enabled&&id!==boosterId;
    });
    const rows=selectedMiners.map(ch=>{
      const fit=selectedFleetFit(ch);
      return iceFitStats(ch,fit)||{character:ch,fit,notApplicable:true};
    });
    const valid=rows.filter(row=>!row.notApplicable&&!row.error&&row.blocksPerHour>0);
    const actionable=rows.filter(row=>!row.notApplicable&&(row.error||!row.blocksPerHour));
    const hiddenNonIce=rows.filter(row=>row.notApplicable).length;

    if(!rows.length){
      $('iceFleetOutput').innerHTML='<div class="ice-fit-status empty"><strong>NO ICE FLEET SELECTED</strong><small>Select ice miners in Fleet & Fits to calculate output.</small></div>';
    }else if(!valid.length&&!actionable.length){
      $('iceFleetOutput').innerHTML='<div class="ice-fit-status empty"><strong>NO APPLICABLE ICE FITS</strong><small>'+fmt(hiddenNonIce)+' selected fleet member'+(hiddenNonIce===1?' is':'s are')+' currently using non-ice fits.</small></div>';
    }else{
      let totalBlocks=0,totalM3=0,totalTrack=0,totalJita=0,totalCn=0;
      const body=[...valid,...actionable].map(row=>{
        if(row.error||!row.blocksPerHour){
          return '<div class="ice-fit-issue"><div><strong>'+esc(row.character?.name||'Miner')+'</strong><small>'+esc(row.fit?.name||'Ice fit')+'</small></div><span>'+esc(row.error||'Ice fit needs attention')+'</span></div>';
        }
        const blocks=row.blocksPerHour,m3=row.m3PerHour;
        const track=blocks*Number(selected?.track||0);
        const jita=blocks*Number(selected?.jita||0);
        const cn=blocks*Number(selected?.cn||0);
        totalBlocks+=blocks;totalM3+=m3;totalTrack+=track;totalJita+=jita;totalCn+=cn;
        return '<div class="ice-fleet-row">'+
          '<div><strong>'+esc(row.character.name)+'</strong><small>'+esc(row.fit.shipName)+' • '+esc(row.fit.name||'Saved fit')+' • '+row.cycle.toFixed(1)+'s cycle</small></div>'+
          '<div><span>Blocks/hr</span><strong>'+blocks.toFixed(1)+'</strong></div>'+
          '<div><span>m³/hr</span><strong>'+fmt(m3,'m3')+'</strong></div>'+
          '<div><span>Payout/hr</span><strong>'+(track?fmt(track):'—')+'</strong></div>'+
          '<div><span>Jita refine/hr</span><strong>'+(jita?fmt(jita):'—')+'</strong></div>'+
          '<div><span>C-N refine/hr</span><strong>'+(cn?fmt(cn):'—')+'</strong></div>'+
        '</div>';
      }).join('');
      const hidden=hiddenNonIce
        ?'<div class="ice-fit-hidden"><strong>'+fmt(hiddenNonIce)+' NON-ICE FLEET MEMBER'+(hiddenNonIce===1?'':'S')+' HIDDEN</strong><span>Only applicable ice fits are shown here.</span></div>'
        :'';
      const total=valid.length
        ?'<div class="ice-fleet-total"><span>'+esc(iceTrackType)+' fleet total</span><strong>'+
          totalBlocks.toFixed(1)+' blocks/hr • '+fmt(totalM3,'m3')+' m³/hr</strong><small>Payout '+
          (totalTrack?fmt(totalTrack):'—')+'/hr • Jita refine '+(totalJita?fmt(totalJita):'—')+
          '/hr • C-N refine '+(totalCn?fmt(totalCn):'—')+'/hr</small></div>'
        :'';
      $('iceFleetOutput').innerHTML=body+hidden+total;
    }
  }
  function wormholeGasSiteDefinitions(siteName){
    const sites=state?.source?.gas?.regions?.Wormhole?.sites;
    return (Array.isArray(sites)?sites:[]).filter(site=>String(site.name||'')===String(siteName||''));
  }
  function renderWormholeGasTracker(){
    const host=$('gasWormholeTracker'),summary=$('gasWormholeSummary');
    if(!host||!summary)return;
    const wormholes=state?.source?.gas?.wormholes||{};
    const reports=Array.isArray(wormholes.reports)?wormholes.reports:[];
    const signatures=reports.reduce((sum,row)=>sum+(Array.isArray(row?.sites)?row.sites.length:0),0);
    const dueCount=reports.filter(row=>Boolean(row?.due)).length;
    summary.innerHTML='<strong>'+fmt(reports.length)+' J-SPACE SYSTEM'+(reports.length===1?'':'S')+'</strong><span>'+
      fmt(signatures)+' GAS SIGNATURE'+(signatures===1?'':'S')+' • '+(dueCount?fmt(dueCount)+' UPDATE'+(dueCount===1?'':'S')+' DUE':'ALL CURRENT')+
      ' • complete scans replace that system\'s previous list</span>';
    if(!reports.length){
      host.innerHTML='<div class="visual-empty">No wormhole gas scans shared yet. Enter a J-system, copy the complete Probe Scanner list, then use PASTE WH SCAN.</div>';
      return;
    }
    host.innerHTML=reports.map(report=>{
      const system=String(report?.system||'J-space');
      const due=Boolean(report?.due);
      const sites=Array.isArray(report?.sites)?report.sites:[];
      const reporter=String(report?.reportedBy||'fleet');
      const siteHtml=sites.length?sites.map(site=>{
        const definitions=wormholeGasSiteDefinitions(site?.siteName);
        const gasMix=definitions.map(def=>{
          const short=String(def.gas||'').replace(/^Fullerite-/i,'');
          return short+' '+fmt(Number(def.units)||0);
        }).join(' • ');
        const selectedGas=gasRegion==='Wormhole'&&definitions.some(def=>String(def.gas)===String(gasType));
        return '<div class="gas-wh-site'+(selectedGas?' selected-gas':'')+'">'+
          '<div><span class="gas-wh-sig">'+esc(site?.signatureId||'SIG')+'</span><strong>'+esc(site?.siteName||'Gas Site')+'</strong></div>'+
          '<small>'+esc(gasMix||'Wormhole Fullerite site')+'</small>'+
        '</div>';
      }).join(''):'<div class="gas-wh-empty-site">No known wormhole gas signatures in the latest complete scan.</div>';
      return '<article class="gas-wh-system '+(due?'due':'fresh')+'">'+
        '<div class="gas-wh-system-head"><div><strong>'+esc(system)+'</strong><small>scanned '+esc(ago(report?.lastScanAt))+' • '+esc(reporter)+'</small></div>'+
          '<div class="gas-wh-system-actions"><span class="gas-wh-state">'+(due?'UPDATE DUE':'CURRENT')+'</span>'+
          '<button class="gas-wh-remove" data-system="'+esc(system)+'" type="button" title="Remove this wormhole from the shared gas tracker">REMOVE</button></div></div>'+
        '<div class="gas-wh-sites">'+siteHtml+'</div>'+
      '</article>';
    }).join('');
  }
  function applyPreviewWormholeGas(preview){
    const report=preview?.gasWormhole?.report;
    if(!report||!state?.source?.gas)return false;
    state.source.gas.wormholes ||= {reports:[],reportHours:12};
    const reports=Array.isArray(state.source.gas.wormholes.reports)?state.source.gas.wormholes.reports:[];
    state.source.gas.wormholes.reports=[report,...reports.filter(row=>String(row?.system||'')!==String(report.system||''))];
    renderWormholeGasTracker();
    return true;
  }
  function renderGasHuffing(){
    if(!state||!$('gasFleetOutput'))return;
    const gasData=state.source?.gas||null;
    const regions=gasData?.regions||{};
    const types=gasData?.types||{};
    const regionNames=Object.keys(regions).sort((a,b)=>a==='Wormhole'?1:b==='Wormhole'?-1:a.localeCompare(b));
    if(!gasData||!regionNames.length){
      $('gasFleetOutput').innerHTML='<div class="visual-empty">Gas data is not loaded yet.</div>';
      return;
    }

    if(!regions[gasRegion])gasRegion=regionNames[0];
    const region=regions[gasRegion]||{};
    const regionGases=Array.isArray(region.gases)?region.gases.filter(name=>types[name]):[];
    if(!regionGases.includes(gasType))gasType=region.defaultGas&&types[region.defaultGas]?region.defaultGas:(regionGases[0]||Object.keys(types)[0]||'');
    localStorage.setItem('jlrGasRegion',gasRegion);
    localStorage.setItem('jlrGasType',gasType);

    const regionSelect=$('gasRegionSelect');
    if(regionSelect&&document.activeElement!==regionSelect){
      regionSelect.innerHTML=regionNames.map(name=>'<option value="'+esc(name)+'">'+esc(name.toUpperCase())+'</option>').join('');
      regionSelect.value=gasRegion;
    }
    const typeSelect=$('gasTypeSelect');
    if(typeSelect&&document.activeElement!==typeSelect){
      typeSelect.innerHTML=regionGases.map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('');
      typeSelect.value=gasType;
    }

    const gas=types[gasType]||null;
    if(!gas){
      $('gasFleetOutput').innerHTML='<div class="visual-empty">The selected gas type is not loaded yet.</div>';
      return;
    }
    const market=gas.market||{};
    const gasVolume=Math.max(.001,Number(gas.volume)||10);
    const rawJita=Number(market.raw?.jita?.buy);
    const rawCn=Number(market.raw?.cn?.buy);
    const compressedJita=Number(market.compressed?.jita?.buy);
    const compressedCn=Number(market.compressed?.cn?.buy);
    const uptime=Math.min(100,Math.max(1,Number(fleetSettings.uptime)||100))/100;
    const gasFamily=/^Fullerite-/i.test(gasType)?'FULLERITE':(/Mykoserocin/i.test(gasType)?'MYKOSEROCIN':'CYTOSEROCIN');

    $('gasRegionEyebrow').textContent=gasRegion.toUpperCase()+' • '+gasFamily;
    $('gasRawLabel').textContent='RAW JITA / UNIT';
    $('gasCompressedLabel').textContent='COMPRESSED JITA / UNIT';
    $('gasRawJita').textContent=Number.isFinite(rawJita)&&rawJita>0?fmt(rawJita)+' ISK':'—';
    $('gasRawJitaSub').textContent=Number.isFinite(rawCn)&&rawCn>0
      ?gasType+' • C-N '+fmt(rawCn)+' • prices '+ago(state.market?.lastUpdatedAt)
      :gasType+' • prices '+ago(state.market?.lastUpdatedAt);
    $('gasCompressedJita').textContent=Number.isFinite(compressedJita)&&compressedJita>0?fmt(compressedJita)+' ISK':'—';
    $('gasCompressedJitaSub').textContent=Number.isFinite(compressedCn)&&compressedCn>0
      ?'compressed 1:1 • C-N '+fmt(compressedCn)
      :'compressed 1:1 equivalent';
    $('gasOpsType').textContent=gasType;
    $('gasOpsRegion').textContent=gasRegion+' • '+gasFamily+' • '+gasVolume.toFixed(gasVolume%1?1:0)+' m³ per raw unit';
    if($('gasOpsReference'))$('gasOpsReference').textContent=gasRegion+' • '+gasFamily.toLowerCase()+' huffing reference';
    $('gasSiteTitle').textContent='KNOWN '+gasRegion.toUpperCase()+' GAS SITES';

    const boosterId=String(calcSettings.boosterCharacterId||'');
    const selected=(me?.characters||[]).filter(ch=>{
      const id=String(ch.characterId);
      return fleetSettings.members?.[id]?.enabled&&id!==boosterId;
    });
    const rows=selected.map(ch=>{
      const fit=selectedFleetFit(ch);
      return gasFitStats(ch,fit)||{character:ch,fit,notApplicable:true};
    });
    const valid=rows.filter(row=>!row.notApplicable&&!row.error&&row.m3PerHour>0);
    const actionable=rows.filter(row=>!row.notApplicable&&(row.error||!row.m3PerHour));
    const hiddenNonGas=rows.filter(row=>row.notApplicable).length;
    const fullM3=valid.reduce((sum,row)=>sum+Number(row.m3PerHour||0),0);
    const targetM3=fullM3*uptime;
    const fullUnits=fullM3/gasVolume;
    const targetUnits=fullUnits*uptime;
    const rawJitaHour=Number.isFinite(rawJita)&&rawJita>0?targetUnits*rawJita:0;
    const rawCnHour=Number.isFinite(rawCn)&&rawCn>0?targetUnits*rawCn:0;
    const compressedJitaHour=Number.isFinite(compressedJita)&&compressedJita>0?targetUnits*compressedJita:0;

    $('gasFleetM3').textContent=valid.length?fmt(targetM3,'m3')+' m³/hr':'—';
    $('gasFleetM3Sub').textContent=valid.length
      ?valid.length+' gas huffer'+(valid.length===1?'':'s')+' • '+Math.round(uptime*100)+'% uptime • '+fmt(fullM3,'m3')+' full rate'
      :'Select gas fits in Fleet & Fits';
    $('gasFleetIsk').textContent=rawJitaHour?fmt(rawJitaHour)+' ISK/hr':'—';
    $('gasFleetIskSub').textContent=rawJitaHour
      ?fmt(targetUnits)+' '+gasType+' units/hr • raw Jita buy'
      :'Waiting for gas fleet + Jita price';

    if(!rows.length){
      $('gasFleetOutput').innerHTML='<div class="gas-fit-status empty"><strong>NO GAS FLEET SELECTED</strong><small>Select gas huffers in Fleet & Fits to calculate output.</small></div>';
    }else if(!valid.length&&!actionable.length){
      $('gasFleetOutput').innerHTML='<div class="gas-fit-status empty"><strong>NO APPLICABLE GAS FITS</strong><small>'+fmt(hiddenNonGas)+' selected fleet member'+(hiddenNonGas===1?' is':'s are')+' currently using non-gas fits.</small></div>';
    }else{
      const body=[...valid,...actionable].map(row=>{
        if(row.error||!row.m3PerHour){
          return '<div class="gas-fit-issue"><div><strong>'+esc(row.character?.name||'Huffer')+'</strong><small>'+esc(row.fit?.name||'Gas fit')+'</small></div><span>'+esc(row.error||'Gas fit needs attention')+'</span></div>';
        }
        const m3=row.m3PerHour*uptime,units=m3/gasVolume;
        const jita=Number.isFinite(rawJita)&&rawJita>0?units*rawJita:0;
        const boostName=row.boost?.ship&&row.boost.ship!=='None'?row.boost.ship:'No boost';
        const range=row.range>0?(row.range/1000).toFixed(1)+' km':'—';
        return '<div class="ice-fleet-row gas-fleet-row">'+
          '<div><strong>'+esc(row.character.name)+'</strong><small>'+esc(row.fit.shipName)+' • '+esc(row.fit.name||'Saved fit')+' • '+esc(boostName)+' • '+range+' range</small></div>'+
          '<div><span>Cycle</span><strong>'+row.cycle.toFixed(1)+'s</strong></div>'+
          '<div><span>Units/hr</span><strong>'+fmt(units)+'</strong></div>'+
          '<div><span>m³/hr</span><strong>'+fmt(m3,'m3')+'</strong></div>'+
          '<div><span>Jita/hr</span><strong>'+(jita?fmt(jita):'—')+'</strong></div>'+
          '<div><span>Residue</span><strong>'+esc(row.residueSummary||'NONE')+'</strong></div>'+
        '</div>';
      }).join('');
      const hidden=hiddenNonGas
        ?'<div class="gas-fit-hidden"><strong>'+fmt(hiddenNonGas)+' NON-GAS FLEET MEMBER'+(hiddenNonGas===1?'':'S')+' HIDDEN</strong><span>Only applicable gas fits are shown here.</span></div>'
        :'';
      const total=valid.length
        ?'<div class="ice-fleet-total"><span>'+esc(gasType)+' fleet target</span><strong>'+
          fmt(targetUnits)+' units/hr • '+fmt(targetM3,'m3')+' m³/hr</strong><small>Raw Jita '+
          (rawJitaHour?fmt(rawJitaHour):'—')+'/hr • Raw C-N '+(rawCnHour?fmt(rawCnHour):'—')+
          '/hr • Compressed Jita '+(compressedJitaHour?fmt(compressedJitaHour):'—')+'/hr</small></div>'
        :'';
      $('gasFleetOutput').innerHTML=body+hidden+total;
    }

    const sites=(Array.isArray(region.sites)?region.sites:[]).filter(site=>site.gas===gasType);
    $('gasSiteTable').innerHTML=sites.length?sites.map(site=>{
      const units=Number(site.units)||0,m3=units*gasVolume;
      const clearHours=targetUnits>0?units/targetUnits:null;
      const clear=clearHours==null?'—':clearHours<1?(clearHours*60).toFixed(0)+' min':clearHours.toFixed(1)+' hr';
      return '<div class="gas-site-row '+(site.guarded?'guarded':'unguarded')+'">'+
        '<div><strong>'+esc(site.name)+'</strong><small>'+esc(site.security||site.region||gasRegion)+' • '+Number(site.clouds||1)+' cloud'+(Number(site.clouds||1)===1?'':'s')+'</small></div>'+
        '<div><span>Gas</span><strong>'+fmt(units)+' units</strong><small>'+fmt(m3,'m3')+' m³</small></div>'+
        '<div><span>Fleet clear</span><strong>'+clear+'</strong><small>'+Math.round(uptime*100)+'% uptime</small></div>'+
        '<div><span>Risk</span><strong>'+(site.guarded?'GUARDED':'UNGUARDED')+'</strong><small>'+esc(site.hazard||'—')+'</small></div>'+
      '</div>';
    }).join(''):'<div class="visual-empty">No '+esc(gasType)+' site references are loaded for '+esc(gasRegion)+'.</div>';

    $('gasModuleTable').innerHTML=Object.entries(GAS_MODULES).map(([name,spec])=>
      '<div class="gas-module-row">'+
        '<div><strong>'+esc(name)+'</strong><small>'+esc(spec.family==='SCOOP'?'Frigate scoop':'Barge / exhumer harvester')+'</small></div>'+
        '<div><span>Base cycle</span><strong>'+Number(spec.duration).toFixed(0)+'s</strong></div>'+
        '<div><span>Base yield</span><strong>'+Number(spec.yieldM3).toFixed(0)+' m³</strong></div>'+
        '<div><span>Residue</span><strong>'+(Number(spec.residueChance)>0?Math.round(Number(spec.residueChance)*100)+'% ×'+Number(spec.residueMultiplier):'NONE')+'</strong></div>'+
      '</div>'
    ).join('');
    renderWormholeGasTracker();
  }

  function renderRanking(){
    if(!state)return;
    const list=$('oreRanking');
    list.innerHTML='';
    const fleetRate=fleetM3();
    const uptime=Math.min(100,Math.max(1,Number(fleetSettings.uptime)||100));
    const payout=Number(fleetSettings.payout)||95;
    $('oreRankingSummary').textContent=fleetRate>0
      ?`${fmt(fleetRate,'m3')} m³/hr @ ${uptime.toFixed(0)}% uptime • ${payout.toFixed(1)}% payout • Jita max-refine basis`
      :'Select miners to calculate payout/hr and site clear time.';

    const head=document.createElement('div');
    head.className='rank-table-head';
    head.innerHTML='<span>ORE / SYSTEMS</span><span>FULL SITE</span><span>PAYOUT / HR</span><span>EST. CLEAR</span>';
    list.appendChild(head);

    for(const ore of state.source.ores){
      const clearHours=fleetRate>0?Number(ore.siteM3)/fleetRate:NaN;
      const clearMinutes=Number.isFinite(clearHours)?clearHours*60:NaN;
      const row=document.createElement('div');
      row.className='rank-row';
      row.innerHTML=`
        <div class="rank-main">
          <div class="rank-badge">#${ore.rank}</div>
          <div class="rank-ore-copy">
            <strong>${esc(ore.name)}</strong>
            <small>${ore.systems.join(' • ')}</small>
            <small>Jita refine ${ore.jbvPerM3.toFixed(2)} ISK/m³</small>
          </div>
        </div>
        <div class="rank-num"><strong>${fmt(ore.siteM3,'m3')} m³</strong><small>${fmt(ore.siteJBV)} ISK refined</small></div>
        <div class="rank-num"><strong>${fleetRate>0?fmt(projectedISK(ore))+'/hr':'—'}</strong><small>${payout.toFixed(1)}% payout</small></div>
        <div class="rank-num"><strong>${Number.isFinite(clearMinutes)?(clearMinutes<60?clearMinutes.toFixed(0)+' min':clearHours.toFixed(1)+' hr'):'—'}</strong><small>at selected fleet target</small></div>`;
      list.appendChild(row);
    }
  }
  function renderTimers(){
    if(!state)return;const active=definitions().map(d=>({d,f:field(d.system)})).filter(x=>x.f.status==='cleared'&&x.f.timerEndsAt).sort((a,b)=>Date.parse(a.f.timerEndsAt)-Date.parse(b.f.timerEndsAt));$('timerCount').textContent=`${active.length} respawning`;if(!active.length){$('activeTimers').innerHTML='<div class="timer-item"><div><strong>No fields currently respawning</strong><small>Marking a field RED starts its fixed 10-hour countdown here.</small></div></div>';return}$('activeTimers').innerHTML='';for(const x of active){const d=document.createElement('div');d.className='timer-item';d.innerHTML=`<div><strong>${x.d.system}${x.f.cherryPicked?' 🍒':''}</strong><small>${x.d.ore} • cleared ${ago(x.f.updatedAt)} • time remaining</small></div><div class="timer-value">${timer(x.f.timerEndsAt)}</div>`;$('activeTimers').appendChild(d)}
  }
  function renderSelected(){
    if(!state||!selectedSystem)return;
    const d=def(selectedSystem),f=field(selectedSystem);if(!d||!f)return;
    const status=f.status==='cleared'?`RED • RESPAWN ${timer(f.timerEndsAt)}`:statusText[f.status];
    $('selectedDetail').innerHTML=`<strong>#${d.rank} ${esc(d.ore)}</strong><span>${esc(status)}${f.autoReopenedAt?` • ESI VERIFIED ${esc(ago(f.autoReopenedAt))}`:''}${f.cherryPicked?' • 🍒 CHERRY':''} • ${fmt(projectedISK(state.source.ores[d.rank-1]))} payout/hr</span>`;
    const timerActive=f.status==='cleared'&&Date.parse(f.timerEndsAt)>Date.now();
    for(const id of ['markGreen','markYellow','markRed'])$(id).disabled=timerActive;
  }
  function renderNotes(){const f=field(selectedSystem),notes=f?.notes||[];$('fieldNotes').innerHTML=notes.length?notes.slice().reverse().map(n=>`<div class="field-note"><span>${esc(n.text)}</span><time>${esc(ago(n.createdAt))}</time></div>`).join(''):'<span class="field-notes-empty">No notes for this system yet.</span>'}
  function renderScanCharacters(){
    const select=$('scanCharacter'),button=$('pasteScan');
    if(!select||!button||!me)return;
    const chars=me.characters||[];
    if(!chars.some(c=>String(c.characterId)===String(scanCharacterId))){
      scanCharacterId=String(chars.find(c=>String(c.characterId)===String(me.primaryCharacterId))?.characterId||chars[0]?.characterId||'');
    }
    select.innerHTML=chars.length
      ?chars.map(c=>`<option value="${esc(c.characterId)}">${esc(c.name)}${c.locationAccess?'':' — UPDATE ACCESS'}</option>`).join('')
      :'<option value="">No linked toons</option>';
    select.value=scanCharacterId;
    select.disabled=!chars.length||scanBusy;
    const selected=chars.find(c=>String(c.characterId)===String(scanCharacterId));
    button.disabled=!selected||scanBusy;
    button.textContent=scanBusy?'CHECKING…':selected&&!selected.locationAccess?'UPDATE ACCESS':'📋 PASTE SCAN';
    const gasSelect=$('gasScanCharacter'),gasButton=$('gasPasteScan');
    if(gasSelect){
      gasSelect.innerHTML=select.innerHTML;
      gasSelect.value=scanCharacterId;
      gasSelect.disabled=!chars.length||scanBusy;
    }
    if(gasButton){
      gasButton.disabled=!selected||scanBusy;
      gasButton.textContent=scanBusy?'CHECKING…':selected&&!selected.locationAccess?'UPDATE ACCESS':'📋 PASTE WH SCAN';
    }
    if(selected&&!selected.locationAccess)setScanStatus('One-time EVE location access is required.','warning');
  }
  function renderCharacters(){
    if(!me)return;
    const host=$('characterList');
    if(!host)return;
    const chars=Array.isArray(me.characters)?me.characters:[];
    const linked=chars.length;
    const ledgerReady=chars.filter(c=>c.miningAccess!==false&&c.ledgerCached!==false&&!c.needsReauth&&!c.lastError).length;
    const locationReady=chars.filter(c=>Boolean(c.locationAccess)).length;
    const needsAttention=chars.filter(c=>
      c.miningAccess===false||
      Boolean(c.needsReauth)||
      c.ledgerCached===false||
      Boolean(c.lastError)
    ).length;
    if($('toonLinkedCount'))$('toonLinkedCount').textContent=String(linked);
    if($('toonLedgerReady'))$('toonLedgerReady').textContent=linked?ledgerReady+'/'+linked:'0';
    if($('toonLocationReady'))$('toonLocationReady').textContent=linked?locationReady+'/'+linked:'0';
    if($('toonNeedsAttention')){
      $('toonNeedsAttention').textContent=String(needsAttention);
      $('toonNeedsAttention').classList.toggle('attention',needsAttention>0);
    }

    host.innerHTML='';
    if(!linked){
      host.innerHTML='<div class="toon-empty"><strong>No toons linked yet.</strong><span>ADD TOON connects an EVE character for mining ledgers, saved fits, skills, assets, and optional location features.</span></div>';
      return;
    }

    for(const ch of chars){
      const id=String(ch.characterId||'');
      const row=document.createElement('article');
      const savedFits=Number(ch.savedFittingsCount ?? (ch.fittings||[]).length)||0;
      const miningFits=(ch.fittings||[]).length;
      const abyssal=Number(ch.abyssalStripCount||0);
      const missingMiningAccess=ch.miningAccess===false;
      const waitingLedger=ch.ledgerCached===false&&!missingMiningAccess;
      const accessIssue=Boolean(ch.needsReauth||missingMiningAccess);
      const syncError=Boolean(ch.lastError);
      const stateKey=syncError||accessIssue?'attention':waitingLedger?'waiting':'ready';
      const stateLabel=syncError?'SYNC ERROR':accessIssue?'ACCESS NEEDED':waitingLedger?'FIRST LEDGER PENDING':'DATA READY';
      const isPrimary=String(me.primaryCharacterId||'')===id;
      const lastSync=ch.lastSyncAt?ago(ch.lastSyncAt):'not synced yet';
      const fitsUpdated=ch.fittingsUpdatedAt?ago(ch.fittingsUpdatedAt):'not refreshed yet';
      const badges=[
        '<span class="toon-badge '+(missingMiningAccess?'bad':'good')+'">'+(missingMiningAccess?'LEDGER OFF':'LEDGER ON')+'</span>',
        '<span class="toon-badge '+(ch.locationAccess?'good':'muted')+'">'+(ch.locationAccess?'LOCATION ON':'LOCATION OFF')+'</span>',
        '<span class="toon-badge neutral">'+miningFits+' MINING FIT'+(miningFits===1?'':'S')+'</span>',
        abyssal?'<span class="toon-badge accent">'+abyssal+' ABYSSAL</span>':'',
        ch.marketAuthorized?'<span class="toon-badge good">C-N MARKET</span>':'',
      ].filter(Boolean).join('');
      const marketButton=ch.marketEligible
        ?'<button class="toon-action '+(ch.marketAuthorized?'connected':'')+' market-auth" data-id="'+esc(id)+'" type="button">'+(ch.marketAuthorized?'C-N MARKET CONNECTED':'CONNECT C-N MARKET')+'</button>'
        :'';
      const accessButton=(ch.needsReauth||missingMiningAccess||!ch.locationAccess)
        ?'<button class="toon-action reauth" type="button">UPDATE ACCESS</button>'
        :'';
      const issueText=syncError
        ?String(ch.lastError||'EVE sync failed.')
        :missingMiningAccess
          ?'Mining-ledger permission is missing.'
          :waitingLedger
            ?'Waiting for this toon’s first successful mining-ledger cache.'
            :!ch.locationAccess
              ?'Location access is optional, but Adam routing cannot follow this toon yet.'
              :'Skills, ledger and account access are current.';

      row.className='character-row toon-character-card toon-state-'+stateKey;
      row.dataset.id=id;
      row.innerHTML=
        '<div class="toon-identity">'+
          '<img src="'+esc(ch.portrait)+'" alt="">'+
          '<div><div class="toon-name-line"><strong>'+esc(ch.name)+'</strong>'+(isPrimary?'<span class="toon-primary">PRIMARY</span>':'')+'</div>'+
          '<small>'+esc(issueText)+'</small></div>'+
        '</div>'+
        '<div class="toon-data">'+
          '<div class="toon-state-line"><span class="toon-state-dot"></span><strong>'+stateLabel+'</strong><small>full sync '+esc(lastSync)+'</small></div>'+
          '<div class="toon-badges">'+badges+'</div>'+
          '<div class="toon-meta"><span>'+savedFits+' saved fits</span><span>fits '+esc(fitsUpdated)+'</span></div>'+
        '</div>'+
        '<div class="character-actions">'+
          marketButton+
          '<button class="toon-action fit-refresh" data-id="'+esc(id)+'" type="button" title="Refresh saved fits, assets, and Abyssal strip-miner rolls for this toon.">↻ UPDATE FITS</button>'+
          accessButton+
          '<button class="toon-action danger disconnect" data-id="'+esc(id)+'" type="button">DISCONNECT</button>'+
        '</div>';
      host.appendChild(row);
    }

    host.querySelectorAll('.market-auth').forEach(button=>button.addEventListener('click',()=>{
      location.href='/auth/eve/market/start?character='+encodeURIComponent(button.dataset.id);
    }));
    host.querySelectorAll('.fit-refresh').forEach(button=>button.addEventListener('click',async()=>{
      const original=button.textContent;
      button.disabled=true;
      button.textContent='UPDATING…';
      try{
        const requestedAt=Date.now();
        const payload=await api('/api/esi/fittings/'+encodeURIComponent(button.dataset.id),{method:'POST',body:'{}'});
        me=payload.user;
        renderAll();
        const fitSync=payload.fitSync||{};
        const assetCache=fitSync.assetsEsiCache||null;
        const sourceMs=Date.parse(assetCache?.lastModified||'');
        const freshUntilMs=Date.parse(assetCache?.freshUntil||'');
        const servedCached=Number.isFinite(sourceMs)&&requestedAt-sourceMs>15000&&Number.isFinite(freshUntilMs)&&freshUntilMs>Date.now();
        if(servedCached){
          toast((fitSync.characterName||'Toon')+': fittings checked • ESI is still serving Abyssal assets from '+ago(assetCache.lastModified)+' • cache refresh '+until(assetCache.freshUntil));
        }else{
          toast((fitSync.characterName||'Toon')+': '+Number(fitSync.savedFittingsCount||0)+' saved fits • '+Number(fitSync.miningFittingsCount||0)+' mining fits • Abyssal data checked');
        }
      }catch(error){
        button.disabled=false;
        button.textContent=original;
        toast(error.message);
      }
    }));
    host.querySelectorAll('.reauth').forEach(button=>button.addEventListener('click',()=>{
      location.href='/auth/eve/start?intent=link';
    }));
    host.querySelectorAll('.disconnect').forEach(button=>button.addEventListener('click',async()=>{
      if(!confirm('Disconnect this mining toon from JLR?'))return;
      try{
        const payload=await api('/api/me/characters/'+button.dataset.id,{method:'DELETE'});
        me=payload.user;
        renderCharacters();
        renderCalculator();
        toast('Toon disconnected.');
      }catch(error){toast(error.message)}
    }));
  }

  function renderCalculator(){
    if(!me||!$('calcResults'))return;
    const data=calcData(),engine=window.JLRYieldMath;
    if(!data||!engine){$('calcResults').innerHTML='<div class="calc-empty">Mining output data is unavailable. Reload after the current deployment or data refresh completes.</div>';return}

    const chars=me.characters||[];
    const boosterSel=$('calcBoosterCharacter'),boosterFitSel=$('calcBoosterFitting');
    boosterSel.innerHTML='<option value="">No fleet booster</option>'+chars.map(ch=>`<option value="${ch.characterId}">${esc(ch.name)}</option>`).join('');
    if(!chars.some(ch=>String(ch.characterId)===String(calcSettings.boosterCharacterId)))calcSettings.boosterCharacterId='';
    boosterSel.value=calcSettings.boosterCharacterId;

    const booster=calcCharacter(calcSettings.boosterCharacterId);
    const boostFits=boosterFits(booster);
    boosterFitSel.innerHTML='<option value="">No saved booster fit</option>'+boostFits.map(f=>`<option value="${f.fittingId}">${esc(f.shipName)} — ${esc(f.name)}</option>`).join('');
    if(!boostFits.some(f=>String(f.fittingId)===String(calcSettings.boosterFittingId)))calcSettings.boosterFittingId=boostFits[0]?String(boostFits[0].fittingId):'';
    if(!calcSettings.boosterCharacterId)calcSettings.boosterFittingId='';
    boosterFitSel.value=calcSettings.boosterFittingId;
    const boosterFit=calcFitting(booster,calcSettings.boosterFittingId);

    const detectedBoostCharges=engine.detectBoostCharges(boosterFit);
    $('calcBoostCharges').textContent=detectedBoostCharges.names.length?detectedBoostCharges.names.join(' + '):'No supported mining burst charges detected';
    $('calcMindlink').checked=Boolean(calcSettings.mindlink);

    const boost=engine.boostBreakdown(data,booster?.skills||{},boosterFit,Boolean(calcSettings.mindlink));
    const boostActive=Boolean(boosterInFleet()&&boosterFit&&boost.ship!=='None');
    const boostStatus=boostActive?'ACTIVE':boosterFit?'READY — ADD BOOSTER TO FLEET':'NONE';
    const boostSource=boosterFit
      ?`${boost.ship} • ${boost.core} core • ${boost.burst} burst${calcSettings.mindlink?' • mindlink':''}`
      :'Select a booster toon and saved fit';
    $('boostStats').innerHTML=`
      <article class="calc-card boost-status-card ${boostActive?'boost-live':''}"><span>BOOST STATUS</span><strong>${esc(boostStatus)}</strong><small>${esc(boostSource)}</small></article>
      <article class="calc-card"><span>CYCLE REDUCTION</span><strong>${(Number(boost.cycleReduction||0)*100).toFixed(2)}%</strong><small>Mining Laser Optimization</small></article>
      <article class="calc-card"><span>EFFICIENCY BURST</span><strong>${(Number(boost.efficiencyBoost||0)*100).toFixed(1)}%</strong><small>Mining Laser Efficiency strength</small></article>
      <article class="calc-card"><span>RANGE BOOST</span><strong>${(Number(boost.rangeBonus||0)*100).toFixed(1)}%</strong><small>Mining Laser Field Enhancement</small></article>`;

    if(!chars.length){
      $('calcResults').innerHTML='<div class="calc-empty">Connect a mining toon first.</div>';
      return;
    }

    const boosterId=String(calcSettings.boosterCharacterId||'');
    const enabledMiners=chars.filter(ch=>fleetSettings.members?.[String(ch.characterId)]?.enabled&&String(ch.characterId)!==boosterId);
    const minerNeedsReauth=enabledMiners.some(ch=>ch.needsReauth||!Object.keys(ch.skills||{}).length);
    const boosterNeedsReauth=Boolean(boosterInFleet()&&booster&&boosterFit&&(booster.needsReauth||!Object.keys(booster.skills||{}).length));

    if(!enabledMiners.length){
      $('calcResults').innerHTML='<div class="calc-empty">Select your miners and saved fits above.</div>';
      return;
    }
    if(minerNeedsReauth){
      $('calcResults').innerHTML='<div class="calc-empty">Update access for the selected miner, then use Sync EVE Data.</div>';
      return;
    }
    if(boosterNeedsReauth){
      $('calcResults').innerHTML='<div class="calc-empty">Update access for the selected booster, then use Sync EVE Data.</div>';
      return;
    }

    const fleetView=fleetStats();
    const representative=fleetView.entries.find(x=>x.result);
    if(!representative){
      const firstError=fleetView.entries.find(x=>x.error)?.error;
      $('calcResults').innerHTML=`<div class="calc-empty">${firstError?`⚠ ${esc(firstError)}`:'Choose a supported saved mining fit, then use Sync EVE Data.'}</div>`;
      return;
    }

    const result=representative.result;
    const minerFit=representative.fit;
    const firstLaser=result.lasers[0];
    const detectedCrystal=engine.detectCrystal(minerFit);
    const fleetCount=fleetView.count,fleet=fleetView.total;
    const shipSub=fleetCount>1?`${esc(representative.character.name)} • ${fleetCount} miners selected`:`${esc(representative.character.name)} • ${esc(minerFit.name||'Saved fit')}`;

    $('calcResults').innerHTML=`
      <article class="calc-card compact-ship-stat"><span>REFERENCE MINER</span><strong>${esc(result.shipName)}</strong><small>${shipSub}</small></article>
      <article class="calc-card expanded-stat"><span>100% FIT RATE</span><strong>${fmt(representative.rawM3,'m3')} m³/hr</strong><small>${result.m3PerSecond.toFixed(2)} m³/s • selected fit + skills + boosts</small></article>
      <article class="calc-card cycle-stat"><span>STRIP CYCLE</span><strong>${firstLaser?firstLaser.duration.toFixed(2):'—'} sec</strong><small>${esc(result.shipName)} • crystal ${esc(detectedCrystal)}</small></article>
      <article class="calc-card expanded-stat"><span>FLEET @ ${Number(fleetSettings.uptime).toFixed(0)}%</span><strong>${fmt(fleet,'m3')} m³/hr</strong><small>${fleetCount} selected miners • uptime-adjusted output</small></article>`;

    localStorage.setItem('jlrMiningCalc',JSON.stringify(calcSettings));
  }
  function closeLedgerAudit(){
    const panel=$('ledgerAuditPanel');
    if(panel)panel.classList.add('hidden');
  }
  function renderLedgerAudit(data){
    myLedgerSummary=data||null;
    const payout=Math.min(100,Math.max(1,Number(fleetSettings.payout)||95))/100;
    if(state)renderTop();
    const rows=Array.isArray(data&&data.characters)?data.characters:[];
    const linked=Number(data&&data.linkedCharacters||0);
    const cached=Number(data&&data.cachedCharacters||0);
    const missing=Number(data&&data.missingCharacters||0);
    const totals=data&&data.totals||{};
    const totalM3=Number(totals.m3||0);
    const rawValue=Number(totals.jbv||0);
    const unpricedM3=Number(totals.unpricedM3||0);
    const title=$('ledgerAuditTitle'),summary=$('ledgerAuditSummary'),body=$('ledgerAuditBody');
    if(title)title.textContent='EVE DAY '+String(data&&data.date||'—')+' (UTC)';
    if(summary)summary.textContent=cached+'/'+linked+' linked characters included'+(missing?' • '+missing+' waiting for ledger cache':'')+'.';
    if(!body)return;
    const basis='JLR Native • CCP ESI Jita buy';
    const list=rows.map(row=>{
      const ready=Boolean(row.cacheReady);
      const sync=row.lastSyncAt?ago(row.lastSyncAt):'not synced';
      return '<article class="ledger-audit-row'+(ready?'':' missing')+'">'+
        '<div class="ledger-audit-pilot"><strong>'+esc(row.name||row.characterId)+'</strong><small>'+(ready?'ledger cached • sync '+esc(sync):'WAITING FOR LEDGER CACHE')+'</small></div>'+
        '<div><span>VOLUME</span><strong>'+(ready?esc(fmt(row.m3,'m3'))+' m³':'—')+'</strong></div>'+
        '<div><span>REFINED VALUE</span><strong>'+(ready?esc(fmt(row.jbv))+' ISK':'—')+'</strong></div>'+
        '<div><span>PAYOUT</span><strong>'+(ready?esc(fmt(Number(row.jbv||0)*payout))+' ISK':'—')+'</strong></div>'+
      '</article>';
    }).join('');
    body.innerHTML='<div class="ledger-audit-totals">'+
      '<div><span>CHARACTERS</span><strong>'+cached+'/'+linked+'</strong><small>ledger cache included</small></div>'+
      '<div><span>VOLUME</span><strong>'+esc(fmt(totalM3,'m3'))+' m³</strong><small>EVE day UTC</small></div>'+
      '<div><span>RAW REFINED</span><strong>'+esc(fmt(rawValue))+' ISK</strong><small>'+esc(basis)+'</small></div>'+
      '<div><span>'+esc((payout*100).toFixed(1))+'% PAYOUT</span><strong>'+esc(fmt(rawValue*payout))+' ISK</strong><small>'+(unpricedM3>0?esc(fmt(unpricedM3,'m3'))+' m³ awaiting price':'all cached volume priced')+'</small></div>'+
      '</div><div class="ledger-audit-list">'+(list||'<div class="visual-empty">No linked characters found.</div>')+'</div>';
  }
  async function openLedgerAudit(){
    const panel=$('ledgerAuditPanel');
    if(!panel||ledgerAuditLoading)return;
    panel.classList.remove('hidden');
    if($('ledgerAuditTitle'))$('ledgerAuditTitle').textContent='EVE DAY (UTC)';
    if($('ledgerAuditSummary'))$('ledgerAuditSummary').textContent='Checking every toon linked to this account…';
    if($('ledgerAuditBody'))$('ledgerAuditBody').innerHTML='<div class="visual-empty">Loading per-toon ledger totals…</div>';
    ledgerAuditLoading=true;
    try{
      if(myLedgerSummary)renderLedgerAudit(myLedgerSummary);
      renderLedgerAudit(await api('/api/ledger-audit'));
    }
    catch(error){
      if($('ledgerAuditSummary'))$('ledgerAuditSummary').textContent='Could not load the ledger audit.';
      if($('ledgerAuditBody'))$('ledgerAuditBody').innerHTML='<div class="visual-empty">'+esc(error.message||error)+'</div>';
    }finally{ledgerAuditLoading=false;}
  }

  function renderAll(){if(!state)return;renderFleet();renderTop();renderTrackerBrain();renderSelect();renderBoards();renderHits();renderFleetPerformance();renderMiningVisuals();renderIceMining();renderGasHuffing();renderRanking();renderTimers();renderSelected();renderNotes();renderScanCharacters();renderCharacters();renderCalculator();renderMerIntel();if(activeTab==='ceo')renderCeoCommand();}

  async function refreshMe(){const p=await api('/api/me');me=p.user;if(me){window.jlrAlarmAccountId=String(me.id||'');window.jlrTestAccess=Boolean(me?.jlrTestAccess?.allowed);$('userName').textContent=me.displayName;$('userPortrait').src=me.portrait;syncDoctrineTabAccess();syncTrackerTabAccess();syncCeoTabAccess()}return p.authenticated}
  async function loadState(){
    const [nextState,myLedger]=await Promise.all([
      api('/api/state'),
      api('/api/ledger-audit').catch(error=>{console.warn('My ledger summary load failed',error);return null}),
    ]);
    state=nextState;
    if(myLedger)myLedgerSummary=myLedger;
    renderAll();
  }
  async function refreshFleetPerformanceData(showStatus=false){
    if(fleetPerformanceRefreshPromise)return fleetPerformanceRefreshPromise;
    const pending=(async()=>{
      const [nextState,,myLedger]=await Promise.all([
        api('/api/state'),
        refreshMe(),
        api('/api/ledger-audit').catch(error=>{console.warn('My ledger summary refresh failed',error);return null}),
      ]);
      state=nextState;
      if(myLedger)myLedgerSummary=myLedger;
      await refreshFleetPerformanceSnapshot(true);
      renderAll();
      renderDataStatus();
      if(showStatus&&activeTab==='performance')toast('Fleet Performance updated.');
      return state;
    })().catch(error=>{
      console.warn('Fleet Performance auto-refresh failed',error);
      return null;
    }).finally(()=>{
      if(fleetPerformanceRefreshPromise===pending)fleetPerformanceRefreshPromise=null;
    });
    fleetPerformanceRefreshPromise=pending;
    return pending;
  }
  function scheduleStateRender(){
    stateRenderPending=true;
    if(document.hidden||stateRenderFrame)return;
    const schedule=typeof window.requestAnimationFrame==='function'
      ?window.requestAnimationFrame.bind(window)
      :(callback)=>setTimeout(callback,16);
    stateRenderFrame=schedule(()=>{
      stateRenderFrame=0;
      if(document.hidden||!stateRenderPending)return;
      stateRenderPending=false;
      renderAll();
      renderDataStatus();
    });
  }

  function connectSse(){
    if(eventSource)eventSource.close();
    eventSource=new EventSource('/api/events');
    eventSource.addEventListener('state',e=>{
      const previousSync=state?.esi?.lastSyncAt||null;
      const nextState=JSON.parse(e.data);
      const syncChanged=Boolean(nextState?.esi?.lastSyncAt&&nextState.esi.lastSyncAt!==previousSync);
      state=nextState;
      if(syncChanged){
        refreshMe()
          .then(()=>refreshFleetPerformanceSnapshot(true))
          .then(scheduleStateRender)
          .catch(scheduleStateRender);
      }else{
        scheduleStateRender();
      }
    });
    eventSource.onerror=()=>{$('liveBadge').textContent='⚠ DATA CONNECTION LOST';$('liveBadge').title='Live dashboard updates disconnected; the page is attempting to reconnect.'};
  }

  document.addEventListener('change',async event=>{
    const target=event.target;
    if(target?.id==='scoutCharacterSelect'){
      scoutSelectedCharacterId=String(target.value||'');
      localStorage.setItem('jlrScoutCharacter',scoutSelectedCharacterId);
      scoutTargets=[];scoutTargetsError='';scoutTargetsOriginSystem='';
      await pollScoutLocation(true);
      await loadScoutTargets(true);
    }else if(target?.id==='brainFollowEnabled'){
      scoutFollowEnabled=target.value==='on';
      localStorage.setItem('jlrScoutFollow',String(scoutFollowEnabled));
      if(!scoutFollowEnabled){
        scoutLocations.clear();scoutLocationErrors.clear();scoutLastSystem.clear();scoutPromptKey='';
        $('brainScanPrompt')?.classList.add('hidden');
        $('scoutGlobalAlert')?.classList.add('hidden');
      }
      startScoutLocationWatch();
    }
  });

  document.addEventListener('click',async event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    if(target.closest('#brainCompanionPair')){
      await createCompanionPairCode();
      return;
    }
    if(target.closest('#brainCompanionCopy')){
      await copyCompanionPairCode();
      return;
    }
    if(target.closest('#brainCompanionRefresh')){
      await refreshCompanionStatus();
      return;
    }
    if(target.closest('#brainCompanionRevoke')){
      await revokeCompanionDevices();
      return;
    }
    const scoutTarget=target.closest('[data-scout-field]');
    if(scoutTarget){
      const system=String(scoutTarget.dataset.scoutField||'');
      if(system){
        if(scoutSelectedCharacterId&&(me?.characters||[]).some(ch=>String(ch.characterId)===String(scoutSelectedCharacterId))){
          scanCharacterId=scoutSelectedCharacterId;
          localStorage.setItem('jlrScanCharacter',scanCharacterId);
          renderScanCharacters();
        }
        adamRecordAction('scout-target',{system});
        applyTab('fields');
        chooseSystem(system);
        toast('Adam target: '+system);
      }
      return;
    }
    const copySystem=target.closest('.adam-copy-system[data-copy-system]');
    if(copySystem){
      const system=String(copySystem.dataset.copySystem||'').trim();
      if(system){
        try{
          await navigator.clipboard.writeText(system);
          copySystem.textContent='COPIED ✓';
          toast(system+' copied for EVE.');
          setTimeout(()=>{if(copySystem.isConnected)copySystem.textContent='COPY SYSTEM'},1400);
        }catch(error){
          toast('Could not copy '+system+'.');
        }
      }
      return;
    }
    if(target.closest('#adamAsk')){
      await askAdamText($('adamQuestion')?.value||'');
      return;
    }
    if(target.closest('#adamQuickToggle')){
      const panel=$('adamQuickPanel');
      if(panel){
        const opening=panel.classList.contains('hidden');
        panel.classList.toggle('hidden',!opening);
        $('adamQuickToggle')?.setAttribute('aria-expanded',String(opening));
        if(opening){
          renderAdamContext();
          if(scoutFollowEnabled){
            void pollScoutLocation(true);
            void loadScoutTargets(true);
          }
          setTimeout(()=>$('adamQuickQuestion')?.focus(),0);
        }
      }
      return;
    }
    if(target.closest('#adamQuickClose')){
      $('adamQuickPanel')?.classList.add('hidden');
      $('adamQuickToggle')?.setAttribute('aria-expanded','false');
      return;
    }
    if(target.closest('#adamQuickAsk')){
      await askAdamText($('adamQuickQuestion')?.value||'');
      return;
    }
    if(target.closest('#scoutCheckNow')){
      await pollScoutLocation(true);
      await loadScoutTargets(true);
      const ch=(me?.characters||[]).find(row=>String(row.characterId)===String(scanCharacterId));
      adamRecordAction('location-check',{characterName:String(ch?.name||'')});
      toast('Adam routes refreshed.');
      return;
    }
    if(target.closest('#brainScanOpen')||target.closest('#scoutGlobalOpen')){
      const id=String($('brainScanPrompt')?.dataset.characterId||$('scoutGlobalAlert')?.dataset.characterId||'');
      if((me?.characters||[]).some(ch=>String(ch.characterId)===id)){
        scanCharacterId=id;
        localStorage.setItem('jlrScanCharacter',id);
        renderScanCharacters();
      }
      applyTab('fields');
      $('pasteScan')?.scrollIntoView({behavior:'smooth',block:'center'});
      $('pasteScan')?.focus();
      return;
    }
    const feedbackType=target.closest('.feedback-type');
    if(feedbackType){
      document.querySelectorAll('.feedback-type').forEach(button=>button.classList.toggle('active',button===feedbackType));
      return;
    }
    if(target.closest('#feedbackRefresh')){
      await loadFeedbackHistory(true);
      return;
    }
    if(target.closest('#feedbackSubmit')){
      const submit=$('feedbackSubmit');
      const type=document.querySelector('.feedback-type.active')?.dataset.feedbackType||'suggestion';
      const title=String($('feedbackTitle')?.value||'').trim();
      const message=String($('feedbackMessage')?.value||'').trim();
      const sourceTab=String(feedbackOpenedFrom||'general');
      const area=String($('feedbackArea')?.value||sourceTab||'general');
      const impact=String($('feedbackImpact')?.value||'normal');
      const steps=String($('feedbackSteps')?.value||'').trim();
      const expected=String($('feedbackExpected')?.value||'').trim();
      if(!message){toast('Tell us what happened or what you want changed.');$('feedbackMessage')?.focus();return}
      if(submit)submit.disabled=true;
      try{
        const ledger=state?.esi?.ledgerDebug||{};
        const context={
          version:state?.app?.version||'2.10.12',
          sourceTab,
          selectedSystem:selectedSystem||$('systemSelect')?.value||'',
          displayMode:$('app')?.classList.contains('expanded')?'expanded':'compact',
          theme:String(activeTheme||''),
          viewport:String(window.innerWidth)+'x'+String(window.innerHeight),
          browser:String(navigator.userAgent||'').slice(0,500),
          serverNow:state?.serverNow||null,
          eveData:{
            syncing:Boolean(state?.esi?.syncing),
            lastSyncAt:state?.esi?.lastSyncAt||null,
            hasError:Boolean(state?.esi?.lastError),
            cachedCharacters:Number(ledger.cachedCharacters||0),
            linkedCharacters:Number(ledger.linkedCharacters||0),
            cacheHealthy:Boolean(ledger.cacheHealthy),
            todayRows:Number(ledger.todayRows||0),
            matchedT3Rows:Number(ledger.matchedT3Rows||0)
          },
          selectedFleetMiners:typeof selectedFleetPerformanceIds==='function'?selectedFleetPerformanceIds().length:0,
          marketLastUpdatedAt:state?.market?.lastUpdatedAt||null
        };
        await api('/api/tracker/feedback',{method:'POST',body:JSON.stringify({type,title,message,area,impact,steps,expected,context})});
        $('feedbackTitle').value='';
        $('feedbackMessage').value='';
        $('feedbackSteps').value='';
        $('feedbackExpected').value='';
        feedbackHistory=[];
        await loadFeedbackHistory(true);
        toast('Feedback submitted to JLR. Thank you.');
      }catch(error){
        toast(error?.message||'Feedback could not be submitted.');
      }finally{
        if(submit)submit.disabled=false;
      }
      return;
    }
    const decision=target.closest('.brain-decision-row[data-system]');
    if(decision?.dataset.system){
      brainLastSystem=decision.dataset.system;
      chooseSystem(brainLastSystem);
      return;
    }
  });

  document.addEventListener('keydown',event=>{
    if(!['adamQuestion','adamQuickQuestion'].includes(event.target?.id))return;
    if(event.key==='Enter'&&!event.shiftKey){
      event.preventDefault();
      void askAdamText(event.target.value||'');
    }
  });

  document.addEventListener('click',async event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;

    const briefButton=target.closest('#trackerBriefMe');
    if(briefButton){
      briefButton.disabled=true;
      try{
        const briefing=await api('/api/tracker/brain/briefing?force=1');
        const summary=$('trackerBrainSummary');
        if(summary)summary.textContent=String(briefing?.text||'No current briefing.');
      }catch(error){
        toast(error?.message||'Briefing could not be loaded.');
      }finally{
        briefButton.disabled=false;
      }
      return;
    }

    const whyButton=target.closest('#trackerWhySystem');
    if(whyButton){
      const system=selectedSystem||$('systemSelect')?.value||'';
      if(!system){toast('Select a T3 system first.');return}
      whyButton.disabled=true;
      try{
        const explanation=await api('/api/tracker/brain/why?system='+encodeURIComponent(system));
        const summary=$('trackerBrainSummary');
        if(summary&&explanation?.facts?.length)summary.textContent=system+': '+explanation.facts.join(' ');
      }catch(error){
        toast(error.message||String(error));
      }finally{
        whyButton.disabled=false;
      }
    }
  });

  function addToon(){location.href='/auth/eve/start?intent=link'}
  $('addToon').addEventListener('click',addToon);$('addToonTop').addEventListener('click',addToon);
  $('logout').addEventListener('click',async()=>{try{await api('/auth/logout',{method:'POST',body:'{}'})}catch{}location.href='/' });
  $('compactMode').addEventListener('click',()=>applyMode('compact'));$('expandedMode').addEventListener('click',()=>applyMode('expanded'));
  $('themeSelect').value=activeTheme;
  syncThemeControl(activeTheme);
  $('themeSelect').addEventListener('change',()=>applyTheme($('themeSelect').value));
  $('targetOreSelect').addEventListener('change',()=>{
    targetOre=$('targetOreSelect').value||'auto';
    localStorage.setItem('jlrTargetOre',targetOre);
    renderHits();
  });
  $('boardArrange').addEventListener('click',toggleBoardArrange);
  $('boardSize').addEventListener('click',cycleBoardSize);
  $('boardReset').addEventListener('click',resetBoardOrder);
  $('fleetArrange').addEventListener('click',()=>{
    if(!fleetArrangeMode){
      const visibleIds=[...document.querySelectorAll('#fleetMemberList .fleet-member')].map(row=>String(row.dataset.id||'')).filter(Boolean);
      const remainingIds=(me?.characters||[]).map(character=>String(character.characterId)).filter(id=>!visibleIds.includes(id));
      fleetSettings.order=[...visibleIds,...remainingIds];
      fleetSortMode='custom';
      localStorage.setItem('jlrFleetSortMode',fleetSortMode);
      localStorage.setItem('jlrFleet',JSON.stringify(fleetSettings));
    }
    fleetArrangeMode=!fleetArrangeMode;
    renderFleet();
  });
  $('fleetOrderReset').addEventListener('click',()=>{
    fleetSettings.order=[];
    if(fleetSortMode==='custom')fleetSortMode='yield-asc';
    localStorage.setItem('jlrFleetSortMode',fleetSortMode);
    localStorage.setItem('jlrFleet',JSON.stringify(fleetSettings));
    renderFleet();
    toast('Custom toon order reset.');
  });
  syncBoardControls();
  $('systemSelect').addEventListener('change',()=>chooseSystem($('systemSelect').value));
  $('scanCharacter').addEventListener('change',()=>{scanCharacterId=$('scanCharacter').value;localStorage.setItem('jlrScanCharacter',scanCharacterId);const ch=(me?.characters||[]).find(row=>String(row.characterId)===String(scanCharacterId));adamRecordAction('toon-select',{characterName:String(ch?.name||'')});renderScanCharacters();renderAdamContext();pollScoutLocation(true)});
  document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));renderBoards()}));

  function applyFieldUpdate(system,updatedField){state.fields[system]=updatedField;renderAll()}
  function applyPreviewBoardScan(preview){
    const boardScan=preview?.boardScan;
    const serverScan=preview?.serverScan;
    const scan=serverScan?.lastScanAt?serverScan:boardScan;
    if(!state||!preview?.system||!scan?.lastScanAt)return false;
    state.scans ||= {};
    state.scans[preview.system]={
      ...(state.scans[preview.system]||{}),
      ...scan,
      lastScanAt:scan.lastScanAt,
      due:false,
      nextUpdateAt:scan.nextUpdateAt||null,
      scannerRowCount:Number(scan.scannerRowCount)||0,
      kinds:Array.isArray(scan.kinds)?scan.kinds:[],
      ice:scan.ice||null,
      t3:scan.t3||null,
      source:scan.source||'probe-scan',
    };
    renderBoards();
    return true;
  }
  function openScanPaste(){
    $('scanPasteText').value='';
    $('scanPastePanel').classList.remove('hidden');
    setTimeout(()=>$('scanPasteText').focus(),0);
  }
  function closeScanPaste(){$('scanPastePanel').classList.add('hidden')}
  async function analyzeProbeScan(text,{fromAdam=false}={}){
    if(scanBusy){setScanStatus('A scan is already being checked.','warning');return}
    const selected=(me?.characters||[]).find(c=>String(c.characterId)===String(scanCharacterId));
    if(!selected){setScanStatus('Choose a linked mining toon before sending a scan.','error');toast('Choose a linked mining toon first.');return}
    if(!selected.locationAccess){
      if(fromAdam){setScanStatus('Update the selected toon’s EVE location access before sending scans to Adam.','error');return}
      location.href='/auth/eve/start?intent=link';return;
    }
    scanBusy=true;renderScanCharacters();setScanStatus(`Checking ${selected.name} location…`);
    try{
      const scanRequestAt=Date.now();
      const preview=await api('/api/scans/preview',{method:'POST',body:JSON.stringify({characterId:selected.characterId,text})});
      const appliedScan=applyPreviewBoardScan(preview);
      const appliedWormholeGas=applyPreviewWormholeGas(preview);
      if(preview?.boardScan?.recorded||preview?.tracked||preview?.a0?.tracked||preview?.gasWormhole?.recorded){
        const updatedSystem=String(preview.system||'');
        adamRecordAction('scan-updated',{system:updatedSystem,characterName:String(preview.characterName||selected.name||''),detail:'Probe Scanner update accepted'});
        if(updatedSystem&&scoutPromptKey.endsWith(':'+updatedSystem)){
          scoutPromptKey='';
          $('brainScanPrompt')?.classList.add('hidden');
          $('scoutGlobalAlert')?.classList.add('hidden');
          adamMarkCurrent();
          document.title='JLR Tracker';
        }
      }
      if(preview?.tracked&&preview?.scan?.valid){
        const recordedAt=Date.parse(preview?.serverScan?.lastScanAt||preview?.boardScan?.lastScanAt||'');
        const fresh=Number.isFinite(recordedAt)&&recordedAt>=scanRequestAt-5000;
        if(!preview?.boardScan?.recorded||!appliedScan||!fresh){
          const parser=preview?.boardScan?.parserStatus||{};
          throw new Error('FIELD-SCAN-E01: Probe Scanner rows were recognized, but the Fields board timestamp was not committed. T3='+String(Boolean(parser.t3))+' ICE='+String(Boolean(parser.ice))+' A0='+String(Boolean(parser.a0))+'.');
        }
      }
      if(preview?.boardScan?.recorded||preview?.a0?.scan?.valid||preview?.gasWormhole?.scan?.valid){
        if(scoutPromptKey===String(selected.characterId)+':'+String(preview.system)){
          $('brainScanPrompt')?.classList.add('hidden');
          scoutPromptKey='';
        }
        scoutTargets=[];
        scoutTargetsOriginSystem='';
        void loadScoutTargets(true);
      }
      if(preview.a0?.tracked){
        if(preview.a0.scan?.detected){
          setScanStatus(`${preview.system}: A0 rare asteroid site detected — board updated for 12 hours.`,'success');
          toast(`${preview.system} A0 site added/updated on the board.`);
        }else{
          setScanStatus(`${preview.system}: A0 checked — no active site detected. Update due again in 12 hours.`,'success');
        }
      }
      if(preview?.gasWormhole?.recorded){
        const gasCount=Math.max(0,Number(preview?.gasWormhole?.scan?.detectedCount)||0);
        const gasMessage=gasCount
          ?preview.system+': '+gasCount+' wormhole gas signature'+(gasCount===1?'':'s')+' tracked for 12 hours.'
          :preview.system+': wormhole gas scan current — no known gas signatures detected.';
        setScanStatus(gasMessage,'success');
        toast(gasMessage);
        if(appliedWormholeGas)renderGasHuffing();
      }
      if(!preview.tracked){
        if(preview.a0?.tracked)return;
        if(preview.gasWormhole?.recorded)return;
        if(preview.boardScan?.recorded){
          const ice=preview.boardScan.ice;
          if(ice){
            const summary=ice.missing>0?`${ice.seen}/${ice.expected} ice fields seen • ${ice.missing} missing`:`${ice.seen}/${ice.expected} ice fields seen • all present`;
            setScanStatus(`${preview.system}: ${summary}. Next update requested in 12 hours.`,ice.missing>0?'warning':'success');
            toast(`${preview.system}: ${summary}.`);
          }else{
            setScanStatus(`${preview.system}: board scan time updated. Next update requested in 12 hours.`,'success');
            toast(`${preview.system} scan timestamp updated.`);
          }
          return;
        }
        setScanStatus(`${preview.characterName} is in ${preview.system}, which is not on the tracked T3/ICE/A0/GAS board.`,'warning');
        toast(`No tracked T3, ICE, A0, or wormhole gas field for ${preview.system}.`);
        return;
      }
      chooseSystem(preview.system);
      const expected=preview.scan?.expectedNames?.[0]||`${preview.definition.ore} deposit`;
      if(preview.scan?.detected){
        if(preview.correction?.applied){
          applyFieldUpdate(preview.system,preview.field);
          setScanStatus(`${preview.system}: ${preview.definition.ore} detected on repost — false RED corrected to GREEN.`,'success');
          $('fieldMessage').textContent=`${preview.system} scan found ${preview.definition.ore}; the previous clear report was corrected and the respawn timer was cancelled.`;
          toast(`${preview.system}: repost corrected the previous clear report.`);
          sfx('systemSelect');
          return;
        }
        const ledgerMined=Math.max(0,Number(state?.scans?.[preview.system]?.ledger?.minedM3SinceSite)||0);
        if(preview.field?.status==='picked'&&ledgerMined>0){
          setScanStatus(`${preview.system}: scan recorded NOW • ${preview.definition.ore} detected • remains YELLOW • ${fmt(ledgerMined,'m3')} m³ reported mined.`,'success');
          $('fieldMessage').textContent=`${preview.system} scan timestamp updated. The field remains PICKED because linked ESI ledgers already report ${fmt(ledgerMined,'m3')} m³ mined from this site cycle.`;
          toast(`${preview.system}: scan updated; field remains PICKED from ESI mining evidence.`);
          renderBoards();
          sfx('systemSelect');
          return;
        }
        const result=await api(`/api/fields/${encodeURIComponent(preview.system)}`,{method:'PUT',body:JSON.stringify({status:'ready'})});
        applyFieldUpdate(preview.system,result.field);
        setScanStatus(`${preview.system}: ${preview.definition.ore} detected — marked GREEN.`,'success');
        $('fieldMessage').textContent=`${preview.system} scan found ${preview.definition.ore}; field marked GREEN and mineable.`;
        sfx('systemSelect');
        return;
      }
      pending={system:preview.system,source:'scan',ore:preview.definition.ore,scannerRows:preview.scan?.scannerRowCount||0};
      $('confirmTitle').textContent=`NO ${preview.definition.ore.toUpperCase()} DEPOSIT DETECTED`;
      $('confirmText').textContent=`${preview.characterName} is in ${preview.system}. The copied scan contained ${preview.scan?.scannerRowCount||0} scanner rows but no ${expected}. Only continue if the complete, unfiltered Probe Scanner list was copied.`;
      $('confirmYes').textContent='CONFIRM CLEAR + START 10H';
      $('confirmPanel').classList.remove('hidden');
      setScanStatus(`${preview.system}: deposit not detected — waiting for confirmation.`,'warning');
    }catch(e){
      setScanStatus(e.message,'error');
      toast(e.message);
    }finally{
      scanBusy=false;renderScanCharacters();
    }
  }
  $('pasteScan').addEventListener('click',async()=>{
    const selected=(me?.characters||[]).find(c=>String(c.characterId)===String(scanCharacterId));
    if(selected&&!selected.locationAccess){location.href='/auth/eve/start?intent=link';return}
    try{
      if(!navigator.clipboard?.readText)throw new Error('Clipboard access unavailable');
      const text=await navigator.clipboard.readText();
      if(!text.trim())throw new Error('Clipboard is empty');
      await analyzeProbeScan(text);
    }catch{openScanPaste()}
  });
  $('scanPasteCancel').addEventListener('click',closeScanPaste);
  $('scanPasteCheck').addEventListener('click',async()=>{
    const text=$('scanPasteText').value;
    if(!text.trim()){toast('Paste the Probe Scanner rows first.');return}
    closeScanPaste();
    await analyzeProbeScan(text);
  });
  async function setField(status,forceSystem=null){
    const system=forceSystem||$('systemSelect').value;
    if(status==='cleared'){
      pending={system};
      $('confirmTitle').textContent='ARE YOU SURE YOU WANT TO START TIMER?';
      $('confirmText').textContent=`${system} will be marked RED and start a fixed 10-hour respawn countdown. Status changes are locked until that timer expires.`;
      $('confirmYes').textContent='YES — START 10 HOURS';
      $('confirmPanel').classList.remove('hidden');
      return;
    }
    try{
      const result=await api(`/api/fields/${encodeURIComponent(system)}`,{method:'PUT',body:JSON.stringify({status})});
      applyFieldUpdate(system,result.field);
      $('fieldMessage').textContent=status==='ready'
        ?`${system} is GREEN and mineable.`
        :`${system} is YELLOW and marked picked/in progress.`;
    }catch(e){toast(e.message)}
  }
  $('markGreen').addEventListener('click',()=>setField('ready',selectedSystem));$('markYellow').addEventListener('click',()=>setField('picked',selectedSystem));$('markRed').addEventListener('click',()=>setField('cleared',selectedSystem));
  async function addNote(){const system=selectedSystem,text=$('fieldNote').value.trim();if(!text){toast('Type a note first.');return}try{const result=await api(`/api/fields/${encodeURIComponent(system)}/notes`,{method:'POST',body:JSON.stringify({text})});if(selectedSystem===system&&$('fieldNote').value.trim()===text)$('fieldNote').value='';applyFieldUpdate(system,result.field);toast(`Note added to ${system}.`)}catch(e){toast(e.message)}}
  $('addNote').addEventListener('click',addNote);$('fieldNote').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addNote()}});
  async function cherry(){const system=selectedSystem||$('systemSelect').value;try{await api(`/api/fields/${encodeURIComponent(system)}/cherry`,{method:'POST',body:'{}'});$('fieldMessage').textContent=`${system} reported 🍒 CHERRY PICKED. It will clear only when the 10-hour respawn ends.`;sfx('timer')}catch(e){toast(e.message)}}
  $('reportCherry').addEventListener('click',cherry);
  $('confirmNo').addEventListener('click',()=>{if(pending?.source==='scan')setScanStatus(`${pending.system}: no changes made.`);pending=null;$('confirmPanel').classList.add('hidden')});
  $('confirmYes').addEventListener('click',async()=>{if(!pending)return;const p=pending;pending=null;$('confirmPanel').classList.add('hidden');try{const result=await api(`/api/fields/${encodeURIComponent(p.system)}`,{method:'PUT',body:JSON.stringify({status:'cleared',confirm:true})});applyFieldUpdate(p.system,result.field);sfx('timer');$('fieldMessage').textContent=`${p.system} RED — 10-hour timer started.`;if(p.source==='scan')setScanStatus(`${p.system}: ${p.ore} absent — marked RED for 10 hours.`,'success')}catch(e){toast(e.message);if(p.source==='scan')setScanStatus(e.message,'error')}});
  $('syncNow').addEventListener('click',async()=>{
    const button=$('syncNow');
    const before=state?.esi?.lastSyncAt||null;
    button.disabled=true;
    button.textContent='SYNCING EVE…';
    try{
      await api('/api/esi/sync',{method:'POST',body:'{}'});
      toast('Syncing skills, saved fits, assets, and mining ledger from EVE...');
      let completed=false;
      for(let attempt=0;attempt<60;attempt++){
        await new Promise(resolve=>setTimeout(resolve,1000));
        const next=await api('/api/state');
        state=next;
        const finished=next.esi?.lastSyncAt&&next.esi.lastSyncAt!==before;
        if(finished){completed=true;break}
      }
      await refreshMe();
      renderAll();
      if(completed){
        const chars=me?.characters||[];
        const saved=chars.reduce((n,c)=>n+(Number(c.savedFittingsCount ?? (c.fittings||[]).length)||0),0);
        const mining=chars.reduce((n,c)=>n+(c.fittings||[]).length,0);
        const abyssal=chars.reduce((n,c)=>n+(Number(c.abyssalStripCount)||0),0);
        button.textContent='SYNCED ✓';
        toast(`${saved} saved fits • ${mining} mining fits${abyssal?` • ${abyssal} Abyssal`:''}`);
        setTimeout(()=>{button.textContent='↻ SYNC EVE DATA';button.disabled=false},2200);
      }else{
        button.textContent='SYNC STILL RUNNING';
        toast('EVE data sync is taking longer than expected.');
        setTimeout(()=>{button.textContent='↻ SYNC EVE DATA';button.disabled=false},3000);
      }
    }catch(e){
      button.textContent='SYNC FAILED';
      toast(e.message);
      setTimeout(()=>{button.textContent='↻ SYNC EVE DATA';button.disabled=false},3000);
    }
  });


  $('scanAllFits')?.addEventListener('click',async()=>{
    const button=$('scanAllFits');
    const characters=Array.isArray(me?.characters)?me.characters:[];
    if(!characters.length){toast('No linked toons to scan.');return;}
    button.disabled=true;
    const original=button.textContent;
    let ok=0,failed=0,saved=0,mining=0,abyssal=0;
    const errors=[];
    try{
      for(let index=0;index<characters.length;index++){
        const character=characters[index];
        button.textContent=`SCANNING ${index+1}/${characters.length}…`;
        try{
          const payload=await api(`/api/esi/fittings/${encodeURIComponent(character.characterId)}`,{method:'POST',body:'{}'});
          me=payload.user||me;
          const fit=payload.fitSync||{};
          ok++;
          saved+=Number(fit.savedFittingsCount||0);
          mining+=Number(fit.miningFittingsCount||0);
          abyssal+=Number(fit.abyssalStripCount||0);
          renderAll();
        }catch(error){
          failed++;
          errors.push(`${character.name||character.characterId}: ${String(error?.message||error)}`);
        }
        if(index<characters.length-1)await new Promise(resolve=>setTimeout(resolve,350));
      }
      await refreshMe().catch(()=>{});
      renderAll();
      button.textContent=failed?'SCAN COMPLETE ⚠':'SCAN COMPLETE ✓';
      if(failed){
        toast(`Fits scanned: ${ok} succeeded • ${failed} failed • ${saved} saved • ${mining} mining • ${abyssal} Abyssal. ${errors[0]||''}`);
      }else{
        toast(`All ${ok} toons scanned • ${saved} saved fits • ${mining} mining fits • ${abyssal} Abyssal strips`);
      }
    }finally{
      setTimeout(()=>{button.textContent=original;button.disabled=false},3000);
    }
  });

  $('oreTrendSelect').addEventListener('change',()=>{
    oreTrendType=$('oreTrendSelect').value||'Kylixium';
    localStorage.setItem('jlrOreTrend',oreTrendType);
    renderMiningVisuals();
  });
  document.querySelectorAll('.fleet-range').forEach(button=>button.addEventListener('click',()=>{
    const days=Number(button.dataset.days);
    if(![7,30,90].includes(days))return;
    fleetHistoryDays=days;
    localStorage.setItem('jlrFleetHistoryDays',String(days));
    renderFleetPerformance();
  }));
  document.querySelectorAll('.fleet-metric').forEach(button=>button.addEventListener('click',()=>{
    const metric=button.dataset.metric==='value'?'value':'m3';
    fleetHistoryMetric=metric;
    localStorage.setItem('jlrFleetHistoryMetric',metric);
    renderFleetPerformance();
  }));
  document.querySelectorAll('.fleet-rate-metric').forEach(button=>button.addEventListener('click',()=>{
    fleetRateMetric=button.dataset.rateMetric==='efficiency'?'efficiency':'rate';
    localStorage.setItem('jlrFleetRateMetric',fleetRateMetric);
    renderFleetPerformance();
  }));

  $('iceTypeSelect').addEventListener('change',()=>{
    iceTrackType=$('iceTypeSelect').value||'Blue Ice IV-Grade';
    localStorage.setItem('jlrIceType',iceTrackType);
    renderIceMining();
  });

  $('gasRegionSelect')?.addEventListener('change',()=>{
    gasRegion=$('gasRegionSelect').value||'Fountain';
    gasType='';
    localStorage.setItem('jlrGasRegion',gasRegion);
    localStorage.removeItem('jlrGasType');
    renderGasHuffing();
  });
  $('gasTypeSelect')?.addEventListener('change',()=>{
    gasType=$('gasTypeSelect').value||'';
    localStorage.setItem('jlrGasType',gasType);
    renderGasHuffing();
  });
  $('gasScanCharacter')?.addEventListener('change',()=>{
    scanCharacterId=String($('gasScanCharacter').value||'');
    localStorage.setItem('jlrScanCharacter',scanCharacterId);
    renderScanCharacters();
  });
  $('gasPasteScan')?.addEventListener('click',async()=>{
    const selected=(me?.characters||[]).find(ch=>String(ch.characterId)===String(scanCharacterId));
    if(selected&&!selected.locationAccess){location.href='/auth/eve/start?intent=link';return}
    try{
      if(!navigator.clipboard?.readText)throw new Error('Clipboard access unavailable');
      const text=await navigator.clipboard.readText();
      if(!text.trim())throw new Error('Clipboard is empty');
      await analyzeProbeScan(text);
    }catch{openScanPaste()}
  });
  document.addEventListener('click',async event=>{
    const button=event.target instanceof Element?event.target.closest('.gas-wh-remove[data-system]'):null;
    if(!button)return;
    const system=String(button.dataset.system||'');
    if(!system)return;
    if(!confirm('Remove '+system+' from the shared wormhole gas tracker?'))return;
    button.disabled=true;
    try{
      await api('/api/gas/wormholes/'+encodeURIComponent(system),{method:'DELETE'});
      const wormholes=state?.source?.gas?.wormholes;
      if(wormholes&&Array.isArray(wormholes.reports))wormholes.reports=wormholes.reports.filter(row=>String(row?.system||'')!==system);
      renderWormholeGasTracker();
      toast(system+' removed from wormhole gas tracking.');
    }catch(error){
      button.disabled=false;
      toast(error.message||'Could not remove wormhole gas report.');
    }
  });

  function readBoosterCalc(){
    calcSettings.boosterFittingId=$('calcBoosterFitting').value;
    calcSettings.mindlink=$('calcMindlink').checked;
    saveCalc();
  }
  ['calcBoosterFitting','calcMindlink'].forEach(id=>$(id).addEventListener('change',readBoosterCalc));
  $('calcBoosterCharacter').addEventListener('change',()=>{
    calcSettings.boosterCharacterId=$('calcBoosterCharacter').value;
    calcSettings.boosterFittingId='';
    const id=String(calcSettings.boosterCharacterId||'');
    if(id){
      const existing=fleetSettings.members[id]&&typeof fleetSettings.members[id]==='object'?fleetSettings.members[id]:{};
      fleetSettings.members[id]={...existing,enabled:true,fittingId:existing.fittingId||''};
      localStorage.setItem('jlrFleet',JSON.stringify(fleetSettings));
    }
    saveCalc();
  });

  function readFleet(){
    fleetSettings.uptime=Math.min(100,Math.max(1,Number($('uptime').value)||100));
    fleetSettings.payout=Math.min(100,Math.max(1,Number($('payout').value)||95));
    saveFleet();
  }
  ['uptime','payout'].forEach(id=>$(id).addEventListener('input',readFleet));
  $('fleetSearchInput')?.addEventListener('input',event=>{
    fleetSearchText=String(event.currentTarget.value||'');
    renderFleet();
  });
  $('fleetViewFilter')?.addEventListener('change',event=>{
    fleetViewFilter=['all','selected','miners','nofit'].includes(event.currentTarget.value)?event.currentTarget.value:'all';
    localStorage.setItem('jlrFleetViewFilter',fleetViewFilter);
    renderFleet();
  });
  $('fleetSortMode')?.addEventListener('change',event=>{
    fleetSortMode=['yield-asc','alpha','custom'].includes(event.currentTarget.value)?event.currentTarget.value:'yield-asc';
    fleetArrangeMode=false;
    localStorage.setItem('jlrFleetSortMode',fleetSortMode);
    renderFleet();
  });
  $('fleetSelectAll')?.addEventListener('click',()=>{
    for(const character of me?.characters||[]){
      const id=String(character.characterId),fits=miningFits(character),isBooster=id===String(calcSettings.boosterCharacterId||'');
      const existing=fleetSettings.members[id]&&typeof fleetSettings.members[id]==='object'?fleetSettings.members[id]:{};
      if(fits.length||isBooster){const fallback=defaultFleetFit(fits);fleetSettings.members[id]={...existing,enabled:true,fittingId:existing.fittingId||(fallback?String(fallback.fittingId):'')}};
    }
    saveFleet();
    toast('All supported mining toons selected.');
  });
  $('fleetClearMiners')?.addEventListener('click',()=>{
    const boosterId=String(calcSettings.boosterCharacterId||'');
    for(const character of me?.characters||[]){
      const id=String(character.characterId);
      if(id===boosterId)continue;
      if(fleetSettings.members[id])fleetSettings.members[id].enabled=false;
    }
    saveFleet();
    toast(boosterId?'Miners cleared. Booster left enabled.':'All miners cleared.');
  });
  $('myLedgerPayoutCard')?.addEventListener('click',openLedgerAudit);
  $('myLedgerPayoutCard')?.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openLedgerAudit();}});
  $('ledgerAuditClose')?.addEventListener('click',closeLedgerAudit);
  $('ledgerAuditPanel')?.addEventListener('click',event=>{if(event.target===event.currentTarget)closeLedgerAudit();});
  $('fleetUpgradeMode')?.addEventListener('click',()=>{
    fleetUpgradeMode=!fleetUpgradeMode;
    fleetArrangeMode=false;
    localStorage.setItem('jlrFleetUpgradeMode',String(fleetUpgradeMode));
    renderFleet();
    toast(fleetUpgradeMode?'Upgrade Mode: weakest Abyssal lasers are shown first.':'Upgrade Mode off.');
  });
  window.addEventListener('resize',updateUiScale,{passive:true});
  async function boot(){
    try{
      const config=await fetch('/api/config').then(r=>r.json());
      if(!config.ssoConfigured){$('setupWarning').classList.remove('hidden');$('setupWarning').textContent='Login is not configured yet.';}
      const auth=await fetch('/api/me',{credentials:'same-origin'}).then(r=>r.json());
      if(!auth.authenticated){showLogin();return}
      me=auth.user;window.jlrAlarmAccountId=String(me.id||'');window.jlrTestAccess=Boolean(me?.jlrTestAccess?.allowed);syncDoctrineTabAccess();syncTrackerTabAccess();syncCeoTabAccess();initTabs();showApp();$('userName').textContent=me.displayName;$('userPortrait').src=me.portrait;applyMode(localStorage.getItem('jlrMode')==='expanded'?'expanded':'compact');await loadMerIntel();await loadState();await refreshFleetPerformanceSnapshot(true);renderFleetPerformance();connectSse();connectCompanionClipboardStream();startScoutLocationWatch();
      const params=new URLSearchParams(location.search);if(params.get('linked'))toast('Toon connected.');if(params.get('login'))toast('Logged in.');if(params.get('market')==='authorized')toast('John market access authorized.');if(params.get('ceo')==='authorized'){toast('Renius CEO ESI authorized.');void loadCeoCommand(true);}if(params.get('error'))toast(decodeURIComponent(params.get('error')));if(params.toString())history.replaceState({},'',location.pathname);
    }catch(e){console.error(e);showLogin();$('setupWarning').classList.remove('hidden');$('setupWarning').textContent=`JLR could not load: ${e.message}`}
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)return;
    scheduleStateRender();
    refreshCompanionStatus();
    if(scoutFollowEnabled)pollScoutLocation(true);
  });

  setInterval(()=>{
    if(!state||document.hidden)return;
    if(activeTab==='fields'){
      renderBoards();renderTimers();renderSelect();renderSelected();
    }
    renderDataStatus();
  },1000);
  // SSE updates Fleet Performance as soon as the automatic ESI cycle finishes.
  // The safety refresh pauses with hidden tabs; SSE keeps state current meanwhile.
  setInterval(()=>{if(me&&!document.hidden)refreshFleetPerformanceData(false)},15*60*1000);
  boot();
})();
