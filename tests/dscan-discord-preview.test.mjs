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
assert.match(discordScanDescription(example),/30x Mackinaw/);
assert.match(discordScanDescription(example),/Hostility unverified/);
const miningSvg=renderDiscordScanSvg(example);
assert.match(miningSvg,/Jlr/);
assert.match(miningSvg,/Hub/);
assert.doesNotMatch(miningSvg,/Tracker/i,'old Tracker branding must not appear');
assert.doesNotMatch(miningSvg,/<text[^>]+>.*HOSTILE SHIPS/,'miners must not be treated as hostiles');
assert.match(miningSvg,/Mackinaw/);
assert.match(miningSvg,/Exhumer/);
assert.match(miningSvg,/>30<\/text>/);
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
assert.doesNotMatch(rendered,/property="og:image"/,'Discord preview is text-only without large images');
assert.doesNotMatch(rendered,/name="twitter:card"/,'Discord shows only the link text summary');
assert.match(rendered,/<meta property="og:url" content="https:\/\/jlrhub.com\/d\/safePublicToken">/);
assert.doesNotMatch(rendered,/name="twitter:image"/,'Discord share previews omit image tags entirely');
assert.match(rendered,/<meta property="og:description" content="30 ship contacts \| 30x Mackinaw/);
assert.doesNotMatch(rendered,/og:title" content="JLR Shared Intel"/);
const injection=renderDiscordScanHtml(htmlTemplate,{...example,system:'<script>alert(1)</script>'},{
  canonicalUrl:'https://jlrhub.com/d/safePublicToken',imageUrl,
});
assert.doesNotMatch(injection,/content="[^"]*<script>/,'no raw system text in HTML metadata');
const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
assert.match(server,/dscan-preview\/.*png/);
assert.match(server,/renderDiscordScanHtml\(template,row/);
assert.match(server,/fingerprint=crypto.createHash/,'preview image URL changes when share updates');
console.log('Discord metadata previews: mining fleets, unknown hostility, missing system, ship-only, Local-only, PNG, and OG HTML passed');
