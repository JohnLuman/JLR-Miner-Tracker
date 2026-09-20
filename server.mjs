import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseProbeScan, parseA0Scan, parseIceScan } from './lib/probe-scan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const KEY_FILE = path.join(DATA_DIR, 'token.key');
const SOURCE_FILE = path.join(__dirname, 'source-data.json');
const ENV_FILE = path.join(__dirname, '.env');

await fsp.mkdir(DATA_DIR, { recursive: true });
loadEnv(ENV_FILE);

const PORT = num(process.env.PORT, 3187);
const PUBLIC_URL = String(process.env.PUBLIC_URL || '').trim().replace(/\/$/, '');
const EVE_CLIENT_ID = String(process.env.EVE_CLIENT_ID || '').trim();
const EVE_CLIENT_SECRET = String(process.env.EVE_CLIENT_SECRET || '').trim();
const ESI_USER_AGENT = String(process.env.ESI_USER_AGENT || 'JLR-Miner-Tracker/2.2').trim();
const ESI_COMPAT_DATE = String(process.env.ESI_COMPATIBILITY_DATE || '2026-09-16').trim();
const MINING_SCOPE = 'esi-industry.read_character_mining.v1';
const SKILLS_SCOPE = 'esi-skills.read_skills.v1';
const FITTINGS_SCOPE = 'esi-fittings.read_fittings.v1';
const ASSETS_SCOPE = 'esi-assets.read_assets.v1';
const LOCATION_SCOPE = 'esi-location.read_location.v1';
const MARKET_STRUCTURE_SCOPE = 'esi-markets.structure_markets.v1';
const SEARCH_STRUCTURES_SCOPE = 'esi-search.search_structures.v1';
const READ_STRUCTURES_SCOPE = 'esi-universe.read_structures.v1';
const ESI_SCOPES = [MINING_SCOPE, SKILLS_SCOPE, FITTINGS_SCOPE, ASSETS_SCOPE, LOCATION_SCOPE];
const MARKET_SCOPES = [MARKET_STRUCTURE_SCOPE, SEARCH_STRUCTURES_SCOPE, READ_STRUCTURES_SCOPE];
const MARKET_CHARACTER_NAME = String(process.env.MARKET_CHARACTER_NAME || 'John Leman Raholan').trim();
const MARKET_STRUCTURE_ID_ENV = String(process.env.MARKET_STRUCTURE_ID || '').trim();
const MINING_SKILLS = {
  3386: 'Mining',
  3410: 'Astrogeology',
  17940: 'Mining Barge',
  22551: 'Exhumers',
  90728: 'Mining Exploitation',
  90727: 'Mining Precision',
  29637: 'Industrial Command Ships',
  28374: 'Capital Industrial Ships',
  22552: 'Mining Director',
  22536: 'Mining Foreman',
  37615: 'Command Destroyers',
  16281: 'Ice Harvesting',
};
const MINING_HULLS = new Set(['Hulk','Mackinaw','Skiff','Covetor','Retriever','Procurer','Porpoise','Orca','Rorqual','Outrider']);
const ABYSSAL_STRIP_TYPES = new Map([
  [90467,'Abyssal Modulated Strip Miner'],
  [90487,'Abyssal Modulated Deep Core Strip Miner'],
  [90493,'Abyssal Strip Miner'],
  [90498,'Abyssal Deep Core Strip Miner'],
]);
const dogmaAttributeCache = new Map();
const dogmaAttributePromises = new Map();
const typeLookupPromises = new Map();
const systemLookupPromises = new Map();
const TEN_HOURS = 10 * 60 * 60 * 1000;
const A0_REPORT_TTL = 12 * 60 * 60 * 1000;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const MARKET_REFRESH_MS = 24 * 60 * 60 * 1000;
const ESI_AUTO_REFRESH_MS = 15 * 60 * 1000;
const ESI_AUTO_SPREAD_MS = 12 * 60 * 1000;
const ESI_METADATA_REFRESH_MS = 6 * 60 * 60 * 1000;
// Global cap across automatic + every user's manual sync. This prevents many
// simultaneous users from multiplying ESI concurrency.
const ESI_MAX_CHARACTER_CONCURRENCY = 8;
// Auto-sync starts are spread across the target window. Small installations
// get a wide gap; large installations shrink the gap until this safe floor.
// Above the floor, the cycle naturally takes longer instead of creating a burst.
const ESI_MIN_CHARACTER_START_GAP_MS = 250;
const ESI_MAX_CHARACTER_START_GAP_MS = 30_000;
const ESI_MANUAL_CHARACTER_START_GAP_MS = 500;
const ESI_MAX_RETRIES = 4;
const INIT_ALLIANCE_ID = 1900696668;
const ZKILL_WINDOW_SECONDS = 7 * 24 * 60 * 60;
const ZKILL_CACHE_MS = 15 * 60 * 1000;
const ZKILL_MAX_PAGES = 100;
const ZKILL_PAGE_GAP_MS = 1100;
// Perfect null-sec refine: T2 rigged Tatara + max skills + RX-804 implant.
const MAX_REFINE_YIELD = 0.90628105568;
const ORE_REPROCESSING = {
  Kylixium:{portionSize:100,minerals:{Tritanium:300,Pyerite:200,Mexallon:550}},
  Ueganite:{portionSize:100,minerals:{Tritanium:800,Megacyte:40}},
  Griemeer:{portionSize:100,minerals:{Tritanium:250,Isogen:80}},
  Nocxite:{portionSize:100,minerals:{Tritanium:900,Pyerite:150,Nocxium:105}},
  Hezorime:{portionSize:100,minerals:{Tritanium:2000,Isogen:120,Zydrine:60}},
  // The workbook/app uses "Mordinium"; the live EVE type is "Mordunium".
  Mordinium:{portionSize:100,minerals:{Pyerite:97}},
  // Standard Ytirium: 100 units refine to 240 Isogen; 0.6 m³ per unit.
  Ytirium:{portionSize:100,minerals:{Isogen:240}},
};
const ORE_TYPE_NAME={Mordinium:'Mordunium'};
const REFINING_MINERALS=[...new Set(Object.values(ORE_REPROCESSING).flatMap(x=>Object.keys(x.minerals)))];

// Fountain/Gallente-quarter null-sec ice economics.
// Quantities are the 100% theoretical reprocessing outputs per 1,000 m³ block.
const ICE_REPROCESSING = {
  'Blue Ice IV-Grade':{portionSize:1,volume:1000,products:{'Heavy Water':104,'Liquid Ozone':55,'Strontium Clathrates':1,'Oxygen Isotopes':483}},
  'Glare Crust':{portionSize:1,volume:1000,products:{'Heavy Water':1381,'Liquid Ozone':691,'Strontium Clathrates':35}},
  'Dark Glitter':{portionSize:1,volume:1000,products:{'Heavy Water':691,'Liquid Ozone':1381,'Strontium Clathrates':69}},
  Gelidus:{portionSize:1,volume:1000,products:{'Heavy Water':345,'Liquid Ozone':691,'Strontium Clathrates':104}},
  Krystallos:{portionSize:1,volume:1000,products:{'Heavy Water':173,'Liquid Ozone':691,'Strontium Clathrates':173}},
};
const ICE_PRODUCTS=[...new Set(Object.values(ICE_REPROCESSING).flatMap(x=>Object.keys(x.products)))];
const ICE_TRACK_PAYOUT = {'Blue Ice IV-Grade':0.95,'Glare Crust':0.75,'Dark Glitter':0.75,Gelidus:0.75,Krystallos:0.75};
const TITAN_BRIDGE_RANGE_LY = 6;
const LIGHT_YEAR_METERS = 9.4607304725808e15;
// DOTLAN Fountain systems currently marked with one or more ice belts.
const ICE_FIELD_SYSTEMS = [
  ['LBGI-2',1],['Y-2ANO',1],['J5A-IX',1],['38IA-E',1],['LIWW-P',1],['TU-Y2A',1],
  ['87XQ-0',1],['R-BGSU',3],['9-VO0Q',1],['D-Q04X',1],['Serpentis Prime',1],
  ['CHA2-Q',1],['G95F-H',1],['IGE-RI',1],['KCT-0A',1],['9D6O-M',1],
  ['L-1SW8',3],['BYXF-Q',1],['C-C99Z',1],
];
const JITA_REGION_ID = 10000002;
const JITA_SYSTEM_ID = 30000142;
const JITA_44_STATION_ID = 60003760;
const FOUNTAIN_REGION_ID = 10000058;
const CN_SYSTEM_NAME = 'C-N4OD';
const MARKET_STRUCTURE_SEARCH = String(process.env.MARKET_STRUCTURE_SEARCH || CN_SYSTEM_NAME).trim();
const source = JSON.parse(await fsp.readFile(SOURCE_FILE, 'utf8'));
const ORES = source.ores.map((o, rankIndex) => ({
  rank: rankIndex + 1,
  name: o.name,
  upgrade: o.upgrade,
  jbvPerM3: Number(o.jbvPerM3),
  siteJBV: Number(o.siteJBV),
  siteM3: Number(o.siteM3),
  systems: [...o.systems],
}));
const TREND_ONLY_ORES = ['Ytirium'];
const MARKET_ORE_NAMES = [...new Set([...ORES.map(o=>o.name),...TREND_ONLY_ORES])];
const SYSTEM_DEFS = ORES.flatMap((o) => o.systems.map((system, order) => ({
  system, ore: o.name, rank: o.rank, order, jbvPerM3: o.jbvPerM3, siteJBV: o.siteJBV, siteM3: o.siteM3,
})));
const SYSTEM_MAP = new Map(SYSTEM_DEFS.map((x) => [x.system, x]));
const oauthStates = new Map();
const sseClients = new Set();
let ssoMetadata = null;
let ssoMetadataAt = 0;
let syncInProgress = false;
let manualSyncCount = 0;
let marketRefreshInProgress = false;
let state = await loadState();
const tokenKey = await loadTokenKey();
const sessionSecret = crypto.createHash('sha256').update(process.env.SESSION_SECRET || tokenKey).digest();
const characterSyncPromises = new Map();
const characterAccessPromises = new Map();
const userSyncPromises = new Map();
const ledgerRowsByCharacter = new Map();
const universeNameCache = new Map();
let zkillInitLeaderboardCache = { updatedAt:0, data:null, promise:null };
const zkillCorpLeaderboardCache = new Map();
const zkillCorpStatsCache = new Map();
let esiCharacterSyncActive = 0;
const esiCharacterSyncWaiters = [];
let esiBackoffUntil = 0;

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('='); if (i < 1) continue;
    const k = line.slice(0, i).trim(); let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
function num(v, fallback) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(v, min, max, fallback) { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
function now() { return new Date().toISOString(); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0))); }
function dateUTC(d = new Date()) { return d.toISOString().slice(0, 10); }
function mondayUTC(d = new Date()) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const dow = x.getUTCDay(); x.setUTCDate(x.getUTCDate() - (dow === 0 ? 6 : dow - 1)); return dateUTC(x); }
function b64url(v) { return Buffer.from(v).toString('base64url'); }
function randomId(bytes = 24) { return crypto.randomBytes(bytes).toString('base64url'); }

function freshState() {
  return {
    version: 2,
    createdAt: now(),
    users: {},
    characters: {},
    scans: {},
    fields: Object.fromEntries(SYSTEM_DEFS.map((d) => [d.system, {
      status: 'ready', cherryPicked: false, timerEndsAt: null, notes: [], updatedAt: null,
      autoReopenedAt: null, autoReopenReason: null, autoReopenM3: null,
    }])),
    esi: {
      typeCache: {}, systemCache: {}, dailyFleet: [], ledgerActivity: {}, ledgerFieldSnapshots: {}, lastSyncAt: null, lastError: null,
    },
    market: {
      prices: {}, minerals: {}, icePrices: {}, iceProducts: {}, iceFields: [], a0Fields: [], a0Reports: {}, a0ScannedAt: null, t3Distances: {}, history: { ore:{}, ice:{} }, lastUpdatedAt: null, lastError: null,
      characterId: null, characterName: null, refreshTokenEnc: null, scopes: [], authorizedAt: null,
      structureId: null, structureName: null, privateLastError: null,
    },
  };
}
async function loadState() {
  try {
    const parsed = JSON.parse(await fsp.readFile(STATE_FILE, 'utf8'));
    const base = freshState();
    parsed.version = 2;
    parsed.users ||= {};
    parsed.characters ||= {};
    parsed.scans ||= {};
    parsed.fields ||= {};
    for (const d of SYSTEM_DEFS) {
      const field = parsed.fields[d.system] = { ...base.fields[d.system], ...(parsed.fields[d.system] || {}) };
      if (!Array.isArray(field.notes)) field.notes = [];
      if (field.note && !field.notes.length) field.notes.push({ id: randomId(8), text: String(field.note), createdAt: field.updatedAt || now() });
      delete field.note;
    }
    parsed.esi = { ...base.esi, ...(parsed.esi || {}) };
    parsed.esi.typeCache ||= {}; parsed.esi.systemCache ||= {}; parsed.esi.dailyFleet ||= []; parsed.esi.ledgerActivity ||= {}; parsed.esi.ledgerFieldSnapshots ||= {};
    parsed.market = { ...base.market, ...(parsed.market || {}) };
    parsed.market.prices ||= {};
    parsed.market.minerals ||= {};
    parsed.market.icePrices ||= {};
    parsed.market.iceProducts ||= {};
    parsed.market.iceFields ||= [];
    parsed.market.a0Fields ||= [];
    parsed.market.a0Reports ||= {};
    parsed.market.a0ScannedAt ||= null;
    parsed.market.t3Distances ||= {};
    parsed.market.history ||= {ore:{},ice:{}};
    parsed.market.history.ore ||= {};
    parsed.market.history.ice ||= {};
    return parsed;
  } catch {
    const x = freshState();
    await writeState(x); return x;
  }
}
async function writeState(value = state) {
  const tmp = `${STATE_FILE}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fsp.rename(tmp, STATE_FILE);
}
let saveChain = Promise.resolve();
function save() { saveChain = saveChain.then(() => writeState()).catch(console.error); return saveChain; }

async function loadTokenKey() {
  const env = String(process.env.TOKEN_ENCRYPTION_KEY || '').trim();
  if (env) return crypto.createHash('sha256').update(env).digest();
  try { const raw = await fsp.readFile(KEY_FILE); if (raw.length === 32) return raw; } catch {}
  const key = crypto.randomBytes(32); await fsp.writeFile(KEY_FILE, key, { mode: 0o600 }); return key;
}
function encrypt(text) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', tokenKey, iv);
  const body = Buffer.concat([c.update(String(text), 'utf8'), c.final()]); const tag = c.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${body.toString('base64url')}`;
}
function decrypt(blob) {
  const [i, t, b] = String(blob || '').split('.');
  const d = crypto.createDecipheriv('aes-256-gcm', tokenKey, Buffer.from(i, 'base64url'));
  d.setAuthTag(Buffer.from(t, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(b, 'base64url')), d.final()]).toString('utf8');
}

function requestBaseUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`).split(',')[0].trim();
  return `${proto}://${host}`;
}
function callbackUrl(req) { return `${requestBaseUrl(req)}/auth/eve/callback`; }
function parseCookies(req) {
  const out = {}; for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function signSession(userId) {
  const payload = b64url(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL }));
  const sig = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function readSession(req) {
  const raw = parseCookies(req).jlr_session; if (!raw) return null;
  const [payload, sig] = raw.split('.'); if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expected); if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const x = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); if (x.exp < Date.now() || !state.users[x.uid]) return null; return state.users[x.uid]; } catch { return null; }
}
function setSessionCookie(res, userId, req) {
  const secure = requestBaseUrl(req).startsWith('https://') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `jlr_session=${encodeURIComponent(signSession(userId))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL/1000)}${secure}`);
}
function clearSessionCookie(res, req) {
  const secure = requestBaseUrl(req).startsWith('https://') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `jlr_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}
function requireUser(req, res) { const user = readSession(req); if (!user) { json(res, 401, { error: 'LOGIN_REQUIRED' }); return null; } return user; }
function sameOrigin(req) {
  const origin = req.headers.origin; if (!origin) return true;
  try { return new URL(origin).origin === new URL(requestBaseUrl(req)).origin; } catch { return false; }
}

function json(res, status, obj, extra = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Content-Length':Buffer.byteLength(body), ...extra }); res.end(body);
}
function text(res, status, body, type='text/plain; charset=utf-8') { res.writeHead(status, { 'Content-Type':type, 'Cache-Control':'no-store', 'Content-Length':Buffer.byteLength(body) }); res.end(body); }
function redirect(res, location) { res.writeHead(302, { Location:location, 'Cache-Control':'no-store' }); res.end(); }
async function readBody(req, max=1_000_000) {
  return await new Promise((resolve,reject)=>{let n=0;const chunks=[];req.on('data',c=>{n+=c.length;if(n>max){reject(new Error('Request too large'));req.destroy();}else chunks.push(c)});req.on('end',()=>{if(!chunks.length)return resolve({});try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject)});
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://images.evetech.net https://web.ccpgamescdn.com data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self' https://login.eveonline.com; frame-ancestors 'none'");
}

function resetExpired(broadcastIt=true) {
  let changed=false; const t=Date.now();
  for (const [system,f] of Object.entries(state.fields)) {
    if (f.status==='cleared' && f.timerEndsAt && Date.parse(f.timerEndsAt)<=t) {
      f.status='ready'; f.cherryPicked=false; f.timerEndsAt=null; f.notes=[]; f.updatedAt=now();
      f.autoReopenedAt=null; f.autoReopenReason=null; f.autoReopenM3=null; changed=true;
    }
  }
  if (changed) { save(); if (broadcastIt) broadcast(); }
}
function effectiveJbvPerM3(oreName) {
  const live=Number(state.market?.prices?.[oreName]?.jita?.buyPerM3);
  if(Number.isFinite(live)&&live>0)return live;
  return Number(ORES.find(o=>o.name===oreName)?.jbvPerM3||0);
}
function effectiveOres() {
  return ORES.map(o=>{
    const market=state.market?.prices?.[o.name]||null;
    const jbvPerM3=effectiveJbvPerM3(o.name);
    return {
      ...o,
      jbvPerM3,
      siteJBV:jbvPerM3*Number(o.siteM3||0),
      market,
    };
  });
}
function effectiveSystems(ores=effectiveOres()) {
  const byName=new Map(ores.map(o=>[o.name,o]));
  return SYSTEM_DEFS.map(d=>{
    const ore=byName.get(d.ore);
    return {
      ...d,
      distanceLy:typeof state.market?.t3Distances?.[d.system]==='number'&&Number.isFinite(state.market.t3Distances[d.system])?state.market.t3Distances[d.system]:null,
      jbvPerM3:Number(ore?.jbvPerM3||d.jbvPerM3),
      siteJBV:Number(ore?.siteJBV||d.siteJBV),
    };
  });
}
function scanActivityPublic() {
  const out={};
  const at=Date.now();
  const add=(system,row)=>{
    const lastScanAt=row?.lastScanAt||row?.lastCheckedAt||null;
    if(!lastScanAt)return;
    const ms=Date.parse(lastScanAt);
    out[system]={
      lastScanAt,
      due:!Number.isFinite(ms)||at-ms>=A0_REPORT_TTL,
      nextUpdateAt:Number.isFinite(ms)?new Date(ms+A0_REPORT_TTL).toISOString():null,
      scannerRowCount:Number(row?.scannerRowCount)||0,
      kinds:Array.isArray(row?.kinds)?row.kinds:[],
      ice:row?.ice&&Number(row.ice.expected)>0?{
        expected:Number(row.ice.expected),
        seen:Math.max(0,Number(row.ice.seen)||0),
        missing:Math.max(0,Number(row.ice.missing)||0),
      }:null,
    };
  };
  for(const [system,row] of Object.entries(state.scans||{}))add(system,row);
  for(const [system,row] of Object.entries(state.market?.a0Reports||{})){
    if(!out[system])add(system,row);
  }
  // A RED T3 field was necessarily reported clear at field.updatedAt. Treat that
  // clear report as a scan timestamp so older RED cards never show SCAN • NEVER.
  for(const [system,field] of Object.entries(state.fields||{})){
    if(field?.status!=='cleared'||!field.updatedAt)continue;
    const clearedMs=Date.parse(field.updatedAt);
    if(!Number.isFinite(clearedMs))continue;
    const existingMs=Date.parse(out[system]?.lastScanAt||'');
    if(!Number.isFinite(existingMs)||clearedMs>existingMs){
      add(system,{lastScanAt:field.updatedAt,scannerRowCount:0,kinds:['t3'],source:'clear-report'});
    }
  }
  return out;
}

function a0PublicFields() {
  const rows=new Map((state.market?.a0Fields||[]).map(row=>[row.system,{...row}]));
  for(const [system,report] of Object.entries(state.market?.a0Reports||{})){
    if(!report||!(Number(report.distanceLy)<=TITAN_BRIDGE_RANGE_LY))continue;
    if(!rows.has(system)){
      rows.set(system,{
        system,
        systemId:Number(report.systemId)||null,
        distanceLy:Number(report.distanceLy),
        security:Number(report.security),
        starId:Number(report.starId)||null,
        spectralClass:String(report.spectralClass||'A0'),
        eligibility:'Probe Scanner confirmed A0 Rare Asteroids',
        discoveredByScan:true,
      });
    }
  }
  const at=Date.now();
  return [...rows.values()].map(row=>{
    const report=state.market?.a0Reports?.[row.system]||null;
    const checkedAt=report?.lastCheckedAt||null;
    const checkedMs=Date.parse(checkedAt||'');
    const due=!Number.isFinite(checkedMs)||at-checkedMs>=A0_REPORT_TTL;
    const nextUpdateAt=Number.isFinite(checkedMs)?new Date(checkedMs+A0_REPORT_TTL).toISOString():null;
    return {
      ...row,
      scan:{
        status:due?'needs-update':report?.detected?'active':'clear',
        due,
        detected:Boolean(report?.detected),
        lastCheckedAt:checkedAt,
        nextUpdateAt,
        siteName:report?.siteName||null,
        scannerRowCount:Number(report?.scannerRowCount)||0,
        reportedBy:report?.reportedBy||null,
      },
    };
  }).sort((a,b)=>Number(a.distanceLy)-Number(b.distanceLy)||a.system.localeCompare(b.system));
}

function publicState() {
  resetExpired(false);
  const daily = state.esi.dailyFleet;
  const today = dateUTC(); const weekStart = mondayUTC();
  const sum = (predicate) => daily.filter(predicate).reduce((a,x)=>({m3:a.m3+Number(x.m3||0),jbv:a.jbv+Number(x.jbv||0)}),{m3:0,jbv:0});
  const todayActual = sum(x=>x.date===today); const weekActual = sum(x=>x.date>=weekStart);
  const marketOres=effectiveOres();
  const marketSystems=effectiveSystems(marketOres);
  return {
    app:{name:'JLR Miner Tracker',version:'2.3.78',systemCount:SYSTEM_DEFS.length,privacy:'Shared field state, system scan timestamps, and fleet-level mining totals only. Character location is read during Probe Scanner import; the character location itself is not retained.'},
    source:{respawnHours:10,presetOutputs:source.presetOutputs,yieldCalculator:source.yieldCalculator,ores:marketOres,trendOres:TREND_ONLY_ORES.map(name=>({name,market:state.market.prices?.[name]||null})),systems:marketSystems,ice:Object.entries(ICE_REPROCESSING).map(([name,recipe])=>({name,volume:recipe.volume,recipe,market:state.market.icePrices?.[name]||null})),iceFields:state.market.iceFields||[],a0Fields:a0PublicFields(),a0ScannedAt:state.market.a0ScannedAt||null,a0ReportHours:A0_REPORT_TTL/3600000},
    fields:state.fields,
    scans:scanActivityPublic(),
    market:{lastUpdatedAt:state.market.lastUpdatedAt,lastError:state.market.lastError,privateLastError:state.market.privateLastError||null,refreshing:marketRefreshInProgress,valuation:'MAX REFINE',maxRefineYield:MAX_REFINE_YIELD,jita:'Jita IV - Moon 4 - Caldari Navy Assembly Plant',local:CN_SYSTEM_NAME,titanBridgeRangeLy:TITAN_BRIDGE_RANGE_LY,history:marketHistoryPublic(),privateAccess:Boolean(state.market.refreshTokenEnc),marketCharacterName:state.market.characterName||null,structureName:state.market.structureName||null},
    esi:{configured:Boolean(EVE_CLIENT_ID),linkedCharacters:Object.keys(state.characters).length,lastSyncAt:state.esi.lastSyncAt,lastError:state.esi.lastError,syncing:syncInProgress||manualSyncCount>0,scheduler:{...autoSyncPlan(Object.keys(state.characters).length||1),active:esiCharacterSyncActive,queued:esiCharacterSyncWaiters.length,backoffUntil:esiBackoffUntil>Date.now()?new Date(esiBackoffUntil).toISOString():null},actual:{today:todayActual,week:weekActual}},
    serverNow:now(),
  };
}
function broadcast() {
  const msg=`event: state\ndata: ${JSON.stringify(publicState())}\n\n`;
  for (const res of [...sseClients]) { try{res.write(msg)}catch{sseClients.delete(res)} }
}

async function getSsoMetadata() {
  if (ssoMetadata && Date.now()-ssoMetadataAt<300_000) return ssoMetadata;
  const r=await fetch('https://login.eveonline.com/.well-known/oauth-authorization-server',{headers:{'User-Agent':ESI_USER_AGENT}}); if(!r.ok)throw new Error(`SSO metadata ${r.status}`);
  ssoMetadata=await r.json(); ssoMetadataAt=Date.now(); return ssoMetadata;
}
async function startMarketSso(req,res,url) {
  if(!EVE_CLIENT_ID)return redirect(res,'/?error=sso-not-configured');
  const user=readSession(req);
  if(!user)return redirect(res,'/?error=login-required');
  const requestedId=String(url.searchParams.get('character')||'');
  const character=state.characters[requestedId];
  if(!requestedId||!user.characterIds.includes(requestedId)||!character)return redirect(res,'/?error=market-character-not-linked');
  if(String(character.name)!==MARKET_CHARACTER_NAME)return redirect(res,'/?error=market-character-not-allowed');

  const meta=await getSsoMetadata();
  const stateId=randomId();
  const verifier=EVE_CLIENT_SECRET?'':randomId(32);
  const redirectUri=callbackUrl(req);
  oauthStates.set(stateId,{
    intent:'market',
    userId:user.id,
    expectedCharacterId:requestedId,
    verifier,
    redirectUri,
    createdAt:Date.now(),
  });
  for(const [k,v] of oauthStates)if(Date.now()-v.createdAt>15*60_000)oauthStates.delete(k);

  const u=new URL(meta.authorization_endpoint||'https://login.eveonline.com/v2/oauth/authorize');
  u.searchParams.set('response_type','code');
  u.searchParams.set('client_id',EVE_CLIENT_ID);
  u.searchParams.set('redirect_uri',redirectUri);
  u.searchParams.set('scope',MARKET_SCOPES.join(' '));
  u.searchParams.set('state',stateId);
  if(!EVE_CLIENT_SECRET){
    const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
    u.searchParams.set('code_challenge',challenge);
    u.searchParams.set('code_challenge_method','S256');
  }
  redirect(res,u.toString());
}

async function startSso(req,res,url) {
  if (!EVE_CLIENT_ID) return redirect(res,'/?error=sso-not-configured');
  const user=readSession(req); const intent=url.searchParams.get('intent')==='link'?'link':'login';
  if (intent==='link' && !user) return redirect(res,'/?error=login-required');
  const meta=await getSsoMetadata(); const stateId=randomId(); const verifier=EVE_CLIENT_SECRET?'':randomId(32); const redirectUri=callbackUrl(req);
  oauthStates.set(stateId,{intent,userId:user?.id||null,verifier,redirectUri,createdAt:Date.now()});
  for(const [k,v] of oauthStates)if(Date.now()-v.createdAt>15*60_000)oauthStates.delete(k);
  const u=new URL(meta.authorization_endpoint||'https://login.eveonline.com/v2/oauth/authorize');
  u.searchParams.set('response_type','code');u.searchParams.set('client_id',EVE_CLIENT_ID);u.searchParams.set('redirect_uri',redirectUri);u.searchParams.set('scope',ESI_SCOPES.join(' '));u.searchParams.set('state',stateId);
  if(!EVE_CLIENT_SECRET){const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');u.searchParams.set('code_challenge',challenge);u.searchParams.set('code_challenge_method','S256')}
  redirect(res,u.toString());
}
async function exchangeCode(code,pending) {
  const meta=await getSsoMetadata(); const body=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:pending.redirectUri});
  const headers={'Content-Type':'application/x-www-form-urlencoded','User-Agent':ESI_USER_AGENT};
  if(EVE_CLIENT_SECRET) headers.Authorization=`Basic ${Buffer.from(`${EVE_CLIENT_ID}:${EVE_CLIENT_SECRET}`).toString('base64')}`;
  else {body.set('client_id',EVE_CLIENT_ID);body.set('code_verifier',pending.verifier)}
  const r=await fetch(meta.token_endpoint||'https://login.eveonline.com/v2/oauth/token',{method:'POST',headers,body}); const p=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(p.error_description||p.error||`Token exchange ${r.status}`); return p;
}
async function refreshToken(refresh) {
  const meta=await getSsoMetadata(); const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh}); const headers={'Content-Type':'application/x-www-form-urlencoded','User-Agent':ESI_USER_AGENT};
  if(EVE_CLIENT_SECRET) headers.Authorization=`Basic ${Buffer.from(`${EVE_CLIENT_ID}:${EVE_CLIENT_SECRET}`).toString('base64')}`; else body.set('client_id',EVE_CLIENT_ID);
  const r=await fetch(meta.token_endpoint||'https://login.eveonline.com/v2/oauth/token',{method:'POST',headers,body}); const p=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(p.error_description||p.error||`Token refresh ${r.status}`); return p;
}
async function verifyJwt(token,requireMining=true) {
  const parts=String(token).split('.'); if(parts.length!==3)throw new Error('Invalid JWT');
  const header=JSON.parse(Buffer.from(parts[0],'base64url').toString()); const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());
  const meta=await getSsoMetadata(); const r=await fetch(meta.jwks_uri,{headers:{'User-Agent':ESI_USER_AGENT}}); if(!r.ok)throw new Error(`JWKS ${r.status}`); const jwks=await r.json();
  const jwk=(jwks.keys||[]).find(k=>k.kid===header.kid&&(!header.alg||k.alg===header.alg)); if(!jwk)throw new Error('No matching EVE signing key');
  const key=crypto.createPublicKey({key:jwk,format:'jwk'}); const ok=crypto.verify('RSA-SHA256',Buffer.from(`${parts[0]}.${parts[1]}`),key,Buffer.from(parts[2],'base64url')); if(!ok)throw new Error('Bad JWT signature');
  if(claims.exp*1000<=Date.now())throw new Error('JWT expired'); if(!['https://login.eveonline.com/','https://login.eveonline.com','login.eveonline.com'].includes(claims.iss))throw new Error('Unexpected JWT issuer');
  const aud=Array.isArray(claims.aud)?claims.aud:[claims.aud]; if(!aud.includes('EVE Online')||!aud.includes(EVE_CLIENT_ID))throw new Error('Unexpected JWT audience');
  const scopes=Array.isArray(claims.scp)?claims.scp:String(claims.scp||'').split(' ').filter(Boolean); if(requireMining&&!scopes.includes(MINING_SCOPE))throw new Error('Mining scope missing');
  const m=String(claims.sub||'').match(/CHARACTER:EVE:(\d+)/); if(!m)throw new Error('Character ID missing');
  return{characterId:m[1],characterName:claims.name||`Character ${m[1]}`,scopes};
}
async function handleCallback(req,res,url) {
  const stateId=url.searchParams.get('state'); const pending=stateId?oauthStates.get(stateId):null; const code=url.searchParams.get('code');
  if(!pending||!code)return redirect(res,'/?error=sso-state'); oauthStates.delete(stateId);
  try{
    const tokens=await exchangeCode(code,pending);
    const identity=await verifyJwt(tokens.access_token,pending.intent!=='market');
    const charId=String(identity.characterId);

    if(pending.intent==='market'){
      const user=state.users[pending.userId];
      if(!user)throw new Error('Market authorization session expired');
      if(charId!==String(pending.expectedCharacterId||''))throw new Error('Authorize the selected John character only');
      const linked=state.characters[charId];
      if(!linked||linked.ownerUserId!==user.id||linked.name!==MARKET_CHARACTER_NAME)throw new Error('This character is not the configured market character');
      for(const scope of MARKET_SCOPES)if(!identity.scopes.includes(scope))throw new Error(`Market scope missing: ${scope}`);
      state.market.characterId=charId;
      state.market.characterName=identity.characterName;
      state.market.refreshTokenEnc=encrypt(tokens.refresh_token);
      state.market.scopes=identity.scopes;
      state.market.authorizedAt=now();
      state.market.lastError=null;
      await save();
      setSessionCookie(res,user.id,req);
      setTimeout(()=>refreshMarketPrices(true).catch(console.error),250);
      return redirect(res,'/?market=authorized');
    }

    let user;
    if(pending.intent==='link'){
      user=state.users[pending.userId]; if(!user)throw new Error('Link session expired');
      const existing=state.characters[charId]; if(existing&&existing.ownerUserId!==user.id)throw new Error('That character is already linked to another JLR account');
    }else{
      const existing=state.characters[charId];
      if(existing?.ownerUserId&&state.users[existing.ownerUserId]) user=state.users[existing.ownerUserId];
      else {const id=`u_${randomId(12)}`; user=state.users[id]={id,displayName:identity.characterName,primaryCharacterId:charId,characterIds:[],createdAt:now(),lastLoginAt:now()};}
    }
    const old=state.characters[charId]; state.characters[charId]={
      characterId:charId,
      name:identity.characterName,
      ownerUserId:user.id,
      refreshTokenEnc:encrypt(tokens.refresh_token),
      scopes:identity.scopes,
      connectedAt:old?.connectedAt||now(),
      lastSyncAt:old?.lastSyncAt||null,
      lastError:null,
      skills:old?.skills||{},
      skillsUpdatedAt:old?.skillsUpdatedAt||null,
      fittings:old?.fittings||[],
      fittingsUpdatedAt:old?.fittingsUpdatedAt||null,
      savedFittingsCount:old?.savedFittingsCount||0,
      abyssalStripCount:old?.abyssalStripCount||0,
      assetsUpdatedAt:old?.assetsUpdatedAt||null,
    };
    if(!user.characterIds.includes(charId))user.characterIds.push(charId); user.lastLoginAt=now(); if(!user.primaryCharacterId)user.primaryCharacterId=charId;
    await save();setSessionCookie(res,user.id,req);setTimeout(()=>syncUserCharacters(user,[charId]).catch(console.error),250);return redirect(res,pending.intent==='link'?'/?linked=1':'/?login=1');
  }catch(err){console.error('SSO callback',err);return redirect(res,`/?error=${encodeURIComponent(String(err.message||err).slice(0,120))}`)}
}

async function waitForEsiBackoff(){
  const delay=esiBackoffUntil-Date.now();
  if(delay>0)await sleep(delay);
}
function extendEsiBackoff(ms){
  const duration=Math.max(0,Number(ms)||0);
  if(duration>0)esiBackoffUntil=Math.max(esiBackoffUntil,Date.now()+duration);
}
function observeEsiErrorLimit(headers){
  const remain=Number(headers?.get?.('x-esi-error-limit-remain'));
  const reset=Number(headers?.get?.('x-esi-error-limit-reset'));
  if(Number.isFinite(remain)&&remain<=10&&Number.isFinite(reset)&&reset>0){
    extendEsiBackoff(Math.min(15*60*1000,reset*1000)+Math.floor(Math.random()*500));
  }
}
async function esiRequest(url,options={}) {
  for(let attempt=0;attempt<=ESI_MAX_RETRIES;attempt++){
    await waitForEsiBackoff();
    let r;
    try{
      r=await fetch(url,options);
    }catch(err){
      if(attempt>=ESI_MAX_RETRIES)throw err;
      await sleep(Math.min(8_000,500*(2**attempt))+Math.floor(Math.random()*250));
      continue;
    }
    observeEsiErrorLimit(r.headers);
    if(r.status===420||r.status===429){
      const errorReset=Number(r.headers.get('x-esi-error-limit-reset'));
      const retrySeconds=clamp(r.headers.get('retry-after'),1,15*60,Number.isFinite(errorReset)&&errorReset>0?errorReset:5);
      extendEsiBackoff(retrySeconds*1000+Math.floor(Math.random()*500));
      if(attempt>=ESI_MAX_RETRIES)throw new Error(`ESI ${r.status}: rate limited; retry after ${retrySeconds}s`);
      await waitForEsiBackoff();
      continue;
    }
    if([502,503,504].includes(r.status)&&attempt<ESI_MAX_RETRIES){
      await sleep(Math.min(8_000,500*(2**attempt))+Math.floor(Math.random()*250));
      continue;
    }
    if(!r.ok){
      const group=r.headers.get('x-ratelimit-group');
      const remaining=r.headers.get('x-ratelimit-remaining');
      const suffix=group?` [${group}${remaining!==null?`, ${remaining} tokens remaining`:''}]`:'';
      throw new Error(`ESI ${r.status}${suffix}: ${(await r.text().catch(()=>'' )).slice(0,160)}`);
    }
    return{data:await r.json(),headers:r.headers};
  }
  throw new Error('ESI request failed after retries');
}
async function esiGet(url,access=null) {
  const headers={'Accept':'application/json','User-Agent':ESI_USER_AGENT,'X-Compatibility-Date':ESI_COMPAT_DATE}; if(access)headers.Authorization=`Bearer ${access}`;
  return esiRequest(url,{headers});
}
async function esiPost(url,body,access=null) {
  const headers={'Accept':'application/json','Content-Type':'application/json','User-Agent':ESI_USER_AGENT,'X-Compatibility-Date':ESI_COMPAT_DATE};
  if(access)headers.Authorization=`Bearer ${access}`;
  return esiRequest(url,{method:'POST',headers,body:JSON.stringify(body)});
}
async function resolveUniverseIds(names) {
  const uniqueNames=[...new Set((Array.isArray(names)?names:[])
    .map(name=>String(name||'').trim())
    .filter(Boolean))];
  if(!uniqueNames.length)return new Map();
  const {data}=await esiPost('https://esi.evetech.net/latest/universe/ids/?datasource=tranquility',uniqueNames);
  const out=new Map();
  for(const group of Object.values(data||{})){
    if(!Array.isArray(group))continue;
    for(const row of group)if(row?.name&&row?.id!==undefined)out.set(String(row.name),Number(row.id));
  }
  return out;
}
async function marketOrders(regionId,typeId) {
  const base=`https://esi.evetech.net/latest/markets/${regionId}/orders/?datasource=tranquility&order_type=all&type_id=${typeId}`;
  const first=await esiGet(`${base}&page=1`);
  let rows=[...first.data];
  const pages=Math.max(1,Number(first.headers.get('x-pages')||1));
  for(let page=2;page<=pages;page++)rows.push(...(await esiGet(`${base}&page=${page}`)).data);
  return rows;
}
async function structureMarketOrders(structureId,access) {
  const base=`https://esi.evetech.net/latest/markets/structures/${structureId}/?datasource=tranquility`;
  const first=await esiGet(`${base}&page=1`,access);
  let rows=[...first.data];
  const pages=Math.max(1,Number(first.headers.get('x-pages')||1));
  for(let page=2;page<=pages;page++)rows.push(...(await esiGet(`${base}&page=${page}`,access)).data);
  return rows;
}
async function structureInfo(structureId,access) {
  return (await esiGet(`https://esi.evetech.net/latest/universe/structures/${structureId}/?datasource=tranquility`,access)).data;
}
async function searchStructures(characterId,query,access) {
  const q=new URLSearchParams({
    categories:'structure',
    datasource:'tranquility',
    language:'en',
    search:String(query),
    strict:'false',
  });
  const {data}=await esiGet(`https://esi.evetech.net/latest/characters/${characterId}/search/?${q}`,access);
  return Array.isArray(data?.structure)?data.structure.map(String):[];
}
async function marketAccessToken() {
  if(!state.market?.refreshTokenEnc||!state.market.characterId)return null;
  const tokens=await refreshToken(decrypt(state.market.refreshTokenEnc));
  const identity=await verifyJwt(tokens.access_token,false);
  if(String(identity.characterId)!==String(state.market.characterId))throw new Error('Market token changed character');
  for(const scope of MARKET_SCOPES)if(!identity.scopes.includes(scope))throw new Error(`Market scope missing: ${scope}`);
  if(tokens.refresh_token)state.market.refreshTokenEnc=encrypt(tokens.refresh_token);
  state.market.scopes=identity.scopes;
  state.market.characterName=identity.characterName;
  return{access:tokens.access_token,identity};
}
async function resolveMarketStructure(cnSystemId,marketAccess,targetTypeIds=[]) {
  if(!marketAccess)return null;
  const candidates=[];

  const pinned=String(state.market.structureId||MARKET_STRUCTURE_ID_ENV||'').trim();
  if(pinned)candidates.push(pinned);

  if(!pinned){
    const terms=[MARKET_STRUCTURE_SEARCH,CN_SYSTEM_NAME].filter((x,i,a)=>x&&a.indexOf(x)===i);
    for(const term of terms){
      try{
        for(const id of await searchStructures(state.market.characterId,term,marketAccess.access))if(!candidates.includes(id))candidates.push(id);
      }catch(err){console.warn('Structure search failed',term,String(err.message||err))}
    }
  }

  const inSystem=[];
  for(const id of candidates.slice(0,30)){
    try{
      const info=await structureInfo(id,marketAccess.access);
      if(Number(info.solar_system_id)===Number(cnSystemId))inSystem.push({id:String(id),name:String(info.name||id)});
    }catch{}
  }
  if(!inSystem.length)return null;

  let selected=inSystem[0],selectedOrders=null,bestScore=-1;
  for(const row of inSystem){
    try{
      const orders=await structureMarketOrders(row.id,marketAccess.access);
      const score=orders.filter(o=>targetTypeIds.includes(Number(o.type_id))).length;
      if(score>bestScore){bestScore=score;selected=row;selectedOrders=orders}
    }catch(err){console.warn('Structure market candidate failed',row.name,String(err.message||err))}
  }
  if(bestScore<0)return null;
  state.market.structureId=selected.id;
  state.market.structureName=selected.name;
  return{...selected,orders:selectedOrders||[]};
}
function bestOrderPrices(orders=[]) {
  let buy=null,sell=null;
  for(const row of orders){
    const price=Number(row.price);
    if(!Number.isFinite(price)||price<=0)continue;
    if(row.is_buy_order){
      if(buy===null||price>buy)buy=price;
    }else if(sell===null||price<sell)sell=price;
  }
  return{buy,sell};
}
const routeJumpCache=new Map();
async function routeJumps(originSystemId,destinationSystemId){
  const a=Number(originSystemId),b=Number(destinationSystemId);
  if(a===b)return 0;
  const key=`${a}:${b}`;
  if(routeJumpCache.has(key))return routeJumpCache.get(key);
  try{
    const {data}=await esiGet(`https://esi.evetech.net/latest/route/${a}/${b}/?datasource=tranquility&flag=shortest`);
    const jumps=Math.max(0,(Array.isArray(data)?data.length:0)-1);
    routeJumpCache.set(key,jumps);
    return jumps;
  }catch{
    routeJumpCache.set(key,Infinity);
    return Infinity;
  }
}
async function bestPricesReachableAt(orders,targetSystemId,targetLocationId){
  let sell=null;
  for(const row of orders){
    if(row.is_buy_order)continue;
    if(Number(row.location_id)!==Number(targetLocationId))continue;
    const price=Number(row.price);
    if(Number.isFinite(price)&&price>0&&(sell===null||price<sell))sell=price;
  }

  const buys=orders
    .filter(row=>row.is_buy_order&&Number.isFinite(Number(row.price))&&Number(row.price)>0)
    .sort((a,b)=>Number(b.price)-Number(a.price));
  let buy=null;
  for(const row of buys){
    const range=String(row.range||'station');
    const sameStation=Number(row.location_id)===Number(targetLocationId);
    const sameSystem=Number(row.system_id)===Number(targetSystemId);
    let reachable=false;
    if(range==='station')reachable=sameStation;
    else if(range==='solarsystem')reachable=sameSystem;
    else if(range==='region')reachable=true;
    else{
      const jumpRange=Number(range);
      if(Number.isFinite(jumpRange)){
        const jumps=sameSystem?0:await routeJumps(row.system_id,targetSystemId);
        reachable=jumps<=jumpRange;
      }
    }
    if(reachable){buy=Number(row.price);break}
  }
  return{buy,sell};
}
function refinedOreValue(oreName,oreVolume,priceByMineral) {
  const recipe=ORE_REPROCESSING[oreName];
  if(!recipe||!(oreVolume>0))return null;
  let grossPerBatch=0;
  const breakdown={};
  for(const [mineral,qty] of Object.entries(recipe.minerals)){
    const price=Number(priceByMineral[mineral]);
    if(!(price>0))return null;
    const refinedQty=Number(qty)*MAX_REFINE_YIELD;
    const value=refinedQty*price;
    breakdown[mineral]={grossQty:Number(qty),refinedQty,unitPrice:price,value};
    grossPerBatch+=value;
  }
  const batchM3=Number(recipe.portionSize)*Number(oreVolume);
  return {
    perM3:grossPerBatch/batchM3,
    perBatch:grossPerBatch,
    batchM3,
    breakdown,
  };
}
function refinedIceValue(iceName,priceByProduct) {
  const recipe=ICE_REPROCESSING[iceName];
  if(!recipe)return null;
  let grossPerBlock=0;
  const breakdown={};
  for(const [product,qty] of Object.entries(recipe.products)){
    const refinedQty=Number(qty)*MAX_REFINE_YIELD;
    if(product==='Heavy Water'){
      breakdown[product]={grossQty:Number(qty),refinedQty,unitPrice:0,value:0,excluded:true};
      continue;
    }
    const price=Number(priceByProduct[product]);
    if(!(price>0))return null;
    const value=refinedQty*price;
    breakdown[product]={grossQty:Number(qty),refinedQty,unitPrice:price,value,excluded:false};
    grossPerBlock+=value;
  }
  return {
    perM3:grossPerBlock/Number(recipe.volume),
    perBlock:grossPerBlock,
    blockM3:Number(recipe.volume),
    breakdown,
  };
}
function iceTypesForSecurity(sec) {
  const s=Number(sec);
  const out=['Blue Ice IV-Grade'];
  if(s>=-0.15&&s<=0.35)out.push('Glare Crust');
  if(s>=-0.45&&s<=0.15)out.push('Dark Glitter');
  if(s>=-0.65&&s<=-0.15)out.push('Gelidus');
  if(s>=-1&&s<=-0.50)out.push('Krystallos');
  return out;
}
function lyDistance(a,b) {
  const ax=Number(a?.x),ay=Number(a?.y),az=Number(a?.z);
  const bx=Number(b?.x),by=Number(b?.y),bz=Number(b?.z);
  if(![ax,ay,az,bx,by,bz].every(Number.isFinite))return null;
  const dx=ax-bx,dy=ay-by,dz=az-bz;
  const distance=Math.sqrt(dx*dx+dy*dy+dz*dz)/LIGHT_YEAR_METERS;
  return Number.isFinite(distance)?distance:null;
}

