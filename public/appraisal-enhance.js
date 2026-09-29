(()=>{
  'use strict';
  const STORAGE_KEY='jlrAppraisalPayoutPct';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const num=value=>Math.max(0,Number(value)||0);
  const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const exact=value=>num(value).toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');
  const exactPretty=value=>num(value).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  const shortIsk=value=>{
    const n=num(value);
    if(n>=1e12)return(n/1e12).toFixed(2)+'T';
    if(n>=1e9)return(n/1e9).toFixed(2)+'B';
    if(n>=1e6)return(n/1e6).toFixed(2)+'M';
    if(n>=1e3)return(n/1e3).toFixed(1)+'K';
    return Math.round(n).toLocaleString();
  };
  const price=value=>num(value).toLocaleString(undefined,{maximumFractionDigits:2});
  const volume=value=>{
    const n=num(value);
    if(n>=1e9)return(n/1e9).toFixed(2)+'B m³';
    if(n>=1e6)return(n/1e6).toFixed(2)+'M m³';
    if(n>=1e3)return(n/1e3).toFixed(1)+'K m³';
    return n.toLocaleString(undefined,{maximumFractionDigits:2})+' m³';
  };
  const modeLabel=value=>String(value||'split')==='buy'?'BUY':String(value||'split')==='sell'?'SELL':'SPLIT';
  const variantLabel=value=>String(value||'immediate')==='top5percent'?'TOP 5% AVG':'IMMEDIATE';
  let appraisal=null;
  let appraisalIntel=null;
  let appraisalIntelBusy=false;
  let appraisalIntelSeq=0;
  let payoutPct=clamp(Number(localStorage.getItem(STORAGE_KEY))||100,0,200);
  let observerTimer=0;

  function pathOf(input){
    try{
      const raw=typeof input==='string'?input:(input&&input.url)||'';
      return new URL(raw,location.origin).pathname;
    }catch{return''}
  }
  const originalFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const path=pathOf(input);
    const response=await originalFetch(input,init);
    if(path==='/api/appraisal'&&response.ok){
      response.clone().json().then(data=>{
        appraisal=data&&typeof data==='object'?data:null;
        appraisalIntel=null;
        setTimeout(()=>{
          renderEnhanced(true);
          if(appraisal)void loadAppraisalIntel(appraisal);
        },0);
      }).catch(()=>{});
      return response;
    }
    if(path==='/api/appraisal/share'&&response.ok){
      try{
        const payload=await response.clone().json();
        if(payload&&payload.shareUrl){
          const link=new URL(payload.shareUrl,location.origin);
          link.searchParams.set('p',String(Number(payoutPct.toFixed(2))));
          payload.shareUrl=link.toString();
          const headers=new Headers(response.headers);
          headers.delete('content-length');
          return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers});
        }
      }catch{}
    }
    return response;
  };

  async function copyText(text){
    const value=String(text??'');
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText){
        await navigator.clipboard.writeText(value);
        return true;
      }
    }catch{}
    const helper=document.createElement('textarea');
    helper.value=value;
    helper.setAttribute('readonly','');
    helper.style.position='fixed';
    helper.style.opacity='0';
    document.body.appendChild(helper);
    helper.select();
    let copied=false;
    try{copied=document.execCommand('copy')}catch{}
    helper.remove();
    return copied;
  }
  function showToast(message){
    const host=document.getElementById('toast');
    if(!host)return;
    host.textContent=message;
    host.classList.remove('hidden');
    clearTimeout(showToast.timer);
    showToast.timer=setTimeout(()=>host.classList.add('hidden'),1700);
  }
  function selectedSummary(summary){
    const mode=String(appraisal&&appraisal.pricing||'split');
    if(mode==='buy')return num(summary&&summary.buy);
    if(mode==='sell')return num(summary&&summary.sell);
    return num(summary&&summary.split);
  }
  function selectedTotal(row){
    const mode=String(appraisal&&appraisal.pricing||'split');
    if(mode==='buy')return num(row&&row.buyTotal);
    if(mode==='sell')return num(row&&row.sellTotal);
    return num(row&&row.splitTotal);
  }
  function copyStrong(raw,display,label,klass=''){
    return '<strong><button type="button" class="jlr-appraisal-copy-value '+klass+'" data-jlr-copy="'+esc(exact(raw))+'" title="Copy exact '+esc(label)+'">'+display+'</button></strong>';
  }
  function copyCell(raw,display,label,klass=''){
    return '<button type="button" class="jlr-appraisal-copy-value '+klass+'" data-jlr-copy="'+esc(exact(raw))+'" title="Copy exact '+esc(label)+'">'+display+'</button>';
  }

  function ensureUi(){
    const panel=document.querySelector('#forgePanel .appraisal-panel');
    if(!panel)return null;
    if(!document.getElementById('jlrAppraisalPayoutBar')){
      const controls=panel.querySelector('.appraisal-controls');
      if(controls){
        const bar=document.createElement('div');
        bar.id='jlrAppraisalPayoutBar';
        bar.className='jlr-appraisal-payout-bar';
        bar.innerHTML=
          '<div class="jlr-payout-copy"><span>PAYOUT %</span><strong>JLR NATIVE VALUE MODIFIER</strong><small>Applies to the selected Buy / Split / Sell value. Raw market prices stay unchanged.</small></div>'+
          '<div class="jlr-payout-presets" aria-label="Payout percentage presets">'+
            '<button type="button" data-jlr-payout="100">100%</button>'+
            '<button type="button" data-jlr-payout="95">95%</button>'+
            '<button type="button" data-jlr-payout="90">90%</button>'+
            '<button type="button" data-jlr-payout="75">75%</button>'+
          '</div>'+
          '<label class="jlr-payout-input"><span>CUSTOM</span><div><input id="jlrAppraisalPayoutPct" type="number" min="0" max="200" step="0.1" inputmode="decimal" value="'+esc(payoutPct)+'"><b>%</b></div></label>';
        controls.insertAdjacentElement('afterend',bar);
      }
    }
    if(!document.getElementById('jlrAppraisalIntelSection')){
      const section=document.createElement('section');
      section.id='jlrAppraisalIntelSection';
      section.className='jlr-appraisal-intel';
      section.innerHTML=
        '<div class="brain-card-head"><strong>SUPPORT MARKET INTEL</strong><small>Compression comparison + cached ESI market history</small></div>'+
        '<div id="jlrAppraisalIntelBody" class="jlr-appraisal-intel-body"><div class="visual-empty">Run an appraisal to load Support market intel.</div></div>';
      const refine=panel.querySelector('#appraisalRefineSection');
      if(refine)refine.insertAdjacentElement('afterend',section);
      else panel.appendChild(section);
    }
    const actions=panel.querySelector('.forge-actions');
    if(actions&&!document.getElementById('jlrAppraisalCopySummary')){
      const summary=document.createElement('button');
      summary.id='jlrAppraisalCopySummary';
      summary.className='orb silver';
      summary.type='button';
      summary.disabled=true;
      summary.textContent='COPY SUMMARY';
      actions.appendChild(summary);
      const table=document.createElement('button');
      table.id='jlrAppraisalCopyTable';
      table.className='orb silver';
      table.type='button';
      table.disabled=true;
      table.textContent='COPY TABLE';
      actions.appendChild(table);
    }
    if(panel.dataset.jlrAppraisalEnhanceBound!=='1'){
      panel.dataset.jlrAppraisalEnhanceBound='1';
      panel.addEventListener('click',async event=>{
        const preset=event.target.closest('[data-jlr-payout]');
        if(preset){
          payoutPct=clamp(Number(preset.dataset.jlrPayout)||100,0,200);
          localStorage.setItem(STORAGE_KEY,String(payoutPct));
          const input=document.getElementById('jlrAppraisalPayoutPct');
          if(input)input.value=String(payoutPct);
          renderEnhanced(true);
          return;
        }
        const copy=event.target.closest('[data-jlr-copy]');
        if(copy){
          const ok=await copyText(copy.dataset.jlrCopy||'');
          if(ok){
            copy.classList.add('jlr-copied');
            setTimeout(()=>copy.classList.remove('jlr-copied'),900);
          }
          showToast(ok?'Exact value copied.':'Could not copy value.');
          return;
        }
        if(event.target.closest('#jlrAppraisalCopySummary')){
          const ok=await copySummary();
          showToast(ok?'Appraisal summary copied.':'Run an appraisal first.');
          return;
        }
        if(event.target.closest('#jlrAppraisalCopyTable')){
          const ok=await copyTable();
          showToast(ok?'Appraisal table copied.':'Run an appraisal first.');
        }
      });
      panel.addEventListener('input',event=>{
        if(event.target&&event.target.id==='jlrAppraisalPayoutPct'){
          const raw=Number(event.target.value);
          payoutPct=clamp(Number.isFinite(raw)?raw:100,0,200);
          localStorage.setItem(STORAGE_KEY,String(payoutPct));
          renderEnhanced(true);
        }
      });
    }
    return panel;
  }

  function syncControls(){
    document.querySelectorAll('[data-jlr-payout]').forEach(button=>{
      button.classList.toggle('active',Math.abs(Number(button.dataset.jlrPayout)-payoutPct)<0.001);
    });
    const input=document.getElementById('jlrAppraisalPayoutPct');
    if(input&&document.activeElement!==input)input.value=String(payoutPct);
    const ready=!!appraisal;
    const summary=document.getElementById('jlrAppraisalCopySummary');
    const table=document.getElementById('jlrAppraisalCopyTable');
    if(summary)summary.disabled=!ready;
    if(table)table.disabled=!ready;
  }

  function renderSummary(force){
    const host=document.getElementById('appraisalSummary');
    if(!host||!appraisal)return;
    const summary=appraisal.summary||{};
    const factor=payoutPct/100;
    const payout=selectedSummary(summary)*factor;
    const signature=[appraisal.generatedAt||'',appraisal.pricing||'',payoutPct,summary.buy,summary.split,summary.sell].join('|');
    if(!force&&host.dataset.jlrEnhanceSig===signature&&host.querySelector('[data-jlr-copy]'))return;
    host.dataset.jlrEnhanceSig=signature;
    host.innerHTML=
      '<article class="appraisal-primary jlr-appraisal-payout-card"><span>'+esc(modeLabel(appraisal.pricing))+' PAYOUT @ '+esc(payoutPct.toFixed(1).replace(/\.0$/,''))+'%</span>'+
        copyStrong(payout,shortIsk(payout)+' ISK','payout','jlr-summary-copy')+'<small>Click any value to copy exact number</small></article>'+
      '<article><span>JITA BUY</span>'+copyStrong(summary.buy,shortIsk(summary.buy)+' ISK','Jita buy','jlr-summary-copy')+'</article>'+
      '<article><span>SPLIT</span>'+copyStrong(summary.split,shortIsk(summary.split)+' ISK','split','jlr-summary-copy')+'</article>'+
      '<article><span>JITA SELL</span>'+copyStrong(summary.sell,shortIsk(summary.sell)+' ISK','Jita sell','jlr-summary-copy')+'</article>'+
      '<article><span>VOLUME</span>'+copyStrong(summary.volume,volume(summary.volume),'volume','jlr-summary-copy')+'</article>'+
      '<article><span>ITEM TYPES</span>'+copyStrong(summary.resolvedLines,Number(summary.resolvedLines||0).toLocaleString(),'item types','jlr-summary-copy')+'</article>';
  }

  function renderItems(force){
    const host=document.getElementById('appraisalItems');
    if(!host||!appraisal)return;
    const rows=Array.isArray(appraisal.items)?appraisal.items:[];
    const signature=[appraisal.generatedAt||'',appraisal.pricing||'',payoutPct,rows.length].join('|');
    if(!force&&host.dataset.jlrEnhanceSig===signature&&host.querySelector('[data-jlr-copy]'))return;
    host.dataset.jlrEnhanceSig=signature;
    const factor=payoutPct/100;
    const body=rows.length?rows.map(row=>{
      if(row.resolved===false){
        return '<tr class="appraisal-unresolved"><td><strong>'+esc(row.name)+'</strong><small>UNRESOLVED</small></td><td colspan="9">—</td></tr>';
      }
      const payout=selectedTotal(row)*factor;
      return '<tr><td><strong>'+esc(row.name)+'</strong><small>'+Number(row.buyOrderCount||0).toLocaleString()+' buy orders • '+Number(row.sellOrderCount||0).toLocaleString()+' sell orders</small></td>'+
        '<td>'+copyCell(row.amount,Number(row.amount||0).toLocaleString(),'quantity')+'</td>'+
        '<td>'+copyCell(row.totalVolume,volume(row.totalVolume),'volume')+'</td>'+
        '<td>'+copyCell(row.buy,price(row.buy),'buy per item')+'</td>'+
        '<td>'+copyCell(row.split,price(row.split),'split per item')+'</td>'+
        '<td>'+copyCell(row.sell,price(row.sell),'sell per item')+'</td>'+
        '<td>'+copyCell(row.buyTotal,shortIsk(row.buyTotal),'buy total')+'</td>'+
        '<td>'+copyCell(row.splitTotal,shortIsk(row.splitTotal),'split total')+'</td>'+
        '<td>'+copyCell(row.sellTotal,shortIsk(row.sellTotal),'sell total')+'</td>'+
        '<td class="jlr-payout-cell">'+copyCell(payout,shortIsk(payout),'payout total','jlr-payout-copy-value')+'</td></tr>';
    }).join(''):'<tr><td colspan="10">No appraisal rows.</td></tr>';
    host.innerHTML='<div class="appraisal-table-wrap"><table class="appraisal-table jlr-appraisal-table">'+
      '<thead><tr><th>ITEM</th><th>QTY</th><th>VOLUME</th><th>BUY / EA</th><th>SPLIT / EA</th><th>SELL / EA</th><th>BUY TOTAL</th><th>SPLIT TOTAL</th><th>SELL TOTAL</th><th>PAYOUT TOTAL</th></tr></thead>'+
      '<tbody>'+body+'</tbody></table></div>';
  }

  function enhanceRefine(){
    if(!appraisal||!appraisal.refine)return;
    const refine=appraisal.refine;
    const pctInput=document.getElementById('appraisalRefineRate');
    const pct=clamp(Number(pctInput&&pctInput.value)||num(refine.selectedRate??refine.defaultRate)*100,0,100);
    const factor=pct/100;
    const cards=[num(refine.buyAt100)*factor,num(refine.eligibleBuy),num(refine.buyAt100)*factor-num(refine.eligibleBuy),num(refine.recognizedLines)];
    document.querySelectorAll('#appraisalRefineSummary article strong').forEach((node,index)=>{
      if(index>=cards.length)return;
      node.dataset.jlrCopy=exact(cards[index]);
      node.classList.add('jlr-appraisal-copy-inline');
      node.title='Click to copy exact value';
    });
    const minerals=Array.isArray(refine.minerals)?refine.minerals:[];
    document.querySelectorAll('#appraisalRefineBreakdown .appraisal-refine-minerals>div').forEach((node,index)=>{
      const row=minerals[index];
      if(!row)return;
      const qty=node.querySelector('strong');
      const value=node.querySelector('small');
      if(qty){
        qty.dataset.jlrCopy=exact(num(row.quantityAt100)*factor);
        qty.classList.add('jlr-appraisal-copy-inline');
        qty.title='Click to copy exact quantity';
      }
      if(value){
        value.dataset.jlrCopy=exact(num(row.valueAt100)*factor);
        value.classList.add('jlr-appraisal-copy-inline');
        value.title='Click to copy exact ISK value';
      }
    });
  }

  function signed(value){
    const n=Number(value);
    return Number.isFinite(n)?n:0;
  }
  function signedPct(value){
    const n=Number(value);
    if(!Number.isFinite(n))return '—';
    const prefix=n>0?'+':'';
    return prefix+n.toFixed(Math.abs(n)>=10?1:2)+'%';
  }
  function intelPayload(value){
    const source=value&&typeof value==='object'?value:{};
    return{
      generatedAt:source.generatedAt||null,
      source:source.source||'',
      market:source.market||null,
      pricing:source.pricing||'split',
      pricingVariant:source.pricingVariant||'immediate',
      items:(Array.isArray(source.items)?source.items:[]).slice(0,120).map(row=>({
        resolved:row?.resolved!==false,
        typeId:Number(row?.typeId)||null,
        name:String(row?.name||''),
        amount:Number(row?.amount)||0,
        totalVolume:Number(row?.totalVolume)||0,
        buy:Number(row?.buy)||0,
        split:Number(row?.split)||0,
        sell:Number(row?.sell)||0,
        buyTotal:Number(row?.buyTotal)||0,
        splitTotal:Number(row?.splitTotal)||0,
        sellTotal:Number(row?.sellTotal)||0,
      })),
    };
  }
  function renderAppraisalIntel(){
    const host=document.getElementById('jlrAppraisalIntelBody');
    if(!host)return;
    if(appraisalIntelBusy){
      host.innerHTML='<div class="jlr-intel-loading"><span class="status-pill">● SUPPORT</span><strong>Building compression + market history…</strong><small>Cached results are reused across JLR users when available.</small></div>';
      return;
    }
    if(!appraisalIntel){
      host.innerHTML='<div class="visual-empty">Run an appraisal to load Support market intel.</div>';
      return;
    }
    if(appraisalIntel.available===false){
      host.innerHTML='<div class="visual-empty">Support market intel is temporarily unavailable. Core appraisal values are unaffected.</div>';
      return;
    }
    const compression=Array.isArray(appraisalIntel.compression)?appraisalIntel.compression:[];
    const history=Array.isArray(appraisalIntel.history)?appraisalIntel.history:[];
    const warnings=Array.isArray(appraisalIntel.warnings)?appraisalIntel.warnings.filter(Boolean):[];
    const cache=appraisalIntel.cache||{};
    const cacheText=cache.hit?'CACHE HIT':'FRESH SUPPORT DATA';

    const compressionRows=compression.length?compression.slice(0,30).map(row=>{
      const delta=signed(row.valueDelta);
      const volumeDrop=Number(row.volumeReductionPct);
      const direction=String(row.direction||'compress').toUpperCase();
      return '<tr>'+
        '<td><strong>'+esc(row.sourceName)+'</strong><small>'+direction+' → '+esc(row.targetName)+'</small></td>'+
        '<td>'+copyCell(row.sourceValue,shortIsk(row.sourceValue)+' ISK','source market value')+'</td>'+
        '<td>'+copyCell(row.targetValue,shortIsk(row.targetValue)+' ISK','alternate market value')+'</td>'+
        '<td class="'+(delta>=0?'jlr-intel-positive':'jlr-intel-negative')+'">'+(delta>=0?'+':'')+shortIsk(Math.abs(delta))+' ISK</td>'+
        '<td>'+(Number.isFinite(volumeDrop)?volumeDrop.toFixed(1)+'%':'—')+'</td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="5" class="jlr-intel-empty">No compressible/decompressible matches were resolved for this appraisal.</td></tr>';

    const historyRows=history.length?history.map(row=>{
      const trend=Number(row.trend7Pct);
      const trendClass=!Number.isFinite(trend)?'':trend>0?'jlr-intel-positive':trend<0?'jlr-intel-negative':'';
      return '<tr>'+
        '<td><strong>'+esc(row.name)+'</strong><small>'+esc(row.regionName||'Market history')+'</small></td>'+
        '<td>'+copyCell(row.avg7,shortIsk(row.avg7)+' ISK','7 day average')+'</td>'+
        '<td>'+copyCell(row.avg30,shortIsk(row.avg30)+' ISK','30 day average')+'</td>'+
        '<td class="'+trendClass+'">'+signedPct(row.trend7Pct)+'</td>'+
        '<td>'+Number(row.avgDailyVolume7||0).toLocaleString(undefined,{maximumFractionDigits:0})+'</td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="5" class="jlr-intel-empty">No market-history rows were available for this market.</td></tr>';

    host.innerHTML=
      '<div class="jlr-intel-meta"><span class="status-pill">● SUPPORT</span><strong>'+esc(cacheText)+'</strong><small>'+
        compression.length+' compression matches • '+history.length+' history rows</small></div>'+
      '<div class="jlr-intel-grid">'+
        '<article class="jlr-intel-card"><div class="jlr-intel-card-head"><div><span>COMPRESSION</span><strong>RAW ↔ COMPRESSED VALUE</strong></div><small>Selected '+esc(modeLabel(appraisalIntel.pricing))+' basis</small></div>'+
          '<div class="appraisal-table-wrap"><table class="appraisal-table jlr-intel-table"><thead><tr><th>ITEM</th><th>CURRENT</th><th>ALTERNATE</th><th>VALUE Δ</th><th>VOLUME ↓</th></tr></thead><tbody>'+compressionRows+'</tbody></table></div></article>'+
        '<article class="jlr-intel-card"><div class="jlr-intel-card-head"><div><span>MARKET HISTORY</span><strong>7D / 30D CONTEXT</strong></div><small>ESI history • cached by Support</small></div>'+
          '<div class="appraisal-table-wrap"><table class="appraisal-table jlr-intel-table"><thead><tr><th>ITEM</th><th>7D AVG</th><th>30D AVG</th><th>7D TREND</th><th>AVG DAILY VOL</th></tr></thead><tbody>'+historyRows+'</tbody></table></div></article>'+
      '</div>'+
      (warnings.length?'<div class="jlr-intel-warnings">'+warnings.map(row=>'<small>• '+esc(row)+'</small>').join('')+'</div>':'');
  }
  async function loadAppraisalIntel(snapshot){
    const seq=++appraisalIntelSeq;
    appraisalIntelBusy=true;
    renderAppraisalIntel();
    try{
      const response=await originalFetch('/api/appraisal/intel',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({appraisal:intelPayload(snapshot)}),
      });
      const payload=await response.json().catch(()=>null);
      if(seq!==appraisalIntelSeq)return;
      appraisalIntel=response.ok&&payload?payload:{available:false,error:String(payload?.message||payload?.error||'Support intel unavailable')};
    }catch(error){
      if(seq!==appraisalIntelSeq)return;
      appraisalIntel={available:false,error:String(error?.message||error)};
    }finally{
      if(seq===appraisalIntelSeq){
        appraisalIntelBusy=false;
        renderAppraisalIntel();
      }
    }
  }

  async function copySummary(){
    if(!appraisal)return false;
    const summary=appraisal.summary||{};
    const payout=selectedSummary(summary)*(payoutPct/100);
    const title=((document.getElementById('appraisalTitle')||{}).value||'JLR Appraisal').trim()||'JLR Appraisal';
    const lines=[
      title,
      (appraisal.market&&appraisal.market.name||'Jita 4-4')+' • '+variantLabel(appraisal.pricingVariant),
      'Basis: '+modeLabel(appraisal.pricing)+' • Payout: '+payoutPct.toFixed(1).replace(/\.0$/,'')+'%',
      'Jita Buy: '+exactPretty(summary.buy)+' ISK',
      'Split: '+exactPretty(summary.split)+' ISK',
      'Jita Sell: '+exactPretty(summary.sell)+' ISK',
      'Payout: '+exactPretty(payout)+' ISK',
      'Volume: '+exactPretty(summary.volume)+' m³',
      'Item Types: '+Number(summary.resolvedLines||0).toLocaleString()
    ];
    return copyText(lines.join('\n'));
  }

  async function copyTable(){
    if(!appraisal)return false;
    const rows=Array.isArray(appraisal.items)?appraisal.items.filter(row=>row.resolved!==false):[];
    if(!rows.length)return false;
    const factor=payoutPct/100;
    const lines=[['Item','Qty','Buy / ea','Split / ea','Sell / ea','Buy total','Split total','Sell total','Payout total'].join('\t')];
    for(const row of rows){
      lines.push([
        row.name,
        exact(row.amount),
        exact(row.buy),
        exact(row.split),
        exact(row.sell),
        exact(row.buyTotal),
        exact(row.splitTotal),
        exact(row.sellTotal),
        exact(selectedTotal(row)*factor)
      ].join('\t'));
    }
    return copyText(lines.join('\n'));
  }

  function renderEnhanced(force=false){
    if(!ensureUi())return;
    syncControls();
    if(!appraisal)return;
    renderSummary(force);
    renderItems(force);
    enhanceRefine();
    renderAppraisalIntel();
  }

  const observer=new MutationObserver(()=>{
    clearTimeout(observerTimer);
    observerTimer=setTimeout(()=>renderEnhanced(false),0);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>renderEnhanced(false),{once:true});
  setTimeout(()=>renderEnhanced(false),0);
})();