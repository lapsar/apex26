import math, os, urllib.request, threading
from PIL import Image
Z=19
CACHE={}
LOCK=threading.Lock()
def deg2num(lat,lon,z=Z):
    n=2**z; la=math.radians(lat)
    return ((lon+180)/360*n,(1-math.log(math.tan(la)+1/math.cos(la))/math.pi)/2*n)
def tile(X,Y,src='esri',z=Z):
    key=(src,z,X,Y)
    with LOCK:
        if key in CACHE: return CACHE[key]
    fn='t_%s_%d_%d_%d.jpg'%(src,z,X,Y)
    if not os.path.exists(fn):
        url=(f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{Y}/{X}'
             if src=='esri' else f'https://mt1.google.com/vt/lyrs=s&x={X}&y={Y}&z={z}')
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
        for a in range(3):
            try:
                with urllib.request.urlopen(req,timeout=45) as r: open(fn,'wb').write(r.read()); break
            except Exception as e:
                if a==2: raise
    im=Image.open(fn).convert('RGB').load()
    with LOCK: CACHE[key]=im
    return im
def px(lat,lon,src='esri',z=Z):
    xt,yt=deg2num(lat,lon,z)
    X,Y=int(xt),int(yt)
    im=tile(X,Y,src,z)
    i=min(255,int((xt-X)*256)); j=min(255,int((yt-Y)*256))
    return im[i,j]
def mpp(lat,z=Z):
    return 156543.03392*math.cos(math.radians(lat))/(2**z)