async function refreshA0Fields(originSystemId) {
  const region=(await esiGet(`https://esi.evetech.net/latest/universe/regions/${FOUNTAIN_REGION_ID}/?datasource=tranquility`)).data;
  const constellationIds=Array.isArray(region.constellations)?region.constellations:[];
  const systemIds=[];
  for(let i=0;i<constellationIds.length;i+=8){
    const batch=await Promise.all(constellationIds.slice(i,i+8).map(async id=>{
      try{return (await esiGet(`https://esi.evetech.net/latest/universe/constellations/${id}/?datasource=tranquility`)).data.systems||[]}
      catch(err){console.warn('A0 constellation lookup failed',id,String(err.message||err));return[]}
    }));
    for(const ids of batch)systemIds.push(...ids);
  }

  const origin=(await esiGet(`https://esi.evetech.net/latest/universe/systems/${originSystemId}/?datasource=tranquility`)).data;
  const nearby=[];
  for(let i=0;i<systemIds.length;i+=12){
    const batch=await Promise.all(systemIds.slice(i,i+12).map(async id=>{
      try{
        const data=(await esiGet(`https://esi.evetech.net/latest/universe/systems/${id}/?datasource=tranquility`)).data;
        const distance=lyDistance(origin.position,data.position);
        return Number.isFinite(distance)&&distance<=TITAN_BRIDGE_RANGE_LY+1e-9?{id:Number(id),data,distance}:null;
      }catch(err){console.warn('A0 system lookup failed',id,String(err.message||err));return null}
    }));
    nearby.push(...batch.filter(Boolean));
  }

  const out=[];
  for(let i=0;i<nearby.length;i+=10){
    const batch=await Promise.all(nearby.slice(i,i+10).map(async entry=>{
      const starId=Number(entry.data.star_id);
      if(!starId)return null;
      try{
        const star=(await esiGet(`https://esi.evetech.net/latest/universe/stars/${starId}/?datasource=tranquility`)).data;
        const spectralClass=String(star.spectral_class||'').trim();
        if(!/^A0(?:\s|$)/i.test(spectralClass))return null;
        return {
          system:String(entry.data.name||`System ${entry.id}`),
          systemId:entry.id,
          distanceLy:entry.distance,
          security:Number(entry.data.security_status),
          starId,
          spectralClass,
          eligibility:'Nullsec Blue A0 Rare Asteroids',
        };
      }catch(err){console.warn('A0 star lookup failed',starId,String(err.message||err));return null}
    }));
    out.push(...batch.filter(Boolean));
  }
  return out.sort((a,b)=>a.distanceLy-b.distanceLy||a.system.localeCompare(b.system));
}
async function refreshIceFields(ids) {
  const originId=ids.get(CN_SYSTEM_NAME);
  if(!originId)return [];
  const origin=(await esiGet(`https://esi.evetech.net/latest/universe/systems/${originId}/?datasource=tranquility`)).data;
  const rows=[];
  for(const [system,iceBelts] of ICE_FIELD_SYSTEMS){
    const id=ids.get(system);
    if(!id)continue;
    try{
      const data=(await esiGet(`https://esi.evetech.net/latest/universe/systems/${id}/?datasource=tranquility`)).data;
      const distance=lyDistance(origin.position,data.position);
      if(Number.isFinite(distance)&&distance<=TITAN_BRIDGE_RANGE_LY+1e-9){
        rows.push({
          system,
          systemId:Number(id),
          distanceLy:distance,
          security:Number(data.security_status),
          iceBelts:Number(iceBelts),
          iceTypes:iceTypesForSecurity(data.security_status),
        });
      }
    }catch(err){console.warn('Ice field range lookup failed',system,String(err.message||err))}
  }
  return rows.sort((a,b)=>a.distanceLy-b.distanceLy||a.system.localeCompare(b.system));
}
async function refreshT3Distances(ids) {
  const originId=ids.get(CN_SYSTEM_NAME);
  if(!originId)return {};
  const origin=(await esiGet(`https://esi.evetech.net/latest/universe/systems/${originId}/?datasource=tranquility`)).data;
  const out={};
  for(const d of SYSTEM_DEFS){
    const id=ids.get(d.system);
    if(!id)continue;
    try{
      const data=(await esiGet(`https://esi.evetech.net/latest/universe/systems/${id}/?datasource=tranquility`)).data;
      const distance=lyDistance(origin.position,data.position);
      if(Number.isFinite(distance))out[d.system]=distance;
    }catch(err){
      console.warn('T3 distance lookup failed',d.system,String(err.message||err));
    }
  }
  return out;
}
async function refreshFieldDistances() {
  try{
    const ids=await resolveUniverseIds([...SYSTEM_DEFS.map(x=>x.system),CN_SYSTEM_NAME]);
    const distances=await refreshT3Distances(ids);
    if(Object.keys(distances).length){
      state.market.t3Distances=distances;
      await save();
      broadcast();
    }
  }catch(err){
    console.warn('Field distance refresh failed',String(err.message||err));
  }
}
function pushMarketHistory(bucket,key,row) {
  bucket[key] ||= [];
  const date=String(row.date||dateUTC());
  const next={date,jita:Number(row.jita)||null,cn:Number(row.cn)||null};
  const existing=bucket[key].findIndex(x=>x.date===date);
  if(existing>=0)bucket[key][existing]=next;
  else bucket[key].push(next);
  bucket[key]=bucket[key]
    .filter(x=>x&&x.date)
    .sort((a,b)=>String(a.date).localeCompare(String(b.date)))
    .slice(-31);
}
function marketHistoryPublic() {
  return {
    ore:Object.fromEntries(Object.entries(state.market?.history?.ore||{}).map(([k,v])=>[k,(v||[]).slice(-31)])),
    ice:Object.fromEntries(Object.entries(state.market?.history?.ice||{}).map(([k,v])=>[k,(v||[]).slice(-31)])),
  };
}
async function refreshMarketPrices(force=false) {
  if(marketRefreshInProgress)return;
  const last=Date.parse(state.market?.lastUpdatedAt||'');
  const valuationCurrent=MARKET_ORE_NAMES.every(name=>state.market?.prices?.[name]?.valuation==='max-refine-minerals')
    &&Object.keys(ICE_REPROCESSING).every(name=>state.market?.icePrices?.[name]?.valuation==='max-refine-ice'&&state.market?.icePrices?.[name]?.trackingBasis==='jita-refine-ex-heavy-water');
  const today=dateUTC();
  const historyCurrent=MARKET_ORE_NAMES.every(name=>(state.market?.history?.ore?.[name]||[]).some(x=>x.date===today))
    &&Object.keys(ICE_REPROCESSING).every(name=>(state.market?.history?.ice?.[name]||[]).some(x=>x.date===today));
  const jitaBuyBasisCurrent=state.market?.jitaBuyBasis==='reachable-from-jita-4-4';
  const t3DistancesCurrent=SYSTEM_DEFS.every(d=>typeof state.market?.t3Distances?.[d.system]==='number'&&Number.isFinite(state.market.t3Distances[d.system]));
  const a0ScanAt=Date.parse(state.market?.a0ScannedAt||'');
  const a0Current=Array.isArray(state.market?.a0Fields)&&Number.isFinite(a0ScanAt)&&Date.now()-a0ScanAt<MARKET_REFRESH_MS;
  if(!force&&valuationCurrent&&historyCurrent&&jitaBuyBasisCurrent&&t3DistancesCurrent&&a0Current&&Number.isFinite(last)&&Date.now()-last<MARKET_REFRESH_MS)return;
  marketRefreshInProgress=true;
  state.market.lastError=null;
  state.market.privateLastError=null;
  broadcast();
  try{
    const names=[...MARKET_ORE_NAMES.map(name=>ORE_TYPE_NAME[name]||name),...REFINING_MINERALS,...Object.keys(ICE_REPROCESSING),...ICE_PRODUCTS,...ICE_FIELD_SYSTEMS.map(x=>x[0]),...SYSTEM_DEFS.map(x=>x.system),CN_SYSTEM_NAME];
    const ids=await resolveUniverseIds(names);
    const cnSystemId=ids.get(CN_SYSTEM_NAME);
    if(!cnSystemId)throw new Error(`${CN_SYSTEM_NAME} system ID could not be resolved`);
    const [iceFields,t3Distances,a0Fields]=await Promise.all([
      refreshIceFields(ids),
      refreshT3Distances(ids),
      refreshA0Fields(cnSystemId).catch(err=>{console.warn('A0 range scan failed',String(err.message||err));return null}),
    ]);

    const mineralTypeIds=REFINING_MINERALS.map(name=>Number(ids.get(name))).filter(Number.isFinite);
    const iceProductTypeIds=ICE_PRODUCTS.map(name=>Number(ids.get(name))).filter(Number.isFinite);
    const rawIceTypeIds=Object.keys(ICE_REPROCESSING).map(name=>Number(ids.get(name))).filter(Number.isFinite);
    let privateMarket=null;
    if(state.market.refreshTokenEnc){
      try{
        const access=await marketAccessToken();
        privateMarket=await resolveMarketStructure(cnSystemId,access,[...mineralTypeIds,...iceProductTypeIds,...rawIceTypeIds]);
      }catch(err){
        state.market.privateLastError=String(err.message||err);
        console.warn('Private market refresh unavailable',state.market.privateLastError);
      }
    }

    const mineralPrices={jita:{},cn:{},detail:{}};
    for(const mineral of REFINING_MINERALS){
      const typeId=ids.get(mineral);
      if(!typeId){console.warn('Mineral type not resolved',mineral);continue}
      const forgeOrders=await marketOrders(JITA_REGION_ID,typeId);
      const jita=await bestPricesReachableAt(forgeOrders,JITA_SYSTEM_ID,JITA_44_STATION_ID);
      const cn=privateMarket?bestOrderPrices(privateMarket.orders.filter(o=>Number(o.type_id)===Number(typeId))):{buy:null,sell:null};

      if(jita.buy!==null)mineralPrices.jita[mineral]=jita.buy;
      if(cn.buy!==null)mineralPrices.cn[mineral]=cn.buy;
      mineralPrices.detail[mineral]={
        typeId,
        jita,
        cn:{...cn,source:privateMarket?'john-private-structure':'unavailable'},
      };
    }

    const iceProductPrices={jita:{},cn:{},detail:{}};
    for(const product of ICE_PRODUCTS){
      const typeId=ids.get(product);
      if(!typeId){console.warn('Ice product type not resolved',product);continue}
      const forgeOrders=await marketOrders(JITA_REGION_ID,typeId);
      const jita=await bestPricesReachableAt(forgeOrders,JITA_SYSTEM_ID,JITA_44_STATION_ID);
      const cn=privateMarket?bestOrderPrices(privateMarket.orders.filter(o=>Number(o.type_id)===Number(typeId))):{buy:null,sell:null};
      if(jita.buy!==null)iceProductPrices.jita[product]=jita.buy;
      if(cn.buy!==null)iceProductPrices.cn[product]=cn.buy;
      iceProductPrices.detail[product]={
        typeId,
        jita,
        cn:{...cn,source:privateMarket?'john-private-structure':'unavailable'},
      };
    }

    const next={...state.market.prices};
    for(const oreName of MARKET_ORE_NAMES){
      const typeId=ids.get(ORE_TYPE_NAME[oreName]||oreName);
      if(!typeId){console.warn('Ore type not resolved',oreName);continue}
      await ensureType([typeId]);
      const volume=Number(state.esi.typeCache[String(typeId)]?.volume||0);
      if(!(volume>0)){console.warn('Ore type has no volume',oreName,typeId);continue}

      const jitaValue=refinedOreValue(oreName,volume,mineralPrices.jita);
      const cnValue=refinedOreValue(oreName,volume,mineralPrices.cn);
      if(!jitaValue){console.warn('Incomplete Jita mineral prices for',oreName);continue}

      next[oreName]={
        typeId,
        volume,
        updatedAt:now(),
        valuation:'max-refine-minerals',
        maxRefineYield:MAX_REFINE_YIELD,
        recipe:ORE_REPROCESSING[oreName],
        jita:{
          source:'refined-minerals',
          buyPerM3:jitaValue.perM3,
          refinedBuyPerM3:jitaValue.perM3,
          refinedBatchValue:jitaValue.perBatch,
          breakdown:jitaValue.breakdown,
        },
        cn:{
          system:CN_SYSTEM_NAME,
          source:privateMarket?'john-private-structure-minerals':'unavailable',
          structureId:privateMarket?privateMarket.id:null,
          structureName:privateMarket?privateMarket.name:null,
          buyPerM3:cnValue?.perM3??null,
          refinedBuyPerM3:cnValue?.perM3??null,
          refinedBatchValue:cnValue?.perBatch??null,
          breakdown:cnValue?.breakdown??null,
        },
      };
    }

    const icePrices={...state.market.icePrices};
    for(const [iceName,recipe] of Object.entries(ICE_REPROCESSING)){
      const typeId=ids.get(iceName);
      const jitaValue=refinedIceValue(iceName,iceProductPrices.jita);
      const cnValue=refinedIceValue(iceName,iceProductPrices.cn);
      if(!jitaValue){console.warn('Incomplete Jita ice-product prices for',iceName);continue}

      let rawJita={buy:null,sell:null},rawLocal={buy:null,sell:null},rawLocalSource=privateMarket?'john-private-structure':'unavailable';
      if(typeId){
        const forgeRaw=await marketOrders(JITA_REGION_ID,typeId);
        rawJita=await bestPricesReachableAt(forgeRaw,JITA_SYSTEM_ID,JITA_44_STATION_ID);
        if(privateMarket)rawLocal=bestOrderPrices(privateMarket.orders.filter(o=>Number(o.type_id)===Number(typeId)));
      }
      const trackPct=Number(ICE_TRACK_PAYOUT[iceName]||0.75);
      // Local block tracking is based on Jita max-refine value (Heavy Water excluded),
      // then paid at 95% for Blue Ice IV-Grade and 75% for all other tracked ice.
      const trackingBlockValue=jitaValue?.perBlock==null?null:Number(jitaValue.perBlock)*trackPct;

      icePrices[iceName]={
        typeId:Number(typeId)||null,
        volume:Number(recipe.volume),
        updatedAt:now(),
        valuation:'max-refine-ice',
        maxRefineYield:MAX_REFINE_YIELD,
        trackingPct:trackPct,
        trackingBasis:'jita-refine-ex-heavy-water',
        trackingBlockValue,
        rawMarket:{
          jita:rawJita,
          local:{...rawLocal,source:rawLocalSource},
        },
        recipe,
        jita:{
          source:'refined-ice-products-ex-heavy-water',
          buyPerM3:jitaValue.perM3,
          refinedBuyPerM3:jitaValue.perM3,
          refinedBlockValue:jitaValue.perBlock,
          breakdown:jitaValue.breakdown,
        },
        cn:{
          system:CN_SYSTEM_NAME,
          source:privateMarket?'john-private-structure-ice-products-ex-heavy-water':'unavailable',
          structureId:privateMarket?privateMarket.id:null,
          structureName:privateMarket?privateMarket.name:null,
          buyPerM3:cnValue?.perM3??null,
          refinedBuyPerM3:cnValue?.perM3??null,
          refinedBlockValue:cnValue?.perBlock??null,
          breakdown:cnValue?.breakdown??null,
        },
      };
    }

    state.market.prices=next;
    state.market.minerals=mineralPrices.detail;
    state.market.icePrices=icePrices;
    state.market.iceProducts=iceProductPrices.detail;
    state.market.iceFields=iceFields;
    if(Array.isArray(a0Fields)){state.market.a0Fields=a0Fields;state.market.a0ScannedAt=now()}
    state.market.t3Distances=t3Distances;
    state.market.jitaBuyBasis='reachable-from-jita-4-4';
    state.market.history ||= {ore:{},ice:{}};
    state.market.history.ore ||= {};
    state.market.history.ice ||= {};
    const snapshotDate=dateUTC();
    for(const oreName of MARKET_ORE_NAMES){
      const row=next[oreName];
      if(!row)continue;
      pushMarketHistory(state.market.history.ore,oreName,{
        date:snapshotDate,
        jita:row.jita?.refinedBuyPerM3??row.jita?.buyPerM3,
        cn:row.cn?.refinedBuyPerM3??row.cn?.buyPerM3,
      });
    }
    for(const iceName of Object.keys(ICE_REPROCESSING)){
      const row=icePrices[iceName];
      if(!row)continue;
      pushMarketHistory(state.market.history.ice,iceName,{
        date:snapshotDate,
        jita:row.jita?.refinedBlockValue,
        cn:row.cn?.refinedBlockValue,
      });
    }
    state.market.lastUpdatedAt=now();
    state.market.lastError=null;
    await save();
  }catch(err){
    state.market.lastError=String(err.message||err);
    await save();
    console.error('Market refresh',err);
  }finally{
    marketRefreshInProgress=false;
    broadcast();
  }
}
async function miningLedger(characterId,access) {
  const first=await esiGet(`https://esi.evetech.net/latest/characters/${characterId}/mining/?datasource=tranquility&page=1`,access); let rows=[...first.data]; const pages=Math.max(1,Number(first.headers.get('x-pages')||1));
  for(let p=2;p<=pages;p++)rows.push(...(await esiGet(`https://esi.evetech.net/latest/characters/${characterId}/mining/?datasource=tranquility&page=${p}`,access)).data); return rows;
}
async function characterSkills(characterId,access) {
  return (await esiGet(`https://esi.evetech.net/latest/characters/${characterId}/skills/?datasource=tranquility`,access)).data;
}
async function characterFittings(characterId,access) {
  return (await esiGet(`https://esi.evetech.net/latest/characters/${characterId}/fittings/?datasource=tranquility`,access)).data;
}
async function characterAssets(characterId,access) {
  const first=await esiGet(`https://esi.evetech.net/latest/characters/${characterId}/assets/?datasource=tranquility&page=1`,access);
  let rows=[...first.data];
  const pages=Math.max(1,Number(first.headers.get('x-pages')||1));
  for(let p=2;p<=pages;p++)rows.push(...(await esiGet(`https://esi.evetech.net/latest/characters/${characterId}/assets/?datasource=tranquility&page=${p}`,access)).data);
  return rows;
}
async function dogmaAttributeName(attributeId) {
  const key=String(attributeId);
  if(dogmaAttributeCache.has(key))return dogmaAttributeCache.get(key);
  if(dogmaAttributePromises.has(key))return dogmaAttributePromises.get(key);
  const pending=(async()=>{
    try{
      const {data}=await esiGet(`https://esi.evetech.net/latest/dogma/attributes/${attributeId}/?datasource=tranquility`);
      const name=String(data.name||data.display_name||`attribute_${attributeId}`);
      dogmaAttributeCache.set(key,name);
      return name;
    }catch{
      const name=`attribute_${attributeId}`;dogmaAttributeCache.set(key,name);return name;
    }finally{dogmaAttributePromises.delete(key)}
  })();
  dogmaAttributePromises.set(key,pending);
  return pending;
}
async function dynamicDogmaItem(typeId,itemId) {
  return (await esiGet(`https://esi.evetech.net/latest/dogma/dynamic/items/${typeId}/${itemId}/?datasource=tranquility`)).data;
}
function pickDogmaValue(attributes,...needles) {
  const entries=Object.entries(attributes||{});
  for(const needle of needles){
    const target=String(needle).toLowerCase().replace(/[^a-z0-9]/g,'');
    const hit=entries.find(([name])=>String(name).toLowerCase().replace(/[^a-z0-9]/g,'')===target);
    if(hit)return Number(hit[1]);
  }
  return null;
}
async function abyssalStripSnapshot(assets=[]) {
  const assetById=new Map(assets.map(a=>[String(a.item_id),a]));
  const rows=assets.filter(a=>ABYSSAL_STRIP_TYPES.has(Number(a.type_id)));
  const out=[];
  for(const asset of rows){
    try{
      const dyn=await dynamicDogmaItem(asset.type_id,asset.item_id);
      const attributes={};
      for(const row of dyn.dogma_attributes||[])attributes[await dogmaAttributeName(row.attribute_id)]=Number(row.value);
      const sourceTypeId=Number(dyn.source_type_id||0);
      if(sourceTypeId)await ensureType([sourceTypeId]);
      const parent=assetById.get(String(asset.location_id));
      if(parent)await ensureType([parent.type_id]);
      out.push({
        itemId:String(asset.item_id),
        typeId:Number(asset.type_id),
        name:ABYSSAL_STRIP_TYPES.get(Number(asset.type_id))||`Type ${asset.type_id}`,
        locationFlag:String(asset.location_flag||''),
        parentItemId:parent?String(parent.item_id):null,
        shipTypeId:parent?Number(parent.type_id):null,
        shipName:parent?(state.esi.typeCache[String(parent.type_id)]?.name||null):null,
        sourceTypeId,
        sourceName:sourceTypeId?(state.esi.typeCache[String(sourceTypeId)]?.name||null):null,
        miningAmount:pickDogmaValue(attributes,'miningAmount'),
        duration:pickDogmaValue(attributes,'duration'),
        criticalSuccessChance:pickDogmaValue(attributes,'criticalSuccessChance'),
        criticalSuccessBonusYield:pickDogmaValue(attributes,'criticalSuccessBonusYield'),
      });
    }catch(err){
      console.warn('Abyssal strip lookup failed',asset.item_id,String(err.message||err));
    }
  }
  return out;
}
function skillSnapshot(payload) {
  const out={};
  for(const row of payload?.skills||[]) {
    const id=String(row.skill_id);
    if(MINING_SKILLS[id]) out[id]={skillId:Number(id),name:MINING_SKILLS[id],level:Number(row.active_skill_level||0)};
  }
  return out;
}
async function miningFittingSnapshot(fittings=[],abyssalModules=[]) {
  await ensureType(fittings.map(f=>f.ship_type_id));
  const mine=fittings.filter(f=>MINING_HULLS.has(state.esi.typeCache[String(f.ship_type_id)]?.name));
  await ensureType(mine.flatMap(f=>(f.items||[]).map(i=>i.type_id)));
  return mine.map(f=>{
    const shipName=state.esi.typeCache[String(f.ship_type_id)]?.name||`Type ${f.ship_type_id}`;
    const items=(f.items||[]).map(i=>({
      typeId:i.type_id,
      name:state.esi.typeCache[String(i.type_id)]?.name||`Type ${i.type_id}`,
      flag:i.flag,
      quantity:Number(i.quantity||1),
    }));
    const required=items.filter(i=>ABYSSAL_STRIP_TYPES.has(Number(i.typeId)));
    let matched=[];
    let abyssalMatch='none';
    if(required.length){
      const groups=new Map();
      for(const mod of abyssalModules.filter(x=>x.shipName===shipName&&x.parentItemId)){
        if(!groups.has(mod.parentItemId))groups.set(mod.parentItemId,[]);
        groups.get(mod.parentItemId).push(mod);
      }
      const needed=new Map();
      for(const row of required)needed.set(Number(row.typeId),(needed.get(Number(row.typeId))||0)+Number(row.quantity||1));
      const candidates=[...groups.values()].filter(group=>{
        const have=new Map();
        for(const mod of group)have.set(Number(mod.typeId),(have.get(Number(mod.typeId))||0)+1);
        return [...needed].every(([typeId,count])=>(have.get(typeId)||0)>=count);
      });
      if(candidates.length===1){
        matched=candidates[0].map(({parentItemId,...safe})=>safe);
        abyssalMatch='matched';
      }else if(candidates.length>1)abyssalMatch='ambiguous';
      else abyssalMatch='missing';
    }
    return {
      fittingId:f.fitting_id,
      name:f.name||'Unnamed fit',
      description:f.description||'',
      shipTypeId:f.ship_type_id,
      shipName,
      items,
      abyssalMatch,
      abyssalLasers:matched,
    };
  });
}
async function ensureType(ids) {
  for(const id of [...new Set(ids.map(String))]){
    if(state.esi.typeCache[id])continue;
    let pending=typeLookupPromises.get(id);
    if(!pending){
      pending=esiGet(`https://esi.evetech.net/latest/universe/types/${id}/?datasource=tranquility`)
        .then(({data})=>{state.esi.typeCache[id]={name:data.name||`Type ${id}`,volume:Number(data.volume||0)}})
        .finally(()=>typeLookupPromises.delete(id));
      typeLookupPromises.set(id,pending);
    }
    await pending;
  }
}
async function ensureSystem(ids) {
  for(const id of [...new Set(ids.map(String))]){
    if(state.esi.systemCache[id])continue;
    let pending=systemLookupPromises.get(id);
    if(!pending){
      pending=esiGet(`https://esi.evetech.net/latest/universe/systems/${id}/?datasource=tranquility`)
        .then(({data})=>{state.esi.systemCache[id]={name:data.name||`System ${id}`}})
        .finally(()=>systemLookupPromises.delete(id));
      systemLookupPromises.set(id,pending);
    }
    await pending;
  }
}
function updateLedgerActivity(characterId,totalM3,sampleAt=now()) {
  const key=String(characterId);
  const day=dateUTC(new Date(sampleAt));
  const total=Math.max(0,Number(totalM3)||0);
  const prev=state.esi.ledgerActivity?.[key];
  if(!state.esi.ledgerActivity)state.esi.ledgerActivity={};

  if(!prev||prev.date!==day||!Number.isFinite(Number(prev.lastTotalM3))){
    const seeded={
      date:day,
      lastTotalM3:total,
      lastSampleAt:sampleAt,
      activeSeconds:0,
      activeM3:0,
      actualM3PerHour:null,
      lastIntervalM3:0,
      lastIntervalSeconds:0,
      lastIntervalRate:null,
      miningDetected:false,
      firstMiningAt:null,
      lastMiningAt:null,
    };
    state.esi.ledgerActivity[key]=seeded;
    return seeded;
  }

  const lastTotal=Math.max(0,Number(prev.lastTotalM3)||0);
  const rawDelta=total-lastTotal;
  const delta=rawDelta>0?rawDelta:0;
  const elapsed=Math.max(0,(Date.parse(sampleAt)-Date.parse(prev.lastSampleAt||sampleAt))/1000);
  // Normal ESI polling is every ~15 minutes. Cap a stale gap so downtime is not
  // mistaken for hours of continuous mining.
  const activeInterval=delta>0&&elapsed>0?Math.min(elapsed,30*60):0;

  prev.lastTotalM3=total;
  prev.lastSampleAt=sampleAt;
  prev.lastIntervalM3=delta;
  prev.lastIntervalSeconds=activeInterval;
  prev.lastIntervalRate=activeInterval>0?delta/(activeInterval/3600):null;

  if(delta>0&&activeInterval>0){
    prev.activeSeconds=Math.max(0,Number(prev.activeSeconds)||0)+activeInterval;
    prev.activeM3=Math.max(0,Number(prev.activeM3)||0)+delta;
    prev.actualM3PerHour=prev.activeSeconds>0?prev.activeM3/(prev.activeSeconds/3600):null;
    prev.miningDetected=true;
    prev.firstMiningAt=prev.firstMiningAt||sampleAt;
    prev.lastMiningAt=sampleAt;
  }
  state.esi.ledgerActivity[key]=prev;
  return prev;
}

