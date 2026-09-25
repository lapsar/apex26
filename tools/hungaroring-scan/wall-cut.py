#!/usr/bin/env python3
"""ГДЕ СТРОИТЕЛЬ ОБРЕЗАЛ СТЕНУ ВНУТРИ ПОВОРОТА (v1.16.9, 09.2026).

    node dump-cl.js                  # осевая -> centerline.json (если её ещё нет)
    python3 wall-cut.py              # по index.html
    APEX_INDEX=../../archive/v1.16.8.html python3 wall-cut.py --tsv=старый_barrier.tsv

Внутри поворота стена не может стоять дальше ~0.7 его радиуса (wallFromRail, урок 2
ядра), и там, где замер (barrier.tsv) дальше этого предела, строитель её режет.
Если замер большой на подходе и срезан только в апексе, стена обрывается к трассе
«зубом» — так было внутри T12 (v1.16.8) и T6 (v1.16.9); владелец видит это на
устройстве как выступ. Скрипт сравнивает замер с ПОСТРОЕННОЙ стеной (track.WL/WR)
на внутренней стороне поворотов и печатает участки, где срез больше 2.5 м.
Пусто — зубов нет. На v1.16.8 печатал один участок: R 2329..2365 (22 -> 11.7 м).
"""
import json, os, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
TSV = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--tsv=')), os.path.join(HERE, 'barrier.tsv'))
LIM = 2.5

cl = json.load(open(os.path.join(HERE, 'centerline.json')))
L = cl['len']
rows = [ln.rstrip('\n').split('\t') for ln in open(TSV, encoding='utf-8') if ln.strip() and not ln.startswith('#')]
js = ("const H=require('./tools/harness.js');const i=H.tracks().findIndex(t=>t.key==='Hungaroring');"
      "const e=H.setupWorld(H.loadGame(),{trackIdx:i});"
      "console.log(JSON.stringify(e.evalIn('({WL:Array.from(track.WL),WR:Array.from(track.WR),S:Array.from(track.S),K:Array.from(track.K)})')))")
w = json.loads(subprocess.check_output(['node', '-e', js], cwd=ROOT))
S, K = np.array(w['S']), np.array(w['K'])
found = 0
for side, key in (('L', 'WL'), ('R', 'WR')):
    pts = sorted((float(r[0]), float(r[2])) for r in rows if r[1] == side)
    s = np.array([p[0] for p in pts]); o = np.array([p[1] for p in pts])
    want = np.interp(S, np.concatenate([s - L, s, s + L]), np.tile(o, 3))
    got = np.array(w[key]); d = want - got
    inside = K < 0 if side == 'R' else K > 0          # K<0 — правый поворот: внутри справа
    run = None
    for i in range(len(S) + 1):
        hit = i < len(S) and inside[i] and d[i] > LIM
        if hit:
            run = [i, i] if run is None else [run[0], i]
        elif run:
            a, b = run
            print('%s  S %d..%d  замер до %.1f м, построено до %.1f (срез до %.1f)' %
                  (side, S[a], S[b], want[a:b + 1].max(), got[a:b + 1].min(), d[a:b + 1].max()))
            found += 1; run = None
print('участков со срезом внутри поворота: %d' % found)
