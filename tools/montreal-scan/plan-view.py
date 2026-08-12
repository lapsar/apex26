#!/usr/bin/env python3
"""Вид сверху с осевой, кольцами отступа И ПОДПИСЯМИ станций.

corner.py рисует кольца, но не говорит, где какая станция, — а без этого
кандидата не перенести в разметку. Здесь по осевой расставлены метки S.

  python3 plan-view.py <out.png> <S0> <S1> [src] [zoom] [кольца через запятую]
"""
import json, math, os, sys
from PIL import Image, ImageDraw
from tiles import deg2px, fetch

HERE = os.path.dirname(os.path.abspath(__file__))
O = dict(lat0=45.504410238, lon0=-73.526453475, mlon=78019.107475)
cl = json.load(open(os.path.join(HERE, 'centerline.json')))


def game2deg(x, z):
    return O['lat0'] + z / 110540.0, O['lon0'] - x / O['mlon']


def main():
    out, s0, s1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    src = sys.argv[4] if len(sys.argv) > 4 else 'goog'
    z = int(sys.argv[5] if len(sys.argv) > 5 else 20)
    rings = [float(v) for v in (sys.argv[6] if len(sys.argv) > 6 else '10,20,30,40').split(',')]
    margin = float(sys.argv[7]) if len(sys.argv) > 7 else 60.0

    P, R, S = cl['P'], cl['R'], cl['S']
    idx = [i for i in range(len(P)) if s0 <= S[i] <= s1]
    lats, lons = zip(*[game2deg(P[i][0], P[i][1]) for i in idx])
    dlat, dlon = margin / 110540.0, margin / O['mlon']
    x0, y1 = deg2px(max(lats) + dlat, min(lons) - dlon, z)
    x1, y0 = deg2px(min(lats) - dlat, max(lons) + dlon, z)
    tx0, ty0, tx1, ty1 = int(x0 // 256), int(y1 // 256), int(x1 // 256), int(y0 // 256)
    im = Image.new('RGB', (256 * (tx1 - tx0 + 1), 256 * (ty1 - ty0 + 1)))
    for i in range(tx0, tx1 + 1):
        for j in range(ty0, ty1 + 1):
            im.paste(Image.open(fetch(src, z, i, j)).convert('RGB'), (256 * (i - tx0), 256 * (j - ty0)))
    d = ImageDraw.Draw(im)

    def to(lat, lon):
        px, py = deg2px(lat, lon, z)
        return px - 256 * tx0, py - 256 * ty0

    def ribbon(off, colr, w=1):
        d.line([to(*game2deg(P[i][0] + R[i][0] * off, P[i][1] + R[i][1] * off)) for i in idx], fill=colr, width=w)

    ribbon(0, (0, 255, 255), 1)
    ribbon(-7, (255, 90, 0), 2)
    ribbon(7, (255, 90, 0), 2)
    pal = [(255, 255, 0), (0, 255, 0), (255, 0, 255), (255, 255, 255), (255, 140, 140)]
    for k, r in enumerate(rings):
        for sgn in (-1, 1):
            ribbon(sgn * r, pal[k % 5], 1)
    for i in idx:                                          # подписи станций каждые 20 м
        if abs(S[i] % 20) > 2.5:
            continue
        p = to(*game2deg(P[i][0], P[i][1]))
        d.ellipse([p[0] - 3, p[1] - 3, p[0] + 3, p[1] + 3], fill=(255, 0, 0))
        d.text((p[0] + 5, p[1] - 5), f"{S[i]:.0f}", fill=(255, 255, 0))
    pts = [to(*game2deg(P[i][0] + R[i][0] * o, P[i][1] + R[i][1] * o)) for i in idx for o in (-margin, margin)]
    box = (int(min(p[0] for p in pts)), int(min(p[1] for p in pts)),
           int(max(p[0] for p in pts)), int(max(p[1] for p in pts)))
    im.crop(box).save(os.path.join(HERE, out))
    mpp = 156543.03392 * math.cos(math.radians(lats[0])) / (2 ** z)
    print(f"{out}: {mpp:.3f} м/пкс, кольца {rings}")


if __name__ == '__main__':
    main()
