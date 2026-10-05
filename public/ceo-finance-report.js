(() => {
  'use strict';

  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=value=>{
    const n=Number(value);
    if(!Number.isFinite(n))return '—';
    const sign=n<0?'−':'';
    return sign+Math.round(Math.abs(n)).toLocaleString()+' ISK';
  };
  const shortMoney=value=>{
    const n=Math.abs(Number(value)||0);
    const sign=Number(value)<0?'−':'';
    if(n>=1e12)return sign+(n/1e12).toFixed(2)+'T ISK';
    if(n>=1e9)return sign+(n/1e9).toFixed(2)+'B ISK';
    if(n>=1e6)return sign+(n/1e6).toFixed(2)+'M ISK';
    if(n>=1e3)return sign+(n/1e3).toFixed(1)+'K ISK';
    return sign+Math.round(n).toLocaleString()+' ISK';
  };
  const monthLabel=value=>{
    if(!/^\d{4}-\d{2}$/.test(String(value||'')))return String(value||'No month');
    const [year,month]=String(value).split('-').map(Number);
    return new Date(Date.UTC(year,month-1,1)).toLocaleDateString(undefined,{month:'long',year:'numeric',timeZone:'UTC'});
  };
  const monthRange=value=>{
    if(!/^\d{4}-\d{2}$/.test(String(value||'')))return {start:'',end:''};
    const [year,month]=String(value).split('-').map(Number);
    const start=new Date(Date.UTC(year,month-1,1));
    const end=new Date(Date.UTC(year,month,0));
    return {
      start:start.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}),
      end:end.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}),
    };
  };
  const signedPct=(current,previous)=>{
    const a=Number(current)||0,b=Number(previous)||0;
    if(!b)return null;
    return (a-b)/Math.abs(b)*100;
  };
  const pctText=value=>Number.isFinite(value)?(value>=0?'+':'')+value.toFixed(1)+'%':'—';
  const readable=value=>String(value||'unknown').replaceAll('_',' ').replace(/\b\w/g,char=>char.toUpperCase());
  const joinedText=row=>[row?.refType,row?.description,row?.reason].map(value=>String(value||'').toLowerCase()).join(' ');

  function classify(row){
    const amount=Number(row?.amount)||0;
    const text=joinedText(row);
    if(amount>=0){
      if(/tax|bounty|ess|customs/.test(text))return {category:'Taxes',uncategorized:false};
      if(/donation|gift/.test(text))return {category:'Donations',uncategorized:false};
      if(/market|contract|transaction|broker|industry|manufactur|job/.test(text))return {category:'Market / Contracts',uncategorized:false};
      if(/reimburse|refund|insurance/.test(text))return {category:'Reimbursements',uncategorized:false};
      return {category:'Other Income',uncategorized:true};
    }
    if(/srp|ship replacement|reimburse/.test(text))return {category:'SRP Payouts',uncategorized:false};
    if(/ship|doctrine|fit|module|ammo|rig/.test(text))return {category:'Ships / Doctrine',uncategorized:false};
    if(/structure|fuel|citadel|upwell|moon|office|reaction/.test(text))return {category:'Structures / Fuel',uncategorized:false};
    if(/payout|mining|fleet|operation|\bops\b|ore/.test(text))return {category:'Payouts (Ops / Mining)',uncategorized:false};
    if(/transfer|donation|withdraw|deposit/.test(text))return {category:'Transfers',uncategorized:false};
    if(/market|contract|fee|tax|broker|industry|manufactur|job|rental/.test(text))return {category:'Operational Expenses',uncategorized:false};
    return {category:'Other / Uncategorized',uncategorized:true};
  }

  function aggregate(records,direction){
    const totals=new Map();
    for(const row of records||[]){
      const amount=Number(row?.amount)||0;
      if(direction==='income'&&amount<=0)continue;
      if(direction==='expense'&&amount>=0)continue;
      const info=classify(row);
      const value=Math.abs(amount);
      totals.set(info.category,(totals.get(info.category)||0)+value);
    }
    return [...totals.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  }

  function reconstructBalances(snapshot,selectedMonth){
    const finance=snapshot?.finance||{};
    if(snapshot?.walletAccess?.available===false||!Number.isFinite(Number(finance.totalBalance)))return {opening:null,closing:null,estimated:true};
    const months=(finance.months||[]).filter(row=>/^\d{4}-\d{2}$/.test(String(row.month||'')));
    const selected=months.find(row=>String(row.month)===String(selectedMonth));
    if(!selected)return {opening:null,closing:null,estimated:true};
    const after=months.filter(row=>String(row.month)>String(selectedMonth)).reduce((sum,row)=>sum+(Number(row.net)||0),0);
    const closing=(Number(finance.totalBalance)||0)-after;
    return {opening:closing-(Number(selected.net)||0),closing,estimated:true};
  }

  function monthComparison(snapshot,selectedMonth){
    const months=(snapshot?.finance?.months||[]).filter(row=>/^\d{4}-\d{2}$/.test(String(row.month||''))).sort((a,b)=>String(b.month).localeCompare(String(a.month)));
    const current=months.find(row=>String(row.month)===String(selectedMonth))||null;
    const previous=months.find(row=>String(row.month)<String(selectedMonth))||null;
    if(!current||!previous)return {current,previous,income:null,expenses:null,net:null};
    return {
      current,previous,
      income:signedPct(current.income,previous.income),
      expenses:signedPct(current.expenses,previous.expenses),
      net:signedPct(current.net,previous.net),
    };
  }

  function filterLabel(filters){
    const labels=[];
    if(filters.search)labels.push('search "'+filters.search+'"');
    if(filters.division)labels.push('division '+filters.division);
    if(filters.direction==='in')labels.push('money in');
    if(filters.direction==='out')labels.push('money out');
    return labels.length?labels.join(' • '):'all corporation wallet entries';
  }

  function currentFilters(){
    return {
      month:String($('ceoIncomeMonth')?.value||''),
      search:String($('ceoFinanceReportSearch')?.value||'').trim(),
      division:String($('ceoFinanceReportDivision')?.value||''),
      direction:String($('ceoFinanceReportDirection')?.value||''),
    };
  }

  let state={snapshot:null,selectedMonth:'',walletBlocked:true,report:null,busy:false,error:'',serial:0,key:'',timer:null};

  async function fetchReport(force=false){
    if(!$('ceoFinanceReportCard')||!state.snapshot)return;
    const filters=currentFilters();
    if(!filters.month)return renderEmpty('No ESI finance month is available yet.');
    const key=[state.snapshot.generatedAt||'',filters.month,filters.search,filters.division,filters.direction].join('|');
    if(!force&&state.report&&state.key===key){render();return}
    if(state.walletBlocked){state.report=null;state.error='Corporation wallet access is required for the finance report.';render();return}
    const request=++state.serial;
    state.busy=true;state.error='';render();
    try{
      let first=null;
      const records=[];
      let page=1,pages=1;
      do{
        const params=new URLSearchParams({
          month:filters.month,
          query:filters.search,
          division:filters.division,
          direction:filters.direction,
          page:String(page),
          pageSize:'100',
        });
        const response=await fetch('/api/ceo/journal?'+params,{credentials:'same-origin',cache:'no-store'});
        if(!response.ok)throw new Error(response.status===403?'CEO finance access is restricted.':response.status===401?'Log in to view CEO finance.':'Finance journal could not be loaded.');
        const payload=await response.json();
        if(request!==state.serial)return;
        if(!first){first=payload;pages=Math.max(1,Number(payload.pages)||1)}
        records.push(...(payload.records||[]));
        page++;
      }while(page<=pages&&page<=200);
      const capped=page<=pages;
      state.report={
        filters,
        totals:first?.totals||{income:0,expenses:0,net:0},
        total:Number(first?.total)||0,
        retained:Number(first?.retained)||0,
        records,
        pull:first?.pull||null,
        walletGranted:Boolean(first?.walletGranted),
        capped,
        pages,
      };
      state.key=key;
    }catch(error){
      if(request===state.serial)state.error=String(error.message||error);
    }finally{
      if(request===state.serial){state.busy=false;render();}
    }
  }

  function renderEmpty(message){
    const ids=['ceoFinanceReportKpis','ceoFinanceIncomeBreakdown','ceoFinanceExpenseBreakdown','ceoFinanceLargest','ceoFinanceMom','ceoFinanceLedger','ceoFinanceQuality'];
    for(const id of ids)if($(id))$(id).innerHTML='<div class="visual-empty">'+esc(message)+'</div>';
  }

  function renderBreakdown(id,rows,total){
    const host=$(id);if(!host)return;
    host.innerHTML=rows.length?rows.map((row,index)=>{
      const pct=total>0?row.value/total*100:0;
      return '<div class="ceo-finance-breakdown-row"><i data-rank="'+index+'"></i><span>'+esc(row.name)+'</span><strong>'+esc(money(row.value))+'</strong><small>'+pct.toFixed(1)+'%</small></div>';
    }).join(''):'<div class="visual-empty">No matching transactions.</div>';
  }

  function qualityRows(report){
    const records=report?.records||[];
    const uncategorized=records.filter(row=>classify(row).uncategorized);
    const missingDescriptions=records.filter(row=>!String(row.description||'').trim());
    const seen=new Set(),duplicates=[];
    for(const row of records){
      const id=String(row.refId||'');
      if(id&&seen.has(id))duplicates.push(id);
      else if(id)seen.add(id);
    }
    const items=[];
    if(report?.pull?.truncated)items.push({bad:true,text:'Latest ESI wallet pull reached its page limit; retained history may be incomplete.'});
    if(report?.capped)items.push({bad:true,text:'This report hit the 20,000-row browser safety cap. Narrow the active filters for complete exports.'});
    const uncategorizedAmount=uncategorized.reduce((sum,row)=>sum+Math.abs(Number(row.amount)||0),0);
    items.push({bad:Boolean(uncategorized.length),text:uncategorized.length?uncategorized.length+' uncategorized transactions • '+money(uncategorizedAmount):'No uncategorized transactions in this view.'});
    items.push({bad:Boolean(missingDescriptions.length),text:missingDescriptions.length?missingDescriptions.length+' transactions are missing descriptions.':'All matching transactions include a description.'});
    items.push({bad:Boolean(duplicates.length),text:duplicates.length?duplicates.length+' duplicate journal references detected.':'No duplicate transactions detected.'});
    if(report?.pull?.updatedAt)items.push({bad:false,text:'Wallet sync last updated '+new Date(report.pull.updatedAt).toLocaleString()+'.'});
    items.push({bad:false,text:'Historical balances are reconstructed from the current corporation wallet plus JLR-retained monthly journal net changes.'});
    return items;
  }

  function render(){
    const card=$('ceoFinanceReportCard');if(!card)return;
    const loading=$('ceoFinanceReportLoading');
    if(loading){loading.classList.toggle('hidden',!state.busy);loading.textContent=state.busy?'LOADING FINANCE REPORT…':'';}
    const controls=['ceoFinanceReportPdf','ceoFinanceReportCsv','ceoFinanceReportPrint'];
    for(const id of controls)if($(id))$(id).disabled=state.busy||!state.report;
    if(state.walletBlocked){renderEmpty('Corporation wallet permission is required.');return}
    if(state.error&&!state.report){renderEmpty(state.error);return}
    if(!state.report){renderEmpty(state.busy?'Loading finance report…':'Choose a finance month.');return}

    const report=state.report;
    const filters=report.filters;
    const month=(state.snapshot?.finance?.months||[]).find(row=>String(row.month)===filters.month)||null;
    const balances=reconstructBalances(state.snapshot,filters.month);
    const comparison=monthComparison(state.snapshot,filters.month);
    const filtered=Boolean(filters.search||filters.division||filters.direction);
    const range=monthRange(filters.month);
    const income=aggregate(report.records,'income'),expenses=aggregate(report.records,'expense');
    const incomeTotal=income.reduce((sum,row)=>sum+row.value,0),expenseTotal=expenses.reduce((sum,row)=>sum+row.value,0);

    const meta=$('ceoFinanceReportMeta');
    if(meta)meta.textContent=monthLabel(filters.month)+' • '+filterLabel(filters)+' • '+report.total+' matching entries'+(state.error?' • '+state.error:'');
    const kpis=$('ceoFinanceReportKpis');
    if(kpis)kpis.innerHTML=[
      ['OPENING BALANCE',balances.opening==null?'Unavailable':shortMoney(balances.opening),range.start+' • reconstructed'],
      [filtered?'FILTERED INCOME':'TOTAL INCOME',shortMoney(report.totals.income),report.total+' matching journal entries'],
      [filtered?'FILTERED EXPENSES':'TOTAL EXPENSES',shortMoney(report.totals.expenses),'money out in active view'],
      [filtered?'FILTERED NET':'NET CHANGE',shortMoney(report.totals.net),report.totals.net>=0?'positive movement':'negative movement'],
      ['CLOSING BALANCE',balances.closing==null?'Unavailable':shortMoney(balances.closing),range.end+' • reconstructed'],
    ].map((row,index)=>'<article class="ceo-finance-report-kpi kpi-'+index+'"><span>'+esc(row[0])+'</span><strong>'+esc(row[1])+'</strong><small>'+esc(row[2])+'</small></article>').join('');

    renderBreakdown('ceoFinanceIncomeBreakdown',income,incomeTotal);
    renderBreakdown('ceoFinanceExpenseBreakdown',expenses,expenseTotal);

    const largest=$('ceoFinanceLargest');
    if(largest){
      const rows=report.records.slice().sort((a,b)=>Math.abs(Number(b.amount)||0)-Math.abs(Number(a.amount)||0)).slice(0,8);
      largest.innerHTML=rows.length?rows.map(row=>{
        const info=classify(row);
        return '<div class="ceo-finance-activity-row"><span>'+esc(new Date(row.date).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'}))+'</span><div><strong>'+esc(info.category)+'</strong><small>'+esc(readable(row.refType))+'</small></div><b class="'+(Number(row.amount)<0?'negative':'positive')+'">'+esc(money(row.amount))+'</b></div>';
      }).join(''):'<div class="visual-empty">No matching activity.</div>';
    }

    const mom=$('ceoFinanceMom');
    if(mom){
      if(!comparison.previous)mom.innerHTML='<div class="visual-empty">No earlier observed month is available for comparison.</div>';
      else mom.innerHTML=[
        ['INCOME',month?.income||0,comparison.previous.income||0,comparison.income],
        ['EXPENSES',month?.expenses||0,comparison.previous.expenses||0,comparison.expenses],
        ['NET',month?.net||0,comparison.previous.net||0,comparison.net],
      ].map(row=>'<div class="ceo-finance-mom-row"><span>'+row[0]+'</span><small>'+esc(monthLabel(comparison.previous.month))+'</small><b>'+esc(shortMoney(row[2]))+'</b><strong class="'+(Number(row[3])>=0?'positive':'negative')+'">'+esc(pctText(row[3]))+'</strong></div>').join('');
    }

    const ledger=$('ceoFinanceLedger');
    if(ledger){
      const rows=report.records.slice(0,75);
      ledger.innerHTML=rows.length?'<div class="ceo-finance-ledger-head"><span>DATE</span><span>CATEGORY / TYPE</span><span>DIV</span><span>AMOUNT</span><span>BALANCE</span></div>'+rows.map(row=>{
        const info=classify(row);
        return '<div class="ceo-finance-ledger-row"><span>'+esc(new Date(row.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'2-digit',timeZone:'UTC'}))+'</span><div><strong>'+esc(info.category)+'</strong><small>'+esc(readable(row.refType))+(row.description?' • '+esc(row.description):'')+'</small></div><span>'+esc(String(row.division||'—'))+'</span><b class="'+(Number(row.amount)<0?'negative':'positive')+'">'+esc(shortMoney(row.amount))+'</b><span>'+esc(shortMoney(row.balance))+'</span></div>';
      }).join('')+(report.records.length>rows.length?'<small class="ceo-finance-ledger-more">Showing first '+rows.length+' of '+report.records.length+' matching records. CSV/PDF exports include the complete filtered set.</small>':''):'<div class="visual-empty">No ledger entries match the active filters.</div>';
    }

    const quality=$('ceoFinanceQuality');
    if(quality)quality.innerHTML=qualityRows(report).map(row=>'<div class="ceo-finance-quality-row '+(row.bad?'warn':'ok')+'"><span>'+(row.bad?'!':'✓')+'</span><small>'+esc(row.text)+'</small></div>').join('');
  }

  function csvText(){
    if(!state.report)return '';
    const rows=[['Date UTC','Division','Direction','Category','Reference Type','Description','Reason','Amount ISK','Balance ISK','First Party ID','Second Party ID','Reference ID']];
    for(const row of state.report.records){
      rows.push([
        row.date||'',row.division||'',Number(row.amount)<0?'OUT':'IN',classify(row).category,row.refType||'',row.description||'',row.reason||'',
        Number(row.amount)||0,Number(row.balance)||0,row.firstPartyId||'',row.secondPartyId||'',row.refId||''
      ]);
    }
    return rows.map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
  }

  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function exportCsv(){
    if(!state.report)return;
    downloadBlob(new Blob([csvText()],{type:'text/csv;charset=utf-8'}),'JLR-Hub-Corp-Finance-'+state.report.filters.month+'.csv');
  }

  function ascii(value){
    return String(value??'').replace(/[^\x20-\x7E]/g,char=>char==='−'?'-':' ').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  }
  function wrap(value,width=88){
    const words=String(value??'').split(/\s+/),out=[];let line='';
    for(const word of words){
      if(!word)continue;
      if((line+' '+word).trim().length>width&&line){out.push(line);line=word}else line=(line+' '+word).trim();
    }
    if(line)out.push(line);
    return out.length?out:[''];
  }
  function makePdf(lines){
    const logical=lines.flatMap(line=>wrap(line,88));
    const pages=[];
    for(let i=0;i<logical.length;i+=47)pages.push(logical.slice(i,i+47));
    if(!pages.length)pages.push(['JLR Hub finance report']);
    const objects=[];
    const pageIds=[],contentIds=[];
    let next=4;
    for(let i=0;i<pages.length;i++){pageIds.push(next++);contentIds.push(next++)}
    objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
    objects[2]='<< /Type /Pages /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] /Count '+pages.length+' >>';
    objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    pages.forEach((page,index)=>{
      const content='BT /F1 10 Tf 42 752 Td '+page.map((line,lineIndex)=>(lineIndex?'0 -15 Td ':'')+'('+ascii(line)+') Tj').join(' ')+' ET';
      objects[pageIds[index]]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents '+contentIds[index]+' 0 R >>';
      objects[contentIds[index]]='<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream';
    });
    let pdf='%PDF-1.4\n',offsets=[0];
    for(let id=1;id<objects.length;id++){
      if(!objects[id])continue;
      offsets[id]=pdf.length;
      pdf+=id+' 0 obj\n'+objects[id]+'\nendobj\n';
    }
    const xref=pdf.length;
    pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
    for(let id=1;id<objects.length;id++)pdf+=String(offsets[id]||0).padStart(10,'0')+' 00000 n \n';
    pdf+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
    return new Blob([pdf],{type:'application/pdf'});
  }

  function reportLines(){
    const report=state.report;if(!report)return [];
    const filters=report.filters,balances=reconstructBalances(state.snapshot,filters.month),comparison=monthComparison(state.snapshot,filters.month);
    const income=aggregate(report.records,'income'),expenses=aggregate(report.records,'expense');
    const lines=[
      'JLR HUB - CEO COMMAND / CORP FINANCE REPORT',
      (state.snapshot?.corporationName||'Corporation')+' - '+monthLabel(filters.month),
      'Active filters: '+filterLabel(filters),
      '',
      'Opening balance: '+money(balances.opening),
      'Income: '+money(report.totals.income),
      'Expenses: '+money(report.totals.expenses),
      'Net change: '+money(report.totals.net),
      'Closing balance: '+money(balances.closing),
      '',
      'INCOME BREAKDOWN'
    ];
    income.forEach(row=>lines.push('  '+row.name+': '+money(row.value)));
    lines.push('','EXPENSE BREAKDOWN');
    expenses.forEach(row=>lines.push('  '+row.name+': '+money(row.value)));
    lines.push('','MONTH OVER MONTH');
    if(comparison.previous){
      lines.push('  Previous observed month: '+monthLabel(comparison.previous.month));
      lines.push('  Income change: '+pctText(comparison.income));
      lines.push('  Expense change: '+pctText(comparison.expenses));
      lines.push('  Net change: '+pctText(comparison.net));
    }else lines.push('  No previous observed month available.');
    lines.push('','DATA QUALITY');
    qualityRows(report).forEach(row=>lines.push('  '+(row.bad?'WARNING: ':'')+row.text));
    lines.push('','FILTERED LEDGER - '+report.records.length+' RECORDS');
    for(const row of report.records){
      lines.push([
        String(row.date||'').slice(0,10),
        'Div '+String(row.division||'?'),
        classify(row).category,
        readable(row.refType),
        money(row.amount),
        String(row.description||row.reason||'').slice(0,80)
      ].join(' | '));
    }
    return lines;
  }

  function exportPdf(){
    if(!state.report)return;
    downloadBlob(makePdf(reportLines()),'JLR-Hub-Corp-Finance-'+state.report.filters.month+'.pdf');
  }

  function printReport(){
    if(!state.report)return;
    const report=state.report,filters=report.filters,balances=reconstructBalances(state.snapshot,filters.month);
    const income=aggregate(report.records,'income'),expenses=aggregate(report.records,'expense');
    const breakdown=rows=>rows.map(row=>'<tr><td>'+esc(row.name)+'</td><td>'+esc(money(row.value))+'</td></tr>').join('');
    const ledger=report.records.map(row=>'<tr><td>'+esc(String(row.date||'').slice(0,10))+'</td><td>'+esc(String(row.division||''))+'</td><td>'+esc(classify(row).category)+'</td><td>'+esc(readable(row.refType))+'</td><td>'+esc(money(row.amount))+'</td></tr>').join('');
    const html='<!doctype html><html><head><title>JLR Hub Corp Finance '+esc(filters.month)+'</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#111}h1{margin:0 0 4px}small{color:#555}.k{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:20px 0}.k div{border:1px solid #bbb;padding:10px}.k b,.k span{display:block}.two{display:grid;grid-template-columns:1fr 1fr;gap:20px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}th{background:#eee}@media print{button{display:none}.two{break-inside:avoid}}</style></head><body>'+
      '<h1>JLR HUB — CEO COMMAND / CORP FINANCE REPORT</h1><small>'+esc(state.snapshot?.corporationName||'Corporation')+' • '+esc(monthLabel(filters.month))+' • '+esc(filterLabel(filters))+'</small>'+
      '<div class="k"><div><span>Opening</span><b>'+esc(money(balances.opening))+'</b></div><div><span>Income</span><b>'+esc(money(report.totals.income))+'</b></div><div><span>Expenses</span><b>'+esc(money(report.totals.expenses))+'</b></div><div><span>Net</span><b>'+esc(money(report.totals.net))+'</b></div><div><span>Closing</span><b>'+esc(money(balances.closing))+'</b></div></div>'+
      '<div class="two"><section><h2>Income Breakdown</h2><table>'+breakdown(income)+'</table></section><section><h2>Expense Breakdown</h2><table>'+breakdown(expenses)+'</table></section></div>'+
      '<h2>Filtered Ledger</h2><table><thead><tr><th>Date</th><th>Div</th><th>Category</th><th>Type</th><th>Amount</th></tr></thead><tbody>'+ledger+'</tbody></table>'+
      '<script>window.onload=function(){window.print();}<\/script></body></html>';
    const win=window.open('','_blank','noopener,noreferrer');
    if(!win)return;
    win.document.open();win.document.write(html);win.document.close();
  }

  function moveMonth(delta){
    const select=$('ceoIncomeMonth');if(!select||!select.options.length)return;
    const next=Math.max(0,Math.min(select.options.length-1,select.selectedIndex+delta));
    if(next===select.selectedIndex)return;
    select.selectedIndex=next;
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function setData({snapshot,selectedMonth,walletBlocked}={}){
    state.snapshot=snapshot||null;
    state.selectedMonth=String(selectedMonth||'');
    state.walletBlocked=Boolean(walletBlocked);
    if($('ceoIncomeMonth')&&selectedMonth)$('ceoIncomeMonth').value=String(selectedMonth);
    void fetchReport(false);
  }

  function refresh(){state.key='';return fetchReport(true)}

  document.addEventListener('input',event=>{
    if(event.target?.id==='ceoFinanceReportSearch'){
      clearTimeout(state.timer);
      state.timer=setTimeout(()=>void fetchReport(true),300);
    }
  });
  document.addEventListener('change',event=>{
    if(['ceoFinanceReportDivision','ceoFinanceReportDirection'].includes(event.target?.id))void fetchReport(true);
  });
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('#ceoFinancePrevMonth'))moveMonth(-1);
    if(event.target?.closest?.('#ceoFinanceNextMonth'))moveMonth(1);
    if(event.target?.closest?.('#ceoFinanceReportReset')){
      if($('ceoFinanceReportSearch'))$('ceoFinanceReportSearch').value='';
      if($('ceoFinanceReportDivision'))$('ceoFinanceReportDivision').value='';
      if($('ceoFinanceReportDirection'))$('ceoFinanceReportDirection').value='';
      void fetchReport(true);
    }
    if(event.target?.closest?.('#ceoFinanceReportCsv'))exportCsv();
    if(event.target?.closest?.('#ceoFinanceReportPdf'))exportPdf();
    if(event.target?.closest?.('#ceoFinanceReportPrint'))printReport();
  });

  window.JlrCeoFinanceReport={
    setData,refresh,render,
    _test:{classify,aggregate,reconstructBalances,monthComparison,filterLabel,makePdf},
  };
})();
