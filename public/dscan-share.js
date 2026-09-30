(()=>{
  const $=id=>document.getElementById(id);
  let share=null;
  let parsedRows=[];

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
  function parse(text){
    const out=[];
    for(const raw of String(text||'').replace(/\r/g,'').split('\n')){
      const line=raw.trim();
      if(!line)continue;
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
  function grouped(rows){
    const map=new Map();
    for(const row of rows){
      const key=String(row.type||'Unknown').trim()||'Unknown';
      map.set(key,(map.get(key)||0)+1);
    }
    return [...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  }
  function render(){
    const q=String($('filter').value||'').trim().toLowerCase();
    const filtered=q?parsedRows.filter(row=>
      row.name.toLowerCase().includes(q)||row.type.toLowerCase().includes(q)||row.distance.toLowerCase().includes(q)
    ):parsedRows;
    const groups=grouped(filtered);
    $('groups').replaceChildren(...groups.map(([type,count])=>{
      const el=document.createElement('div');
      el.className='group';
      const n=document.createElement('strong'); n.textContent=String(count);
      const t=document.createElement('span'); t.textContent=type;
      el.append(n,t); return el;
    }));
    $('rows').replaceChildren(...filtered.map((row,index)=>{
      const tr=document.createElement('tr');
      for(const value of [String(index+1),row.name,row.type,row.distance||'—']){
        const td=document.createElement('td'); td.textContent=value; tr.appendChild(td);
      }
      return tr;
    }));
    $('shownCount').textContent=filtered.length===parsedRows.length
      ? filtered.length+' objects'
      : filtered.length+' of '+parsedRows.length+' objects';
  }
  function fail(message){
    $('errorPanel').textContent=String(message||'Shared D-scan could not be loaded.');
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
    if(!/^[A-Za-z0-9_-]{8,}$/.test(token))return fail('Invalid JLR D-scan share link.');
    try{
      const response=await fetch('/api/dscan-share/'+encodeURIComponent(token),{headers:{Accept:'application/json'}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload?.message||payload?.error||('HTTP '+response.status));
      share=payload.share;
      parsedRows=parse(share?.text||'');
      const created=share?.createdAt?new Date(share.createdAt):null;
      $('scanMeta').textContent='Shared '+(created&&!Number.isNaN(created.getTime())?created.toLocaleString():'through JLR');
      $('objectCount').textContent=parsedRows.length.toLocaleString();
      $('typeCount').textContent=grouped(parsedRows).length.toLocaleString();
      $('lineCount').textContent=Number(share?.lineCount||0).toLocaleString();
      $('rawText').textContent=share?.text||'';
      $('copyScan').disabled=!share?.text;
      $('content').classList.remove('hidden');
      document.title='JLR D-Scan • '+parsedRows.length+' objects';
      render();
    }catch(error){fail(error?.message||error)}
  }
  $('copyScan').addEventListener('click',copyScan);
  $('filter').addEventListener('input',render);
  load();
})();