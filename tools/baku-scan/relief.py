#!/usr/bin/env python3
"""Рельеф Баку «для глаза» (подъём к Старому городу) — по образцу monaco-scan/relief.py.
Высота полотна — телеметрия openf1 (8 лучших кругов квалы 2026, openf1/quali_top8.json, z/10 м), спроецированная на осевую
ИГРЫ (TRACKDATA.Baku в index.html, дуга игры от линии старта).

    python3 relief.py prof        — профиль высот по S игры (сырой и сглаженный) → relief_prof.tsv, сводка
    python3 relief.py grid        — поле высот вокруг (склон между ногами) → relief_grid.npz и views/relief.png
    python3 relief.py js [index.html] — строка RELIEF_BY_KEY.Baku (профиль + карта) → relief-baku.js.txt и в index.html (замена прежней)

Высота в игре — над остальным кругом: почти весь круг идёт у Каспия на −24.7…−22.4 м (уклон 0.1 %, глазом не виден), он остаётся
ровно на нуле, поднимается только участок HILL (T7 → замок → Истиглалият → спуск к T16) над прямой между его концами.
Поле вокруг — гармоническое (уравнение Лапласа): полотно (до PIN м от осевой) задано, на краю поля — без уклона. Между нижней
и верхней ногой выходит ровный склон без «шишек» и без выброса выше полотна; к северу от Истиглалият — плато его высоты.
Карты земли без домов для Баку нет (SRTM/terrarium меряют крыши: выше телеметрии на 7 м медианой, 10–90 %: 2.5…11 м).
"""
import json, math, re, sys, os
import numpy as np
import bk
HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, '../../index.html')
SRC = open(HTML).read()
o = re.search(r'Baku:\{lat0:([\d.]+),lon0:([\d.]+),mlon:([\d.]+)\}', SRC); GLAT0, GLON0, GMLON = map(float, o.groups())
m = re.search(r'"Baku":\{"pts":(\[.*?\]\]),"len":(\d+)\}', SRC); PTS = np.array(json.loads(m.group(1)))   # восток, север (игра отражает X)
N = len(PTS); SEG = np.roll(PTS, -1, 0) - PTS; SL = np.hypot(SEG[:, 0], SEG[:, 1]); CUM = np.concatenate([[0], np.cumsum(SL)]); LEN = CUM[-1]
def g_xy(lat, lon): return ((lon - GLON0) * GMLON, (lat - GLAT0) * 110540)
def g_ll(x, y): return (GLAT0 + y / 110540, GLON0 + x / GMLON)
def proj(x, y):
    """ближайшая точка осевой игры: (S, расстояние)"""
    d = np.array([x, y]) - PTS; t = np.clip((d * SEG).sum(1) / np.maximum(SL ** 2, 1e-9), 0, 1)
    q = PTS + SEG * t[:, None]; e = np.hypot(q[:, 0] - x, q[:, 1] - y); i = int(np.argmin(e))
    return CUM[i] + SL[i] * t[i], e[i]
FIT = json.load(open(os.path.join(HERE, 'openf1/fit.json'))); FR = np.array(FIT['R'])
def tel_points():
    out = []
    for lap in json.load(open(os.path.join(HERE, 'openf1/quali_top8.json'))):
        for r in lap['loc']:
            p = np.array([r[0], r[1]]) * 0.1 * [1, FIT['mirror']]; q = FIT['s'] * (FR @ p) + np.array(FIT['t'])
            la, lo = bk.latlon(*q); x, y = g_xy(la, lo); S, e = proj(x, y)
            if e < 12: out.append((S, r[2] / 10))
    return np.array(out)
def profile(step=10.0, sig=10.0):
    """высота полотна через step м по S игры: гаусс σ sig по точкам всех кругов (по кругу)"""
    T = tel_points(); S = np.arange(0, LEN, step); H = np.zeros(len(S))
    for k, s in enumerate(S):
        d = (T[:, 0] - s + LEN / 2) % LEN - LEN / 2; w = np.exp(-0.5 * (d / sig) ** 2); H[k] = (w * T[:, 1]).sum() / w.sum()
    return S, H, T
HILL = (2400, 4000)    # м S игры: участок подъёма; концы — где полотно отходит от уровня остального круга (T7 и выход T16)
def hill_prof(step=10.0):
    """профиль игры: 0 вне HILL, внутри — над прямой между концами (не ниже 0)"""
    S, H, T = profile(step)
    a, b = HILL; ha, hb = np.interp(a, S, H), np.interp(b, S, H)
    Y = np.where((S >= a) & (S <= b), H - (ha + (hb - ha) * (S - a) / (b - a)), 0.0)
    return S, np.maximum(Y, 0.0)
def at(s):
    s %= LEN; i = int(np.searchsorted(CUM, s, 'right') - 1); i = min(i, N - 1); t = (s - CUM[i]) / max(SL[i], 1e-9)
    return PTS[i] + SEG[i] * t
