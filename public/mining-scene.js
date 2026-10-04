(() => {
 const period=8000,frames=48,size=200,cache=new Map();
 function render(canvas,time,color){
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const rand=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};
  const palettes=[color];
  const text=(s,x,y,size,color,weight='normal')=>{ctx.fillStyle=color;ctx.font=weight+' '+size+'px Arial';ctx.fillText(s,x,y)};
  const glow=(x,y,r,c,a)=>{const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${c},${a})`);g.addColorStop(.4,`rgba(${c},${a*.3})`);g.addColorStop(1,`rgba(${c},0)`);ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2)};
  const line=(x,y,x2,y2,color,width)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()};
  const rock=(cx,cy,r,t,k,seed=0)=>{
   const vertices=[],faces=[],cols=13,rows=9,angle=t*2*Math.PI/3.2;
   for(let j=0;j<=rows;j++)for(let i=0;i<cols;i++){
    const lat=j*Math.PI/rows,lon=i*2*Math.PI/cols;
    const noise=.84+.2*rand(i+j*17+seed),rx=Math.sin(lat)*Math.cos(lon)*r*noise,ry=Math.cos(lat)*r*noise,rz=Math.sin(lat)*Math.sin(lon)*r*noise;
    let x=rx*Math.cos(angle)+rz*Math.sin(angle),z=-rx*Math.sin(angle)+rz*Math.cos(angle);
    let y=ry*.95+z*.12;z-=ry*.12;
    if(k===1){const gap=8+7*(.5-.5*Math.cos(t*2*Math.PI/3.2));x+=(x>0?1:-1)*gap;}
    vertices.push({x:cx+x,y:cy+y,z});
   }
   for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const a=j*cols+i,b=j*cols+(i+1)%cols,c=(j+1)*cols+i,d=(j+1)*cols+(i+1)%cols;
    for(const ids of [[a,b,c],[b,d,c]]){
     const v=ids.map(n=>vertices[n]),z=v.reduce((a,p)=>a+p.z,0)/3;
     faces.push({v,z,seed:a*13+b,ids});
    }
   }
   faces.sort((a,b)=>a.z-b.z);
   for(const f of faces){
    const p=f.v,ux=p[1].x-p[0].x,uy=p[1].y-p[0].y,uz=p[1].z-p[0].z,vx=p[2].x-p[0].x,vy=p[2].y-p[0].y,vz=p[2].z-p[0].z;
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,n=Math.hypot(nx,ny,nz)||1;
    const light=Math.abs((nx*-.45+ny*-.65+nz*.55)/n),front=Math.max(0,f.z/r),shade=18+light*76+front*13;
    ctx.beginPath();p.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();
    ctx.fillStyle=`rgb(${shade*.95},${shade*.97},${shade*1.1})`;ctx.fill();ctx.strokeStyle='rgba(9,11,19,.45)';ctx.lineWidth=.65;ctx.stroke();
    ctx.save();ctx.clip();
    for(let q=0;q<7;q++){
     const ax=rand(f.seed+q*4),ay=rand(f.seed+q*4+1),px=p[0].x*ax+p[1].x*ay+p[2].x*(1-ax-ay),py=p[0].y*ax+p[1].y*ay+p[2].y*(1-ax-ay);
     ctx.fillStyle=q%2?'rgba(0,0,0,.28)':'rgba(201,205,215,.13)';ctx.beginPath();ctx.ellipse(px,py,1.5+rand(q+f.seed)*3,1+rand(q+f.seed+1)*2,.5,0,Math.PI*2);ctx.fill();
    }ctx.restore();
    if(f.z>0&&rand(f.seed+seed)>.82){const c=palettes[k];ctx.shadowColor=`rgb(${c})`;ctx.shadowBlur=7;line(p[0].x,p[0].y,p[1].x,p[1].y,`rgba(${c},${.35+.45*front})`,1.25);ctx.shadowBlur=0;}
   }
  };
  const beam=(sx,sy,ex,ey,c)=>{glow(ex,ey,24,c,.65);ctx.shadowColor=`rgb(${c})`;ctx.shadowBlur=12;line(sx,sy,ex,ey,`rgba(${c},.3)`,7);line(sx,sy,ex,ey,`rgba(${c},.8)`,2.2);line(sx,sy,ex,ey,'#fff7e8',.8);ctx.shadowBlur=0;glow(ex,ey,6,[255,255,255],.9)};

  ctx.clearRect(0,0,size,size);
  const t=(time%period)/period*3.2,c=color;
  glow(100,100,87,c,.14);rock(100,100,43,t,0,6);
  const p1={x:85+Math.sin(t*2*Math.PI/3.2)*10,y:94},p2={x:118,y:108+Math.sin(t*2*Math.PI/3.2)*10};
  for(const [sx,sy,p] of [[28,32,p1],[174,40,p2]]){
   ctx.fillStyle='#526072';ctx.fillRect(sx-6,sy-5,12,10);
   line(sx-4,sy-2,sx+4,sy-2,'#bac5d6',.8);beam(sx,sy,p.x,p.y,c);
  }
  for(let n=0;n<8;n++){
   const phase=(t/3.2+n/8)%1;ctx.fillStyle=`rgba(${c},${1-phase})`;
   ctx.fillRect(p1.x+Math.cos(n*2.4)*phase*32,p1.y+Math.sin(n*2.4)*phase*32,1.5,1.5);
  }
 }
 function colorFor(element){
  const value=getComputedStyle(element).color;
  const rgb=value.match(/[\d.]+/g)?.slice(0,3).map(Number);
  return rgb?.length===3?rgb:[206,104,255];
 }
 function frame(time,reduced=false){return reduced?0:Math.floor(((time%period+period)%period)/period*frames);}
 function draw(canvas,time,reduced){
  const color=colorFor(canvas),index=frame(time,reduced),key=color.join(',')+':'+index;
  let source=cache.get(key);
  if(!source){
   source=document.createElement('canvas');source.width=source.height=size;
   render(source,index/frames*period,color);cache.set(key,source);
   // Bound cache across repeated theme switching.
   if(cache.size>frames*2)cache.delete(cache.keys().next().value);
  }
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,size,size);ctx.drawImage(source,0,0);
 }
 let pending=0,last=0;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 function tick(time){
  pending=0;if(document.hidden)return;
  const canvases=[...document.querySelectorAll('#fieldBoard .mining-activity-icon canvas')].filter(canvas=>{
   const box=canvas.getBoundingClientRect();return box.width>0&&box.height>0&&box.bottom>0&&box.top<window.innerHeight;
  });
  if(!canvases.length)return;
  if(reduced.matches||time-last>=80){canvases.forEach(canvas=>draw(canvas,time,reduced.matches));last=time;}
  if(!reduced.matches)pending=requestAnimationFrame(tick);
 }
 function refresh(){if(!pending&&!document.hidden)pending=requestAnimationFrame(tick);}
 document.addEventListener('visibilitychange',refresh);
 document.addEventListener('scroll',refresh,{passive:true,capture:true});
 window.addEventListener('resize',refresh,{passive:true});
 reduced.addEventListener('change',refresh);
 window.JlrMiningScene={refresh,frame,render,period};
})();
