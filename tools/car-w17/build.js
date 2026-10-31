// v1.17.27 — болид из модели «2026 Mercedes W17» (Dave Love, Sketchfab, CC BY 4.0; архив — ветка models).
// Модель → выброс невидимого → упрощение (краска точнее карбона) → поиск дыр против целой → классы → JSON для encode.mjs.
// Запуск: node build.js <папка с serve: index.html, GLTFLoader.js, meshopt_simplifier.js, w17/scene.gltf> <out.json>
'use strict';const path=require('path'),fs=require('fs'),http=require('http');
const SERVE=path.resolve(process.argv[2]),OUTF=path.resolve(process.argv[3]);
const TYPES={'.html':'text/html','.js':'text/javascript','.gltf':'model/gltf+json','.bin':'application/octet-stream','.png':'image/png'};
const srv=http.createServer((q,r)=>{const f=path.join(SERVE,decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8791);
(async()=>{const {chromium}=require('playwright');const CH='/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';const b=await chromium.launch({executablePath:fs.existsSync(CH)?CH:undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const p=await b.newPage();p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>{const t=m.text();if(!/WebGL|GLTFLoader/.test(t))console.log(t);});
await p.goto('http://localhost:8791/index.html');await p.waitForTimeout(1200);await p.addScriptTag({url:'/GLTFLoader.js'});await p.addScriptTag({url:'/meshopt_simplifier.js'});
const r=await p.evaluate(async()=>{await MeshoptSimplifier.ready;
 const cls=n=>{n=n.toLowerCase();
  if(/decal/.test(n))return 'decal';                                                      // наклейки — в цвет поверхности под ними (под ними в краске окна)
  if(/tread|sidewall|wheel_hub|discs|_sw\.|sw_|lcd|cinture/.test(n))return 'drop';   // колёса (наши), руль (наш), ремни
  if(/rear_light|rev_light|kers_red/.test(n))return 'light';
  if(/paint2/.test(n))return 'team2';if(/paint/.test(n))return 'team';if(/number|colordriver/.test(n))return 'team3';return 'carbon';};   // три краски — три цвета команды
 const occl=n=>/tread|sidewall|wheel_hub|discs/.test(n.toLowerCase());                     // колёса модели — только заслоняют
 const full=(await new Promise((ok,no)=>new THREE.GLTFLoader().load('/w17/scene.gltf',ok,undefined,no))).scene;
 full.updateMatrixWorld(true);
 // мир модели → наш: оси колёс +1.80 / −1.60, низ протектора — на 0
 const v=new THREE.Vector3();let ty=1e9;full.traverse(m=>{if(m.isMesh&&/tread/.test(m.material.name)){const P=m.geometry.attributes.position;for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i).applyMatrix4(m.matrixWorld);ty=Math.min(ty,v.y);}}});
 const SHIFT=[0,-ty,0.185];
 const meshes=[];full.traverse(m=>{if(m.isMesh)meshes.push(m);});
 // треугольники в мире (с переносом), по мешам
 const parts=meshes.map((m,mi)=>{const g=m.geometry,P=g.attributes.position,N=g.attributes.normal,I=g.index,nt=(I?I.count:P.count)/3,nm=new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
  const pos=new Float32Array(nt*9),nor=new Float32Array(nt*9),w=new THREE.Vector3();
  for(let t=0;t<nt;t++)for(let j=0;j<3;j++){const i=I?I.getX(t*3+j):t*3+j;w.fromBufferAttribute(P,i).applyMatrix4(m.matrixWorld);pos[t*9+j*3]=w.x+SHIFT[0];pos[t*9+j*3+1]=w.y+SHIFT[1];pos[t*9+j*3+2]=w.z+SHIFT[2];
   if(N){w.fromBufferAttribute(N,i).applyMatrix3(nm).normalize();}else w.set(0,1,0);nor[t*9+j*3]=w.x;nor[t*9+j*3+1]=w.y;nor[t*9+j*3+2]=w.z;}
  return {mi,name:m.material.name,k:cls(m.material.name),occ:occl(m.material.name),pos,nor,nt};});
 // наклейка — класс ближайшего треугольника не-наклейки (сетка 3 см по центрам)
 {const G=new Map(),C=0.03,gk=(x,y,z)=>Math.floor(x/C)+','+Math.floor(y/C)+','+Math.floor(z/C);
  for(const q of parts){if(q.k==='drop'||q.k==='decal')continue;for(let t=0;t<q.nt;t++){const o=t*9,cx=(q.pos[o]+q.pos[o+3]+q.pos[o+6])/3,cy=(q.pos[o+1]+q.pos[o+4]+q.pos[o+7])/3,cz=(q.pos[o+2]+q.pos[o+5]+q.pos[o+8])/3;
   const k=gk(cx,cy,cz);let L=G.get(k);if(!L)G.set(k,L=[]);L.push(cx,cy,cz,['carbon','team','light','team2','team3'].indexOf(q.k));}}
  const add=[];for(const q of parts){if(q.k!=='decal')continue;const sp={},sn={};
   for(let t=0;t<q.nt;t++){const o=t*9,cx=(q.pos[o]+q.pos[o+3]+q.pos[o+6])/3,cy=(q.pos[o+1]+q.pos[o+4]+q.pos[o+7])/3,cz=(q.pos[o+2]+q.pos[o+5]+q.pos[o+8])/3;
    let bd=1e9,bk=1;const ix=Math.floor(cx/C),iy=Math.floor(cy/C),iz=Math.floor(cz/C);
    for(let a=-1;a<=1;a++)for(let b2=-1;b2<=1;b2++)for(let c=-1;c<=1;c++){const L=G.get((ix+a)+','+(iy+b2)+','+(iz+c));if(!L)continue;for(let i=0;i<L.length;i+=4){const d=(L[i]-cx)**2+(L[i+1]-cy)**2+(L[i+2]-cz)**2;if(d<bd){bd=d;bk=L[i+3];}}}
    const kk=['carbon','team','light','team2','team3'][bk]||'team';if(!sp[kk]){sp[kk]=[];sn[kk]=[];}for(let j=0;j<9;j++){sp[kk].push(q.pos[o+j]);sn[kk].push(q.nor[o+j]);}}
   for(const kk in sp)if(sp[kk].length)add.push({mi:q.mi,name:q.name+'→'+kk,k:kk,occ:false,pos:new Float32Array(sp[kk]),nor:new Float32Array(sn[kk]),nt:sp[kk].length/9});
   q.k='drop';}
  for(const a of add){a.mi=parts.length;parts.push(a);}}
 const body=parts.filter(q=>q.k!=='drop');
 const geoOf=(pos,col)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));if(col)g.setAttribute('color',new THREE.BufferAttribute(col,3));return g;};
 // ---- точки камер игры: вокруг на 3–11 м, высоты 0.35–3 м, погоня, кокпит ----
 const VIEWS=[];for(let a=0;a<360;a+=15){const c=Math.cos(a*Math.PI/180),s=Math.sin(a*Math.PI/180);
  for(const d of[3.2,6,11])for(const h of[0.35,1.0,1.8,3.0])for(const tz of[-1.6,0,1.8])VIEWS.push({pos:[d*s,h,d*c+tz*0.3],tgt:[0,0.35,tz],fov:d<4?55:35});}
 VIEWS.push({pos:[0,2.7,-4.45],tgt:[0,1.1,8.5],fov:64});for(const dx of[-0.15,0,0.15])VIEWS.push({pos:[dx,1.42,-0.62],tgt:[dx*3,1.18,14],fov:64});
 const IW=640,IH=360,R0=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});R0.setSize(IW,IH);R0.setClearColor(0,1);R0.outputEncoding=THREE.LinearEncoding;
 const gl=R0.getContext(),buf=new Uint8Array(IW*IH*4);
 const cam=v=>{const c=new THREE.PerspectiveCamera(v.fov,IW/IH,0.05,200);c.position.set(...v.pos);c.lookAt(...v.tgt);return c;};
 const gnd=()=>{const g=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshBasicMaterial({color:0}));g.rotation.x=-Math.PI/2;return g;};
 // ID: треугольник (видимость) или меш (дыры); 0 — фон/заслонитель
 function idScene(fn){const pos=[],col=[];for(const q of parts){for(let t=0;t<q.nt;t++){const id=fn(q,t);const r=(id&255)/255,gg=((id>>8)&255)/255,bb=((id>>16)&255)/255;
    for(let j=0;j<9;j++)pos.push(q.pos[t*9+j]);for(let j=0;j<3;j++)col.push(r,gg,bb);}}
  const s=new THREE.Scene();s.add(new THREE.Mesh(geoOf(new Float32Array(pos),new Float32Array(col)),new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide})));s.add(gnd());return s;}
 const read=()=>{gl.readPixels(0,0,IW,IH,gl.RGBA,gl.UNSIGNED_BYTE,buf);return buf;};
 // 1) видимость треугольников
 const tid=new Map();let nid=0;for(const q of body){q.t0=nid;nid+=q.nt;}
 const sV=idScene((q,t)=>q.k==='drop'?0:q.t0+t+1);const seen=new Uint8Array(nid+1);
 for(const vw of VIEWS){R0.render(sV,cam(vw));const B=read();for(let i=0;i<B.length;i+=4){const id=B[i]|(B[i+1]<<8)|(B[i+2]<<16);if(id)seen[id]=1;}}
 let vis=0;for(let i=1;i<=nid;i++)vis+=seen[i];
 // кольцо соседей ×2; детали — связные куски меша (сварка по позиции); у детали свой множитель ошибки
 const key=(a,o)=>Math.round(a[o]*1e4)+','+Math.round(a[o+1]*1e4)+','+Math.round(a[o+2]*1e4);
 let kept=0;const comps=[];const tri2c=new Int32Array(nid+1).fill(-1);
 for(const q of body){let keep=new Uint8Array(q.nt);for(let t=0;t<q.nt;t++)keep[t]=seen[q.t0+t+1];
  for(let rr=0;rr<2;rr++){const hot=new Set();for(let t=0;t<q.nt;t++)if(keep[t])for(let j=0;j<3;j++)hot.add(key(q.pos,t*9+j*3));
   const k2=keep.slice();for(let t=0;t<q.nt;t++)if(!keep[t])for(let j=0;j<3;j++)if(hot.has(key(q.pos,t*9+j*3))){k2[t]=1;break;}keep=k2;}
  const vmap=new Map(),vid=[],par=[];const f=a=>{while(par[a]!==a){par[a]=par[par[a]];a=par[a];}return a;};
  const tv=[];for(let t=0;t<q.nt;t++){if(!keep[t])continue;kept++;const ids=[];for(let j=0;j<3;j++){const kk=key(q.pos,t*9+j*3);let w=vmap.get(kk);if(w===undefined){w=par.length;vmap.set(kk,w);par.push(w);vid.push(t*9+j*3);}ids.push(w);}
   par[f(ids[1])]=f(ids[0]);par[f(ids[2])]=f(ids[0]);tv.push([t,ids]);}
  const byRoot=new Map();for(const [t,ids] of tv){const rt=0;let c=byRoot.get(rt);if(!c){c={q,k:q.k,name:q.name,mul:1,tris:[],loc:new Map(),wp:[],rep:[]};byRoot.set(rt,c);}
   const li=ids.map(w=>{let l=c.loc.get(w);if(l===undefined){l=c.wp.length/3;c.loc.set(w,l);const o=vid[w];c.wp.push(q.pos[o],q.pos[o+1],q.pos[o+2]);c.rep.push(o);}return l;});c.tris.push(li[0],li[1],li[2]);tri2c[q.t0+t+1]=comps.length+[...byRoot.keys()].indexOf(rt);}
  for(const c of byRoot.values()){c.wp=new Float32Array(c.wp);c.wi=new Uint32Array(c.tris);c.loc=null;comps.push(c);}}
 // 2) упрощение одной ошибкой (в метрах) × множитель класса × множитель детали
 function simp(e,W){let n=0;for(const c of comps){const m=(/^team/.test(c.k)?W.paint:W.carb)*c.mul;
   const [o]=MeshoptSimplifier.simplify(c.wi,c.wp,3,0,e*m,['ErrorAbsolute']);c.out=o;n+=o.length/3;}return n;}
 function fit(budget,W){let lo=0.00005,hi=0.3,best=hi;for(let it=0;it<18;it++){const e=Math.sqrt(lo*hi),n=simp(e,W);if(n>budget)lo=e;else{hi=e;best=e;}}simp(best,W);return best;}
 // 3) дыры: где целая модель закрывает фон (и вокруг пикселя тоже), а упрощённая — нет; по мешам
 function simpScene(){const pos=[];for(const c of comps)for(let i=0;i<c.out.length;i++){const w=c.out[i];pos.push(c.wp[w*3],c.wp[w*3+1],c.wp[w*3+2]);}
  const occ=[];for(const q of parts)if(q.occ)for(let j=0;j<q.pos.length;j++)occ.push(q.pos[j]);
  const s=new THREE.Scene();s.add(new THREE.Mesh(geoOf(new Float32Array(pos)),new THREE.MeshBasicMaterial({color:'#ffffff',side:THREE.DoubleSide})));
  s.add(new THREE.Mesh(geoOf(new Float32Array(occ)),new THREE.MeshBasicMaterial({color:'#000000',side:THREE.DoubleSide})));s.add(gnd());return s;}
 const HV=VIEWS.filter((v,i)=>i%7===0).concat(VIEWS.slice(-4));
 function holes(){const sS=simpScene(),per=new Map();let tot=0;const F=new Uint32Array(IW*IH);
  for(const vw of HV){const c=cam(vw);R0.render(sV,c);let B=read();for(let i=0;i<IW*IH;i++)F[i]=B[i*4]|(B[i*4+1]<<8)|(B[i*4+2]<<16);
   R0.render(sS,c);B=read();
   for(let y=2;y<IH-2;y++)for(let x=2;x<IW-2;x++){const i=y*IW+x;if(!F[i]||B[i*4]>128||B[i*4+1]>0)continue;   // у упрощённой здесь не кузов (белый) и не колесо — дыра?
     // внутренность целой: 5×5 вокруг закрыто
     let inner=true;for(let dy=-2;dy<=2&&inner;dy++)for(let dx=-2;dx<=2;dx++)if(!F[i+dy*IW+dx]){inner=false;break;}if(!inner)continue;
     // и у упрощённой рядом фон (а не край): 3×3 весь фон
     let bg=true;for(let dy=-1;dy<=1&&bg;dy++)for(let dx=-1;dx<=1;dx++){const j=(i+dy*IW+dx)*4;if(B[j]>128){bg=false;break;}}if(!bg)continue;
     tot++;const ci=tri2c[F[i]];if(ci>=0)per.set(ci,(per.get(ci)||0)+1);}}
  return {tot,per};}
 const out={vis,kept,nid,comps:comps.length,shift:SHIFT,lods:{}};
 for(const [name,budget,W] of[['p',40000,{paint:0.4,carb:1.5}],['a',7700,{paint:0.55,carb:1.25}]]){for(const c of comps)c.mul=1;
  const hist=[];let e=fit(budget,W),h=holes();hist.push([+(e*1000).toFixed(2),h.tot]);
  // шаг принимается, только если дыр меньше, а общая ошибка выросла не больше чем в 1.6 раза; иначе — лучший прежний
  const e0=e;let best={tot:h.tot,mul:comps.map(c=>c.mul)};
  for(let it=0;it<6&&h.tot>30;it++){let any=0;for(const [ci,cnt] of h.per)if(cnt>=4){comps[ci].mul*=0.5;any++;}if(!any)break;
   e=fit(budget,W);h=holes();hist.push([+(e*1000).toFixed(2),h.tot,any]);
   if(h.tot<best.tot&&e<=1.6*e0)best={tot:h.tot,mul:comps.map(c=>c.mul)};else break;}
  comps.forEach((c,i)=>c.mul=best.mul[i]);e=fit(budget,W);h=holes();hist.push(['итог',+(e*1000).toFixed(2),h.tot]);
  const L={};let crumbs=0;for(const c of comps){const o=L[c.k]||(L[c.k]={p:[],n:[]});const q=c.q,T=c.out.length/3;
   const par=[...Array(c.wp.length/3).keys()],f=a=>{while(par[a]!==a){par[a]=par[par[a]];a=par[a];}return a;};
   for(let t=0;t<T;t++){const a=f(c.out[t*3]);par[f(c.out[t*3+1])]=a;par[f(c.out[t*3+2])]=a;}
   const box=new Map();for(let t=0;t<T;t++){const r=f(c.out[t*3]);let B=box.get(r);if(!B)box.set(r,B=[1e9,1e9,1e9,-1e9,-1e9,-1e9]);
    for(let j=0;j<3;j++){const w=c.out[t*3+j];for(let a=0;a<3;a++){B[a]=Math.min(B[a],c.wp[w*3+a]);B[a+3]=Math.max(B[a+3],c.wp[w*3+a]);}}}
   for(let t=0;t<T;t++){const B=box.get(f(c.out[t*3]));if(Math.hypot(B[3]-B[0],B[4]-B[1],B[5]-B[2])<0.05){crumbs++;continue;}
    for(let j=0;j<3;j++){const s2=c.rep[c.out[t*3+j]];for(let a=0;a<3;a++){o.p.push(+q.pos[s2+a].toFixed(5));o.n.push(+q.nor[s2+a].toFixed(4));}}}}
  out.lods[name]={hist,e:+(e*1000).toFixed(2),tris:Object.fromEntries(Object.entries(L).map(([k,o])=>[k,o.p.length/9])),mulled:comps.filter(c=>c.mul<1).length,crumbs,L};}
 // ориентиры: руль, ремни (голова), крыло
 const bb=re=>{const B=[1e9,1e9,1e9,-1e9,-1e9,-1e9];for(const q of parts)if(re.test(q.name))for(let i=0;i<q.pos.length;i+=3)for(let a=0;a<3;a++){B[a]=Math.min(B[a],q.pos[i+a]);B[a+3]=Math.max(B[a+3],q.pos[i+a]);}return B.map(x=>+x.toFixed(3));};
 out.marks={sw:bb(/_sw\.|sw_/),belts:bb(/cinture/),tread:bb(/tread/)};
 // оболочка (x,z) кузова выше 2 см, для CAR_PTS/CAR_HULL
 const hp=[];for(const c of comps)for(let i=0;i<c.out.length;i++){const s=c.rep[c.out[i]];if(c.q.pos[s+1]>0.02)hp.push([c.q.pos[s],c.q.pos[s+2]]);}
 const srt=hp.sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cr=(o,a,b2)=>(a[0]-o[0])*(b2[1]-o[1])-(a[1]-o[1])*(b2[0]-o[0]);const lo=[],up=[];
 for(const a of srt){while(lo.length>1&&cr(lo[lo.length-2],lo[lo.length-1],a)<=0)lo.pop();lo.push(a);}for(const a of srt.slice().reverse()){while(up.length>1&&cr(up[up.length-2],up[up.length-1],a)<=0)up.pop();up.push(a);}
 out.hull=lo.slice(0,-1).concat(up.slice(0,-1)).map(a=>a.map(x=>+x.toFixed(3)));
 R0.dispose();return out;});
fs.writeFileSync(OUTF,JSON.stringify(r));
for(const k in r.lods){const o=r.lods[k];console.log(k,'ошибка',o.e,'мм; ход',JSON.stringify(o.hist),'тр.',JSON.stringify(o.tris),'деталей точнее:',o.mulled,'лоскутов выброшено',o.crumbs);}
console.log('деталей',r.comps,'видно',r.vis,'из',r.nid,'оставлено',r.kept,'сдвиг',JSON.stringify(r.shift));console.log('метки',JSON.stringify(r.marks));console.log('оболочка',JSON.stringify(r.hull));
await b.close();srv.close();})();
