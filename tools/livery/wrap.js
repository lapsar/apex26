// Перенос фигур с вида на вид через модель W17 (v1.17.32, ливреи): луч на краску кузова (класс team) в каждой точке контура
// (шаг 1 см): сверху — вниз, (z, |x|) -> (z, y попадания); сбоку — поперёк с +x, (z, y) -> (z, |x| попадания). Промахи (точка вне кузова) — пропускаются;
// контур упрощается до 3 мм. open — край без замыкающего отрезка, up — поле на виде сбоку закрывается вверх (livery.py, v1.17.34).
//   node tools/livery/wrap.js <key> [index.html]   читает tools/livery/<key>.towrap.json, пишет <key>.wrap.json
'use strict';const path=require('path'),fs=require('fs');
const KEY=process.argv[2],HTML=path.resolve(process.argv[3]||path.join(__dirname,'..','..','index.html'));
const IN=path.join(__dirname,KEY+'.towrap.json'),OUT=path.join(__dirname,KEY+'.wrap.json');
(async()=>{const {chromium}=require('playwright');const b=await chromium.launch({executablePath:require('fs').existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined,args:['--no-sandbox']});
const p=await b.newPage();p.on('pageerror',e=>console.log('ERR',e.message));await p.goto('file://'+HTML);await p.waitForTimeout(800);
const res=await p.evaluate(shapes=>{const m=new THREE.Mesh(W17GEO('p').team,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));m.updateMatrixWorld(true);
  const rc=new THREE.Raycaster(),dn=new THREE.Vector3(0,-1,0),sx=new THREE.Vector3(-1,0,0),out=[];let miss=0,all=0;
  for(const s of shapes){const P=s.p,pts=[];
    for(let i=0;i<P.length-(s.open?1:0);i++){const a=P[i],c=P[(i+1)%P.length],L=Math.hypot(c[0]-a[0],c[1]-a[1]),n=Math.max(1,Math.ceil(L/0.01));
      for(let k=0;k<n;k++){const z=a[0]+(c[0]-a[0])*k/n,v=a[1]+(c[1]-a[1])*k/n;all++;
        if(s.from==='side')rc.set(new THREE.Vector3(3,v,z),sx);else rc.set(new THREE.Vector3(v,3,z),dn);   // сбоку — луч поперёк, сверху — вниз
        const h=rc.intersectObject(m)[0];if(h)pts.push([+z.toFixed(4),+(s.from==='side'?Math.abs(h.point.x):h.point.y).toFixed(4)]);else miss++;}}
    const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;   // упрощение ломаной (Дуглас — Пекер, 3 мм)
    (function rdp(i,j){let md=0,mi=-1;const [ax,ay]=pts[i],[bx,by]=pts[j],L=Math.hypot(bx-ax,by-ay)||1e-9;
      for(let k=i+1;k<j;k++){const d=Math.abs((bx-ax)*(ay-pts[k][1])-(ax-pts[k][0])*(by-ay))/L;if(d>md){md=d;mi=k;}}
      if(md>0.003){keep[mi]=1;rdp(i,mi);rdp(mi,j);}})(0,pts.length-1);
    const q=pts.filter((_,k)=>keep[k]);if(q.length>2)out.push({c:s.c,p:q,to:s.from==='side'?'top':'side',up:s.up||undefined});}
  return {out,miss,all};},JSON.parse(fs.readFileSync(IN,'utf8')));
fs.writeFileSync(OUT,JSON.stringify(res.out));console.log(KEY,'фигур',res.out.length,'точек',res.all,'промахов',res.miss);await b.close();})();
