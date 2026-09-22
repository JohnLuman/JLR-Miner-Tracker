import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { DOCTRINE_SEED_B64 } from './lib/doctrine-seed.mjs';
import { parseProbeScan, parseA0Scan, parseIceScan } from './lib/probe-scan.mjs';
import { parseThreatPaste, compactThreatStats, threatActivityLabels, fountainThreatTags, jlrThreatScore, threatIgnoreReason } from './lib/threat-scan.mjs';
import {
  BASE_T3_ORE_REPROCESSING,
  aggregateTrackedT3Ledger,
  janiceImmediateBuyPrices,
  trackedT3OreVariant,
} from './lib/ledger-valuation.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PVP_DB_FILE = path.join(DATA_DIR, 'pvp-cache.json');
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
const CONTACTS_SCOPE = 'esi-characters.read_contacts.v1';
const CORPORATION_CONTACTS_SCOPE = 'esi-corporations.read_contacts.v1';
const ALLIANCE_CONTACTS_SCOPE = 'esi-alliances.read_contacts.v1';
const MARKET_STRUCTURE_SCOPE = 'esi-markets.structure_markets.v1';
const SEARCH_STRUCTURES_SCOPE = 'esi-search.search_structures.v1';
const READ_STRUCTURES_SCOPE = 'esi-universe.read_structures.v1';
const THREAT_CONTACT_SCOPES = [CONTACTS_SCOPE, CORPORATION_CONTACTS_SCOPE, ALLIANCE_CONTACTS_SCOPE];
const ESI_SCOPES = [MINING_SCOPE, SKILLS_SCOPE, FITTINGS_SCOPE, ASSETS_SCOPE, LOCATION_SCOPE, ...THREAT_CONTACT_SCOPES];
const MARKET_SCOPES = [MARKET_STRUCTURE_SCOPE, SEARCH_STRUCTURES_SCOPE, READ_STRUCTURES_SCOPE];
const MARKET_CHARACTER_NAME = String(process.env.MARKET_CHARACTER_NAME || 'John Leman Raholan').trim();
const DEFAULT_TRACKER_CORPORATION_ID = 1831383486; // TEMPLAR. [TMP.]
const TRACKER_CORPORATION_ID_ENV = Number(process.env.TRACKER_CORPORATION_ID)||DEFAULT_TRACKER_CORPORATION_ID;
const TRACKER_ACCESS_CACHE_MS = 5 * 60 * 1000;
const MARKET_STRUCTURE_ID_ENV = String(process.env.MARKET_STRUCTURE_ID || '').trim();
const JANICE_API_KEY = String(process.env.JANICE_API_KEY || '').trim();
const JANICE_API_URL = String(process.env.JANICE_API_URL || 'https://janice.e-351.com/api/rest/v2').trim().replace(/\/$/,'');
const DOCTRINE_MARKET_STRUCTURE_ID = String(process.env.DOCTRINE_MARKET_STRUCTURE_ID || '1045667241057').trim();
const DOCTRINE_CN_REFRESH_MS = 10 * 60 * 1000;
const DOCTRINE_JITA_REFRESH_MS = 60 * 60 * 1000;
const DOCTRINE_HISTORY_REFRESH_MS = 24 * 60 * 60 * 1000;
const DOCTRINE_ACCESS_CACHE_MS = 15 * 60 * 1000;
const DOCTRINE_BLUE_STANDING = 5;
const DOCTRINE_JITA_SELL_FRACTION = 0.05;
const DOCTRINE_TRADE_MULTIPLIER = 1.0587;
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
  32918: 'Mining Frigate',
  25544: 'Gas Cloud Harvesting',
};
const MINING_HULLS = new Set(['Hulk','Mackinaw','Skiff','Covetor','Retriever','Procurer','Porpoise','Orca','Rorqual','Outrider','Venture','Prospect','Endurance','Venture Consortium Issue']);
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
const ZKILL_ARCHIVE_RETENTION_MS = 8 * 24 * 60 * 60 * 1000;
const ZKILL_ARCHIVE_REFRESH_MS = 15 * 60 * 1000;
const HEAVY_FIGHTER_GROUP_ID = 1653;
const HEAVY_FIGHTER_TRACKER_CACHE_MS = 60 * 1000;
const HEAVY_FIGHTER_TRACKER_WINDOW_SECONDS = 24 * 60 * 60;
const TRACKER_R2Z2_BASE_URL = 'https://r2z2.zkillboard.com/ephemeral';
const TRACKER_R2Z2_EDGE_WAIT_MS = 6 * 1000;
const TRACKER_R2Z2_REQUEST_GAP_MS = 120;
const TRACKER_R2Z2_ERROR_WAIT_MS = 5 * 1000;
const TRACKER_LIVE_RETENTION_MS = 24 * 60 * 60 * 1000;
const TRACKER_R2Z2_ENABLED = String(process.env.TRACKER_R2Z2_ENABLED || 'true').trim().toLowerCase() !== 'false';
const TRACKER_TTS_WORKER_URL = String(process.env.TRACKER_TTS_WORKER_URL || '').trim().replace(/\/$/,'');
const TRACKER_TTS_WORKER_TOKEN = String(process.env.TRACKER_TTS_WORKER_TOKEN || '').trim();
const TRACKER_TTS_TIMEOUT_MS = clamp(process.env.TRACKER_TTS_TIMEOUT_MS,3_000,60_000,20_000);
const TRACKER_TTS_CACHE_DIR = path.join(DATA_DIR,'tracker-voice-cache');
const ZKILL_LIFETIME_DAMAGE_CACHE_MS = 24 * 60 * 60 * 1000;
const ZKILL_LIFETIME_PAGE_GAP_MS = 700;
const THREAT_CHARACTER_CACHE_MS = 6 * 60 * 60 * 1000;
const THREAT_CONTACTS_CACHE_MS = 15 * 60 * 1000;
const THREAT_MAX_CHARACTERS = 1000;
const THREAT_FETCH_CONCURRENCY = 4;
const FOUNTAIN_THREAT_CACHE_MS = 60 * 60 * 1000;
const FOUNTAIN_THREAT_MAX_PAGES = 15;
// Perfect null-sec refine: T2 rigged Tatara + max skills + RX-804 implant.
const MAX_REFINE_YIELD = 0.90628105568;
const LEDGER_VALUATION_VERSION = 2;
const ORE_REPROCESSING = BASE_T3_ORE_REPROCESSING;
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
const GAS_TYPES = {
  'Celadon Cytoserocin':{compressedName:'Compressed Celadon Cytoserocin',volume:10,compressedVolume:1},
  'Malachite Cytoserocin':{compressedName:'Compressed Malachite Cytoserocin',volume:10,compressedVolume:1},
  'Malachite Mykoserocin':{compressedName:'Compressed Malachite Mykoserocin',volume:10,compressedVolume:1},
  'Lime Mykoserocin':{compressedName:'Compressed Lime Mykoserocin',volume:10,compressedVolume:1},
};
const GAS_REGIONS = {
  Fountain:{
    defaultGas:'Celadon Cytoserocin',
    gases:['Celadon Cytoserocin'],
    sites:[
      {name:'Flowing Nebula',gas:'Celadon Cytoserocin',region:'Fountain',security:'Null-sec',units:2000,clouds:1,guarded:false,hazard:'1,000 Thermal cloud damage'},
      {name:'Peacock Nebula',gas:'Celadon Cytoserocin',region:'Fountain / Pegasus',security:'Null-sec',units:6000,clouds:2,guarded:false,hazard:'1,000 EM + 1,000 Thermal cloud damage'},
      {name:'Thick Nebula',gas:'Celadon Cytoserocin',region:'Fountain / Pegasus',security:'Null-sec',units:1000,clouds:1,guarded:true,hazard:'NPC guarded'},
      {name:'Diamond Nebula',gas:'Celadon Cytoserocin',region:'Fountain / Pegasus',security:'Null-sec',units:6000,clouds:2,guarded:true,hazard:'Multiple NPC waves'},
    ],
  },
  Aridia:{
    defaultGas:'Malachite Cytoserocin',
    gases:['Malachite Cytoserocin','Malachite Mykoserocin','Lime Mykoserocin'],
    sites:[
      {name:'Crimson Nebula',gas:'Malachite Cytoserocin',region:'Aridia',security:'Low-sec',units:1000,clouds:2,guarded:false,hazard:'No defenders • no cloud damage'},
      {name:'Blackeye Nebula',gas:'Malachite Mykoserocin',region:'Aridia',security:'High / Low-sec',units:6000,clouds:3,guarded:false,hazard:'No defenders • no cloud damage'},
      {name:'Wild Nebula',gas:'Malachite Mykoserocin',region:'Aridia',security:'High / Low-sec',units:2000,clouds:2,guarded:false,hazard:'No defenders • no cloud damage'},
      {name:'Helix Nebula',gas:'Lime Mykoserocin',region:'Aridia',security:'High / Low-sec',units:6000,clouds:3,guarded:false,hazard:'No defenders • no cloud damage'},
      {name:'Sister Nebula',gas:'Lime Mykoserocin',region:'Aridia',security:'High / Low-sec',units:2000,clouds:2,guarded:false,hazard:'No defenders • no cloud damage'},
    ],
  },
};
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
const SYSTEM_ORE_BY_NAME = Object.freeze(Object.fromEntries(SYSTEM_DEFS.map(x=>[x.system,x.ore])));
const oauthStates = new Map();
const sseClients = new Set();
let ssoMetadata = null;
let ssoMetadataAt = 0;
let syncInProgress = false;
let manualSyncCount = 0;
let marketRefreshInProgress = false;
let state = await loadState();
let pvpDb = await loadPvpDb();
let pvpDbWritePromise = Promise.resolve();
const tokenKey = await loadTokenKey();
const sessionSecret = crypto.createHash('sha256').update(process.env.SESSION_SECRET || tokenKey).digest();
const characterSyncPromises = new Map();
const characterAccessPromises = new Map();
const userSyncPromises = new Map();
const ledgerRowsByCharacter = new Map();
const universeNameCache = new Map();
const trackerLiveClients = new Set();
let heavyFighterTypeIdsCache = {at:0,ids:null,promise:null};
let trackerLiveLosses = [];
const trackerLiveSeenKillIds = new Set();
const trackerVoiceJobs = new Map();
let trackerR2z2State = {
  running:false,
  caughtUp:false,
  nextSequence:null,
  lastSequence:null,
  lastPollAt:null,
  lastSuccessAt:null,
  lastHeavyFighterAt:null,
  lastError:null,
  startedAt:null,
  liveSince:null,
};
let zkillInitLeaderboardCache = { updatedAt:0, data:null, promise:null };
let heavyFighterTrackerCache = {updatedAt:0,data:null,promise:null};
let trackerCorporationCache = {at:0,data:null,promise:null};
const trackerAccessCache = new Map();
let zkillInitArchiveRefreshPromise = null;
const zkillCorpLeaderboardCache = new Map();
const zkillCorpStatsCache = new Map();
let zkillCorpStatsBatchPromise = null;
let zkillCorpStatsPublished = {updatedAt:0,data:new Map()};
const zkillLifetimeDamageJobs = new Map();
const zkillLifetimeDamageProgress = new Map();
const pvpCorpMetaCache = new Map();
const corpAffiliationCache = new Map();
const threatScanCache = new Map();
const threatScanJobs = new Map();
const threatContactsCache = new Map();
const threatContactsPromises = new Map();
const threatShareCache = new Map();
let fountainThreatCache = {
  updatedAt:pvpDbTimestamp(pvpDb.threat?.fountain7d?.updatedAt),
  data:pvpDb.threat?.fountain7d?.data||null,
  promise:null,
};
let doctrineSeedCache=null;
let doctrineRefreshPromise=null;
let doctrineRequested=false;
const doctrineAccessCache=new Map();
if(pvpDb.init7d?.data){
  zkillInitLeaderboardCache={updatedAt:pvpDbTimestamp(pvpDb.init7d.updatedAt),data:pvpDb.init7d.data,promise:null};
}
for(const [corpId,entry] of Object.entries(pvpDb.corp7d||{})){
  if(entry?.data)zkillCorpLeaderboardCache.set(Number(corpId),{updatedAt:pvpDbTimestamp(entry.updatedAt),data:entry.data,promise:null});
}
for(const [corpId,entry] of Object.entries(pvpDb.corpWeekly||{})){
  if(entry?.data)zkillCorpStatsCache.set(Number(corpId),{updatedAt:pvpDbTimestamp(entry.updatedAt),data:entry.data,promise:null});
}
zkillCorpStatsPublished={
  updatedAt:Date.now(),
  data:new Map([...zkillCorpStatsCache.entries()].filter(([,cache])=>cache?.data).map(([id,cache])=>[id,cache.data])),
};
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

function freshPvpDb(){
  return {version:3,init7d:null,initKillmails:{},initArchive:{coverageStart:null,coverageEnd:null,updatedAt:null,pagesFetched:0},corp7d:{},corpWeekly:{},lifetime:{},threat:{characters:{},fountain7d:null}};
}
async function loadPvpDb(){
  try{
    const parsed=JSON.parse(await fsp.readFile(PVP_DB_FILE,'utf8'));
    const base=freshPvpDb();
    parsed.version=3;
    parsed.initKillmails ||= {};
    parsed.initArchive ||= {coverageStart:null,coverageEnd:null,updatedAt:null,pagesFetched:0};
    parsed.corp7d ||= {};
    parsed.corpWeekly ||= {};
    parsed.lifetime ||= {};
    parsed.threat ||= {};
    parsed.threat.characters ||= {};
    parsed.threat.fountain7d ||= null;
    return {...base,...parsed};
  }catch{
    return freshPvpDb();
  }
}
function savePvpDb(){
  const snapshot=JSON.stringify(pvpDb);
  pvpDbWritePromise=pvpDbWritePromise.catch(()=>{}).then(async()=>{
    const tmp=`${PVP_DB_FILE}.tmp`;
    await fsp.writeFile(tmp,snapshot,'utf8');
    await fsp.rename(tmp,PVP_DB_FILE);
  });
  return pvpDbWritePromise;
}
function pvpDbTimestamp(value){
  const t=Date.parse(String(value||''));
  return Number.isFinite(t)?t:0;
}

function buildCharacterFitCache(characterId,fittings=[],cachedAt=now()){
  const stamp=cachedAt||now();
  const byFittingId={};
  for(const fit of Array.isArray(fittings)?fittings:[]){
    const fittingId=String(fit?.fittingId||'');
    if(!fittingId)continue;
    const abyssalItemIds=(Array.isArray(fit.abyssalLasers)?fit.abyssalLasers:[])
      .map(row=>String(row?.itemId||''))
      .filter(Boolean);
    byFittingId[fittingId]={
      ...fit,
      localCache:{
        key:`${String(characterId)}:${fittingId}`,
        characterId:String(characterId),
        fittingId,
        cachedAt:stamp,
        physicalShipItemId:fit.abyssalShipItemId?String(fit.abyssalShipItemId):null,
        physicalShipName:fit.abyssalShipName||null,
        abyssalItemIds,
        abyssalSnapshot:(Array.isArray(fit.abyssalLasers)?fit.abyssalLasers:[]).map(row=>({...row})),
        matchStatus:fit.abyssalMatch||'none',
        matchMethod:fit.abyssalMatchMethod||null,
        verification:fit.abyssalVerification||null,
        verifiedAt:fit.abyssalVerifiedAt||null,
        retryAfter:fit.abyssalRetryAfter||null,
        errorCode:fit.abyssalErrorCode||null,
      },
    };
  }
  return{version:1,updatedAt:stamp,byFittingId};
}
function characterCachedFittings(ch){
  const by=ch?.fitCache?.byFittingId;
  if(by&&typeof by==='object'&&!Array.isArray(by)){
    return Object.values(by).filter(row=>row&&row.fittingId!==undefined);
  }
  return Array.isArray(ch?.fittings)?ch.fittings:[];
}
function migrateCharacterFitCache(ch){
  if(!ch||typeof ch!=='object')return ch;
  const cached=characterCachedFittings(ch);
  if(!ch.fitCache||typeof ch.fitCache!=='object'||!ch.fitCache.byFittingId){
    ch.fitCache=buildCharacterFitCache(ch.characterId,cached,ch.fittingsUpdatedAt||now());
  }else{
    // Normalize older cache entries so every fit has an auditable local mapping.
    ch.fitCache=buildCharacterFitCache(ch.characterId,cached,ch.fitCache.updatedAt||ch.fittingsUpdatedAt||now());
  }
  delete ch.fittings;
  return ch;
}
function storeCharacterFitCache(ch,fittings,cachedAt=now()){
  ch.fitCache=buildCharacterFitCache(ch.characterId,fittings,cachedAt);
  delete ch.fittings;
  return characterCachedFittings(ch);
}