function trackedOreMatches(definitionOre,typeName){
  const expected=String(ORE_TYPE_NAME[definitionOre]||definitionOre||'').trim().toLowerCase();
  const actual=String(typeName||'').trim().toLowerCase();
  return Boolean(expected&&actual&&(actual===expected||actual.includes(expected)));
}

function trackedFieldLedgerTotals(rows,day){
  const totals={};
  for(const row of rows||[]){
    if(String(row.date)!==day)continue;
    const system=state.esi.systemCache[String(row.solar_system_id)]?.name||'';
    const definition=SYSTEM_MAP.get(system);
    if(!definition)continue;
    const type=state.esi.typeCache[String(row.type_id)]||{};
    if(!trackedOreMatches(definition.ore,type.name))continue;
    const m3=Math.max(0,Number(row.quantity||0)*Number(type.volume||0));
    if(m3>0)totals[system]=(Number(totals[system])||0)+m3;
  }
  return totals;
}

function updateFieldLedgerActivity(characterId,rows,sampleAt=now()){
  state.esi.ledgerFieldSnapshots ||= {};
  const key=String(characterId);
  const day=dateUTC(new Date(sampleAt));
  const totals=trackedFieldLedgerTotals(rows,day);
  const prev=state.esi.ledgerFieldSnapshots[key];
  if(!prev||prev.date!==day||!prev.totals||typeof prev.totals!=='object'){
    state.esi.ledgerFieldSnapshots[key]={date:day,lastSampleAt:sampleAt,totals};
    return [];
  }

  const previousSampleAt=prev.lastSampleAt;
  const previousSampleMs=Date.parse(previousSampleAt||'');
  const reopened=[];
  for(const [system,total] of Object.entries(totals)){
    const previous=Math.max(0,Number(prev.totals?.[system])||0);
    const delta=Math.max(0,Number(total||0)-previous);
    if(delta<=0)continue;
    const field=state.fields[system];
    if(!field||field.status!=='cleared')continue;

    // The ledger is daily/cumulative, not timestamped per mining cycle. Only
    // override RED when it was already RED at the previous sample, proving this
    // increase happened after the timer was started rather than before it.
    const clearedAt=Date.parse(field.updatedAt||'');
    if(!Number.isFinite(clearedAt)||!Number.isFinite(previousSampleMs)||clearedAt>previousSampleMs)continue;

    field.status='picked';
    field.timerEndsAt=null;
    field.updatedAt=sampleAt;
    field.autoReopenedAt=sampleAt;
    field.autoReopenReason='esi-ledger-mining';
    field.autoReopenM3=delta;
    reopened.push(system);
  }

  state.esi.ledgerFieldSnapshots[key]={date:day,lastSampleAt:sampleAt,totals};
  return reopened;
}

