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

export class JlrSdeCatalog{
  constructor({dbFile}={}){
    this.dbFile=String(dbFile||'').trim();
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
