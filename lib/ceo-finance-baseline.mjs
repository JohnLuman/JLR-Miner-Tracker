import { gunzipSync } from 'node:zlib';
export function decodeFinanceBaseline(encoded){
  const empty={available:false,months:[],entries:0};
  if(!encoded)return empty;
  try{
    const data=JSON.parse(gunzipSync(Buffer.from(encoded,'base64'),{maxOutputLength:1_000_000}).toString('utf8'));
    if(!Array.isArray(data.months)||data.months.length>120)throw new Error('Invalid months');
    const seen=new Set();
    const months=data.months.map(row=>{
      if(!/^\d{4}-\d{2}$/.test(row.month)||seen.has(row.month))throw new Error('Duplicate or invalid month');
      seen.add(row.month);
      for(const key of ['income','expenses','net','entries'])if(typeof row[key]!=='number'||!Number.isFinite(row[key]))throw new Error('Invalid total');
      if(row.income<0||row.expenses<0||Math.abs(row.net-(row.income-row.expenses))>1)throw new Error('Totals do not reconcile');
      const sources=(row.sources||[]).map(item=>{if(typeof item.value!=='number'||!Number.isFinite(item.value)||item.value<0)throw new Error('Invalid source');return {name:String(item.name||'Unknown').slice(0,160),value:item.value};});
      if(Math.abs(sources.reduce((sum,item)=>sum+item.value,0)-row.income)>1)throw new Error('Sources do not reconcile');
      return {month:'sheet:'+row.month,label:row.month+' • ADMIN WORKBOOK',source:'workbook',income:row.income,expenses:row.expenses,net:row.net,entries:row.entries,sources};
    });
    return {available:true,months,entries:months.reduce((sum,row)=>sum+row.entries,0),source:String(data.source||'Admin workbook').slice(0,160),dateStart:String(data.dateStart||''),dateEnd:String(data.dateEnd||''),notes:(data.notes||[]).map(note=>String(note).slice(0,400))};
  }catch{return empty;}
}
