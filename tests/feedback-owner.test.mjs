import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const styles=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.match(server,/JLR_OWNER_CHARACTER_NAME = String\(process\.env\.JLR_OWNER_CHARACTER_NAME \|\| 'John Leman Raholan'\)/,'owner character defaults to John Leman Raholan');
assert.match(server,/function userHasLinkedCharacterName\(user,name\)/,'owner access is based on linked ESI characters');
assert.match(server,/state\.characters\?\.\[id\]\?\.name/,'owner verification reads the linked ESI character record');
assert.match(server,/function jlrOwnerAccess\(user\)/,'server has one owner-access gate');
assert.match(server,/const owner=jlrOwnerAccess\(user\)/,'feedback route checks owner access');
assert.match(server,/owner\?200:25/,'owner can receive a larger all-user feedback feed');
assert.match(server,/owner\?\{displayName:String\(row\?\.displayName\|\|'Unknown pilot'\)\}:\{\}/,'submitter names are exposed only to owner view');
assert.match(server,/ownerCharacter:owner\?JLR_OWNER_CHARACTER_NAME:null/,'owner response identifies the verified ESI credential');

assert.match(app,/OWNER • ALL USER SUBMISSIONS/,'owner feedback view is clearly labeled');
assert.match(app,/feedbackOwner=Boolean\(payload\?\.owner\)/,'client trusts server owner authorization flag');
assert.match(app,/PILOT.*row\.displayName/,'owner rows show submitting pilot names');
assert.match(app,/feedbackOwner\?100:15/,'owner can browse more submissions than normal users');
assert.match(app,/feedback-owner-full/,'owner feedback list gets a full-text display mode');
assert.match(styles,/feedback-recent\.feedback-owner-full \.feedback-history-row>p\{display:block;/,'owner feedback text is not line-clamped');

assert.equal(pkg.version,'2.9.134','owner feedback release is versioned');
assert.ok(index.includes('/app.js?v=2.9.134'),'browser loads the owner-feedback app build');

console.log('Owner feedback ESI access tests passed.');
