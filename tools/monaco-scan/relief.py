"""Рельеф Монако «для глаза»: карта высот (открытые тайлы terrarium, z15) в координатах игры
и сверка с высотой полотна из телеметрии (onboard/kadry.tsv, z openf1/10).
  python3 relief.py check     — высота карты под полотном против телеметрии (сдвиг нуля)
  python3 relief.py grid      — сетка высот для игры → relief-grid.json и строка RELIEF_BY_KEY (relief-monaco.js.txt)
Тайлы кэшируются в tiles/ (как у tiles.py)."""
import math, os, sys, json, re, urllib.request
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); TD = os.path.join(HERE, 'tiles'); os.makedirs(TD, exist_ok=True)
LAT0, LON0, MLON = 43.737145229, 7.425286371, 80430.825145      # SCEN_ORIGIN.Monaco
Z = 15
BASE = 45.0     # м: z openf1/10 минус BASE = высота над морем (бассейн 2.8 м, Казино 43.9 м)
BIAS = 8.0      # м: карта высот в городе — крыши (выше полотна медианой на ~9 м), суша опускается
SIG_P = 15.0    # м: сглаживание профиля телеметрии
STEP = 40       # м: шаг карты высот в игре
SIG_D = 30.0    # м: сглаживание карты
PAD = 1500      # м: поле вокруг трассы (дальше туман 1300 м)
def deg2num(lat, lon, z=Z):
    n = 2 ** z; la = math.radians(lat)
    return ((lon + 180) / 360 * n, (1 - math.log(math.tan(la) + 1 / math.cos(la)) / math.pi) / 2 * n)
_T = {}
def tile(X, Y):
    if (X, Y) in _T: return _T[(X, Y)]
    fn = os.path.join(TD, 'terrarium_%d_%d_%d.png' % (Z, X, Y))
    if not os.path.exists(fn):
        u = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/%d/%d/%d.png' % (Z, X, Y)
        open(fn, 'wb').write(urllib.request.urlopen(u, timeout=60).read())
    a = np.asarray(Image.open(fn).convert('RGB')).astype(np.float64)
    h = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768
    _T[(X, Y)] = h; return h
