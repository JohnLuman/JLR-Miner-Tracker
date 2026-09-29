function cleanNumber(value){
  const n=Number(String(value??'').replace(/,/g,'').trim());
  return Number.isFinite(n)?n:null;
}

function parseDistanceMeters(value){
  const raw=String(value??'').trim();
  const match=raw.match(/^([\d,.]+)\s*(km|m)$/i);
  if(!match)return null;
  const amount=cleanNumber(match[1]);
  if(amount===null)return null;
  return match[2].toLowerCase()==='km'?amount*1000:amount;
}

function parseOreSurveyRow(line){
  const parts=String(line??'').split('\t').map(part=>part.trim());
  if(parts.length<5)return null;

  const name=parts[0];
  const quantity=cleanNumber(parts[1]);
  const volumeMatch=parts[2].match(/^([\d,.]+)\s*m(?:3|³)$/i);
  const valueRaw=parts[3];
  const valueMatch=valueRaw==='-'?null:valueRaw.match(/^([\d,.]+)\s*ISK$/i);
  const distanceMeters=parseDistanceMeters(parts[4]);

  if(!name||quantity===null||!volumeMatch||distanceMeters===null)return null;
  const volumeM3=cleanNumber(volumeMatch[1]);
  if(volumeM3===null)return null;

  let valueISK=null;
  if(valueRaw!=='-'){
    if(!valueMatch)return null;
    valueISK=cleanNumber(valueMatch[1]);
    if(valueISK===null)return null;
  }

  return{name,quantity,volumeM3,valueISK,distanceMeters};
}

export function parseOreSurvey(text){
  const rows=String(text??'')
    .split(/\r?\n/)
    .map(parseOreSurveyRow)
    .filter(Boolean);

  if(!rows.length){
    return{
      valid:false,
      rowCount:0,
      pricedRowCount:0,
      unpricedRowCount:0,
      totalQuantity:0,
      totalVolumeM3:0,
      pricedValueISK:0,
      groups:[],
      nearest:[],
    };
  }

  const groupsMap=new Map();
  let totalQuantity=0;
  let totalVolumeM3=0;
  let pricedValueISK=0;
  let pricedRowCount=0;

  for(const row of rows){
    totalQuantity+=row.quantity;
    totalVolumeM3+=row.volumeM3;
    if(row.valueISK!==null){
      pricedValueISK+=row.valueISK;
      pricedRowCount+=1;
    }

    const current=groupsMap.get(row.name)||{
      name:row.name,
      rocks:0,
      quantity:0,
      volumeM3:0,
      pricedValueISK:0,
      pricedRows:0,
      unpricedRows:0,
      nearestMeters:null,
    };
    current.rocks+=1;
    current.quantity+=row.quantity;
    current.volumeM3+=row.volumeM3;
    if(row.valueISK===null){
      current.unpricedRows+=1;
    }else{
      current.pricedRows+=1;
      current.pricedValueISK+=row.valueISK;
    }
    if(current.nearestMeters===null||row.distanceMeters<current.nearestMeters){
      current.nearestMeters=row.distanceMeters;
    }
    groupsMap.set(row.name,current);
  }

  const groups=[...groupsMap.values()].sort((a,b)=>b.volumeM3-a.volumeM3||a.name.localeCompare(b.name));
  const nearest=[...rows]
    .sort((a,b)=>a.distanceMeters-b.distanceMeters||b.volumeM3-a.volumeM3)
    .slice(0,5)
    .map(row=>({
      name:row.name,
      distanceMeters:row.distanceMeters,
      volumeM3:row.volumeM3,
      valueISK:row.valueISK,
    }));

  return{
    valid:true,
    rowCount:rows.length,
    pricedRowCount,
    unpricedRowCount:rows.length-pricedRowCount,
    totalQuantity,
    totalVolumeM3,
    pricedValueISK,
    groups,
    nearest,
  };
}

function compact(value,kind='number'){
  const n=Number(value)||0;
  const abs=Math.abs(n);
  if(abs>=1e12)return(n/1e12).toFixed(2)+'T';
  if(abs>=1e9)return(n/1e9).toFixed(2)+'B';
  if(abs>=1e6)return(n/1e6).toFixed(2)+'M';
  if(abs>=1e3)return(n/1e3).toFixed(kind==='m3'?0:1)+'K';
  return Math.round(n).toLocaleString('en-US');
}

function distanceLabel(meters){
  const n=Number(meters)||0;
  return n>=1000?(n/1000).toFixed(n<10000?2:1)+' km':Math.round(n).toLocaleString('en-US')+' m';
}

export function oreSurveySummaryText(result){
  if(!result?.valid)return'Adam could not recognize any ore survey rows in that paste.';

  const priced=result.unpricedRowCount>0
    ?compact(result.pricedValueISK)+' ISK from priced rows'
    :compact(result.pricedValueISK)+' ISK';
  const missing=result.unpricedRowCount>0
    ?` ${result.unpricedRowCount} rock${result.unpricedRowCount===1?'':'s'} have no ISK value, so the ISK total is partial.`
    :'';

  const largest=result.groups.slice(0,4).map(group=>{
    const value=group.pricedRows?(' / '+compact(group.pricedValueISK)+' ISK'+(group.unpricedRows?' priced':'')):' / value unavailable';
    return group.name+' '+compact(group.volumeM3,'m3')+' m³'+value;
  }).join('; ');

  const nearest=result.nearest.slice(0,3).map(row=>row.name+' '+distanceLabel(row.distanceMeters)).join('; ');

  return `Ore survey read: ${result.rowCount} rocks • ${compact(result.totalVolumeM3,'m3')} m³ total • ${priced}.${missing} Largest by volume: ${largest}. Closest: ${nearest}.`;
}
