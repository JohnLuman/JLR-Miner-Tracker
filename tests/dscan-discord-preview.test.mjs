import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  summarizeDiscordScan, renderDiscordScanSvg, renderDiscordScanPng,
  discordScanDescription, renderDiscordScanHtml,
} from '../lib/dscan-discord-preview.mjs';

const example={
  token:'safePublicToken',
  system:'',
  createdAt:'2026-10-10T22:14:00.000Z',
  updatedAt:'2026-10-10T22:14:00.000Z',
  dscanText:Array(30).fill('Mackinaw\tMackinaw\t12 km').join('\n'),
  localText:'',
};
const mining=summarizeDiscordScan(example);
assert.equal(mining.shipCount,30);
assert.equal(mining.miningCount,30);
assert.equal(mining.combatCount,0);
assert.equal(mining.ships.length,1);
assert.deepEqual(mining.ships[0],{name:'Mackinaw',group:'Exhumer',role:'mining',count:30});
assert.equal(mining.system,'SYSTEM NOT PROVIDED','never invent a system');
assert.equal(mining.confirmedHostiles,null,'D-scan cannot identify hostile standings');
assert.match(mining.status,/MINING ACTIVITY/);
assert.doesNotMatch(mining.status,/HOSTILE SHIPS/i);
assert.match(discordScanDescription(example),/30× Mackinaw/);
assert.equal(discordScanDescription(example),'30× Mackinaw','Discord description lists only ships');
const localColorExample={
  ...example,
  local:{pilots:[{standingStatus:'friendly'},{standingStatus:'friendly'},{standingStatus:'hostile'},{standingStatus:'neutral'},{standingStatus:'unknown'}]},
};
const summary=discordScanDescription(localColorExample);
assert.equal(summary,'30× Mackinaw','Discord description should show ships only, even when Local standings are attached');
assert.doesNotMatch(summary,/Hostility|unverified|friendly|hostile|neutral/i,'hide standing commentary and count banners');
// A multi-ship D-scan should fit the compact embed line without wrapping into
// a paragraph. Omitted ship types are represented by a trailing ellipsis.
const exampleShips={
  dscanText:[
    'Velator\tVelator\t5 km','Velator\tVelator\t6 km',
    'Akoman\tAkoman\t7 km','Falcon\tFalcon\t8 km',
    'Ibis\tIbis\t9 km','Pilgrim\tPilgrim\t10 km',
    'Pioneer\tPioneer\t11 km',
  ].join('\n'),
};
const brief=discordScanDescription(exampleShips);
assert.ok(brief.length<=48,'Discord embed description has a one-line character budget');
assert.match(brief,/^2× Velator · 1× Akoman/,'keep most common ships first');
assert.match(brief,/\.\.\.$/,'append ... when additional ships do not fit');
assert.doesNotMatch(brief,/contacts|Hostility|unverified|System/i,'only list ships');
assert.equal(discordScanDescription({localText:'Pilot One\nPilot Two'}),'No ships identified','Local-only link is concise');
const longHull=discordScanDescription({dscanText:'Raven Navy Issue\tRaven Navy Issue\t10 km'});
assert.equal(longHull,'1× Raven Navy Issue','untruncated single entry has no ellipsis');

