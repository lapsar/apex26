#!/usr/bin/env python3
"""БАРЬЕР И ЗОНЫ ВЫЛЕТА ХУНГАРОРИНГА: замер (barrier.tsv, zones.tsv) -> разметка.

    node dump-cl.js                 # осевая из игры -> centerline.json
    python3 barrier.py              # -> barrier.js: куски rail{L,R} и runoff[]
                                    #    для SCENERY_HUNGARORING (вставляются руками)
    python3 barrier.py --check      # только сводка: где барьер, сколько зон

КРАСКА (v1.16.10): в zones.tsv тип «tint:ИМЯ» — зона целиком одного цвета, полосы
краски у кромки — stripes.tsv; цвета — палитра PAINT ниже (медиана пикселей кадров
онбоарда). В barrier.js они выходят строками runoff (type:'tint', color) и stripes[].

Отступ барьера задан точками «S, сторона, off» и между ними идёт линейно; точки
ломаной ставятся через STEP м по ОСЕВОЙ ИГРЫ, так что строитель (wallFromRail)
находит каждую у своей станции и отступ читает ровно тот, что замерен.

ЗАЩИТА ОТ ЧУЖОГО ВИТКА. wallFromRail относит точку к БЛИЖАЙШЕЙ станции всего
круга. Барьер вылета в 40-60 м от осевой может оказаться ближе к другому участку
трассы, чем к своему, и тогда он «переедет» туда. Поэтому каждая точка проверяется
так же, как её прочтёт игра, и при чужой ближайшей станции отступ сокращается,
пока точка не станет своей; такие места печатаются (в жизни барьер не может стоять
дальше середины между двумя участками полотна).
"""
import json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
O = dict(lat0=47.582732616, lon0=19.250829443, mlon=75088.112675)   # SCEN_ORIGIN.Hungaroring
STEP = 2            # точка ломаной через каждые STEP станций (станция ~4 м)
PAINT = dict(green='#3f7870',   # тёмная бирюзово-зелёная полоса у кромки (кадр 61: #356360 в тени)
             lime='#25c060',    # ярко-зелёная: пятна внутри T6/T14, полоса у Fan (кадры 80, 111)
             blue='#4450b0',    # T2 снаружи (кадр 40; медиана #5b5e85 выбелена дымкой)
             yellow='#f0cc1c',  # T12 снаружи, DHL (кадр 122)
             cyan='#22b0dc')    # T11 снаружи (кадр 109)
# Цвет — КАК НА ЭКРАНЕ: строитель сам делит его на свет сцены (PAINT_GAIN в index.html)    # T11 снаружи (кадр 109)
cl = json.load(open(os.path.join(HERE, 'centerline.json')))
P = np.array(cl['P']); R = np.array(cl['R']); S = np.array(cl['S']); L = cl['len']; HALF = cl['half']
M = len(S)


def read(fn):
    rows = []
    for ln in open(os.path.join(HERE, fn), encoding='utf-8'):
        if not ln.strip() or ln.startswith('#'):
            continue
        rows.append(ln.rstrip('\n').split('\t'))
    return rows


def profile(side):
    pts = sorted((float(r[0]), float(r[2])) for r in read('barrier.tsv') if r[1] == side)
    s = np.array([p[0] for p in pts]); o = np.array([p[1] for p in pts])
    s = np.concatenate([s - L, s, s + L]); o = np.concatenate([o, o, o])   # круг замкнут
    return np.interp(S, s, o)


def latlon(x, z):
    return round(O['lat0'] + z / 110540, 6), round(O['lon0'] - x / O['mlon'], 6)


def nearest(q):
    d = ((P - q) ** 2).sum(1)
    return int(d.argmin())


def cyc(a, b):
    d = abs(S[a] - S[b]) % L
    return min(d, L - d)


def rail(side):
    sg = -1 if side == 'L' else 1
    W = profile(side)
    out, cut = [], []
    for i in range(0, M, STEP):
        off = W[i]
        while True:
            q = P[i] + R[i] * sg * off
            j = nearest(q)
            if cyc(i, j) <= 60 or off <= HALF + 1:
                break
            off -= 0.5
        if off < W[i] - 0.01:
            cut.append((round(S[i]), round(W[i], 1), round(off, 1)))
        W[i] = off
        out.append(latlon(*q))
    return out, W, cut


