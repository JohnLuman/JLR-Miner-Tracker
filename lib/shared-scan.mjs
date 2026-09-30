function cleanLines(text){
  return String(text||'').replace(/\r/g,'').split('\n').map(line=>line.trim()).filter(Boolean);
}
function splitColumns(line){
  const value=String(line||'');
  return (value.includes('\t')?value.split('\t'):value.split(/\s{3,}/)).map(v=>v.trim()).filter(Boolean);
}
function distanceValue(value){
  return /^(?:-|\d+(?:\.\d+)?\s*(?:m|km|au))$/i.test(String(value||'').replace(/,/g,'').trim());
}
export function sharedScanLines(text){
  return cleanLines(text);
}
export function sharedScanKind(text){
  const lines=cleanLines(text);
  if(!lines.length)return'text';
  let dscanRows=0,tabularRows=0,plainRows=0;
  for(const line of lines){
    const cols=splitColumns(line);
    if(line.includes('\t')||cols.length>=3)tabularRows++;
    if(cols.length>=2&&distanceValue(cols.at(-1)))dscanRows++;
    if(!line.includes('\t')&&cols.length===1)plainRows++;
  }
  if(dscanRows>=1&&(dscanRows/lines.length>=0.15||tabularRows/lines.length>=0.5))return'dscan';
  if(tabularRows/lines.length>=0.55)return'dscan';
  if(plainRows/lines.length>=0.8)return'local';
  return'text';
}
export function sharedLocalNames(text){
  const seen=new Set(),out=[];
  for(const line of cleanLines(text)){
    const value=line.replace(/^[-•]\s*/,'').trim();
    if(!value||value.includes('\t'))continue;
    if(/^(?:character|character name|pilot|pilot name|local)$/i.test(value))continue;
    if(value.length>100)continue;
    const key=value.toLowerCase();
    if(seen.has(key))continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
export function parseSharedDscanRows(text){
  const out=[];
  for(const raw of cleanLines(text)){
    const cols=splitColumns(raw);
    if(!cols.length)continue;
    const lower=cols.map(v=>v.toLowerCase());
    if(lower.includes('type')&&(lower.includes('name')||lower.includes('distance')))continue;
    const last=cols.at(-1);
    const distance=distanceValue(last)?last:'';
    const type=distance?(cols.at(-2)||'Unknown'):(cols.length>1?cols.at(-1):'Unknown');
    let name=cols[0]||'';
    if(/^\d+$/.test(name.replace(/,/g,''))&&cols.length>=3)name=cols[1]||name;
    out.push({name,type,distance,raw});
  }
  return out;
}
