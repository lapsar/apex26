#!/usr/bin/env python3
"""План игры на кадре онбоарда (v1.17.11): сетка координат игры (x, z) через 10 м по земле, наши кромки (белый), стена игры
(красный, вместе с ломаными карманов), подписи узлов сетки — по ним читается, где на плане стоит настоящий барьер кадра.
Камера: поза болида — телеметрия поула (povcmp.py → povs.json), высота K = 1.28 м (lines.py), f — 64° по горизонтали,
горизонт vy (по умолчанию 215, у торможения выше). Курс поправляется руками: dh (градусы, + — вправо), сдвиг вбок dx (м).
    node dump-wall.js && python3 povcmp.py K… && python3 overlay.py K[:dh[:dx[:vy]]] …  -> plans/ov_K.jpg"""
import json, math, sys
from PIL import Image, ImageDraw
W = json.load(open('wall.json')); P, R, HW, WL, WR = W['P'], W['R'], W['HW'], W['WL'], W['WR']; M = len(P)
POV = {p['k']: p for p in json.load(open('povs.json'))}
from PIL import ImageFont
FT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
H = 1.28; FW = 2346; F = FW / 2 / math.tan(math.radians(32)); X0 = 261
def proj(cam, pt):
    cx, cz, h, vy = cam; dx, dz = pt[0] - cx, pt[1] - cz
    fx, fz = math.sin(h), math.cos(h); rx, rz = -math.cos(h), math.sin(h)
    D = dx * fx + dz * fz; X = dx * rx + dz * rz
    if D < 1.5: return None
    return (FW / 2 + F * X / D, vy + F * H / D)
def poly(d, cam, pts, col, w):
    seg = []
    for p in pts:
        q = proj(cam, p)
        if q and -2000 < q[0] < FW + 2000: seg.append(q)
        else:
            if len(seg) > 1: d.line(seg, fill=col, width=w)
            seg = []
    if len(seg) > 1: d.line(seg, fill=col, width=w)
for a in sys.argv[1:]:
    t = a.split(':'); k = int(t[0]); dh = float(t[1]) if len(t) > 1 else 0; sx = float(t[2]) if len(t) > 2 else 0; vy = float(t[3]) if len(t) > 3 else 215
    p = POV[k]; h = p['hdg'] + math.radians(dh); rx, rz = -math.cos(h), math.sin(h)
    cam = (p['x'] + rx * sx, p['z'] + rz * sx, h, vy)
    im = Image.open('onboard/kadr_%04d.jpg' % k).crop((X0, 0, X0 + FW, 1320)).convert('RGB'); d = ImageDraw.Draw(im, 'RGBA')
    cx, cz = cam[0], cam[1]; RG = 150
    for g in range(int((cx - RG) // 10) * 10, int(cx + RG) + 10, 10):
        poly(d, cam, [(g, cz - RG + i) for i in range(0, 2 * RG, 1)], (0, 255, 255, 120 if g % 50 else 220), 2)
    for g in range(int((cz - RG) // 10) * 10, int(cz + RG) + 10, 10):
        poly(d, cam, [(cx - RG + i, g) for i in range(0, 2 * RG, 1)], (0, 255, 255, 120 if g % 50 else 220), 2)
    for gx in range(int((cx - 80) // 10) * 10, int(cx + 80) + 10, 10):
        for gz in range(int((cz - 80) // 10) * 10, int(cz + 80) + 10, 10):
            q = proj(cam, (gx, gz))
            if q and 0 < q[0] < FW and q[1] < 1100 and (gx % 10 == 0 and gz % 10 == 0): d.text((q[0] + 3, q[1] + 2), "%d,%d" % (gx, gz), fill=(255, 255, 0, 255), font=FT)
    for sg, Wa in ((1, WR), (-1, WL)):
        poly(d, cam, [(P[i][0] + R[i][0] * sg * HW[i], P[i][1] + R[i][1] * sg * HW[i]) for i in range(M)], (255, 255, 255, 255), 3)
        poly(d, cam, [(P[i][0] + R[i][0] * sg * Wa[i], P[i][1] + R[i][1] * sg * Wa[i]) for i in range(M)], (255, 40, 40, 255), 3)
    for g in W.get('GAPS', []):
        poly(d, cam, [tuple(q) for q in g['path']], (255, 120, 0, 255), 4)
    d.text((20, 1240), 'k%d dh %+.1f dx %+.1f vy %d' % (k, dh, sx, vy), fill='yellow')
    im.save('plans/ov_%d.jpg' % k, quality=88)
