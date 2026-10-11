import { deflateSync } from 'node:zlib';

// Dependency-free 1200x630 Discord thumbnail fallback. This bitmap renderer
// keeps JlrHub previews working even when Railway omits optional native addons.
const W=1200,H=630;
const GLYPHS={
'A':'01110 10001 10001 11111 10001 10001 10001',
'B':'11110 10001 10001 11110 10001 10001 11110',
'C':'01111 10000 10000 10000 10000 10000 01111',
'D':'11110 10001 10001 10001 10001 10001 11110',
'E':'11111 10000 10000 11110 10000 10000 11111',
'F':'11111 10000 10000 11110 10000 10000 10000',
'G':'01111 10000 10000 10111 10001 10001 01111',
'H':'10001 10001 10001 11111 10001 10001 10001',
'I':'11111 00100 00100 00100 00100 00100 11111',
'J':'00111 00010 00010 00010 10010 10010 01100',
'K':'10001 10010 10100 11000 10100 10010 10001',
'L':'10000 10000 10000 10000 10000 10000 11111',
'M':'10001 11011 10101 10101 10001 10001 10001',
'N':'10001 11001 10101 10011 10001 10001 10001',
'O':'01110 10001 10001 10001 10001 10001 01110',
'P':'11110 10001 10001 11110 10000 10000 10000',
'Q':'01110 10001 10001 10001 10101 10010 01101',
'R':'11110 10001 10001 11110 10100 10010 10001',
'S':'01111 10000 10000 01110 00001 00001 11110',
'T':'11111 00100 00100 00100 00100 00100 00100',
'U':'10001 10001 10001 10001 10001 10001 01110',
'V':'10001 10001 10001 10001 10001 01010 00100',
'W':'10001 10001 10001 10101 10101 10101 01010',
'X':'10001 10001 01010 00100 01010 10001 10001',
'Y':'10001 10001 01010 00100 00100 00100 00100',
'Z':'11111 00001 00010 00100 01000 10000 11111',
'0':'01110 10001 10011 10101 11001 10001 01110',
'1':'00100 01100 00100 00100 00100 00100 01110',
'2':'01110 10001 00001 00010 00100 01000 11111',
'3':'11110 00001 00001 01110 00001 00001 11110',
'4':'00010 00110 01010 10010 11111 00010 00010',
'5':'11111 10000 10000 11110 00001 00001 11110',
'6':'01110 10000 10000 11110 10001 10001 01110',
'7':'11111 00001 00010 00100 01000 01000 01000',
'8':'01110 10001 10001 01110 10001 10001 01110',
'9':'01110 10001 10001 01111 00001 00001 01110',
' ':'00000 00000 00000 00000 00000 00000 00000',
'-':'00000 00000 00000 11111 00000 00000 00000',
'.':'00000 00000 00000 00000 00000 01100 01100',
':':'00000 01100 01100 00000 01100 01100 00000',
'/':'00001 00001 00010 00100 01000 10000 10000',
'(':'00110 01000 10000 10000 10000 01000 00110',
')':'01100 00010 00001 00001 00001 00010 01100',
'[':'11100 10000 10000 10000 10000 10000 11100',
']':'00111 00001 00001 00001 00001 00001 00111',
'!':'00100 00100 00100 00100 00100 00000 00100',
'?':'01110 10001 00001 00010 00100 00000 00100',
'|':'00100 00100 00100 00100 00100 00100 00100',
'+':'00000 00100 00100 11111 00100 00100 00000',
'&':'01100 10010 10100 01000 10101 10010 01101',
',':'00000 00000 00000 00000 01100 01100 01000',
'_':'00000 00000 00000 00000 00000 00000 11111',
};
const FONT=Object.fromEntries(Object.entries(GLYPHS).map(([k,v])=>[k,v.split(' ').map(bits=>parseInt(bits,2))]));
const C={
  bg:[6,8,14],panel:[11,11,18],band:[30,7,17],border:[244,33,77],
  white:[245,246,252],muted:[156,174,192],red:[255,42,82],gold:[243,190,110],line:[40,34,48],
};
const crcTable=new Uint32Array(256);
for(let n=0;n<256;n++){
  let c=n;
  for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;
  crcTable[n]=c>>>0;
}
function pngCrc(data){
  let c=0xffffffff;
  for(const byte of data)c=crcTable[(c^byte)&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function chunk(name,data){
  const type=Buffer.from(name);
  const length=Buffer.allocUnsafe(4);
  length.writeUInt32BE(data.length,0);
  const crc=Buffer.allocUnsafe(4);
  crc.writeUInt32BE(pngCrc(Buffer.concat([type,data])),0);
  return Buffer.concat([length,type,data,crc]);
}
function pngEncode(pixels){
  const scan=Buffer.allocUnsafe(H*(1+W*3));
  for(let y=0;y<H;y++){
    const offset=y*(1+W*3);
    scan[offset]=0;
    pixels.copy(scan,offset+1,y*W*3,(y+1)*W*3);
  }
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);
  ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scan,{level:6})),chunk('IEND',Buffer.alloc(0)),
  ]);
}
function createCanvas(){
  const pixels=Buffer.alloc(W*H*3);
  function rect(x,y,w,h,color){
    x=Math.floor(x);y=Math.floor(y);w=Math.ceil(w);h=Math.ceil(h);
    const x2=Math.min(W,x+w),y2=Math.min(H,y+h);
    for(let iy=Math.max(0,y);iy<y2;iy++){
      const row=iy*W*3;
      for(let ix=Math.max(0,x);ix<x2;ix++){
        const n=row+ix*3;
        pixels[n]=color[0];pixels[n+1]=color[1];pixels[n+2]=color[2];
      }
    }
  }
  function label(string,x,y,size,color,maxWidth=1100){
    const scale=Math.max(1,Math.round(size));
    const glyphWidth=scale*6,limit=Math.floor(maxWidth/glyphWidth);
    const text=String(string||'').toUpperCase().slice(0,Math.max(0,limit));
    for(let i=0;i<text.length;i++){
      const rows=FONT[text[i]]||FONT['?'];
      for(let j=0;j<7;j++)for(let k=0;k<5;k++){
        if(rows[j]&(1<<(4-k)))rect(x+i*glyphWidth+k*scale,y+j*scale,scale,scale,color);
      }
    }
  }
  return{pixels,rect,label};
}
export function renderScanPreviewFallbackPng(scan){
  const {pixels,rect,label}=createCanvas();
  rect(0,0,W,H,C.bg);
  rect(14,14,1172,602,C.border);
  rect(19,19,1162,592,C.bg);
  rect(27,28,1147,148,C.band);
  rect(27,170,1147,4,C.border);
  rect(50,42,4,110,C.red);
  label('JLR',72,69,8,C.white,163);
  label('HUB',218,69,8,C.red,150);
  rect(378,44,3,110,C.border);
  label('THREAT SCAN',402,58,5,C.white,450);
  label(scan.system,405,115,3,scan.hasSystem?C.red:C.gold,510);
  rect(950,47,196,112,C.border);
  rect(955,52,186,102,C.bg);
  label('D-SCAN SHIPS',977,65,2,C.red,163);
  label(String(scan.shipCount),1018,101,6,C.red,130);
  rect(44,200,1114,43,C.band);
  label('SHIP TYPE',70,213,3,C.white,600);
  label('QTY',1030,213,3,C.white,120);
  rect(944,199,2,353,C.line);
  if(!scan.ships.length){
    label(scan.pilotCount?String(scan.pilotCount)+' LOCAL PILOTS. NO D-SCAN SHIP TYPES.':'NO IDENTIFIED SHIP TYPES IN SCAN.',72,290,3,C.muted,1070);
  }else{
    scan.ships.slice(0,6).forEach((ship,i)=>{
      const y=266+i*48;
      if(i%2)rect(45,y-10,1112,48,C.panel);
      label(ship.name,70,y,3,C.white,530);
      label('('+ship.group+')',410,y+3,2,C.muted,505);
      label(String(ship.count),1040,y,3,ship.role==='mining'?C.gold:ship.role==='combat'?C.red:C.white,100);
      rect(45,y+37,1112,1,C.line);
    });
  }
  if(scan.ships.length>6)label('+'+(scan.ships.length-6)+' MORE SHIP TYPES ON JLRHUB',72,560,2,C.muted,800);
  else if(scan.otherCount)label(scan.otherCount+' OTHER / UNCLASSIFIED OBJECTS',72,560,2,C.muted,800);
  rect(27,579,1147,3,C.border);
  label(scan.status,48,592,2,scan.combatCount?C.red:scan.miningCount?C.gold:C.muted,740);
  label('JLRHUB.COM',992,592,2,C.white,160);
  return pngEncode(pixels);
}
