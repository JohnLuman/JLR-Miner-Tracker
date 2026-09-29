import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

function positiveInt(value){
  const n=Math.floor(Number(value)||0);
  return n>0?n:0;
}
function cleanNames(values,limit=250){
  const out=[];const seen=new Set();
  for(const value of Array.isArray(values)?values:[]){
    const name=String(value||'').trim();
    if(name.length<2)continue;
    const key=name.toLocaleLowerCase('en-US');
    if(seen.has(key))continue;
    seen.add(key);
    out.push({name,key});
    if(out.length>=limit)break;
  }
  return out;
}
function cleanIds(values,limit=250){
  const out=[];const seen=new Set();
  for(const value of Array.isArray(values)?values:[]){
    const id=positiveInt(value);
    if(!id||seen.has(id))continue;
    seen.add(id);out.push(id);
    if(out.length>=limit)break;
  }
  return out;
}
function placeholders(count){
  return Array.from({length:count},()=>'?').join(',');
}
function typeSelect(where){
  return `
    SELECT
      t.type_id AS typeId,
      t.name AS name,
      t.group_id AS groupId,
      g.name AS groupName,
      g.category_id AS categoryId,
      cat.name AS categoryName,
      t.market_group_id AS marketGroupId,
      mg.name AS marketGroupName,
      t.volume AS volume,
      t.packaged_volume AS packagedVolume,
      t.portion_size AS portionSize,
      t.published AS published,
      t.base_price AS basePrice,
      c.compressed_type_id AS compressedTypeId,
      ct.name AS compressedName,
      rc.raw_type_id AS rawTypeId,
      rt.name AS rawName
    FROM types t
    LEFT JOIN groups g ON g.group_id=t.group_id
    LEFT JOIN categories cat ON cat.category_id=g.category_id
    LEFT JOIN market_groups mg ON mg.market_group_id=t.market_group_id
    LEFT JOIN compression c ON c.raw_type_id=t.type_id
    LEFT JOIN types ct ON ct.type_id=c.compressed_type_id
    LEFT JOIN compression rc ON rc.compressed_type_id=t.type_id
    LEFT JOIN types rt ON rt.type_id=rc.raw_type_id
    WHERE ${where}
  `;
}
function normalizeType(row){
  if(!row)return null;
  return{
    typeId:positiveInt(row.typeId)||null,
    name:String(row.name||''),
    groupId:positiveInt(row.groupId)||null,
    groupName:String(row.groupName||''),
    categoryId:positiveInt(row.categoryId)||null,
    categoryName:String(row.categoryName||''),
    marketGroupId:positiveInt(row.marketGroupId)||null,
    marketGroupName:String(row.marketGroupName||''),
    volume:Math.max(0,Number(row.volume)||0),
    packagedVolume:Math.max(0,Number(row.packagedVolume)||0),
    portionSize:Math.max(1,positiveInt(row.portionSize)||1),
    published:Boolean(row.published),
    basePrice:Number.isFinite(Number(row.basePrice))?Math.max(0,Number(row.basePrice)):null,
    compressedTypeId:positiveInt(row.compressedTypeId)||null,
    compressedName:String(row.compressedName||''),
    rawTypeId:positiveInt(row.rawTypeId)||null,
    rawName:String(row.rawName||''),
  };
}


