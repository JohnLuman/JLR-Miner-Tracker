import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  function syncBoardNodes('),source.indexOf('  function renderBoards('));
const ctx=vm.createContext({document:{activeElement:null}});vm.runInContext(code,ctx);
const card=(key,version,hover=false)=>({dataset:{boardKey:key},outerHTML:version,matches:()=>hover,contains:()=>false,querySelector:()=>null});
function board(...children){return {children,moves:0,get lastElementChild(){return this.children.at(-1);},insertBefore(node,before){this.moves++;const previous=this.children.indexOf(node);if(previous>=0)this.children.splice(previous,1);const index=before?this.children.indexOf(before):this.children.length;this.children.splice(index,0,node);},removeChild(node){this.children.splice(this.children.indexOf(node),1);}};}
const a=card('ice:A','old',true),b=card('t3:B','same');let root=board(a,b);
ctx.syncBoardNodes(root,[card('ice:A','new'),card('t3:B','same')]);
assert.equal(root.children[0],a,'hovered card stays attached despite an incoming update');assert.equal(root.children[1],b);assert.equal(root.moves,0,'unchanged refresh does not detach any card');
a.matches=()=>false;const changed=card('ice:A','new');ctx.syncBoardNodes(root,[changed,card('t3:B','same')]);
assert.equal(root.children[0],changed,'latest data paints after hover ends');assert.equal(root.children[1],b);
ctx.document.activeElement={};changed.contains=()=>true;ctx.syncBoardNodes(root,[card('ice:A','newer'),card('t3:B','same')]);assert.equal(root.children[0],changed,'keyboard focus stays attached');
ctx.syncBoardNodes(root,[card('t3:B','same')]);assert.deepEqual(root.children,[b],'removed entries are not retained by hover preservation');
ctx.syncBoardNodes(root,[]);assert.equal(root.children.length,0);
function miningCard(key,version,scene){
  const node=card(key,version+' '+scene.markup);
  node.scene=scene;
  node.querySelector=selector=>selector==='.field-player-loss'?null:node.scene;
  node.cloneNode=()=>({outerHTML:version,querySelectorAll:()=>[{remove(){}}]});
  return node;
}
const artwork={markup:'hydrated canvas and beams'};
const mining=miningCard('t3:M','same field',artwork);root=board(mining);
for(let n=0;n<30;n++)ctx.syncBoardNodes(root,[miningCard('t3:M','same field',{markup:'empty canvas'})]);
assert.equal(root.children[0],mining,'hydrated mining scene does not force card replacement');
assert.equal(root.moves,0,'repeated mining refreshes leave the artwork attached');
const placeholder={markup:'empty canvas',replaceWith(scene){updated.scene=scene;}};
const updated=miningCard('t3:M','updated timer',placeholder);
ctx.syncBoardNodes(root,[updated]);
assert.equal(root.children[0],updated,'new field information still renders');
assert.equal(updated.scene,artwork,'field changes transfer the existing artwork');
console.log('Stable hovered/focused board cards, deferred data refresh and removed-entry cleanup passed.');
