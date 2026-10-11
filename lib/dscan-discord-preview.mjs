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
  out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">');
  out.push('<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#19090e"/><stop offset=".5" stop-color="#080a10"/><stop offset="1" stop-color="#12050b"/></linearGradient><linearGradient id="shine" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#ff335a"/><stop offset="1" stop-color="#a30027"/></linearGradient></defs>');
  out.push('<rect width="1200" height="630" fill="#040407"/><rect x="12" y="12" width="1176" height="606" rx="16" fill="url(#bg)" stroke="#fa234e" stroke-width="3"/>');
  out.push('<path d="M12 175H1188M12 570H1188" stroke="#6c1e31" stroke-width="2"/>');
  // JlrHub wordmark is drawn as vector text so this card never includes an old
  // JLR Tracker logo or a remote image dependency.
  out.push('<circle cx="89" cy="92" r="56" fill="none" stroke="#d81945" stroke-width="3"/><circle cx="89" cy="92" r="45" fill="none" stroke="#602238" stroke-width="3"/><path d="M89 22V45M89 139V162M19 92H39M139 92H158" stroke="#fb2e53" stroke-width="5"/>');
  out.push(label(41,103,'Jlr',{size:48,weight:900,color:'#ffffff'}));
  out.push(label(107,103,'Hub',{size:48,weight:900,color:'#ff214e'}));
  out.push('<path d="M285 38V157" stroke="#84283a" stroke-width="2"/>');
  out.push(label(315,81,'THREAT SCAN',{size:39,weight:900,color:'#fff8fa'}));
  out.push(label(315,125,scan.system,{size:24,weight:800,color:scan.hasSystem?'#ff4770':'#f6ae67',max:80}));
  out.push(label(315,157,'SNAPSHOT '+scan.scannedAt,{size:16,color:'#a6acbb'}));
  out.push('<rect x="921" y="40" width="229" height="112" rx="12" fill="#18060e" stroke="#ff2d59" stroke-width="2"/>');
  out.push(label(948,75,scan.shipCount?'D-SCAN SHIPS':'D-SCAN SHIPS',{size:16,weight:800,color:'#ff466b'}));
  out.push(label(1035,132,number(scan.shipCount),{size:56,weight:900,color:'#ff315a',anchor:'middle'}));
  out.push('<rect x="38" y="197" width="1124" height="47" rx="7" fill="#250b16" stroke="#7e2441"/>');
  out.push(label(70,227,'SHIP TYPE',{size:22,weight:900,color:'#fff'}));
  out.push(label(1098,227,'QTY',{size:22,weight:900,color:'#fff',anchor:'end'}));
  out.push('<path d="M925 197V551" stroke="#41212c" stroke-width="2"/>');
  const visible=scan.ships.slice(0,6);
  if(!visible.length){
    out.push(label(75,305,scan.pilotCount?number(scan.pilotCount)+' local pilots reported; no D-scan ship types':'No recognizable ship types in this snapshot.',{size:23,color:'#ced4df'}));
    if(scan.otherCount)out.push(label(75,352,number(scan.otherCount)+' objects were not classified as ships.',{size:19,color:'#a8a8b8'}));
  }else{
    visible.forEach((ship,index)=>{
      const y=294+index*48;
      if(index%2===1)out.push('<rect x="39" y="'+(y-35)+'" width="1122" height="47" fill="#111017" opacity=".65"/>');
      out.push(label(72,y,ship.name,{size:25,weight:800,color:'#f2f2f6',max:45}));
      out.push(label(390,y,ship.group,{size:20,color:'#9baabc',max:40}));
      out.push(label(1084,y,number(ship.count),{size:26,weight:900,color:ship.role==='mining'?'#f3bd6d':ship.role==='combat'?'#ff4569':'#c9d1e0',anchor:'end'}));
      out.push('<path d="M39 '+(y+13)+'H1161" stroke="#252630"/>');
    });
  }
  if(scan.ships.length>6)out.push(label(75,555,'+'+number(scan.ships.length-6)+' additional ship types on JlrHub',{size:18,color:'#a3b4c5'}));
  if(scan.ships.length<=6&&scan.otherCount)out.push(label(75,555,number(scan.otherCount)+' other / unclassified D-scan objects',{size:17,color:'#9cabbc'}));
  out.push(label(45,598,scan.status,{size:15,weight:850,color:scan.miningCount===scan.shipCount&&scan.shipCount?'#e9c17f':'#f1a2b2',max:84}));
  out.push(label(1148,598,'VIEW ON JLRHUB.COM',{size:17,weight:900,color:'#f3edf2',anchor:'end'}));
  out.push('</svg>');
  return out.join('');
}
export async function renderDiscordScanPng(row){
  // Native modules are not guaranteed in Railway builds. Generate the card
  // deterministically using only Node's bundled PNG/zlib primitives.
  return renderScanPreviewFallbackPng(summarizeDiscordScan(row));
}
export function discordScanDescription(row){
  const scan=summarizeDiscordScan(row);
  const top=scan.ships.slice(0,5).map(item=>number(item.count)+'x '+item.name).join(', ');
  return [
    scan.shipCount?number(scan.shipCount)+' ship contact'+(scan.shipCount===1?'':'s'):'No identified ship contacts',
    top||'No D-scan ship breakdown',
    'Hostility unverified from D-scan.',
    !scan.hasSystem?'System not provided.':'',
  ].filter(Boolean).join(' | ').slice(0,300);
}

// Discord now gets text-only JlrHub metadata. The old large generated
// image is intentionally omitted, keeping the compact top link card only.
export function renderDiscordScanHtml(template,row,{canonicalUrl}){
  const scan=summarizeDiscordScan(row);
  const title='JlrHub | '+(scan.hasSystem?scan.system+' | ':'')+(scan.shipCount?number(scan.shipCount)+' D-scan ships':'Shared scan intel');
  const description=discordScanDescription(row);
  const metadata=[
    '<meta property="og:site_name" content="JlrHub">',
    '<meta property="og:type" content="website">',
    '<meta property="og:url" content="'+xml(canonicalUrl)+'">',
  ].join('\n  ');
  return String(template)
    .replace('<meta property="og:title" content="JLR Shared Intel">','<meta property="og:title" content="'+xml(title)+'">')
    .replace('<meta property="og:description" content="Shared EVE Online D-scan and Local intel hosted by JLR Hub.">','<meta property="og:description" content="'+xml(description)+'">')
    .replace('<meta name="description" content="Shared EVE Online D-scan and Local intel hosted by JLR Hub.">','<meta name="description" content="'+xml(description)+'">')
    .replace('<title>JLR Shared Intel</title>','<title>'+xml(title)+'</title>')
    .replace('</head>','  '+metadata+'\n</head>');
}
