(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  let share=null;
  let dscanRows=[];
  let shipCatalogTask=null;
  // Classification is intentionally conservative: unknown object types remain unclassified,
  // rather than being incorrectly counted as ships. Mass is shown only for fully-known scans.
  const SHIP_TYPES=new Map([
    ['hulk',{group:'Exhumer',mass:15000}],
    ['mackinaw',{group:'Exhumer'}],
    ['skiff',{group:'Exhumer'}],
    ['covetor',{group:'Mining Barge'}],
    ['retriever',{group:'Mining Barge'}],
    ['procurer',{group:'Mining Barge'}],
    ['rorqual',{group:'Capital Industrial Ship'}],
    ['orca',{group:'Industrial Command Ship'}],
    ['porpoise',{group:'Industrial Command Ship'}],
  ]);

  // Ship role colors are based on hull class, not standings, ownership or threat.
  // Unknown hulls, general haulers and civilian ships remain neutral.
  const MINING_GROUPS=new Set([
    'Exhumer','Mining Barge','Expedition Frigate','Expedition Command Ship',
    'Industrial Command Ship','Capital Industrial Ship',
  ]);
  const COMBAT_GROUPS=new Set([
    'Assault Frigate','Attack Battlecruiser','Battleship','Black Ops','Carrier',
    'Combat Battlecruiser','Combat Recon Ship','Command Carrier','Command Destroyer',
    'Command Ship','Corvette','Covert Ops','Cruiser','Destroyer','Dreadnought',
    'Electronic Attack Ship','Flag Cruiser','Force Auxiliary','Force Recon Ship',
    'Frigate','Heavy Assault Cruiser','Heavy Interdiction Cruiser','Interceptor',
    'Interdictor','Lancer Dreadnought','Logistics','Logistics Frigate','Marauder',
    'Stealth Bomber','Strategic Cruiser','Supercarrier','Tactical Destroyer','Titan',
  ]);
  // Miasmos is an ore hauler but its SDE group is the broader Hauler category.
  const MINING_SPECIAL_HULLS=new Set(['miasmos']);
  function shipRoleByGroup(group){
    if(MINING_GROUPS.has(group))return 'mining';
    if(COMBAT_GROUPS.has(group))return 'combat';
    return 'other';
  }
  function shipRoleByType(type){
    const key=String(type||'').trim().toLowerCase();
    if(MINING_SPECIAL_HULLS.has(key))return 'mining';
    const info=SHIP_TYPES.get(key);
    return info?shipRoleByGroup(info.group):'other';
  }
  function roleTotals(rows){
    const totals={combat:0,mining:0,other:0};
    for(const row of rows)totals[shipRoleByType(row.type)]++;
    return totals;
  }

  async function loadShipCatalog(){
    try{
      const response=await fetch('/eve-ship-catalog.json?v=20261010',{cache:'force-cache'});
      if(!response.ok)throw new Error('Ship catalog unavailable');
      const catalog=await response.json();
      if(!Array.isArray(catalog?.ships)||catalog.ships.length<400||catalog.massUnit!=='kg')throw new Error('Incomplete ship catalog');
      for(const item of catalog.ships){
        if(!Array.isArray(item)||item.length<4)continue;
        const [name,group,massKg,typeId]=item;
        const key=String(name||'').trim().toLowerCase();
        if(!key||!group)continue;
        const massT=Number(massKg)>0?Number(massKg)/1000:null;
        SHIP_TYPES.set(key,{
          group:String(group),
          mass:Number.isFinite(massT)?massT:null,
          typeId:Number(typeId)||null,
        });
      }
      // Re-render the classification once the static catalog becomes available;
      // no ESI round-trips are needed when viewing/copying a fleet scan.
      if(share?.dscanText)renderDscan();
    }catch(error){
      console.warn('JLR ship catalog unavailable; using mining-hull fallback',String(error?.message||error));
    }
  }
  function shipReport(rows){
    const classes=new Map(),types=groupDscan(rows);
    let ships=0,mass=0,massComplete=true;
    for(const row of rows){
      const data=SHIP_TYPES.get(String(row.type||'').toLowerCase().trim());
      if(!data)continue;
      ships++;
      classes.set(data.group,(classes.get(data.group)||0)+1);
      if(Number.isFinite(data.mass))mass+=data.mass;
      else massComplete=false;
    }
    return {
      ships, types,
      classes:[...classes.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])),
      mass:ships===rows.length&&massComplete&&ships>0?mass:null,
    };
  }
  function briefSummary(){
    const report=shipReport(dscanRows);
    const system=String(share?.system||'').trim()||'Unknown (not supplied)';
    const classified=report.types.filter(([name])=>SHIP_TYPES.has(String(name||'').trim().toLowerCase()));
    const extra=dscanRows.length-report.ships;
    const lines=[
      'JLR D-SCAN INTELLIGENCE',
      '📍 System: '+system,
      '🚀 Ships: '+report.ships+(extra?' • '+dscanRows.length+' total objects':''),
      ...classified.slice(0,25).map(([name,count])=>{
        const info=SHIP_TYPES.get(String(name||'').trim().toLowerCase());
        return '• '+count+' × '+name+(info?.group?' ('+info.group+')':'');
      }),
    ];
    if(classified.length>25)lines.push('• …and '+(classified.length-25)+' more hull types');
    if(extra)lines.push('Other/unclassified objects: '+extra);
    if(report.mass!==null)lines.push('⚖️ Fleet mass: '+report.mass.toLocaleString('en-US',{maximumFractionDigits:1})+' t');
    lines.push('🕒 Snapshot — Not Live');
    return lines.join('\n');
  }

  function tokenFromPath(){
    return location.pathname.split('/').filter(Boolean).at(-1)||'';
  }
  function rawLines(text){
    return String(text||'').replace(/\r/g,'').split('\n').map(v=>v.trim()).filter(Boolean);
  }
  function columnsFor(line){
    return (line.includes('\t')?line.split('\t'):line.split(/\s{3,}/)).map(v=>v.trim()).filter(Boolean);
  }
  function isDistance(value){
    return /^(?:-|\d+(?:\.\d+)?\s*(?:m|km|au))$/i.test(String(value||'').replace(/,/g,'').trim());
  }
  function parseDscan(text){
    const out=[];
    for(const line of rawLines(text)){
      const cols=columnsFor(line);
      if(!cols.length)continue;
      const lower=cols.map(v=>v.toLowerCase());
      if(lower.includes('type')&&(lower.includes('name')||lower.includes('distance')))continue;
      const last=cols.at(-1);
      const distance=isDistance(last)?last:'';
      const type=distance?(cols.at(-2)||'Unknown'):(cols.length>1?cols.at(-1):'Unknown');
      let name=cols[0]||'';
      if(/^\d+$/.test(name.replace(/,/g,''))&&cols.length>=3)name=cols[1]||name;
      out.push({name,type,distance,raw:line});
    }
    return out;
  }
  function groupDscan(rows){
    const map=new Map();
    for(const row of rows){
      const key=String(row.type||'Unknown').trim()||'Unknown';
      map.set(key,(map.get(key)||0)+1);
    }
    return [...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  }
  function localFallback(){
    return rawLines(share?.localText||'').map(name=>({
      id:null,name,corporationId:null,corporationName:'',corporationTicker:'',
      allianceId:null,allianceName:'',allianceTicker:'',
    }));
  }
  function groupedLocal(rows,key,nameKey,tickerKey){
    const map=new Map();
    for(const row of rows){
      const id=Number(row?.[key])||0;
      if(!id)continue;
      if(!map.has(id))map.set(id,{id,name:String(row?.[nameKey]||id),ticker:String(row?.[tickerKey]||''),count:0,pilots:[]});
      const group=map.get(id);
      group.count++;
      group.pilots.push(String(row?.name||'Unknown'));
    }
    return [...map.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  }
  function makeLink(label,url){
    const a=document.createElement('a');
    a.textContent=label||'—';
    a.className='entity-link';
    a.href=url;
    a.target='_blank';
    a.rel='noopener noreferrer';
    return a;
  }
  function intelCard(row,kind){
    const card=document.createElement('article');
    card.className='intel-card';
    card.title=row.pilots.join('\n');
    const count=document.createElement('strong');
    count.textContent=String(row.count);
    const copy=document.createElement('div');
    const ticker=document.createElement('span');
    ticker.className='intel-ticker';
    ticker.textContent=row.ticker?('['+row.ticker+']'):(kind==='alliance'?'ALLIANCE':'CORP');
    const name=document.createElement('b');
    name.textContent=row.name;
    copy.append(ticker,name);
    card.append(count,copy);
    return card;
  }
  function intelSection(title,rows,kind){
    const block=document.createElement('section');
    block.className='intel-block';
    const head=document.createElement('div');
    head.className='intel-block-head';
    const label=document.createElement('strong'); label.textContent=title;
    const count=document.createElement('span'); count.textContent=String(rows.length);
    head.append(label,count);
    const grid=document.createElement('div'); grid.className='intel-grid';
    if(rows.length)rows.forEach(row=>grid.append(intelCard(row,kind)));
    else{
      const empty=document.createElement('span'); empty.className='muted'; empty.textContent='No '+title.toLowerCase()+' resolved.';
      grid.append(empty);
    }
    block.append(head,grid);
    return block;
  }
  function renderHeader(){
    const system=String(share?.system||'').trim();
    $('shareTitle').textContent=system||'SHARED INTEL';
    $('systemLabel').classList.toggle('hidden',!system);
    document.querySelector('.hero')?.classList.toggle('has-system',Boolean(system));
    const created=share?.createdAt?new Date(share.createdAt):null;
    const updated=share?.updatedAt?new Date(share.updatedAt):null;
    const createdText=created&&!Number.isNaN(created.getTime())?'created '+created.toLocaleString():'created through JLR';
    const updatedText=updated&&!Number.isNaN(updated.getTime())?'updated '+updated.toLocaleString():'';
    $('scanMeta').textContent=['SNAPSHOT • NOT LIVE',createdText,updatedText].filter(Boolean).join(' • ');
    document.title=(system?system+' • ':'')+'JLR Shared Intel';
  }
  function renderStats(){
    $('dscanObjectCount').textContent=dscanRows.length.toLocaleString();
    const local=share?.local||{};
    const pilots=Number(local.pilotCount)||rawLines(share?.localText||'').length;
    const hasLocal=Boolean(String(share?.localText||'').trim());
    $('localPilotCount').textContent=hasLocal?pilots.toLocaleString():'—';
    $('localStatus').textContent=hasLocal?'Local scan attached':'Not provided';
    const recons=(share?.manualRecons||[]).reduce((sum,row)=>sum+Math.max(0,Number(row?.count)||0),0);
    $('reconCount').textContent=recons?recons.toLocaleString():'—';
    $('reconStatus').textContent=recons?'Manually reported':'Not added';
  }
  function renderRecons(){
    const rows=Array.isArray(share?.manualRecons)?share.manualRecons:[];
    $('manualReconPanel').classList.toggle('hidden',!rows.length);
    const host=$('manualReconList');
    host.replaceChildren(...rows.map(row=>{
      const card=document.createElement('article');
      card.className='recon-card';
      const count=document.createElement('strong'); count.textContent=String(row.count);
      const copy=document.createElement('div');
      const tag=document.createElement('span'); tag.textContent='MANUAL';
      const name=document.createElement('b'); name.textContent=row.name;
      copy.append(tag,name); card.append(count,copy);
      return card;
    }));
  }
  function renderDscan(){
    const scanText=String(share?.dscanText||'');
    $('dscanPanel').classList.toggle('hidden',!scanText);
    $('copyDscan').disabled=!scanText;
    $('copySummary').disabled=!scanText;
    $('rawDscan').textContent=scanText;
    if(!scanText)return;
    const q=String($('dscanFilter').value||'').trim().toLowerCase();
    const filtered=q?dscanRows.filter(row=>[row.name,row.type,row.distance].some(v=>String(v||'').toLowerCase().includes(q))):dscanRows;
    const report=shipReport(filtered);
    const roles=roleTotals(filtered);
    $('shipRoleOverview').replaceChildren(...[
      ['combat','PVP / COMBAT',roles.combat],
      ['mining','MINING / SUPPORT',roles.mining],
      ...(roles.other?[['other','OTHER / UNKNOWN',roles.other]]:[]),
    ].map(([role,label,count])=>{
      const card=document.createElement('div');
      card.className='role-card role-'+role;
      const badge=document.createElement('strong');badge.textContent=String(count);
      const description=document.createElement('span');description.textContent=label;
      card.append(badge,description);
      return card;
    }));
    const highlights=[
      ['OBJECTS',filtered.length.toLocaleString(),q?'Filtered scan':'Total D-scan entries'],
      ['IDENTIFIED SHIPS',report.ships.toLocaleString(),report.ships===filtered.length?'All objects recognized':'Unknown types remain unclassified'],
      ['SHIP TYPES',report.classes.length?new Set(filtered.filter(row=>SHIP_TYPES.has(String(row.type||'').toLowerCase().trim())).map(row=>row.type)).size.toLocaleString():'—',report.classes.length?report.classes.length+' known ship classes':'No known ship classes'],
    ];
    if(report.mass!==null)highlights.push(['KNOWN SHIP MASS',report.mass.toLocaleString()+' t','All scanned hulls identified']);
    const host=$('scanHighlights');
    host.replaceChildren(...highlights.map(([label,value,note])=>{
      const item=document.createElement('div');item.className='scan-highlight';
      const title=document.createElement('span');title.textContent=label;
      const count=document.createElement('strong');count.textContent=value;
      const hint=document.createElement('small');hint.textContent=note;
      item.append(title,count,hint);return item;
    }));
    $('typeBreakdownLabel').textContent=report.types.length+' types'+(q?' • filtered':'');
    const summary=$('dscanSummary');
    summary.replaceChildren(...report.types.map(([type,count])=>{
      const el=document.createElement('div');el.className='group role-'+shipRoleByType(type);
      const n=document.createElement('strong');n.textContent=String(count);
      const t=document.createElement('span');t.textContent=type;
      el.append(n,t);return el;
    }));
    $('classBreakdown').classList.toggle('hidden',!report.classes.length);
    $('classBreakdownLabel').textContent=report.ships+' identified ships';
    $('dscanClasses').replaceChildren(...report.classes.map(([group,count])=>{
      const el=document.createElement('div');el.className='group class-group role-'+shipRoleByGroup(group);
      const n=document.createElement('strong');n.textContent=String(count);
      const t=document.createElement('span');t.textContent=group;
      el.append(n,t);return el;
    }));
    $('dscanRows').replaceChildren(...filtered.map((row,index)=>{
      const role=shipRoleByType(row.type);
      const tr=document.createElement('tr');
      tr.className='scan-row role-'+role;
      [String(index+1),row.name,row.type,row.distance||'—'].forEach((value,column)=>{
        const td=document.createElement('td');
        if(column===2){
          const badge=document.createElement('span');
          badge.className='ship-type-tag role-'+role;
          badge.textContent=value;
          td.append(badge);
        }else td.textContent=value;
        tr.append(td);
      });
      return tr;
    }));
    $('dscanShownCount').textContent=filtered.length===dscanRows.length
      ?filtered.length+' objects'
      :filtered.length+' of '+dscanRows.length+' objects';
    if(q)$('dscanObjectsDetails').open=true;
  }
  function renderLocal(){
    const text=String(share?.localText||'');
    $('localPanel').classList.toggle('hidden',!text);
    $('rawLocal').textContent=text;
    if(!text)return;
    const local=share?.local||{};
    const source=Array.isArray(local.pilots)&&local.pilots.length?local.pilots:localFallback();
    const q=String($('localFilter').value||'').trim().toLowerCase();
    const filtered=q?source.filter(row=>[
      row.name,row.corporationName,row.corporationTicker,row.allianceName,row.allianceTicker
    ].some(v=>String(v||'').toLowerCase().includes(q))):source;
    const corporations=groupedLocal(filtered,'corporationId','corporationName','corporationTicker');
    const alliances=groupedLocal(filtered,'allianceId','allianceName','allianceTicker');
    $('localSummary').replaceChildren(
      intelSection('ALLIANCES',alliances,'alliance'),
      intelSection('CORPORATIONS',corporations,'corporation'),
    );
    $('localRows').replaceChildren(...filtered.map(row=>{
      const tr=document.createElement('tr');
      const char=document.createElement('td');
      if(row.id)char.append(makeLink(row.name,'https://zkillboard.com/character/'+encodeURIComponent(String(row.id))+'/'));
      else char.textContent=row.name;
      const corp=document.createElement('td');
      if(row.corporationId){
        const label=(row.corporationTicker?'['+row.corporationTicker+'] ':'')+(row.corporationName||row.corporationId);
        corp.append(makeLink(label,'https://evemaps.dotlan.net/corp/'+encodeURIComponent(String(row.corporationId))));
      }else corp.textContent='—';
      const alliance=document.createElement('td');
      if(row.allianceId){
        const label=(row.allianceTicker?'['+row.allianceTicker+'] ':'')+(row.allianceName||row.allianceId);
        alliance.append(makeLink(label,'https://evemaps.dotlan.net/alliance/'+encodeURIComponent(String(row.allianceId))));
      }else alliance.textContent='—';
      tr.append(char,corp,alliance);
      return tr;
    }));
    const unresolved=Array.isArray(local.unresolved)?local.unresolved:[];
    $('localShownCount').textContent=(q?filtered.length+' of ':'')+source.length+' pilots'+(unresolved.length?' • '+unresolved.length+' unresolved':'');
  }
  function render(){
    dscanRows=parseDscan(share?.dscanText||'');
    renderHeader();
    renderStats();
    renderRecons();
    renderDscan();
    renderLocal();
    const hasAny=Boolean(share?.dscanText||share?.localText||(share?.manualRecons||[]).length);
    $('emptyPanel').classList.toggle('hidden',hasAny);
    $('content').classList.remove('hidden');
  }
  function fail(message){
    $('errorPanel').textContent=String(message||'Shared intel could not be loaded.');
    $('errorPanel').classList.remove('hidden');
    $('content').classList.add('hidden');
    $('scanMeta').textContent='JLR shared intel unavailable';
  }
  async function copyText(text,button,done='COPIED'){
    try{
      await navigator.clipboard.writeText(String(text||''));
      if(button){
        const prior=button.textContent; button.textContent=done;
        setTimeout(()=>button.textContent=prior,1200);
      }
    }catch{}
  }
  async function load(){
    const token=tokenFromPath();
    if(!/^[A-Za-z0-9_-]{8,}$/.test(token))return fail('Invalid JLR shared-intel link.');
    try{
      const response=await fetch('/api/dscan-share/'+encodeURIComponent(token),{headers:{Accept:'application/json'},cache:'no-store'});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload?.message||payload?.error||('HTTP '+response.status));
      share=payload.share;
      render();
      shipCatalogTask=loadShipCatalog();
    }catch(error){fail(error?.message||error)}
  }

  $('copyLink').addEventListener('click',()=>copyText(location.href,$('copyLink'),'LINK COPIED'));
  $('copyDscan').addEventListener('click',()=>copyText(share?.dscanText||'',$('copyDscan'),'D-SCAN COPIED'));
  $('copySummary').addEventListener('click',async()=>{
    if(shipCatalogTask)await shipCatalogTask;
    return copyText(briefSummary(),$('copySummary'),'SUMMARY COPIED');
  });
  $('dscanFilter').addEventListener('input',renderDscan);
  $('localFilter').addEventListener('input',renderLocal);
  load();
})();
