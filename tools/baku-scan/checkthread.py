#!/usr/bin/env python3
"""Проверка новой середины (az-center.geojson + az-center-width.tsv) по телеметрии: доля точек 8 кругов квалы 2026,
где центр болида ближе PAD м к кромке или за ней; разбивка по 100 м новой дуги."""
import json, os, collections, importlib.util, numpy as np
import bk as old
spec = importlib.util.spec_from_file_location('bk2', 'bk.py'); os.environ['BK_GEOJSON'] = 'az-center.geojson'
new = importlib.util.module_from_spec(spec); spec.loader.exec_module(new)
PAD = 1.0
fit = json.load(open('openf1/fit.json')); Rm = np.array(fit['R']); s = fit['s']; t = np.array(fit['t']); mir = fit['mirror']
Wt = np.array([[float(x) for x in l.split('\t')] for l in open('az-center-width.tsv').read().splitlines()[1:]])
n = 0; bad = []
for L in json.load(open('openf1/quali_top8.json')):
    F = np.array([[x, y] for x, y, z in L['loc']], float) * 0.1 * [1, mir]; P = (s * (Rm @ F.T)).T + t
    for p in P:
        S, side, d = new.proj(new.xy(*old.latlon(*p))); h = np.interp(S, Wt[:, 0], Wt[:, 1]); n += 1
        if abs(side) > h - PAD: bad.append((int(S // 100 * 100), side, h))
print('точек %d, ближе %.1f м к кромке или за ней: %d (%.1f %%), за кромкой: %d' % (n, PAD, len(bad), 100 * len(bad) / n, sum(1 for b in bad if abs(b[1]) > b[2])))
print(sorted(collections.Counter(b[0] for b in bad).items()))
