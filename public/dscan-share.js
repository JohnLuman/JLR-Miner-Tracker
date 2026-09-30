(()=>{
  const $=id=>document.getElementById(id);
  let share=null;
  let mode='text';
  let dscanRows=[];

  function tokenFromPath(){
    const parts=location.pathname.split('/').filter(Boolean);
    return parts.at(-1)||'';
  }
  function columnsFor(line){
    return (line.includes('\t')?line.split('\t'):line.split(/\s{3,}/)).map(v=>v.trim()).filter(Boolean);
  }
  function isDistance(value){
    return /^(?:-|\d+(?:\.\d+)?\s*(?:m|km|au))$/i.test(String(value||'').replace(/,/g,'').trim());
  }
  function rawLines(text){
    return String(text||'').replace(/\r/g,'').split('\n').map(v=>v.trim()).filter(Boolean);
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
  function detectMode(text){
    const lines=rawLines(text);
    if(!lines.length)return'text';
    const distanceRows=lines.filter(line=>{
      const cols=columnsFor(line);
      return cols.length>=2&&isDistance(cols.at(-1));
    }).length;
    if(distanceRows>=1&&(distanceRows/lines.length>=.15||lines.filter(line=>line.includes('\t')).length/lines.length>=.5))return'dscan';
    return lines.filter(line=>!line.includes('\t')&&columnsFor(line).length===1).length/lines.length>=.8?'local':'text';
  }
  function setStats(rows){
    rows.forEach((row,index)=>{
      $('stat'+(index+1)+'Label').textContent=row[0];
      $('stat'+(index+1)+'Value').textContent=Number(row[1]||0).toLocaleString();
    });
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
  function localFallback(){
    return rawLines(share?.text||'').map((name,index)=>({
      id:null,name,corporationId:null,corporationName:'',corporationTicker:'',
      allianceId:null,allianceName:'',allianceTicker:'',rawIndex:index,
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
  function groupCard(row,kind){
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
  function sectionBlock(title,rows,kind){
    const block=document.createElement('section');
    block.className='intel-block';
    const head=document.createElement('div');
    head.className='intel-block-head';
    const h=document.createElement('strong'); h.textContent=title;
    const n=document.createElement('span'); n.textContent=String(rows.length);
    head.append(h,n);
    const grid=document.createElement('div'); grid.className='intel-grid';
    if(rows.length)for(const row of rows)grid.append(groupCard(row,kind));
    else{
      const empty=document.createElement('span');
      empty.className='muted';
      empty.textContent='No '+title.toLowerCase()+' resolved yet.';
      grid.append(empty);
    }
    block.append(head,grid);
    return block;
  }
  function renderLocal(){
    const local=share?.local||{};
    const sourcePilots=Array.isArray(local.pilots)&&local.pilots.length?local.pilots:localFallback();
    const q=String($('filter').value||'').trim().toLowerCase();
    const filtered=q?sourcePilots.filter(row=>[
      row.name,row.corporationName,row.corporationTicker,row.allianceName,row.allianceTicker
    ].some(value=>String(value||'').toLowerCase().includes(q))):sourcePilots;
    const corporations=groupedLocal(filtered,'corporationId','corporationName','corporationTicker');
    const alliances=groupedLocal(filtered,'allianceId','allianceName','allianceTicker');
    const allCorps=Array.isArray(local.corporations)?local.corporations:groupedLocal(sourcePilots,'corporationId','corporationName','corporationTicker');
    const allAlliances=Array.isArray(local.alliances)?local.alliances:groupedLocal(sourcePilots,'allianceId','allianceName','allianceTicker');

    setStats([
      ['PILOTS',local.pilotCount||share?.lineCount||sourcePilots.length],
      ['CORPORATIONS',allCorps.length],
      ['ALLIANCES',allAlliances.length],
    ]);
    $('summaryTitle').textContent='LOCAL COMPOSITION';
    $('detailTitle').textContent='CHARACTER LIST';
    $('filter').placeholder='Filter pilot, corporation, or alliance…';
    $('summaryHost').replaceChildren(
      sectionBlock('ALLIANCES',alliances,'alliance'),
      sectionBlock('CORPORATIONS',corporations,'corporation'),
    );

    const head=document.createElement('tr');
    for(const label of ['CHARACTER','CORPORATION','ALLIANCE']){
      const th=document.createElement('th'); th.textContent=label; head.appendChild(th);
    }
    $('detailHead').replaceChildren(head);
    $('detailRows').replaceChildren(...filtered.map(row=>{
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
    $('shownCount').textContent=(q?filtered.length+' of ':'')+sourcePilots.length+' pilots'+(unresolved.length?' • '+unresolved.length+' unresolved':'');
    if(unresolved.length){
      const notice=document.createElement('div');
      notice.className='unresolved';
      notice.textContent='Unresolved from ESI: '+unresolved.join(', ');
      $('summaryHost').append(notice);
    }
  }
  function groupedDscan(rows){
    const map=new Map();
    for(const row of rows){
      const key=String(row.type||'Unknown').trim()||'Unknown';
      map.set(key,(map.get(key)||0)+1);
    }
    return [...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  }
  function renderDscan(){
    const q=String($('filter').value||'').trim().toLowerCase();
    const filtered=q?dscanRows.filter(row=>[
      row.name,row.type,row.distance
    ].some(value=>String(value||'').toLowerCase().includes(q))):dscanRows;
    setStats([
      ['OBJECTS',dscanRows.length],
      ['UNIQUE TYPES',groupedDscan(dscanRows).length],
      ['RAW LINES',share?.lineCount||0],
    ]);
    $('summaryTitle').textContent='D-SCAN BREAKDOWN';
    $('detailTitle').textContent='INDIVIDUAL OBJECTS';
    $('filter').placeholder='Filter type, object, or distance…';

    const groups=document.createElement('div');
    groups.className='groups';
    for(const [type,count] of groupedDscan(filtered)){
      const el=document.createElement('div'); el.className='group';
      const n=document.createElement('strong'); n.textContent=String(count);
      const t=document.createElement('span'); t.textContent=type;
      el.append(n,t); groups.append(el);
    }
    $('summaryHost').replaceChildren(groups);

    const head=document.createElement('tr');
    for(const label of ['#','NAME','TYPE','DISTANCE']){
      const th=document.createElement('th'); th.textContent=label; head.appendChild(th);
    }
    $('detailHead').replaceChildren(head);
    $('detailRows').replaceChildren(...filtered.map((row,index)=>{
      const tr=document.createElement('tr');
      for(const value of [String(index+1),row.name,row.type,row.distance||'—']){
        const td=document.createElement('td'); td.textContent=value; tr.appendChild(td);
      }
      return tr;
    }));
    $('shownCount').textContent=filtered.length===dscanRows.length
      ? filtered.length+' objects'
      : filtered.length+' of '+dscanRows.length+' objects';
  }
  function renderText(){
    const lines=rawLines(share?.text||'');
    const q=String($('filter').value||'').trim().toLowerCase();
    const filtered=q?lines.filter(line=>line.toLowerCase().includes(q)):lines;
    setStats([['LINES',lines.length],['MATCHING',filtered.length],['RAW LINES',share?.lineCount||lines.length]]);
    $('summaryTitle').textContent='SHARED TEXT';
    $('detailTitle').textContent='LINES';
    $('filter').placeholder='Filter shared text…';
    $('summaryHost').replaceChildren();
    const head=document.createElement('tr');
    const th=document.createElement('th'); th.textContent='TEXT'; head.appendChild(th);
    $('detailHead').replaceChildren(head);
    $('detailRows').replaceChildren(...filtered.map(line=>{
      const tr=document.createElement('tr'); const td=document.createElement('td');
      td.textContent=line; tr.append(td); return tr;
    }));
    $('shownCount').textContent=filtered.length+' lines';
  }
  function render(){
    if(mode==='local')return renderLocal();
    if(mode==='dscan')return renderDscan();
    return renderText();
  }
  function fail(message){
    $('errorPanel').textContent=String(message||'Shared scan could not be loaded.');
    $('errorPanel').classList.remove('hidden');
    $('content').classList.add('hidden');
    $('scanMeta').textContent='JLR shared scan unavailable';
  }
  async function copyScan(){
    if(!share?.text)return;
    try{
      await navigator.clipboard.writeText(share.text);
      const button=$('copyScan');
      const previous=button.textContent;
      button.textContent='COPIED';
      setTimeout(()=>button.textContent=previous,1200);
    }catch{
      $('rawText').scrollIntoView({behavior:'smooth',block:'center'});
    }
  }
  async function load(){
    const token=tokenFromPath();
    if(!/^[A-Za-z0-9_-]{8,}$/.test(token))return fail('Invalid JLR shared scan link.');
    try{
      const response=await fetch('/api/dscan-share/'+encodeURIComponent(token),{headers:{Accept:'application/json'}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload?.message||payload?.error||('HTTP '+response.status));
      share=payload.share;
      mode=String(share?.kind||detectMode(share?.text||''));
      dscanRows=mode==='dscan'?parseDscan(share?.text||''):[];
      const created=share?.createdAt?new Date(share.createdAt):null;
      const label=mode==='local'?'LOCAL SCAN':mode==='dscan'?'D-SCAN':'SHARED SCAN';
      $('shareTitle').textContent=label;
      $('copyScan').textContent=mode==='local'?'COPY LOCAL':mode==='dscan'?'COPY D-SCAN':'COPY SCAN';
      $('rawSummary').textContent=mode==='local'?'RAW LOCAL TEXT':mode==='dscan'?'RAW D-SCAN TEXT':'RAW SHARED TEXT';
      $('scanMeta').textContent=label+' • shared '+(created&&!Number.isNaN(created.getTime())?created.toLocaleString():'through JLR');
      $('rawText').textContent=share?.text||'';
      $('copyScan').disabled=!share?.text;
      $('content').classList.remove('hidden');
      document.title='JLR '+label+' • '+Number(share?.lineCount||0).toLocaleString()+' lines';
      render();
    }catch(error){fail(error?.message||error)}
  }
  $('copyScan').addEventListener('click',copyScan);
  $('filter').addEventListener('input',render);
  load();
})();