GSTEP = 10.0; PIN = 6.0; PAD = 300.0; FAR_HILL = 120.0; FLAT_BAND = 60.0; SEA_MIN = 20000   # м²: вода крупнее — море (на нуле, как и остальной круг); пруды и фонтаны — нет
def sea_polys():
    """Каспий — многоугольники воды игры (SCENERY_BAKU.ground.water, их считает ground.py) крупнее SEA_MIN, в метрах восток/север"""
    from shapely.geometry import Polygon
    i = SRC.index('ground: {', SRC.index('const SCENERY_BAKU')); j = SRC.index('water: [', i); k = SRC.index('asphalt: [', j)
    out = []
    for m in re.finditer(r'\[\[([\d.,\s\-]+)\]', SRC[j:k]):
        v = [float(t) for t in m.group(1).split(',')]; ring = [g_xy(v[q], v[q + 1]) for q in range(0, len(v) - 1, 2)]
        if len(ring) > 2:
            P = Polygon(ring).buffer(0)
            if P.area > SEA_MIN: out.append(P)
    return out
def field():
    S, Y = hill_prof(); x0, x1 = PTS[:, 0].min() - PAD, PTS[:, 0].max() + PAD; y0, y1 = PTS[:, 1].min() - PAD, PTS[:, 1].max() + PAD
    nx, ny = int((x1 - x0) / GSTEP) + 1, int((y1 - y0) / GSTEP) + 1
    fix = np.zeros((ny, nx), bool); val = np.zeros((ny, nx))
    gx, gy = np.meshgrid(x0 + np.arange(nx) * GSTEP, y0 + np.arange(ny) * GSTEP)
    for s in np.arange(0, LEN, 2.0):                     # полотно: клетки ближе PIN к осевой — высота полотна
        p = at(s); h = np.interp(s, S, Y, period=LEN)
        i0, i1 = int((p[0] - PIN - x0) / GSTEP), int((p[0] + PIN - x0) / GSTEP) + 1; j0, j1 = int((p[1] - PIN - y0) / GSTEP), int((p[1] + PIN - y0) / GSTEP) + 1
        sub = (np.hypot(gx[j0:j1 + 1, i0:i1 + 1] - p[0], gy[j0:j1 + 1, i0:i1 + 1] - p[1]) <= PIN)
        fv = fix[j0:j1 + 1, i0:i1 + 1]; vv = val[j0:j1 + 1, i0:i1 + 1]
        vv[sub & ~fv] = h; vv[sub & fv] = np.maximum(vv[sub & fv], h); fv |= sub
    # ровный круг вдали от подъёма (дальше FAR_HILL от его полотна): земля на нуле полосой FLAT_BAND — иначе склон «растекается» по
    # краю поля без уклона до ~1.2 м у самых дорог, и крупная сетка земли игры (40 м, вне мелкой у подъёма) выходит над полотном
    hp = np.array([at(s) for s in S[Y > 0.01]])
    for s in np.arange(0, LEN, 5.0):
        if np.interp(s, S, Y, period=LEN) > 0.01: continue
        p = at(s)
        if np.hypot(hp[:, 0] - p[0], hp[:, 1] - p[1]).min() < FAR_HILL: continue
        i0, i1 = max(0, int((p[0] - FLAT_BAND - x0) / GSTEP)), min(nx - 1, int((p[0] + FLAT_BAND - x0) / GSTEP) + 1)
        j0, j1 = max(0, int((p[1] - FLAT_BAND - y0) / GSTEP)), min(ny - 1, int((p[1] + FLAT_BAND - y0) / GSTEP) + 1)
        sub = np.hypot(gx[j0:j1 + 1, i0:i1 + 1] - p[0], gy[j0:j1 + 1, i0:i1 + 1] - p[1]) <= FLAT_BAND
        fv = fix[j0:j1 + 1, i0:i1 + 1]; fv |= sub
    from shapely import contains_xy
    sea = np.zeros((ny, nx), bool)
    for P in sea_polys(): sea |= contains_xy(P, gx, gy)
    sea &= ~fix; fix |= sea                              # море — на нуле (val там 0)
    import scipy.sparse as sp, scipy.sparse.linalg as sl   # Лаплас: в свободной клетке — среднее соседей; край поля без уклона
    idx = -np.ones((ny, nx), int); free = ~fix; idx[free] = np.arange(free.sum()); n = free.sum()
    rows, cols, dat = [], [], []; rhs = np.zeros(n)
    jj, ii = np.nonzero(free)
    for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        j2, i2 = jj + dj, ii + di; ok = (j2 >= 0) & (j2 < ny) & (i2 >= 0) & (i2 < nx)      # за краем соседа нет — уклона нет
        r = idx[jj[ok], ii[ok]]; rows += [r]; cols += [r]; dat += [np.ones(ok.sum())]
        nf = ok.copy(); nf[ok] = free[j2[ok], i2[ok]]
        rows += [idx[jj[nf], ii[nf]]]; cols += [idx[j2[nf], i2[nf]]]; dat += [-np.ones(nf.sum())]
        nb = ok.copy(); nb[ok] = fix[j2[ok], i2[ok]]
        np.add.at(rhs, idx[jj[nb], ii[nb]], val[j2[nb], i2[nb]])
    A = sp.csr_matrix((np.concatenate(dat), (np.concatenate(rows), np.concatenate(cols))), shape=(n, n))
    F = val.copy(); F[free] = sl.spsolve(A.tocsc(), rhs)
    return dict(F=F, x0=x0, y0=y0, nx=nx, ny=ny, fix=fix & ~sea, sea=sea)
