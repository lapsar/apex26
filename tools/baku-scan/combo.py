#!/usr/bin/env python3
"""Лист участка для замера: снимок сверху (plan.py) и под ним 6 кадров онбоарда этого участка с подписью «кадр / S».
    python3 combo.py S0 S1     -> plans/combo_S0_S1.jpg (план должен быть уже построен: plan.py S0 S1 --half=16 --px=0.1)"""
import sys, os
from PIL import Image, ImageDraw
S0, S1 = int(sys.argv[1]), int(sys.argv[2])
K = []
for l in open('onboard/kadry.tsv'):
    if l.startswith('#'): continue
    f = l.split('\t')
    if f[2] and S0 <= float(f[2]) < S1 and 12 <= int(f[0]) <= 423: K.append((int(f[0]), float(f[2])))
pl = Image.open('plans/plan_%04d_%04d.jpg' % (S0, S1)); W = 1600
pl = pl.resize((W, int(pl.height * W / pl.width)))
pick = [K[round(i * (len(K) - 1) / 5)] for i in range(6)] if len(K) >= 6 else K
fw, fh = W // 3, int(W // 3 * 1320 / 2346)
out = Image.new('RGB', (W, pl.height + fh * 2)); out.paste(pl, (0, 0)); d = ImageDraw.Draw(out)
for j, (k, s) in enumerate(pick):
    t = Image.open('onboard/kadr_%04d.jpg' % k).crop((261, 0, 2607, 1320)).resize((fw, fh))
    x, y = (j % 3) * fw, pl.height + (j // 3) * fh; out.paste(t, (x, y))
    d.rectangle([x, y, x + 120, y + 16], fill=(0, 0, 0)); d.text((x + 4, y + 2), 'k%d  S%.0f' % (k, s), fill=(255, 140, 0))
fn = 'plans/combo_%04d_%04d.jpg' % (S0, S1); out.save(fn, quality=85); print(fn, out.size)
