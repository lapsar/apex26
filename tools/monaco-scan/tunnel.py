#!/usr/bin/env python3
"""Тоннель и здания над ним — строки SCENERY_MONACO (tunnel, buildings), этап «тоннель и Fairmont».

    node dump-wall.js            # wall.json — осевая игры (S от линии старта)
    python3 tunnel.py            # печатает строки для index.html

Тоннель: OSM — путь трассы 4230891 «Boulevard Louis II», tunnel=yes, layer=-1 (S игры 1508–1869);
онбоард поула 2025 — въезд кадр 145–146 (S 1523–1542, потолок уже над головой), выезд кадр 167
(S 1892, портал в нескольких метрах). Въезд — фасад отеля (край контура OSM над дорогой, S 1504–1505),
иначе стена отеля встала бы поперёк дороги перед порталом; выезд S 1880.
Здания — контуры OSM: Fairmont — отношение 2093796 (building=hotel, 3 этажа над улицей у шпильки,
внешний путь 156242249; дворики не строятся — с дороги их не видно), Monte Carlo Star (176722821,
3 этажа над потолком тоннеля), Auditorium Rainier III (112689159, height 12.5, building:colour #F0DAC3).
Высоты — абсолютные, в метрах рельефа игры (полотно в тоннеле 9.2 м, шпилька 19–21.5 м):
Fairmont 31 (3 этажа над улицей у шпильки), Monte Carlo Star 24.5 (3 этажа над потолком 14.8),
Auditorium — 12.5 над землёй под ним.
"""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import osm

LAT0, LON0, MLON = 43.737145229, 7.425286371, 80430.825145   # SCEN_ORIGIN.Monaco
W = json.load(open(os.path.join(HERE, 'wall.json')))


def ll_of(x, z):                       # обратный scenXZ: x = -(lon-lon0)*mlon, z = (lat-lat0)*110540
    return (LAT0 + z / 110540, LON0 - x / MLON)


def at_S(s):
    i = min(range(W['M']), key=lambda k: abs(W['S'][k] - s))
    return i, ll_of(*W['P'][i])


D = osm.load()
N, WY = D['nodes'], D['ways']


def poly(way):
    pts = [N[n] for n in WY[way]['nodes'] if n in N]
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    return '[' + ','.join('[%.6f,%.6f]' % (p[0], p[1]) for p in pts) + ']'


i0, a = at_S(1504)
i1, b = at_S(1880)
print("  tunnel: {name:'Tunnel', fromS:%d, toS:%d, fromLatLon:[%.6f,%.6f], toLatLon:[%.6f,%.6f], h:5.6},"
      % (round(W['S'][i0]), round(W['S'][i1]), a[0], a[1], b[0], b[1]))
print("  buildings: [")
print("    {name:'Fairmont', top:31, color:'#ece6da', band:'#5c6670', poly:%s}," % poly('156242249'))
print("    {name:'Monte Carlo Star', top:24.5, color:'#e7d5b8', band:'#66615a', poly:%s}," % poly('176722821'))
print("    {name:'Auditorium Rainier III', h:12.5, color:'#f0dac3', band:'#7a6a5c', poly:%s}," % poly('112689159'))
print("  ],")