function timestampStale(value,maxAgeMs){
  const parsed=Date.parse(value||'');
  return !Number.isFinite(parsed)||Date.now()-parsed>=maxAgeMs;
}

async function characterAccess(ch){
  const key=String(ch.characterId);
  if(characterAccessPromises.has(key))return characterAccessPromises.get(key);
  const pending=(async()=>{
    const tokens=await refreshToken(decrypt(ch.refreshTokenEnc));
    const identity=await verifyJwt(tokens.access_token,true);
    if(String(identity.characterId)!==key)throw new Error('Refresh token changed character');
    if(tokens.refresh_token)ch.refreshTokenEnc=encrypt(tokens.refresh_token);
    ch.scopes=identity.scopes;
    return{access:tokens.access_token,identity};
  })().finally(()=>characterAccessPromises.delete(key));
  characterAccessPromises.set(key,pending);
  return pending;
}

async function a0CandidateForScan(systemId,system,a0Detected=false){
  const known=(state.market?.a0Fields||[]).find(row=>row.system===system);
  if(known)return {...known};
  if(!a0Detected)return null;

  const ids=await resolveUniverseIds([CN_SYSTEM_NAME]);
  const originId=ids.get(CN_SYSTEM_NAME);
  if(!originId)return null;
  const [origin,target]=await Promise.all([
    esiGet(`https://esi.evetech.net/latest/universe/systems/${originId}/?datasource=tranquility`).then(x=>x.data),
    esiGet(`https://esi.evetech.net/latest/universe/systems/${systemId}/?datasource=tranquility`).then(x=>x.data),
  ]);
  const distance=lyDistance(origin.position,target.position);
  if(!Number.isFinite(distance)||distance>TITAN_BRIDGE_RANGE_LY+1e-9)return null;

  let spectralClass='A0',starId=Number(target.star_id)||null;
  if(starId){
    try{
      const star=(await esiGet(`https://esi.evetech.net/latest/universe/stars/${starId}/?datasource=tranquility`)).data;
      spectralClass=String(star.spectral_class||spectralClass).trim()||spectralClass;
    }catch{}
  }
  return {
    system,
    systemId:Number(systemId),
    distanceLy:distance,
    security:Number(target.security_status),
    starId,
    spectralClass,
    eligibility:'Probe Scanner confirmed A0 Rare Asteroids',
    discoveredByScan:true,
  };
}