def elev(lat, lon):                     # билинейно по пикселям
    xt, yt = deg2num(lat, lon); xt -= 0.5 / 256; yt -= 0.5 / 256
    fx, fy = xt * 256, yt * 256; x0, y0 = math.floor(fx), math.floor(fy); tx, ty = fx - x0, fy - y0
    def p(x, y): return tile(x // 256, y // 256)[y % 256, x % 256]
    return (p(x0, y0) * (1 - tx) * (1 - ty) + p(x0 + 1, y0) * tx * (1 - ty) + p(x0, y0 + 1) * (1 - tx) * ty + p(x0 + 1, y0 + 1) * tx * ty)
def game2ll(x, z): return (LAT0 + z / 110540, LON0 - x / MLON)
def track():                            # точки Монако в координатах игры (x уже отражён), от начала контура
    src = open(os.path.join(HERE, '..', '..', 'index.html'), encoding='utf-8').read()
    m = re.search(r'"Monaco":\{"pts":(\[\[.*?\]\])', src)
    return [(-p[0], p[1]) for p in json.loads(m.group(1))]
def prof():
    rows = [l.rstrip('\n').split('\t') for l in open(os.path.join(HERE, 'onboard', 'kadry.tsv'), encoding='utf-8') if not l.startswith('#')]
    return [(float(r[2]), float(r[4])) for r in rows if len(r) > 4]
if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'check'
    if cmd == 'check':
        pts = track(); SF = 2416
        L = [0]
        for i in range(1, len(pts) + 1): a, b = pts[i - 1], pts[i % len(pts)]; L.append(L[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        tot = L[-1]; out = []
        for S, h in prof():
            s = (S + SF) % tot; i = max(k for k in range(len(pts)) if L[k] <= s)
            a, b = pts[i], pts[(i + 1) % len(pts)]; t = (s - L[i]) / max(1e-9, L[i + 1] - L[i])
            x, z = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            e = elev(*game2ll(x, z)); out.append((S, h, e))
        d = np.array([o[1] - o[2] for o in out])
        for S, h, e in out[::10]: print('S %5.0f  телеметрия %5.1f  карта %6.1f  разница %5.1f' % (S, h, e, h - e))
        print('разница: медиана %.1f, 10%% %.1f, 90%% %.1f' % (np.median(d), np.percentile(d, 10), np.percentile(d, 90)))
    elif cmd == 'grid':
        import base64
        pts = track(); tot = sum(math.hypot(pts[(i + 1) % len(pts)][0] - pts[i][0], pts[(i + 1) % len(pts)][1] - pts[i][1]) for i in range(len(pts)))
        pr = np.array(prof()); pr = pr[np.argsort(pr[:, 0])]
        s5 = np.arange(0, tot, 5.0); h5 = np.interp(s5, pr[:, 0], pr[:, 1], period=tot)
        k = np.exp(-0.5 * (np.arange(-9, 10) * 5 / SIG_P) ** 2); k /= k.sum()
        hs = np.array([np.sum(k * np.take(h5, np.arange(i - 9, i + 10), mode='wrap')) for i in range(len(s5))])
        prof10 = [int(round((np.interp(s, s5, hs, period=tot) - BASE) * 10)) for s in np.arange(0, tot, 10.0)]
        xs = np.array([p[0] for p in pts]); zs = np.array([p[1] for p in pts])
        X0, X1 = math.floor(xs.min() - PAD), math.ceil(xs.max() + PAD); Z0, Z1 = math.floor(zs.min() - PAD), math.ceil(zs.max() + PAD)
        nx, nz = int((X1 - X0) / STEP) + 1, int((Z1 - Z0) / STEP) + 1
        raw = np.array([[elev(*game2ll(X0 + i * STEP, Z0 + j * STEP)) for i in range(nx)] for j in range(nz)])
        sea = raw < 0.5
        land = np.where(sea, 0, np.maximum(raw - BIAS, 2))
        def blur(a):   # гаусс по сетке, края — повтор
            g = np.exp(-0.5 * (np.arange(-3, 4) * STEP / SIG_D) ** 2); g /= g.sum()
            a = np.apply_along_axis(lambda v: np.convolve(np.pad(v, 3, mode='edge'), g, 'valid'), 1, a)
            return np.apply_along_axis(lambda v: np.convolve(np.pad(v, 3, mode='edge'), g, 'valid'), 0, a)
        land = blur(land)
        code = np.where(sea, 0, np.clip(np.round(land / 2), 1, 255)).astype(np.uint8)
        out = {'base': BASE, 'len': round(tot, 1), 'prof': prof10, 'x0': X0, 'z0': Z0, 'step': STEP, 'nx': nx, 'nz': nz,
               'dem': base64.b64encode(code.tobytes()).decode()}
        json.dump(out, open(os.path.join(HERE, 'relief-grid.json'), 'w'))
        js = ('  Monaco:{len:%s,prof:[%s],\n    x0:%d,z0:%d,step:%d,nx:%d,nz:%d,dem:"%s"}' %
              (out['len'], ','.join(map(str, prof10)), X0, Z0, STEP, nx, nz, out['dem']))
        open(os.path.join(HERE, 'relief-monaco.js.txt'), 'w').write(js + '\n')   # строка для RELIEF_BY_KEY в index.html
        print('профиль: %d точек, %.1f..%.1f м над морем; карта %dx%d шаг %d м, море %.0f %%, суша до %d м; %d байт base64'
              % (len(prof10), min(prof10) / 10, max(prof10) / 10, nx, nz, STEP, sea.mean() * 100, code.max() * 2, len(out['dem'])))
