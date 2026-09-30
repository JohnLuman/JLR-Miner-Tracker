(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  let share=null;
  let dscanRows=[];

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
    $('shareTitle').textContent=system?system+' • SHARED INTEL':'SHARED INTEL';
    const created=share?.createdAt?new Date(share.createdAt):null;
    const updated=share?.updatedAt?new Date(share.updatedAt):null;
    const createdText=created&&!Number.isNaN(created.getTime())?'created '+created.toLocaleString():'created through JLR';
    const updatedText=updated&&!Number.isNaN(updated.getTime())?'updated '+updated.toLocaleString():'';
    $('scanMeta').textContent=[createdText,updatedText].filter(Boolean).join(' • ');
    document.title=(system?system+' • ':'')+'JLR Shared Intel';
  }
  function renderStats(){
    $('dscanObjectCount').textContent=dscanRows.length.toLocaleString();
    const local=share?.local||{};
    const pilots=Number(local.pilotCount)||rawLines(share?.localText||'').length;
    $('localPilotCount').textContent=pilots.toLocaleString();
    const recons=(share?.manualRecons||[]).reduce((sum,row)=>sum+Math.max(0,Number(row?.count)||0),0);
    $('reconCount').textContent=recons.toLocaleString();
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
    const text=String(share?.dscanText||'');
    $('dscanPanel').classList.toggle('hidden',!text);
    $('copyDscan').disabled=!text;
    $('rawDscan').textContent=text;
    if(!text)return;
    const q=String($('dscanFilter').value||'').trim().toLowerCase();
    const filtered=q?dscanRows.filter(row=>[row.name,row.type,row.distance].some(v=>String(v||'').toLowerCase().includes(q))):dscanRows;
    const summary=$('dscanSummary');
    summary.replaceChildren(...groupDscan(filtered).map(([type,count])=>{
      const el=document.createElement('div'); el.className='group';
      const n=document.createElement('strong'); n.textContent=String(count);
      const t=document.createElement('span'); t.textContent=type;
      el.append(n,t); return el;
    }));
    $('dscanRows').replaceChildren(...filtered.map((row,index)=>{
      const tr=document.createElement('tr');
      [String(index+1),row.name,row.type,row.distance||'—'].forEach(value=>{
        const td=document.createElement('td'); td.textContent=value; tr.append(td);
      });
      return tr;
    }));
    $('dscanShownCount').textContent=filtered.length===dscanRows.length
      ?filtered.length+' objects'
      :filtered.length+' of '+dscanRows.length+' objects';
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
    }catch(error){fail(error?.message||error)}
  }

  $('copyLink').addEventListener('click',()=>copyText(location.href,$('copyLink'),'LINK COPIED'));
  $('copyDscan').addEventListener('click',()=>copyText(share?.dscanText||'',$('copyDscan'),'D-SCAN COPIED'));
  $('dscanFilter').addEventListener('input',renderDscan);
  $('localFilter').addEventListener('input',renderLocal);
  load();
})();
