'use strict';
(function(){
  const GROUP_ID=1653;
  const DEFAULT_POLL_SECONDS=30;
  const ALERT_PREF='jlrHeavyFighterAlerts';

  let trackerData=null;
  let trackerLoading=false;
  let trackerError='';
  let trackerPoll=null;
  let trackerArmed=localStorage.getItem(ALERT_PREF)==='true';
  let trackerSeeded=false;
  let trackerSeenIds=new Set();
  let trackerFreshIds=new Set();
  let trackerUnread=0;
  let trackerPanel=null;
  let trackerTab=null;
  let trackerAudio=null;
  let trackerStream=null;
  let trackerStreamConnected=false;
  let trackerStreamState='offline';
  let trackerStreamStatus=null;
  let trackerVoiceStatus={configured:false,reachable:false,checkedAt:null,latencyMs:null,message:'Checking custom voice…'};
  let trackerVoiceChecking=false;
  let trackerVoiceTimer=null;
  let trackerVoiceLastMode=String(window.jlrVoiceMode||'unknown');
  let trackerIntel=null;
  let trackerIntelLoading=false;
  let trackerIntelError='';
  let trackerIntelTimer=null;
  const HOT_MODES=new Set(['composite','ratting','pvp','mining','dreads','blobs']);
  const DEFAULT_HOT_REGION_ID='10000058';
  let trackerHotMode=HOT_MODES.has(localStorage.getItem('jlrTrackerHotMode'))?localStorage.getItem('jlrTrackerHotMode'):'composite';
  let trackerSelectedRegionId=String(localStorage.getItem('jlrTrackerHotRegion')||DEFAULT_HOT_REGION_ID);

  function esc(value){
    return String(value==null?'':value).replace(/[&<>'"]/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch];
    });
  }
  function fmt(value){
    const n=Number(value);
    if(!Number.isFinite(n))return '—';
    const a=Math.abs(n);
    if(a>=1e12)return (n/1e12).toFixed(a>=1e13?0:2)+'T';
    if(a>=1e9)return (n/1e9).toFixed(a>=1e10?0:2)+'B';
    if(a>=1e6)return (n/1e6).toFixed(a>=1e7?0:2)+'M';
    if(a>=1e3)return (n/1e3).toFixed(a>=1e4?0:1)+'K';
    return Math.round(n).toLocaleString();
  }
  function ago(iso){
    const ms=Date.now()-Date.parse(String(iso||''));
    if(!Number.isFinite(ms))return 'time unavailable';
    const seconds=Math.max(0,Math.floor(ms/1000));
    if(seconds<60)return seconds+'s ago';
    const minutes=Math.floor(seconds/60);
    if(minutes<60)return minutes+'m ago';
    const hours=Math.floor(minutes/60);
    if(hours<24)return hours+'h '+(minutes%60)+'m ago';
    return Math.floor(hours/24)+'d ago';
  }
  function dateTime(iso){
    const ms=Date.parse(String(iso||''));
    if(!Number.isFinite(ms))return 'Time unavailable';
    return new Date(ms).toLocaleString([],{
      month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'
    });
  }
  function isActive(){
    return Boolean(trackerPanel&&trackerPanel.classList.contains('active'));
  }
  function toast(message){
    const el=document.getElementById('toast');
    if(!el)return;
    el.textContent=message;
    el.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer=setTimeout(function(){el.classList.add('hidden');},4200);
  }
  async function api(url,options={}){
    const headers={...(options.headers||{})};
    let body=options.body;
    if(body&&typeof body==='object'&&!(body instanceof FormData)){
      headers['Content-Type']=headers['Content-Type']||'application/json';
      body=JSON.stringify(body);
    }
    const response=await fetch(url,{...options,body,headers,credentials:'same-origin'});
    const type=response.headers.get('content-type')||'';
    const payload=type.includes('application/json')?await response.json():await response.text();
    if(!response.ok)throw new Error((payload&&payload.message)||(payload&&payload.error)||payload||('Request failed '+response.status));
    return payload;
  }

  function trackerIntelMetric(row,mode){
    if(mode==='ratting')return Number(row?.npcKills)||0;
    if(mode==='pvp')return Number(row?.pvpLosses)||0;
    if(mode==='mining')return Number(row?.miningLosses)||0;
    if(mode==='dreads')return Number(row?.dreadLosses)||0;
    if(mode==='blobs')return Number(row?.blobLosses)||0;
    return Number(row?.huntScore)||0;
  }
  function trackerIntelMetricLabel(row,mode){
    const value=trackerIntelMetric(row,mode);
    if(mode==='ratting')return fmt(value)+' NPC/H';
    if(mode==='pvp')return fmt(value)+' PVP LOSS';
    if(mode==='mining')return fmt(value)+' MINER LOSS';
    if(mode==='dreads')return fmt(value)+' DREAD LOSS';
    if(mode==='blobs')return fmt(value)+' BLOB LOSS';
    return fmt(value)+'/100';
  }
  function trackerIntelJumpLabel(value){
    if(value===null||value===undefined||value==='')return '—';
    const n=Number(value);
    return Number.isFinite(n)?n+'J':'—';
  }
  function trackerIntelHotRows(){
    const rows=Array.isArray(trackerIntel?.hotZones?.systems)?trackerIntel.hotZones.systems.slice():[];
    rows.sort(function(a,b){
      return trackerIntelMetric(b,trackerHotMode)-trackerIntelMetric(a,trackerHotMode)
        ||Number(b?.huntScore||0)-Number(a?.huntScore||0)
        ||String(a?.system||'').localeCompare(String(b?.system||''));
    });
    return rows.slice(0,10);
  }
  function trackerRegionOptionsHtml(){
    const regions=Array.isArray(trackerIntel?.regions)?trackerIntel.regions:[];
    return regions.map(function(row){
      const id=String(row?.regionId||'');
      const selected=id===String(trackerSelectedRegionId)?' selected':'';
      return '<option value="'+esc(id)+'"'+selected+'>'+esc(row?.regionName||id)+'</option>';
    }).join('');
  }
  function trackerHotZonesHtml(){
    if(trackerIntelLoading&&!trackerIntel)return '<div class="tracker-intel-empty">Loading regional activity…</div>';
    if(!trackerIntel)return '<div class="tracker-intel-empty">'+esc(trackerIntelError||'Regional activity unavailable.')+'</div>';
    const hot=trackerIntel.hotZones||{};
    const rows=trackerIntelHotRows();
    const location=trackerIntel.location||null;
    const filters=[
      ['composite','HUNT SCORE'],['ratting','RATTING'],['pvp','PVP'],['mining','MINING'],['dreads','DREADS'],['blobs','BLOBS']
    ].map(function(pair){
      return '<button type="button" class="tracker-intel-filter '+(trackerHotMode===pair[0]?'active':'')+'" data-hot-mode="'+pair[0]+'">'+pair[1]+'</button>';
    }).join('');
    const body=rows.length?rows.map(function(row,index){
      const current=location&&String(row.systemId)===String(location.systemId);
      return '<div class="tracker-intel-row '+(current?'current':'')+'">'+
        '<b>#'+(index+1)+'</b><div><strong>'+esc(row.system||row.systemId)+'</strong><small>HUNT '+fmt(row.huntScore)+'/100 • '+fmt(row.npcKills)+' NPC kills/h</small></div>'+
        '<span>'+esc(trackerIntelMetricLabel(row,trackerHotMode))+'</span><em>'+esc(trackerIntelJumpLabel(row.jumps))+'</em>'+
      '</div>';
    }).join(''):'<div class="tracker-intel-empty">No regional activity returned for this hour.</div>';
    const selected=trackerIntel.selectedRegion||trackerIntel.region||{};
    const updateText=hot.fetchedAt?ago(hot.fetchedAt):'not cached yet';
    const originText=location
      ?location.system+' • '+(trackerIntel.currentRegion?.regionName||'current region')+' • jump distances from you'
      :'jump distances waiting for a live linked-toon location';
    let history='<span class="tracker-intel-note">Time-of-day history: '+fmt(hot.historyHours||0)+'/4 UTC hours collected.</span>';
    if(Array.isArray(hot.bestHoursUtc)&&hot.bestHoursUtc.length){
      history='<span class="tracker-intel-note">Observed best UTC hours: '+hot.bestHoursUtc.map(function(row){return String(row.hourUtc).padStart(2,'0')+':00';}).join(' • ')+'</span>';
    }
    return '<div class="tracker-intel-head"><div class="tracker-region-head"><span>REGION HOT ZONES</span>'+
      '<label class="tracker-region-picker tracker-region-title"><select id="trackerHotRegion" aria-label="Hot zone region">'+trackerRegionOptionsHtml()+'</select></label>'+
      '<small>'+esc(originText)+'</small></div></div>'+
      '<div class="tracker-intel-filters">'+filters+'</div><div class="tracker-intel-list">'+body+'</div>'+
      '<span class="tracker-intel-note">Regional snapshot '+esc(updateText)+' • ESI region catalog + activity cache • automatic refresh every '+fmt(trackerIntel.hotZoneRefreshMinutes||60)+' minutes.</span>'+history;
  }
  function trackerIntelHtml(){
    return '<section class="tracker-intel-grid tracker-intel-grid-hot-only">'+
      '<article class="glass tracker-intel-card tracker-intel-hot">'+trackerHotZonesHtml()+'</article>'+
    '</section>';
  }
  async function loadTrackerIntel(force=false){
    if(trackerIntelLoading)return;
    trackerIntelLoading=true;
    if(force)trackerIntelError='';
    render();
    try{
      const params=new URLSearchParams();
      params.set('regionId',String(trackerSelectedRegionId||DEFAULT_HOT_REGION_ID));
      if(force)params.set('refresh','1');
      const next=await api('/api/tracker/intel?'+params.toString());
      if(next?.selectedRegion?.regionId){
        trackerSelectedRegionId=String(next.selectedRegion.regionId);
        localStorage.setItem('jlrTrackerHotRegion',trackerSelectedRegionId);
      }
      trackerIntel=next;
      trackerIntelError='';
    }catch(error){
      trackerIntelError=String(error&&error.message||error||'Tracker intel unavailable.');
    }finally{
      trackerIntelLoading=false;
      render();
    }
  }
  function scheduleTrackerIntel(delayMs){
    if(trackerIntelTimer){clearTimeout(trackerIntelTimer);trackerIntelTimer=null;}
    if(!isActive())return;
    trackerIntelTimer=setTimeout(async function(){
      await loadTrackerIntel(false);
      scheduleTrackerIntel(60_000);
    },delayMs==null?60_000:Math.max(15_000,Number(delayMs)||60_000));
  }
  async function loadVoiceStatus(){
    if(trackerVoiceChecking)return;
    trackerVoiceChecking=true;
    try{
      trackerVoiceStatus=await api('/api/tracker/heavy-fighters/voice/status');
    }catch(error){
      trackerVoiceStatus={configured:true,reachable:false,checkedAt:new Date().toISOString(),latencyMs:null,message:String(error&&error.message||error||'Custom voice unavailable.')};
    }finally{
      trackerVoiceChecking=false;
      render();
    }
  }
  function scheduleVoiceStatus(delayMs){
    if(trackerVoiceTimer){clearTimeout(trackerVoiceTimer);trackerVoiceTimer=null;}
    if(!trackerArmed&&!isActive())return;
    trackerVoiceTimer=setTimeout(async function(){
      await loadVoiceStatus();
      scheduleVoiceStatus(30000);
    },delayMs==null?30000:Math.max(1000,Number(delayMs)||30000));
  }
  function mergeClientLosses(rows){
    const merged=new Map();
    (Array.isArray(rows)?rows:[]).forEach(function(row){
      const id=String(row&&row.killmailId||'');
      if(id&&!merged.has(id))merged.set(id,row);
    });
    return Array.from(merged.values()).sort(function(a,b){
      return Date.parse(b&&b.killmailTime||'')-Date.parse(a&&a.killmailTime||'')||Number(b&&b.killmailId||0)-Number(a&&a.killmailId||0);
    }).slice(0,200);
  }
  function ensureTrackerData(){
    if(trackerData)return trackerData;
    trackerData={
      groupId:GROUP_ID,
      groupName:'Heavy Fighter',
      source:'zKillboard R2Z2 + search API',
      sourceUrl:'https://zkillboard.com/group/'+GROUP_ID+'/losses/',
      windowSeconds:24*60*60,
      pollSeconds:60,
      searchApiDelaySeconds:300,
      updatedAt:null,
      count:0,
      losses:[],
      live:trackerStreamStatus,
    };
    return trackerData;
  }
  function applyStreamStatus(status){
    if(status&&typeof status==='object')trackerStreamStatus=status;
    if(trackerStreamStatus&&trackerStreamStatus.caughtUp)trackerStreamState='live';
    else if(trackerStreamConnected)trackerStreamState='catching-up';
    if(trackerData&&trackerStreamStatus)trackerData={...trackerData,live:{...(trackerData.live||{}),...trackerStreamStatus}};
    render();
  }
  function handleLiveLoss(row){
    const id=String(row&&row.killmailId||'');
    if(!id||trackerSeenIds.has(id))return;
    trackerSeenIds.add(id);
    trackerFreshIds.add(id);
    const data=ensureTrackerData();
    const losses=mergeClientLosses([row].concat(Array.isArray(data.losses)?data.losses:[]));
    trackerData={
      ...data,
      losses:losses,
      count:losses.length,
      live:{...(data.live||{}),...(trackerStreamStatus||{}),caughtUp:true,lastHeavyFighterAt:row.receivedAt||new Date().toISOString()},
    };
    if(isActive())trackerUnread=0;
    else trackerUnread=Math.min(999,trackerUnread+1);
    setBadge();
    notifyLosses([row]);
    render();
  }
  function closeTrackerStream(){
    if(trackerStream){
      try{trackerStream.close();}catch(e){}
      trackerStream=null;
    }
    trackerStreamConnected=false;
    trackerStreamState='offline';
  }
  function connectTrackerStream(){
    if(trackerStream||!('EventSource' in window))return;
    trackerStreamState='connecting';
    render();
    const stream=new EventSource('/api/tracker/heavy-fighters/stream');
    trackerStream=stream;
    stream.onopen=function(){
      if(trackerStream!==stream)return;
      trackerStreamConnected=true;
      if(trackerStreamState==='connecting'||trackerStreamState==='reconnecting')trackerStreamState='catching-up';
      render();
    };
    stream.addEventListener('ready',function(event){
      if(trackerStream!==stream)return;
      trackerStreamConnected=true;
      try{applyStreamStatus(JSON.parse(event.data||'{}'));}catch(e){render();}
    });
    stream.addEventListener('status',function(event){
      if(trackerStream!==stream)return;
      try{applyStreamStatus(JSON.parse(event.data||'{}'));}catch(e){}
    });
    stream.addEventListener('loss',function(event){
      if(trackerStream!==stream)return;
      try{handleLiveLoss(JSON.parse(event.data||'{}'));}catch(e){}
    });
    stream.onerror=function(){
      if(trackerStream!==stream)return;
      trackerStreamConnected=false;
      trackerStreamState='reconnecting';
      render();
    };
  }
  function syncTrackerStream(){
    if(trackerArmed||isActive())connectTrackerStream();
    else closeTrackerStream();
  }
  function ensureAudio(){
    if(!trackerAudio){
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(AudioContext)trackerAudio=new AudioContext();
    }
    return trackerAudio;
  }
  async function unlockAudio(){
    const audio=ensureAudio();
    if(audio&&audio.state==='suspended'){
      try{await audio.resume();}catch(e){}
    }
    return Boolean(audio&&audio.state==='running');
  }
  function siren(){
    const audio=ensureAudio();
    if(!audio||audio.state!=='running')return false;
    const start=audio.currentTime;
    const tones=[920,300,920,300,1080,260,1080,260,760,240];
    tones.forEach(function(frequency,index){
      const oscillator=audio.createOscillator();
      const gain=audio.createGain();
      const at=start+index*.145;
      oscillator.type=index%2===0?'square':'sawtooth';
      oscillator.frequency.setValueAtTime(frequency,at);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(90,frequency*.68),at+.12);
      gain.gain.setValueAtTime(.16,at);
      gain.gain.exponentialRampToValueAtTime(.002,at+.13);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at+.135);
    });
    return true;
  }
  function setBadge(){
    if(!trackerTab)return;
    trackerTab.textContent=trackerUnread>0?'TRACKER • '+(trackerUnread>99?'99+':trackerUnread):'TRACKER';
    trackerTab.classList.toggle('tracker-unread',trackerUnread>0);
  }
  function notifyLosses(losses){
    if(!trackerArmed||!losses.length)return;
    const newest=losses[0]||{};
    if(typeof window.jlrPlayFighterAlarm==='function')window.jlrPlayFighterAlarm(newest);
    const count=losses.length;
    const fighter=newest.shipTypeName||'Heavy Fighter';
    const system=newest.systemName||'unknown system';
    toast(count===1?fighter+' DOWN in '+system:count+' Heavy Fighters DOWN — newest in '+system);
    try{
      if('Notification' in window&&Notification.permission==='granted'){
        const body=count===1
          ?fighter+' • '+system+' • '+fmt(newest.totalValue||0)+' ISK'
          :count+' new Heavy Fighter losses • newest in '+system;
        new Notification(count===1?'JLR Tracker — Heavy Fighter Down':'JLR Tracker — '+count+' Heavy Fighters Down',{
          body:body,
          tag:'jlr-heavy-fighter-tracker'
        });
      }
    }catch(e){}
  }
  function schedule(delayMs){
    if(trackerPoll){
      clearTimeout(trackerPoll);
      trackerPoll=null;
    }
    if(!trackerArmed&&!isActive())return;
    const seconds=Math.max(15,Number(trackerData&&trackerData.pollSeconds)||DEFAULT_POLL_SECONDS);
    trackerPoll=setTimeout(function(){loadTracker(false,true);},delayMs==null?seconds*1000:Math.max(5000,Number(delayMs)||seconds*1000));
  }
  async function loadTracker(force,background){
    if(trackerLoading){
      schedule();
      return;
    }
    trackerLoading=true;
    if(!background)trackerError='';
    render();
    try{
      const responseData=await api('/api/tracker/heavy-fighters'+(force?'?refresh=1':''));
      const responseLosses=Array.isArray(responseData&&responseData.losses)?responseData.losses:[];
      const existingLosses=Array.isArray(trackerData&&trackerData.losses)?trackerData.losses:[];
      const losses=mergeClientLosses(responseLosses.concat(existingLosses));
      const next={...responseData,losses:losses,count:losses.length};
      const ids=losses.map(function(row){return String(row&&row.killmailId||'');}).filter(Boolean);
      let fresh=[];
      if(!trackerSeeded){
        trackerSeenIds=new Set(Array.from(trackerSeenIds).concat(ids));
        trackerSeeded=true;
      }else{
        fresh=losses.filter(function(row){
          const id=String(row&&row.killmailId||'');
          return id&&!trackerSeenIds.has(id);
        });
        trackerSeenIds=new Set(ids.concat(Array.from(trackerSeenIds)).slice(0,500));
      }
      trackerFreshIds=new Set(fresh.map(function(row){return String(row.killmailId);}));
      trackerData=next;
      if(next&&next.live)trackerStreamStatus={...(trackerStreamStatus||{}),...next.live};
      trackerError='';
      if(fresh.length){
        if(isActive())trackerUnread=0;
        else trackerUnread=Math.min(999,trackerUnread+fresh.length);
        notifyLosses(fresh);
      }
      setBadge();
    }catch(error){
      trackerError=String(error&&error.message||error||'Heavy Fighter tracker could not be loaded.');
    }finally{
      trackerLoading=false;
      render();
      schedule();
    }
  }
  async function setArmed(next){
    trackerArmed=Boolean(next);
    localStorage.setItem(ALERT_PREF,String(trackerArmed));
    if(trackerArmed){
      const unlocked=typeof window.jlrUnlockFighterAlarm==='function'
        ?await window.jlrUnlockFighterAlarm()
        :false;
      syncTrackerStream();
      loadVoiceStatus();
      scheduleVoiceStatus(30000);
      if('Notification' in window&&Notification.permission==='default'){
        try{await Notification.requestPermission();}catch(e){}
      }
      if(!trackerData)loadTracker(false,false);
      else schedule(5000);
      toast(unlocked?'Heavy Fighter alerts armed.':'Alerts armed. Browser audio may need another click before it can sound.');
    }else{
      if(typeof window.jlrStopFighterAlarm==='function')window.jlrStopFighterAlarm();
      if(trackerPoll){
        clearTimeout(trackerPoll);
        trackerPoll=null;
      }
      syncTrackerStream();
      schedule();
      scheduleVoiceStatus();
      toast('Heavy Fighter alerts disarmed.');
    }
    render();
  }
  async function testSiren(){
    if(typeof window.jlrUnlockFighterAlarm==='function')await window.jlrUnlockFighterAlarm();
    const played=typeof window.jlrPlayFighterAlarm==='function'
      ?await window.jlrPlayFighterAlarm({test:true})
      :false;
    if(!played)toast(window.jlrVoiceLastError?'CUSTOM VOICE TEST FAILED: '+window.jlrVoiceLastError:'Custom voice test did not play. Check the worker and Railway logs.');
  }
  function stopAlarm(){
    const stopped=typeof window.jlrStopFighterAlarm==='function'
      ?window.jlrStopFighterAlarm()
      :false;
    toast(stopped?'Tracker alarm stopped.':'No Tracker alarm is currently playing.');
  }
  function lossCard(row){
    const victim=row&&row.victim||{};
    const finalBlow=row&&row.finalBlow||null;
    const owner=victim.characterName||victim.corporationName||'Unknown owner';
    const org=[victim.corporationName,victim.allianceName].filter(Boolean).join(' • ')||'No corporation / alliance detail';
    const finalName=finalBlow&&(finalBlow.characterName||finalBlow.corporationName)||'Unknown';
    const finalShip=finalBlow&&finalBlow.shipTypeName?' • '+finalBlow.shipTypeName:'';
    const fresh=trackerFreshIds.has(String(row.killmailId));
    return '<article class="tracker-loss-card'+(fresh?' fresh':'')+'">'+
      '<div class="tracker-fighter-image">'+
        '<img src="https://images.evetech.net/types/'+encodeURIComponent(row.shipTypeId)+'/render?size=128" alt="'+esc(row.shipTypeName||'Heavy Fighter')+'">'+
        (fresh?'<span>NEW</span>':'')+
      '</div>'+
      '<div class="tracker-loss-main">'+
        '<div class="tracker-loss-title">'+
          '<div><span>HEAVY FIGHTER DOWN</span><strong>'+esc(row.shipTypeName||'Heavy Fighter')+'</strong></div>'+
          '<b>'+fmt(row.totalValue||0)+' ISK</b>'+
        '</div>'+
        '<div class="tracker-location"><strong>'+esc(row.systemName||'Unknown system')+'</strong><span>'+esc(dateTime(row.killmailTime))+' • '+esc(ago(row.killmailTime))+'</span></div>'+
        '<div class="tracker-details">'+
          '<div><span>OWNER / VICTIM</span><strong>'+esc(owner)+'</strong><small>'+esc(org)+'</small></div>'+
          '<div><span>FINAL BLOW</span><strong>'+esc(finalName)+'</strong><small>'+esc(((finalBlow&&finalBlow.corporationName)||'Unknown corporation')+finalShip)+'</small></div>'+
          '<div><span>ATTACKERS</span><strong>'+fmt(row.attackerCount||0)+'</strong><small>'+(row.solo?'solo kill':'attackers on mail')+'</small></div>'+
        '</div>'+
      '</div>'+
      '<a class="tracker-kill-link" href="'+esc(row.href||(trackerData&&trackerData.sourceUrl)||'#')+'" target="_blank" rel="noopener noreferrer">OPEN KILLMAIL ↗</a>'+
    '</article>';
  }
  function render(){
    if(!trackerPanel)return;
    setBadge();
    const data=trackerData;
    const losses=Array.isArray(data&&data.losses)?data.losses:[];
    const latest=losses[0]||null;
    const sourceUrl=data&&data.sourceUrl||'https://zkillboard.com/group/'+GROUP_ID+'/losses/';
    const live={...((data&&data.live)||{}),...(trackerStreamStatus||{})};
    const liveLabel=trackerStreamConnected
      ?(live.caughtUp?'LIVE':'CATCHING UP')
      :(trackerStreamState==='reconnecting'?'RECONNECTING':(live.caughtUp?'SERVER LIVE':'OFFLINE'));
    const liveDetail=live.caughtUp
      ?'R2Z2 at live edge • '+fmt(live.edgeWaitSeconds||6)+'s edge checks'
      :(live.lastError?String(live.lastError).slice(0,90):'connecting to R2Z2 live sequence');
    const voice=trackerVoiceStatus||{};
    const voiceLabel=trackerVoiceChecking&&!voice.checkedAt?'CHECKING':(voice.reachable?'ONLINE':(voice.configured?'OFFLINE':'NOT SET'));
    const voiceDetail=voice.reachable
      ?((voice.referencePack?'JLR VOICE V3':'GPT-SoVITS '+(voice.streaming?'STREAMING':'BUFFERED'))+
        (voice.workerVersion?' • worker v'+esc(voice.workerVersion):'')+
        (voice.cacheVersion?' • '+esc(voice.cacheVersion):'')+
        (voice.systemPronunciations?' • '+fmt(voice.systemPronunciations)+' system refs':'')+
        (voice.stableStreaming?' • stable mode':'')+
        (Number.isFinite(Number(voice.latencyMs))?' • '+fmt(voice.latencyMs)+' ms health':''))
      :(voice.configured?'Browser fallback active':'Voice worker not configured');
    const voiceClass=voice.reachable?' voice-online':(voice.configured?' voice-offline':'');
    const status=trackerError
      ?trackerError
      :trackerLoading
        ?'Checking zKillboard Heavy Fighter losses…'
        :(data&&data.updatedAt?'Feed checked '+ago(data.updatedAt):'Feed has not been checked yet.');
    const cards=losses.slice(0,60).map(lossCard).join('');
    let body='';
    if(trackerError&&!data){
      body='<div class="glass tracker-empty"><strong>TRACKER UNAVAILABLE</strong><span>'+esc(trackerError)+'</span></div>';
    }else if(trackerLoading&&!data){
      body='<div class="glass tracker-empty"><strong>LOADING TRACKER…</strong><span>Checking public zKillboard losses.</span></div>';
    }else{
      body=cards||'<div class="glass tracker-empty"><strong>NO HEAVY FIGHTER LOSSES RETURNED</strong><span>The 24-hour feed is empty right now.</span></div>';
    }

    trackerPanel.innerHTML=
      '<div class="tracker-shell">'+
        '<section class="glass tracker-hero">'+
          '<div>'+
            '<span class="tracker-eyebrow">zKILLBOARD R2Z2 LIVE • GROUP 1653</span>'+
            '<h2>TRACKER</h2>'+
            '<p>Near-live Heavy Fighter loss watch with dynamic JLR custom-voice announcements and automatic browser fallback.</p>'+
          '</div>'+
          '<div class="tracker-actions">'+
            '<button id="trackerArm" class="tracker-arm '+(trackerArmed?'armed':'off')+'" type="button" aria-pressed="'+String(trackerArmed)+'">'+(trackerArmed?'LOUD ALERTS ARMED':'ARM LOUD ALERTS')+'</button>'+
            '<button id="trackerTest" class="orb red" type="button">▶ TEST JLR CUSTOM VOICE</button>'+
            '<button id="trackerStop" class="orb silver" type="button">■ STOP ALARM</button>'+
            '<button id="trackerRefresh" class="orb silver" type="button" '+(trackerLoading?'disabled':'')+'>'+(trackerLoading?'CHECKING…':'REFRESH NOW')+'</button>'+
          '</div>'+
        '</section>'+
        '<section class="tracker-kpis">'+
          '<article class="glass '+(trackerArmed?'armed':'')+'"><span>ALERT STATUS</span><strong>'+(trackerArmed?'ARMED':'OFF')+'</strong><small>'+(trackerArmed?'background checks while JLR is open':'open Tracker to check manually')+'</small></article>'+
          '<article class="glass"><span>24H FEED</span><strong>'+fmt(losses.length)+'</strong><small>latest Heavy Fighter losses returned</small></article>'+
          '<article class="glass"><span>LATEST LOSS</span><strong>'+(latest?esc(ago(latest.killmailTime).toUpperCase()):'—')+'</strong><small>'+(latest?esc(latest.systemName||'Unknown system'):'waiting for a loss')+'</small></article>'+
          '<article class="glass"><span>LIVE INGEST</span><strong>'+esc(liveLabel)+'</strong><small>'+esc(liveDetail)+'</small></article>'+
          '<article class="glass'+voiceClass+'"><span>CUSTOM VOICE</span><strong>'+esc(voiceLabel)+'</strong><small>'+esc(voiceDetail)+(trackerVoiceLastMode==='fallback'?' • last alert used fallback':trackerVoiceLastMode==='custom'?' • last alert custom':'')+'</small></article>'+
        '</section>'+
        trackerIntelHtml()+
        '<section class="glass tracker-feed-head">'+
          '<div><strong>HEAVY FIGHTER LOSSES</strong><span>'+esc(status)+'</span></div>'+
          '<a href="'+esc(sourceUrl)+'" target="_blank" rel="noopener noreferrer">OPEN GROUP 1653 ↗</a>'+
        '</section>'+
        '<section class="tracker-feed">'+body+'</section>'+
        '<section class="tracker-source-note">'+
          '<strong>HOW ALERTS WORK</strong>'+
          '<span>JLR follows zKillboard\'s R2Z2 live sequence for Heavy Fighter group 1653. When CUSTOM VOICE is ONLINE, Railway requests one GPT-SoVITS announcement per killmail and caches it for authorized users. If the worker is OFFLINE, JLR automatically uses the browser fallback voice so the alarm still fires.</span>'+
        '</section>'+
      '</div>';

    const arm=document.getElementById('trackerArm');
    const test=document.getElementById('trackerTest');
    const stop=document.getElementById('trackerStop');
    const refresh=document.getElementById('trackerRefresh');
    if(arm)arm.addEventListener('click',function(){setArmed(!trackerArmed);});
    if(test)test.addEventListener('click',testSiren);
    if(stop)stop.addEventListener('click',stopAlarm);
    if(refresh)refresh.addEventListener('click',function(){loadTracker(true,false);loadTrackerIntel(true);});
    document.querySelectorAll('[data-hot-mode]').forEach(function(button){
      button.addEventListener('click',function(){
        trackerHotMode=HOT_MODES.has(button.dataset.hotMode)?button.dataset.hotMode:'composite';
        localStorage.setItem('jlrTrackerHotMode',trackerHotMode);
        render();
      });
    });
    const hotRegion=document.getElementById('trackerHotRegion');
    if(hotRegion)hotRegion.addEventListener('change',function(){
      trackerSelectedRegionId=String(hotRegion.value||DEFAULT_HOT_REGION_ID);
      localStorage.setItem('jlrTrackerHotRegion',trackerSelectedRegionId);
      loadTrackerIntel(false);
    });
  }
  function bind(){
    trackerTab=document.querySelector('.app-tab[data-tab="tracker"]');
    trackerPanel=document.getElementById('heavyFighterTrackerPanel');
    if(!trackerTab||!trackerPanel){
      setTimeout(bind,250);
      return;
    }
    if(trackerTab.classList.contains('hidden')){
      trackerPanel.innerHTML='';
      setTimeout(bind,250);
      return;
    }
    if(trackerPanel.dataset.trackerReady==='1')return;
    trackerPanel.dataset.trackerReady='1';
    setBadge();
    render();
    trackerTab.addEventListener('click',function(){
      trackerUnread=0;
      setBadge();
      setTimeout(function(){
        render();
        syncTrackerStream();
        loadVoiceStatus();
        scheduleVoiceStatus(30000);
        if(!trackerData&&!trackerLoading)loadTracker(false,false);
        if(!trackerIntel&&!trackerIntelLoading)loadTrackerIntel(false);
        else scheduleTrackerIntel(60_000);
        schedule();
      },0);
    });

    const observer=new MutationObserver(function(){
      if(isActive()){
        trackerUnread=0;
        setBadge();
        if(!trackerData&&!trackerLoading)loadTracker(false,false);
        if(!trackerIntel&&!trackerIntelLoading)loadTrackerIntel(false);
        loadVoiceStatus();
      }
      syncTrackerStream();
      schedule();
      scheduleTrackerIntel(60_000);
      scheduleVoiceStatus(30000);
    });
    observer.observe(trackerPanel,{attributes:true,attributeFilter:['class']});

    window.addEventListener('jlr-voice-mode',function(event){
      trackerVoiceLastMode=String(event&&event.detail&&event.detail.mode||'unknown');
      if(trackerVoiceLastMode==='custom')trackerVoiceStatus={...trackerVoiceStatus,configured:true,reachable:true,checkedAt:new Date().toISOString(),message:'Custom GPT-SoVITS voice played successfully.'};
      render();
    });

    syncTrackerStream();
    if(trackerArmed||isActive()){
      setTimeout(function(){loadVoiceStatus();},500);
      scheduleVoiceStatus(30000);
    }
    if(trackerArmed)setTimeout(function(){loadTracker(false,true);},1200);
  }

  bind();
})();