def zones():
    res = []
    for r in read('zones.tsv'):
        a, b, side, typ, wid = float(r[0]), float(r[1]), r[2], r[3], r[4]
        wid = 60 if wid == 'wall' else float(wid)       # «до барьера»: строитель обрежет по нему
        typ, _, col = typ.partition(':')
        res.append(dict(fromS=int(a), toS=int(b), side=side, type=typ, width=wid, color=PAINT[col] if col else None,
                        fromLatLon=edge_ll(a, side), toLatLon=edge_ll(b, side), note=r[5] if len(r) > 5 else ''))
    return res


def edge_ll(s, side):
    i = int(np.argmin([cyc_s(S[k], s) for k in range(M)]))
    return latlon(*(P[i] + R[i] * (-1 if side == 'L' else 1) * HALF))


def stripes():
    return [dict(fromS=int(r[0]), toS=int(r[1]), side=r[2], width=float(r[3]), color=PAINT[r[4]],
                 fromLatLon=edge_ll(float(r[0]), r[2]), toLatLon=edge_ll(float(r[1]), r[2]),
                 note=r[5] if len(r) > 5 else '') for r in read('stripes.tsv')]


def cyc_s(a, b):
    d = abs(a - b) % L
    return min(d, L - d)


def fmt(pts, per=8):
    lines = []
    for k in range(0, len(pts), per):
        lines.append('      ' + ','.join('[%.6f,%.6f]' % p for p in pts[k:k + per]) + ',')
    return '\n'.join(lines)


def main():
    rl, Wl, cl_ = rail('L')
    rr, Wr, cr = rail('R')
    for side, W, cut in (('L', Wl, cl_), ('R', Wr, cr)):
        print('%s: отступ %.1f..%.1f м, медиана %.1f; за кромкой медиана %.1f м' %
              (side, W.min(), W.max(), np.median(W), np.median(W) - HALF))
        if cut:
            print('   сокращено из-за чужого витка:', cut[:12], '...' if len(cut) > 12 else '')
    zs = zones()
    st = stripes()
    print('зон: %d (асфальт %d, гравий %d, краска %d); полос краски у кромки %d' % (len(zs),
          sum(z['type'] == 'asphalt' for z in zs), sum(z['type'] == 'gravel' for z in zs),
          sum(z['type'] == 'tint' for z in zs), len(st)))
    if '--check' in sys.argv:
        return
    js = ['  rail: { height:1.0, radius:12,   // радиус поворота окружностью по 12 м, а не по одному стыку (v1.16.8: ровная стена внутри T1)', '    L: [', fmt(rl), '    ],', '    R: [', fmt(rr), '    ],', '  },',
          '  runoff: [']
    for z in zs:
        col = ",color:'%s'" % z['color'] if z['color'] else ''
        js.append("    {fromS:%d,toS:%d,side:'%s',type:'%s',width:%g%s, fromLatLon:[%.6f,%.6f], toLatLon:[%.6f,%.6f]},   // %s"
                  % (z['fromS'], z['toS'], z['side'], z['type'], z['width'], col, *z['fromLatLon'], *z['toLatLon'], z['note']))
    js.append('  ],')
    js.append('  stripes: [   // полосы краски у кромки (stripes.tsv): width — от кромки полотна')
    for z in st:
        js.append("    {fromS:%d,toS:%d,side:'%s',width:%g,color:'%s', fromLatLon:[%.6f,%.6f], toLatLon:[%.6f,%.6f]},   // %s"
                  % (z['fromS'], z['toS'], z['side'], z['width'], z['color'], *z['fromLatLon'], *z['toLatLon'], z['note']))
    js.append('  ],')
    open(os.path.join(HERE, 'barrier.js'), 'w').write('\n'.join(js) + '\n')
    print('barrier.js: %d + %d точек ломаной' % (len(rl), len(rr)))


if __name__ == '__main__':
    main()
