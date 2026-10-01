(() => {
  'use strict';
  const data=new Map(),busy=new Set(),errors=new Map();
  let section='assets',page=0;
  const pageSize=50;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const numeric=value=>typeof value==='number'&&Number.isFinite(value);
  const count=value=>numeric(value)?value.toLocaleString():'Not reported';
  const money=value=>numeric(value)?Math.round(value).toLocaleString()+' ISK':'Not reported';
  const date=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString():'Not reported';
  const status=value=>String(value||'Not reported').replaceAll('_',' ');
  const dates=row=>Date.parse(row.issued||row.startDate||'')||0;
  const amount=(row,kind)=>kind==='assets'?row.quantity:kind==='jobs'?row.runs:kind==='contracts'?(row.type==='courier'?row.reward:row.price):numeric(row.price)&&numeric(row.remaining)?row.price*row.remaining:null;
  function select(records,{query='',filter='',sort='name',kind='assets'}={}){
    const q=query.trim().toLowerCase();
    return (records||[]).filter(row=>(!q||Object.values(row).join(' ').toLowerCase().includes(q))&&(!filter||(kind==='assets'?row.storage:kind==='orders'?row.side:row.status)===filter)).slice().sort((a,b)=>sort==='newest'?dates(b)-dates(a)||String(a.name).localeCompare(String(b.name)):sort==='amount'?(amount(b,kind)??-Infinity)-(amount(a,kind)??-Infinity)||String(a.name).localeCompare(String(b.name)):String(a.name).localeCompare(String(b.name)));
  }
  const field=(label,value)=>'<div><small>'+esc(label)+'</small><b>'+esc(value)+'</b></div>';
  function record(row){
    let primary='',secondary='',details='';
    if(section==='assets'){
      primary=row.missingQuantity?'Quantity incomplete':count(row.quantity)+' units';secondary=row.location;
      details=field('Storage',row.storage||'Not reported')+field('Asset stacks',count(row.stacks))+field('Blueprint copy',row.blueprintCopy?'Yes':'No')+field('Type ID',String(row.typeId))+field('Location ID',String(row.locationId))+(row.unresolvedLocation?field('Location status','Container chain could not be resolved'):'');
    }else if(section==='jobs'){
      primary=status(row.status);secondary=count(row.runs)+' runs';
      details=field('Installer',row.installer)+field('Location',row.location)+field('Job cost',money(row.cost))+field('Started',date(row.startDate))+field('Ends',date(row.endDate))+field('Activity ID',count(row.activityId))+field('Job ID',String(row.id));
    }else if(section==='contracts'){
      primary=status(row.status);secondary=status(row.type);
      details=field('Issuer',row.issuer)+field('Assignee',row.assignee)+field('Start location',row.startLocation)+field('Destination',row.endLocation||'Not applicable')+field('Price',money(row.price))+field('Reward',money(row.reward))+field('Collateral',money(row.collateral))+field('Issued',date(row.issued))+field('Expires',date(row.expires))+field('Contract ID',String(row.id));
    }else{
      primary=row.side;secondary=count(row.remaining)+' remaining';
      details=field('Price / unit',money(row.price))+field('Remaining order value',money(amount(row,'orders')))+field('Original quantity',count(row.total))+field('Location',row.location)+field('Issued by',row.issuer)+field('Issued',date(row.issued))+field('Duration (days)',count(row.duration))+field('Escrow',money(row.escrow))+field('Order ID',String(row.id));
    }
    return '<details class="ceo-operation-record"><summary><strong>'+esc(row.name)+'</strong><span>'+esc(primary)+'</span><span>'+esc(secondary)+'</span></summary><div class="ceo-operation-detail">'+details+'</div></details>';
  }
  function render(){
    if(!$('ceoOperationRecords'))return;
    const current=data.get(section),loading=busy.has(section),locallyFailed=errors.has(section);
    const refresh=$('ceoOperationRefresh');if(refresh){refresh.disabled=loading;refresh.textContent=loading?'LOADING…':'REFRESH '+section.toUpperCase();}
    document.querySelectorAll('[data-ceo-operation-tab]').forEach(button=>{const kind=button.dataset.ceoOperationTab;button.classList.toggle('active',kind===section);button.setAttribute('aria-selected',String(kind===section));const cached=data.get(kind);button.title=busy.has(kind)?'Loading ESI data':cached?(cached.available?'Last successful pull: ':'Pull unavailable: ')+date(cached.updatedAt||cached.checkedAt):'Load '+kind;});
    const stamp=$('ceoOperationStamp');if(stamp)stamp.textContent=current?(current.stale||locallyFailed?'STALE • LAST SUCCESSFUL PULL ':current.available?'ESI PULL ':'ESI UNAVAILABLE • CHECKED ')+date(current.updatedAt||current.checkedAt)+(current.truncated?' • PARTIAL RESULTS':''):loading?'Loading '+section+' from ESI…':'Choose a section to load ESI data.';
    const warning=$('ceoOperationWarning');if(warning){const message=errors.get(section)||current?.error||'';warning.classList.toggle('hidden',!message&&!current?.truncated);warning.textContent=(message?message+(current?.stale||locallyFailed&&current?.updatedAt?' Previous results remain visible.':'')+' ':'')+(current?.truncated?'Only '+current.pagesFetched+' of '+current.reportedPages+' pages were fetched; counts and totals are partial.':'');}
    const records=current?.records||[];
    const filter=$('ceoOperationFilter');if(filter){const chosen=filter.value;const values=[...new Set(records.map(row=>section==='assets'?row.storage:section==='orders'?row.side:row.status).filter(Boolean))].sort();filter.innerHTML='<option value="">'+(section==='assets'?'All storage':section==='orders'?'Buy + sell':'All statuses')+'</option>'+values.map(value=>'<option value="'+esc(value)+'">'+esc(status(value))+'</option>').join('');filter.value=values.includes(chosen)?chosen:'';}
    const sort=$('ceoOperationSort');if(sort){const chosen=sort.value;sort.innerHTML='<option value="name">Name A–Z</option>'+(section!=='assets'?'<option value="newest">Newest first</option>':'')+'<option value="amount">'+({assets:'Most units',jobs:'Most runs',contracts:'Highest price / courier reward',orders:'Highest remaining order value'}[section])+'</option>';sort.value=['name','amount',...(section==='assets'?[]:['newest'])].includes(chosen)?chosen:'name';}
    const summary=$('ceoOperationSummary');if(summary){const s=current?.summary;let metrics=[];if(s)metrics=section==='assets'?[['ASSET GROUPS',count(s.groups)],['STACKS',count(s.stacks)],['UNITS',s.missingQuantity?'Incomplete':count(s.units)]]:section==='jobs'?[['JOBS RETURNED',count(s.jobs)],['ACTIVE',count(s.active)],['READY',count(s.ready)]]:section==='contracts'?[['CONTRACTS RETURNED',count(s.contracts)],['OUTSTANDING',count(s.outstanding)],['IN PROGRESS',count(s.inProgress)]]:[['OPEN ORDERS',count(s.orders)],['BUY ORDERS • REMAINING VALUE',s.missingValue?'Incomplete':money(s.buyValue)],['SELL ORDERS • REMAINING VALUE',s.missingValue?'Incomplete':money(s.sellValue)]];summary.innerHTML=metrics.map(([label,value])=>field(label,value)).join('');}
    const note=$('ceoOperationNote');if(note)note.textContent={assets:'Assets are grouped by type, root location and storage. Blueprint copies count as items. Unresolved locations remain IDs.',jobs:'Includes the job history ESI returns. End dates are scheduled times; the ESI job status is shown without assuming completion.',contracts:'Contract status, prices, rewards and collateral come from ESI. This view does not accept or modify contracts.',orders:'Open order values are remaining quantity × listed price. They are not wallet balances or profit.'}[section];
    const matches=select(records,{query:$('ceoOperationSearch')?.value||'',filter:filter?.value||'',sort:sort?.value||'name',kind:section});
    const pages=Math.max(1,Math.ceil(matches.length/pageSize));page=Math.min(page,pages-1);
    const visible=matches.slice(page*pageSize,(page+1)*pageSize);
    $('ceoOperationRecords').innerHTML=visible.map(record).join('')||'<div class="visual-empty">'+(loading?'Loading '+section+'…':!current?.available&&!current?.stale?'This section is unavailable. Other sections can still be opened.':records.length?'No records match these filters.':'ESI returned no records for this section.')+'</div>';
    const resultCount=$('ceoOperationCount');if(resultCount)resultCount.textContent=!current?'':!current.available&&!current.stale?'Data unavailable':matches.length?'Showing '+(page*pageSize+1)+'–'+(page*pageSize+visible.length)+' of '+matches.length+' matching records'+(current.truncated?' • partial':''):'0 matching records';
    const prev=$('ceoOperationPrev'),next=$('ceoOperationNext');if(prev)prev.disabled=page===0;if(next)next.disabled=page>=pages-1;
  }
  async function load(force=false){
    const requested=section;if(busy.has(requested))return;
    if(data.has(requested)&&!force){render();return;}
    busy.add(requested);errors.delete(requested);render();
    try{const response=await fetch('/api/ceo/operations?section='+requested+(force?'&force=1':''),{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error(response.status===401?'Log in to view CEO operations.':response.status===403?'CEO operations are restricted.':'Operations request failed ('+response.status+').');data.set(requested,await response.json());}
    catch(error){errors.set(requested,String(error.message||error));}
    finally{busy.delete(requested);render();}
  }
  document.addEventListener('click',event=>{
    const tab=event.target?.closest?.('[data-ceo-operation-tab]');
    if(tab){section=tab.dataset.ceoOperationTab;page=0;if($('ceoOperationFilter'))$('ceoOperationFilter').value='';void load();}
    else if(event.target?.closest?.('#ceoOperationRefresh'))void load(true);
    else if(event.target?.closest?.('#ceoOperationPrev')){page=Math.max(0,page-1);render();}
    else if(event.target?.closest?.('#ceoOperationNext')){page++;render();}
  });
  document.addEventListener('input',event=>{if(event.target?.id==='ceoOperationSearch'){page=0;render();}});
  document.addEventListener('change',event=>{if(['ceoOperationFilter','ceoOperationSort'].includes(event.target?.id)){page=0;render();}});
  window.JlrCeoOperations={load,render,select};
})();
