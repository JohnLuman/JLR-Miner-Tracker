import fs from 'node:fs';
import { parseSharedDscanRows, sharedLocalNames } from './shared-scan.mjs';
import { renderScanPreviewFallbackPng } from './dscan-png-fallback.mjs';

// The static SDE catalog is the same source used by the public shared-scan
// viewer. D-scan alone never proves a ship or its pilot is hostile.
const knownShips=new Map();
try{
  const catalog=JSON.parse(fs.readFileSync(new URL('../public/eve-ship-catalog.json',import.meta.url),'utf8'));
  for(const [name,group] of catalog.ships||[]){
    if(name&&group)knownShips.set(String(name).toLowerCase(),{name:String(name),group:String(group)});
  }
}catch(error){
  console.warn('Discord scan image could not load ship catalog',String(error.message||error));
}
for(const [name,group] of [['Mackinaw','Exhumer'],['Hulk','Exhumer'],['Skiff','Exhumer'],['Venture','Frigate'],['Rorqual','Capital Industrial Ship'],['Orca','Industrial Command Ship']]){
  if(!knownShips.has(name.toLowerCase()))knownShips.set(name.toLowerCase(),{name,group});
}
const MINING_GROUPS=new Set(['Exhumer','Mining Barge','Expedition Frigate','Expedition Command Ship','Industrial Command Ship','Capital Industrial Ship']);
const COMBAT_GROUPS=new Set([
  'Assault Frigate','Attack Battlecruiser','Battleship','Black Ops','Carrier','Combat Battlecruiser',
  'Combat Recon Ship','Command Carrier','Command Destroyer','Command Ship','Covert Ops',
  'Cruiser','Destroyer','Dreadnought','Electronic Attack Ship','Flag Cruiser','Force Auxiliary',
  'Force Recon Ship','Frigate','Heavy Assault Cruiser','Heavy Interdiction Cruiser',
  'Interceptor','Interdictor','Lancer Dreadnought','Logistics','Logistics Frigate',
  'Marauder','Stealth Bomber','Strategic Cruiser','Supercarrier','Tactical Destroyer','Titan',
]);
const SPECIAL_MINERS=new Set(['venture','miasmos']);
function role(name,group){
  if(SPECIAL_MINERS.has(name.toLowerCase())||MINING_GROUPS.has(group))return 'mining';
  return COMBAT_GROUPS.has(group)?'combat':'other';
}
function clean(value,limit=100){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit);
}
function xml(value){
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
}
function number(value){return Number(value||0).toLocaleString('en-US')}
function formatTime(raw){
  const timestamp=Date.parse(String(raw||''));
  return Number.isFinite(timestamp)?new Date(timestamp).toISOString().slice(0,16).replace('T',' ')+' UTC':'TIME NOT PROVIDED';
}
export function summarizeDiscordScan(row){
  const dscan=String(row?.dscanText||'');
  const lines=parseSharedDscanRows(dscan);
  const types=new Map();
  let shipCount=0,miningCount=0,combatCount=0,otherCount=0;
  for(const line of lines){
    const entry=knownShips.get(clean(line.type,100).toLowerCase());
    if(!entry){otherCount++;continue}
    shipCount++;
    const group=entry.group;
    const hullRole=role(entry.name,group);
    if(hullRole==='mining')miningCount++;
    if(hullRole==='combat')combatCount++;
    const key=entry.name.toLowerCase();
    if(!types.has(key))types.set(key,{name:entry.name,group,role:hullRole,count:0});
    types.get(key).count++;
  }
  const ships=[...types.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  const system=clean(row?.system,80);
  const pilotCount=String(row?.localText||'').trim()?sharedLocalNames(row.localText).length:0;
  const manualRecons=Array.isArray(row?.manualRecons)?row.manualRecons:[];
  const reconCount=manualRecons.reduce((sum,item)=>sum+Math.max(0,Math.min(9999,Math.floor(Number(item?.count)||0))),0);
  const status=shipCount===0
    ?'NO VERIFIED SHIP CONTACTS'
    :combatCount>0?'COMBAT HULLS PRESENT - STANDINGS UNKNOWN'
    :miningCount===shipCount?'MINING ACTIVITY - STANDINGS UNKNOWN'
    :'SHIP CONTACTS - STANDINGS UNKNOWN';
  return{
    system:system||'SYSTEM NOT PROVIDED',
    hasSystem:Boolean(system),
    scannedAt:formatTime(row?.updatedAt||row?.createdAt),
    shipCount,miningCount,combatCount,otherCount,
    objectCount:lines.length,
    pilotCount,reconCount,
    ships,status,
    // Never infer hostile pilot count, actual ship allegiance, or ship-to-pilot
    // associations from the hull list or the Local list.
    confirmedHostiles:null,
  };
}
function label(x,y,string,{size=24,weight=500,color='#f0f3f8',max=200,font='Arial, DejaVu Sans, sans-serif',anchor='start'}={}){
  return '<text x="'+x+'" y="'+y+'" fill="'+color+'" font-size="'+size+'" font-weight="'+weight+'" font-family="'+font+'" text-anchor="'+anchor+'">'+xml(clean(string,max))+'</text>';
}
export function renderDiscordScanSvg(row){
  const scan=summarizeDiscordScan(row);
  const out=[];
  const push=(value)=>out.push(value);
  const fmt=(value)=>xml(clean(value,80));
  // Carefully composed at native 1200×630. The geometry follows the original
  // polished JlrHub red tactical banner rather than the old 5×7 bitmap font.
  push('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">');
  push('<defs>'
    +'<linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1d0610"/><stop offset=".34" stop-color="#05060c"/><stop offset=".75" stop-color="#13070c"/><stop offset="1" stop-color="#1b030b"/></linearGradient>'
    +'<radialGradient id="flare"><stop stop-color="#fe2746" stop-opacity=".28"/><stop offset=".34" stop-color="#c71b33" stop-opacity=".13"/><stop offset="1" stop-color="#a11629" stop-opacity="0"/></radialGradient>'
    +'<radialGradient id="embers"><stop stop-color="#ff9d5b" stop-opacity=".22"/><stop offset="1" stop-color="#d81733" stop-opacity="0"/></radialGradient>'
    +'<linearGradient id="edge" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#fa2247"/><stop offset=".55" stop-color="#540918"/><stop offset="1" stop-color="#ed294d"/></linearGradient>'
    +'<linearGradient id="row" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#180a13"/><stop offset=".65" stop-color="#0a0b12"/><stop offset="1" stop-color="#170a13"/></linearGradient>'
    +'<filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="7"/></filter>'
    +'<filter id="soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="22"/></filter>'
    +'<pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="#932039" stroke-opacity=".095" stroke-width="1"/></pattern>'
    +'<clipPath id="inside"><rect x="12" y="10" width="1176" height="608" rx="10"/></clipPath>'
    +'</defs>');
  push('<rect width="1200" height="630" fill="#020308"/>');
  push('<g clip-path="url(#inside)">'
    +'<rect x="12" y="10" width="1176" height="608" fill="url(#base)"/>'
    +'<rect x="12" y="10" width="1176" height="608" fill="url(#grid)"/>'
    +'<ellipse cx="370" cy="-10" rx="515" ry="236" fill="url(#flare)"/>'
    +'<ellipse cx="1120" cy="60" rx="310" ry="260" fill="url(#embers)"/>'
    +'<path d="M-20 170L405 -50L603 -50L220 206Z" fill="#7e0d21" opacity=".13"/>'
    +'<path d="M675 0L1188 0L984 196Z" fill="#b90928" opacity=".14"/>'
    +'<path d="M1010 10L1190 11L1120 80L979 80Z" fill="#ef2b4a" opacity=".08"/>'
    +'<path d="M12 257L1188 257" stroke="#a61d34" opacity=".35" stroke-width="1"/>'
    +'</g>');
  for(let i=0;i<56;i++){
    const x=24+(i*197+77)%1146;
    const y=21+(i*113+37)%583;
    const rr=i%5===0?2:0.8;
    push('<circle cx="'+x+'" cy="'+y+'" r="'+rr+'" fill="'+(i%3===0?'#ff885e':'#fa3855')+'" opacity="'+(i%7===0?'.45':'.15')+'"/>');
  }
  push('<path d="M0 27L27 0H201M999 0H1171L1200 31M0 592L36 630H300M949 630H1171L1200 599" stroke="#ff3155" stroke-width="4" fill="none"/>');
  push('<path d="M12 12H1188V618H12Z" fill="none" stroke="url(#edge)" stroke-width="2.5"/>');
  push('<path d="M27 218H1173" stroke="#f52c52" stroke-width="3" filter="url(#glow)" opacity=".78"/>');
  push('<path d="M27 218H1173" stroke="#fc3759" stroke-width="2"/>');
  // Orbital mark and its red light bloom, from the preferred JlrHub concept.
  push('<circle cx="110" cy="109" r="82" fill="none" stroke="#eb1244" stroke-width="7" opacity=".75" filter="url(#glow)"/>');
  push('<circle cx="110" cy="109" r="76" fill="none" stroke="#ed2450" stroke-width="3" opacity=".95"/>');
  push('<circle cx="110" cy="109" r="61" fill="none" stroke="#831831" stroke-width="9"/>');
  push('<circle cx="110" cy="109" r="57" fill="none" stroke="#f23655" stroke-width="2"/>');
  push('<circle cx="110" cy="109" r="49" fill="none" stroke="#6f1229" stroke-width="1.5"/>');
  push('<path d="M110 10V48M110 170V208M10 109H44M178 109H210" stroke="#ff315a" stroke-width="5" filter="url(#glow)"/>');
  push('<path d="M110 10V48M110 170V208M10 109H44M178 109H210" stroke="#ff5674" stroke-width="3"/>');
  // Wordmark overlapping reticle intentionally, as in the user's preferred art.
  push('<path d="M34 156H397" stroke="#e3234a" opacity=".42" stroke-width="2"/>');
  push(label(45,128,'Jlr',{size:76,weight:900,color:'#ffffff',font:'DejaVu Sans, Arial, sans-serif'}));
  push(label(164,128,'Hub',{size:76,weight:900,color:'#ff2854',font:'DejaVu Sans, Arial, sans-serif'}));
  push('<path d="M414 41V191" stroke="#7c2540" stroke-width="2"/>');
  push(label(452,56,'TACTICAL INTELLIGENCE / SHARED D-SCAN',{size:17,weight:700,color:'#e65a72'}));
  push(label(449,114,'THREAT SCAN',{size:54,weight:900,color:'#f7f7fb'}));
  push(label(452,159,scan.hasSystem?scan.system:'SYSTEM UNKNOWN',{size:32,weight:900,color:scan.hasSystem?'#fafafa':'#b7bcc9',max:22}));
  push(label(452,190,'SCAN SNAPSHOT  /  '+scan.scannedAt,{size:16,weight:500,color:'#93a7b9'}));
  // Never say HOSTILE SHIPS: D-scan cannot identify standings.
  push('<rect x="965" y="40" width="199" height="153" rx="3" fill="#270514" stroke="#d9274b" stroke-width="3"/>');
  push('<path d="M965 65V40H998M1137 40H1164V67M965 167V193H995M1138 193H1164V169" stroke="#ff5172" stroke-width="3" fill="none"/>');
  push(label(1064,80,'D-SCAN SHIPS',{size:19,weight:900,color:'#fa647b',anchor:'middle'}));
  push(label(1064,166,number(scan.shipCount),{size:84,weight:900,color:'#ff365e',anchor:'middle'}));
  push('<rect x="35" y="238" width="1130" height="59" rx="3" fill="#1b0a15" stroke="#6e223a" stroke-width="1.5"/>');
  push('<path d="M35 240H1165" stroke="#ec3b62" opacity=".28" stroke-width="1"/>');
  push(label(59,275,'SHIP INTELLIGENCE',{size:27,weight:900,color:'#ffffff'}));
  const distinct=scan.ships.length;
  push(label(1128,271,number(distinct)+' HULL TYPE'+(distinct===1?'':'S'),{size:19,weight:800,color:'#fa5776',anchor:'end'}));
  push('<rect x="37" y="311" width="1126" height="40" fill="#280917" stroke="#76243e" stroke-width="1"/>');
  push(label(64,339,'HULL',{size:18,weight:900,color:'#fff0f4'}));
  push(label(597,339,'CLASS',{size:18,weight:900,color:'#fff0f4'}));
  push(label(1120,339,'COUNT',{size:18,weight:900,color:'#fff0f4',anchor:'end'}));
  const visible=scan.ships.slice(0,5);
  if(visible.length){
    for(let index=0;index<visible.length;index++){
      const ship=visible[index],y=361+index*43;
      const accent=ship.role==='mining'?'#74bfff':ship.role==='combat'?'#fc5670':'#9aaabb';
      push('<rect x="37" y="'+y+'" width="1126" height="42" fill="'+(index%2?'#100a12':'url(#row)')+'"/>');
      push('<rect x="37" y="'+y+'" width="4" height="42" fill="'+accent+'" opacity=".93"/>');
      push(label(67,y+29,ship.name,{size:24,weight:800,color:'#f4f4fa',max:32}));
      push(label(597,y+28,ship.group,{size:19,weight:650,color:'#9bb0c1',max:36}));
      push(label(1114,y+30,number(ship.count),{size:27,weight:900,color:accent,anchor:'end'}));
      push('<path d="M38 '+(y+41.5)+'H1163" stroke="#642139" stroke-opacity=".49"/>');
    }
  }else{
    push(label(67,413,scan.pilotCount
      ?number(scan.pilotCount)+' LOCAL PILOTS / NO RECOGNIZED SHIPS'
      :'NO RECOGNIZED SHIP HULLS IN THIS SCAN',{size:23,weight:750,color:'#bdc2cd'}));
  }
  const hidden=Math.max(0,scan.ships.length-visible.length);
  if(hidden){
    push(label(68,591,'+ '+number(hidden)+' MORE SHIP TYPE'+(hidden===1?'':'S')+'  /  OPEN LINK FOR FULL LIST',{size:18,weight:800,color:'#ff6781'}));
  }else{
    const brief=scan.shipCount?number(scan.shipCount)+' IDENTIFIED SHIP'+(scan.shipCount===1?'':'S'):
      'LOCAL / D-SCAN DATA';
    push(label(65,591,brief+'  •  SNAPSHOT — NOT LIVE',{size:17,weight:800,color:'#a9b6c5'}));
  }
  push(label(1154,593,'VIEW FULL INTEL',{size:19,weight:900,color:'#f4eff6',anchor:'end'}));
  push('<path d="M38 609H1163" stroke="#da294c" stroke-opacity=".72" stroke-width="2"/>');
  push('</svg>');
  return out.join('');
}
export async function renderDiscordScanPng(row){
  // High-quality SVG antialiasing and proper font shaping. The old pure-JS
  // bitmap renderer remains a safe fallback if the native binary fails to load.
  try{
    const {Resvg}=await import('@resvg/resvg-js');
    const renderer=new Resvg(renderDiscordScanSvg(row),{
      fitTo:{mode:'width',value:1200},
      font:{loadSystemFonts:true,defaultFontFamily:'sans-serif'},
    });
    return renderer.render().asPng();
  }catch(error){
    if(!renderDiscordScanPng.warned){
      renderDiscordScanPng.warned=true;
      console.warn('Discord art high-fidelity renderer unavailable; using safety fallback',String(error?.message||error));
    }
    return renderScanPreviewFallbackPng(summarizeDiscordScan(row));
  }
}
export function discordScanDescription(row){
  const scan=summarizeDiscordScan(row);
  const shipNames=scan.ships.map(ship=>number(ship.count)+'× '+ship.name);
  // Discord controls its own embed width (including narrow mobile screens).
  // Keep the description to approximately one line and use ... for overflow.
  const maxLength=48;
  if(!shipNames.length)return 'No ships identified';
  let line='';
  for(let i=0;i<shipNames.length;i++){
    const candidate=line?line+' · '+shipNames[i]:shipNames[i];
    if(candidate.length+(i<shipNames.length-1?3:0)>maxLength){
      return line?line+'...':shipNames[i].slice(0,maxLength-3).trimEnd()+'...';
    }
    line=candidate;
  }
  return line;
}

// High-resolution Discord card with exact scan data: this is the art the
// user approved, not the old simplified fallback bitmap.
export function renderDiscordScanHtml(template,row,{canonicalUrl,imageUrl}){
  const scan=summarizeDiscordScan(row);
  // JlrHub is already provided as the site name: avoid repeating branding
  // in Discord's clickable title, which otherwise looks like a long URL slug.
  const context=scan.shipCount?number(scan.shipCount)+' SHIPS ON D-SCAN':
    scan.pilotCount?number(scan.pilotCount)+' LOCAL PILOTS':'SHARED INTEL';
  const title=scan.hasSystem?scan.system+' • '+context:context;
  const description=discordScanDescription(row);
  const metadata=[
    '<meta property="og:site_name" content="JlrHub">',
    '<meta property="og:type" content="website">',
    '<meta property="og:url" content="'+xml(canonicalUrl)+'">',
    '<meta property="og:image" content="'+xml(imageUrl)+'">',
    '<meta property="og:image:secure_url" content="'+xml(imageUrl)+'">',
    '<meta property="og:image:type" content="image/png">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="JlrHub red tactical D-scan report with actual ship names and counts">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:image" content="'+xml(imageUrl)+'">',
  ].join('\n  ');
  return String(template)
    .replace('<meta property="og:title" content="JLR Shared Intel">','<meta property="og:title" content="'+xml(title)+'">')
    .replace('<meta property="og:description" content="Shared EVE Online D-scan and Local intel hosted by JLR Hub.">','<meta property="og:description" content="'+xml(description)+'">')
    .replace('<meta name="description" content="Shared EVE Online D-scan and Local intel hosted by JLR Hub.">','<meta name="description" content="'+xml(description)+'">')
    .replace('<title>JLR Shared Intel</title>','<title>'+xml(title)+'</title>')
    .replace('</head>','  '+metadata+'\n</head>');
}
