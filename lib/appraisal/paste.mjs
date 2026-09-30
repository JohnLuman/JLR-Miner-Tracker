// Native EVE inventory and typed item list parser for Appraisal.
function clean(value){
  return String(value??'').normalize('NFKC').replace(/\u00a0/g,' ').trim();
}

function parseQty(value){
  const n=Number(String(value??'').replace(/,/g,'').trim());
  return Number.isFinite(n)&&n>0?Math.floor(n):null;
}

export function parseAppraisalPaste(text){
  const rows=[];
  const rejected=[];
  const lines=String(text??'').replace(/\r/g,'').split('\n').map(clean).filter(Boolean);
  for(const raw of lines.slice(0,100)){
    const tab=raw.split('\t').map(clean).filter(Boolean);
    let name='',quantity=null;
    if(tab.length>=2){
      // Native EVE inventory exports are usually Item Name<TAB>Quantity<...>.
      // Other EVE exports can be Item Name<TAB>Group<TAB>Slot<TAB>Volume<TAB>Value.
      // In both cases the first tab-separated field is the inventory type name.
      const first=clean(tab[0]);
      const firstLower=first.toLowerCase();
      const looksLikeHeader=/^(?:name|item|item name|type|type name)$/i.test(firstLower);
      if(looksLikeHeader){rejected.push(raw);continue}
      if(first){
        name=first;
        const second=parseQty(tab[1]);
        quantity=second||1;
      }
    }
    if(!name){
      let m=raw.match(/^([\d,]+)\s*[x×]?\s+(.+)$/i);
      if(m){quantity=parseQty(m[1]);name=clean(m[2])}
      else{
        m=raw.match(/^(.+?)\s+[x×]\s*([\d,]+)$/i);
        if(m){name=clean(m[1]);quantity=parseQty(m[2])}
      }
    }
    if(!name){
      const m=raw.match(/^(.+?)\s+([\d,]+)$/);
      if(m&&parseQty(m[2])){name=clean(m[1]);quantity=parseQty(m[2])}
    }
    if(!name){name=raw;quantity=1}
    name=name.replace(/^Compressed\s+/i,'Compressed ').trim();
    if(!name||!(quantity>0)){rejected.push(raw);continue}
    rows.push({name,quantity,raw});
  }
  return {valid:rows.length>0,rows,rejected,lineCount:lines.length};
}
