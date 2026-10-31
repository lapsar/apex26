'use strict';const path=require('path'),fs=require('fs'),http=require('http');
const S=path.resolve(__dirname,'..'),SERVE=path.join(S,'serve');
const TYPES={'.html':'text/html','.js':'text/javascript','.gltf':'model/gltf+json','.bin':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg'};
const srv=http.createServer((q,r)=>{const f=path.join(SERVE,decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream'});r.end(d);});}).listen(8780);
(async()=>{const {chromium}=require('playwright');const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const p=await b.newPage();p.on('pageerror',e=>console.log('ERR',e.message));await p.goto('http://localhost:8780/index.html');await p.waitForTimeout(1500);await p.addScriptTag({url:'/GLTFLoader.js'});
const r=await p.evaluate(async()=>{const out={};
 for(const k of['sf26','merc','mcl']){const sc=(await new Promise((ok,no)=>new THREE.GLTFLoader().load('/'+k+'/scene.gltf',ok,undefined,no))).scene;sc.updateMatrixWorld(true);
  const bb=new THREE.Box3().setFromObject(sc);const v=new THREE.Vector3();
  // колёса: вершины протектора по четвертям
  const q={};const ext=[];let tris=0;
  sc.traverse(m=>{if(!m.isMesh)return;const P=m.geometry.attributes.position;tris+=(m.geometry.index?m.geometry.index.count:P.count)/3;const n=(m.material.name||'');
   if(/tread/.test(n))for(let i=0;i<P.count;i++){v.fromBufferAttribute(P,i).applyMatrix4(m.matrixWorld);const key=(v.x>0?'R':'L')+(v.z>(bb.min.z+bb.max.z)/2?'F':'B');const o=q[key]||(q[key]={x0:1e9,x1:-1e9,y0:1e9,y1:-1e9,z0:1e9,z1:-1e9});
     o.x0=Math.min(o.x0,v.x);o.x1=Math.max(o.x1,v.x);o.y0=Math.min(o.y0,v.y);o.y1=Math.max(o.y1,v.y);o.z0=Math.min(o.z0,v.z);o.z1=Math.max(o.z1,v.z);}});
  const W={};for(const kk in q){const o=q[kk];W[kk]={cx:+((o.x0+o.x1)/2).toFixed(3),w:+(o.x1-o.x0).toFixed(3),cz:+((o.z0+o.z1)/2).toFixed(3),d:+(o.y1-o.y0).toFixed(3)};}
  out[k]={tris,bb:[bb.min.toArray().map(x=>+x.toFixed(3)),bb.max.toArray().map(x=>+x.toFixed(3))],W};}
 return out;});
console.log(JSON.stringify(r,null,1));await b.close();srv.close();})();
