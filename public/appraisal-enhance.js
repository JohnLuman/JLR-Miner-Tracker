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
  const modeLabel=value=>{
    const key=String(value||'split');
    if(key==='buy')return'BUY';
    if(key==='sell')return'SELL';
    if(key==='refine-buy')return'REFINE BUY';
    if(key==='refine-sell')return'REFINE SELL';
    return'SPLIT';
  };
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
  function refineRate(){
    const refine=appraisal&&appraisal.refine||{};
    const input=document.getElementById('appraisalRefineRate');
    const pct=clamp(Number(input&&input.value)||num(refine.selectedRate??refine.defaultRate)*100,0,100);
    return pct/100;
  }
  function selectedSummary(summary){
    const mode=String(appraisal&&appraisal.pricing||'split');
    if(mode==='buy')return num(summary&&summary.buy);
    if(mode==='sell')return num(summary&&summary.sell);
    if(mode==='refine-buy')return num(appraisal?.refine?.buyAt100)*refineRate();
    if(mode==='refine-sell')return num(appraisal?.refine?.sellAt100)*refineRate();
    return num(summary&&summary.split);
  }
  function selectedTotal(row){
    const mode=String(appraisal&&appraisal.pricing||'split');
    if(mode==='buy')return num(row&&row.buyTotal);
    if(mode==='sell')return num(row&&row.sellTotal);
    if(mode==='refine-buy'||mode==='refine-sell'){
      const refineRows=Array.isArray(appraisal?.refine?.items)?appraisal.refine.items:[];
      const match=refineRows.find(item=>
        (Number(item?.typeId)>0&&Number(item.typeId)===Number(row?.typeId))||
        String(item?.name||'').toLowerCase()===String(row?.name||'').toLowerCase()
      );
      if(!match)return 0;
      return num(mode==='refine-sell'?match.sellValueAt100:match.valueAt100)*refineRate();
    }
    return num(row&&row.splitTotal);
  }
  function copyStrong(raw,display,label,klass=''){
    return '<strong><button type="button" class="jlr-appraisal-copy-value '+klass+'" data-jlr-copy="'+esc(exact(raw))+'" title="Copy exact '+esc(label)+'">'+display+'</button></strong>';
  }
  function copyCell(raw,display,label,klass=''){
    return '<button type="button" class="jlr-appraisal-copy-value '+klass+'" data-jlr-copy="'+esc(exact(raw))+'" title="Copy exact '+esc(label)+'">'+display+'</button>';
  }

  function closeJlrSelects(except=null){
    document.querySelectorAll('.jlr-appraisal-select.open').forEach(node=>{
      if(node!==except)node.classList.remove('open');
    });
  }
  function enhanceSelect(id){
    const select=document.getElementById(id);
    if(!select)return;
    select.classList.add('jlr-select-native');
    let shell=select.nextElementSibling;
    if(!shell||!shell.classList.contains('jlr-appraisal-select')){
      shell=document.createElement('div');
      shell.className='jlr-appraisal-select';
      shell.innerHTML='<button type="button" class="jlr-appraisal-select-trigger" aria-haspopup="listbox" aria-expanded="false"></button><div class="jlr-appraisal-select-menu" role="listbox"></div>';
      select.insertAdjacentElement('afterend',shell);
      const trigger=shell.querySelector('.jlr-appraisal-select-trigger');
      trigger.addEventListener('click',event=>{
        event.preventDefault();
        const opening=!shell.classList.contains('open');
        closeJlrSelects(shell);
        shell.classList.toggle('open',opening);
        trigger.setAttribute('aria-expanded',opening?'true':'false');
      });
      shell.querySelector('.jlr-appraisal-select-menu').addEventListener('click',event=>{
        const option=event.target.closest('[data-jlr-select-value]');
        if(!option)return;
        select.value=option.dataset.jlrSelectValue||'';
        select.dispatchEvent(new Event('change',{bubbles:true}));
        shell.classList.remove('open');
        trigger.setAttribute('aria-expanded','false');
        enhanceSelect(id);
      });
    }
    const signature=Array.from(select.options).map(option=>option.value+'='+option.textContent).join('|');
    if(shell.dataset.signature!==signature){
      shell.dataset.signature=signature;
      const menu=shell.querySelector('.jlr-appraisal-select-menu');
      menu.innerHTML=Array.from(select.options).map(option=>
        '<button type="button" role="option" data-jlr-select-value="'+esc(option.value)+'">'+esc(option.textContent||option.value)+'</button>'
      ).join('');
    }
    const selected=select.options[select.selectedIndex]||select.options[0];
    const trigger=shell.querySelector('.jlr-appraisal-select-trigger');
    trigger.textContent=selected?selected.textContent:'SELECT';
    shell.querySelectorAll('[data-jlr-select-value]').forEach(option=>{
      const active=option.dataset.jlrSelectValue===select.value;
      option.classList.toggle('active',active);
      option.setAttribute('aria-selected',active?'true':'false');
    });
  }
  if(!document.documentElement.dataset.jlrSelectCloseBound){
    document.documentElement.dataset.jlrSelectCloseBound='1';
    document.addEventListener('click',event=>{
      if(!event.target.closest('.jlr-appraisal-select'))closeJlrSelects();
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape')closeJlrSelects();
    });
  }

  function ensureUi(){
    const panel=document.querySelector('#appraisalPanel .appraisal-panel');
    if(!panel)return null;
    enhanceSelect('appraisalMarket');
    enhanceSelect('appraisalPricing');
    enhanceSelect('appraisalVariant');
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
    if(!document.getElementById('jlrAppraisalFreshness')){
      const payoutBar=document.getElementById('jlrAppraisalPayoutBar');
      if(payoutBar){
        const freshness=document.createElement('div');
        freshness.id='jlrAppraisalFreshness';
        freshness.className='jlr-appraisal-freshness';
        freshness.innerHTML='<span class="status-pill">● JLR NATIVE</span><strong>MARKET DATA READY</strong><small>Run an appraisal to load CCP ESI market data.</small>';
        payoutBar.insertAdjacentElement('afterend',freshness);
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
    const actions=panel.querySelector('.appraisal-actions');
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
        if(event.target&&event.target.id==='appraisalRefineRate'){
          renderAppraisalIntel();
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

  function ageText(ms){
    const value=Math.max(0,Number(ms)||0);
    if(value<60_000)return Math.max(1,Math.round(value/1000))+'s';
    if(value<60*60_000)return Math.round(value/60_000)+'m';
    if(value<24*60*60_000)return (value/(60*60_000)).toFixed(value<10*60*60_000?1:0)+'h';
    return (value/(24*60*60_000)).toFixed(1)+'d';
  }
  function itemMarketAge(row){
    const parsed=Date.parse(String(row?.marketDataAt||''));
    return Number.isFinite(parsed)?Math.max(0,Date.now()-parsed):Math.max(0,Number(row?.marketDataAgeMs)||0);
  }
  function marketSourceLabel(source){
    const key=String(source||'');
    if(key==='esi-live')return'CCP ESI LIVE';
    if(key==='support-cache')return'JLR SHARED CACHE';
    if(key==='local-order-cache')return'JLR LOCAL CACHE';
    if(key==='support-stale')return'JLR STALE FALLBACK';
    return key?key.toUpperCase().replaceAll('-',' '):'JLR NATIVE';
  }
  function renderMarketFreshness(){
    const host=document.getElementById('jlrAppraisalFreshness');
    if(!host)return;
    if(!appraisal){
      host.classList.remove('jlr-stale');
      host.innerHTML='<span class="status-pill">● JLR NATIVE</span><strong>MARKET DATA READY</strong><small>Run an appraisal to load CCP ESI market data.</small>';
      return;
    }
    const rows=(Array.isArray(appraisal.items)?appraisal.items:[]).filter(row=>row?.resolved!==false&&row?.marketDataAt);
    const stale=rows.filter(row=>row.marketDataStale);
    const ages=rows.map(itemMarketAge);
    const maxAge=ages.length?Math.max(...ages):num(appraisal.marketData?.maxAgeMs);
    const sources=[...new Set(rows.map(row=>marketSourceLabel(row.marketDataSource)).filter(Boolean))];
    const staticData=appraisal.staticData&&typeof appraisal.staticData==='object'?appraisal.staticData:{};
    const staticLabel=Number(staticData.buildNumber)>0
      ?'CCP SDE '+Number(staticData.buildNumber).toLocaleString()
      :(staticData.provider==='ccp-esi'?'ESI STATIC FALLBACK':'STATIC CATALOG WARMING');
    host.classList.toggle('jlr-stale',stale.length>0);
    host.innerHTML=
      '<span class="status-pill">'+(stale.length?'● STALE FALLBACK':'● JLR NATIVE')+'</span>'+
      '<strong>'+esc(appraisal.market?.name||'MARKET')+' • '+esc(variantLabel(appraisal.pricingVariant))+'</strong>'+
      '<small>'+esc(staticLabel)+' • '+esc(sources.join(' + ')||'CCP ESI')+' • oldest price '+esc(ageText(maxAge))+' ago • '+stale.length+' stale / '+rows.length+' priced</small>';
  }

  function renderSummary(force){
    const host=document.getElementById('appraisalSummary');
    if(!host||!appraisal)return;
    const summary=appraisal.summary||{};
    const marketLabel=String(appraisal.market?.name||'MARKET').toUpperCase();
    const factor=payoutPct/100;
    const payout=selectedSummary(summary)*factor;
    const signature=[appraisal.generatedAt||'',appraisal.pricing||'',payoutPct,summary.buy,summary.split,summary.sell].join('|');
    if(!force&&host.dataset.jlrEnhanceSig===signature&&host.querySelector('[data-jlr-copy]'))return;
    host.dataset.jlrEnhanceSig=signature;
    host.innerHTML=
      '<article class="appraisal-primary jlr-appraisal-payout-card"><span>'+esc(modeLabel(appraisal.pricing))+' PAYOUT @ '+esc(payoutPct.toFixed(1).replace(/\.0$/,''))+'%</span>'+
        copyStrong(payout,shortIsk(payout)+' ISK','payout','jlr-summary-copy')+'<small>Click any value to copy exact number</small></article>'+
      '<article><span>'+esc(marketLabel)+' BUY</span>'+copyStrong(summary.buy,shortIsk(summary.buy)+' ISK','market buy','jlr-summary-copy')+'</article>'+
      '<article><span>SPLIT</span>'+copyStrong(summary.split,shortIsk(summary.split)+' ISK','split','jlr-summary-copy')+'</article>'+
      '<article><span>'+esc(marketLabel)+' SELL</span>'+copyStrong(summary.sell,shortIsk(summary.sell)+' ISK','market sell','jlr-summary-copy')+'</article>'+
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
      const dataAge=row.marketDataAt?ageText(itemMarketAge(row)):'—';
      const dataSource=marketSourceLabel(row.marketDataSource);
      return '<tr><td><strong>'+esc(row.name)+'</strong><small>'+Number(row.buyOrderCount||0).toLocaleString()+' buy orders • '+Number(row.sellOrderCount||0).toLocaleString()+' sell orders • '+esc(dataSource)+' '+esc(dataAge)+(row.marketDataStale?' STALE':'')+'</small></td>'+
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
    const cards=[
      num(refine.buyAt100)*factor,
      num(refine.sellAt100)*factor,
      num(refine.eligibleBuy),
      num(refine.buyAt100)*factor-num(refine.eligibleBuy),
      num(refine.recognizedLines)
    ];
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
      marketData:source.marketData||null,
      refine:source.refine?{
        selectedRate:Number(source.refine.selectedRate??source.refine.defaultRate)||0,
        defaultRate:Number(source.refine.defaultRate)||0,
        recognizedLines:Number(source.refine.recognizedLines)||0,
        recognizedUnits:Number(source.refine.recognizedUnits)||0,
        buyAt100:Number(source.refine.buyAt100)||0,
        sellAt100:Number(source.refine.sellAt100)||0,
        eligibleBuy:Number(source.refine.eligibleBuy)||0,
        eligibleSplit:Number(source.refine.eligibleSplit)||0,
        eligibleSell:Number(source.refine.eligibleSell)||0,
        pricingBasis:source.refine.pricingBasis||'',
        items:(Array.isArray(source.refine.items)?source.refine.items:[]).slice(0,120),
      }:null,
      items:(Array.isArray(source.items)?source.items:[]).slice(0,120).map(row=>({
        resolved:row?.resolved!==false,
        typeId:Number(row?.typeId)||null,
        name:String(row?.name||''),
        amount:Number(row?.amount)||0,
        totalVolume:Number(row?.totalVolume)||0,
        buyOrderCount:Number(row?.buyOrderCount)||0,
        buyVolume:Number(row?.buyVolume)||0,
        sellOrderCount:Number(row?.sellOrderCount)||0,
        sellVolume:Number(row?.sellVolume)||0,
        buy:Number(row?.buy)||0,
        split:Number(row?.split)||0,
        sell:Number(row?.sell)||0,
        buyTotal:Number(row?.buyTotal)||0,
        splitTotal:Number(row?.splitTotal)||0,
        sellTotal:Number(row?.sellTotal)||0,
        marketDataAt:row?.marketDataAt||null,
        marketDataAgeMs:Number(row?.marketDataAgeMs)||0,
        marketDataStale:Boolean(row?.marketDataStale),
        marketDataSource:row?.marketDataSource||'',
      })),
    };
  }
  function decisionAtCurrentRate(){
    const source=appraisalIntel?.decision;
    const rows=Array.isArray(source?.rows)?source.rows:[];
    if(!source||!rows.length)return null;
    const input=document.getElementById('appraisalRefineRate');
    const defaultPct=num(source.refineRate)*100;
    const pct=clamp(Number(input&&input.value)||defaultPct,0,100);
    const rate=pct/100;
    let rawValue=0,compressedValue=0,refinedValue=0;
    let rawCovered=0,compressedCovered=0;
    const recalculated=rows.map(row=>{
      const raw=Number(row.rawValue);
      const compressed=Number(row.compressedValue);
      const refined=num(row.refineValueAt100)*rate;
      if(Number.isFinite(raw)){rawValue+=Math.max(0,raw);rawCovered++}
      if(Number.isFinite(compressed)){compressedValue+=Math.max(0,compressed);compressedCovered++}
      refinedValue+=refined;
      const options=[
        Number.isFinite(raw)?{key:'raw',label:'RAW',value:Math.max(0,raw)}:null,
        Number.isFinite(compressed)?{key:'compressed',label:'COMPRESSED',value:Math.max(0,compressed)}:null,
        {key:'refine',label:'REFINE',value:refined},
      ].filter(Boolean).sort((a,b)=>b.value-a.value);
      return{...row,refinedValue:refined,winner:options[0]?.key||null,winnerLabel:options[0]?.label||null,advantageValue:options.length>1?Math.max(0,options[0].value-options[1].value):0};
    });
    const options=[
      rawCovered===rows.length?{key:'raw',label:'RAW',value:rawValue}:null,
      compressedCovered===rows.length?{key:'compressed',label:'COMPRESSED',value:compressedValue}:null,
      {key:'refine',label:'REFINE',value:refinedValue},
    ].filter(Boolean).sort((a,b)=>b.value-a.value);
    return{
      ...source,
      refineRate:rate,
      rawValue:rawCovered===rows.length?rawValue:null,
      compressedValue:compressedCovered===rows.length?compressedValue:null,
      refinedValue,
      winner:options[0]?.key||null,
      winnerLabel:options[0]?.label||null,
      winnerValue:options[0]?.value||0,
      advantageValue:options.length>1?Math.max(0,options[0].value-options[1].value):0,
      rows:recalculated,
      fullCompressionCoverage:compressedCovered===rows.length,
    };
  }

  function renderAppraisalIntel(){
    const host=document.getElementById('jlrAppraisalIntelBody');
    if(!host)return;
    if(appraisalIntelBusy){
      host.innerHTML='<div class="jlr-intel-loading"><span class="status-pill">● SUPPORT</span><strong>Building decision + liquidity intel…</strong><small>Shared price snapshots and history are reused across JLR users.</small></div>';
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
    const decision=decisionAtCurrentRate();

    let decisionHtml='';
    if(decision){
      const optionCards=[
        {key:'raw',label:'RAW SALE',value:decision.rawValue},
        {key:'compressed',label:'COMPRESSED SALE',value:decision.compressedValue},
        {key:'refine',label:'REFINED MINERALS',value:decision.refinedValue},
      ].filter(row=>Number.isFinite(Number(row.value)));
      const cards=optionCards.map(row=>
        '<article class="jlr-decision-option '+(decision.winner===row.key?'winner':'')+'"><span>'+esc(row.label)+'</span>'+
        copyStrong(row.value,shortIsk(row.value)+' ISK',row.label.toLowerCase(),'jlr-decision-copy')+
        (decision.winner===row.key?'<small>HIGHEST VALUE</small>':'')+'</article>'
      ).join('');
      const decisionRows=decision.rows.slice(0,30).map(row=>
        '<tr><td><strong>'+esc(row.name)+'</strong><small>'+Number(row.amount||0).toLocaleString()+' units</small></td>'+
        '<td>'+(Number.isFinite(Number(row.rawValue))?copyCell(row.rawValue,shortIsk(row.rawValue)+' ISK','raw value'):'—')+'</td>'+
        '<td>'+(Number.isFinite(Number(row.compressedValue))?copyCell(row.compressedValue,shortIsk(row.compressedValue)+' ISK','compressed value'):'—')+'</td>'+
        '<td>'+copyCell(row.refinedValue,shortIsk(row.refinedValue)+' ISK','refined value')+'</td>'+
        '<td class="jlr-decision-winner">'+esc(row.winnerLabel||'—')+(num(row.advantageValue)>0?'<small> +'+shortIsk(row.advantageValue)+'</small>':'')+'</td></tr>'
      ).join('');
      decisionHtml=
        '<article class="jlr-intel-card jlr-decision-card"><div class="jlr-intel-card-head"><div><span>DECISION ENGINE</span><strong>RAW vs COMPRESSED vs REFINE</strong></div>'+
        '<small>'+esc((decision.refineRate*100).toFixed(2).replace(/0+$/,'').replace(/\.$/,''))+'% refine • '+esc(modeLabel(appraisalIntel.pricing))+' market basis • '+esc(appraisal?.refine?.recipeSource==='ccp-sde'?'CCP SDE recipes':'fallback recipes')+'</small></div>'+
        '<div class="jlr-decision-options">'+cards+'</div>'+
        '<div class="jlr-decision-banner"><span>WINNER</span><strong>'+esc(decision.winnerLabel||'—')+'</strong>'+
        '<small>'+copyCell(decision.winnerValue,shortIsk(decision.winnerValue)+' ISK','winning value')+
        (num(decision.advantageValue)>0?' • +'+shortIsk(decision.advantageValue)+' vs next option':'')+
        (!decision.fullCompressionCoverage?' • compression coverage partial':'')+'</small></div>'+
        '<div class="appraisal-table-wrap"><table class="appraisal-table jlr-intel-table jlr-decision-table"><thead><tr><th>ORE</th><th>RAW</th><th>COMPRESSED</th><th>REFINE</th><th>WINNER</th></tr></thead><tbody>'+decisionRows+'</tbody></table></div></article>';
    }

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
      const spread=Number(row.spreadPct);
      const buyDays=Number(row.buyBookDays),sellDays=Number(row.sellBookDays);
      return '<tr>'+
        '<td><strong>'+esc(row.name)+'</strong><small>'+esc(row.regionName||'Market history')+' • '+Number(row.buyOrderCount||0)+' buy / '+Number(row.sellOrderCount||0)+' sell orders</small></td>'+
        '<td>'+copyCell(row.avg7,shortIsk(row.avg7)+' ISK','7 day average')+'</td>'+
        '<td>'+copyCell(row.avg30,shortIsk(row.avg30)+' ISK','30 day average')+'</td>'+
        '<td class="'+trendClass+'">'+signedPct(row.trend7Pct)+'</td>'+
        '<td>'+Number(row.avgDailyVolume7||0).toLocaleString(undefined,{maximumFractionDigits:0})+'</td>'+
        '<td>'+(Number.isFinite(spread)?spread.toFixed(2)+'%':'—')+'</td>'+
        '<td>'+(Number.isFinite(buyDays)?buyDays.toFixed(buyDays<10?1:0)+'d':'—')+' / '+(Number.isFinite(sellDays)?sellDays.toFixed(sellDays<10?1:0)+'d':'—')+'</td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="7" class="jlr-intel-empty">No market-history rows were available for this market.</td></tr>';

    const marketData=appraisal?.marketData||appraisalIntel.marketData||{};
    const maxAge=num(marketData.maxAgeMs);
    const staleCount=num(marketData.staleCount);
    host.innerHTML=
      '<div class="jlr-intel-meta '+(staleCount?'jlr-stale':'')+'"><span class="status-pill">● SUPPORT</span><strong>'+esc(cacheText)+'</strong><small>'+
        compression.length+' compression matches • '+history.length+' history rows • prices '+esc(ageText(maxAge))+' old'+(staleCount?' • '+staleCount+' stale fallback':'')+'</small></div>'+
      '<div class="jlr-intel-grid">'+
        decisionHtml+
        '<article class="jlr-intel-card"><div class="jlr-intel-card-head"><div><span>COMPRESSION</span><strong>RAW ↔ COMPRESSED VALUE</strong></div><small>Selected '+esc(modeLabel(appraisalIntel.pricing))+' basis</small></div>'+
          '<div class="appraisal-table-wrap"><table class="appraisal-table jlr-intel-table"><thead><tr><th>ITEM</th><th>CURRENT</th><th>ALTERNATE</th><th>VALUE Δ</th><th>VOLUME ↓</th></tr></thead><tbody>'+compressionRows+'</tbody></table></div></article>'+
        '<article class="jlr-intel-card"><div class="jlr-intel-card-head"><div><span>LIQUIDITY + HISTORY</span><strong>PRICE TREND & BOOK DEPTH</strong></div><small>CCP ESI history • cached by Support</small></div>'+
          '<div class="appraisal-table-wrap"><table class="appraisal-table jlr-intel-table jlr-liquidity-table"><thead><tr><th>ITEM</th><th>7D AVG</th><th>30D AVG</th><th>7D TREND</th><th>AVG DAILY VOL</th><th>SPREAD</th><th>BOOK DAYS B/S</th></tr></thead><tbody>'+historyRows+'</tbody></table></div></article>'+
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
      (appraisal.market&&appraisal.market.name||'Market')+' Buy: '+exactPretty(summary.buy)+' ISK',
      'Split: '+exactPretty(summary.split)+' ISK',
      (appraisal.market&&appraisal.market.name||'Market')+' Sell: '+exactPretty(summary.sell)+' ISK',
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
    renderMarketFreshness();
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
