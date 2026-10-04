import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  function syncBoardNodes('),source.indexOf('  function renderBoards('));
const ctx=vm.createContext({document:{activeElement:null}});vm.runInContext(code,ctx);
const card=(key,version,hover=false)=>({dataset:{boardKey:key},outerHTML:version,matches:()=>hover,contains:()=>false});
function board(...children){return {children,moves:0,get lastElementChild(){return this.children.at(-1);},insertBefore(node,before){this.moves++;const previous=this.children.indexOf(node);if(previous>=0)this.children.splice(previous,1);const index=before?this.children.indexOf(before):this.children.length;this.children.splice(index,0,node);},removeChild(node){this.children.splice(this.children.indexOf(node),1);}};}
const a=card('ice:A','old',true),b=card('t3:B','same');let root=board(a,b);
ctx.syncBoardNodes(root,[card('ice:A','new'),card('t3:B','same')]);
assert.equal(root.children[0],a,'hovered card stays attached despite an incoming update');assert.equal(root.children[1],b);assert.equal(root.moves,0,'unchanged refresh does not detach any card');
a.matches=()=>false;const changed=card('ice:A','new');ctx.syncBoardNodes(root,[changed,card('t3:B','same')]);
assert.equal(root.children[0],changed,'latest data paints after hover ends');assert.equal(root.children[1],b);
ctx.document.activeElement={};changed.contains=()=>true;ctx.syncBoardNodes(root,[card('ice:A','newer'),card('t3:B','same')]);assert.equal(root.children[0],changed,'keyboard focus stays attached');
ctx.syncBoardNodes(root,[card('t3:B','same')]);assert.deepEqual(root.children,[b],'removed entries are not retained by hover preservation');
ctx.syncBoardNodes(root,[]);assert.equal(root.children.length,0);
console.log('Stable hovered/focused board cards, deferred data refresh and removed-entry cleanup passed.');