DSTEP = 20; DQ = 0.125   # м: шаг карты в игре (поле гладкое — 20 м хватает, у Монако тоже); квант высоты (байт 1 + h/DQ, до 31.75 м)
def js():
    """строка RELIEF_BY_KEY.Baku: prof — дециметры через 10 м по S игры; карта — в координатах ИГРЫ (x = −восток), байт 1 + h/dq
    (0 — море — у Баку не бывает: Каспий лежит на нуле с остальным кругом и рисуется землёй города)"""
    import base64
    S, Y = hill_prof(10.0); prof = [int(round(v * 10)) for v in Y]
    G = field(); F, x0, y0 = G['F'], G['x0'], G['y0']
    X0, X1 = math.floor(-(x0 + (G['nx'] - 1) * GSTEP)), math.ceil(-x0); Z0, Z1 = math.floor(y0), math.ceil(y0 + (G['ny'] - 1) * GSTEP)
    nx, nz = int((X1 - X0) / DSTEP) + 1, int((Z1 - Z0) / DSTEP) + 1
    def fv(e, n):                                        # билинейно по полю 10 м
        fx = np.clip((e - x0) / GSTEP, 0, G['nx'] - 1.001); fy = np.clip((n - y0) / GSTEP, 0, G['ny'] - 1.001)
        i, j = int(fx), int(fy); tx, ty = fx - i, fy - j
        return (F[j, i] * (1 - tx) + F[j, i + 1] * tx) * (1 - ty) + (F[j + 1, i] * (1 - tx) + F[j + 1, i + 1] * tx) * ty
    code = np.array([[1 + round(max(0.0, fv(-(X0 + i * DSTEP), Z0 + j * DSTEP)) / DQ) for i in range(nx)] for j in range(nz)])
    code = np.clip(code, 1, 255).astype(np.uint8)
    line = ('  Baku:{len:%.1f,prof:[%s],\n    x0:%d,z0:%d,step:%d,nx:%d,nz:%d,dq:%s,dem:"%s"}' %
            (LEN, ','.join(map(str, prof)), X0, Z0, DSTEP, nx, nz, DQ, base64.b64encode(code.tobytes()).decode()))
    print('профиль %d точек, до %.1f м; карта %d×%d шаг %d м, до %.2f м; %d байт base64' % (len(prof), max(prof) / 10, nx, nz, DSTEP, (code.max() - 1) * DQ, len(line)))
    return line
if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'prof'
    if cmd == 'prof':
        S, H, T = profile()
        print('круг игры %.1f м, точек телеметрии %d; высота %.1f … %.1f' % (LEN, len(T), H.min(), H.max()))
        open(os.path.join(HERE, 'relief_prof.tsv'), 'w').write('# S\tвысота_м (openf1 z/10, 8 кругов, гаусс 10 м)\n' + ''.join('%.0f\t%.2f\n' % (s, h) for s, h in zip(S, H)))
        for s, h in zip(S, H):
            if int(s) % 50 == 0: print('%5.0f %6.2f' % (s, h), end='   ' if int(s) % 300 else '\n')
        print()
    if cmd == 'grid':
        G = field(); np.savez_compressed(os.path.join(HERE, 'relief_grid.npz'), **G); F = G['F']
        print('поле %d×%d клеток по %.0f м, высота до %.1f м; клеток выше 0.5 м: %d' % (G['nx'], G['ny'], GSTEP, F.max(), (F > 0.5).sum()))
        from PIL import Image
        im = (np.clip(F / max(F.max(), 1), 0, 1) * 255).astype(np.uint8); rgb = np.stack([im, im, im], -1); rgb[G['sea']] = [20, 40, 90]; rgb[G['fix']] = [255, 60, 30]
        for c in range(1, 26, 2): rgb[(np.abs(F - c) < 0.08) & ~G['fix']] = [40, 120, 255]
        Image.fromarray(rgb[::-1]).save(os.path.join(HERE, 'views/relief.png'))
    if cmd == 'js':
        line = js(); open(os.path.join(HERE, 'relief-baku.js.txt'), 'w').write(line + '\n')
        path = sys.argv[2] if len(sys.argv) > 2 else HTML; src = open(path).read()
        a = src.index('const RELIEF_BY_KEY={'); b = src.index('\n};', a)
        body = src[a:b]; k = body.find('\n  Baku:{')
        if k >= 0: body = body[:k]
        body = body.rstrip(',') + ',\n' + line
        open(path, 'w').write(src[:a] + body + src[b:]); print('записано в', path)
