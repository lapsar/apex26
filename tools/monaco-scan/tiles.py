"""Тайлы спутника (Google z20 по умолчанию, ESRI z19) с кэшем в tiles/; px(lat,lon) — цвет точки."""
import math, os, urllib.request, threading
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); TD = os.path.join(HERE, 'tiles'); os.makedirs(TD, exist_ok=True)
_C = {}; _L = threading.Lock()
def deg2num(lat, lon, z):
    n = 2 ** z; la = math.radians(lat)
    return ((lon + 180) / 360 * n, (1 - math.log(math.tan(la) + 1 / math.cos(la)) / math.pi) / 2 * n)
def tile(X, Y, src='google', z=20):
    k = (src, z, X, Y)
    with _L:
        if k in _C: return _C[k]
    fn = os.path.join(TD, '%s_%d_%d_%d.jpg' % (src, z, X, Y))
    if not os.path.exists(fn):
        url = (f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{Y}/{X}'
               if src == 'esri' else f'https://mt1.google.com/vt/lyrs=s&x={X}&y={Y}&z={z}')
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        for a in range(4):
            try: open(fn, 'wb').write(urllib.request.urlopen(req, timeout=45).read()); break
            except Exception:
                if a == 3: raise
    im = Image.open(fn).convert('RGB').load()
    with _L: _C[k] = im
    return im
def px(lat, lon, src='google', z=20):
    xt, yt = deg2num(lat, lon, z); X, Y = int(xt), int(yt)
    return tile(X, Y, src, z)[min(255, int((xt - X) * 256)), min(255, int((yt - Y) * 256))]
