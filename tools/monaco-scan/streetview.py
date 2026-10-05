#!/usr/bin/env python3
"""Google Street View без ключа (04.10.2026): ближайшая панорама к точке и вид в заданную сторону — сверка вида игры с жизнью.

    python3 streetview.py lat lon курс наклон fov_по_горизонтали out.jpg     # курс — градусы от севера по часовой
    печатает {pano, lat, lon, yaw, dates}: dates — годы/месяцы панорам в ответе (первая обычно текущая)

Точку и курс по S игры даёт осевая (SCEN_ORIGIN.Monaco: lat = lat0 + z/110540, lon = lon0 - x/mlon, курс = atan2(-F.x, F.z)).
Кадр 1000×460, как у съёмки игры; у камеры игры fov 64° по вертикали — по горизонтали 107°.
API Street View с ключом закрыт (403); поиск панорамы (GeoPhotoService.SingleImageSearch) отвечает через раз
«decommissioned» — повторять с паузой; тайлы streetviewpixels-pa — без ключа, с User-Agent. Нужны numpy и pillow
(pip install numpy pillow). СМОТРЕТЬ ДАТУ: у Монако панорамы 2021–2022 (пит-прямая 2011), Mareterra на них — стройка.
"""
import sys,re,io,math,json,urllib.request,urllib.error
import numpy as np
from PIL import Image
lat,lon,hd,pt,fov=map(float,sys.argv[1:6]);out=sys.argv[6]
UA={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36'}
get=lambda u:urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read()
u=('https://maps.googleapis.com/maps/api/js/GeoPhotoService.SingleImageSearch?pb=!1m5!1sapiv3!5sUS!11m2!1m1!1b0!2m4!1m2!3d%f!4d%f!2d50'
   '!3m10!2m2!1sen!2sGB!9m1!1e2!11m4!1m3!1e2!2b1!3e2!4m10!1e1!1e2!1e3!1e4!1e8!1e6!5m1!1e2!6m1!1e2&callback=_xdc_._v2mub5')%(lat,lon)
import time
for k in range(8):
  t=get(u).decode();mm=re.search(r'\[2,"([^"]+)"\]',t)
  if mm: break
  time.sleep(4)
pid=mm.group(1)
m=re.search(r'\[\[null,null,([\d.]+),([\d.]+)\],\[[^\]]*\],\[([\d.\-]+),([\d.\-]+),([\d.\-]+)\]',t)
plat,plon,yaw,tilt=float(m.group(1)),float(m.group(2)),float(m.group(3)),float(m.group(4))
dates=re.findall(r'\[(20\d\d),(\d{1,2})\]',t)
for Z in (3,2):                      # у части панорам (снимки пользователей) нет зума 3 — ответ 400; тогда 2048×1024
  try:
    W,H=512*2**Z,256*2**Z
    img=Image.new('RGB',(W,H))
    for y in range(2**(Z-1)):
      for x in range(2**Z):
        img.paste(Image.open(io.BytesIO(get('https://streetviewpixels-pa.googleapis.com/v1/tile?cb_client=maps_sv.tactile&panoid=%s&x=%d&y=%d&zoom=%d&nbt=1&fover=2'%(pid,x,y,Z)))),(x*512,y*512))
    break
  except urllib.error.HTTPError:
    if Z==2: raise
E=np.asarray(img)
ow,oh=1000,460;f=(ow/2)/math.tan(math.radians(fov)/2)
xs,ys=np.meshgrid(np.arange(ow)-ow/2+0.5,np.arange(oh)-oh/2+0.5)
# луч в системе камеры: вперёд z, вправо x, вверх -y
d=np.stack([xs,-ys,np.full_like(xs,f)],-1);d/=np.linalg.norm(d,axis=-1,keepdims=True)
p=math.radians(pt);ry=d[...,1]*math.cos(p)+d[...,2]*math.sin(p);rz=-d[...,1]*math.sin(p)+d[...,2]*math.cos(p);rx=d[...,0]
az=np.degrees(np.arctan2(rx,rz))+hd;el=np.degrees(np.arcsin(np.clip(ry,-1,1)))
u=(((az-yaw)/360+0.5)%1)*W;v=(0.5-el/180)*H
o=E[np.clip(v.astype(int),0,H-1),np.clip(u.astype(int),0,W-1)]
Image.fromarray(o).save(out,quality=88)
print(json.dumps({'pano':pid,'lat':plat,'lon':plon,'yaw':yaw,'dates':dates[:3]}))