async function recordA0ProbeScan({characterName,systemId,system,text}){
  const scan=parseA0Scan(text);
  const candidate=await a0CandidateForScan(systemId,system,scan.detected);
  if(!candidate)return {tracked:false,inRange:false,scan};
  if(!scan.valid)return {tracked:true,inRange:true,candidate,scan,status:'invalid'};

  state.market.a0Reports ||= {};
  const checkedAt=now();
  state.market.a0Reports[system]={
    systemId:Number(systemId),
    distanceLy:Number(candidate.distanceLy),
    security:Number(candidate.security),
    starId:Number(candidate.starId)||null,
    spectralClass:String(candidate.spectralClass||'A0'),
    detected:Boolean(scan.detected),
    siteName:scan.siteName,
    scannerRowCount:Number(scan.scannerRowCount)||0,
    lastCheckedAt:checkedAt,
    nextUpdateAt:new Date(Date.parse(checkedAt)+A0_REPORT_TTL).toISOString(),
    reportedBy:String(characterName||''),
  };
  return {
    tracked:true,
    inRange:true,
    candidate,
    scan,
    status:scan.detected?'active':'clear',
    lastCheckedAt:checkedAt,
    nextUpdateAt:state.market.a0Reports[system].nextUpdateAt,
  };
}

function recordBoardScan({system,text,a0}){
  const parsed=parseA0Scan(text);
  const iceParsed=parseIceScan(text);
  const kinds=[];
  if(SYSTEM_MAP.has(system))kinds.push('t3');
  const iceField=(state.market?.iceFields||[]).find(row=>row.system===system)||null;
  if(iceField)kinds.push('ice');
  if((state.market?.a0Fields||[]).some(row=>row.system===system)||a0?.tracked)kinds.push('a0');
  if(!parsed.valid||!kinds.length)return {recorded:false,valid:parsed.valid,boardTracked:Boolean(kinds.length),kinds};
  state.scans ||= {};
  const lastScanAt=now();
  const expectedIce=iceField?Math.max(1,Number(iceField.iceBelts)||1):0;
  const seenIce=expectedIce?Math.min(expectedIce,Math.max(0,Number(iceParsed.detectedCount)||0)):0;
  const ice=expectedIce?{expected:expectedIce,seen:seenIce,missing:Math.max(0,expectedIce-seenIce)}:null;
  state.scans[system]={
    lastScanAt,
    scannerRowCount:Number(parsed.scannerRowCount)||0,
    kinds:[...new Set(kinds)],
    ice,
  };
  return {
    recorded:true,
    valid:true,
    boardTracked:true,
    kinds:state.scans[system].kinds,
    ice,
    scannerRowCount:Number(parsed.scannerRowCount)||0,
    lastScanAt,
    nextUpdateAt:new Date(Date.parse(lastScanAt)+A0_REPORT_TTL).toISOString(),
  };
}

async function probeScanPreview(ch,text){
  const {access,identity}=await characterAccess(ch);
  if(!identity.scopes.includes(LOCATION_SCOPE)){
    const error=new Error('Update this toon’s EVE access before importing scans.');
    error.code='LOCATION_SCOPE_REQUIRED';
    throw error;
  }
  const {data}=await esiGet(`https://esi.evetech.net/latest/characters/${ch.characterId}/location/?datasource=tranquility`,access);
  const systemId=String(data.solar_system_id||'');
  if(!systemId)throw new Error('EVE did not return a current solar system for this toon.');
  await ensureSystem([systemId]);
  const system=state.esi.systemCache[systemId]?.name||`System ${systemId}`;
  const definition=SYSTEM_MAP.get(system)||null;
  const scan=definition?parseProbeScan(text,definition.ore):null;
  let correction=null;
  if(definition&&scan?.valid&&scan.detected){
    const f=state.fields[system];
    if(f?.status==='cleared'){
      const previousTimerEndsAt=f.timerEndsAt||null;
      const correctedAt=now();
      f.status='ready';
      f.timerEndsAt=null;
      f.updatedAt=correctedAt;
      f.autoReopenedAt=correctedAt;
      f.autoReopenReason='probe-scan-correction';
      f.autoReopenM3=null;
      correction={
        applied:true,
        from:'cleared',
        to:'ready',
        correctedAt,
        previousTimerEndsAt,
        reason:'deposit-detected-on-repost',
      };
    }
  }
  const a0=await recordA0ProbeScan({characterName:ch.name,systemId,system,text});
  const boardScan=recordBoardScan({system,text,a0});
  return{
    characterId:String(ch.characterId),
    characterName:ch.name,
    systemId,
    system,
    tracked:Boolean(definition),
    definition:definition?{system:definition.system,ore:definition.ore,rank:definition.rank}:null,
    scan,
    field:definition?state.fields[system]:null,
    correction,
    a0,
    boardScan,
  };
}

async function syncCharacterOnce(ch,{forceMetadata=false}={}){
  try{
    const {access,identity:id}=await characterAccess(ch);

    const rows=await miningLedger(ch.characterId,access);
    let metadataRefreshed=false;
    if(id.scopes.includes(SKILLS_SCOPE)&&(forceMetadata||timestampStale(ch.skillsUpdatedAt,ESI_METADATA_REFRESH_MS))){
      const skills=await characterSkills(ch.characterId,access);
      ch.skills=skillSnapshot(skills);ch.skillsUpdatedAt=now();metadataRefreshed=true;
    }

    const fitBundleStale=forceMetadata||timestampStale(ch.assetsUpdatedAt,ESI_METADATA_REFRESH_MS)||timestampStale(ch.fittingsUpdatedAt,ESI_METADATA_REFRESH_MS);
    if(fitBundleStale){
      let abyssalModules=[];
      if(id.scopes.includes(ASSETS_SCOPE)){
        const assets=await characterAssets(ch.characterId,access);
        abyssalModules=await abyssalStripSnapshot(assets);
        ch.abyssalStripCount=abyssalModules.length;
        ch.assetsUpdatedAt=now();
      }
      if(id.scopes.includes(FITTINGS_SCOPE)){
        const fits=await characterFittings(ch.characterId,access);
        ch.savedFittingsCount=Array.isArray(fits)?fits.length:0;
        ch.fittings=await miningFittingSnapshot(fits,abyssalModules);
        ch.fittingsUpdatedAt=now();
      }
      metadataRefreshed=true;
    }
    ch.lastSyncAt=now();ch.lastError=null;
    return{characterId:String(ch.characterId),rows,ok:true,metadataRefreshed};
  }catch(err){
    ch.lastError=String(err.message||err);
    return{characterId:String(ch.characterId),rows:[],ok:false,error:ch.lastError,metadataRefreshed:false};
  }
}

async function acquireEsiCharacterSyncSlot(){
  while(esiCharacterSyncActive>=ESI_MAX_CHARACTER_CONCURRENCY){
    await new Promise(resolve=>esiCharacterSyncWaiters.push(resolve));
  }
  esiCharacterSyncActive++;
}
function releaseEsiCharacterSyncSlot(){
  esiCharacterSyncActive=Math.max(0,esiCharacterSyncActive-1);
  const next=esiCharacterSyncWaiters.shift();
  if(next)next();
}
function autoSyncPlan(characterCount){
  const count=Math.max(1,Number(characterCount)||1);
  const desiredGap=Math.floor(ESI_AUTO_SPREAD_MS/count);
  const startGapMs=clamp(
    desiredGap,
    ESI_MIN_CHARACTER_START_GAP_MS,
    ESI_MAX_CHARACTER_START_GAP_MS,
    ESI_MAX_CHARACTER_START_GAP_MS,
  );
  const estimatedSpreadMs=Math.max(0,(count-1)*startGapMs);
  return{
    characterCount:count,
    startGapMs,
    concurrency:ESI_MAX_CHARACTER_CONCURRENCY,
    estimatedSpreadMs,
    targetRefreshMs:ESI_AUTO_REFRESH_MS,
  };
}

async function syncCharacter(ch,options={}){
  const key=String(ch.characterId);
  const existing=characterSyncPromises.get(key);
  if(existing){
    const result=await existing;
    if(options.forceMetadata&&!result.metadataRefreshed)return syncCharacter(ch,options);
    return result;
  }
  const pending=(async()=>{
    await acquireEsiCharacterSyncSlot();
    try{return await syncCharacterOnce(ch,options)}
    finally{releaseEsiCharacterSyncSlot()}
  })().finally(()=>characterSyncPromises.delete(key));
  characterSyncPromises.set(key,pending);
  return pending;
}

async function syncCharacters(entries,{forceMetadata=false,startGapMs=100,concurrency=8}={}){
  const results=[];
  const active=new Set();
  for(let index=0;index<entries.length;index++){
    while(active.size>=concurrency)await Promise.race(active);
    const pending=syncCharacter(entries[index],{forceMetadata})
      .then(result=>results.push(result));
    active.add(pending);
    pending.then(()=>active.delete(pending),()=>active.delete(pending));
    if(index<entries.length-1&&startGapMs>0)await sleep(startGapMs);
  }
  await Promise.all(active);
  return results;
}

async function applyLedgerResults(results,{fullCycle=false}={}){
  const successful=results.filter(result=>result.ok);
  const freshRows=successful.flatMap(result=>result.rows);
  await ensureType(freshRows.map(row=>row.type_id));
  await ensureSystem(freshRows.map(row=>row.solar_system_id));

  const sampleAt=now();
  const today=dateUTC(new Date(sampleAt));
  for(const ledger of successful){
    ledgerRowsByCharacter.set(String(ledger.characterId),ledger.rows);
    let totalM3=0;
    for(const row of ledger.rows){
      if(String(row.date)!==today)continue;
      const type=state.esi.typeCache[String(row.type_id)]||{volume:0};
      totalM3+=Number(row.quantity||0)*Number(type.volume||0);
    }
    updateLedgerActivity(ledger.characterId,totalM3,sampleAt);
    const reopened=updateFieldLedgerActivity(ledger.characterId,ledger.rows,sampleAt);
    if(reopened.length)console.log('ESI mining reopened RED fields as YELLOW:',reopened.join(', '));
  }

  const connectedIds=new Set(Object.keys(state.characters));
  for(const id of ledgerRowsByCharacter.keys())if(!connectedIds.has(id))ledgerRowsByCharacter.delete(id);
  const cacheComplete=[...connectedIds].every(id=>ledgerRowsByCharacter.has(id));
  if(fullCycle||cacheComplete){
    const daily=new Map();
    for(const rows of ledgerRowsByCharacter.values())for(const row of rows){
      const type=state.esi.typeCache[String(row.type_id)]||{volume:0};
      const sys=state.esi.systemCache[String(row.solar_system_id)]||{name:''};
      const m3=Number(row.quantity||0)*Number(type.volume||0);
      let jbv=0;const def=SYSTEM_MAP.get(sys.name);if(def)jbv=m3*effectiveJbvPerM3(def.ore);
      const key=String(row.date);const value=daily.get(key)||{date:key,m3:0,jbv:0};
      value.m3+=m3;value.jbv+=jbv;daily.set(key,value);
    }
    state.esi.dailyFleet=[...daily.values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,90);
  }
  if(successful.length)state.esi.lastSyncAt=sampleAt;
  const failedRows=results.filter(result=>!result.ok);
  const failed=failedRows.length;
  const failureKinds=[...new Set(failedRows.map(result=>{
    const match=String(result.error||'').match(/ESI\s+(\d{3})/i);
    return match?`ESI ${match[1]}`:'request error';
  }))];
  state.esi.lastError=failed
    ?`${failed} of ${results.length} character refreshes failed${failureKinds.length?` (${failureKinds.slice(0,3).join(', ')})`:''}.`
    :null;
}

async function syncAll(){
  if(syncInProgress||!EVE_CLIENT_ID)return;
  const entries=Object.values(state.characters)
    .sort((a,b)=>{
      const ams=Date.parse(a.lastSyncAt||'');
      const bms=Date.parse(b.lastSyncAt||'');
      const av=Number.isFinite(ams)?ams:0;
      const bv=Number.isFinite(bms)?bms:0;
      return av-bv||String(a.characterId).localeCompare(String(b.characterId));
    });
  if(!entries.length)return;
  const plan=autoSyncPlan(entries.length);
  syncInProgress=true;state.esi.lastError=null;broadcast();
  try{
    const results=await syncCharacters(entries,{forceMetadata:false,startGapMs:plan.startGapMs,concurrency:plan.concurrency});
    await applyLedgerResults(results,{fullCycle:true});
    await save();
  }catch(err){state.esi.lastError=String(err.message||err);await save()}
  finally{syncInProgress=false;broadcast()}
}

function syncUserCharacters(user,characterIds=user.characterIds){
  if(!EVE_CLIENT_ID)return Promise.resolve();
  const key=String(user.id);
  if(userSyncPromises.has(key))return userSyncPromises.get(key);
  const pending=(async()=>{
    const allowed=new Set(user.characterIds.map(String));
    const entries=characterIds.map(String).filter(id=>allowed.has(id)).map(id=>state.characters[id]).filter(Boolean);if(!entries.length)return;
    manualSyncCount++;broadcast();
    try{
      const results=await syncCharacters(entries,{forceMetadata:true,startGapMs:ESI_MANUAL_CHARACTER_START_GAP_MS,concurrency:ESI_MAX_CHARACTER_CONCURRENCY});
      await applyLedgerResults(results);
      await save();
    }catch(err){state.esi.lastError=String(err.message||err);await save()}
    finally{manualSyncCount=Math.max(0,manualSyncCount-1);broadcast()}
  })().finally(()=>userSyncPromises.delete(key));
  userSyncPromises.set(key,pending);
  return pending;
}