const miningSvg=renderDiscordScanSvg(example);
assert.match(miningSvg,/Jlr/);
assert.match(miningSvg,/Hub/);
assert.equal((miningSvg.match(/>Jlr<\/text>/g)||[]).length,1,'brand first half appears only once');
assert.equal((miningSvg.match(/>Hub<\/text>/g)||[]).length,1,'brand second half appears only once');
assert.doesNotMatch(miningSvg,/JLRHUB(?:\.COM)?|VIEW FULL LIST ON JLRHUB/i,'no repeated brand next to system or footer');
assert.match(miningSvg,/VIEW FULL INTEL/,'footer links to detail without repeating the brand');
assert.doesNotMatch(miningSvg,/Tracker/i,'old Tracker branding must not appear');
assert.doesNotMatch(miningSvg,/<text[^>]+>.*HOSTILE SHIPS/,'miners must not be treated as hostiles');
assert.match(miningSvg,/Mackinaw/);
assert.match(miningSvg,/Exhumer/);
assert.match(miningSvg,/filter="url\(#glow\)"/,'logo and outer borders use high-end neon glows');
assert.match(miningSvg,/SHIP INTELLIGENCE/,'metadata graphic includes polished ship table');
assert.match(miningSvg,/>30<\/text>/);
// The approved Discord card fits eight distinct hulls in the image, and
// reports overflow when a ninth hull is present (not eight individual ships).
const eightTypes=[
  'Sabre','Loki','Falcon','Pilgrim','Rapier','Vagabond','Raven','Arazu'
];
const eightRowScan={system:'C-N4OD',dscanText:eightTypes.flatMap(name=>Array(2).fill(name+'\t'+name+'\t10 km')).join('\n')};
const eightSvg=renderDiscordScanSvg(eightRowScan);
assert.match(eightSvg,/>Sabre<\/text>/,'first ship type is rendered');
for(const name of eightTypes)assert.match(eightSvg,new RegExp('>'+name+'<\/text>'),'visible eighth hull: '+name);
assert.match(eightSvg,/8 HULL TYPES/,'counter reports eight different hulls');
assert.doesNotMatch(eightSvg,/MORE SHIP TYPES/,'there is no overflow at exactly eight types');
assert.match(eightSvg,/y="524"[^>]*height="34"/,'eighth row starts at 524, above the footer');
const ninthScan={...eightRowScan,dscanText:eightRowScan.dscanText+'\nMackinaw\tMackinaw\t15 km'};
const nineSvg=renderDiscordScanSvg(ninthScan);
assert.doesNotMatch(nineSvg,/>Mackinaw<\/text>/,'ninth ship type does not overlap the footer');
assert.match(nineSvg,/1 MORE SHIP TYPE/,'ninth type is indicated as overflow');
assert.match(nineSvg,/OPEN LINK FOR FULL LIST/,'overflow links to full intel');
assert.equal((nineSvg.match(/<text[^>]*>.*<\/text>/g)||[]).length>0,true,'generated SVG includes labels');
const png=await renderDiscordScanPng(example);
assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a','renderer returns Discord-compatible PNG');
assert.ok(png.length>2000,'PNG has visible content');
const combat=summarizeDiscordScan({
  dscanText:'Raven\tRaven\t78 km\nLoki\tLoki\t105 km\nMackinaw\tMackinaw\t10 km',
});
assert.equal(combat.shipCount,3);
assert.equal(combat.combatCount,2);
assert.equal(combat.miningCount,1);
assert.match(combat.status,/STANDINGS UNKNOWN/,'do not assert hostility from hull classification');
const localOnly=summarizeDiscordScan({localText:'Pilot One\nPilot Two'});
assert.equal(localOnly.shipCount,0);
assert.equal(localOnly.pilotCount,2);
assert.match(localOnly.status,/NO VERIFIED SHIP CONTACTS/);
const unknown=summarizeDiscordScan({dscanText:'Test Object\tAsteroid\t20 km'});
assert.equal(unknown.shipCount,0);
assert.equal(unknown.otherCount,1,'unclassified scan objects are not automatically called ships');
const htmlTemplate=fs.readFileSync(new URL('../public/dscan-share.html',import.meta.url),'utf8');
const imageUrl='https://jlrhub.com/dscan-preview/safePublicToken.png?v=abc123';
const rendered=renderDiscordScanHtml(htmlTemplate,example,{canonicalUrl:'https://jlrhub.com/d/safePublicToken',imageUrl});
assert.match(rendered,/<meta property="og:site_name" content="JlrHub">/);
assert.match(rendered,/property="og:image"/,'Discord preview restores the high-definition scan image');
assert.match(rendered,/name="twitter:card" content="summary_large_image"/,'social card uses the full image');
assert.match(rendered,/<meta property="og:url" content="https:\/\/jlrhub.com\/d\/safePublicToken">/);
assert.match(rendered,/name="twitter:image"/,'Discord image also works for Twitter-style previews');
assert.match(rendered,/<meta property="og:description" content="30× Mackinaw">/);
assert.match(rendered,/<meta property="og:image:width" content="1200">/);
assert.match(rendered,/<meta property="og:image:height" content="630">/);
assert.match(rendered,/<meta property="og:title" content="30 SHIPS ON D-SCAN">/,'compact title shows scan count without repeating the site name');
assert.doesNotMatch(rendered,/og:title" content="JLR Shared Intel"/);
const renderedWithSystem=renderDiscordScanHtml(htmlTemplate,{...example,system:'C-N4OD'},{
  canonicalUrl:'https://jlrhub.com/d/safePublicToken?card=hdscan3',imageUrl,
});
assert.match(renderedWithSystem,/<meta property="og:title" content="C-N4OD • 30 SHIPS ON D-SCAN">/,'known system leads the Discord headline');
assert.match(renderedWithSystem,/<meta property="og:site_name" content="JlrHub">/,'JlrHub appears once in the site header');
assert.match(renderedWithSystem,/property="og:image"/,'polished large card includes live ship artwork');
const injection=renderDiscordScanHtml(htmlTemplate,{...example,system:'<script>alert(1)</script>'},{
  canonicalUrl:'https://jlrhub.com/d/safePublicToken',imageUrl,
});
assert.doesNotMatch(injection,/content="[^"]*<script>/,'no raw system text in HTML metadata');
const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
assert.match(server,/dscan-preview\/.*png/);
assert.match(server,/renderDiscordScanHtml\(template,row/);
assert.match(server,/fingerprint=crypto.createHash/,'preview image URL changes when share updates');
assert.match(server,/card=hdscan3/,'new copy links bypass cached previous Discord previews');
assert.match(server,/canonicalUrl:baseUrl\+url.pathname\+url.search/,'OG canonical URLs preserve the cache-busting card query');
const appSource=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
assert.match(appSource,/function versionDiscordScanLink/,'existing saved share links are updated to the text-only preview version');
assert.match(appSource,/searchParams.set\('card','hdscan3'\)/,'saved links get the restored artwork URL');

console.log('Discord metadata previews: mining fleets, unknown hostility, missing system, ship-only, Local-only, PNG, and OG HTML passed');
