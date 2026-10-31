// Пробный замер: Mercedes W17 и McLaren MCL40 — упрощение 8/4 тыс., перекраска в наши материалы, снимки рядом с нашей.
'use strict';const path=require('path'),fs=require('fs'),http=require('http');
const S=path.resolve(__dirname,'..'),SERVE=path.join(S,'serve'),OUT=path.join(S,process.env.OUT||'trial');
const TYPES={'.html':'text/html','.js':'text/javascript','.gltf':'model/gltf+json','.bin':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg'};
const srv=http.createServer((q,r)=>{const f=path.join(SERVE,decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8782);
(async()=>{const {chromium}=require('playwright');const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const p=await b.newPage();p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>console.log('  '+m.text()));
await p.goto('http://localhost:8782/index.html');await p.waitForTimeout(1500);await p.addScriptTag({url:'/GLTFLoader.js'});await p.addScriptTag({url:'/meshopt_simplifier.js'});
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
  const grp=new THREE.Group();let calls=0;for(const k in buck){if(!buck[k].length)continue;const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(buck[k],3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(nb[k],3));grp.add(new THREE.Mesh(geo,PAL[k]));calls++;}
  return {grp,calls};}
 const res={},objs={};
 {const full=(await new Promise((ok,no)=>new THREE.GLTFLoader().load('/merc/scene.gltf',ok,undefined,no))).scene;full.updateMatrixWorld(true);const TOT=tris(full);
  objs.tex=full;const rf=repaint(full);objs.full=rf.grp;res.full=Math.round(tris(rf.grp));
  for(const t of[8000,4000]){const d=decimate(full,TOT,t);const rp=repaint(d);objs['d'+t]=rp.grp;res['d'+t]=Math.round(tris(rp.grp));}}
 const V={chase:{pos:[0,2.7,-4.45],look:[0,1.1,8.5],fov:64,W:960,H:540},
  q34:{pos:[2.5,1.15,3.7],look:[0,0.35,0.9],fov:40,W:960,H:540},
  rear:{pos:[-2.0,1.1,-4.2],look:[0,0.5,-1.3],fov:40,W:960,H:540},
  fw:{pos:[-1.4,0.55,4.4],look:[-0.3,0.25,2.2],fov:40,W:960,H:540},
  side:{o:true,pos:[20,0.6,0.15],look:[0,0.6,0.15],w:5.8,h:1.5,W:960,H:248},
  rival12:{pos:[0.6,2.7,-16.45],look:[0,1.1,-3.5],fov:64,W:960,H:540},
  rival30:{pos:[1.5,2.7,-34.45],look:[0,1.1,-21.5],fov:64,W:960,H:540}};
 const R=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});R.setPixelRatio(1);R.outputEncoding=THREE.sRGBEncoding;R.setClearColor(0xe9edf2,1);
 function shoot(obj,v){R.setSize(v.W,v.H);
  const sc=new THREE.Scene();sc.add(obj);sc.add(new THREE.HemisphereLight('#eaf3ff','#5b6b4a',1.05));const d=new THREE.DirectionalLight('#fff4e2',1.15);d.position.set(4,8,6);sc.add(d);const d2=new THREE.DirectionalLight('#cfe0ff',0.4);d2.position.set(-5,3,-6);sc.add(d2);
  const gnd=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshLambertMaterial({color:'#5d6168'}));gnd.rotation.x=-Math.PI/2;gnd.position.y=-0.005;sc.add(gnd);
  let cam;if(v.o)cam=new THREE.OrthographicCamera(-v.w/2,v.w/2,v.h/2,-v.h/2,0.1,60);else cam=new THREE.PerspectiveCamera(v.fov,v.W/v.H,0.05,200);cam.position.set(...v.pos);cam.lookAt(...v.look);R.render(sc,cam);sc.remove(obj);return R.domElement.toDataURL('image/png');}
 const out={};for(const o in objs)for(const vv in V)out[o+'__'+vv]=shoot(objs[o],V[vv]);R.dispose();return {res,out};});
console.log(JSON.stringify(r.res));fs.mkdirSync(OUT,{recursive:true});for(const k in r.out)fs.writeFileSync(path.join(OUT,k+'.png'),Buffer.from(r.out[k].split(',')[1],'base64'));await b.close();srv.close();})();
