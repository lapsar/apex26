#!/usr/bin/env python3
"""Снимок вида сверху по повороту с нанесёнными кромкой полотна и кольцами отступа."""
import json, math, os, sys
from PIL import Image, ImageDraw
from tiles import deg2px, fetch, px2deg

HERE = os.path.dirname(os.path.abspath(__file__))
O = dict(lat0=45.504410238, lon0=-73.526453475, mlon=78019.107475)
cl = json.load(open(os.path.join(HERE, 'centerline.json')))


def game2deg(x, z):
    return O['lat0'] + z / 110540.0, O['lon0'] - x / O['mlon']


def render(s_from, s_to, z=20, src='esri', out='corner.png', rings=(9, 12, 16, 20)):
    P, R, S = cl['P'], cl['R'], cl['S']
    n = len(P)
    idx = [i for i in range(n) if s_from <= S[i] <= s_to]
    pts = [P[i] for i in idx]
    lats, lons = zip(*[game2deg(p[0], p[1]) for p in pts])
    m = 45.0        # поле вокруг, м
    dlat, dlon = m / 110540.0, m / (O['mlon'])
    x0, y1 = deg2px(max(lats) + dlat, min(lons) - dlon, z)
    x1, y0 = deg2px(min(lats) - dlat, max(lons) + dlon, z)
    tx0, ty0, tx1, ty1 = int(x0 // 256), int(y1 // 256), int(x1 // 256), int(y0 // 256)
    im = Image.new('RGB', (256 * (tx1 - tx0 + 1), 256 * (ty1 - ty0 + 1)))
    for i in range(tx0, tx1 + 1):
        for j in range(ty0, ty1 + 1):
            im.paste(Image.open(fetch(src, z, i, j)).convert('RGB'), (256 * (i - tx0), 256 * (j - ty0)))
    to = lambda lat, lon: tuple(a - b for a, b in zip(deg2px(lat, lon, z), (tx0 * 256, ty0 * 256)))
    d = ImageDraw.Draw(im)
    def ribbon(off, colr, w=2):
        line = []
        for i in idx:
            x = P[i][0] + R[i][0] * off
            zz = P[i][1] + R[i][1] * off
            line.append(to(*game2deg(x, zz)))
        d.line(line, fill=colr, width=w)
    ribbon(0, (0, 255, 255), 1)
    ribbon(-7, (255, 80, 0), 2); ribbon(7, (255, 80, 0), 2)
    palette = [(255, 255, 0), (0, 255, 0), (255, 0, 255), (255, 255, 255)]
    for k, r in enumerate(rings):
        ribbon(-r, palette[k % 4], 1); ribbon(r, palette[k % 4], 1)
    box = (int(min(p[0] for p in [to(min(lats)-dlat, min(lons)-dlon), to(max(lats)+dlat, max(lons)+dlon)])),
           int(min(p[1] for p in [to(min(lats)-dlat, min(lons)-dlon), to(max(lats)+dlat, max(lons)+dlon)])),
           int(max(p[0] for p in [to(min(lats)-dlat, min(lons)-dlon), to(max(lats)+dlat, max(lons)+dlon)])),
           int(max(p[1] for p in [to(min(lats)-dlat, min(lons)-dlon), to(max(lats)+dlat, max(lons)+dlon)])))
    im = im.crop(box)
    im.save(os.path.join(HERE, out))
    mpp = 156543.03392 * math.cos(math.radians(lats[0])) / (2 ** z)
    print(f"{out}: {im.size}, {mpp:.3f} м/пкс, кольца {rings}")


if __name__ == '__main__':
    render(float(sys.argv[1]), float(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 20,
           sys.argv[4] if len(sys.argv) > 4 else 'esri',
           sys.argv[5] if len(sys.argv) > 5 else 'corner.png')
