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
  async function api(url){
    const response=await fetch(url,{credentials:'same-origin'});
    const type=response.headers.get('content-type')||'';
    const payload=type.includes('application/json')?await response.json():await response.text();
    if(!response.ok)throw new Error((payload&&payload.message)||(payload&&payload.error)||payload||('Request failed '+response.status));
    return payload;
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
    siren();
    const newest=losses[0]||{};
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
      const next=await api('/api/tracker/heavy-fighters'+(force?'?refresh=1':''));
      const losses=Array.isArray(next&&next.losses)?next.losses:[];
      const ids=losses.map(function(row){return String(row&&row.killmailId||'');}).filter(Boolean);
      let fresh=[];
      if(!trackerSeeded){
        trackerSeenIds=new Set(ids);
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
      const unlocked=await unlockAudio();
      if('Notification' in window&&Notification.permission==='default'){
        try{await Notification.requestPermission();}catch(e){}
      }
      if(!trackerData)loadTracker(false,false);
      else schedule(5000);
      toast(unlocked?'Heavy Fighter alerts armed.':'Alerts armed. Browser audio may need another click before it can sound.');
    }else{
      if(trackerPoll){
        clearTimeout(trackerPoll);
        trackerPoll=null;
      }
      schedule();
      toast('Heavy Fighter alerts disarmed.');
    }
    render();
  }
  async function testSiren(){
    const ready=await unlockAudio();
    if(!ready||!siren())toast('Browser audio is blocked. Click the ARM button, then test again.');
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
            '<span class="tracker-eyebrow">zKILLBOARD • GROUP 1653</span>'+
            '<h2>TRACKER</h2>'+
            '<p>Heavy Fighter loss watch. Arm alerts to keep checking while you use the rest of JLR.</p>'+
          '</div>'+
          '<div class="tracker-actions">'+
            '<button id="trackerArm" class="tracker-arm '+(trackerArmed?'armed':'off')+'" type="button" aria-pressed="'+String(trackerArmed)+'">'+(trackerArmed?'LOUD ALERTS ARMED':'ARM LOUD ALERTS')+'</button>'+
            '<button id="trackerTest" class="orb red" type="button">🔊 TEST SIREN</button>'+
            '<button id="trackerRefresh" class="orb silver" type="button" '+(trackerLoading?'disabled':'')+'>'+(trackerLoading?'CHECKING…':'REFRESH NOW')+'</button>'+
          '</div>'+
        '</section>'+
        '<section class="tracker-kpis">'+
          '<article class="glass '+(trackerArmed?'armed':'')+'"><span>ALERT STATUS</span><strong>'+(trackerArmed?'ARMED':'OFF')+'</strong><small>'+(trackerArmed?'background checks while JLR is open':'open Tracker to check manually')+'</small></article>'+
          '<article class="glass"><span>24H FEED</span><strong>'+fmt(losses.length)+'</strong><small>latest Heavy Fighter losses returned</small></article>'+
          '<article class="glass"><span>LATEST LOSS</span><strong>'+(latest?esc(ago(latest.killmailTime).toUpperCase()):'—')+'</strong><small>'+(latest?esc(latest.systemName||'Unknown system'):'waiting for a loss')+'</small></article>'+
          '<article class="glass"><span>SOURCE LATENCY</span><strong>~5 MIN</strong><small>zKill search API withholds very new killmails</small></article>'+
        '</section>'+
        '<section class="glass tracker-feed-head">'+
          '<div><strong>HEAVY FIGHTER LOSSES</strong><span>'+esc(status)+'</span></div>'+
          '<a href="'+esc(sourceUrl)+'" target="_blank" rel="noopener noreferrer">OPEN GROUP 1653 ↗</a>'+
        '</section>'+
        '<section class="tracker-feed">'+body+'</section>'+
        '<section class="tracker-source-note">'+
          '<strong>HOW ALERTS WORK</strong>'+
          '<span>JLR checks the public zKillboard Heavy Fighter loss feed every '+fmt(data&&data.pollSeconds||DEFAULT_POLL_SECONDS)+' seconds while alerts are armed. zKillboard\'s regular search API withholds killmails less than about five minutes old, so the siren fires when a loss becomes public in that feed rather than at the exact in-game second. Keep this JLR page open for sound alerts.</span>'+
        '</section>'+
      '</div>';

    const arm=document.getElementById('trackerArm');
    const test=document.getElementById('trackerTest');
    const refresh=document.getElementById('trackerRefresh');
    if(arm)arm.addEventListener('click',function(){setArmed(!trackerArmed);});
    if(test)test.addEventListener('click',testSiren);
    if(refresh)refresh.addEventListener('click',function(){loadTracker(true,false);});
  }
  function bind(){
    trackerTab=document.querySelector('.app-tab[data-tab="tracker"]');
    trackerPanel=document.getElementById('heavyFighterTrackerPanel');
    if(!trackerTab||!trackerPanel){
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
        if(!trackerData&&!trackerLoading)loadTracker(false,false);
        else schedule();
      },0);
    });

    const observer=new MutationObserver(function(){
      if(isActive()){
        trackerUnread=0;
        setBadge();
        if(!trackerData&&!trackerLoading)loadTracker(false,false);
      }
      schedule();
    });
    observer.observe(trackerPanel,{attributes:true,attributeFilter:['class']});

    if(trackerArmed)setTimeout(function(){loadTracker(false,true);},1200);
  }

  bind();
})();