function myProfile(user) {
  return {
    id:user.id,
    displayName:user.displayName,
    primaryCharacterId:user.primaryCharacterId,
    portrait:`https://images.evetech.net/characters/${user.primaryCharacterId}/portrait?size=64`,
    characters:user.characterIds.map(id=>state.characters[id]).filter(Boolean).map(c=>{
      const scopes=Array.isArray(c.scopes)?c.scopes:[];
      return {
        characterId:c.characterId,
        name:c.name,
        connectedAt:c.connectedAt,
        lastSyncAt:c.lastSyncAt,
        lastError:c.lastError,
        portrait:`https://images.evetech.net/characters/${c.characterId}/portrait?size=64`,
        scopes,
        locationAccess:scopes.includes(LOCATION_SCOPE),
        needsReauth:!scopes.includes(SKILLS_SCOPE)||!scopes.includes(FITTINGS_SCOPE)||!scopes.includes(ASSETS_SCOPE)||!scopes.includes(LOCATION_SCOPE),
        marketEligible:c.name===MARKET_CHARACTER_NAME,
        marketAuthorized:c.name===MARKET_CHARACTER_NAME&&String(state.market.characterId||'')===String(c.characterId)&&Boolean(state.market.refreshTokenEnc),
        skills:c.skills||{},
        skillsUpdatedAt:c.skillsUpdatedAt||null,
        savedFittingsCount:Number.isFinite(Number(c.savedFittingsCount))?Number(c.savedFittingsCount):(c.fittings||[]).length,
        abyssalStripCount:Number(c.abyssalStripCount||0),
        assetsUpdatedAt:c.assetsUpdatedAt||null,
        fittings:c.fittings||[],
        fittingsUpdatedAt:c.fittingsUpdatedAt||null,
        ledgerActivity:(()=>{
          const p=state.esi.ledgerActivity?.[String(c.characterId)]||null;
          if(!p)return null;
          return {
            date:p.date||null,
            activeSeconds:Number(p.activeSeconds||0),
            activeM3:Number(p.activeM3||0),
            actualM3PerHour:Number.isFinite(Number(p.actualM3PerHour))?Number(p.actualM3PerHour):null,
            lastIntervalM3:Number(p.lastIntervalM3||0),
            lastIntervalSeconds:Number(p.lastIntervalSeconds||0),
            lastIntervalRate:Number.isFinite(Number(p.lastIntervalRate))?Number(p.lastIntervalRate):null,
            miningDetected:Boolean(p.miningDetected),
            firstMiningAt:p.firstMiningAt||null,
            lastMiningAt:p.lastMiningAt||null,
            lastSampleAt:p.lastSampleAt||null,
          };
        })(),
      };
    }),
  };
}

async function serveStatic(req,res,pathname) {
  const rel=pathname==='/'?'index.html':pathname.slice(1);const file=path.resolve(PUBLIC_DIR,rel);if(!file.startsWith(path.resolve(PUBLIC_DIR)+path.sep)&&file!==path.join(PUBLIC_DIR,'index.html'))return false;
  try{const st=await fsp.stat(file);if(!st.isFile())return false;const ext=path.extname(file).toLowerCase();const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};securityHeaders(res);res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':ext==='.html'?'no-cache':'public, max-age=60'});fs.createReadStream(file).pipe(res);return true}catch{return false}
}

async function resolveUniverseNames(ids){
  const unique=[...new Set((ids||[]).map(Number).filter(Number.isFinite))];
  const missing=unique.filter(id=>!universeNameCache.has(id));
  for(let i=0;i<missing.length;i+=500){
    const batch=missing.slice(i,i+500);
    if(!batch.length)continue;
    try{
      const {data}=await esiPost('https://esi.evetech.net/latest/universe/names/?datasource=tranquility',batch);
      for(const row of Array.isArray(data)?data:[])if(row?.id&&row?.name)universeNameCache.set(Number(row.id),String(row.name));
    }catch(err){
      console.warn('Universe names lookup failed',String(err.message||err));
    }
  }
  return new Map(unique.map(id=>[id,universeNameCache.get(id)||String(id)]));
}
async function zkillJson(url){
  let lastError=null;
  for(let attempt=0;attempt<4;attempt++){
    const response=await fetch(url,{
      headers:{
        'Accept':'application/json',
        'Accept-Encoding':'gzip, deflate, br',
        'User-Agent':`${ESI_USER_AGENT} | INIT leaderboard`,
      },
    });
    if(response.ok){
      let payload;
      try{payload=await response.json()}
      catch(err){lastError=new Error(`zKillboard returned invalid JSON: ${String(err.message||err)}`)}
      if(payload!==undefined){
        const apiError=payload&&!Array.isArray(payload)&&typeof payload==='object'&&(payload.error||payload.message);
        if(!apiError)return payload;
        lastError=new Error(`zKillboard API error: ${String(payload.error||payload.message).slice(0,160)}`);
      }
      if(attempt<3){
        await sleep((attempt+1)*2000+Math.floor(Math.random()*500));
        continue;
      }
      throw lastError||new Error('zKillboard returned an invalid response');
    }
    if(response.status===429||[502,503,504].includes(response.status)){
      const retry=clamp(response.headers.get('retry-after'),1,120,3);
      lastError=new Error(`zKillboard ${response.status}: temporary API failure`);
      await sleep(retry*1000+Math.floor(Math.random()*500));
      continue;
    }
    throw new Error(`zKillboard ${response.status}: ${(await response.text().catch(()=>'' )).slice(0,120)}`);
  }
  throw lastError||new Error('zKillboard request failed after retries');
}
function addPvpMetric(map,id,corpId,killId,value,finalBlow,damage){
  if(!id)return;
  let row=map.get(id);
  if(!row){row={id:Number(id),corporationId:Number(corpId)||null,killmails:0,finalBlows:0,damageDone:0,iskOnKillmails:0,_kills:new Set()};map.set(id,row)}
  if(!row._kills.has(killId)){
    row._kills.add(killId);
    row.killmails++;
    row.iskOnKillmails+=Number(value)||0;
  }
  if(finalBlow)row.finalBlows++;
  row.damageDone+=Number(damage)||0;
}
function rankPvpRows(rows){
  rows.sort((a,b)=>b.killmails-a.killmails||b.finalBlows-a.finalBlows||b.damageDone-a.damageDone||b.iskOnKillmails-a.iskOnKillmails||a.id-b.id);
  rows.forEach((row,index)=>row.rank=index+1);
  return rows;
}
async function buildInitZkillLeaderboard(force=false){
  const nowMs=Date.now();
  if(!force&&zkillInitLeaderboardCache.data&&nowMs-zkillInitLeaderboardCache.updatedAt<ZKILL_CACHE_MS)return zkillInitLeaderboardCache.data;
  if(zkillInitLeaderboardCache.promise)return zkillInitLeaderboardCache.promise;
  const pending=(async()=>{
    const characters=new Map(),corporations=new Map(),seenKillIds=new Set();
    let pagesFetched=0,truncated=false;
    let previousPageSignature='';
    for(let page=1;page<=ZKILL_MAX_PAGES;page++){
      const url=`https://zkillboard.com/api/kills/allianceID/${INIT_ALLIANCE_ID}/pastSeconds/${ZKILL_WINDOW_SECONDS}/page/${page}/`;
      const rows=await zkillJson(url);
      if(!Array.isArray(rows))throw new Error(`zKillboard page ${page} was not a killmail list; refusing to publish a partial leaderboard.`);
      const list=rows;
      const signature=list.slice(0,5).map(row=>String(row?.killmail_id||'')).join(',');
      if(page>1&&list.length&&signature&&signature===previousPageSignature){
        throw new Error(`zKillboard pagination repeated page ${page-1}; refusing to publish incomplete rankings.`);
      }
      if(signature)previousPageSignature=signature;
      pagesFetched=page;
      for(const km of list){
        const killId=Number(km?.killmail_id);
        if(!killId||seenKillIds.has(killId))continue;
        seenKillIds.add(killId);
        const value=Number(km?.zkb?.totalValue)||0;
        const corpSeen=new Set();
        for(const attacker of Array.isArray(km?.attackers)?km.attackers:[]){
          if(Number(attacker?.alliance_id)!==INIT_ALLIANCE_ID)continue;
          const charId=Number(attacker?.character_id);
          const corpId=Number(attacker?.corporation_id);
          if(charId)addPvpMetric(characters,charId,corpId,killId,value,Boolean(attacker?.final_blow),Number(attacker?.damage_done)||0);
          if(corpId){
            if(!corporations.has(corpId))corporations.set(corpId,{id:corpId,killmails:0,finalBlows:0,damageDone:0,iskOnKillmails:0,_kills:new Set()});
            const corp=corporations.get(corpId);
            if(!corpSeen.has(corpId)){
              corpSeen.add(corpId);
              if(!corp._kills.has(killId)){corp._kills.add(killId);corp.killmails++;corp.iskOnKillmails+=value}
            }
            if(attacker?.final_blow)corp.finalBlows++;
            corp.damageDone+=Number(attacker?.damage_done)||0;
          }
        }
      }
      if(list.length<200)break;
      if(page===ZKILL_MAX_PAGES){truncated=true;break}
      await sleep(ZKILL_PAGE_GAP_MS);
    }
    const rankedCharacters=rankPvpRows([...characters.values()]);
    const rankedCorporations=rankPvpRows([...corporations.values()]);
    for(const row of [...rankedCharacters,...rankedCorporations])delete row._kills;
    const data={generatedAt:now(),pagesFetched,truncated,killmailsProcessed:seenKillIds.size,characters:rankedCharacters,corporations:rankedCorporations,sourceComplete:!truncated};
    zkillInitLeaderboardCache={updatedAt:Date.now(),data,promise:null};
    return data;
  })().finally(()=>{if(zkillInitLeaderboardCache.promise===pending)zkillInitLeaderboardCache.promise=null});
  zkillInitLeaderboardCache.promise=pending;
  return pending;
}
async function zkillCorporationWeeklyStats(corporationId,force=false){
  const corpId=Number(corporationId);
  if(!corpId)throw new Error('Corporation ID is required for zKillboard stats.');
  let cache=zkillCorpStatsCache.get(corpId)||{updatedAt:0,data:null,promise:null};
  const nowMs=Date.now();
  if(!force&&cache.data&&nowMs-cache.updatedAt<ZKILL_CACHE_MS)return cache.data;
  if(cache.promise)return cache.promise;

  const pending=(async()=>{
    const payload=await zkillJson(`https://zkillboard.com/api/stats/corporationID/${corpId}/kills/`);
    const weekly=payload?.rankings?.weekly?.all||{};
    const metrics=weekly?.metrics||{};
    const ranks=weekly?.ranks||{};
    const data={
      corporationId:corpId,
      shipsDestroyed:Number(metrics.shipsDestroyed)||0,
      shipsLost:Number(metrics.shipsLost)||0,
      pointsDestroyed:Number(metrics.pointsDestroyed)||0,
      pointsLost:Number(metrics.pointsLost)||0,
      iskDestroyed:Number(metrics.iskDestroyed)||0,
      iskLost:Number(metrics.iskLost)||0,
      globalRanks:{
        shipsDestroyed:Number(ranks.shipsDestroyed)||null,
        pointsDestroyed:Number(ranks.pointsDestroyed)||null,
        iskDestroyed:Number(ranks.iskDestroyed)||null,
      },
      verifiedAt:now(),
    };
    cache={updatedAt:Date.now(),data,promise:null};
    zkillCorpStatsCache.set(corpId,cache);
    return data;
  })().finally(()=>{
    const current=zkillCorpStatsCache.get(corpId);
    if(current?.promise===pending)zkillCorpStatsCache.set(corpId,{...current,promise:null});
  });

  zkillCorpStatsCache.set(corpId,{...cache,promise:pending});
  return pending;
}
async function zkillCorporationWeeklyStatsMany(corporationIds,force=false){
  const ids=[...new Set((corporationIds||[]).map(Number).filter(Number.isFinite))];
  const out=new Map();
  const active=new Set();
  for(let index=0;index<ids.length;index++){
    while(active.size>=4)await Promise.race(active);
    const id=ids[index];
    const pending=zkillCorporationWeeklyStats(id,force)
      .then(row=>out.set(id,row))
      .catch(err=>console.warn('zKill corporation stats failed',id,String(err.message||err)));
    active.add(pending);
    pending.finally(()=>active.delete(pending));
    if(index<ids.length-1)await sleep(250);
  }
  await Promise.all(active);
  return out;
}

async function buildCorpZkillLeaderboard(corporationId,force=false){
  const corpId=Number(corporationId);
  if(!corpId)throw new Error('Corporation ID is required for zKillboard verification.');
  let cache=zkillCorpLeaderboardCache.get(corpId)||{updatedAt:0,data:null,promise:null};
  const nowMs=Date.now();
  if(!force&&cache.data&&nowMs-cache.updatedAt<ZKILL_CACHE_MS)return cache.data;
  if(cache.promise)return cache.promise;

  const pending=(async()=>{
    const characters=new Map(),seenKillIds=new Set();
    const corp={id:corpId,killmails:0,finalBlows:0,damageDone:0,iskOnKillmails:0,_kills:new Set()};
    let pagesFetched=0,truncated=false,previousPageSignature='';

    for(let page=1;page<=ZKILL_MAX_PAGES;page++){
      const url=`https://zkillboard.com/api/kills/corporationID/${corpId}/pastSeconds/${ZKILL_WINDOW_SECONDS}/page/${page}/`;
      const rows=await zkillJson(url);
      if(!Array.isArray(rows))throw new Error(`zKillboard corporation page ${page} was not a killmail list.`);
      const list=rows;
      const signature=list.slice(0,5).map(row=>String(row?.killmail_id||'')).join(',');
      if(page>1&&list.length&&signature&&signature===previousPageSignature){
        throw new Error(`zKillboard corporation pagination repeated page ${page-1}.`);
      }
      if(signature)previousPageSignature=signature;
      pagesFetched=page;

      for(const km of list){
        const killId=Number(km?.killmail_id);
        if(!killId||seenKillIds.has(killId))continue;
        seenKillIds.add(killId);
        const value=Number(km?.zkb?.totalValue)||0;
        let corpInvolved=false;

        for(const attacker of Array.isArray(km?.attackers)?km.attackers:[]){
          if(Number(attacker?.corporation_id)!==corpId)continue;
          if(Number(attacker?.alliance_id)!==INIT_ALLIANCE_ID)continue;
          corpInvolved=true;
          const charId=Number(attacker?.character_id);
          if(charId)addPvpMetric(
            characters,
            charId,
            corpId,
            killId,
            value,
            Boolean(attacker?.final_blow),
            Number(attacker?.damage_done)||0,
          );
          if(attacker?.final_blow)corp.finalBlows++;
          corp.damageDone+=Number(attacker?.damage_done)||0;
        }

        if(corpInvolved&&!corp._kills.has(killId)){
          corp._kills.add(killId);
          corp.killmails++;
          corp.iskOnKillmails+=value;
        }
      }

      if(list.length<200)break;
      if(page===ZKILL_MAX_PAGES){truncated=true;break}
      await sleep(ZKILL_PAGE_GAP_MS);
    }

    const rankedCharacters=rankPvpRows([...characters.values()]);
    for(const row of rankedCharacters)delete row._kills;
    delete corp._kills;
    const data={
      generatedAt:now(),
      pagesFetched,
      truncated,
      killmailsProcessed:seenKillIds.size,
      characters:rankedCharacters,
      corporation:corp,
      sourceComplete:!truncated,
    };
    cache={updatedAt:Date.now(),data,promise:null};
    zkillCorpLeaderboardCache.set(corpId,cache);
    return data;
  })().finally(()=>{
    const current=zkillCorpLeaderboardCache.get(corpId);
    if(current?.promise===pending)zkillCorpLeaderboardCache.set(corpId,{...current,promise:null});
  });

  zkillCorpLeaderboardCache.set(corpId,{...cache,promise:pending});
  return pending;
}