function freshState() {
  return {
    version: 3,
    createdAt: now(),
    users: {},
    characters: {},
    scans: {},
    pvpLifetimeDamage: {},
    fields: Object.fromEntries(SYSTEM_DEFS.map((d) => [d.system, {
      status: 'ready', cherryPicked: false, timerEndsAt: null, notes: [], updatedAt: null,
      autoReopenedAt: null, autoReopenReason: null, autoReopenM3: null,
    }])),
    esi: {
      typeCache: {}, systemCache: {}, dailyFleet: [], dailyFleetValuationVersion: LEDGER_VALUATION_VERSION, performanceSamples: [], ledgerActivity: {}, ledgerFieldSnapshots: {}, fieldInference: {}, lastSyncAt: null, lastError: null,
    },
    market: {
      prices: {}, minerals: {}, icePrices: {}, iceProducts: {}, gasPrices: {}, iceFields: [], a0Fields: [], a0Reports: {}, a0ScannedAt: null, t3Distances: {}, history: { ore:{}, ice:{} },
      doctrine: {cnUpdatedAt:null,jitaUpdatedAt:null,historyUpdatedAt:null,updatedAt:null,structureId:null,structureName:null,cnByType:{},jitaByType:{},historyByType:{},lastError:null,refreshing:false},
      lastUpdatedAt: null, lastError: null,
      characterId: null, characterName: null, refreshTokenEnc: null, scopes: [], authorizedAt: null,
      structureId: null, structureName: null, privateLastError: null,
    },
  };
}
async function loadState() {
  try {
    const parsed = JSON.parse(await fsp.readFile(STATE_FILE, 'utf8'));
    const base = freshState();
    parsed.version = 3;
    parsed.users ||= {};
    parsed.characters ||= {};
    for(const ch of Object.values(parsed.characters))migrateCharacterFitCache(ch);
    parsed.scans ||= {};
    parsed.pvpLifetimeDamage ||= {};
    parsed.fields ||= {};
    for (const d of SYSTEM_DEFS) {
      const field = parsed.fields[d.system] = { ...base.fields[d.system], ...(parsed.fields[d.system] || {}) };
      if (!Array.isArray(field.notes)) field.notes = [];
      if (field.note && !field.notes.length) field.notes.push({ id: randomId(8), text: String(field.note), createdAt: field.updatedAt || now() });
      delete field.note;
    }
    const storedDailyFleetValuationVersion=Number(parsed.esi?.dailyFleetValuationVersion);
    parsed.esi = { ...base.esi, ...(parsed.esi || {}) };
    parsed.esi.typeCache ||= {}; parsed.esi.systemCache ||= {};
    if(!Array.isArray(parsed.esi.dailyFleet))parsed.esi.dailyFleet=[];
    if(storedDailyFleetValuationVersion!==LEDGER_VALUATION_VERSION)parsed.esi.dailyFleet=[];
    if(!Array.isArray(parsed.esi.performanceSamples))parsed.esi.performanceSamples=[];
    parsed.esi.ledgerActivity ||= {}; parsed.esi.ledgerFieldSnapshots ||= {}; parsed.esi.fieldInference ||= {};
    parsed.market = { ...base.market, ...(parsed.market || {}) };
    parsed.market.prices ||= {};
    parsed.market.minerals ||= {};
    parsed.market.icePrices ||= {};
    parsed.market.iceProducts ||= {};
    parsed.market.gasPrices ||= {};
    parsed.market.doctrine = {
      cnUpdatedAt:null,jitaUpdatedAt:null,historyUpdatedAt:null,updatedAt:null,structureId:null,structureName:null,
      cnByType:{},jitaByType:{},historyByType:{},lastError:null,refreshing:false,
      ...(parsed.market.doctrine||{}),
    };
    parsed.market.doctrine.cnByType ||= {};
    parsed.market.doctrine.jitaByType ||= {};
    parsed.market.doctrine.historyByType ||= {};
    parsed.market.doctrine.refreshing=false;
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
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://images.evetech.net https://web.ccpgamescdn.com data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self' https://login.eveonline.com; frame-ancestors 'none'");
}

function resetExpired(broadcastIt=true) {
  let changed=false; const t=Date.now();
  for (const [system,f] of Object.entries(state.fields)) {
    if (f.status==='cleared' && f.timerEndsAt && Date.parse(f.timerEndsAt)<=t) {
      f.status='ready'; f.cherryPicked=false; f.timerEndsAt=null; f.notes=[]; f.updatedAt=now();
      f.autoReopenedAt=null; f.autoReopenReason=null; f.autoReopenM3=null;
      state.esi.fieldInference ||= {};
      const inference=state.esi.fieldInference[system];
      if(inference)state.esi.fieldInference[system]={...inference,baselineAt:null,baselineDetected:false,minedM3SinceBaseline:0,depletionPct:null,needsScan:true,likelyDepleted:false,respawnCompletedAt:f.updatedAt};
      changed=true;
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
  const ledgerPublic=(system)=>{
    const row=state.esi.fieldInference?.[system]||null;
    if(!row?.lastLedgerAt)return null;
    const lastMs=Date.parse(row.lastLedgerAt||'');
    const active=Number.isFinite(lastMs)&&at-lastMs<=45*60*1000;
    const depletionPct=Number.isFinite(Number(row.depletionPct))?Math.max(0,Math.min(100,Number(row.depletionPct))):null;
    return{
      lastActivityAt:row.lastLedgerAt,
      active,
      lastDeltaM3:Math.max(0,Number(row.lastDeltaM3)||0),
      minedM3SinceBaseline:Math.max(0,Number(row.minedM3SinceBaseline)||0),
      siteM3:Math.max(0,Number(row.siteM3)||0),
      depletionPct,
      needsScan:Boolean(row.needsScan),
      likelyDepleted:Boolean(row.likelyDepleted),
      baselineAt:row.baselineAt||null,
      baselineDetected:Boolean(row.baselineDetected),
      confidence:row.likelyDepleted?'inferred-depletion':active?'ledger-confirmed-active':'ledger-history',
    };
  };
  const add=(system,row={})=>{
    const lastScanAt=row?.lastScanAt||row?.lastCheckedAt||null;
    const ms=Date.parse(lastScanAt||'');
    out[system]={
      lastScanAt,
      due:!Number.isFinite(ms)||at-ms>=A0_REPORT_TTL,
      nextUpdateAt:Number.isFinite(ms)?new Date(ms+A0_REPORT_TTL).toISOString():null,
      scannerRowCount:Number(row?.scannerRowCount)||0,
      kinds:Array.isArray(row?.kinds)?row.kinds:[],
      source:row?.source||null,
      t3:row?.t3&&typeof row.t3==='object'?{ore:String(row.t3.ore||''),detected:Boolean(row.t3.detected)}:null,
      ice:row?.ice&&Number(row.ice.expected)>0?{
        expected:Number(row.ice.expected),
        seen:Math.max(0,Number(row.ice.seen)||0),
        missing:Math.max(0,Number(row.ice.missing)||0),
      }:null,
      ledger:ledgerPublic(system),
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
      add(system,{lastScanAt:field.updatedAt,scannerRowCount:0,kinds:['t3'],source:'clear-report',t3:{ore:SYSTEM_MAP.get(system)?.ore||'',detected:false}});
    }
  }
  // Ledger evidence can exist before the first Probe Scanner import.
  for(const system of Object.keys(state.esi.fieldInference||{})){
    if(!out[system])add(system,{});
    else out[system].ledger=ledgerPublic(system);
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
  const sum = (predicate) => daily.filter(predicate).reduce((a,x)=>({m3:a.m3+Number(x.m3||0),jbv:a.jbv+Number(x.jbv||0),unpricedM3:a.unpricedM3+Number(x.unpricedM3||0)}),{m3:0,jbv:0,unpricedM3:0});
  const todayActual = sum(x=>x.date===today); const weekActual = sum(x=>x.date>=weekStart);
  const marketOres=effectiveOres();
  const marketSystems=effectiveSystems(marketOres);
  return {
    app:{name:'JLR Miner Tracker',version:'2.9.44',systemCount:SYSTEM_DEFS.length,privacy:'Shared field state, system scan timestamps, and fleet-level mining totals only. Character location is read during Probe Scanner import; the character location itself is not retained.'},
    source:{respawnHours:10,presetOutputs:source.presetOutputs,yieldCalculator:source.yieldCalculator,ores:marketOres,trendOres:TREND_ONLY_ORES.map(name=>({name,market:state.market.prices?.[name]||null})),systems:marketSystems,ice:Object.entries(ICE_REPROCESSING).map(([name,recipe])=>({name,volume:recipe.volume,recipe,market:state.market.icePrices?.[name]||null})),iceFields:state.market.iceFields||[],gas:{regions:GAS_REGIONS,types:Object.fromEntries(Object.entries(GAS_TYPES).map(([name,row])=>[name,{name,...row,market:state.market.gasPrices?.[name]||null}]))},a0Fields:a0PublicFields(),a0ScannedAt:state.market.a0ScannedAt||null,a0ReportHours:A0_REPORT_TTL/3600000},
    fields:state.fields,
    scans:scanActivityPublic(),
    market:{lastUpdatedAt:state.market.lastUpdatedAt,lastError:state.market.lastError,privateLastError:state.market.privateLastError||null,refreshing:marketRefreshInProgress,valuation:'MAX REFINE',maxRefineYield:MAX_REFINE_YIELD,jita:'Jita IV - Moon 4 - Caldari Navy Assembly Plant',jitaBuyBasis:state.market.jitaBuyBasis||'unavailable',janiceConfigured:Boolean(JANICE_API_KEY),janiceLastError:state.market.janiceLastError||null,local:CN_SYSTEM_NAME,titanBridgeRangeLy:TITAN_BRIDGE_RANGE_LY,history:marketHistoryPublic(),privateAccess:Boolean(state.market.refreshTokenEnc),marketCharacterName:state.market.characterName||null,structureName:state.market.structureName||null},
    esi:{configured:Boolean(EVE_CLIENT_ID),linkedCharacters:Object.keys(state.characters).length,lastSyncAt:state.esi.lastSyncAt,lastError:/temporarily unavailable\s*\(HTTP\s*\d+\)/i.test(String(state.esi.lastError||''))?null:state.esi.lastError,syncing:syncInProgress||manualSyncCount>0,scheduler:{...autoSyncPlan(Object.keys(state.characters).length||1),active:esiCharacterSyncActive,queued:esiCharacterSyncWaiters.length,backoffUntil:esiBackoffUntil>Date.now()?new Date(esiBackoffUntil).toISOString():null},actual:{today:todayActual,week:weekActual,basis:{day:'UTC',exactTypeId:true,exactGrade:true,valuationVersion:LEDGER_VALUATION_VERSION}},performance:{daily:daily.slice(0,90).map(row=>({date:String(row.date||''),m3:Number(row.m3||0),jbv:Number(row.jbv||0),unpricedM3:Number(row.unpricedM3||0),ores:row.ores&&typeof row.ores==='object'?row.ores:{}})),samples:(state.esi.performanceSamples||[]).slice(-672)}},
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
  const meta=await getSsoMetadata();
  const endpoint=meta.token_endpoint||'https://login.eveonline.com/v2/oauth/token';
  let lastStatus=0,lastMessage='';
  for(let attempt=0;attempt<3;attempt++){
    const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh});
    const headers={'Content-Type':'application/x-www-form-urlencoded','User-Agent':ESI_USER_AGENT};
    if(EVE_CLIENT_SECRET)headers.Authorization=`Basic ${Buffer.from(`${EVE_CLIENT_ID}:${EVE_CLIENT_SECRET}`).toString('base64')}`;
    else body.set('client_id',EVE_CLIENT_ID);
    try{
      const response=await fetch(endpoint,{method:'POST',headers,body,signal:AbortSignal.timeout(15_000)});
      lastStatus=response.status;
      const raw=await response.text().catch(()=>'');
      let payload={};
      try{payload=raw?JSON.parse(raw):{}}catch{}
      if(response.ok)return payload;
      lastMessage=String(payload.error_description||payload.error||raw||'').trim().slice(0,180);
      const temporary=response.status===429||response.status>=500;
      if(temporary&&attempt<2){
        const retrySeconds=clamp(response.headers.get('retry-after'),1,10,attempt+1);
        await sleep(retrySeconds*1000);
        continue;
      }
      if(temporary){
        const error=new Error(`EVE login service is temporarily unavailable (HTTP ${response.status}). Please try the scan again in a moment.`);
        error.code='EVE_SSO_TEMPORARY';
        error.status=response.status;
        throw error;
      }
      throw new Error(lastMessage||`Token refresh ${response.status}`);
    }catch(error){
      if(error?.code==='EVE_SSO_TEMPORARY')throw error;
      if(attempt<2&&(error?.name==='TimeoutError'||error?.name==='AbortError'||error instanceof TypeError)){
        await sleep((attempt+1)*1000);
        continue;
      }
      throw error;
    }
  }
  const error=new Error(`EVE login service is temporarily unavailable${lastStatus?` (HTTP ${lastStatus})`:''}. Please try the scan again in a moment.`);
  error.code='EVE_SSO_TEMPORARY';
  if(lastMessage)error.detail=lastMessage;
  throw error;
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
      fitCache:old?.fitCache||buildCharacterFitCache(charId,old?.fittings||[],old?.fittingsUpdatedAt||now()),
      fittingsUpdatedAt:old?.fittingsUpdatedAt||null,
      savedFittingsCount:old?.savedFittingsCount||0,
      abyssalStripCount:old?.abyssalStripCount||0,
      assetsUpdatedAt:old?.assetsUpdatedAt||null,
      assetsEsiCache:old?.assetsEsiCache||null,
      fittingsEsiCache:old?.fittingsEsiCache||null,
    };
    if(!user.characterIds.includes(charId))user.characterIds.push(charId); user.lastLoginAt=now(); if(!user.primaryCharacterId)user.primaryCharacterId=charId;
    threatContactsCache.delete(charId);
    await save();setSessionCookie(res,user.id,req);
    setTimeout(()=>syncUserCharacters(user,[charId]).catch(console.error),250);
    if(THREAT_CONTACT_SCOPES.every(scope=>identity.scopes.includes(scope))){
      setTimeout(()=>positiveStandingContactsForUser(user).catch(err=>console.warn('Threat contacts warmup failed',String(err.message||err))),350);
    }
    return redirect(res,pending.intent==='link'?'/?linked=1':'/?login=1');
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

async function loadDoctrineSeed(){
  if(doctrineSeedCache)return doctrineSeedCache;
  const encoded=String(DOCTRINE_SEED_B64||'').trim();
  if(!encoded)throw new Error('Doctrine seed is empty.');
  const raw=zlib.gunzipSync(Buffer.from(encoded,'base64')).toString('utf8');
  const parsed=JSON.parse(raw);
  if(!Array.isArray(parsed?.rows)||!parsed.rows.length)throw new Error('Doctrine seed is empty.');
  doctrineSeedCache=parsed;
  return parsed;
}
function doctrineCache(){
  state.market.doctrine ||= {cnByType:{},jitaByType:{},historyByType:{}};
  state.market.doctrine.cnByType ||= {};
  state.market.doctrine.jitaByType ||= {};
  state.market.doctrine.historyByType ||= {};
  return state.market.doctrine;
}
function doctrineTimestampFresh(value,maxAge){
  const t=Date.parse(String(value||''));
  return Number.isFinite(t)&&Date.now()-t<maxAge;
}
function doctrineMedian(values){
  const list=(values||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!list.length)return 0;
  const mid=Math.floor(list.length/2);
  return list.length%2?list[mid]:(list[mid-1]+list[mid])/2;
}
function doctrineHistoryStats(rows){
  const byDate=new Map((Array.isArray(rows)?rows:[]).map(row=>[String(row?.date||''),Math.max(0,Number(row?.volume)||0)]));
  const end=new Date();
  end.setUTCHours(0,0,0,0);
  end.setUTCDate(end.getUTCDate()-1);
  const vols=[];
  for(let offset=29;offset>=0;offset--){
    const d=new Date(end);
    d.setUTCDate(end.getUTCDate()-offset);
    vols.push(byDate.get(dateUTC(d))||0);
  }
  const last7=vols.slice(-7);
  const sum=x=>x.reduce((a,b)=>a+b,0);
  return{
    mean7:sum(last7)/7,
    mean30:sum(vols)/30,
    median30:doctrineMedian(vols),
  };
}
function doctrinePercentileSellPrice(orders,fraction=DOCTRINE_JITA_SELL_FRACTION){
  const sells=(orders||[])
    .filter(row=>!row?.is_buy_order&&Number(row?.price)>0&&Number(row?.volume_remain)>0)
    .sort((a,b)=>Number(a.price)-Number(b.price));
  const total=sells.reduce((sum,row)=>sum+Math.max(0,Number(row.volume_remain)||0),0);
  if(!(total>0))return 0;
  const target=Math.max(1,total*Math.max(.001,Math.min(1,Number(fraction)||.05)));
  let taken=0,value=0;
  for(const row of sells){
    if(taken>=target)break;
    const qty=Math.min(Math.max(0,Number(row.volume_remain)||0),target-taken);
    value+=qty*Number(row.price);
    taken+=qty;
  }
  return taken>0?value/taken:0;
}
async function doctrineMapLimit(items,limit,worker){
  const input=[...(items||[])],output=new Array(input.length);
  let cursor=0;
  const runners=Array.from({length:Math.min(Math.max(1,limit),Math.max(1,input.length))},async()=>{
    while(true){
      const index=cursor++;
      if(index>=input.length)return;
      output[index]=await worker(input[index],index);
    }
  });
  await Promise.all(runners);
  return output;
}
async function doctrineAccessForUser(user,{force=false}={}){
  if(!user?.id||!Array.isArray(user.characterIds)||!user.characterIds.length){
    return{allowed:false,reason:'NO_LINKED_CHARACTER',message:'Link an EVE character to access Doctrine Market.'};
  }
  const key=String(user.id)+':'+user.characterIds.map(String).sort().join(',');
  const cached=doctrineAccessCache.get(key);
  if(!force&&cached&&Date.now()-cached.at<DOCTRINE_ACCESS_CACHE_MS)return cached.data;

  const ids=user.characterIds.map(Number).filter(Number.isFinite);
  try{
    const {data}=await esiPost('https://esi.evetech.net/latest/characters/affiliation/?datasource=tranquility',ids);
    const direct=(Array.isArray(data)?data:[]).find(row=>Number(row?.alliance_id)===INIT_ALLIANCE_ID);
    if(direct){
      const linked=state.characters[String(direct.character_id)];
      const result={
        allowed:true,reason:'INIT_MEMBER',standing:10,
        characterId:String(direct.character_id),characterName:linked?.name||String(direct.character_id),
        checkedAt:now(),
      };
      doctrineAccessCache.set(key,{at:Date.now(),data:result});
      return result;
    }
  }catch(err){
    console.warn('Doctrine affiliation check failed',String(err.message||err));
  }

  try{
    const contacts=await positiveStandingContactsForUser(user);
    const maps=contacts?.standingData?.byOwner||{};
    let standing=-Infinity,owner=null;
    for(const [label,map] of Object.entries(maps)){
      const value=Number(map?.get?.(INIT_ALLIANCE_ID));
      if(Number.isFinite(value)&&value>standing){standing=value;owner=label}
    }
    if(standing>=DOCTRINE_BLUE_STANDING){
      const result={
        allowed:true,reason:'INIT_BLUE',standing,standingOwner:owner,
        characterId:String(contacts.sourceCharacterId||''),characterName:contacts.sourceCharacterName||null,
        checkedAt:now(),
      };
      doctrineAccessCache.set(key,{at:Date.now(),data:result});
      return result;
    }
    const result={
      allowed:false,reason:'INIT_BLUE_REQUIRED',
      message:'Doctrine Market requires a linked character that is in INIT or has INIT at +5 or higher standing.',
      standing:Number.isFinite(standing)?standing:null,checkedAt:now(),
    };
    doctrineAccessCache.set(key,{at:Date.now(),data:result});
    return result;
  }catch(err){
    const result={
      allowed:false,
      reason:err?.code==='CONTACT_SCOPE_REQUIRED'?'CONTACT_ACCESS_REQUIRED':'INIT_BLUE_REQUIRED',
      message:err?.code==='CONTACT_SCOPE_REQUIRED'
        ?'Update EVE access on a linked toon so JLR can verify INIT standings.'
        :'JLR could not verify this account as INIT or INIT-blue.',
      checkedAt:now(),
    };
    doctrineAccessCache.set(key,{at:Date.now(),data:result});
    return result;
  }
}
async function doctrineStructureSnapshot(seedRows){
  const access=await marketAccessToken();
  if(!access)throw new Error('John C-N market access is not authorized.');
  const candidates=[DOCTRINE_MARKET_STRUCTURE_ID,String(state.market?.doctrine?.structureId||''),String(state.market?.structureId||'')]
    .filter((id,index,list)=>id&&list.indexOf(id)===index);
  let selected=null;
  for(const id of candidates){
    try{
      const [info,orders]=await Promise.all([structureInfo(id,access.access),structureMarketOrders(id,access.access)]);
      selected={id:String(id),name:String(info?.name||id),orders};
      break;
    }catch(err){
      console.warn('Doctrine C-N structure candidate failed',id,String(err.message||err));
    }
  }
  if(!selected){
    const ids=await resolveUniverseIds([CN_SYSTEM_NAME]);
    const cnSystemId=ids.get(CN_SYSTEM_NAME);
    selected=await resolveMarketStructure(cnSystemId,access,seedRows.slice(0,100).map(row=>Number(row.typeId)));
  }
  if(!selected)throw new Error('John market checker could not access the doctrine market structure in C-N.');

  const targets=new Set(seedRows.map(row=>Number(row.typeId)));
  const byType={};
  for(const order of selected.orders||[]){
    if(order?.is_buy_order)continue;
    const typeId=Number(order?.type_id);
    if(!targets.has(typeId))continue;
    const key=String(typeId);
    const stock=Math.max(0,Number(order?.volume_remain)||0);
    const price=Number(order?.price)||0;
    const row=byType[key]||(byType[key]={stock:0,sell:0});
    row.stock+=stock;
    if(price>0&&(!(row.sell>0)||price<row.sell))row.sell=price;
  }
  return{id:selected.id,name:selected.name,byType};
}
async function refreshDoctrineMarket({forceCn=false,forceAll=false}={}){
  if(doctrineRefreshPromise)return doctrineRefreshPromise;
  const cache=doctrineCache();
  cache.refreshing=true;
  cache.lastError=null;
  const pending=(async()=>{
    const seed=await loadDoctrineSeed();
    const rows=seed.rows||[];
    try{
      const cnStale=forceCn||!doctrineTimestampFresh(cache.cnUpdatedAt,DOCTRINE_CN_REFRESH_MS);
      if(cnStale){
        try{
          const cn=await doctrineStructureSnapshot(rows);
          cache.cnByType=cn.byType;
          cache.cnUpdatedAt=now();
          cache.structureId=cn.id;
          cache.structureName=cn.name;
        }catch(err){
          cache.lastError=`C-N: ${String(err.message||err)}`;
          console.warn('Doctrine C-N refresh failed',String(err.message||err));
        }
      }

      const jitaStale=forceAll||!doctrineTimestampFresh(cache.jitaUpdatedAt,DOCTRINE_JITA_REFRESH_MS);
      if(jitaStale){
        let success=0;
        const next={...cache.jitaByType};
        await doctrineMapLimit(rows,6,async row=>{
          try{
            const orders=await marketOrders(JITA_REGION_ID,Number(row.typeId));
            next[String(row.typeId)]={sell:doctrinePercentileSellPrice(orders)};
            success++;
          }catch(err){
            console.warn('Doctrine Jita refresh failed',row.typeId,String(err.message||err));
          }
        });
        if(success){
          cache.jitaByType=next;
          cache.jitaUpdatedAt=now();
        }
      }

      const historyStale=forceAll||!doctrineTimestampFresh(cache.historyUpdatedAt,DOCTRINE_HISTORY_REFRESH_MS);
      if(historyStale){
        let success=0;
        const next={...cache.historyByType};
        await doctrineMapLimit(rows,6,async row=>{
          try{
            const {data}=await esiGet(`https://esi.evetech.net/latest/markets/${FOUNTAIN_REGION_ID}/history/?datasource=tranquility&type_id=${Number(row.typeId)}`);
            next[String(row.typeId)]=doctrineHistoryStats(data);
            success++;
          }catch(err){
            console.warn('Doctrine Fountain history refresh failed',row.typeId,String(err.message||err));
          }
        });
        if(success){
          cache.historyByType=next;
          cache.historyUpdatedAt=now();
        }
      }
      cache.updatedAt=now();
    }finally{
      cache.refreshing=false;
      await save();
    }
  })().catch(err=>{
    const cache=doctrineCache();
    cache.lastError=String(err.message||err);
    cache.refreshing=false;
    console.warn('Doctrine market refresh failed',cache.lastError);
  }).finally(()=>{doctrineRefreshPromise=null});
  doctrineRefreshPromise=pending;
  return pending;
}
async function doctrineMarketSnapshot(){
  const seed=await loadDoctrineSeed();
  const cache=doctrineCache();
  const cnLive=Boolean(cache.cnUpdatedAt);
  const jitaLive=Boolean(cache.jitaUpdatedAt);
  const historyLive=Boolean(cache.historyUpdatedAt);
  const rows=(seed.rows||[]).map(base=>{
    const id=String(base.typeId);
    const cn=cache.cnByType?.[id]||null;
    const jita=cache.jitaByType?.[id]||null;
    const history=cache.historyByType?.[id]||null;
    const stock=cnLive?Math.max(0,Number(cn?.stock)||0):Math.max(0,Number(base.snapshotStock)||0);
    const cnSell=cnLive?Math.max(0,Number(cn?.sell)||0):Math.max(0,Number(base.snapshotCnSell)||0);
    const jitaSell=jitaLive?Math.max(0,Number(jita?.sell)||0):Math.max(0,Number(base.snapshotJita)||0);

    let sold7=Math.max(.01,Number(base.snapshotSold7)||.01);
    let sold30=Math.max(.01,Number(base.snapshotSold30)||.01);
    if(historyLive&&history){
      sold7=Math.max(.01,(Number(history.mean7)||0)+.01);
      const median=Math.max(.01,(Number(history.median30)||0)+.01);
      const mean=Math.max(.01,(Number(history.mean30)||0)+.01);
      sold30=median<5?Math.max(median,mean):median;
    }

    const daysDynamic=sold30>0&&sold7>0?Math.min(stock/sold30,stock/sold7):0;
    const daysStandard=sold30>0?stock/sold30:0;
    const required=(30-daysStandard)*sold30;
    const cnJita=jitaSell>0?cnSell/jitaSell:0;
    const breakeven=jitaSell*DOCTRINE_TRADE_MULTIPLIER+Math.max(0,Number(base.haulCost)||0);
    const seedMargin=breakeven>0?cnSell/breakeven-1:0;
    return{
      typeId:Number(base.typeId),item:String(base.item||''),stock,sold7,sold30,daysDynamic,daysStandard,required,
      cnSell,jitaSell,cnJita,classification:String(base.classification||'Unclassified'),category:String(base.category||'Other'),
      breakeven,seedMargin,requiredValueJita:required*jitaSell,seed10Profit:breakeven*1.1,
    };
  });

  const ratioRows=rows.filter(row=>row.cnJita>0);
  const summary={
    date:dateUTC(),
    count:rows.length,
    zero:rows.filter(row=>row.stock<=0).length,
    need:rows.filter(row=>row.required>0).length,
    under2:rows.filter(row=>row.daysDynamic<2).length,
    alerts:rows.filter(row=>row.cnJita>1.3).length,
    seed:rows.filter(row=>row.seedMargin>0).length,
    avgMarkup:ratioRows.length?ratioRows.reduce((sum,row)=>sum+row.cnJita,0)/ratioRows.length:0,
    sellCap:rows.reduce((sum,row)=>sum+row.stock*row.cnSell,0),
    seed30:rows.reduce((sum,row)=>sum+Math.max(0,row.required)*row.jitaSell,0),
  };
  return{
    version:2,
    snapshotDate:seed.snapshotDate||null,
    live:true,
    summary,
    rows,
    status:{
      refreshing:Boolean(cache.refreshing||doctrineRefreshPromise),
      updatedAt:cache.updatedAt||null,
      cnUpdatedAt:cache.cnUpdatedAt||null,
      jitaUpdatedAt:cache.jitaUpdatedAt||null,
      historyUpdatedAt:cache.historyUpdatedAt||null,
      structureId:cache.structureId||DOCTRINE_MARKET_STRUCTURE_ID,
      structureName:cache.structureName||state.market.structureName||null,
      lastError:cache.lastError||null,
      sources:{
        cn:cnLive?'live-john-c-n':'workbook-fallback',
        jita:jitaLive?'live-esi-forge-percentile':'workbook-fallback',
        history:historyLive?'live-esi-fountain':'workbook-fallback',
      },
    },
  };
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

function effectiveJitaMineralPrices(){
  const prices={};
  for(const mineral of REFINING_MINERALS){
    const detail=state.market?.minerals?.[mineral]||{};
    const direct=Number(detail.effectiveJitaBuy ?? detail.janice?.buy ?? detail.jita?.buy);
    if(Number.isFinite(direct)&&direct>0){prices[mineral]=direct;continue}
    for(const ore of Object.values(state.market?.prices||{})){
      const fallback=Number(ore?.jita?.breakdown?.[mineral]?.unitPrice);
      if(Number.isFinite(fallback)&&fallback>0){prices[mineral]=fallback;break}
    }
  }
  return prices;
}

async function fetchJaniceMineralBuyPrices(){
  if(!JANICE_API_KEY)return null;
  const response=await fetch(`${JANICE_API_URL}/pricer?market=2`,{
    method:'POST',
    headers:{'Content-Type':'text/plain','X-ApiKey':JANICE_API_KEY,'User-Agent':ESI_USER_AGENT},
    body:REFINING_MINERALS.join('\n'),
    signal:AbortSignal.timeout(20_000),
  });
  if(!response.ok)throw new Error(`Janice pricer ${response.status}`);
  const prices=janiceImmediateBuyPrices(await response.json(),REFINING_MINERALS);
  if(!prices)throw new Error('Janice returned incomplete Jita mineral buy prices');
  return prices;
}

function rebuildDailyFleetFromLedgerCache(){
  const rows=[...ledgerRowsByCharacter.values()].flat();
  state.esi.dailyFleet=aggregateTrackedT3Ledger({
    rows,
    typeById:state.esi.typeCache,
    systemById:state.esi.systemCache,
    systemOreByName:SYSTEM_ORE_BY_NAME,
    priceByMineral:effectiveJitaMineralPrices(),
    refineYield:MAX_REFINE_YIELD,
  }).slice(0,90);
  state.esi.dailyFleetValuationVersion=LEDGER_VALUATION_VERSION;
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
    &&Object.keys(ICE_REPROCESSING).every(name=>state.market?.icePrices?.[name]?.valuation==='max-refine-ice'&&state.market?.icePrices?.[name]?.trackingBasis==='jita-refine-ex-heavy-water')
    &&Object.keys(GAS_TYPES).every(name=>state.market?.gasPrices?.[name]?.valuation==='raw-gas-market');
  const today=dateUTC();
  const historyCurrent=MARKET_ORE_NAMES.every(name=>(state.market?.history?.ore?.[name]||[]).some(x=>x.date===today))
    &&Object.keys(ICE_REPROCESSING).every(name=>(state.market?.history?.ice?.[name]||[]).some(x=>x.date===today));
  const desiredJitaBuyBasis=JANICE_API_KEY?'janice-immediate-buy':'reachable-from-jita-4-4';
  const jitaBuyBasisCurrent=state.market?.jitaBuyBasis===desiredJitaBuyBasis;
  const ledgerValuationCurrent=Number(state.market?.ledgerValuationVersion)===LEDGER_VALUATION_VERSION;
  const t3DistancesCurrent=SYSTEM_DEFS.every(d=>typeof state.market?.t3Distances?.[d.system]==='number'&&Number.isFinite(state.market.t3Distances[d.system]));
  const a0ScanAt=Date.parse(state.market?.a0ScannedAt||'');
  const a0Current=Array.isArray(state.market?.a0Fields)&&Number.isFinite(a0ScanAt)&&Date.now()-a0ScanAt<MARKET_REFRESH_MS;
  if(!force&&valuationCurrent&&historyCurrent&&jitaBuyBasisCurrent&&ledgerValuationCurrent&&t3DistancesCurrent&&a0Current&&Number.isFinite(last)&&Date.now()-last<MARKET_REFRESH_MS)return;
  marketRefreshInProgress=true;
  state.market.lastError=null;
  state.market.privateLastError=null;
  broadcast();
  try{
    const gasMarketNames=Object.entries(GAS_TYPES).flatMap(([name,row])=>[name,row.compressedName]);
    const names=[...MARKET_ORE_NAMES.map(name=>ORE_TYPE_NAME[name]||name),...REFINING_MINERALS,...Object.keys(ICE_REPROCESSING),...ICE_PRODUCTS,...gasMarketNames,...ICE_FIELD_SYSTEMS.map(x=>x[0]),...SYSTEM_DEFS.map(x=>x.system),CN_SYSTEM_NAME];
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
    const gasTypeIds=Object.entries(GAS_TYPES).flatMap(([name,row])=>[Number(ids.get(name)),Number(ids.get(row.compressedName))]).filter(Number.isFinite);
    let privateMarket=null;
    if(state.market.refreshTokenEnc){
      try{
        const access=await marketAccessToken();
        privateMarket=await resolveMarketStructure(cnSystemId,access,[...mineralTypeIds,...iceProductTypeIds,...rawIceTypeIds,...gasTypeIds]);
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

    let jitaBuyBasis='reachable-from-jita-4-4';
    state.market.janiceLastError=null;
    if(JANICE_API_KEY){
      try{
        const janicePrices=await fetchJaniceMineralBuyPrices();
        Object.assign(mineralPrices.jita,janicePrices);
        jitaBuyBasis='janice-immediate-buy';
        state.market.janiceLastUpdatedAt=now();
      }catch(err){
        state.market.janiceLastError=String(err.message||err);
        console.warn('Janice Jita-buy refresh unavailable; using ESI fallback',state.market.janiceLastError);
      }
    }
    for(const mineral of REFINING_MINERALS){
      const effectiveJitaBuy=Number(mineralPrices.jita[mineral]);
      if(!mineralPrices.detail[mineral])continue;
      mineralPrices.detail[mineral].effectiveJitaBuy=Number.isFinite(effectiveJitaBuy)&&effectiveJitaBuy>0?effectiveJitaBuy:null;
      mineralPrices.detail[mineral].effectiveJitaSource=jitaBuyBasis;
      mineralPrices.detail[mineral].janice=jitaBuyBasis==='janice-immediate-buy'?{buy:effectiveJitaBuy,marketId:2}:null;
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

    const gasPrices={...state.market.gasPrices};
    for(const [gasName,gasSpec] of Object.entries(GAS_TYPES)){
      const gasRawTypeId=ids.get(gasName);
      const gasCompressedTypeId=ids.get(gasSpec.compressedName);
      if(!gasRawTypeId){console.warn('Gas type not resolved',gasName);continue}
      const rawOrders=await marketOrders(JITA_REGION_ID,gasRawTypeId);
      const rawJita=await bestPricesReachableAt(rawOrders,JITA_SYSTEM_ID,JITA_44_STATION_ID);
      const rawCn=privateMarket?bestOrderPrices(privateMarket.orders.filter(o=>Number(o.type_id)===Number(gasRawTypeId))):{buy:null,sell:null};
      let compressedJita={buy:null,sell:null},compressedCn={buy:null,sell:null};
      if(gasCompressedTypeId){
        const compressedOrders=await marketOrders(JITA_REGION_ID,gasCompressedTypeId);
        compressedJita=await bestPricesReachableAt(compressedOrders,JITA_SYSTEM_ID,JITA_44_STATION_ID);
        if(privateMarket)compressedCn=bestOrderPrices(privateMarket.orders.filter(o=>Number(o.type_id)===Number(gasCompressedTypeId)));
      }
      gasPrices[gasName]={
        typeId:Number(gasRawTypeId)||null,
        compressedTypeId:Number(gasCompressedTypeId)||null,
        volume:Number(gasSpec.volume)||10,
        compressedVolume:Number(gasSpec.compressedVolume)||1,
        updatedAt:now(),
        valuation:'raw-gas-market',
        raw:{
          jita:rawJita,
          cn:{...rawCn,source:privateMarket?'john-private-structure':'unavailable'},
        },
        compressed:{
          name:gasSpec.compressedName,
          jita:compressedJita,
          cn:{...compressedCn,source:privateMarket?'john-private-structure':'unavailable'},
        },
      };
    }

    state.market.prices=next;
    state.market.minerals=mineralPrices.detail;
    state.market.icePrices=icePrices;
    state.market.iceProducts=iceProductPrices.detail;
    state.market.gasPrices=gasPrices;
    state.market.iceFields=iceFields;
    if(Array.isArray(a0Fields)){state.market.a0Fields=a0Fields;state.market.a0ScannedAt=now()}
    state.market.t3Distances=t3Distances;
    state.market.jitaBuyBasis=jitaBuyBasis;
    state.market.ledgerValuationVersion=LEDGER_VALUATION_VERSION;
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
    if(ledgerRowsByCharacter.size)rebuildDailyFleetFromLedgerCache();
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
function esiCacheInfo(headers){
  const cacheControl=String(headers?.get?.('cache-control')||'');
  const maxAgeMatch=cacheControl.match(/(?:^|[,\s])max-age=(\d+)/i);
  const maxAgeSeconds=maxAgeMatch?Number(maxAgeMatch[1]):null;
  const responseDateMs=Date.parse(String(headers?.get?.('date')||''));
  const expiresMs=Date.parse(String(headers?.get?.('expires')||''));
  const lastModifiedMs=Date.parse(String(headers?.get?.('last-modified')||''));
  const freshUntilMs=Number.isFinite(expiresMs)
    ?expiresMs
    :(Number.isFinite(responseDateMs)&&Number.isFinite(maxAgeSeconds)?responseDateMs+maxAgeSeconds*1000:NaN);
  return{
    cacheControl:cacheControl||null,
    maxAgeSeconds:Number.isFinite(maxAgeSeconds)?maxAgeSeconds:null,
    responseDate:Number.isFinite(responseDateMs)?new Date(responseDateMs).toISOString():null,
    lastModified:Number.isFinite(lastModifiedMs)?new Date(lastModifiedMs).toISOString():null,
    freshUntil:Number.isFinite(freshUntilMs)?new Date(freshUntilMs).toISOString():null,
  };
}
async function characterFittingsBundle(characterId,access) {
  const response=await esiGet(`https://esi.evetech.net/latest/characters/${characterId}/fittings/?datasource=tranquility`,access);
  return{rows:response.data,cache:esiCacheInfo(response.headers)};
}
async function characterFittings(characterId,access) {
  return (await characterFittingsBundle(characterId,access)).rows;
}
async function characterAssetsBundle(characterId,access) {
  const first=await esiGet(`https://esi.evetech.net/latest/characters/${characterId}/assets/?datasource=tranquility&page=1`,access);
  let rows=[...first.data];
  const pages=Math.max(1,Number(first.headers.get('x-pages')||1));
  for(let p=2;p<=pages;p++)rows.push(...(await esiGet(`https://esi.evetech.net/latest/characters/${characterId}/assets/?datasource=tranquility&page=${p}`,access)).data);
  return{rows,cache:esiCacheInfo(first.headers)};
}
async function characterAssets(characterId,access) {
  return (await characterAssetsBundle(characterId,access)).rows;
}
async function characterAssetNames(characterId,itemIds,access) {
  const ids=[...new Set((itemIds||[]).map(id=>Number(id)).filter(Number.isSafeInteger))];
  const names=new Map();
  for(let i=0;i<ids.length;i+=1000){
    const batch=ids.slice(i,i+1000);
    if(!batch.length)continue;
    const {data}=await esiPost(`https://esi.evetech.net/latest/characters/${characterId}/assets/names/?datasource=tranquility`,batch,access);
    for(const row of Array.isArray(data)?data:[]){
      if(row?.item_id!==undefined)names.set(String(row.item_id),String(row.name||'').trim());
    }
  }
  return names;
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
async function abyssalStripSnapshot(assets=[],context={}) {
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
        shipCustomName:null,
        sourceTypeId,
        sourceName:sourceTypeId?(state.esi.typeCache[String(sourceTypeId)]?.name||null):null,
        miningAmount:pickDogmaValue(attributes,'miningAmount'),
        duration:pickDogmaValue(attributes,'duration'),
        optimalRange:pickDogmaValue(attributes,'maxRange','optimalRange'),
        criticalSuccessChance:pickDogmaValue(attributes,'criticalSuccessChance'),
        criticalSuccessBonusYield:pickDogmaValue(attributes,'criticalSuccessBonusYield'),
      });
    }catch(err){
      console.warn('Abyssal strip lookup failed',asset.item_id,String(err.message||err));
    }
  }

  const characterId=context?.characterId;
  const access=context?.access;
  const parentIds=[...new Set(out.map(row=>row.parentItemId).filter(Boolean))];
  const parentSet=new Set(parentIds.map(String));
  const fittedFlag=flag=>/^(HiSlot|MedSlot|LoSlot|RigSlot|SubSystemSlot|ServiceSlot)\d+$/i.test(String(flag||''));
  const fittedByShip=new Map();
  for(const asset of assets){
    const shipId=String(asset?.location_id||'');
    if(!parentSet.has(shipId)||!fittedFlag(asset?.location_flag))continue;
    if(!fittedByShip.has(shipId))fittedByShip.set(shipId,[]);
    fittedByShip.get(shipId).push({
      itemId:String(asset.item_id||''),
      typeId:Number(asset.type_id||0),
      flag:String(asset.location_flag||''),
      quantity:Number(asset.quantity||1),
    });
  }
  for(const row of out){
    row.shipFittedItems=(fittedByShip.get(String(row.parentItemId||''))||[]).map(item=>({...item}));
  }
  if(characterId&&access&&parentIds.length){
    try{
      const names=await characterAssetNames(characterId,parentIds,access);
      for(const row of out)row.shipCustomName=row.parentItemId?(names.get(String(row.parentItemId))||null):null;
    }catch(err){
      console.warn('Abyssal ship-name lookup failed',String(err.message||err));
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
async function miningFittingSnapshot(fittings=[],abyssalModules=[],previousFittings=[]) {
  await ensureType(fittings.map(f=>f.ship_type_id));
  const mine=fittings.filter(f=>MINING_HULLS.has(state.esi.typeCache[String(f.ship_type_id)]?.name));
  await ensureType(mine.flatMap(f=>(f.items||[]).map(i=>i.type_id)));

  const normalizeName=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
  const prepared=mine.map(f=>{
    const shipName=state.esi.typeCache[String(f.ship_type_id)]?.name||`Type ${f.ship_type_id}`;
    const items=(f.items||[]).map(i=>({
      typeId:i.type_id,
      name:state.esi.typeCache[String(i.type_id)]?.name||`Type ${i.type_id}`,
      flag:i.flag,
      quantity:Number(i.quantity||1),
    }));
    const required=items.filter(i=>ABYSSAL_STRIP_TYPES.has(Number(i.typeId)));
    const needed=new Map();
    for(const row of required)needed.set(Number(row.typeId),(needed.get(Number(row.typeId))||0)+Number(row.quantity||1));
    const requirementKey=`${Number(f.ship_type_id)}|${[...needed.entries()].sort((a,b)=>a[0]-b[0]).map(([typeId,count])=>`${typeId}:${count}`).join(',')}`;
    return{f,shipName,items,required,needed,requirementKey,normalizedFitName:normalizeName(f.name)};
  });

  const previousByFittingId=new Map();
  const previousByName=new Map();
  for(const prior of Array.isArray(previousFittings)?previousFittings:[]){
    const id=String(prior?.fittingId||'');
    if(id)previousByFittingId.set(id,prior);
    const key=`${Number(prior?.shipTypeId||0)}|${normalizeName(prior?.name)}`;
    if(!normalizeName(prior?.name))continue;
    if(!previousByName.has(key))previousByName.set(key,[]);
    previousByName.get(key).push(prior);
  }

  const physicalGroups=new Map();
  for(const mod of abyssalModules.filter(row=>row.parentItemId)){
    if(!physicalGroups.has(mod.parentItemId))physicalGroups.set(mod.parentItemId,[]);
    physicalGroups.get(mod.parentItemId).push(mod);
  }

  const fitNameCounts=new Map();
  const requirementCounts=new Map();
  for(const row of prepared.filter(row=>row.required.length)){
    if(row.normalizedFitName)fitNameCounts.set(row.normalizedFitName,(fitNameCounts.get(row.normalizedFitName)||0)+1);
    requirementCounts.set(row.requirementKey,(requirementCounts.get(row.requirementKey)||0)+1);
  }

  function groupSatisfies(group,row){
    if(!group.length)return false;
    const first=group[0];
    if(Number(first.shipTypeId||0)!==Number(row.f.ship_type_id||0))return false;
    const have=new Map();
    for(const mod of group)have.set(Number(mod.typeId),(have.get(Number(mod.typeId))||0)+1);
    return [...row.needed].every(([typeId,count])=>(have.get(typeId)||0)>=count);
  }
  function publicAbyssalCandidate(candidate){
    return{
      shipItemId:String(candidate.shipItemId),
      shipName:candidate.shipCustomName||null,
      hullName:String(candidate.group?.[0]?.shipName||''),
      lasers:(candidate.group||[]).map(({parentItemId,...mod})=>({
        itemId:String(mod.itemId||''),
        typeId:Number(mod.typeId||0),
        name:mod.name||null,
        sourceTypeId:Number(mod.sourceTypeId||0),
        sourceName:mod.sourceName||null,
        miningAmount:mod.miningAmount,
        duration:mod.duration,
        optimalRange:mod.optimalRange,
        criticalSuccessChance:mod.criticalSuccessChance,
        criticalSuccessBonusYield:mod.criticalSuccessBonusYield,
        locationFlag:mod.locationFlag||null,
        shipTypeId:Number(mod.shipTypeId||0),
        shipName:mod.shipName||null,
        shipCustomName:mod.shipCustomName||null,
      })),
    };
  }

  return prepared.map(row=>{
    let matched=[];
    let abyssalMatch='none';
    let abyssalMatchMethod=null;
    let abyssalShipItemId=null;
    let abyssalShipName=null;
    let abyssalCandidates=[];

    if(row.required.length){
      const candidates=[...physicalGroups.entries()]
        .filter(([,group])=>groupSatisfies(group,row))
        .map(([shipItemId,group])=>({
          shipItemId,
          group,
          shipCustomName:String(group[0]?.shipCustomName||'').trim(),
          fittedItems:Array.isArray(group[0]?.shipFittedItems)?group[0].shipFittedItems:[],
        }));

      const savedCounts=new Map();
      for(const item of row.items){
        const typeId=Number(item.typeId||0);
        savedCounts.set(typeId,(savedCounts.get(typeId)||0)+Math.max(1,Number(item.quantity)||1));
      }
      const moduleFingerprintMatches=candidates.filter(candidate=>{
        const fittedCounts=new Map();
        for(const item of candidate.fittedItems){
          const typeId=Number(item.typeId||0);
          fittedCounts.set(typeId,(fittedCounts.get(typeId)||0)+Math.max(1,Number(item.quantity)||1));
        }
        if(!fittedCounts.size)return false;
        for(const [typeId,count] of fittedCounts){
          if((savedCounts.get(typeId)||0)<count)return false;
        }
        return true;
      });

      const namedCandidates=row.normalizedFitName
        ?candidates.filter(candidate=>normalizeName(candidate.shipCustomName)===row.normalizedFitName)
        :[];

      let chosen=null;

      // A previously verified physical ship binding is stronger than a display
      // name. Preserve it when the saved fit is edited but still requires a
      // compatible Abyssal module set.
      const currentFittingId=String(row.f.fitting_id||'');
      const priorExact=previousByFittingId.get(currentFittingId)||null;
      const priorNameKey=`${Number(row.f.ship_type_id||0)}|${row.normalizedFitName}`;
      const priorSameNameRows=row.normalizedFitName?(previousByName.get(priorNameKey)||[]):[];
      const priorSameName=priorSameNameRows.length===1?priorSameNameRows[0]:null;
      const prior=priorExact||priorSameName;
      const priorShipItemId=String(prior?.abyssalShipItemId||prior?.localCache?.physicalShipItemId||'');
      if(priorShipItemId){
        const bound=candidates.find(candidate=>String(candidate.shipItemId)===priorShipItemId);
        if(bound){
          chosen=bound;
          abyssalMatchMethod=priorExact?'persistent-binding':'persistent-name-binding';
        }
      }

      if(!chosen&&moduleFingerprintMatches.length===1){
        chosen=moduleFingerprintMatches[0];
        abyssalMatchMethod='fitted-modules';
      }else if(!chosen&&row.normalizedFitName&&fitNameCounts.get(row.normalizedFitName)===1&&namedCandidates.length===1){
        chosen=namedCandidates[0];
        abyssalMatchMethod='ship-name';
      }else if(!chosen&&requirementCounts.get(row.requirementKey)===1&&candidates.length===1){
        chosen=candidates[0];
        abyssalMatchMethod='unique-candidate';
      }

      if(chosen){
        matched=chosen.group.map(({parentItemId,...safe})=>safe);
        abyssalMatch='matched';
        abyssalShipItemId=chosen.shipItemId;
        abyssalShipName=chosen.shipCustomName||null;
      }else if(candidates.length){
        abyssalMatch='ambiguous';
        abyssalCandidates=candidates.map(publicAbyssalCandidate);
      }else{
        abyssalMatch='missing';
      }
    }

    return {
      fittingId:row.f.fitting_id,
      name:row.f.name||'Unnamed fit',
      description:row.f.description||'',
      shipTypeId:row.f.ship_type_id,
      shipName:row.shipName,
      items:row.items,
      abyssalMatch,
      abyssalMatchMethod,
      abyssalShipItemId,
      abyssalShipName,
      abyssalLasers:matched,
      abyssalCandidates,
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

function recordFleetPerformanceSample(sampleAt,successful){
  state.esi.performanceSamples ||= [];
  const rows=(successful||[]).map(result=>state.esi.ledgerActivity?.[String(result.characterId)]).filter(Boolean);
  const active=rows.filter(row=>Number(row.lastIntervalM3)>0&&Number(row.lastIntervalSeconds)>0);
  const sample={
    at:sampleAt,
    actualM3PerHour:active.reduce((sum,row)=>sum+Math.max(0,Number(row.lastIntervalRate)||0),0),
    intervalM3:active.reduce((sum,row)=>sum+Math.max(0,Number(row.lastIntervalM3)||0),0),
    activeToons:active.length,
    sampledToons:rows.length,
  };
  const last=state.esi.performanceSamples.at(-1);
  const gap=Date.parse(sample.at)-Date.parse(last?.at||'');
  if(last&&Number.isFinite(gap)&&gap>=0&&gap<5*60*1000)state.esi.performanceSamples[state.esi.performanceSamples.length-1]=sample;
  else state.esi.performanceSamples.push(sample);
  const cutoff=Date.now()-7*24*60*60*1000;
  state.esi.performanceSamples=state.esi.performanceSamples.filter(row=>Date.parse(row?.at||'')>=cutoff).slice(-672);
}

function trackedFieldLedgerTotals(rows,day){
  const totals={};
  for(const row of rows||[]){
    if(String(row.date)!==day)continue;
    const system=state.esi.systemCache[String(row.solar_system_id)]?.name||'';
    const definition=SYSTEM_MAP.get(system);
    if(!definition)continue;
    const type=state.esi.typeCache[String(row.type_id)]||{};
    if(!trackedT3OreVariant(definition.ore,row.type_id))continue;
    const m3=Math.max(0,Number(row.quantity||0)*Number(type.volume||0));
    if(m3>0)totals[system]=(Number(totals[system])||0)+m3;
  }
  return totals;
}

function updateFieldLedgerActivity(characterId,rows,sampleAt=now()){
  state.esi.ledgerFieldSnapshots ||= {};
  state.esi.fieldInference ||= {};
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

    const definition=SYSTEM_MAP.get(system);
    if(!definition)continue;
    const scanAt=state.scans?.[system]?.lastScanAt||null;
    const scanMs=Date.parse(scanAt||'');
    let inference=state.esi.fieldInference[system]||{
      baselineAt:null,baselineDetected:false,minedM3SinceBaseline:0,lastLedgerAt:null,lastDeltaM3:0,
      depletionPct:null,needsScan:false,likelyDepleted:false,siteM3:Number(definition.siteM3)||0,
    };

    // A newer Probe Scanner report becomes the new depletion baseline.
    const baselineMs=Date.parse(inference.baselineAt||'');
    if(Number.isFinite(scanMs)&&(!Number.isFinite(baselineMs)||scanMs>baselineMs)){
      inference={
        ...inference,
        baselineAt:scanAt,
        baselineDetected:Boolean(state.scans?.[system]?.t3?.detected),
        minedM3SinceBaseline:0,
        depletionPct:0,
        needsScan:false,
        likelyDepleted:false,
      };
    }

    const currentBaselineMs=Date.parse(inference.baselineAt||'');
    const deltaIsAfterBaseline=Number.isFinite(currentBaselineMs)&&Number.isFinite(previousSampleMs)&&previousSampleMs>=currentBaselineMs;
    if(inference.baselineDetected&&deltaIsAfterBaseline){
      inference.minedM3SinceBaseline=Math.max(0,Number(inference.minedM3SinceBaseline)||0)+delta;
    }
    const siteM3=Math.max(0,Number(definition.siteM3)||Number(inference.siteM3)||0);
    const depletionPct=inference.baselineDetected&&siteM3>0
      ?Math.min(100,(Math.max(0,Number(inference.minedM3SinceBaseline)||0)/siteM3)*100)
      :null;
    inference={
      ...inference,
      siteM3,
      lastLedgerAt:sampleAt,
      lastDeltaM3:delta,
      depletionPct,
      needsScan:Number.isFinite(depletionPct)&&depletionPct>=80,
      likelyDepleted:Number.isFinite(depletionPct)&&depletionPct>=95,
    };
    state.esi.fieldInference[system]=inference;

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

function hasThreatContactAccess(scopes){
  const granted=Array.isArray(scopes)?scopes:[];
  return THREAT_CONTACT_SCOPES.every(scope=>granted.includes(scope));
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

function recordBoardScan({system,text,a0,t3Scan=null,definition=null}){
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
  const t3=definition&&t3Scan?.valid?{ore:String(definition.ore||''),detected:Boolean(t3Scan.detected)}:null;
  state.scans[system]={
    lastScanAt,
    scannerRowCount:Number(parsed.scannerRowCount)||0,
    kinds:[...new Set(kinds)],
    ice,
    t3,
    source:'probe-scan',
  };
  if(definition&&t3Scan?.valid){
    state.esi.fieldInference ||= {};
    const prior=state.esi.fieldInference[system]||{};
    state.esi.fieldInference[system]={
      ...prior,
      baselineAt:lastScanAt,
      baselineDetected:Boolean(t3Scan.detected),
      minedM3SinceBaseline:0,
      lastScanAt,
      siteM3:Number(definition.siteM3)||0,
      depletionPct:t3Scan.detected?0:null,
      needsScan:false,
      likelyDepleted:false,
    };
  }
  return {
    recorded:true,
    valid:true,
    boardTracked:true,
    kinds:state.scans[system].kinds,
    ice,
    t3,
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
  const boardScan=recordBoardScan({system,text,a0,t3Scan:scan,definition});
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

function abyssalRequirementSignature(fit){
  const counts=new Map();
  for(const row of Array.isArray(fit?.items)?fit.items:[]){
    const typeId=Number(row?.typeId);
    if(!ABYSSAL_STRIP_TYPES.has(typeId))continue;
    counts.set(typeId,(counts.get(typeId)||0)+Math.max(1,Number(row?.quantity)||1));
  }
  return [...counts.entries()].sort((a,b)=>a[0]-b[0]).map(([typeId,count])=>`${typeId}:${count}`).join(',');
}
function savedFitDefinitionSignature(fit){
  const items=(Array.isArray(fit?.items)?fit.items:[])
    .map(row=>`${Number(row?.typeId||0)}:${String(row?.flag||'')}:${Math.max(1,Number(row?.quantity)||1)}`)
    .sort();
  return `${Number(fit?.shipTypeId||0)}|${items.join(',')}`;
}
function cacheSourceMs(cache){
  for(const value of [cache?.lastModified,cache?.responseDate]){
    const ms=Date.parse(String(value||''));
    if(Number.isFinite(ms))return ms;
  }
  return NaN;
}
function laterIso(...values){
  let best=null,bestMs=-Infinity;
  for(const value of values){
    const ms=Date.parse(String(value||''));
    if(Number.isFinite(ms)&&ms>bestMs){bestMs=ms;best=new Date(ms).toISOString();}
  }
  return best;
}
function preserveSavedAbyssalRolls(nextFittings,previousFittings,{refreshedAt=now(),fittingsCache=null,assetsCache=null,manualRequest=false,currentAbyssalItemIds=[]}={}){
  const previous=Array.isArray(previousFittings)?previousFittings:[];
  const byId=new Map(previous.map(fit=>[String(fit?.fittingId||''),fit]).filter(([id])=>id));
  const normalize=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
  const byName=new Map();
  for(const fit of previous){
    const key=`${Number(fit?.shipTypeId||0)}|${normalize(fit?.name)}`;
    if(!normalize(fit?.name))continue;
    if(!byName.has(key))byName.set(key,[]);
    byName.get(key).push(fit);
  }

  const retryAfter=laterIso(fittingsCache?.freshUntil,assetsCache?.freshUntil);
  const currentItemIds=new Set((currentAbyssalItemIds||[]).map(String).filter(Boolean));
  const refreshedMs=Date.parse(String(refreshedAt||''));
  const assetSource=cacheSourceMs(assetsCache);
  const assetsWereCached=Boolean(
    manualRequest&&
    Number.isFinite(refreshedMs)&&
    Number.isFinite(assetSource)&&
    refreshedMs-assetSource>30_000
  );

  return (Array.isArray(nextFittings)?nextFittings:[]).map(next=>{
    const required=abyssalRequirementSignature(next);
    if(!required){
      return{
        ...next,
        abyssalVerification:'not-applicable',
        abyssalVerifiedAt:null,
        abyssalRetryAfter:null,
        abyssalPendingReason:null,
        abyssalErrorCode:null,
      };
    }

    const exact=byId.get(String(next?.fittingId||''))||null;
    const nameKey=`${Number(next?.shipTypeId||0)}|${normalize(next?.name)}`;
    const sameName=normalize(next?.name)?(byName.get(nameKey)||[]):[];
    const prior=exact||(sameName.length===1?sameName[0]:null);
    const priorRolls=Array.isArray(prior?.abyssalLasers)?prior.abyssalLasers:[];
    const priorRequired=abyssalRequirementSignature(prior);
    const priorWasSaved=Boolean(prior&&prior.abyssalMatch==='matched'&&priorRolls.length&&priorRequired===required);
    const priorItemIds=priorRolls.map(row=>String(row?.itemId||'')).filter(Boolean);
    const priorItemsPresent=Boolean(priorItemIds.length&&priorItemIds.every(id=>currentItemIds.has(id)));
    const priorVerifiedMs=Date.parse(String(prior?.abyssalVerifiedAt||prior?.localCache?.verifiedAt||prior?.localCache?.cachedAt||''));
    const freshSnapshotProvesGone=Boolean(
      priorWasSaved&&
      priorItemIds.length&&
      !priorItemsPresent&&
      Number.isFinite(assetSource)&&
      (!Number.isFinite(priorVerifiedMs)||assetSource>priorVerifiedMs+1000)
    );
    const fitDefinitionChanged=Boolean(prior&&savedFitDefinitionSignature(prior)!==savedFitDefinitionSignature(next));
    const shouldWaitForAssets=!freshSnapshotProvesGone&&assetsWereCached&&Boolean(priorWasSaved||fitDefinitionChanged);

    // If UPDATE FITS hit an older ESI asset snapshot, never replace this fit's
    // known-good Abyssal pair with data that may predate the user's in-game edit.
    if(shouldWaitForAssets&&priorWasSaved){
      return{
        ...next,
        abyssalMatch:'matched',
        abyssalMatchMethod:'saved-fit-cache',
        abyssalShipItemId:prior.abyssalShipItemId||prior.localCache?.physicalShipItemId||null,
        abyssalShipName:prior.abyssalShipName||prior.localCache?.physicalShipName||null,
        abyssalLasers:priorRolls.map(row=>({...row})),
        abyssalVerification:'pending',
        abyssalVerifiedAt:prior.abyssalVerifiedAt||prior.localCache?.verifiedAt||prior.localCache?.cachedAt||null,
        abyssalRetryAfter:retryAfter,
        abyssalPendingReason:'esi-assets-cached',
        abyssalErrorCode:'A01',
      };
    }

    if(next.abyssalMatch==='matched'&&Array.isArray(next.abyssalLasers)&&next.abyssalLasers.length){
      return{
        ...next,
        abyssalVerification:assetsWereCached?'pending':'verified',
        abyssalVerifiedAt:assetsWereCached?(prior?.abyssalVerifiedAt||prior?.localCache?.verifiedAt||null):refreshedAt,
        abyssalRetryAfter:assetsWereCached?retryAfter:null,
        abyssalPendingReason:assetsWereCached?'esi-assets-cached':null,
        abyssalErrorCode:assetsWereCached?'A01':null,
      };
    }

    // Keep a fit's own known-good pair only while ESI cannot yet disprove it.
    // Once a newer asset snapshot proves those exact item IDs are gone, invalidate
    // the old snapshot so sold/moved modules cannot live forever in local cache.
    if(priorWasSaved&&!freshSnapshotProvesGone){
      return{
        ...next,
        abyssalMatch:'matched',
        abyssalMatchMethod:'saved-fit-cache',
        abyssalShipItemId:prior.abyssalShipItemId||prior.localCache?.physicalShipItemId||null,
        abyssalShipName:prior.abyssalShipName||prior.localCache?.physicalShipName||null,
        abyssalLasers:priorRolls.map(row=>({...row})),
        abyssalVerification:'pending',
        abyssalVerifiedAt:prior.abyssalVerifiedAt||prior.localCache?.verifiedAt||prior.localCache?.cachedAt||null,
        abyssalRetryAfter:retryAfter,
        abyssalPendingReason:next.abyssalMatch||'unresolved',
        abyssalErrorCode:'A01',
      };
    }

    const unresolvedCode=next.abyssalMatch==='ambiguous'?'A02':'A03';
    return{
      ...next,
      abyssalVerification:freshSnapshotProvesGone?'invalid':'unresolved',
      abyssalVerifiedAt:null,
      abyssalRetryAfter:null,
      abyssalPendingReason:freshSnapshotProvesGone?'saved-items-gone':(next.abyssalMatch||'unresolved'),
      abyssalErrorCode:unresolvedCode,
    };
  });
}

function bindCharacterAbyssalFit(ch,fittingId,shipItemId){
  migrateCharacterFitCache(ch);
  const id=String(fittingId||'');
  const shipId=String(shipItemId||'');
  const fit=ch.fitCache?.byFittingId?.[id];
  if(!fit){
    const error=new Error('That saved fit is no longer in the local fit cache. Use UPDATE FITS and try again.');
    error.code='FIT_NOT_FOUND';
    throw error;
  }
  const candidates=Array.isArray(fit.abyssalCandidates)?fit.abyssalCandidates:[];
  const candidate=candidates.find(row=>String(row.shipItemId)===shipId);
  if(!candidate){
    const error=new Error('That physical ship is not a valid candidate for this saved fit. Use UPDATE FITS and try again.');
    error.code='INVALID_ABYSSAL_BINDING';
    throw error;
  }
  const lasers=Array.isArray(candidate.lasers)?candidate.lasers:[];
  if(!lasers.length){
    const error=new Error('The selected physical ship has no usable Abyssal roll data.');
    error.code='INVALID_ABYSSAL_BINDING';
    throw error;
  }

  const boundAt=now();
  fit.abyssalMatch='matched';
  fit.abyssalMatchMethod='manual-binding';
  fit.abyssalShipItemId=shipId;
  fit.abyssalShipName=candidate.shipName||null;
  fit.abyssalLasers=lasers;
  fit.abyssalCandidates=[];
  fit.abyssalVerification='verified';
  fit.abyssalVerifiedAt=boundAt;
  fit.abyssalRetryAfter=null;
  fit.abyssalPendingReason=null;
  fit.abyssalErrorCode=null;
  fit.localCache={
    ...(fit.localCache||{}),
    key:`${String(ch.characterId)}:${id}`,
    characterId:String(ch.characterId),
    fittingId:id,
    cachedAt:boundAt,
    physicalShipItemId:shipId,
    physicalShipName:candidate.shipName||null,
    abyssalItemIds:lasers.map(row=>String(row.itemId||'')).filter(Boolean),
    abyssalSnapshot:lasers.map(row=>({...row})),
    matchStatus:'matched',
    matchMethod:'manual-binding',
    verification:'verified',
    verifiedAt:boundAt,
    retryAfter:null,
    manuallyBoundAt:boundAt,
  };
  ch.fitCache.updatedAt=boundAt;
  ch.fitBindingUpdatedAt=boundAt;
  return fit;
}

async function refreshCharacterFittings(ch){
  const key=String(ch.characterId);
  const fullSync=characterSyncPromises.get(key);
  if(fullSync)await fullSync;

  const {access,identity:id}=await characterAccess(ch);
  if(!id.scopes.includes(FITTINGS_SCOPE)){
    const error=new Error('This toon needs EVE saved-fitting access. Use UPDATE ACCESS, then try again.');
    error.code='FITTINGS_SCOPE_REQUIRED';
    throw error;
  }
  if(!id.scopes.includes(ASSETS_SCOPE)){
    const error=new Error('Abyssal fit updates need EVE asset access so JLR can read the rolled strip-miner stats. Use UPDATE ACCESS, then try again.');
    error.code='ASSETS_SCOPE_REQUIRED';
    throw error;
  }

  // JLR fit refreshes are intended for Abyssal-rolled mining fits. Always
  // refresh both saved fittings and assets together so the selected fit gets
  // the current mutated item/Dogma values instead of stale or base stats.
  const [fitBundle,assetBundle]=await Promise.all([
    characterFittingsBundle(ch.characterId,access),
    characterAssetsBundle(ch.characterId,access),
  ]);
  const fits=fitBundle.rows;
  const assets=assetBundle.rows;
  const abyssalModules=await abyssalStripSnapshot(assets,{characterId:ch.characterId,access});

  ch.abyssalStripCount=abyssalModules.length;
  ch.assetsUpdatedAt=now();
  ch.assetsEsiCache=assetBundle.cache;
  ch.savedFittingsCount=Array.isArray(fits)?fits.length:0;
  const fittingsUpdatedAt=now();
  const previousFittings=characterCachedFittings(ch);
  const discoveredFits=await miningFittingSnapshot(fits,abyssalModules,previousFittings);
  const miningFits=preserveSavedAbyssalRolls(discoveredFits,previousFittings,{
    refreshedAt:fittingsUpdatedAt,
    fittingsCache:fitBundle.cache,
    assetsCache:assetBundle.cache,
    manualRequest:true,
    currentAbyssalItemIds:abyssalModules.map(row=>row.itemId),
  });
  const cachedFittings=storeCharacterFitCache(ch,miningFits,fittingsUpdatedAt);
  ch.fittingsUpdatedAt=fittingsUpdatedAt;
  ch.fittingsEsiCache=fitBundle.cache;

  return{
    characterId:key,
    characterName:ch.name,
    savedFittingsCount:ch.savedFittingsCount,
    miningFittingsCount:cachedFittings.length,
    abyssalStripCount:Number(ch.abyssalStripCount||0),
    fittingsUpdatedAt:ch.fittingsUpdatedAt,
    assetsRefreshed:true,
    fittingsEsiCache:fitBundle.cache,
    assetsEsiCache:assetBundle.cache,
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
      let assetBundle=null;
      if(id.scopes.includes(ASSETS_SCOPE)){
        assetBundle=await characterAssetsBundle(ch.characterId,access);
        abyssalModules=await abyssalStripSnapshot(assetBundle.rows,{characterId:ch.characterId,access});
        ch.abyssalStripCount=abyssalModules.length;
        ch.assetsUpdatedAt=now();
        ch.assetsEsiCache=assetBundle.cache;
      }
      if(id.scopes.includes(FITTINGS_SCOPE)){
        const fitBundle=await characterFittingsBundle(ch.characterId,access);
        const fits=fitBundle.rows;
        ch.savedFittingsCount=Array.isArray(fits)?fits.length:0;
        const fittingsUpdatedAt=now();
        const previousFittings=characterCachedFittings(ch);
        const discoveredFits=await miningFittingSnapshot(fits,abyssalModules,previousFittings);
        const miningFits=preserveSavedAbyssalRolls(discoveredFits,previousFittings,{
          refreshedAt:fittingsUpdatedAt,
          fittingsCache:fitBundle.cache,
          assetsCache:assetBundle?.cache||ch.assetsEsiCache||null,
          currentAbyssalItemIds:abyssalModules.map(row=>row.itemId),
        });
        storeCharacterFitCache(ch,miningFits,fittingsUpdatedAt);
        ch.fittingsUpdatedAt=fittingsUpdatedAt;
        ch.fittingsEsiCache=fitBundle.cache;
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
      const system=state.esi.systemCache[String(row.solar_system_id)]?.name||'';
      const definition=SYSTEM_MAP.get(system);
      if(!definition||!trackedT3OreVariant(definition.ore,row.type_id))continue;
      const type=state.esi.typeCache[String(row.type_id)]||{volume:0};
      totalM3+=Number(row.quantity||0)*Number(type.volume||0);
    }
    updateLedgerActivity(ledger.characterId,totalM3,sampleAt);
    const reopened=updateFieldLedgerActivity(ledger.characterId,ledger.rows,sampleAt);
    if(reopened.length)console.log('ESI mining reopened RED fields as YELLOW:',reopened.join(', '));
  }
  // Only full automatic cycles become fleet-wide chart points. A single user's
  // manual refresh may cover only part of the fleet and would create a false dip.
  if(successful.length&&fullCycle)recordFleetPerformanceSample(sampleAt,successful);

  const connectedIds=new Set(Object.keys(state.characters));
  for(const id of ledgerRowsByCharacter.keys())if(!connectedIds.has(id))ledgerRowsByCharacter.delete(id);
  const cacheComplete=[...connectedIds].every(id=>ledgerRowsByCharacter.has(id));
  if(fullCycle||cacheComplete){
    rebuildDailyFleetFromLedgerCache();
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
        lastError:/temporarily unavailable\s*\(HTTP\s*\d+\)/i.test(String(c.lastError||''))?null:c.lastError,
        portrait:`https://images.evetech.net/characters/${c.characterId}/portrait?size=64`,
        scopes,
        locationAccess:scopes.includes(LOCATION_SCOPE),
        contactsAccess:hasThreatContactAccess(scopes),
        needsReauth:!scopes.includes(SKILLS_SCOPE)||!scopes.includes(FITTINGS_SCOPE)||!scopes.includes(ASSETS_SCOPE)||!scopes.includes(LOCATION_SCOPE)||!hasThreatContactAccess(scopes),
        marketEligible:c.name===MARKET_CHARACTER_NAME,
        marketAuthorized:c.name===MARKET_CHARACTER_NAME&&String(state.market.characterId||'')===String(c.characterId)&&Boolean(state.market.refreshTokenEnc),
        skills:c.skills||{},
        skillsUpdatedAt:c.skillsUpdatedAt||null,
        savedFittingsCount:Number.isFinite(Number(c.savedFittingsCount))?Number(c.savedFittingsCount):characterCachedFittings(c).length,
        abyssalStripCount:Number(c.abyssalStripCount||0),
        assetsUpdatedAt:c.assetsUpdatedAt||null,
        assetsEsiCache:c.assetsEsiCache||null,
        fittings:characterCachedFittings(c),
        fitCacheUpdatedAt:c.fitCache?.updatedAt||null,
        fitBindingUpdatedAt:c.fitBindingUpdatedAt||null,
        fittingsUpdatedAt:c.fittingsUpdatedAt||null,
        fittingsEsiCache:c.fittingsEsiCache||null,
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

async function decorateHeavyFighterKillmails(rows){
  const sourceRows=Array.isArray(rows)?rows:[];
  const ids=[];
  for(const km of sourceRows){
    const victim=km?.victim||{};
    const finalBlow=(Array.isArray(km?.attackers)?km.attackers:[]).find(attacker=>attacker?.final_blow)||null;
    for(const id of [
      km?.solar_system_id,
      victim?.ship_type_id,
      victim?.character_id,
      victim?.corporation_id,
      victim?.alliance_id,
      finalBlow?.character_id,
      finalBlow?.corporation_id,
      finalBlow?.alliance_id,
      finalBlow?.ship_type_id,
    ]){
      const number=Number(id);
      if(number>0)ids.push(number);
    }
  }
  const names=await resolveUniverseNames(ids);
  const nameOf=id=>{
    const number=Number(id);
    return number>0?(names.get(number)||String(number)):null;
  };
  return sourceRows.map(km=>{
    const victim=km?.victim||{};
    const attackers=Array.isArray(km?.attackers)?km.attackers:[];
    const finalBlow=attackers.find(attacker=>attacker?.final_blow)||null;
    const killmailId=Number(km?.killmail_id)||0;
    const shipTypeId=Number(victim?.ship_type_id)||0;
    const systemId=Number(km?.solar_system_id)||0;
    return{
      killmailId,
      killmailTime:km?.killmail_time||null,
      shipTypeId,
      shipTypeName:nameOf(shipTypeId)||'Heavy Fighter',
      systemId,
      systemName:nameOf(systemId)||`System ${systemId}`,
      victim:{
        characterId:Number(victim?.character_id)||null,
        characterName:nameOf(victim?.character_id),
        corporationId:Number(victim?.corporation_id)||null,
        corporationName:nameOf(victim?.corporation_id),
        allianceId:Number(victim?.alliance_id)||null,
        allianceName:nameOf(victim?.alliance_id),
        damageTaken:Number(victim?.damage_taken)||0,
      },
      finalBlow:finalBlow?{
        characterId:Number(finalBlow?.character_id)||null,
        characterName:nameOf(finalBlow?.character_id),
        corporationId:Number(finalBlow?.corporation_id)||null,
        corporationName:nameOf(finalBlow?.corporation_id),
        allianceId:Number(finalBlow?.alliance_id)||null,
        allianceName:nameOf(finalBlow?.alliance_id),
        shipTypeId:Number(finalBlow?.ship_type_id)||null,
        shipTypeName:nameOf(finalBlow?.ship_type_id),
        damageDone:Number(finalBlow?.damage_done)||0,
      }:null,
      attackerCount:attackers.length,
      totalValue:Number(km?.zkb?.totalValue)||0,
      points:Number(km?.zkb?.points)||0,
      npc:Boolean(km?.zkb?.npc),
      solo:Boolean(km?.zkb?.solo),
      awox:Boolean(km?.zkb?.awox),
      href:killmailId?`https://zkillboard.com/kill/${killmailId}/`:null,
    };
  }).filter(row=>row.killmailId&&row.shipTypeId);
}

async function heavyFighterTypeIds(){
  const fresh=heavyFighterTypeIdsCache.ids&&Date.now()-heavyFighterTypeIdsCache.at<24*60*60*1000;
  if(fresh)return heavyFighterTypeIdsCache.ids;
  if(heavyFighterTypeIdsCache.promise)return heavyFighterTypeIdsCache.promise;
  const pending=(async()=>{
    const {data}=await esiGet(`https://esi.evetech.net/latest/universe/groups/${HEAVY_FIGHTER_GROUP_ID}/?datasource=tranquility`);
    const ids=new Set((Array.isArray(data?.types)?data.types:[]).map(Number).filter(id=>id>0));
    if(!ids.size)throw new Error('EVE returned no Heavy Fighter type IDs for group 1653.');
    heavyFighterTypeIdsCache={at:Date.now(),ids,promise:null};
    return ids;
  })().catch(err=>{
    if(heavyFighterTypeIdsCache.ids?.size){
      console.warn('Heavy Fighter type refresh failed; using cached IDs',String(err.message||err));
      return heavyFighterTypeIdsCache.ids;
    }
    throw err;
  }).finally(()=>{
    if(heavyFighterTypeIdsCache.promise===pending)heavyFighterTypeIdsCache.promise=null;
  });
  heavyFighterTypeIdsCache.promise=pending;
  return pending;
}

function trackerVoiceConfigured(){
  return Boolean(TRACKER_TTS_WORKER_URL&&TRACKER_TTS_WORKER_TOKEN);
}

async function trackerVoiceHealth(){
  const checkedAt=now();
  if(!trackerVoiceConfigured())return{configured:false,reachable:false,checkedAt,message:'Custom voice worker is not configured.'};
  const started=Date.now();
  try{
    const response=await fetch(`${TRACKER_TTS_WORKER_URL}/health`,{
      headers:{'Accept':'application/json','User-Agent':`${ESI_USER_AGENT} | JLR Voice Health`},
      signal:AbortSignal.timeout(5_000),
    });
    const latencyMs=Date.now()-started;
    if(!response.ok)return{configured:true,reachable:false,checkedAt,latencyMs,message:`Voice worker returned HTTP ${response.status}.`};
    const payload=await response.json().catch(()=>null);
    const healthy=payload?.ok===true&&payload?.reference_exists!==false;
    return{
      configured:true,
      reachable:healthy,
      checkedAt,
      latencyMs,
      service:trackerSpeechSafe(payload?.service||'JLR Voice Worker',80),
      referenceReady:payload?.reference_exists!==false,
      message:healthy?'Custom GPT-SoVITS voice is online.':'Voice worker responded but is not ready.',
    };
  }catch(err){
    return{configured:true,reachable:false,checkedAt,latencyMs:Date.now()-started,message:String(err?.message||err||'Voice worker unreachable.').slice(0,160)};
  }
}

function trackerSpeechSafe(value,max=80){
  return String(value||'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').replace(/[^\w .,'&()\-]/g,'').trim().slice(0,max);
}

function trackerSpokenIsk(value){
  const n=Math.max(0,Number(value)||0);
  if(n>=1e12)return (n/1e12).toFixed(n>=1e13?0:1)+' trillion';
  if(n>=1e9)return (n/1e9).toFixed(n>=1e10?0:1)+' billion';
  if(n>=1e6)return (n/1e6).toFixed(n>=1e7?0:1)+' million';
  if(n>=1e3)return Math.round(n/1e3)+' thousand';
  return Math.round(n).toLocaleString('en-US');
}

function trackerVoiceText(loss){
  const fighter=trackerSpeechSafe(loss?.shipTypeName||'Heavy Fighter',64)||'Heavy Fighter';
  const system=trackerSpeechSafe(loss?.systemName||'an unknown system',48)||'an unknown system';
  const value=Number(loss?.totalValue)||0;
  const valueText=value>0?` Estimated loss value, ${trackerSpokenIsk(value)} ISK.`:'';
  return `Attention. A ${fighter} has been lost in ${system}.${valueText} Please check J. L. R. Tracker for pilot and kill information.`;
}

function jlrStartupVoiceText(user){
  const linked=(user?.characterIds||[]).length;
  const tracker=trackerLiveStatus();
  const trackerText=tracker.caughtUp?'Tracker connected.':'Tracker is connecting.';
  const marketMs=Date.parse(state.market?.lastUpdatedAt||'');
  const marketText=Number.isFinite(marketMs)&&Date.now()-marketMs<36*60*60*1000?'Market data current.':'Market data requires an update.';
  const esiText=state.esi.lastError?'EVE synchronization has a warning.':state.esi.lastSyncAt?'EVE data synchronized.':'EVE data synchronization pending.';
  return `J. L. R. systems online. ${trackerText} ${marketText} ${esiText} ${linked} character${linked===1?'':'s'} linked. Welcome back.`;
}

function jlrScanVoiceText(system){
  const safeSystem=trackerSpeechSafe(system,48);
  const definition=SYSTEM_MAP.get(system)||null;
  const scan=state.scans?.[system]||null;
  const parts=[`${safeSystem||'System'} scan synchronized.`];
  if(definition){
    const detected=scan?.t3?.detected;
    if(detected===true)parts.push(`${trackerSpeechSafe(definition.ore,48)} deposit detected.`);
    else if(detected===false)parts.push(`${trackerSpeechSafe(definition.ore,48)} deposit not detected. Confirmation is recommended before clearing the field.`);
  }
  if(scan?.ice){
    const seen=Math.max(0,Number(scan.ice.seen)||0),expected=Math.max(1,Number(scan.ice.expected)||1);
    parts.push(`${seen} of ${expected} ice fields detected.`);
  }
  const a0=state.market?.a0Reports?.[system];
  if(a0)parts.push(a0.detected?'A zero rare asteroid site detected.':'No active A zero rare asteroid site detected.');
  const ledger=state.esi.fieldInference?.[system];
  const pct=Number(ledger?.depletionPct);
  if(Number.isFinite(pct)&&pct>=80)parts.push(`Ledger inference estimates ${Math.round(pct)} percent of the tracked site mined. Another scan is recommended soon.`);
  return parts.join(' ');
}

async function trackerVoiceWorkerAudio(text,cacheKey='alert'){
  if(!trackerVoiceConfigured()){
    const err=new Error('JLR custom voice worker is not configured.');
    err.code='TTS_NOT_CONFIGURED';
    throw err;
  }
  const cleanText=String(text||'').trim().slice(0,600);
  if(!cleanText)throw new Error('Tracker voice text was empty.');
  const hash=crypto.createHash('sha256').update(`v1|${cacheKey}|${cleanText}`).digest('hex');
  const audioPath=path.join(TRACKER_TTS_CACHE_DIR,`${hash}.audio`);
  const metaPath=path.join(TRACKER_TTS_CACHE_DIR,`${hash}.json`);
  try{
    const [bytes,metaRaw]=await Promise.all([fsp.readFile(audioPath),fsp.readFile(metaPath,'utf8')]);
    const meta=JSON.parse(metaRaw);
    if(bytes.length&&String(meta?.mime||'').startsWith('audio/'))return{bytes,mime:meta.mime,cached:true,text:cleanText};
  }catch{}
  if(trackerVoiceJobs.has(hash))return trackerVoiceJobs.get(hash);
  const job=(async()=>{
    await fsp.mkdir(TRACKER_TTS_CACHE_DIR,{recursive:true});
    const response=await fetch(`${TRACKER_TTS_WORKER_URL}/synthesize`,{
      method:'POST',
      headers:{
        'Authorization':`Bearer ${TRACKER_TTS_WORKER_TOKEN}`,
        'Content-Type':'application/json',
        'Accept':'audio/wav, audio/ogg, audio/mpeg, application/octet-stream',
      },
      body:JSON.stringify({text:cleanText,cache_key:String(cacheKey||hash),voice:'jlr-alert'}),
      signal:AbortSignal.timeout(TRACKER_TTS_TIMEOUT_MS),
    });
    if(!response.ok){
      const detail=(await response.text().catch(()=>'' )).slice(0,300);
      throw new Error(`JLR voice worker ${response.status}: ${detail||response.statusText}`);
    }
    const mime=String(response.headers.get('content-type')||'audio/wav').split(';')[0].trim().toLowerCase();
    if(!mime.startsWith('audio/'))throw new Error(`JLR voice worker returned ${mime||'an invalid content type'}.`);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(!bytes.length||bytes.length>8_000_000)throw new Error(`JLR voice worker returned an invalid audio size (${bytes.length} bytes).`);
    await Promise.all([
      fsp.writeFile(audioPath,bytes),
      fsp.writeFile(metaPath,JSON.stringify({mime,text:cleanText,cacheKey,createdAt:now(),bytes:bytes.length}),'utf8'),
    ]);
    return{bytes,mime,cached:false,text:cleanText};
  })().finally(()=>trackerVoiceJobs.delete(hash));
  trackerVoiceJobs.set(hash,job);
  return job;
}

async function trackerVoiceForLoss(loss){
  const killId=String(loss?.killmailId||'unknown');
  return trackerVoiceWorkerAudio(trackerVoiceText(loss),`kill-${killId}`);
}

async function trackerVoiceLossById(killId){
  const id=String(killId||'');
  let loss=mergeTrackerLosses(heavyFighterTrackerCache.data?.losses).find(row=>String(row?.killmailId||'')===id)||null;
  if(loss)return loss;
  const snapshot=await heavyFighterTracker(false);
  return (snapshot.losses||[]).find(row=>String(row?.killmailId||'')===id)||null;
}

function sendTrackerAudio(res,audio){
  res.writeHead(200,{
    'Content-Type':audio.mime||'audio/wav',
    'Cache-Control':'private, max-age=86400',
    'Content-Length':audio.bytes.length,
    'X-JLR-Voice-Cache':audio.cached?'HIT':'MISS',
  });
  res.end(audio.bytes);
}
function trackerLiveStatus(){
  return{
    enabled:TRACKER_R2Z2_ENABLED,
    source:'R2Z2',
    running:Boolean(trackerR2z2State.running),
    caughtUp:Boolean(trackerR2z2State.caughtUp),
    nextSequence:Number(trackerR2z2State.nextSequence)||null,
    lastSequence:Number(trackerR2z2State.lastSequence)||null,
    lastPollAt:trackerR2z2State.lastPollAt||null,
    lastSuccessAt:trackerR2z2State.lastSuccessAt||null,
    lastHeavyFighterAt:trackerR2z2State.lastHeavyFighterAt||null,
    liveSince:trackerR2z2State.liveSince||null,
    lastError:trackerR2z2State.lastError||null,
    edgeWaitSeconds:Math.round(TRACKER_R2Z2_EDGE_WAIT_MS/1000),
  };
}

function sendTrackerEvent(event,payload){
  const msg=`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for(const res of [...trackerLiveClients]){
    try{res.write(msg)}
    catch{trackerLiveClients.delete(res)}
  }
}

function trimTrackerLiveLosses(){
  const cutoff=Date.now()-TRACKER_LIVE_RETENTION_MS;
  trackerLiveLosses=trackerLiveLosses.filter(row=>{
    const at=Date.parse(row?.killmailTime||row?.receivedAt||'');
    return !Number.isFinite(at)||at>=cutoff;
  }).slice(0,200);
  while(trackerLiveSeenKillIds.size>5000){
    const first=trackerLiveSeenKillIds.values().next().value;
    if(first==null)break;
    trackerLiveSeenKillIds.delete(first);
  }
}

function mergeTrackerLosses(historyLosses){
  trimTrackerLiveLosses();
  const merged=new Map();
  for(const row of [...trackerLiveLosses,...(Array.isArray(historyLosses)?historyLosses:[])]){
    const id=Number(row?.killmailId)||0;
    if(id&&!merged.has(id))merged.set(id,row);
  }
  return [...merged.values()]
    .sort((a,b)=>Date.parse(b?.killmailTime||'')-Date.parse(a?.killmailTime||'')||Number(b?.killmailId||0)-Number(a?.killmailId||0))
    .slice(0,200);
}

function trackerSnapshot(data){
  const base=data&&typeof data==='object'?data:{};
  const losses=mergeTrackerLosses(base.losses);
  return{
    ...base,
    source:'zKillboard R2Z2 + search API',
    pollSeconds:Math.round(HEAVY_FIGHTER_TRACKER_CACHE_MS/1000),
    count:losses.length,
    losses,
    live:trackerLiveStatus(),
  };
}

function extractR2z2Killmail(payload){
  const packagePayload=payload?.package&&typeof payload.package==='object'?payload.package:null;
  const candidates=[payload?.killmail,packagePayload?.killmail,packagePayload,payload];
  const km=candidates.find(row=>row&&typeof row==='object'&&Number(row.killmail_id)>0&&row.victim);
  if(!km)return null;
  const zkb=km.zkb||packagePayload?.zkb||payload?.zkb||{};
  return {...km,zkb};
}

async function r2z2Json(url,{allow404=false}={}){
  const response=await fetch(url,{
    headers:{
      'Accept':'application/json',
      'Accept-Encoding':'gzip, deflate, br',
      'User-Agent':`${ESI_USER_AGENT} | JLR Heavy Fighter Tracker R2Z2`,
    },
    signal:AbortSignal.timeout(15_000),
  });
  if(allow404&&response.status===404)return null;
  if(response.status===429){
    const retry=clamp(response.headers.get('retry-after'),1,120,6);
    const err=new Error(`R2Z2 rate limited; retry after ${retry}s`);
    err.retryMs=retry*1000;
    throw err;
  }
  if(!response.ok)throw new Error(`R2Z2 ${response.status}: ${(await response.text().catch(()=>'' )).slice(0,160)}`);
  return response.json();
}

async function processR2z2TrackerPayload(payload,sequence){
  const km=extractR2z2Killmail(payload);
  if(!km)return;
  const shipTypeId=Number(km?.victim?.ship_type_id)||0;
  if(!shipTypeId)return;
  const typeIds=await heavyFighterTypeIds();
  if(!typeIds.has(shipTypeId))return;

  const [loss]=await decorateHeavyFighterKillmails([km]);
  if(!loss)return;
  const killId=String(loss.killmailId);
  if(trackerLiveSeenKillIds.has(killId))return;
  trackerLiveSeenKillIds.add(killId);

  const liveLoss={
    ...loss,
    live:true,
    r2z2Sequence:Number(sequence)||null,
    receivedAt:now(),
  };
  trackerLiveLosses=[liveLoss,...trackerLiveLosses.filter(row=>String(row.killmailId)!==killId)];
  trimTrackerLiveLosses();
  trackerR2z2State.lastHeavyFighterAt=liveLoss.receivedAt;

  if(trackerR2z2State.caughtUp){
    if(trackerVoiceConfigured()){
      trackerVoiceForLoss(liveLoss).catch(err=>console.warn('Tracker voice pre-generation failed',String(err.message||err)));
    }
    sendTrackerEvent('loss',liveLoss);
  }
}

async function seedR2z2Sequence(){
  const pointer=await r2z2Json(`${TRACKER_R2Z2_BASE_URL}/sequence.json`);
  const sequence=Number(pointer?.sequence)||0;
  if(!sequence)throw new Error('R2Z2 sequence pointer was invalid.');
  trackerR2z2State.nextSequence=sequence;
  trackerR2z2State.lastSequence=null;
  trackerR2z2State.lastSuccessAt=null;
  trackerR2z2State.caughtUp=false;
  trackerR2z2State.liveSince=null;
  return sequence;
}

async function runTrackerR2z2Loop(){
  if(!TRACKER_R2Z2_ENABLED||trackerR2z2State.running)return;
  trackerR2z2State.running=true;
  trackerR2z2State.startedAt=now();
  console.log('Heavy Fighter Tracker: starting R2Z2 live ingest');
  for(;;){
    try{
      if(!Number(trackerR2z2State.nextSequence))await seedR2z2Sequence();
      const sequence=Number(trackerR2z2State.nextSequence);
      const payload=await r2z2Json(`${TRACKER_R2Z2_BASE_URL}/${sequence}.json`,{allow404:true});
      trackerR2z2State.lastPollAt=now();

      if(payload===null){
        const lastSuccessMs=Date.parse(trackerR2z2State.lastSuccessAt||'');
        if(!Number.isFinite(lastSuccessMs)||Date.now()-lastSuccessMs>30*60*1000){
          trackerR2z2State.nextSequence=null;
          trackerR2z2State.caughtUp=false;
          trackerR2z2State.liveSince=null;
          trackerR2z2State.lastError='R2Z2 sequence went stale; reseeding.';
          sendTrackerEvent('status',trackerLiveStatus());
          await sleep(TRACKER_R2Z2_EDGE_WAIT_MS);
          continue;
        }
        if(!trackerR2z2State.caughtUp){
          trackerR2z2State.caughtUp=true;
          trackerR2z2State.liveSince=now();
          trackerR2z2State.lastError=null;
          console.log(`Heavy Fighter Tracker: R2Z2 live at sequence ${trackerR2z2State.nextSequence}`);
          sendTrackerEvent('status',trackerLiveStatus());
        }
        await sleep(TRACKER_R2Z2_EDGE_WAIT_MS);
        continue;
      }

      trackerR2z2State.lastSequence=sequence;
      trackerR2z2State.nextSequence=sequence+1;
      trackerR2z2State.lastSuccessAt=now();
      trackerR2z2State.lastError=null;
      await processR2z2TrackerPayload(payload,sequence);
      await sleep(TRACKER_R2Z2_REQUEST_GAP_MS);
    }catch(err){
      const message=String(err?.message||err);
      if(trackerR2z2State.lastError!==message){
        console.warn('Heavy Fighter Tracker R2Z2 error',message);
        trackerR2z2State.lastError=message;
        sendTrackerEvent('status',trackerLiveStatus());
      }
      await sleep(Number(err?.retryMs)||TRACKER_R2Z2_ERROR_WAIT_MS);
    }
  }
}

async function heavyFighterTracker(force=false){
  const nowMs=Date.now();
  if(!force&&heavyFighterTrackerCache.data&&nowMs-heavyFighterTrackerCache.updatedAt<HEAVY_FIGHTER_TRACKER_CACHE_MS){
    return trackerSnapshot(heavyFighterTrackerCache.data);
  }
  if(heavyFighterTrackerCache.promise)return trackerSnapshot(await heavyFighterTrackerCache.promise);

  const pending=(async()=>{
    const url=`https://zkillboard.com/api/losses/groupID/${HEAVY_FIGHTER_GROUP_ID}/pastSeconds/${HEAVY_FIGHTER_TRACKER_WINDOW_SECONDS}/`;
    const rows=await zkillJson(url);
    if(!Array.isArray(rows))throw new Error('zKillboard Heavy Fighter feed was not a killmail list.');

    const recent=rows.slice(0,200);
    const losses=await decorateHeavyFighterKillmails(recent);
    const data={
      groupId:HEAVY_FIGHTER_GROUP_ID,
      groupName:'Heavy Fighter',
      source:'zKillboard',
      sourceUrl:`https://zkillboard.com/group/${HEAVY_FIGHTER_GROUP_ID}/losses/`,
      windowSeconds:HEAVY_FIGHTER_TRACKER_WINDOW_SECONDS,
      pollSeconds:Math.round(HEAVY_FIGHTER_TRACKER_CACHE_MS/1000),
      searchApiDelaySeconds:300,
      updatedAt:now(),
      count:losses.length,
      truncated:rows.length>=200,
      losses,
    };
    heavyFighterTrackerCache={updatedAt:Date.now(),data,promise:null};
    return data;
  })().catch(err=>{
    if(heavyFighterTrackerCache.data){
      console.warn('Heavy Fighter tracker refresh failed; using cached feed',String(err.message||err));
      return {...heavyFighterTrackerCache.data,stale:true,refreshError:String(err.message||err)};
    }
    if(trackerLiveLosses.length){
      console.warn('Heavy Fighter history unavailable; serving R2Z2 live cache',String(err.message||err));
      return{
        groupId:HEAVY_FIGHTER_GROUP_ID,
        groupName:'Heavy Fighter',
        source:'R2Z2',
        sourceUrl:`https://zkillboard.com/group/${HEAVY_FIGHTER_GROUP_ID}/losses/`,
        windowSeconds:HEAVY_FIGHTER_TRACKER_WINDOW_SECONDS,
        pollSeconds:Math.round(HEAVY_FIGHTER_TRACKER_CACHE_MS/1000),
        searchApiDelaySeconds:300,
        updatedAt:now(),
        count:0,
        truncated:false,
        losses:[],
        staleHistory:true,
        refreshError:String(err.message||err),
      };
    }
    throw err;
  }).finally(()=>{
    if(heavyFighterTrackerCache.promise===pending)heavyFighterTrackerCache.promise=null;
  });
  heavyFighterTrackerCache.promise=pending;
  return trackerSnapshot(await pending);
}

function fountainActivityRow(map, characterId) {
  const id=Number(characterId);
  let row=map.get(id);
  if(!row){
    row={
      characterId:id,kills7d:0,kills24h:0,finalBlows7d:0,losses7d:0,
      iskDestroyed7d:0,iskLost7d:0,lastKillAt:null,lastLossAt:null,
      systems:new Set(),attackShips:new Map(),_kills:new Set(),_losses:new Set(),
    };
    map.set(id,row);
  }
  return row;
}
function newerIso(current, candidate) {
  const next=Date.parse(String(candidate||''));
  const old=Date.parse(String(current||''));
  if(!Number.isFinite(next))return current||null;
  return !Number.isFinite(old)||next>old?new Date(next).toISOString():current;
}
function serializeFountainActivity(row) {
  return {
    characterId:Number(row.characterId)||0,
    kills7d:Number(row.kills7d)||0,
    kills24h:Number(row.kills24h)||0,
    finalBlows7d:Number(row.finalBlows7d)||0,
    losses7d:Number(row.losses7d)||0,
    iskDestroyed7d:Number(row.iskDestroyed7d)||0,
    iskLost7d:Number(row.iskLost7d)||0,
    lastKillAt:row.lastKillAt||null,
    lastLossAt:row.lastLossAt||null,
    systems:[...row.systems],
    attackShips:[...row.attackShips.entries()]
      .map(([shipTypeID,count])=>({shipTypeID:Number(shipTypeID),count:Number(count)||0}))
      .sort((a,b)=>b.count-a.count||a.shipTypeID-b.shipTypeID)
      .slice(0,12),
  };
}
async function refreshFountainThreatActivity(force=false){
  const nowMs=Date.now();
  if(!force&&fountainThreatCache.data&&nowMs-fountainThreatCache.updatedAt<FOUNTAIN_THREAT_CACHE_MS)return fountainThreatCache.data;
  if(fountainThreatCache.promise)return fountainThreatCache.promise;

  const pending=(async()=>{
    const characters=new Map(),seenKillIds=new Set();
    const cutoff24=Date.now()-24*60*60*1000;
    let pagesFetched=0,truncated=false,previousPageSignature='';
    for(let page=1;page<=FOUNTAIN_THREAT_MAX_PAGES;page++){
      const url=`https://zkillboard.com/api/regionID/${FOUNTAIN_REGION_ID}/pastSeconds/${ZKILL_WINDOW_SECONDS}/page/${page}/`;
      const rows=await zkillJson(url);
      if(!Array.isArray(rows))throw new Error(`zKillboard Fountain page ${page} was not a killmail list.`);
      const signature=rows.slice(0,5).map(row=>String(row?.killmail_id||'')).join(',');
      if(page>1&&rows.length&&signature&&signature===previousPageSignature){
        throw new Error(`zKillboard Fountain pagination repeated page ${page-1}.`);
      }
      if(signature)previousPageSignature=signature;
      pagesFetched=page;

      for(const km of rows){
        const killId=Number(km?.killmail_id);
        if(!killId||seenKillIds.has(killId))continue;
        seenKillIds.add(killId);
        const killAt=km?.killmail_time||null;
        const killMs=Date.parse(String(killAt||''));
        const value=Number(km?.zkb?.totalValue)||0;
        const systemId=Number(km?.solar_system_id)||0;

        for(const attacker of Array.isArray(km?.attackers)?km.attackers:[]){
          const characterId=Number(attacker?.character_id);
          if(!characterId)continue;
          const row=fountainActivityRow(characters,characterId);
          if(!row._kills.has(killId)){
            row._kills.add(killId);
            row.kills7d++;
            row.iskDestroyed7d+=value;
            if(Number.isFinite(killMs)&&killMs>=cutoff24)row.kills24h++;
          }
          if(attacker?.final_blow)row.finalBlows7d++;
          if(systemId)row.systems.add(systemId);
          const shipTypeId=Number(attacker?.ship_type_id);
          if(shipTypeId)row.attackShips.set(shipTypeId,(row.attackShips.get(shipTypeId)||0)+1);
          row.lastKillAt=newerIso(row.lastKillAt,killAt);
        }

        const victimId=Number(km?.victim?.character_id);
        if(victimId){
          const row=fountainActivityRow(characters,victimId);
          if(!row._losses.has(killId)){
            row._losses.add(killId);
            row.losses7d++;
            row.iskLost7d+=value;
          }
          if(systemId)row.systems.add(systemId);
          row.lastLossAt=newerIso(row.lastLossAt,killAt);
        }
      }
      if(rows.length<200)break;
      if(page===FOUNTAIN_THREAT_MAX_PAGES){truncated=true;break}
      await sleep(ZKILL_PAGE_GAP_MS);
    }

    const data={
      regionId:FOUNTAIN_REGION_ID,
      regionName:'Fountain',
      generatedAt:now(),
      pagesFetched,
      truncated,
      sourceComplete:!truncated,
      killmailsProcessed:seenKillIds.size,
      characters:Object.fromEntries([...characters.entries()].map(([id,row])=>[String(id),serializeFountainActivity(row)])),
    };
    fountainThreatCache={updatedAt:Date.now(),data,promise:null};
    pvpDb.threat ||= {characters:{}};
    pvpDb.threat.fountain7d={updatedAt:now(),data};
    await savePvpDb();
    return data;
  })().catch(err=>{
    console.warn('Fountain threat activity refresh failed',String(err.message||err));
    return fountainThreatCache.data;
  }).finally(()=>{
    if(fountainThreatCache.promise===pending)fountainThreatCache.promise=null;
  });
  fountainThreatCache.promise=pending;
  return pending;
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
function compactInitKillmail(km){
  const killId=Number(km?.killmail_id);
  const timeMs=Date.parse(String(km?.killmail_time||''));
  if(!killId||!Number.isFinite(timeMs))return null;
  const attackers=[];
  for(const attacker of Array.isArray(km?.attackers)?km.attackers:[]){
    if(Number(attacker?.alliance_id)!==INIT_ALLIANCE_ID)continue;
    const characterId=Number(attacker?.character_id);
    if(!characterId)continue;
    attackers.push([
      characterId,
      Number(attacker?.corporation_id)||0,
      attacker?.final_blow?1:0,
      Number(attacker?.damage_done)||0,
    ]);
  }
  if(!attackers.length)return null;
  return [new Date(timeMs).toISOString(),Number(km?.zkb?.totalValue)||0,attackers];
}
function pruneInitKillmailArchive(referenceMs=Date.now()){
  const cutoff=referenceMs-ZKILL_ARCHIVE_RETENTION_MS;
  for(const [killId,row] of Object.entries(pvpDb.initKillmails||{})){
    if(Date.parse(String(row?.[0]||''))<cutoff)delete pvpDb.initKillmails[killId];
  }
}
async function seedInitKillmailArchive(){
  let pagesFetched=0,previousPageSignature='',truncated=false;
  for(let page=1;page<=ZKILL_MAX_PAGES;page++){
    const url=`https://zkillboard.com/api/kills/allianceID/${INIT_ALLIANCE_ID}/pastSeconds/${ZKILL_WINDOW_SECONDS}/page/${page}/`;
    const rows=await zkillJson(url);
    if(!Array.isArray(rows))throw new Error(`zKillboard seed page ${page} was not a killmail list.`);
    const signature=rows.slice(0,5).map(row=>String(row?.killmail_id||'')).join(',');
    if(page>1&&rows.length&&signature&&signature===previousPageSignature)throw new Error(`zKillboard seed pagination repeated page ${page-1}.`);
    if(signature)previousPageSignature=signature;
    pagesFetched++;
    for(const km of rows){
      const compact=compactInitKillmail(km);
      if(compact)pvpDb.initKillmails[String(km.killmail_id)]=compact;
    }
    if(rows.length<200)break;
    if(page===ZKILL_MAX_PAGES){
      truncated=true;
      break;
    }
    await sleep(ZKILL_PAGE_GAP_MS);
  }
  return{pagesFetched,truncated};
}
async function currentR2z2Sequence(){
  const payload=await zkillJson('https://r2z2.zkillboard.com/ephemeral/sequence.json');
  const sequence=Number(payload?.sequence);
  if(!Number.isInteger(sequence)||sequence<1)throw new Error('R2Z2 did not return a valid sequence.');
  return sequence;
}
async function ingestR2z2Range(startSequence,endSequence){
  let processed=0;
  for(let sequence=startSequence;sequence<=endSequence;sequence++){
    const payload=await zkillJson(`https://r2z2.zkillboard.com/ephemeral/${sequence}.json`);
    const km=payload?.esi?{...payload.esi,zkb:payload.zkb||{}}:null;
    const compact=compactInitKillmail(km);
    if(compact)pvpDb.initKillmails[String(km.killmail_id)]=compact;
    processed++;
    if(sequence<endSequence)await sleep(100);
  }
  return processed;
}
async function refreshInitKillmailArchive(force=false){
  if(zkillInitArchiveRefreshPromise)return zkillInitArchiveRefreshPromise;
  const archive=pvpDb.initArchive||{};
  const age=Date.now()-pvpDbTimestamp(archive.updatedAt);
  if(!force&&Object.keys(pvpDb.initKillmails||{}).length&&age<ZKILL_ARCHIVE_REFRESH_MS)return archive;
  const pending=(async()=>{
    const refreshedAt=Date.now();
    let nextSequence=Number(archive.nextSequence)||0;
    let trackingStartedAt=archive.trackingStartedAt||null;
    let restSeedComplete=Boolean(archive.restSeedComplete);
    let pagesFetched=0,sequencesProcessed=0;
    const latestSequence=await currentR2z2Sequence();
    if(!nextSequence){
      const seed=await seedInitKillmailArchive();
      pagesFetched=seed.pagesFetched;
      restSeedComplete=!seed.truncated;
      trackingStartedAt=now();
      nextSequence=latestSequence+1;
    }else if(nextSequence<=latestSequence){
      try{
        sequencesProcessed=await ingestR2z2Range(nextSequence,latestSequence);
        nextSequence=latestSequence+1;
      }catch(err){
        if(!String(err.message||err).includes('404'))throw err;
        console.warn('R2Z2 sequence expired; reseeding the rolling INIT archive.');
        const seed=await seedInitKillmailArchive();
        pagesFetched=seed.pagesFetched;
        restSeedComplete=!seed.truncated;
        trackingStartedAt=now();
        nextSequence=latestSequence+1;
      }
    }
    pruneInitKillmailArchive(refreshedAt);
    let coverageMin=Infinity,coverageMax=0;
    for(const row of Object.values(pvpDb.initKillmails||{})){
      const timeMs=Date.parse(String(row?.[0]||''));
      if(!Number.isFinite(timeMs))continue;
      coverageMin=Math.min(coverageMin,timeMs);
      coverageMax=Math.max(coverageMax,timeMs);
    }
    pvpDb.initArchive={
      coverageStart:Number.isFinite(coverageMin)?new Date(coverageMin).toISOString():null,
      coverageEnd:coverageMax?new Date(coverageMax).toISOString():null,
      updatedAt:now(),
      pagesFetched,
      sequencesProcessed,
      killmailsStored:Object.keys(pvpDb.initKillmails||{}).length,
      nextSequence,
      trackingStartedAt,
      restSeedComplete,
    };
    await savePvpDb();
    return pvpDb.initArchive;
  })().finally(()=>{if(zkillInitArchiveRefreshPromise===pending)zkillInitArchiveRefreshPromise=null});
  zkillInitArchiveRefreshPromise=pending;
  return pending;
}
function buildInitLeaderboardFromArchive(){
  const characters=new Map(),corporations=new Map(),seenKillIds=new Set();
  const cutoff=Date.now()-ZKILL_WINDOW_SECONDS*1000;
  for(const [rawKillId,record] of Object.entries(pvpDb.initKillmails||{})){
    const killId=Number(rawKillId),timeMs=Date.parse(String(record?.[0]||''));
    if(!killId||!Number.isFinite(timeMs)||timeMs<cutoff)continue;
    seenKillIds.add(killId);
    const value=Number(record?.[1])||0,corpSeen=new Set();
    for(const attacker of Array.isArray(record?.[2])?record[2]:[]){
      const characterId=Number(attacker?.[0]),corpId=Number(attacker?.[1]);
      const finalBlow=Boolean(attacker?.[2]),damage=Number(attacker?.[3])||0;
      if(characterId)addPvpMetric(characters,characterId,corpId,killId,value,finalBlow,damage);
      if(!corpId)continue;
      if(!corporations.has(corpId))corporations.set(corpId,{id:corpId,killmails:0,finalBlows:0,damageDone:0,iskOnKillmails:0,_kills:new Set()});
      const corp=corporations.get(corpId);
      if(!corpSeen.has(corpId)){
        corpSeen.add(corpId);
        if(!corp._kills.has(killId)){corp._kills.add(killId);corp.killmails++;corp.iskOnKillmails+=value}
      }
      if(finalBlow)corp.finalBlows++;
      corp.damageDone+=damage;
    }
  }
  const rankedCharacters=rankPvpRows([...characters.values()]);
  const rankedCorporations=rankPvpRows([...corporations.values()]);
  for(const row of [...rankedCharacters,...rankedCorporations])delete row._kills;
  const trackingStartedAt=pvpDbTimestamp(pvpDb.initArchive?.trackingStartedAt);
  const sourceComplete=Boolean(pvpDb.initArchive?.restSeedComplete||(trackingStartedAt&&trackingStartedAt<=cutoff));
  return{
    generatedAt:now(),
    pagesFetched:Number(pvpDb.initArchive?.pagesFetched)||0,
    truncated:!sourceComplete,
    killmailsProcessed:seenKillIds.size,
    characters:rankedCharacters,
    corporations:rankedCorporations,
    sourceComplete,
    localArchive:true,
    archiveUpdatedAt:pvpDb.initArchive?.updatedAt||null,
    archiveCoverageStart:pvpDb.initArchive?.coverageStart||null,
    archiveCoverageEnd:pvpDb.initArchive?.coverageEnd||null,
    killmailsStored:Number(pvpDb.initArchive?.killmailsStored)||Object.keys(pvpDb.initKillmails||{}).length,
  };
}
async function buildInitZkillLeaderboard(force=false){
  const nowMs=Date.now();
  if(!force&&zkillInitLeaderboardCache.data&&nowMs-zkillInitLeaderboardCache.updatedAt<ZKILL_CACHE_MS)return zkillInitLeaderboardCache.data;
  if(zkillInitLeaderboardCache.promise)return zkillInitLeaderboardCache.promise;
  const pending=(async()=>{
    try{await refreshInitKillmailArchive(force)}
    catch(err){
      if(!Object.keys(pvpDb.initKillmails||{}).length)throw err;
      console.warn('INIT local killmail archive refresh failed; using stored rows',String(err.message||err));
    }
    const data=buildInitLeaderboardFromArchive();
    zkillInitLeaderboardCache={updatedAt:Date.now(),data,promise:null};
    pvpDb.init7d={updatedAt:now(),data};
    await savePvpDb();
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
    pvpDb.corpWeekly[String(corpId)]={updatedAt:now(),data};
    await savePvpDb();
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

function publishedCorporationWeeklyStatsMany(corporationIds){
  const ids=[...new Set((corporationIds||[]).map(Number).filter(Number.isFinite))];
  const data=new Map(),staleIds=[];
  const nowMs=Date.now();
  for(const id of ids){
    const published=zkillCorpStatsPublished.data.get(id);
    if(published)data.set(id,published);
    const cache=zkillCorpStatsCache.get(id);
    if(!cache?.data||nowMs-Number(cache.updatedAt||0)>=ZKILL_CACHE_MS)staleIds.push(id);
  }
  return{data,staleIds,publishedAt:zkillCorpStatsPublished.updatedAt};
}
function refreshCorporationWeeklyStatsInBackground(corporationIds,force=false){
  const ids=[...new Set((corporationIds||[]).map(Number).filter(Number.isFinite))];
  if(!ids.length)return null;
  if(zkillCorpStatsBatchPromise)return zkillCorpStatsBatchPromise;
  const pending=zkillCorporationWeeklyStatsMany(ids,force)
    .then(()=>{
      const next=new Map(zkillCorpStatsPublished.data);
      for(const id of ids){
        const cache=zkillCorpStatsCache.get(id);
        if(cache?.data)next.set(id,cache.data);
      }
      zkillCorpStatsPublished={updatedAt:Date.now(),data:next};
      return next;
    })
    .catch(err=>{
      console.warn('Background corporation weekly stats refresh failed',String(err.message||err));
      return zkillCorpStatsPublished.data;
    })
    .finally(()=>{if(zkillCorpStatsBatchPromise===pending)zkillCorpStatsBatchPromise=null});
  zkillCorpStatsBatchPromise=pending;
  return pending;
}

async function resolveThreatCharacterNames(names){
  const unique=[...new Map((names||[]).map(name=>[String(name).trim().toLowerCase(),String(name).trim()])).values()].filter(Boolean);
  const characters=new Map();
  for(let i=0;i<unique.length;i+=500){
    const batch=unique.slice(i,i+500);
    if(!batch.length)continue;
    try{
      const {data}=await esiPost('https://esi.evetech.net/latest/universe/ids/?datasource=tranquility',batch);
      for(const row of Array.isArray(data?.characters)?data.characters:[]){
        const id=Number(row?.id);
        const name=String(row?.name||'').trim();
        if(id&&name)characters.set(name.toLowerCase(),{id,name});
      }
    }catch(err){
      console.warn('Threat character name lookup failed',String(err.message||err));
    }
  }
  return characters;
}
async function resolveThreatAffiliations(characters){
  const ids=[...new Set((characters||[]).map(row=>Number(row?.id)).filter(id=>id>0))];
  const affiliations=new Map();
  for(let i=0;i<ids.length;i+=1000){
    const batch=ids.slice(i,i+1000);
    if(!batch.length)continue;
    try{
      const {data}=await esiPost('https://esi.evetech.net/latest/characters/affiliation/?datasource=tranquility',batch);
      for(const row of Array.isArray(data)?data:[]){
        const id=Number(row?.character_id);
        if(!id)continue;
        affiliations.set(id,{
          corporation_id:Number(row?.corporation_id)||null,
          alliance_id:Number(row?.alliance_id)||null,
          faction_id:Number(row?.faction_id)||null,
        });
      }
    }catch(err){
      console.warn('Threat affiliation lookup failed',String(err.message||err));
    }
  }
  return affiliations;
}
async function resolveThreatShipNames(names){
  const unique=[...new Map((names||[]).map(name=>[String(name).trim().toLowerCase(),String(name).trim()])).values()].filter(Boolean);
  const types=new Map();
  for(let i=0;i<unique.length;i+=500){
    const batch=unique.slice(i,i+500);
    if(!batch.length)continue;
    try{
      const {data}=await esiPost('https://esi.evetech.net/latest/universe/ids/?datasource=tranquility',batch);
      for(const row of Array.isArray(data?.inventory_types)?data.inventory_types:[]){
        const id=Number(row?.id);
        const name=String(row?.name||'').trim();
        if(id&&name)types.set(name.toLowerCase(),{id,name});
      }
    }catch(err){
      console.warn('Threat ship name lookup failed',String(err.message||err));
    }
  }
  return types;
}
async function esiContactRows(base,access){
  const first=await esiGet(`${base}${base.includes('?')?'&':'?'}page=1`,access);
  let rows=Array.isArray(first.data)?[...first.data]:[];
  const pages=Math.max(1,Number(first.headers.get('x-pages')||1));
  if(pages>1){
    const remaining=await Promise.all(Array.from({length:pages-1},(_,index)=>esiGet(`${base}${base.includes('?')?'&':'?'}page=${index+2}`,access)));
    for(const next of remaining)if(Array.isArray(next.data))rows.push(...next.data);
  }
  return rows;
}
async function positiveStandingContactsForUser(user){
  const linked=(user?.characterIds||[]).map(id=>state.characters[String(id)]).filter(Boolean);
  const source=linked.find(ch=>String(ch.characterId)===String(user?.primaryCharacterId)&&hasThreatContactAccess(ch.scopes))
    ||linked.find(ch=>hasThreatContactAccess(ch.scopes));
  if(!source){
    const error=new Error('Update EVE access on a linked toon to enable personal, corporation, and alliance standings.');
    error.code='CONTACT_SCOPE_REQUIRED';
    throw error;
  }
  const key=String(source.characterId);
  const cached=threatContactsCache.get(key);
  if(cached&&Date.now()-cached.at<THREAT_CONTACTS_CACHE_MS)return cached.data;
  if(threatContactsPromises.has(key))return threatContactsPromises.get(key);
  const pending=(async()=>{
  const {access,identity}=await characterAccess(source);
  if(!hasThreatContactAccess(identity.scopes)){
    const error=new Error('This toon has not granted all three EVE contacts permissions. Update EVE access and try again.');
    error.code='CONTACT_SCOPE_REQUIRED';
    throw error;
  }
  const characterBase=`https://esi.evetech.net/latest/characters/${source.characterId}/contacts/?datasource=tranquility`;
  // Personal contacts and public affiliation are independent requests.
  const [personalRows,profileResult]=await Promise.all([
    esiContactRows(characterBase,access),
    esiGet(`https://esi.evetech.net/latest/characters/${source.characterId}/?datasource=tranquility`).catch(err=>{
      console.warn('Threat friendly affiliation lookup failed',String(err.message||err));
      return null;
    }),
  ]);
  const profile=profileResult?.data;
  const extraSources=[];
  if(Number(profile?.corporation_id))extraSources.push({
    label:'corporation',
    base:`https://esi.evetech.net/latest/corporations/${Number(profile.corporation_id)}/contacts/?datasource=tranquility`,
  });
  if(Number(profile?.alliance_id))extraSources.push({
    label:'alliance',
    base:`https://esi.evetech.net/latest/alliances/${Number(profile.alliance_id)}/contacts/?datasource=tranquility`,
  });
  const extraRows=await Promise.all(extraSources.map(sourceRow=>esiContactRows(sourceRow.base,access).catch(err=>{
    console.warn(`Threat ${sourceRow.label} contacts lookup failed`,String(err.message||err));
    return[];
  })));
  const byOwner={character:new Map(),corporation:new Map(),alliance:new Map()};
  const rowsByOwner=[{owner:'character',rows:personalRows},...extraSources.map((sourceRow,index)=>({owner:sourceRow.label,rows:extraRows[index]}))];
  for(const sourceRows of rowsByOwner)for(const row of sourceRows.rows){
    const standing=Number(row?.standing);
    if(!Number.isFinite(standing)||standing===0)continue;
    const id=Number(row?.contact_id);
    if(id)byOwner[sourceRows.owner].set(id,standing);
  }
  // EVE does not require a character to add their own corporation/alliance as
  // a personal contact. Treat both as friendly so same-team pilots do not
  // appear as threats when the positive-standings filter is enabled.
  const standingData={
    byOwner,
    memberCorporations:new Set(Number(profile?.corporation_id)?[Number(profile.corporation_id)]:[]),
    memberAlliances:new Set(Number(profile?.alliance_id)?[Number(profile.alliance_id)]:[]),
  };
  const data={sourceCharacterId:key,sourceCharacterName:source.name,standingData};
  threatContactsCache.set(key,{at:Date.now(),data});
  return data;
  })().finally(()=>threatContactsPromises.delete(key));
  threatContactsPromises.set(key,pending);
  return pending;
}
async function createDscanInfoShare(scanText){
  const cacheKey=crypto.createHash('sha256').update(scanText).digest('hex');
  const cached=threatShareCache.get(cacheKey);
  if(cached&&Date.now()-cached.at<60*60*1000)return{url:cached.url,cached:true};
  const body=new URLSearchParams({paste:scanText});
  const response=await fetch(`https://dscan.info/?_=${Math.floor(Date.now()/1000)}`,{
    method:'POST',
    headers:{
      'Accept':'text/plain,*/*;q=0.8',
      'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent':`${ESI_USER_AGENT} | dscan.info share link`,
    },
    body,
    signal:AbortSignal.timeout(20_000),
  });
  const raw=(await response.text()).trim();
  if(!response.ok)throw new Error(`dscan.info ${response.status}: ${raw.slice(0,160)}`);
  const match=raw.match(/^OK;([A-Za-z0-9_-]+)$/);
  if(!match){
    const message=raw.match(/^ERROR;(.*)$/)?.[1]||'dscan.info returned an unexpected response.';
    throw new Error(String(message).slice(0,200));
  }
  const url=`https://dscan.info/v/${match[1]}`;
  threatShareCache.set(cacheKey,{at:Date.now(),url});
  if(threatShareCache.size>40){
    const oldest=[...threatShareCache.entries()].sort((a,b)=>a[1].at-b[1].at).slice(0,10);
    for(const [key] of oldest)threatShareCache.delete(key);
  }
  return{url,cached:false};
}
async function threatMapLimit(items,limit,worker){
  const input=[...(items||[])];
  const output=new Array(input.length);
  let cursor=0;
  const runners=Array.from({length:Math.min(Math.max(1,limit),input.length)},async()=>{
    while(true){
      const index=cursor++;
      if(index>=input.length)return;
      output[index]=await worker(input[index],index);
    }
  });
  await Promise.all(runners);
  return output;
}
async function getThreatCharacterIntel(character){
  const id=Number(character?.id);
  const key=String(id);
  const cached=pvpDb.threat?.characters?.[key];
  const cacheAge=cached?.updatedAt?Date.now()-pvpDbTimestamp(cached.updatedAt):Infinity;
  if(cached&&cacheAge<THREAT_CHARACTER_CACHE_MS)return{...cached,cacheHit:true};

  let profile=null,rawStats=null,statsError=null;
  const [profileResult,statsResult]=await Promise.allSettled([
    esiGet(`https://esi.evetech.net/latest/characters/${id}/?datasource=tranquility`),
    zkillJson(`https://zkillboard.com/api/stats/characterID/${id}/kills/`),
  ]);
  if(profileResult.status==='fulfilled')profile=profileResult.value?.data||null;
  if(statsResult.status==='fulfilled')rawStats=statsResult.value||null;
  else statsError=String(statsResult.reason?.message||statsResult.reason||'zKill stats unavailable');

  const entry={
    updatedAt:now(),
    character:{
      id,
      name:String(profile?.name||character?.name||id),
      birthday:profile?.birthday||null,
      security_status:Number.isFinite(Number(profile?.security_status))?Number(profile.security_status):null,
      corporation_id:Number(profile?.corporation_id)||null,
      alliance_id:Number(profile?.alliance_id)||null,
      faction_id:Number(profile?.faction_id)||null,
    },
    stats:compactThreatStats(rawStats||{}),
    statsError,
  };
  pvpDb.threat ||= {characters:{}};
  pvpDb.threat.characters ||= {};
  pvpDb.threat.characters[key]=entry;
  return{...entry,cacheHit:false};
}
async function buildThreatIntel(scanText,{ignoreOwnIds=[],positiveStandings=null,positiveStandingsPromise=null,fast=false}={}){
  const parsed=parseThreatPaste(scanText);
  if(!fountainThreatCache.data||Date.now()-fountainThreatCache.updatedAt>=FOUNTAIN_THREAT_CACHE_MS){
    refreshFountainThreatActivity(false).catch(err=>console.warn('Fountain threat warmup failed',String(err.message||err)));
  }
  const fountainSnapshot=fountainThreatCache.data;
  // Resolve the paste and load standings concurrently. Previously contacts had
  // to finish before either name lookup could start, adding several seconds.
  const [resolved,resolvedShipNames,resolvedStandings]=await Promise.all([
    resolveThreatCharacterNames(parsed.names),
    resolveThreatShipNames((parsed.shipNames||[]).map(row=>row.name)),
    positiveStandingsPromise||Promise.resolve(positiveStandings),
  ]);
  positiveStandings=resolvedStandings;
  const ordered=[],unresolved=[];
  for(const name of parsed.names){
    const match=resolved.get(String(name).toLowerCase());
    if(match)ordered.push(match);
    else unresolved.push(name);
  }
  const unique=[...new Map(ordered.map(row=>[Number(row.id),row])).values()];
  const ownIds=new Set((ignoreOwnIds||[]).map(Number).filter(Number.isFinite));
  const standingData=positiveStandings?.standingData||null;
  const affiliations=standingData?await resolveThreatAffiliations(unique):new Map();
  let ignoredOwn=0,ignoredPositive=0;
  const candidates=unique.filter(row=>{
    const affiliation=affiliations.get(Number(row.id))||{};
    const reason=threatIgnoreReason({
      id:row.id,
      corporation_id:affiliation.corporation_id,
      alliance_id:affiliation.alliance_id,
    },{ownIds,standingData});
    if(reason==='own'){ignoredOwn++;return false}
    if(reason==='positive'){ignoredPositive++;return false}
    return true;
  });
  const truncated=candidates.length>THREAT_MAX_CHARACTERS;
  const selected=candidates.slice(0,THREAT_MAX_CHARACTERS);
  const truncatedCount=Math.max(0,candidates.length-selected.length);
  let cacheHits=0,refreshed=0,pendingIntel=0,staleIntel=0;
  let entries;
  if(fast){
    entries=selected.map(row=>{
      const id=Number(row?.id)||0;
      const cached=pvpDb.threat?.characters?.[String(id)]||null;
      if(cached){
        cacheHits++;
        const age=cached?.updatedAt?Date.now()-pvpDbTimestamp(cached.updatedAt):Infinity;
        const stale=age>=THREAT_CHARACTER_CACHE_MS;
        if(stale){staleIntel++;pendingIntel++}
        const affiliation=affiliations.get(id)||{};
        const currentCharacter={
          ...(cached.character||{}),
          id,
          name:String(cached.character?.name||row?.name||id),
          corporation_id:Number(affiliation.corporation_id)||Number(cached.character?.corporation_id)||null,
          alliance_id:Number(affiliation.alliance_id)||Number(cached.character?.alliance_id)||null,
          faction_id:Number(affiliation.faction_id)||Number(cached.character?.faction_id)||null,
        };
        return{...cached,character:currentCharacter,cacheHit:true,stale};
      }
      pendingIntel++;
      const affiliation=affiliations.get(id)||{};
      return{
        updatedAt:null,
        character:{
          id,
          name:String(row?.name||id||'Unknown'),
          birthday:null,
          security_status:null,
          corporation_id:Number(affiliation.corporation_id)||null,
          alliance_id:Number(affiliation.alliance_id)||null,
          faction_id:Number(affiliation.faction_id)||null,
        },
        stats:compactThreatStats({}),
        statsError:null,
        cacheHit:false,
        pending:true,
      };
    });
  }else{
    entries=await threatMapLimit(selected,THREAT_FETCH_CONCURRENCY,async row=>{
      try{
        const intel=await getThreatCharacterIntel(row);
        if(intel.cacheHit)cacheHits++;else refreshed++;
        return intel;
      }catch(err){
        console.warn('Threat character lookup failed',row?.id,String(err.message||err));
        return{
          updatedAt:now(),
          character:{id:Number(row?.id)||0,name:String(row?.name||'Unknown'),birthday:null,security_status:null,corporation_id:null,alliance_id:null,faction_id:null},
          stats:compactThreatStats({}),
          statsError:String(err.message||err),
          cacheHit:false,
        };
      }
    });
    if(refreshed)await savePvpDb();
  }

  const visibleEntries=entries.filter(entry=>{
    const c=entry.character||{};
    const reason=threatIgnoreReason(c,{standingData});
    if(reason==='positive')ignoredPositive++;
    return reason!=='positive';
  });

  const corpIds=[],allianceIds=[],typeIds=[],partnerIds=[];
  for(const entry of visibleEntries){
    const c=entry.character||{},s=entry.stats||{};
    if(c.corporation_id)corpIds.push(c.corporation_id);
    if(c.alliance_id)allianceIds.push(c.alliance_id);
    for(const ship of [...(s.recentShips||[]),...(s.topShips||[])])if(Number(ship?.shipTypeID))typeIds.push(Number(ship.shipTypeID));
    for(const associate of s.associates||[])if(Number(associate?.characterID))partnerIds.push(Number(associate.characterID));
    for(const affiliate of s.affiliates||[])if(Number(affiliate?.allianceID))allianceIds.push(Number(affiliate.allianceID));
    const fountainRow=fountainSnapshot?.characters?.[String(c.id)]||null;
    for(const ship of fountainRow?.attackShips||[])if(Number(ship?.shipTypeID))typeIds.push(Number(ship.shipTypeID));
  }
  const shipCounts=new Map(parsed.shipTypeIds||[]);
  const unresolvedShipNames=[];
  for(const row of parsed.shipNames||[]){
    const typeId=resolvedShipNames.get(String(row.name).toLowerCase())?.id;
    if(typeId)shipCounts.set(typeId,(shipCounts.get(typeId)||0)+(Number(row.count)||0));
    else unresolvedShipNames.push(row.name);
  }
  for(const typeId of shipCounts.keys())typeIds.push(typeId);
  const names=await resolveUniverseNames([...corpIds,...allianceIds,...typeIds,...partnerIds]);

  const chars=visibleEntries.map(entry=>{
    const c=entry.character||{},s=entry.stats||{};
    const ships=(s.recentShips||[]).slice(0,6).map(ship=>({
      ...ship,
      shipTypeID:Number(ship?.shipTypeID)||0,
      shipName:names.get(Number(ship?.shipTypeID))||`Type ${ship?.shipTypeID||'?'}`,
    }));
    const topPartners=(s.associates||[]).slice(0,3).map(row=>({
      characterID:Number(row?.characterID)||0,
      name:names.get(Number(row?.characterID))||`Character ${row?.characterID||'?'}`,
      sharedKills:Number(row?.sharedKills)||0,
    }));
    const fountainRaw=fountainSnapshot?.characters?.[String(c.id)]||{};
    const fountainShips=(fountainRaw.attackShips||[]).slice(0,6).map(ship=>({
      shipTypeID:Number(ship?.shipTypeID)||0,
      shipName:names.get(Number(ship?.shipTypeID))||`Type ${ship?.shipTypeID||'?'}`,
      count:Number(ship?.count)||0,
    }));
    const fountain={
      ready:Boolean(fountainSnapshot),
      kills7d:Number(fountainRaw.kills7d)||0,
      kills24h:Number(fountainRaw.kills24h)||0,
      finalBlows7d:Number(fountainRaw.finalBlows7d)||0,
      losses7d:Number(fountainRaw.losses7d)||0,
      iskDestroyed7d:Number(fountainRaw.iskDestroyed7d)||0,
      iskLost7d:Number(fountainRaw.iskLost7d)||0,
      lastKillAt:fountainRaw.lastKillAt||null,
      lastLossAt:fountainRaw.lastLossAt||null,
      systems:Array.isArray(fountainRaw.systems)?fountainRaw.systems:[],
      ships:fountainShips,
    };
    const tags=[
      ...threatActivityLabels(s,ships.map(x=>x.shipName)),
      ...fountainThreatTags(fountain,fountainShips.map(x=>x.shipName)),
    ];
    return{
      id:Number(c.id)||0,
      name:String(c.name||'Unknown'),
      birthday:c.birthday||null,
      secStatus:Number.isFinite(Number(c.security_status))?Number(c.security_status):null,
      corporationID:Number(c.corporation_id)||0,
      allianceID:Number(c.alliance_id)||0,
      corporationName:c.corporation_id?(names.get(Number(c.corporation_id))||String(c.corporation_id)):'',
      allianceName:c.alliance_id?(names.get(Number(c.alliance_id))||String(c.alliance_id)):'',
      stats:s,
      ships,
      topPartners,
      tags,
      fountain,
      jlrThreat:jlrThreatScore(s,tags,fountain),
      statsError:entry.statsError||null,
      cacheHit:Boolean(entry.cacheHit),
      intelPending:Boolean(entry.pending),
      intelStale:Boolean(entry.stale),
    };
  }).sort((a,b)=>b.jlrThreat-a.jlrThreat||(Number(b.stats?.weekly?.shipsDestroyed)||0)-(Number(a.stats?.weekly?.shipsDestroyed)||0)||a.name.localeCompare(b.name));

  const ships=[...shipCounts.entries()].map(([shipTypeID,count])=>({
    shipTypeID:Number(shipTypeID),
    name:names.get(Number(shipTypeID))||`Type ${shipTypeID}`,
    count:Number(count)||0,
  })).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));

  // Keep the persistent threat cache bounded.
  const stored=Object.entries(pvpDb.threat?.characters||{});
  if(stored.length>5000){
    stored.sort((a,b)=>pvpDbTimestamp(b[1]?.updatedAt)-pvpDbTimestamp(a[1]?.updatedAt));
    pvpDb.threat.characters=Object.fromEntries(stored.slice(0,4000));
    await savePvpDb();
  }

  return{
    source:'JLR Threat Engine',
    scannedAt:now(),
    totalChars:chars.length,
    totalShips:ships.reduce((sum,row)=>sum+row.count,0),
    rawLineCount:parsed.rawLineCount,
    parsedPilotCount:parsed.names.length,
    resolvedPilotCount:unique.length,
    candidateCount:candidates.length,
    selectedPilotCount:selected.length,
    displayedPilotCount:chars.length,
    truncated,
    truncatedCount,
    ignored:{own:ignoredOwn,positive:ignoredPositive,total:ignoredOwn+ignoredPositive},
    standingsSource:positiveStandings?{characterId:positiveStandings.sourceCharacterId,name:positiveStandings.sourceCharacterName}:null,
    unresolvedNames:unresolved.slice(0,100),
    unresolvedShipNames:unresolvedShipNames.slice(0,30),
    refreshing:Boolean(fast&&pendingIntel>0),
    pendingIntel,
    staleIntel,
    cache:{hits:cacheHits,refreshed},
    regionalIntel:fountainSnapshot?{
      ready:true,regionId:FOUNTAIN_REGION_ID,regionName:'Fountain',generatedAt:fountainSnapshot.generatedAt||null,
      pagesFetched:Number(fountainSnapshot.pagesFetched)||0,truncated:Boolean(fountainSnapshot.truncated),killmailsProcessed:Number(fountainSnapshot.killmailsProcessed)||0,
    }:{ready:false,regionId:FOUNTAIN_REGION_ID,regionName:'Fountain'},
    chars,
    ships,
  };
}

function lifetimeMonthKeys(foundedAt){
  const nowDate=new Date();
  const founded=new Date(foundedAt||'2007-01-01T00:00:00Z');
  const start=Number.isFinite(founded.getTime())?founded:new Date('2007-01-01T00:00:00Z');
  const out=[];
  let year=nowDate.getUTCFullYear(),month=nowDate.getUTCMonth()+1;
  const startYear=start.getUTCFullYear(),startMonth=start.getUTCMonth()+1;
  while(year>startYear||(year===startYear&&month>=startMonth)){
    out.push({year,month,key:`${year}-${String(month).padStart(2,'0')}`});
    month--;
    if(month<1){month=12;year--}
  }
  return out;
}
function emptyPvpTotals(){return{damageDone:0,killmails:0,finalBlows:0,iskOnKillmails:0}}
function addPlainPvpTotals(target,source){
  target.damageDone=(Number(target.damageDone)||0)+(Number(source.damageDone)||0);
  target.killmails=(Number(target.killmails)||0)+(Number(source.killmails)||0);
  target.finalBlows=(Number(target.finalBlows)||0)+(Number(source.finalBlows)||0);
  target.iskOnKillmails=(Number(target.iskOnKillmails)||0)+(Number(source.iskOnKillmails)||0);
  return target;
}
async function scanCorpDamageMonth(corporationId,bucket){
  const corpId=Number(corporationId);
  const characters=new Map(),seenKillIds=new Set();
  let pagesFetched=0,truncated=false,previousPageSignature='';
  for(let page=1;page<=ZKILL_MAX_PAGES;page++){
    const url=`https://zkillboard.com/api/kills/corporationID/${corpId}/year/${bucket.year}/month/${bucket.month}/page/${page}/`;
    const rows=await zkillJson(url);
    if(!Array.isArray(rows))throw new Error(`zKillboard lifetime month ${bucket.key} page ${page} was not a killmail list.`);
    const signature=rows.slice(0,5).map(row=>String(row?.killmail_id||'')).join(',');
    if(page>1&&rows.length&&signature&&signature===previousPageSignature)throw new Error(`zKillboard repeated ${bucket.key} page ${page-1}.`);
    if(signature)previousPageSignature=signature;
    pagesFetched++;
    for(const km of rows){
      const killId=Number(km?.killmail_id);
      if(!killId||seenKillIds.has(killId))continue;
      seenKillIds.add(killId);
      const value=Number(km?.zkb?.totalValue)||0;
      for(const attacker of Array.isArray(km?.attackers)?km.attackers:[]){
        if(Number(attacker?.corporation_id)!==corpId)continue;
        const charId=Number(attacker?.character_id);
        if(!charId)continue;
        addPvpMetric(characters,charId,corpId,killId,value,Boolean(attacker?.final_blow),Number(attacker?.damage_done)||0);
      }
    }
    if(rows.length<200)break;
    if(page===ZKILL_MAX_PAGES){truncated=true;break}
    await sleep(ZKILL_LIFETIME_PAGE_GAP_MS);
  }
  const totals={};
  for(const row of characters.values()){
    totals[String(row.id)]={
      damageDone:Number(row.damageDone)||0,
      killmails:Number(row.killmails)||0,
      finalBlows:Number(row.finalBlows)||0,
      iskOnKillmails:Number(row.iskOnKillmails)||0,
    };
  }
  return{key:bucket.key,totals,pagesFetched,killmailsProcessed:seenKillIds.size,truncated};
}
function lifetimeDbForCorp(corporationId,corporationName,foundedAt){
  const key=String(corporationId);
  let db=pvpDb.lifetime[key];
  if(!db){
    db={
      corporationId:Number(corporationId),
      corporationName:String(corporationName||corporationId),
      foundedAt:foundedAt||null,
      historicalTotals:{},
      completedMonths:{},
      currentMonth:null,
      updatedAt:null,
    };
    pvpDb.lifetime[key]=db;
  }
  db.corporationName=String(corporationName||db.corporationName||corporationId);
  db.foundedAt=foundedAt||db.foundedAt||null;
  db.historicalTotals ||= {};
  db.completedMonths ||= {};
  return db;
}
function mergeHistoricalMonth(db,scan){
  for(const [characterId,row] of Object.entries(scan.totals||{})){
    const target=db.historicalTotals[characterId] ||= emptyPvpTotals();
    addPlainPvpTotals(target,row);
  }
  db.completedMonths[scan.key]={
    completedAt:now(),
    pagesFetched:scan.pagesFetched,
    killmailsProcessed:scan.killmailsProcessed,
    truncated:Boolean(scan.truncated),
  };
  db.updatedAt=now();
}
async function currentCorporationCharacterIds(ids,corporationId){
  const unique=[...new Set((ids||[]).map(Number).filter(id=>id>0))].sort((a,b)=>a-b);
  if(!unique.length)return new Set();
  const signature=crypto.createHash('sha1').update(unique.join(',')).digest('hex');
  const key=String(corporationId);
  const cached=corpAffiliationCache.get(key);
  if(cached&&cached.signature===signature&&Date.now()-cached.at<10*60*1000)return new Set(cached.ids);
  const current=new Set();
  for(let i=0;i<unique.length;i+=1000){
    const batch=unique.slice(i,i+1000);
    const {data}=await esiPost('https://esi.evetech.net/latest/characters/affiliation/?datasource=tranquility',batch);
    for(const row of Array.isArray(data)?data:[])if(Number(row?.corporation_id)===Number(corporationId))current.add(Number(row.character_id));
  }
  corpAffiliationCache.set(key,{at:Date.now(),signature,ids:[...current]});
  return current;
}
async function buildCorpLifetimeDamage(corporationId,corporationName,foundedAt,{forceCurrent=false}={}){
  const corpId=Number(corporationId),key=String(corpId);
  const db=lifetimeDbForCorp(corpId,corporationName,foundedAt);
  const months=lifetimeMonthKeys(foundedAt);
  const current=months[0];
  const historical=months.slice(1);
  const missing=historical.filter(bucket=>!db.completedMonths[bucket.key]);
  let monthsScanned=historical.length-missing.length;

  const setProgress=(extra={})=>zkillLifetimeDamageProgress.set(key,{
    status:'building',
    corporationId:corpId,
    corporationName:String(corporationName||corpId),
    monthsScanned,
    totalMonths:months.length,
    localMonthsCached:Object.keys(db.completedMonths).length,
    ...extra,
  });
  setProgress();

  for(const bucket of missing){
    setProgress({year:bucket.year,month:bucket.month,monthKey:bucket.key});
    const scan=await scanCorpDamageMonth(corpId,bucket);
    mergeHistoricalMonth(db,scan);
    monthsScanned++;
    setProgress({
      year:bucket.year,month:bucket.month,monthKey:bucket.key,
      pagesFetched:scan.pagesFetched,killmailsProcessed:scan.killmailsProcessed,
    });
    await savePvpDb();
    await sleep(ZKILL_LIFETIME_PAGE_GAP_MS);
  }

  const currentAge=db.currentMonth?.updatedAt?Date.now()-pvpDbTimestamp(db.currentMonth.updatedAt):Infinity;
  if(forceCurrent||!db.currentMonth||db.currentMonth.key!==current.key||currentAge>=ZKILL_CACHE_MS){
    setProgress({year:current.year,month:current.month,monthKey:current.key,currentMonth:true});
    const currentScan=await scanCorpDamageMonth(corpId,current);
    db.currentMonth={
      key:current.key,
      updatedAt:now(),
      totals:currentScan.totals,
      pagesFetched:currentScan.pagesFetched,
      killmailsProcessed:currentScan.killmailsProcessed,
      truncated:Boolean(currentScan.truncated),
    };
    db.updatedAt=now();
    await savePvpDb();
  }
  zkillLifetimeDamageProgress.set(key,{
    status:'ready',
    corporationId:corpId,
    corporationName:String(corporationName||corpId),
    monthsScanned:historical.length+(db.currentMonth?.key===current.key?1:0),
    totalMonths:months.length,
    localMonthsCached:Object.keys(db.completedMonths).length,
  });
  return db;
}
function ensureCorpLifetimeDamageBuild(corporationId,corporationName,foundedAt,force=false){
  const key=String(corporationId);
  const db=lifetimeDbForCorp(corporationId,corporationName,foundedAt);
  const months=lifetimeMonthKeys(foundedAt);
  const current=months[0];
  const missingHistorical=months.slice(1).some(bucket=>!db.completedMonths[bucket.key]);
  const currentAge=db.currentMonth?.updatedAt?Date.now()-pvpDbTimestamp(db.currentMonth.updatedAt):Infinity;
  const needsCurrent=!db.currentMonth||db.currentMonth.key!==current.key||currentAge>=ZKILL_CACHE_MS||force;
  if(!missingHistorical&&!needsCurrent)return null;
  if(zkillLifetimeDamageJobs.has(key))return zkillLifetimeDamageJobs.get(key);
  const job=buildCorpLifetimeDamage(corporationId,corporationName,foundedAt,{forceCurrent:force})
    .catch(err=>{
      zkillLifetimeDamageProgress.set(key,{status:'error',message:String(err.message||err)});
      console.warn('Lifetime corp damage build failed',key,String(err.message||err));
    })
    .finally(()=>zkillLifetimeDamageJobs.delete(key));
  zkillLifetimeDamageJobs.set(key,job);
  return job;
}
async function lifetimeDamageSnapshot(corporationId,corporationName,foundedAt){
  const corpId=Number(corporationId),key=String(corpId);
  const db=lifetimeDbForCorp(corpId,corporationName,foundedAt);
  const months=lifetimeMonthKeys(foundedAt);
  const current=months[0];
  const combined={};
  for(const [characterId,row] of Object.entries(db.historicalTotals||{})){
    combined[characterId]=addPlainPvpTotals(emptyPvpTotals(),row);
  }
  if(db.currentMonth?.key===current.key){
    for(const [characterId,row] of Object.entries(db.currentMonth.totals||{})){
      const target=combined[characterId] ||= emptyPvpTotals();
      addPlainPvpTotals(target,row);
    }
  }
  const ids=Object.keys(combined).map(Number).filter(id=>id>0);
  const currentIds=await currentCorporationCharacterIds(ids,corpId);
  const names=await resolveUniverseNames([...currentIds]);
  const rows=[...currentIds].map(id=>({
    characterId:id,
    name:names.get(id)||String(id),
    ...combined[String(id)],
  })).sort((a,b)=>
    b.damageDone-a.damageDone||
    b.finalBlows-a.finalBlows||
    b.killmails-a.killmails||
    b.iskOnKillmails-a.iskOnKillmails||
    a.characterId-b.characterId
  ).map((row,index)=>({rank:index+1,...row}));

  const historical=months.slice(1);
  const completedHistorical=historical.filter(bucket=>db.completedMonths[bucket.key]).length;
  const hasCurrent=db.currentMonth?.key===current.key;
  const ready=completedHistorical===historical.length&&hasCurrent;
  const progress=zkillLifetimeDamageProgress.get(key)||{};
  return{
    ready,
    building:zkillLifetimeDamageJobs.has(key),
    localDatabase:true,
    corporationId:corpId,
    corporationName:String(corporationName||corpId),
    generatedAt:db.updatedAt,
    monthsScanned:completedHistorical+(hasCurrent?1:0),
    totalMonths:months.length,
    localMonthsCached:Object.keys(db.completedMonths||{}).length,
    currentMonthUpdatedAt:db.currentMonth?.updatedAt||null,
    status:progress.status|| (ready?'ready':'building'),
    error:progress.status==='error'?progress.message:null,
    rows,
  };
}

async function trackerCorporationIdentity(){
  if(trackerCorporationCache.data&&Date.now()-trackerCorporationCache.at<30*60*1000){
    return trackerCorporationCache.data;
  }
  if(trackerCorporationCache.promise)return trackerCorporationCache.promise;
  const pending=(async()=>{
    let corporationId=TRACKER_CORPORATION_ID_ENV;
    let ownerCharacterId=null;
    if(!corporationId){
      const ids=await resolveUniverseIds([MARKET_CHARACTER_NAME]);
      ownerCharacterId=Number(ids.get(MARKET_CHARACTER_NAME))||0;
      if(!ownerCharacterId)throw new Error('Tracker owner character could not be resolved.');
      const character=(await esiGet(`https://esi.evetech.net/latest/characters/${ownerCharacterId}/?datasource=tranquility`)).data;
      corporationId=Number(character?.corporation_id)||0;
    }
    if(!corporationId)throw new Error('Tracker corporation could not be determined.');
    const corporation=(await esiGet(`https://esi.evetech.net/latest/corporations/${corporationId}/?datasource=tranquility`)).data;
    const data={
      corporationId,
      corporationName:String(corporation?.name||corporationId),
      ownerCharacterId:ownerCharacterId||null,
      ownerCharacterName:MARKET_CHARACTER_NAME,
    };
    trackerCorporationCache={at:Date.now(),data,promise:null};
    return data;
  })().finally(()=>{
    if(trackerCorporationCache.promise===pending)trackerCorporationCache.promise=null;
  });
  trackerCorporationCache.promise=pending;
  return pending;
}

async function trackerAccessForUser(user,{force=false}={}){
  const key=String(user?.id||'');
  const cached=trackerAccessCache.get(key);
  if(!force&&cached&&Date.now()-cached.at<TRACKER_ACCESS_CACHE_MS)return cached.data;
  const target=await trackerCorporationIdentity();
  const characterIds=[...new Set((user?.characterIds||[]).map(Number).filter(id=>id>0))];
  if(!characterIds.length){
    const data={allowed:false,reason:'NO_LINKED_CHARACTER'};
    trackerAccessCache.set(key,{at:Date.now(),data});
    return data;
  }
  const affiliations=[];
  for(let i=0;i<characterIds.length;i+=1000){
    const batch=characterIds.slice(i,i+1000);
    const {data}=await esiPost('https://esi.evetech.net/latest/characters/affiliation/?datasource=tranquility',batch);
    if(Array.isArray(data))affiliations.push(...data);
  }
  const matched=affiliations.find(row=>Number(row?.corporation_id)===Number(target.corporationId))||null;
  const data=matched?{
    allowed:true,
    reason:'CORPORATION_MEMBER',
    corporationId:target.corporationId,
    corporationName:target.corporationName,
    matchedCharacterId:Number(matched.character_id)||null,
  }:{
    allowed:false,
    reason:'CORPORATION_REQUIRED',
    corporationId:target.corporationId,
    corporationName:target.corporationName,
  };
  trackerAccessCache.set(key,{at:Date.now(),data});
  return data;
}

async function pvpCorporationForUser(user){
  const primaryId=Number(user?.primaryCharacterId);
  if(!primaryId)throw new Error('No primary EVE character is linked.');
  const cached=pvpCorpMetaCache.get(primaryId);
  if(cached&&Date.now()-cached.at<10*60*1000)return cached.data;
  const character=(await esiGet(`https://esi.evetech.net/latest/characters/${primaryId}/?datasource=tranquility`)).data;
  const corporationId=Number(character?.corporation_id);
  if(!corporationId)throw new Error('Could not determine your corporation from EVE.');
  const corporation=(await esiGet(`https://esi.evetech.net/latest/corporations/${corporationId}/?datasource=tranquility`)).data;
  if(Number(corporation?.alliance_id)!==INIT_ALLIANCE_ID)throw new Error(`${corporation?.name||'Your corporation'} is not currently in INIT.`);
  const data={primaryId,character,corporationId,corporation};
  pvpCorpMetaCache.set(primaryId,{at:Date.now(),data});
  return data;
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
    pvpDb.corp7d[String(corpId)]={updatedAt:now(),data};
    await savePvpDb();
    return data;
  })().finally(()=>{
    const current=zkillCorpLeaderboardCache.get(corpId);
    if(current?.promise===pending)zkillCorpLeaderboardCache.set(corpId,{...current,promise:null});
  });

  zkillCorpLeaderboardCache.set(corpId,{...cache,promise:pending});
  return pending;
}

async function pvpLeaderboardForUser(user,{force=false}={}){
  const {primaryId,character,corporationId,corporation}=await pvpCorporationForUser(user);

  const linkedIds=[...new Set((user.characterIds||[]).map(Number).filter(id=>id>0))];
  let linkedCorpCharacters=[];
  try{
    const {data}=linkedIds.length
      ?await esiPost('https://esi.evetech.net/latest/characters/affiliation/?datasource=tranquility',linkedIds)
      :{data:[]};
    const byId=new Map((Array.isArray(data)?data:[]).map(row=>[Number(row?.character_id),row]));
    linkedCorpCharacters=linkedIds.map(id=>{
      const affiliation=byId.get(id);
      if(Number(affiliation?.corporation_id)!==corporationId)return null;
      return{
        characterId:id,
        name:String(state.characters?.[String(id)]?.name||(id===primaryId?character?.name:null)||id),
        primary:id===primaryId,
      };
    }).filter(Boolean);
  }catch(err){
    console.warn('Bulk linked PvP affiliation lookup failed; falling back to individual lookups',String(err.message||err));
    linkedCorpCharacters=(await Promise.all(linkedIds.map(async id=>{
      try{
        const info=id===primaryId
          ?character
          :(await esiGet(`https://esi.evetech.net/latest/characters/${id}/?datasource=tranquility`)).data;
        if(Number(info?.corporation_id)!==corporationId)return null;
        return{
          characterId:id,
          name:String(state.characters?.[String(id)]?.name||info?.name||id),
          primary:id===primaryId,
        };
      }catch(inner){
        console.warn('Linked PvP toon corp lookup failed',id,String(inner.message||inner));
        return null;
      }
    }))).filter(Boolean);
  }

  const initAge=Date.now()-Number(zkillInitLeaderboardCache.updatedAt||0);
  let base=zkillInitLeaderboardCache.data||pvpDb.init7d?.data||null;
  let initRefreshing=false;
  if(!base&&Object.keys(pvpDb.initKillmails||{}).length){
    base=buildInitLeaderboardFromArchive();
    zkillInitLeaderboardCache={updatedAt:Date.now(),data:base,promise:zkillInitLeaderboardCache.promise||null};
  }
  if(!base){
    base=await buildInitZkillLeaderboard(force);
  }else if(force||initAge>=ZKILL_CACHE_MS){
    initRefreshing=true;
    buildInitZkillLeaderboard(force).catch(err=>console.warn('Background INIT leaderboard refresh failed',String(err.message||err)));
  }

  const corpCache=zkillCorpLeaderboardCache.get(corporationId)||null;
  let corpDirect=corpCache?.data||pvpDb.corp7d?.[String(corporationId)]?.data||null;
  let corpVerifyError=null;
  let corpRefreshing=false;
  const corpAge=Date.now()-Number(corpCache?.updatedAt||pvpDbTimestamp(pvpDb.corp7d?.[String(corporationId)]?.updatedAt)||0);
  if(!corpDirect||force||corpAge>=ZKILL_CACHE_MS){
    corpRefreshing=true;
    buildCorpZkillLeaderboard(corporationId,force)
      .catch(err=>console.warn('Background corporation zKill verification failed',String(err.message||err)));
  }

  // INIT pilot ranks must come from one common alliance-wide population.
  // Do not mix a complete corp-specific crawl into the alliance ranking first,
  // or one corp can be artificially promoted when the alliance query hits
  // zKillboard's 100-page ceiling.
  const allianceCharacters=base.characters.map(row=>({...row,rankActivity:Number(row.rank)||null}));
  const allianceById=new Map(allianceCharacters.map(row=>[Number(row.id),row]));
  const iskRanked=[...allianceCharacters].sort((a,b)=>
    b.iskOnKillmails-a.iskOnKillmails||
    b.finalBlows-a.finalBlows||
    b.killmails-a.killmails||
    b.damageDone-a.damageDone||
    a.id-b.id
  );
  iskRanked.forEach((row,index)=>row.rankIsk=index+1);
  const damageRanked=[...allianceCharacters].sort((a,b)=>
    b.damageDone-a.damageDone||
    b.finalBlows-a.finalBlows||
    b.killmails-a.killmails||
    b.iskOnKillmails-a.iskOnKillmails||
    a.id-b.id
  );
  damageRanked.forEach((row,index)=>row.rankDamage=index+1);

  // YOUR CORP uses the exact same canonical INIT-wide 7-day rows as the shared
  // pilot leaderboard. The direct corp crawl is verification-only and must not
  // alter viewer-visible metrics or rankings.
  const ownMemberMap=new Map(
    allianceCharacters
      .filter(row=>Number(row.corporationId)===corporationId)
      .map(row=>[Number(row.id),{...row}])
  );
  for(const linked of linkedCorpCharacters){
    const id=Number(linked.characterId);
    if(ownMemberMap.has(id))continue;
    const global=allianceById.get(id);
    ownMemberMap.set(id,{
      id,
      corporationId,
      killmails:Number(global?.killmails)||0,
      finalBlows:Number(global?.finalBlows)||0,
      damageDone:Number(global?.damageDone)||0,
      iskOnKillmails:Number(global?.iskOnKillmails)||0,
      rankActivity:global?.rankActivity||null,
      rankIsk:global?.rankIsk||null,
      rankDamage:global?.rankDamage||null,
      initRankMatched:Boolean(global),
    });
  }

  // BEST OVERALL is a corp-only 7-day ranking. Each category contributes
  // equally after normalizing against the strongest corp member in that metric,
  // so raw damage/ISK scale cannot overwhelm participation or final blows.
  const overallCandidates=[...ownMemberMap.values()].filter(row=>
    Number(row.killmails)>0||
    Number(row.finalBlows)>0||
    Number(row.damageDone)>0||
    Number(row.iskOnKillmails)>0
  );
  const overallMax={
    killmails:Math.max(0,...overallCandidates.map(row=>Number(row.killmails)||0)),
    finalBlows:Math.max(0,...overallCandidates.map(row=>Number(row.finalBlows)||0)),
    damageDone:Math.max(0,...overallCandidates.map(row=>Number(row.damageDone)||0)),
    iskOnKillmails:Math.max(0,...overallCandidates.map(row=>Number(row.iskOnKillmails)||0)),
  };
  const normalizedOverall=(value,max)=>max>0?(Number(value)||0)/max:0;
  const overallRanked=overallCandidates.map(row=>({
    ...row,
    overallScore:25*(
      normalizedOverall(row.killmails,overallMax.killmails)+
      normalizedOverall(row.finalBlows,overallMax.finalBlows)+
      normalizedOverall(row.damageDone,overallMax.damageDone)+
      normalizedOverall(row.iskOnKillmails,overallMax.iskOnKillmails)
    ),
  })).sort((a,b)=>
    b.overallScore-a.overallScore||
    b.finalBlows-a.finalBlows||
    b.killmails-a.killmails||
    b.damageDone-a.damageDone||
    b.iskOnKillmails-a.iskOnKillmails||
    a.id-b.id
  );
  overallRanked.forEach((row,index)=>{
    const member=ownMemberMap.get(Number(row.id));
    if(!member)return;
    member.rankOverall=index+1;
    member.overallScore=Number(row.overallScore.toFixed(2));
  });

  const corporationMap=new Map(base.corporations.map(row=>[Number(row.id),{...row}]));

  const weeklyIds=[...corporationMap.keys()];
  const weeklySnapshot=publishedCorporationWeeklyStatsMany(weeklyIds);
  const corpWeeklyStats=weeklySnapshot.data;
  const weeklyRefreshIds=force?weeklyIds:weeklySnapshot.staleIds;
  const corpWeeklyRefreshing=weeklyRefreshIds.length>0;
  if(corpWeeklyRefreshing)refreshCorporationWeeklyStatsInBackground(weeklyRefreshIds,force);
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
  const myMembersBase=[...ownMemberMap.values()].sort((a,b)=>
    Number(a.rankActivity||999999)-Number(b.rankActivity||999999)||
    b.killmails-a.killmails||
    a.id-b.id
  );
  const topCharacters=allianceCharacters.slice(0,100);
  const displayCharacterIds=[...new Set([...topCharacters,...myMembersBase].map(row=>row.id))];
  const corpIds=correctedCorporations.map(row=>row.id);
  const [charNames,corpNames]=await Promise.all([
    resolveUniverseNames(displayCharacterIds),
    resolveUniverseNames(corpIds),
  ]);

  const corpDisplay=correctedCorporations.slice(0,50);

  const decorateChar=row=>({
    rank:Number(row.rankActivity)||null,
    rankActivity:Number(row.rankActivity)||null,
    rankIsk:Number(row.rankIsk)||null,
    rankDamage:Number(row.rankDamage)||null,
    rankOverall:Number(row.rankOverall)||null,
    overallScore:Number.isFinite(Number(row.overallScore))?Number(row.overallScore):null,
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
    generatedAt:base.generatedAt,
    sharedCorpStatsPublishedAt:weeklySnapshot.publishedAt?new Date(weeklySnapshot.publishedAt).toISOString():null,
    pagesFetched:base.pagesFetched,
    truncated:base.truncated,
    killmailsProcessed:base.killmailsProcessed,
    localArchive:Boolean(base.localArchive),
    archiveUpdatedAt:base.archiveUpdatedAt||null,
    archiveCoverageStart:base.archiveCoverageStart||null,
    archiveCoverageEnd:base.archiveCoverageEnd||null,
    killmailsStored:Number(base.killmailsStored)||0,
    activeCharacters:allianceCharacters.length,
    activeCorporations:correctedCorporations.length,
    refreshing:Boolean(
      initRefreshing||
      corpRefreshing||
      corpWeeklyRefreshing||
      zkillInitLeaderboardCache.promise||
      zkillInitArchiveRefreshPromise||
      zkillCorpLeaderboardCache.get(corporationId)?.promise||
      zkillCorpStatsBatchPromise
    ),
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
    linkedCorpCharacters:linkedCorpCharacters.map(row=>({
      characterId:row.characterId,
      name:row.name,
      primary:row.primary,
    })),
  };
}
async function warmInitPvpCaches(){
  let base=zkillInitLeaderboardCache.data||pvpDb.init7d?.data||null;
  if(!base&&Object.keys(pvpDb.initKillmails||{}).length)base=buildInitLeaderboardFromArchive();
  if(!base)return;
  const ids=(base.corporations||[]).map(row=>Number(row.id)).filter(id=>id>0);
  const {staleIds}=publishedCorporationWeeklyStatsMany(ids);
  if(staleIds.length)refreshCorporationWeeklyStatsInBackground(staleIds,false);
}

async function routeApi(req,res,url) {
  if(req.method==='GET'&&url.pathname==='/api/config')return json(res,200,{name:'JLR Miner Tracker',version:'2.9.44',ssoConfigured:Boolean(EVE_CLIENT_ID),callbackUrl:callbackUrl(req),publicUrl:requestBaseUrl(req),miningScope:MINING_SCOPE,skillsScope:SKILLS_SCOPE,fittingsScope:FITTINGS_SCOPE,assetsScope:ASSETS_SCOPE,locationScope:LOCATION_SCOPE,contactsScope:CONTACTS_SCOPE,corporationContactsScope:CORPORATION_CONTACTS_SCOPE,allianceContactsScope:ALLIANCE_CONTACTS_SCOPE,scopes:ESI_SCOPES,marketCharacterName:MARKET_CHARACTER_NAME});
  if(req.method==='GET'&&url.pathname==='/api/me'){
    const u=readSession(req);
    if(u&&u.characterIds.some(id=>hasThreatContactAccess(state.characters[String(id)]?.scopes))){
      setTimeout(()=>positiveStandingContactsForUser(u).catch(err=>console.warn('Threat contacts warmup failed',String(err.message||err))),0);
    }
    if(!u)return json(res,200,{authenticated:false,user:null});
    const profile=myProfile(u);
    profile.trackerAccess=await trackerAccessForUser(u).catch(err=>({
      allowed:false,reason:'ACCESS_CHECK_FAILED',message:String(err.message||err),
    }));
    profile.doctrineMarketAccess=await doctrineAccessForUser(u).catch(err=>({
      allowed:false,reason:'ACCESS_CHECK_FAILED',message:String(err.message||err),checkedAt:now(),
    }));
    return json(res,200,{authenticated:true,user:profile});
  }
  const user=requireUser(req,res);if(!user)return;
  if(req.method==='GET'&&url.pathname==='/api/doctrine-market'){
    const access=await doctrineAccessForUser(user);
    if(!access.allowed)return json(res,403,{error:'INIT_BLUE_REQUIRED',message:access.message||'INIT or INIT-blue character required.'});
    doctrineRequested=true;
    refreshDoctrineMarket().catch(console.error);
    return json(res,200,await doctrineMarketSnapshot());
  }
  if(req.method==='GET'&&url.pathname==='/api/state')return json(res,200,publicState());
  if(req.method==='POST'&&url.pathname==='/api/voice/event'){
    if(!sameOrigin(req))return json(res,403,{error:'BAD_ORIGIN'});
    let body;
    try{body=await readBody(req,8_000)}
    catch(err){return json(res,400,{error:'BAD_VOICE_EVENT',message:String(err.message||err)})}
    const type=String(body?.type||'');
    let voiceText='',cacheKey='';
    if(type==='startup'){
      voiceText=jlrStartupVoiceText(user);
      cacheKey='startup';
    }else if(type==='scan'){
      const system=String(body?.system||'').trim();
      const scanAt=Date.parse(state.scans?.[system]?.lastScanAt||state.market?.a0Reports?.[system]?.lastCheckedAt||'');
      if(!system||!Number.isFinite(scanAt)||Date.now()-scanAt>10*60*1000){
        return json(res,409,{error:'RECENT_SCAN_REQUIRED',message:'A recent Probe Scanner update is required before announcing a scan result.'});
      }
      voiceText=jlrScanVoiceText(system);
      cacheKey=`scan-${system}-${new Date(scanAt).toISOString()}`;
    }else{
      return json(res,400,{error:'UNSUPPORTED_VOICE_EVENT',message:'That JLR voice event is not supported.'});
    }
    try{return sendTrackerAudio(res,await trackerVoiceWorkerAudio(voiceText,cacheKey))}
    catch(err){
      console.warn('JLR voice event failed',type,String(err.message||err));
      return json(res,503,{error:err?.code||'JLR_VOICE_UNAVAILABLE',message:String(err.message||err),fallbackText:voiceText});
    }
  }
  if(req.method==='GET'&&url.pathname==='/api/ledger-audit'){
    const date=dateUTC();
    const priceByMineral=effectiveJitaMineralPrices();
    const characterIds=[...new Set((user.characterIds||[]).map(String).filter(Boolean))];
    const characters=characterIds.map(id=>{
      const character=state.characters[id]||{};
      const cachedRows=ledgerRowsByCharacter.get(id);
      if(!Array.isArray(cachedRows)){
        return {characterId:id,name:String(character.name||id),cacheReady:false,lastSyncAt:character.lastSyncAt||null,m3:0,jbv:0,unpricedM3:0,ores:{}};
      }
      const daily=aggregateTrackedT3Ledger({rows:cachedRows,typeById:state.esi.typeCache,systemById:state.esi.systemCache,systemOreByName:SYSTEM_ORE_BY_NAME,priceByMineral,refineYield:MAX_REFINE_YIELD});
      const today=daily.find(row=>String(row.date)===date)||{m3:0,jbv:0,unpricedM3:0,ores:{}};
      return {characterId:id,name:String(character.name||id),cacheReady:true,lastSyncAt:character.lastSyncAt||null,m3:Number(today.m3||0),jbv:Number(today.jbv||0),unpricedM3:Number(today.unpricedM3||0),ores:today.ores&&typeof today.ores==='object'?today.ores:{}};
    }).sort((a,b)=>Number(b.cacheReady)-Number(a.cacheReady)||Number(b.jbv)-Number(a.jbv)||a.name.localeCompare(b.name));
    const totals=characters.reduce((out,row)=>{out.m3+=Number(row.m3||0);out.jbv+=Number(row.jbv||0);out.unpricedM3+=Number(row.unpricedM3||0);return out;},{m3:0,jbv:0,unpricedM3:0});
    const cachedCharacters=characters.filter(row=>row.cacheReady).length;
    return json(res,200,{date,dayBasis:'UTC',linkedCharacters:characters.length,cachedCharacters,missingCharacters:characters.length-cachedCharacters,totals,characters,refineYield:MAX_REFINE_YIELD,jitaBuyBasis:state.market?.jitaBuyBasis||'unavailable',generatedAt:now()});
  }
  if(req.method==='GET'&&url.pathname==='/api/zkill/lifetime-damage'){
    try{
      const {corporationId,corporation}=await pvpCorporationForUser(user);
      const force=url.searchParams.get('refresh')==='1';
      ensureCorpLifetimeDamageBuild(corporationId,corporation?.name,corporation?.date_founded,force);
      return json(res,200,await lifetimeDamageSnapshot(corporationId,corporation?.name,corporation?.date_founded));
    }catch(err){
      return json(res,502,{error:'LIFETIME_DAMAGE_FAILED',message:String(err.message||err)});
    }
  }
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
  if(req.method==='GET'&&url.pathname==='/api/tracker/heavy-fighters/voice/status'){
    let access;
    try{access=await trackerAccessForUser(user)}
    catch(err){return json(res,503,{error:'TRACKER_ACCESS_CHECK_FAILED',message:'Tracker access could not be verified with EVE right now.'})}
    if(!access.allowed)return json(res,403,{error:'TRACKER_CORPORATION_REQUIRED',message:'Tracker is restricted to the configured corporation.'});
    return json(res,200,await trackerVoiceHealth());
  }
  if(req.method==='GET'&&url.pathname==='/api/tracker/heavy-fighters/voice/test'){
    let access;
    try{access=await trackerAccessForUser(user)}
    catch(err){return json(res,503,{error:'TRACKER_ACCESS_CHECK_FAILED',message:'Tracker access could not be verified with EVE right now.'})}
    if(!access.allowed)return json(res,403,{error:'TRACKER_CORPORATION_REQUIRED',message:'Tracker is restricted to the configured corporation.'});
    try{
      const audio=await trackerVoiceWorkerAudio('Attention. J. L. R. custom voice systems are online. Heavy Fighter tracking is standing by.','test');
      return sendTrackerAudio(res,audio);
    }catch(err){
      console.warn('Tracker voice test failed',String(err.message||err));
      return json(res,503,{error:err?.code||'TRACKER_TTS_UNAVAILABLE',message:String(err.message||err)});
    }
  }
  const trackerVoiceMatch=url.pathname.match(/^\/api\/tracker\/heavy-fighters\/voice\/(\d+)$/);
  if(req.method==='GET'&&trackerVoiceMatch){
    let access;
    try{access=await trackerAccessForUser(user)}
    catch(err){return json(res,503,{error:'TRACKER_ACCESS_CHECK_FAILED',message:'Tracker access could not be verified with EVE right now.'})}
    if(!access.allowed)return json(res,403,{error:'TRACKER_CORPORATION_REQUIRED',message:'Tracker is restricted to the configured corporation.'});
    try{
      const loss=await trackerVoiceLossById(trackerVoiceMatch[1]);
      if(!loss)return json(res,404,{error:'TRACKER_LOSS_NOT_FOUND',message:'That Heavy Fighter loss is not available in the current Tracker window.'});
      return sendTrackerAudio(res,await trackerVoiceForLoss(loss));
    }catch(err){
      console.warn('Tracker voice generation failed',String(err.message||err));
      return json(res,503,{error:err?.code||'TRACKER_TTS_UNAVAILABLE',message:String(err.message||err)});
    }
  }
  if(req.method==='GET'&&url.pathname==='/api/tracker/heavy-fighters'){
    let access;
    try{access=await trackerAccessForUser(user)}
    catch(err){
      console.warn('Tracker access check failed',String(err.message||err));
      return json(res,503,{error:'TRACKER_ACCESS_CHECK_FAILED',message:'Tracker access could not be verified with EVE right now.'});
    }
    if(!access.allowed)return json(res,403,{
      error:'TRACKER_CORPORATION_REQUIRED',
      message:'Tracker is restricted to the configured corporation.',
    });
    const wantsRefresh=url.searchParams.get('refresh')==='1';
    const force=wantsRefresh&&Date.now()-Number(heavyFighterTrackerCache.updatedAt||0)>=10*1000;
    try{return json(res,200,{...(await heavyFighterTracker(force)),access:{corporationName:access.corporationName}})}
    catch(err){
      console.warn('Heavy Fighter tracker failed',String(err.message||err));
      return json(res,502,{error:'HEAVY_FIGHTER_TRACKER_FAILED',message:String(err.message||err)});
    }
  }
  if(req.method==='GET'&&url.pathname==='/api/tracker/heavy-fighters/stream'){
    let access;
    try{access=await trackerAccessForUser(user)}
    catch(err){
      console.warn('Tracker stream access check failed',String(err.message||err));
      return json(res,503,{error:'TRACKER_ACCESS_CHECK_FAILED',message:'Tracker access could not be verified with EVE right now.'});
    }
    if(!access.allowed)return json(res,403,{error:'TRACKER_CORPORATION_REQUIRED',message:'Tracker is restricted to the configured corporation.'});
    res.writeHead(200,{
      'Content-Type':'text/event-stream',
      'Cache-Control':'no-cache, no-transform',
      'Connection':'keep-alive',
      'X-Accel-Buffering':'no',
    });
    res.write('retry: 3000\n');
    res.write(`event: ready\ndata: ${JSON.stringify({...trackerLiveStatus(),corporationName:access.corporationName})}\n\n`);
    trackerLiveClients.add(res);
    req.on('close',()=>trackerLiveClients.delete(res));
    return;
  }
  if(req.method==='GET'&&url.pathname==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`event: state\ndata: ${JSON.stringify(publicState())}\n\n`);sseClients.add(res);req.on('close',()=>sseClients.delete(res));return}
  if(!sameOrigin(req))return json(res,403,{error:'BAD_ORIGIN'});
  if(req.method==='POST'&&url.pathname==='/api/doctrine-market/refresh'){
    const access=await doctrineAccessForUser(user,{force:true});
    if(!access.allowed)return json(res,403,{error:'INIT_BLUE_REQUIRED',message:access.message||'INIT or INIT-blue character required.'});
    doctrineRequested=true;
    refreshDoctrineMarket({forceCn:true}).catch(console.error);
    return json(res,202,await doctrineMarketSnapshot());
  }
  if(req.method==='POST'&&url.pathname==='/api/threat-share'){
    let body;
    try{body=await readBody(req,75_000)}
    catch(err){return json(res,400,{error:'BAD_SCAN',message:String(err.message||err)})}
    const scanText=String(body?.text||'').trim();
    if(scanText.length<2)return json(res,400,{error:'EMPTY_SCAN',message:'Paste a D-scan, Local list, or fleet scan first.'});
    if(scanText.length>50_000)return json(res,413,{error:'SCAN_TOO_LARGE',message:'The scan is too large to share. Keep it under 50,000 characters.'});
    try{return json(res,200,await createDscanInfoShare(scanText))}
    catch(err){
      console.warn('dscan.info share failed',String(err.message||err));
      return json(res,502,{error:'DSCAN_SHARE_FAILED',message:`Could not create the dscan.info link: ${String(err.message||err)}`});
    }
  }
  if(req.method==='POST'&&url.pathname==='/api/threat-scan'){
    let body;
    try{body=await readBody(req,300_000)}
    catch(err){return json(res,400,{error:'BAD_SCAN',message:String(err.message||err)})}
    const scanText=String(body?.text||'').trim();
    if(scanText.length<2)return json(res,400,{error:'EMPTY_SCAN',message:'Paste character names, Local, or D-scan text first.'});
    if(scanText.length>250_000)return json(res,413,{error:'SCAN_TOO_LARGE',message:'Threat scan text is too large. Keep the paste under 250,000 characters.'});

    const ignoreOwn=body?.ignoreOwn!==false;
    const ignorePositive=body?.ignorePositive!==false;
    try{
      const cacheKey=crypto.createHash('sha256').update(`${user.id}|${ignoreOwn?'1':'0'}|${ignorePositive?'1':'0'}|${fountainThreatCache.updatedAt||0}|${scanText}`).digest('hex');
      const cached=threatScanCache.get(cacheKey);
      if(cached&&Date.now()-cached.at<2*60*1000)return json(res,200,{...cached.data,cached:true,refreshing:false});

      const running=threatScanJobs.get(cacheKey);
      if(running)return json(res,200,{...running.partial,refreshing:true});

      const scanOptions={
        ignoreOwnIds:ignoreOwn?user.characterIds:[],
        positiveStandingsPromise:ignorePositive?positiveStandingContactsForUser(user):Promise.resolve(null),
      };
      const partial=await buildThreatIntel(scanText,{...scanOptions,fast:true});
      if(!partial.refreshing){
        const complete={...partial,refreshing:false};
        threatScanCache.set(cacheKey,{at:Date.now(),data:complete});
        return json(res,200,complete);
      }

      const job={partial:{...partial,refreshing:true},promise:null};
      const promise=buildThreatIntel(scanText,{...scanOptions,fast:false})
        .then(data=>{
          const complete={...data,refreshing:false};
          threatScanCache.set(cacheKey,{at:Date.now(),data:complete});
          if(threatScanCache.size>40){
            const oldest=[...threatScanCache.entries()].sort((a,b)=>a[1].at-b[1].at).slice(0,10);
            for(const [key] of oldest)threatScanCache.delete(key);
          }
          return complete;
        })
        .catch(err=>{
          console.warn('Background threat enrichment failed',String(err.message||err));
          throw err;
        })
        .finally(()=>{if(threatScanJobs.get(cacheKey)===job)threatScanJobs.delete(cacheKey)});
      job.promise=promise;
      threatScanJobs.set(cacheKey,job);
      promise.catch(()=>{});
      return json(res,200,job.partial);
    }catch(err){
      if(err?.code==='CONTACT_SCOPE_REQUIRED')return json(res,409,{error:err.code,message:String(err.message||err)});
      console.warn('Threat scan failed',String(err.message||err));
      return json(res,502,{error:'THREAT_SCAN_FAILED',message:String(err.message||err)});
    }
  }
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
  const fitBindMatch=url.pathname.match(/^\/api\/esi\/fittings\/(\d+)\/([^/]+)\/bind$/);
  if(fitBindMatch&&req.method==='POST'){
    const characterId=String(fitBindMatch[1]);
    const fittingId=decodeURIComponent(fitBindMatch[2]);
    if(!user.characterIds.map(String).includes(characterId))return json(res,404,{error:'CHARACTER_NOT_LINKED',message:'That toon is not linked to your JLR account.'});
    const ch=state.characters[characterId];
    if(!ch)return json(res,404,{error:'CHARACTER_NOT_LINKED',message:'That toon is not linked to your JLR account.'});
    try{
      const body=await readBody(req);
      const fit=bindCharacterAbyssalFit(ch,fittingId,body.shipItemId);
      await save();
      broadcast();
      return json(res,200,{ok:true,fit,user:myProfile(user)});
    }catch(err){
      const status=['FIT_NOT_FOUND','INVALID_ABYSSAL_BINDING'].includes(err?.code)?409:500;
      return json(res,status,{error:err?.code||'ABYSSAL_BIND_FAILED',message:String(err.message||err)});
    }
  }

  const fitSyncMatch=url.pathname.match(/^\/api\/esi\/fittings\/(\d+)$/);
  if(fitSyncMatch&&req.method==='POST'){
    const characterId=String(fitSyncMatch[1]);
    if(!user.characterIds.map(String).includes(characterId))return json(res,404,{error:'CHARACTER_NOT_LINKED',message:'That toon is not linked to your JLR account.'});
    const ch=state.characters[characterId];
    if(!ch)return json(res,404,{error:'CHARACTER_NOT_LINKED',message:'That toon is not linked to your JLR account.'});
    try{
      const fitSync=await refreshCharacterFittings(ch);
      await save();
      broadcast();
      return json(res,200,{ok:true,fitSync,user:myProfile(user)});
    }catch(err){
      const status=['FITTINGS_SCOPE_REQUIRED','ASSETS_SCOPE_REQUIRED'].includes(err?.code)?409:502;
      return json(res,status,{error:err?.code||'FIT_SYNC_FAILED',message:String(err.message||err)});
    }
  }
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
server.listen(PORT,'0.0.0.0',()=>{console.log(`JLR Miner Tracker v2.9.44 listening on port ${PORT}`);console.log(`Website SSO: ${EVE_CLIENT_ID?'configured':'not configured'}`);console.log(`Tracked T3 systems: ${SYSTEM_DEFS.length}`)});
setTimeout(()=>runTrackerR2z2Loop().catch(err=>console.error('Tracker R2Z2 loop stopped',err)),3_000).unref();
setInterval(()=>{for(const res of [...trackerLiveClients]){try{res.write(': tracker-heartbeat\n\n')}catch{trackerLiveClients.delete(res)}}},20_000).unref();
setInterval(()=>resetExpired(true),15_000).unref();
async function runAutomaticSyncLoop(){
  const startedAt=Date.now();
  await syncAll().catch(console.error);
  const elapsed=Date.now()-startedAt;
  setTimeout(runAutomaticSyncLoop,Math.max(30_000,ESI_AUTO_REFRESH_MS-elapsed)).unref();
}
setTimeout(runAutomaticSyncLoop,5_000).unref();
setInterval(()=>refreshFountainThreatActivity(false).catch(console.error),FOUNTAIN_THREAT_CACHE_MS).unref();
setTimeout(()=>refreshFountainThreatActivity(false).catch(console.error),2_500).unref();
setInterval(()=>buildInitZkillLeaderboard(false).catch(console.error),ZKILL_ARCHIVE_REFRESH_MS).unref();
setTimeout(()=>{
  if(zkillInitLeaderboardCache.data)zkillInitLeaderboardCache.updatedAt=Date.now();
  refreshInitKillmailArchive(false).then(()=>{
    zkillInitLeaderboardCache.updatedAt=0;
    return buildInitZkillLeaderboard(false);
  }).then(()=>warmInitPvpCaches()).catch(console.error);
},7_500).unref();
setInterval(()=>refreshMarketPrices().catch(console.error),60*60_000).unref();
setInterval(()=>{if(doctrineRequested)refreshDoctrineMarket().catch(console.error)},DOCTRINE_CN_REFRESH_MS).unref();
setTimeout(()=>refreshMarketPrices().catch(console.error),2_000).unref();
setInterval(()=>refreshFieldDistances().catch(console.error),24*60*60_000).unref();
setTimeout(()=>refreshFieldDistances().catch(console.error),1_000).unref();
