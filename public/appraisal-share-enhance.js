(()=>{
  'use strict';
  const root=document.getElementById('root');
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const num=v=>Math.max(0,Number(v)||0);
  const esc=v=>String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const exact=v=>num(v).toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');
  const exactPretty=v=>num(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  const isk=v=>{
    const n=num(v);
    if(n>=1e12)return(n/1e12).toFixed(2)+'T';
    if(n>=1e9)return(n/1e9).toFixed(2)+'B';
    if(n>=1e6)return(n/1e6).toFixed(2)+'M';
    if(n>=1e3)return(n/1e3).toFixed(1)+'K';
    return Math.round(n).toLocaleString();
  };
  const vol=v=>{
    const n=num(v);
    if(n>=1e9)return(n/1e9).toFixed(2)+'B m³';
    if(n>=1e6)return(n/1e6).toFixed(2)+'M m³';
    if(n>=1e3)return(n/1e3).toFixed(1)+'K m³';
    return n.toLocaleString(undefined,{maximumFractionDigits:2})+' m³';
  };
  const pct=clamp(Number(new URLSearchParams(location.search).get('p'))||100,0,200);
  const ageText=ms=>{
    const value=Math.max(0,Number(ms)||0);
    if(value<60_000)return Math.max(1,Math.round(value/1000))+'s';
    if(value<60*60_000)return Math.round(value/60_000)+'m';
    if(value<24*60*60_000)return (value/(60*60_000)).toFixed(value<10*60*60_000?1:0)+'h';
    return (value/(24*60*60_000)).toFixed(1)+'d';
  };
  let share=null;

  async function copyText(text){
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText){
        await navigator.clipboard.writeText(String(text));
        return true;
      }
    }catch{}
    const helper=document.createElement('textarea');
    helper.value=String(text);
    helper.style.position='fixed';
    helper.style.opacity='0';
    document.body.appendChild(helper);
    helper.select();
    let ok=false;
    try{ok=document.execCommand('copy')}catch{}
    helper.remove();
    return ok;
  }
  const copyButton=(raw,display,label,klass='')=>
    '<button type="button" class="share-copy-value '+klass+'" data-share-copy="'+esc(exact(raw))+'" title="Copy exact '+esc(label)+'">'+display+'</button>';

  function selectedSummary(appraisal,summary){
    if(appraisal.pricing==='buy')return num(summary.buy);
    if(appraisal.pricing==='sell')return num(summary.sell);
    return num(summary.split);
  }
  function selectedRow(appraisal,row){
    if(appraisal.pricing==='buy')return num(row.buyTotal);
    if(appraisal.pricing==='sell')return num(row.sellTotal);
    return num(row.splitTotal);
  }

  async function fetchShare(){
    const token=location.pathname.split('/').filter(Boolean).pop()||'';
    const response=await fetch('/api/appraisal/share/'+encodeURIComponent(token),{headers:{Accept:'application/json'},cache:'no-store'});
    const payload=await response.json();
    if(!response.ok)throw new Error(payload&&payload.message||payload&&payload.error||'Appraisal unavailable');
    share=payload.share||{};
  }

  function enhance(){
    if(!share||!root||!root.querySelector('.table'))return false;
    const appraisal=share.appraisal||{};
    const summary=appraisal.summary||{};
    const rows=Array.isArray(appraisal.items)?appraisal.items:[];
    const marketName=appraisal.market&&appraisal.market.name||'Market';
    const factor=pct/100;
    const payout=selectedSummary(appraisal,summary)*factor;

    const hero=root.querySelector('.share-hero');
    if(hero&&!root.querySelector('.share-copy-actions')){
      hero.insertAdjacentHTML('beforeend',
        '<div class="share-copy-actions">'+
          '<div class="share-payout-badge"><span>PAYOUT</span><strong>'+esc(pct.toFixed(1).replace(/\.0$/,''))+'%</strong></div>'+
          '<div class="share-payout-badge"><span>MARKET DATA</span><strong>'+esc(ageText(appraisal.marketData?.maxAgeMs||0))+'</strong></div>'+
          '<button type="button" data-share-action="summary">COPY SUMMARY</button>'+
          '<button type="button" data-share-action="table">COPY TABLE</button>'+
        '</div>');
    }

    const kpis=root.querySelector('.kpis');
    if(kpis){
      kpis.innerHTML=
        '<article class="kpi share-payout-kpi"><span>PAYOUT TOTAL</span>'+copyButton(payout,isk(payout)+' ISK','payout total','share-kpi-copy')+'</article>'+
        '<article class="kpi"><span>'+esc(String(marketName).toUpperCase())+' BUY</span>'+copyButton(summary.buy,isk(summary.buy)+' ISK','market buy','share-kpi-copy')+'</article>'+
        '<article class="kpi"><span>SPLIT</span>'+copyButton(summary.split,isk(summary.split)+' ISK','split','share-kpi-copy')+'</article>'+
        '<article class="kpi"><span>'+esc(String(marketName).toUpperCase())+' SELL</span>'+copyButton(summary.sell,isk(summary.sell)+' ISK','market sell','share-kpi-copy')+'</article>'+
        '<article class="kpi"><span>VOLUME</span>'+copyButton(summary.volume,vol(summary.volume),'volume','share-kpi-copy')+'</article>'+
        '<article class="kpi"><span>ITEM TYPES</span>'+copyButton(summary.resolvedLines,Number(summary.resolvedLines||0).toLocaleString(),'item types','share-kpi-copy')+'</article>'+
        '<article class="kpi"><span>TOTAL UNITS</span>'+copyButton(summary.units,Number(summary.units||0).toLocaleString(),'total units','share-kpi-copy')+'</article>';
    }

    const table=root.querySelector('.table');
    if(table){
      table.querySelector('thead').innerHTML='<tr><th>ITEM</th><th>QTY</th><th>VOLUME</th><th>BUY / EA</th><th>SPLIT / EA</th><th>SELL / EA</th><th>BUY TOTAL</th><th>SPLIT TOTAL</th><th>SELL TOTAL</th><th>PAYOUT TOTAL</th></tr>';
      table.querySelector('tbody').innerHTML=rows.length?rows.map(row=>{
        if(row.resolved===false){
          return '<tr class="unresolved"><td class="item bad"><div class="item-name"><span class="item-icon placeholder">?</span><span><strong>'+esc(row.name)+'</strong><small>UNRESOLVED ITEM</small></span></div></td><td colspan="9">—</td></tr>';
        }
        const payoutRow=selectedRow(appraisal,row)*factor;
        return '<tr>'+
          '<td class="item"><div class="item-name"><img class="item-icon" src="https://images.evetech.net/types/'+Number(row.typeId||0)+'/icon?size=32" alt="" loading="lazy"><span><strong>'+esc(row.name)+'</strong><small>TYPE '+Number(row.typeId||0)+'</small></span></div></td>'+
          '<td class="num qty">'+copyButton(row.amount,Number(row.amount||0).toLocaleString(),'quantity')+'</td>'+
          '<td class="num">'+copyButton(row.totalVolume,vol(row.totalVolume),'volume')+'</td>'+
          '<td class="num buy">'+copyButton(row.buy,isk(row.buy),'buy per item')+'</td>'+
          '<td class="num split">'+copyButton(row.split,isk(row.split),'split per item')+'</td>'+
          '<td class="num sell">'+copyButton(row.sell,isk(row.sell),'sell per item')+'</td>'+
          '<td class="num total buy">'+copyButton(row.buyTotal,isk(row.buyTotal),'buy total')+'</td>'+
          '<td class="num total split">'+copyButton(row.splitTotal,isk(row.splitTotal),'split total')+'</td>'+
          '<td class="num total sell">'+copyButton(row.sellTotal,isk(row.sellTotal),'sell total')+'</td>'+
          '<td class="num total share-payout-cell">'+copyButton(payoutRow,isk(payoutRow),'payout total','share-payout-copy')+'</td>'+
        '</tr>';
      }).join(''):'<tr><td colspan="10" class="empty-row">No appraisal rows.</td></tr>';
    }

    const refine=appraisal.refine;
    if(refine){
      const rate=clamp(num(refine.selectedRate??refine.defaultRate),0,1);
      const values=[num(refine.buyAt100)*rate,num(refine.eligibleBuy),num(refine.buyAt100)*rate-num(refine.eligibleBuy),num(refine.recognizedLines)];
      root.querySelectorAll('.refine-grid .refine-card strong').forEach((node,index)=>{
        if(index>=values.length)return;
        node.dataset.shareCopy=exact(values[index]);
        node.classList.add('share-copy-inline');
        node.title='Click to copy exact value';
      });
      const minerals=Array.isArray(refine.minerals)?refine.minerals:[];
      root.querySelectorAll('.refine-mineral').forEach((node,index)=>{
        const row=minerals[index];
        if(!row)return;
        const q=node.querySelector('strong');
        const v=node.querySelector('small');
        if(q){q.dataset.shareCopy=exact(num(row.quantityAt100)*rate);q.classList.add('share-copy-inline')}
        if(v){v.dataset.shareCopy=exact(num(row.valueAt100)*rate);v.classList.add('share-copy-inline')}
      });
    }
    return true;
  }

  async function copySummary(){
    if(!share)return false;
    const appraisal=share.appraisal||{},summary=appraisal.summary||{};
    const payout=selectedSummary(appraisal,summary)*(pct/100);
    const lines=[
      share.title||'JLR Appraisal',
      (appraisal.market&&appraisal.market.name||'Jita 4-4')+' • '+String(appraisal.pricingVariant||'immediate').toUpperCase(),
      'Payout: '+pct.toFixed(1).replace(/\.0$/,'')+'%',
      (appraisal.market&&appraisal.market.name||'Market')+' Buy: '+exactPretty(summary.buy)+' ISK',
      'Split: '+exactPretty(summary.split)+' ISK',
      (appraisal.market&&appraisal.market.name||'Market')+' Sell: '+exactPretty(summary.sell)+' ISK',
      'Payout Total: '+exactPretty(payout)+' ISK',
      'Volume: '+exactPretty(summary.volume)+' m³',
      location.href
    ];
    return copyText(lines.join('\n'));
  }

  async function copyTable(){
    if(!share)return false;
    const appraisal=share.appraisal||{};
    const rows=(Array.isArray(appraisal.items)?appraisal.items:[]).filter(row=>row.resolved!==false);
    if(!rows.length)return false;
    const factor=pct/100;
    const lines=[['Item','Qty','Buy / ea','Split / ea','Sell / ea','Buy total','Split total','Sell total','Payout total'].join('\t')];
    rows.forEach(row=>lines.push([
      row.name,exact(row.amount),exact(row.buy),exact(row.split),exact(row.sell),
      exact(row.buyTotal),exact(row.splitTotal),exact(row.sellTotal),exact(selectedRow(appraisal,row)*factor)
    ].join('\t')));
    return copyText(lines.join('\n'));
  }

  document.addEventListener('click',async event=>{
    const copy=event.target.closest('[data-share-copy]');
    if(copy){
      const ok=await copyText(copy.dataset.shareCopy||'');
      if(ok){copy.classList.add('copied');setTimeout(()=>copy.classList.remove('copied'),850)}
      return;
    }
    const action=event.target.closest('[data-share-action]');
    if(!action)return;
    if(action.dataset.shareAction==='summary')await copySummary();
    if(action.dataset.shareAction==='table')await copyTable();
  });

  (async()=>{
    try{
      await fetchShare();
      for(let attempt=0;attempt<80;attempt++){
        if(enhance())return;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
    }catch(error){
      console.warn('JLR appraisal share enhancement unavailable',error);
    }
  })();
})();