async function pvpLeaderboardForUser(user,{force=false}={}){
  const primaryId=Number(user?.primaryCharacterId);
  if(!primaryId)throw new Error('No primary EVE character is linked.');
  const character=(await esiGet(`https://esi.evetech.net/latest/characters/${primaryId}/?datasource=tranquility`)).data;
  const corporationId=Number(character?.corporation_id);
  if(!corporationId)throw new Error('Could not determine your corporation from EVE.');
  const corporation=(await esiGet(`https://esi.evetech.net/latest/corporations/${corporationId}/?datasource=tranquility`)).data;
  if(Number(corporation?.alliance_id)!==INIT_ALLIANCE_ID)throw new Error(`${corporation?.name||'Your corporation'} is not currently in INIT.`);

  const base=await buildInitZkillLeaderboard(force);
  let corpDirect=null,corpVerifyError=null;
  try{
    corpDirect=await buildCorpZkillLeaderboard(corporationId,force);
  }catch(err){
    corpVerifyError=String(err.message||err);
    console.warn('Corporation zKill verification failed',corpVerifyError);
  }

  // Clone the INIT-wide rows so we can replace this user's corporation with a
  // corporation-specific crawl. This catches participation that can be missed
  // by a very busy alliance-wide query/cache.
  const characterMap=new Map(base.characters.map(row=>[Number(row.id),{...row}]));
  if(corpDirect?.characters?.length){
    for(const row of corpDirect.characters){
      characterMap.set(Number(row.id),{
        ...row,
        corporationId,
      });
    }
  }
  const correctedCharacters=rankPvpRows([...characterMap.values()]);
  for(const row of correctedCharacters)row.rankActivity=row.rank;
  const iskRanked=[...correctedCharacters].sort((a,b)=>
    b.iskOnKillmails-a.iskOnKillmails||
    b.finalBlows-a.finalBlows||
    b.killmails-a.killmails||
    b.damageDone-a.damageDone||
    a.id-b.id
  );
  iskRanked.forEach((row,index)=>row.rankIsk=index+1);

  const corporationMap=new Map(base.corporations.map(row=>[Number(row.id),{...row}]));
  if(corpDirect?.corporation){
    corporationMap.set(corporationId,{...corpDirect.corporation});
  }

  const corpWeeklyStats=await zkillCorporationWeeklyStatsMany([...corporationMap.keys()],force);
  const correctedCorporations=[...corporationMap.values()].map(row=>{
    const weekly=corpWeeklyStats.get(Number(row.id));
    return weekly
      ?{...row,...weekly,statsVerified:true}
      :{...row,shipsDestroyed:Number(row.killmails)||0,pointsDestroyed:0,iskDestroyed:Number(row.iskOnKillmails)||0,globalRanks:{shipsDestroyed:null,pointsDestroyed:null,iskDestroyed:null},statsVerified:false};
  }).sort((a,b)=>
    b.shipsDestroyed-a.shipsDestroyed||
    b.pointsDestroyed-a.pointsDestroyed||
    b.iskDestroyed-a.iskDestroyed||
    a.id-b.id
  );
  correctedCorporations.forEach((row,index)=>row.rank=index+1);

  const corpBase=correctedCorporations.find(row=>Number(row.id)===corporationId)||null;
  const myMembersBase=correctedCharacters.filter(row=>Number(row.corporationId)===corporationId);
  const topCharacters=correctedCharacters.slice(0,100);
  const displayCharacterIds=[...new Set([...topCharacters,...myMembersBase].map(row=>row.id))];
  const corpIds=correctedCorporations.map(row=>row.id);
  const [charNames,corpNames]=await Promise.all([
    resolveUniverseNames(displayCharacterIds),
    resolveUniverseNames(corpIds),
  ]);

  const corpDisplay=correctedCorporations.slice(0,50);
  if(corpBase&&!corpDisplay.some(row=>row.id===corpBase.id))corpDisplay.push(corpBase);
  corpDisplay.sort((a,b)=>a.rank-b.rank);

  const decorateChar=row=>({
    rank:row.rankActivity||row.rank,
    rankActivity:row.rankActivity||row.rank,
    rankIsk:row.rankIsk||null,
    characterId:row.id,
    corporationId:row.corporationId,
    name:charNames.get(row.id)||String(row.id),
    isMyCorp:Number(row.corporationId)===corporationId,
    killmails:row.killmails,
    finalBlows:row.finalBlows,
    damageDone:row.damageDone,
    iskOnKillmails:row.iskOnKillmails,
  });
  const decorateCorp=row=>({
    rank:row.rank,
    corporationId:row.id,
    name:corpNames.get(row.id)||String(row.id),
    isMyCorp:Number(row.id)===corporationId,
    shipsDestroyed:Number(row.shipsDestroyed)||0,
    shipsLost:Number(row.shipsLost)||0,
    pointsDestroyed:Number(row.pointsDestroyed)||0,
    iskDestroyed:Number(row.iskDestroyed)||0,
    iskLost:Number(row.iskLost)||0,
    zkillGlobalRank:Number(row.globalRanks?.shipsDestroyed)||null,
    statsVerified:Boolean(row.statsVerified),
  });

  return{
    allianceId:INIT_ALLIANCE_ID,
    allianceName:'The Initiative.',
    windowSeconds:ZKILL_WINDOW_SECONDS,
    generatedAt:corpDirect?.generatedAt||base.generatedAt,
    pagesFetched:base.pagesFetched,
    truncated:base.truncated,
    killmailsProcessed:base.killmailsProcessed,
    activeCharacters:correctedCharacters.length,
    activeCorporations:correctedCorporations.length,
    myCorpVerified:Boolean(corpDirect),
    myCorpVerificationError:corpVerifyError,
    myCorpPagesFetched:corpDirect?.pagesFetched||0,
    myCorpKillmailsProcessed:corpDirect?.killmailsProcessed||0,
    myCorporation:{
      corporationId,
      name:String(corporation?.name||corpNames.get(corporationId)||corporationId),
      rank:corpBase?.rank||null,
      shipsDestroyed:corpBase?.shipsDestroyed||0,
      pointsDestroyed:corpBase?.pointsDestroyed||0,
      iskDestroyed:corpBase?.iskDestroyed||0,
      zkillGlobalRank:corpBase?.globalRanks?.shipsDestroyed||null,
      statsVerified:Boolean(corpBase?.statsVerified),
    },
    corporations:corpDisplay.map(decorateCorp),
    characters:topCharacters.map(decorateChar),
    myCorpMembers:myMembersBase.map(decorateChar),
  };
}
async function routeApi(req,res,url) {
  if(req.method==='GET'&&url.pathname==='/api/config')return json(res,200,{name:'JLR Miner Tracker',version:'2.3.78',ssoConfigured:Boolean(EVE_CLIENT_ID),callbackUrl:callbackUrl(req),publicUrl:requestBaseUrl(req),miningScope:MINING_SCOPE,skillsScope:SKILLS_SCOPE,fittingsScope:FITTINGS_SCOPE,assetsScope:ASSETS_SCOPE,locationScope:LOCATION_SCOPE,scopes:ESI_SCOPES,marketCharacterName:MARKET_CHARACTER_NAME});
  if(req.method==='GET'&&url.pathname==='/api/me'){const u=readSession(req);return json(res,200,{authenticated:Boolean(u),user:u?myProfile(u):null})}
  const user=requireUser(req,res);if(!user)return;
  if(req.method==='GET'&&url.pathname==='/api/state')return json(res,200,publicState());
  if(req.method==='GET'&&url.pathname==='/api/zkill/leaderboard'){
    const wantsRefresh=url.searchParams.get('refresh')==='1';
    const cacheAge=Date.now()-Number(zkillInitLeaderboardCache.updatedAt||0);
    const force=wantsRefresh&&cacheAge>=10*60*1000;
    try{return json(res,200,await pvpLeaderboardForUser(user,{force}))}
    catch(err){
      console.warn('zKill leaderboard refresh failed',String(err.message||err));
      if(zkillInitLeaderboardCache.data){
        try{
          const fallback=await pvpLeaderboardForUser(user,{force:false});
          return json(res,200,{...fallback,stale:true,refreshError:String(err.message||err)});
        }catch{}
      }
      return json(res,502,{error:'ZKILL_LEADERBOARD_FAILED',message:String(err.message||err)});
    }
  }
  if(req.method==='GET'&&url.pathname==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`event: state\ndata: ${JSON.stringify(publicState())}\n\n`);sseClients.add(res);req.on('close',()=>sseClients.delete(res));return}
  if(!sameOrigin(req))return json(res,403,{error:'BAD_ORIGIN'});
  if(req.method==='POST'&&url.pathname==='/api/scans/preview'){
    const body=await readBody(req,150_000);
    const characterId=String(body.characterId||user.primaryCharacterId||'');
    if(!user.characterIds.map(String).includes(characterId))return json(res,404,{error:'CHARACTER_NOT_LINKED',message:'Choose a linked mining toon.'});
    const ch=state.characters[characterId];
    if(!ch)return json(res,404,{error:'CHARACTER_NOT_LINKED',message:'Choose a linked mining toon.'});
    const scanText=String(body.text||'').trim();
    if(!scanText)return json(res,400,{error:'EMPTY_SCAN',message:'Copy the Probe Scanner rows in EVE, then try again.'});
    if(!(Array.isArray(ch.scopes)&&ch.scopes.includes(LOCATION_SCOPE)))return json(res,409,{error:'LOCATION_SCOPE_REQUIRED',message:'Update this toon’s EVE access before importing scans.'});
    try{
      const preview=await probeScanPreview(ch,scanText);
      const valid=Boolean(preview.scan?.valid||preview.a0?.scan?.valid||preview.boardScan?.valid);
      if((preview.tracked||preview.a0?.tracked||preview.boardScan?.boardTracked)&&!valid)return json(res,400,{error:'INVALID_SCAN',message:'This does not look like copied Probe Scanner rows. Copy the complete scanner list and try again.',preview});
      await save();
      if(preview.correction?.applied||preview.a0?.tracked||preview.boardScan?.recorded)broadcast();
      return json(res,200,{ok:true,...preview});
    }catch(err){
      if(err.code==='LOCATION_SCOPE_REQUIRED')return json(res,409,{error:err.code,message:err.message});
      throw err;
    }
  }
  const fm=url.pathname.match(/^\/api\/fields\/([^/]+)$/);
  if(fm&&req.method==='PUT'){const system=decodeURIComponent(fm[1]);const f=state.fields[system];if(!f)return json(res,404,{error:'UNKNOWN_SYSTEM'});const body=await readBody(req);const status=String(body.status||'');if(!['ready','picked','cleared'].includes(status))return json(res,400,{error:'BAD_STATUS'});if(f.status==='cleared'&&f.timerEndsAt&&Date.parse(f.timerEndsAt)>Date.now())return json(res,409,{error:'TIMER_ACTIVE',message:'The 10-hour timer is already running and cannot be restarted or changed.'});if(status==='cleared'&&body.confirm!==true)return json(res,409,{error:'CONFIRM_REQUIRED'});f.status=status;f.updatedAt=now();f.timerEndsAt=status==='cleared'?new Date(Date.now()+TEN_HOURS).toISOString():null;f.autoReopenedAt=null;f.autoReopenReason=null;f.autoReopenM3=null;if(status==='cleared'){state.scans||={};state.scans[system]={lastScanAt:f.updatedAt,scannerRowCount:Number(state.scans[system]?.scannerRowCount)||0,kinds:['t3'],source:'clear-report'}}await save();broadcast();return json(res,200,{ok:true,field:f})}
  const nm=url.pathname.match(/^\/api\/fields\/([^/]+)\/notes$/);
  if(nm&&req.method==='POST'){const system=decodeURIComponent(nm[1]);const f=state.fields[system];if(!f)return json(res,404,{error:'UNKNOWN_SYSTEM'});const body=await readBody(req);const note=String(body.text||'').trim();if(!note||note.length>240)return json(res,400,{error:'BAD_NOTE',message:'Enter a note of 1 to 240 characters.'});f.notes.push({id:randomId(8),text:note,createdAt:now()});await save();broadcast();return json(res,201,{ok:true,field:f})}
  const cm=url.pathname.match(/^\/api\/fields\/([^/]+)\/cherry$/);
  if(cm&&req.method==='POST'){const system=decodeURIComponent(cm[1]);const f=state.fields[system];if(!f)return json(res,404,{error:'UNKNOWN_SYSTEM'});f.cherryPicked=true;f.updatedAt=now();await save();broadcast();return json(res,200,{ok:true,field:f})}
  if(req.method==='POST'&&url.pathname==='/api/esi/sync'){syncUserCharacters(user).catch(console.error);return json(res,202,{ok:true,queuedCharacters:user.characterIds.length})}
  if(req.method==='DELETE'&&url.pathname.startsWith('/api/me/characters/')){const id=url.pathname.split('/').pop();if(!user.characterIds.includes(id))return json(res,404,{error:'NOT_LINKED'});if(user.characterIds.length<=1)return json(res,409,{error:'LAST_LOGIN_TOON',message:'Add another toon before disconnecting your last EVE login character.'});delete state.characters[id];if(state.esi.ledgerFieldSnapshots)delete state.esi.ledgerFieldSnapshots[id];user.characterIds=user.characterIds.filter(x=>x!==id);if(String(state.market.characterId||'')===String(id)){state.market.characterId=null;state.market.characterName=null;state.market.refreshTokenEnc=null;state.market.scopes=[];state.market.authorizedAt=null;state.market.structureId=null;state.market.structureName=null;}if(user.primaryCharacterId===id){user.primaryCharacterId=user.characterIds[0];const next=state.characters[user.primaryCharacterId];if(next)user.displayName=next.name;}await save();broadcast();return json(res,200,{ok:true,user:myProfile(user)})}
  return json(res,404,{error:'NOT_FOUND'});
}

const server=http.createServer(async(req,res)=>{securityHeaders(res);try{const url=new URL(req.url,requestBaseUrl(req));
  if(req.method==='GET'&&url.pathname==='/auth/eve/market/start')return await startMarketSso(req,res,url);
  if(req.method==='GET'&&url.pathname==='/auth/eve/start')return await startSso(req,res,url);
  if(req.method==='GET'&&url.pathname==='/auth/eve/callback')return await handleCallback(req,res,url);
  if(req.method==='POST'&&url.pathname==='/auth/logout'){clearSessionCookie(res,req);return json(res,200,{ok:true})}
  if(url.pathname.startsWith('/api/'))return await routeApi(req,res,url);
  if(req.method==='GET'&&await serveStatic(req,res,url.pathname))return;
  text(res,404,'Not found');
}catch(err){console.error(err);if(!res.headersSent)json(res,500,{error:'SERVER_ERROR',message:String(err.message||err)});else res.end()}});
server.listen(PORT,'0.0.0.0',()=>{console.log(`JLR Miner Tracker v2.2 listening on port ${PORT}`);console.log(`Website SSO: ${EVE_CLIENT_ID?'configured':'not configured'}`);console.log(`Tracked T3 systems: ${SYSTEM_DEFS.length}`)});
setInterval(()=>resetExpired(true),15_000).unref();
async function runAutomaticSyncLoop(){
  const startedAt=Date.now();
  await syncAll().catch(console.error);
  const elapsed=Date.now()-startedAt;
  setTimeout(runAutomaticSyncLoop,Math.max(30_000,ESI_AUTO_REFRESH_MS-elapsed)).unref();
}
setTimeout(runAutomaticSyncLoop,5_000).unref();
setInterval(()=>refreshMarketPrices().catch(console.error),60*60_000).unref();
setTimeout(()=>refreshMarketPrices().catch(console.error),2_000).unref();
setInterval(()=>refreshFieldDistances().catch(console.error),24*60*60_000).unref();
setTimeout(()=>refreshFieldDistances().catch(console.error),1_000).unref();
