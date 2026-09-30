const number=value=>{
  const n=Number(value);
  return Number.isFinite(n)?Math.max(0,n):0;
};

const clean=value=>String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();

const escapeHtml=value=>clean(value)
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;')
  .replace(/'/g,'&#39;');

export function normalizePreviewPayoutPercent(value){
  if(value===null||value===undefined||String(value).trim()==='')return 100;
  const n=Number(value);
  if(!Number.isFinite(n))return 100;
  return Math.max(0,Math.min(200,n));
}

export function formatPreviewIsk(value){
  const n=number(value);
  if(n>=1e12)return (n/1e12).toFixed(2).replace(/\.00$/,'')+'T';
  if(n>=1e9)return (n/1e9).toFixed(2).replace(/\.00$/,'')+'B';
  if(n>=1e6)return (n/1e6).toFixed(2).replace(/\.00$/,'')+'M';
  if(n>=1e3)return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K';
  return n.toLocaleString('en-US',{maximumFractionDigits:2});
}

function compactNumber(value){
  const n=number(value);
  if(n>=1e12)return (n/1e12).toFixed(2).replace(/\.00$/,'')+'T';
  if(n>=1e9)return (n/1e9).toFixed(2).replace(/\.00$/,'')+'B';
  if(n>=1e6)return (n/1e6).toFixed(2).replace(/\.00$/,'')+'M';
  if(n>=1e3)return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K';
  return n.toLocaleString('en-US',{maximumFractionDigits:2});
}

function pctText(value){
  const rounded=Math.round(normalizePreviewPayoutPercent(value)*10)/10;
  return rounded.toFixed(1).replace(/\.0$/,'');
}

function selectedValue(appraisal,summary){
  const mode=String(appraisal?.pricing||'split').toLowerCase();
  if(mode==='buy')return number(summary?.buy);
  if(mode==='sell')return number(summary?.sell);
  return number(summary?.split);
}

function modeLabel(value){
  const mode=String(value||'split').toLowerCase();
  if(mode==='buy')return'BUY';
  if(mode==='sell')return'SELL';
  return'SPLIT';
}

function variantLabel(value){
  return String(value||'immediate').toLowerCase()==='top5percent'?'TOP 5% AVG':'IMMEDIATE';
}

function leadItems(appraisal){
  const mode=String(appraisal?.pricing||'split').toLowerCase();
  const totalKey=mode==='buy'?'buyTotal':mode==='sell'?'sellTotal':'splitTotal';
  return (Array.isArray(appraisal?.items)?appraisal.items:[])
    .filter(row=>row?.resolved!==false&&clean(row?.name)&&number(row?.[totalKey])>0)
    .slice()
    .sort((a,b)=>number(b?.[totalKey])-number(a?.[totalKey]))
    .slice(0,2)
    .map(row=>{
      const name=clean(row.name).slice(0,42);
      return name+' '+formatPreviewIsk(row?.[totalKey])+' ISK';
    });
}

function refineLine(appraisal){
  const refine=appraisal?.refine&&typeof appraisal.refine==='object'?appraisal.refine:null;
  if(!refine)return'';
  const rate=Math.max(0,Math.min(1,number(refine.selectedRate??refine.defaultRate)));
  const buyAt100=number(refine.buyAt100);
  if(!rate||!buyAt100)return'';
  const ratePct=(Math.round(rate*1000)/10).toFixed(1).replace(/\.0$/,'');
  return 'Refined '+ratePct+'% buy '+formatPreviewIsk(buyAt100*rate)+' ISK';
}

export function appraisalSharePreview(share,options={}){
  const appraisal=share?.appraisal&&typeof share.appraisal==='object'?share.appraisal:{};
  const summary=appraisal?.summary&&typeof appraisal.summary==='object'?appraisal.summary:{};
  const payoutPercent=normalizePreviewPayoutPercent(options.payoutPercent);
  const selected=selectedValue(appraisal,summary);
  const payout=selected*(payoutPercent/100);
  const market=clean(appraisal?.market?.name)||'Jita 4-4';
  const mode=modeLabel(appraisal?.pricing);
  const variant=variantLabel(appraisal?.pricingVariant);
  const itemCount=Math.max(0,Math.round(number(summary?.resolvedLines)));
  const unresolvedCount=Math.max(0,Math.round(number(summary?.unresolvedLines)));
  const units=number(summary?.units);
  const volume=number(summary?.volume);
  const titleBase=(clean(share?.title)||'JLR Appraisal').slice(0,90);
  const title=(titleBase+' • '+formatPreviewIsk(payout)+' ISK payout @ '+pctText(payoutPercent)+'%').slice(0,150);
  const items=leadItems(appraisal);
  const inventory=[
    itemCount+' type'+(itemCount===1?'':'s'),
    compactNumber(units)+' units',
    compactNumber(volume)+' m³',
    unresolvedCount?unresolvedCount+' unresolved':'',
  ].filter(Boolean).join(' • ');
  const detailParts=[
    market+' • '+mode+' • '+variant+' • '+pctText(payoutPercent)+'% payout',
    'Buy '+formatPreviewIsk(summary?.buy)+' • Split '+formatPreviewIsk(summary?.split)+' • Sell '+formatPreviewIsk(summary?.sell),
    inventory,
    refineLine(appraisal),
    items.length?'Top value: '+items.join(' • '):'',
  ].filter(Boolean);
  return{
    title,
    browserTitle:titleBase+' • JLR Appraisal',
    description:detailParts.join(' | ').slice(0,360),
    payoutPercent,
    payoutValue:payout,
    selectedValue:selected,
    market,
    mode,
    variant,
    itemCount,
    units,
    volume,
  };
}

export function renderAppraisalShareHtml(template,share,options={}){
  const source=String(template||'');
  const preview=appraisalSharePreview(share,options);
  const canonicalUrl=clean(options.canonicalUrl);
  const imageUrl=clean(options.imageUrl);
  const tags=[
    '<meta name="description" content="'+escapeHtml(preview.description)+'">',
    '<meta property="og:type" content="website">',
    '<meta property="og:locale" content="en_US">',
    '<meta property="og:site_name" content="JLR Market Network">',
    '<meta property="og:title" content="'+escapeHtml(preview.title)+'">',
    '<meta property="og:description" content="'+escapeHtml(preview.description)+'">',
    canonicalUrl?'<meta property="og:url" content="'+escapeHtml(canonicalUrl)+'">':'',
    imageUrl?'<meta property="og:image" content="'+escapeHtml(imageUrl)+'">':'',
    imageUrl&&imageUrl.startsWith('https://')?'<meta property="og:image:secure_url" content="'+escapeHtml(imageUrl)+'">':'',
    imageUrl?'<meta property="og:image:type" content="image/png">':'',
    imageUrl?'<meta property="og:image:width" content="1200">':'',
    imageUrl?'<meta property="og:image:height" content="630">':'',
    imageUrl?'<meta property="og:image:alt" content="JLR Market Network appraisal preview">':'',
    '<meta name="twitter:card" content="'+(imageUrl?'summary_large_image':'summary')+'">',
    '<meta name="twitter:title" content="'+escapeHtml(preview.title)+'">',
    '<meta name="twitter:description" content="'+escapeHtml(preview.description)+'">',
    imageUrl?'<meta name="twitter:image" content="'+escapeHtml(imageUrl)+'">':'',
    imageUrl?'<meta name="twitter:image:alt" content="JLR Market Network appraisal preview">':'',
    canonicalUrl?'<link rel="canonical" href="'+escapeHtml(canonicalUrl)+'">':'',
  ].filter(Boolean).join('\n  ');

  let html=source.replace(/<title>[\s\S]*?<\/title>/i,'<title>'+escapeHtml(preview.browserTitle)+'</title>');
  if(html.includes('</head>'))html=html.replace('</head>','  '+tags+'\n</head>');
  return html;
}
