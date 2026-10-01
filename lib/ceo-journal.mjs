export function journalPage(journal,{query='',month='',division='',direction='',page=1,pageSize=50}={}){
  const rows=(Array.isArray(journal)?journal:[]).filter(row=>Number.isFinite(Date.parse(row?.date||'')));
  const months=[...new Set(rows.map(row=>String(row.date).slice(0,7)))].sort().reverse();
  const q=String(query).trim().toLowerCase().slice(0,160);
  const selected=rows.filter(row=>(!month||String(row.date).slice(0,7)===month)&&(!division||String(row.division)===String(division))&&(!direction||direction==='in'&&Number(row.amount)>0||direction==='out'&&Number(row.amount)<0||direction==='zero'&&Number(row.amount)===0)&&(!q||[row.refId,row.refType,String(row.refType||'').replaceAll('_',' '),row.reason,row.description,row.firstPartyId,row.secondPartyId].join(' ').toLowerCase().includes(q))).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)||String(a.refId).localeCompare(String(b.refId)));
  const size=Math.min(100,Math.max(1,Math.trunc(Number(pageSize)||50)));
  const pages=Math.max(1,Math.ceil(selected.length/size));
  const current=Math.min(pages,Math.max(1,Math.trunc(Number(page)||1)));
  const totals=selected.reduce((sum,row)=>{const amount=Number(row.amount)||0;sum.net+=amount;if(amount>0)sum.income+=amount;else sum.expenses-=amount;return sum;},{income:0,expenses:0,net:0});
  return {months,total:selected.length,retained:rows.length,page:current,pages,pageSize:size,totals,records:selected.slice((current-1)*size,current*size).map(row=>({refId:String(row.refId),date:row.date,division:row.division,amount:row.amount,balance:row.balance,refType:row.refType,description:row.description,reason:row.reason,firstPartyId:row.firstPartyId,secondPartyId:row.secondPartyId}))};
}
