#!/usr/bin/env python3
"""Вырезка участка снимка вокруг точки круга — «посмотреть глазами».

Урок Майами (§11): развёртка в ленту МЕРИТ, но не ПОКАЗЫВАЕТ; спорное место
надо резать из снимка и смотреть.

    python3 crop.py --s=0 --along=200 --across=60 --src=esri --out=sf.png

--s      метры от линии старта (центр вырезки)
--along  длина вдоль трассы, --across — поперёк
Вырезка разворачивается ВДОЛЬ трассы: слева направо = по ходу движения,
поэтому верх кадра — левая сторона трассы по ходу.
Рисуется тонкая сетка через 10 м и осевая, чтобы можно было мерить по кадру.
"""
import os, sys
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prof, tiles

arg = lambda n, d: next((a.split('=')[1] for a in sys.argv if a.startswith('--%s=' % n)), d)
S0 = float(arg('s', 0)); ALONG = float(arg('along', 200)); ACROSS = float(arg('across', 60))
SRC = arg('src', 'esri'); Z = int(arg('z', 19)); OUT = arg('out', 'crop.png')
PPM = float(arg('ppm', 4))          # пикселей на метр в вырезке

W, H = int(ALONG * PPM), int(ACROSS * PPM)
im = Image.new('RGB', (W, H))
px = im.load()
for i in range(W):
    s = S0 - ALONG / 2 + i / PPM
    p, t = prof.at(prof.SF + s)
    n = [-t[1], t[0]]
    for j in range(H):
        d = ACROSS / 2 - j / PPM
        px[i, j] = prof.rgb(p[0] + n[0] * d, p[1] + n[1] * d, SRC, Z)
dr = ImageDraw.Draw(im)
for s in range(int(-ALONG // 2), int(ALONG // 2) + 1, 10):
    x = (s + ALONG / 2) * PPM
    dr.line([(x, 0), (x, 6)], fill=(255, 0, 0), width=1)
    dr.line([(x, H - 6), (x, H)], fill=(255, 0, 0), width=1)
    if s % 50 == 0:
        dr.text((x + 2, 8), '%+d' % s, fill=(255, 60, 60))
dr.line([(0, H / 2), (W, H / 2)], fill=(255, 0, 255), width=1)
im.save(OUT)
print('%s: S=%.0f±%.0f м, поперёк ±%.0f м, %s z%d, %.1f пкс/м  (%dx%d)'
      % (OUT, S0, ALONG / 2, ACROSS / 2, SRC, Z, PPM, W, H))