const QUESTION_ITEM_ALIASES=[
  ['compressed ark','Compressed Arkonor'],
  ['comp ark','Compressed Arkonor'],
  ['ark','Arkonor'],
  ['bist','Bistot'],
  ['crok','Crokite'],
  ['merc','Mercoxit'],
  ['spod','Spodumain'],
];
const FUZZY_STOPWORDS=new Set([
  'what','whats','which','where','when','why','how','does','do','is','are','the','a','an','it','its','this','that',
  'item','price','worth','value','buy','sell','split','market','refine','refined','reprocess','compress','compressed',
  'compression','better','best','compare','versus','raw','volume','history','trend','liquidity','spread','jita','amarr',
  'dodixie','rents','rens','hek','please','show','tell','give','me','for','in','at','of','to','into','more','less'
]);
function questionKey(value){
  return String(value||'').toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function boundaryContains(text,needle){
  const idx=text.indexOf(needle);
  if(idx<0)return false;
  const before=idx>0?text[idx-1]:' ';
  const after=idx+needle.length<text.length?text[idx+needle.length]:' ';
  return !/[a-z0-9]/i.test(before)&&!/[a-z0-9]/i.test(after);
}
function fuzzyEditDistance(a,b,maxDistance=4){
  const left=String(a||''),right=String(b||'');
  if(left===right)return 0;
  if(Math.abs(left.length-right.length)>maxDistance)return maxDistance+1;
  let prev=Array.from({length:right.length+1},(_,i)=>i);
  for(let i=1;i<=left.length;i++){
    const next=[i];
    let rowMin=next[0];
    for(let j=1;j<=right.length;j++){
      const cost=left[i-1]===right[j-1]?0:1;
      const value=Math.min(prev[j]+1,next[j-1]+1,prev[j-1]+cost);
      next[j]=value;
      if(value<rowMin)rowMin=value;
    }
    if(rowMin>maxDistance)return maxDistance+1;
    prev=next;
  }
  return prev[right.length];
}
function fuzzyDistanceLimit(value,wordCount=1){
  const len=String(value||'').length;
  if(len<=4)return 0;
  if(len<=5)return 1;
  if(len<=7)return 2;
  if(len<=12)return 2;
  return wordCount>1?3:Math.min(3,Math.floor(len/6));
}
function questionWindows(text,maxWords=5){
  const words=questionKey(text).split(' ').filter(Boolean);
  const out=[];
  for(let size=1;size<=Math.min(maxWords,words.length);size++){
    for(let start=0;start+size<=words.length;start++){
      const slice=words.slice(start,start+size);
      if(slice.every(word=>FUZZY_STOPWORDS.has(word)))continue;
      const value=slice.join(' ');
      if(value.length<4)continue;
      out.push({value,words:size});
    }
  }
  return out;
}

export class JlrSdeCatalog{
  constructor({dbFile}={}){
    this.dbFile=String(dbFile||'').trim();
    this._fuzzyIndex=null;
    this._fuzzyStamp='';
  }
  exists(){
    try{return Boolean(this.dbFile&&fs.statSync(this.dbFile).size>=4096)}
    catch{return false}
  }
  withDb(fn){
    if(!this.exists())throw new Error('JLR_SDE_UNAVAILABLE');
    const db=new DatabaseSync(this.dbFile,{readOnly:true});
    try{return fn(db)}
    finally{db.close()}
  }
  meta(){
    if(!this.exists())return null;
    try{
      return this.withDb(db=>{
        const rows=db.prepare('SELECT key,value FROM meta').all();
        const meta=Object.fromEntries(rows.map(row=>[String(row.key),String(row.value)]));
        return{
          buildNumber:positiveInt(meta.build_number)||null,
          releaseDate:meta.release_date||null,
          importedAt:meta.imported_at||null,
          source:meta.source||'ccp-official-sde-jsonl',
          typeCount:positiveInt(meta.type_count),
          compressionCount:positiveInt(meta.compression_count),
          materialCount:positiveInt(meta.material_count),
          groupCount:positiveInt(meta.group_count),
          categoryCount:positiveInt(meta.category_count),
          marketGroupCount:positiveInt(meta.market_group_count),
        };
      });
    }catch{return null}
  }
  status(extra={}){
    let bytes=0;
    try{bytes=this.exists()?fs.statSync(this.dbFile).size:0}catch{}
    const meta=this.meta();
    return{
      ready:Boolean(meta?.buildNumber),
      databaseBytes:bytes,
      ...(meta||{}),
      ...extra,
    };
  }
  fuzzyIndex(){
    if(!this.exists())return new Map();
    let stamp='';
    try{
      const stat=fs.statSync(this.dbFile);
      stamp=String(stat.size)+':'+String(Math.floor(stat.mtimeMs));
    }catch{}
    if(this._fuzzyIndex&&this._fuzzyStamp===stamp)return this._fuzzyIndex;
    const rows=this.withDb(db=>db.prepare(
      'SELECT type_id AS typeId,name,name_key AS nameKey,published FROM types WHERE length(name_key)>=4'
    ).all());
    const index=new Map();
    for(const row of rows){
      const key=questionKey(row.nameKey||row.name);
      if(!key)continue;
      const words=key.split(' ').length;
      const bucket=words+':'+key[0];
      if(!index.has(bucket))index.set(bucket,[]);
      index.get(bucket).push({
        typeId:positiveInt(row.typeId),
        name:String(row.name||''),
        key,
        published:Boolean(row.published),
      });
    }
    this._fuzzyIndex=index;
    this._fuzzyStamp=stamp;
    return index;
  }
  matchQuestion(value,{limit=8}={}){
    const text=questionKey(value);
    if(text.length<2||!this.exists())return{meta:this.meta(),items:[],ambiguous:false};
    const max=Math.max(1,Math.min(20,Number(limit)||8));

    const exact=this.withDb(db=>{
      const rows=db.prepare(typeSelect("length(t.name_key)>=3 AND instr(?,t.name_key)>0")
        +" ORDER BY t.published DESC,length(t.name_key) DESC LIMIT ?")
        .all(text,max*8).map(normalizeType)
        .filter(row=>boundaryContains(text,String(row?.name||'').toLocaleLowerCase('en-US')));
      return rows;
    });
    if(exact.length){
      return{
        meta:this.meta(),
        ambiguous:false,
        items:exact.slice(0,max).map(row=>({
          ...row,matchSource:'exact',confidence:1,matchedText:String(row.name||'').toLocaleLowerCase('en-US'),
        })),
      };
    }

    for(const [alias,target] of QUESTION_ITEM_ALIASES.sort((a,b)=>b[0].length-a[0].length)){
      if(!boundaryContains(text,alias))continue;
      const resolved=this.resolveNames([target]);
      if(resolved.items.length){
        return{
          meta:resolved.meta,
          ambiguous:false,
          items:resolved.items.slice(0,max).map(row=>({
            ...row,matchSource:'alias',confidence:.99,matchedText:alias,
          })),
        };
      }
    }

    const index=this.fuzzyIndex();
    const bestByType=new Map();
    for(const window of questionWindows(text)){
      const bucket=index.get(window.words+':'+window.value[0])||[];
      const limitDistance=fuzzyDistanceLimit(window.value,window.words);
      if(limitDistance<=0)continue;
      for(const candidate of bucket){
        if(Math.abs(candidate.key.length-window.value.length)>limitDistance)continue;
        if(window.value[0]!==candidate.key[0])continue;
        if(window.value.length<=7&&limitDistance>=2
          &&window.value[window.value.length-1]!==candidate.key[candidate.key.length-1])continue;
        const distance=fuzzyEditDistance(window.value,candidate.key,limitDistance);
        if(distance>limitDistance)continue;
        const baseScore=1-distance/Math.max(window.value.length,candidate.key.length);
        const threshold=window.value.length<=7?.70:.78;
        if(baseScore<threshold)continue;
        const score=Math.min(1,baseScore+(candidate.published?.012:0));
        const prev=bestByType.get(candidate.typeId);
        if(!prev||score>prev.score){
          bestByType.set(candidate.typeId,{
            ...candidate,score,distance,matchedText:window.value,
          });
        }
      }
    }

    const ranked=[...bestByType.values()]
      .sort((a,b)=>b.score-a.score||Number(b.published)-Number(a.published)||b.name.length-a.name.length)
      .slice(0,Math.max(max,4));
    if(!ranked.length)return{meta:this.meta(),items:[],ambiguous:false};

    const top=ranked[0];
    const second=ranked[1]||null;
    const ambiguous=Boolean(second&&top.score-second.score<.045&&top.name!==second.name);
    const hydrateIds=ranked.slice(0,max).map(row=>row.typeId);
    const hydrated=this.types(hydrateIds);
    const fullById=new Map(hydrated.items.map(row=>[Number(row.typeId),row]));
    const items=ranked.slice(0,max).map(row=>({
      ...(fullById.get(Number(row.typeId))||{typeId:row.typeId,name:row.name}),
      matchSource:'fuzzy',
      confidence:Number(row.score.toFixed(3)),
      matchedText:row.matchedText,
      editDistance:row.distance,
    }));
    return{meta:hydrated.meta||this.meta(),items,ambiguous};
  }

  resolveNames(values){
    const names=cleanNames(values);
    if(!names.length)return{meta:this.meta(),items:[],missing:[]};
    return this.withDb(db=>{
      const keys=names.map(row=>row.key);
      const rows=db.prepare(typeSelect(`t.name_key IN (${placeholders(keys.length)})`)).all(...keys).map(normalizeType);
      const found=new Map(rows.map(row=>[String(row.name).toLocaleLowerCase('en-US'),row]));
      return{
        meta:this.meta(),
        items:names.map(row=>found.get(row.key)).filter(Boolean),
        missing:names.filter(row=>!found.has(row.key)).map(row=>row.name),
      };
    });
  }
  types(values){
    const ids=cleanIds(values);
    if(!ids.length)return{meta:this.meta(),items:[]};
    return this.withDb(db=>({
      meta:this.meta(),
      items:db.prepare(typeSelect(`t.type_id IN (${placeholders(ids.length)})`)).all(...ids).map(normalizeType),
    }));
  }
  materials(values){
    const ids=cleanIds(values);
    if(!ids.length)return{meta:this.meta(),items:[]};
    return this.withDb(db=>{
      const rows=db.prepare(`
        SELECT
          m.type_id AS typeId,
          t.name AS typeName,
          t.portion_size AS portionSize,
          m.material_type_id AS materialTypeId,
          mt.name AS materialName,
          m.quantity AS quantity
        FROM materials m
        JOIN types t ON t.type_id=m.type_id
        JOIN types mt ON mt.type_id=m.material_type_id
        WHERE m.type_id IN (${placeholders(ids.length)})
        ORDER BY m.type_id,m.quantity DESC,m.material_type_id
      `).all(...ids);
      const grouped=new Map();
      for(const row of rows){
        const typeId=positiveInt(row.typeId);
        if(!grouped.has(typeId))grouped.set(typeId,{
          typeId,
          name:String(row.typeName||''),
          portionSize:Math.max(1,positiveInt(row.portionSize)||1),
          materials:[],
        });
        grouped.get(typeId).materials.push({
          typeId:positiveInt(row.materialTypeId),
          name:String(row.materialName||''),
          quantity:Math.max(0,positiveInt(row.quantity)),
        });
      }
      return{meta:this.meta(),items:[...grouped.values()]};
    });
  }
}

export function sdeCompressionCandidate(type){
  if(!type||typeof type!=='object')return null;
  if(positiveInt(type.compressedTypeId)&&String(type.compressedName||'').trim()){
    return{
      sourceTypeId:positiveInt(type.typeId)||null,
      sourceName:String(type.name||''),
      targetTypeId:positiveInt(type.compressedTypeId),
      targetName:String(type.compressedName||''),
      direction:'compress',
    };
  }
  if(positiveInt(type.rawTypeId)&&String(type.rawName||'').trim()){
    return{
      sourceTypeId:positiveInt(type.typeId)||null,
      sourceName:String(type.name||''),
      targetTypeId:positiveInt(type.rawTypeId),
      targetName:String(type.rawName||''),
      direction:'decompress',
    };
  }
  return null;
}
