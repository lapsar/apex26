// Пробный замер: Mercedes W17 и McLaren MCL40 — упрощение 8/4 тыс., перекраска в наши материалы, снимки рядом с нашей.
'use strict';const path=require('path'),fs=require('fs'),http=require('http');
const S=path.resolve(__dirname,'..'),SERVE=path.join(S,'serve'),OUT=path.join(S,process.env.OUT||'trial');
const TYPES={'.html':'text/html','.js':'text/javascript','.gltf':'model/gltf+json','.bin':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg'};
const srv=http.createServer((q,r)=>{const f=path.join(SERVE,decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8786);
(async()=>{const {chromium}=require('playwright');const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const p=await b.newPage();p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>console.log('  '+m.text()));
await p.goto('http://localhost:8786/index.html');await p.waitForTimeout(1500);await p.addScriptTag({url:'/GLTFLoader.js'});await p.addScriptTag({url:'/meshopt_simplifier.js'});
const r=await p.evaluate(async()=>{await MeshoptSimplifier.ready;
 const TEAM='#1E41FF',process_env_split=false;
 const PAL={team:new THREE.MeshStandardMaterial({color:TEAM,roughness:0.35,metalness:0.25}),carbon:new THREE.MeshStandardMaterial({color:'#13161c',roughness:0.45,metalness:0.5}),
  tyre:new THREE.MeshStandardMaterial({color:'#0c0c0e',roughness:0.9}),rim:new THREE.MeshStandardMaterial({color:'#1b1e25',roughness:0.4,metalness:0.6}),light:new THREE.MeshBasicMaterial({color:'#e02424'})};
 const tris=o=>{let n=0;o.traverse(m=>{if(m.isMesh){const g=m.geometry;n+=(g.index?g.index.count:g.attributes.position.count)/3;}});return n;};
 function cls(name){name=name.toLowerCase();
  if(/tread|sidewall/.test(name))return 'tyre'; if(/disc|hub/.test(name))return 'rim'; if(/rear_light|rev_light|kers_red/.test(name))return 'light';
  if(/paint|_color|colordriver|number/.test(name))return 'sample'; if(/decal/.test(name))return 'drop'; return 'carbon';}
 const imgCache=new Map();
 function pix(tex){if(!tex||!tex.image)return null;if(imgCache.has(tex))return imgCache.get(tex);const im=tex.image,c=document.createElement('canvas');c.width=im.width;c.height=im.height;
  const x=c.getContext('2d');x.drawImage(im,0,0);const d={w:im.width,h:im.height,a:x.getImageData(0,0,im.width,im.height).data};imgCache.set(tex,d);return d;}
 function decimate(full,TOT,target){const c=full.clone(true);
  c.traverse(m=>{if(!m.isMesh)return;const g=m.geometry.clone(),P=g.attributes.position,n=P.count;const idx=g.index?Array.from(g.index.array):[...Array(n).keys()];
   const want=Math.min(idx.length,Math.max(12,Math.round(target*(idx.length/3)/TOT))*3);
   const key=new Map(),weld=new Uint32Array(n),rep=[],wp=[];
   for(let i=0;i<n;i++){const k=Math.round(P.getX(i)*1e4)+','+Math.round(P.getY(i)*1e4)+','+Math.round(P.getZ(i)*1e4);let w=key.get(k);if(w===undefined){w=rep.length;key.set(k,w);rep.push(i);wp.push(P.getX(i),P.getY(i),P.getZ(i));}weld[i]=w;}
   const wi=new Uint32Array(idx.map(i=>weld[i])),wpos=new Float32Array(wp);let [out]=MeshoptSimplifier.simplify(wi,wpos,3,want,1.0,[]);
   if(out.length>want*1.15){let cell=0.005;for(let it=0;it<40&&out.length>want*1.15;it++,cell*=1.35){const cm=new Map(),cr=new Uint32Array(rep.length);
     for(let w=0;w<rep.length;w++){const k=Math.floor(wpos[3*w]/cell)+','+Math.floor(wpos[3*w+1]/cell)+','+Math.floor(wpos[3*w+2]/cell);let r=cm.get(k);if(r===undefined){r=w;cm.set(k,r);}cr[w]=r;}
     const o=[],seen=new Set();for(let t=0;t<wi.length;t+=3){const a=cr[wi[t]],bb=cr[wi[t+1]],d=cr[wi[t+2]];if(a===bb||bb===d||a===d)continue;const s=[a,bb,d].sort((x,y)=>x-y).join();if(seen.has(s))continue;seen.add(s);o.push(a,bb,d);}out=new Uint32Array(o);}}
   g.setIndex(Array.from(out,w=>rep[w]));m.geometry=g;});return c;}
 // перекраска: каждый треугольник — в класс; «sample» — по текстуре: тёмное — карбон, светлое/цветное — цвет команды
 let CREASE=0;
 function crease(pos,deg){const n=pos.length/9,fn=new Float32Array(n*3),map=new Map(),out=new Float32Array(pos.length),c=Math.cos(deg*Math.PI/180);
  for(let t=0;t<n;t++){const o=t*9,ax=pos[o],ay=pos[o+1],az=pos[o+2],ux=pos[o+3]-ax,uy=pos[o+4]-ay,uz=pos[o+5]-az,vx=pos[o+6]-ax,vy=pos[o+7]-ay,vz=pos[o+8]-az;
   let x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx;const l=Math.hypot(x,y,z)||1;fn[t*3]=x/l;fn[t*3+1]=y/l;fn[t*3+2]=z/l;
   for(let j=0;j<3;j++){const k=Math.round(pos[o+j*3]*1e4)+','+Math.round(pos[o+j*3+1]*1e4)+','+Math.round(pos[o+j*3+2]*1e4);let L=map.get(k);if(!L)map.set(k,L=[]);L.push(t);}}
  for(let t=0;t<n;t++)for(let j=0;j<3;j++){const o=t*9+j*3,k=Math.round(pos[o]*1e4)+','+Math.round(pos[o+1]*1e4)+','+Math.round(pos[o+2]*1e4);let x=0,y=0,z=0;
   for(const f of map.get(k)){const d=fn[f*3]*fn[t*3]+fn[f*3+1]*fn[t*3+1]+fn[f*3+2]*fn[t*3+2];if(d>=c){x+=fn[f*3];y+=fn[f*3+1];z+=fn[f*3+2];}}
   const l=Math.hypot(x,y,z)||1;out[o]=x/l;out[o+1]=y/l;out[o+2]=z/l;}
  return out;}
 function repaint(src){src.updateMatrixWorld(true);const buck={team:[],carbon:[],tyre:[],rim:[],light:[]};const v=new THREE.Vector3();
  const nb={team:[],carbon:[],tyre:[],rim:[],light:[]},nv=new THREE.Vector3();
  src.traverse(m=>{if(!m.isMesh)return;const k=cls(m.material.name||'');if(k==='drop')return;const g=m.geometry,P=g.attributes.position,UV=g.attributes.uv,I=g.index,N=g.attributes.normal,nm=new THREE.Matrix3().getNormalMatrix(m.matrixWorld);const nt=(I?I.count:P.count)/3;
   const px=k==='sample'?pix(m.material.map):null;const base=m.material.color;
   for(let t=0;t<nt;t++){const ids=[0,1,2].map(j=>I?I.getX(t*3+j):t*3+j);let kk=k;
    if(k==='sample'&&process_env_split){let dark=0;for(const i of ids){let r=base.r,gg=base.g,bl=base.b;if(px&&UV){let u=UV.getX(i)%1,w=UV.getY(i)%1;if(u<0)u+=1;if(w<0)w+=1;const o=(Math.min(px.h-1,Math.floor(w*px.h))*px.w+Math.min(px.w-1,Math.floor(u*px.w)))*4;r*=px.a[o]/255;gg*=px.a[o+1]/255;bl*=px.a[o+2]/255;}
      const lum=0.2126*r+0.7152*gg+0.0722*bl;if(lum<0.06)dark++;}kk=dark>=2?'carbon':'team';}
    if(kk==='sample')kk='team';
    for(const i of ids){v.fromBufferAttribute(P,i).applyMatrix4(m.matrixWorld);buck[kk].push(v.x,v.y,v.z);
     if(N){nv.fromBufferAttribute(N,i).applyMatrix3(nm).normalize();nb[kk].push(nv.x,nv.y,nv.z);}else nb[kk].push(0,1,0);}}});
  const grp=new THREE.Group();let calls=0;for(const k in buck){if(!buck[k].length)continue;const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(buck[k],3));geo.setAttribute('normal',CREASE?new THREE.BufferAttribute(crease(buck[k],CREASE),3):new THREE.Float32BufferAttribute(nb[k],3));grp.add(new THREE.Mesh(geo,PAL[k]));calls++;}
  return {grp,calls};}
 const res={},objs={};
 let SFLAGS=['ErrorAbsolute'],WPAINT=1,WCARB=1;
 function simpErr(full,e){const c=full.clone(true);let n=0;const kill=[];
  c.traverse(m=>{if(!m.isMesh)return;const k=cls(m.material.name||'');if(k==='tyre'||k==='rim'||k==='drop'){kill.push(m);return;}
   const g=m.geometry.clone(),P=g.attributes.position;const idx=g.index?new Uint32Array(g.index.array):new Uint32Array([...Array(P.count).keys()]);
   // ошибка в метрах мира: геометрия в своих координатах — делим на масштаб узла
   const sc=new THREE.Vector3();m.matrixWorld.decompose(new THREE.Vector3(),new THREE.Quaternion(),sc);const s=Math.max(sc.x,sc.y,sc.z)||1;
   const key=new Map(),weld=new Uint32Array(P.count),rep=[],wp=[];
   for(let i=0;i<P.count;i++){const kk=Math.round(P.getX(i)*1e4)+','+Math.round(P.getY(i)*1e4)+','+Math.round(P.getZ(i)*1e4);let w=key.get(kk);if(w===undefined){w=rep.length;key.set(kk,w);rep.push(i);wp.push(P.getX(i),P.getY(i),P.getZ(i));}weld[i]=w;}
   const wi=new Uint32Array(Array.from(idx,i=>weld[i]));
   const mul=k==='sample'?WPAINT:WCARB;const [out]=MeshoptSimplifier.simplify(wi,new Float32Array(wp),3,3,e*mul/s,SFLAGS);g.setIndex(Array.from(out,w=>rep[w]));m.geometry=g;n+=out.length/3;});
  for(const m of kill)m.parent.remove(m);return {c,n};}
 function fit(full,budget){let lo=0.0002,hi=0.2,best=null;for(let it=0;it<22;it++){const e=Math.sqrt(lo*hi),r=simpErr(full,e);if(r.n>budget)lo=e;else{hi=e;best={...r,e};}}return best;}
 const our=makeCar(TEAM,3,false),ourS=makeCar(TEAM,3,true);
 function addWheels(grp,src){const WP=[[-0.779,1.80],[0.779,1.80],[-0.737,-1.60],[0.737,-1.60]];src.userData.wheels.forEach((w,i)=>{const c=w.clone(true);c.position.set(WP[i][0],w.position.y,WP[i][1]);grp.add(c);});return grp;}
 const wt=o=>{let n=0;o.userData.wheels.forEach(w=>n+=tris(w));return n;};res.wheelP=wt(our);res.wheelS=wt(ourS);
 const full=(await new Promise((ok,no)=>new THREE.GLTFLoader().load('/merc/scene.gltf',ok,undefined,no))).scene;
 full.position.z+=0.185;full.updateMatrixWorld(true);                       // оси как у нас: +1.80 / −1.60
 objs.full=repaint(full).grp;
 // ---- видимость: каждый треугольник своим цветом, снимки с точек камер игры ----
 const meshes=[];full.traverse(m=>{if(m.isMesh)meshes.push(m);});
 const idPos=[],idCol=[],owner=[];let tid=0;const v=new THREE.Vector3();
 for(const m of meshes){const g=m.geometry,P=g.attributes.position,I=g.index,nt=(I?I.count:P.count)/3;const k=cls(m.material.name||'');const occ=(k==='tyre'||k==='rim'||k==='drop');
  m.userData.t0=tid;m.userData.nt=nt;
  for(let t=0;t<nt;t++){const id=occ?0:(++tid);const r=(id&255)/255,gg=((id>>8)&255)/255,bb=((id>>16)&255)/255;
   for(let j=0;j<3;j++){const i=I?I.getX(t*3+j):t*3+j;v.fromBufferAttribute(P,i).applyMatrix4(m.matrixWorld);idPos.push(v.x,v.y,v.z);idCol.push(r,gg,bb);}}}
 const NT=tid;const idGeo=new THREE.BufferGeometry();idGeo.setAttribute('position',new THREE.Float32BufferAttribute(idPos,3));idGeo.setAttribute('color',new THREE.Float32BufferAttribute(idCol,3));
 const idScene=new THREE.Scene();idScene.add(new THREE.Mesh(idGeo,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide})));
 const gnd=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshBasicMaterial({color:0}));gnd.rotation.x=-Math.PI/2;gnd.position.y=0.0;idScene.add(gnd);
 const IW=1024,IH=576,R0=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});R0.setSize(IW,IH);R0.setClearColor(0,1);R0.outputEncoding=THREE.LinearEncoding;
 const seen=new Uint8Array(NT+1),buf=new Uint8Array(IW*IH*4);let nv=0;
 function look(pos,tgt,fov){const cam=new THREE.PerspectiveCamera(fov,IW/IH,0.05,200);cam.position.set(...pos);cam.lookAt(...tgt);R0.render(idScene,cam);
  const gl=R0.getContext();gl.readPixels(0,0,IW,IH,gl.RGBA,gl.UNSIGNED_BYTE,buf);for(let i=0;i<buf.length;i+=4){const id=buf[i]|(buf[i+1]<<8)|(buf[i+2]<<16);if(id)seen[id]=1;}nv++;}
 for(let a=0;a<360;a+=15){const c=Math.cos(a*Math.PI/180),s2=Math.sin(a*Math.PI/180);
  for(const d of[3.2,6,11])for(const h of[0.35,1.0,1.8,3.0])for(const tz of[-1.6,0,1.8])look([d*s2,h,d*c+tz*0.3],[0,0.35,tz],d<4?55:35);}
 look([0,2.7,-4.45],[0,1.1,8.5],64);for(const dx of[-0.15,0,0.15])look([dx,1.42,-0.62],[dx*3,1.18,14],64);   // погоня и кокпит
 R0.dispose();
 let vis=0;for(let i=1;i<=NT;i++)vis+=seen[i];res.visible={views:nv,total:NT,visible:vis};
 // кольцо соседей видимых — без дыр по краям
 function cullClone(src,ring){const c=src.clone(true);let kept=0;const ms=[];src.traverse(m=>{if(m.isMesh)ms.push(m);});let mi=0;
  c.traverse(m=>{if(!m.isMesh)return;const o=ms[mi++];const k=cls(m.material.name||'');if(k==='tyre'||k==='rim'||k==='drop')return;
   const g=m.geometry.clone(),P=g.attributes.position,I=g.index;const nt=(I?I.count:P.count)/3;const t0=o.userData.t0;
   const key=i=>Math.round(P.getX(i)*1e4)+','+Math.round(P.getY(i)*1e4)+','+Math.round(P.getZ(i)*1e4);
   let keep=new Uint8Array(nt);for(let t=0;t<nt;t++)keep[t]=seen[t0+t+1];
   for(let r=0;r<ring;r++){const hot=new Set();for(let t=0;t<nt;t++)if(keep[t])for(let j=0;j<3;j++)hot.add(key(I?I.getX(t*3+j):t*3+j));
    const k2=keep.slice();for(let t=0;t<nt;t++)if(!keep[t])for(let j=0;j<3;j++)if(hot.has(key(I?I.getX(t*3+j):t*3+j))){k2[t]=1;break;}keep=k2;}
   const idx=[];for(let t=0;t<nt;t++)if(keep[t]){kept++;for(let j=0;j<3;j++)idx.push(I?I.getX(t*3+j):t*3+j);}g.setIndex(idx);m.geometry=g;});
  return {c,kept};}
 const cu=cullClone(full,2);res.kept=cu.kept;
 for(const [t,src] of[[7700,our],[3800,ourS]]){
  CREASE=45;WPAINT=1;WCARB=1;const f1=fit(cu.c,t);objs['c'+t]=addWheels(repaint(f1.c).grp,src);res['c'+t]=+(f1.e*1000).toFixed(1);
  WPAINT=0.4;WCARB=1.5;const f2=fit(cu.c,t);objs['e'+t]=addWheels(repaint(f2.c).grp,src);res['e'+t]={paint:+(f2.e*400).toFixed(1),carb:+(f2.e*1500).toFixed(1)};}
 const V={chase:{pos:[0,2.7,-4.45],look:[0,1.1,8.5],fov:64,W:960,H:540},
  q34:{pos:[2.5,1.15,3.7],look:[0,0.35,0.9],fov:40,W:960,H:540},
  rear:{pos:[-2.0,1.1,-4.2],look:[0,0.5,-1.3],fov:40,W:960,H:540},
  fw:{pos:[-1.4,0.55,4.4],look:[-0.3,0.25,2.2],fov:40,W:960,H:540},
  side:{o:true,pos:[20,0.6,0.15],look:[0,0.6,0.15],w:5.8,h:1.5,W:960,H:248},
  side_low:{pos:[3.4,0.45,-0.4],look:[0,0.3,-0.4],fov:50,W:960,H:540},
  hood:{pos:[1.6,1.6,-2.9],look:[0,0.7,-0.6],fov:40,W:960,H:540}};
 const R=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});R.setPixelRatio(1);R.outputEncoding=THREE.sRGBEncoding;R.setClearColor(0xe9edf2,1);
 function shoot(obj,v){R.setSize(v.W,v.H);
  const sc=new THREE.Scene();sc.add(obj);sc.add(new THREE.HemisphereLight('#eaf3ff','#5b6b4a',1.05));const d=new THREE.DirectionalLight('#fff4e2',1.15);d.position.set(4,8,6);sc.add(d);const d2=new THREE.DirectionalLight('#cfe0ff',0.4);d2.position.set(-5,3,-6);sc.add(d2);
  const gnd=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshLambertMaterial({color:'#5d6168'}));gnd.rotation.x=-Math.PI/2;gnd.position.y=-0.005;sc.add(gnd);
  let cam;if(v.o)cam=new THREE.OrthographicCamera(-v.w/2,v.w/2,v.h/2,-v.h/2,0.1,60);else cam=new THREE.PerspectiveCamera(v.fov,v.W/v.H,0.05,200);cam.position.set(...v.pos);cam.lookAt(...v.look);R.render(sc,cam);sc.remove(obj);return R.domElement.toDataURL('image/png');}
 const out={};for(const o in objs)for(const vv in V)out[o+'__'+vv]=shoot(objs[o],V[vv]);R.dispose();return {res,out};});
console.log(JSON.stringify(r.res));fs.mkdirSync(OUT,{recursive:true});for(const k in r.out)fs.writeFileSync(path.join(OUT,k+'.png'),Buffer.from(r.out[k].split(',')[1],'base64'));await b.close();srv.close();})();
