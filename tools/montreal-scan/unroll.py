#!/usr/bin/env python3
"""Развернуть круг в ленту: для каждой станции S — поперечный срез снимка.

Вход  : centerline.json (P[x,z], R[x,z], S) из harness
Выход : unrolled_<src>.png  — строка = станция, столбец = отступ от осевой
        и unrolled_<src>.json с геопривязкой строк
"""
import json, math, os, subprocess, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'tilecache')
O = dict(lat0=45.504410238, lon0=-73.526453475, mlon=78019.107475)
SRC = {
    'esri': "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    'goog': "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
}


def game2deg(x, z):
    return O['lat0'] + z / 110540.0, O['lon0'] - x / O['mlon']


def deg2px(lat, lon, z):
    n = 256 * 2 ** z
    return ((lon + 180.0) / 360.0 * n,
            (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)


class Mosaic:
    """Ленивая мозаика тайлов с кэшем на диске."""

    def __init__(self, src, z):
        self.src, self.z, self.tiles = src, z, {}
        os.makedirs(CACHE, exist_ok=True)

    def need(self, txy):
        miss = [t for t in txy if not self._cached(t)]
        if not miss:
            return
        lst = os.path.join(CACHE, 'urls.txt')
        with open(lst, 'w') as f:
            for (tx, ty) in miss:
                f.write(f"url = {SRC[self.src].format(z=self.z, x=tx, y=ty)}\n")
                f.write(f"output = {self._path((tx, ty))}\n")
        subprocess.run(["curl", "-sS", "--parallel", "--parallel-max", "8",
                        "--max-time", "60", "-A", "apex26-dev", "-K", lst], check=False)

    def _path(self, t):
        return os.path.join(CACHE, f"{self.src}_{self.z}_{t[0]}_{t[1]}.img")

    def _cached(self, t):
        p = self._path(t)
        return os.path.exists(p) and os.path.getsize(p) > 500

    def pixel(self, px, py):
        tx, ty = int(px // 256), int(py // 256)
        im = self.tiles.get((tx, ty))
        if im is None:
            p = self._path((tx, ty))
            if not self._cached(p and (tx, ty)):
                return (0, 0, 0)
            try:
                im = Image.open(p).convert('RGB')
            except Exception:
                im = Image.new('RGB', (256, 256))
            self.tiles[(tx, ty)] = im
        return im.getpixel((int(px) % 256, int(py) % 256))


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'esri'
    zoom = int(sys.argv[2]) if len(sys.argv) > 2 else 19
    half_w = float(sys.argv[3]) if len(sys.argv) > 3 else 40.0   # метров в каждую сторону
    step = float(sys.argv[4]) if len(sys.argv) > 4 else 0.25     # метров на столбец

    cl = json.load(open(os.path.join(HERE, 'centerline.json')))
    P, R, S = cl['P'], cl['R'], cl['S']
    M = len(P)
    ncol = int(2 * half_w / step) + 1

    # какие тайлы нужны
    mo = Mosaic(src, zoom)
    need = set()
    for i in range(M):
        for k in (0, ncol - 1, ncol // 2):
            off = -half_w + k * step
            x, z = P[i][0] + R[i][0] * off, P[i][1] + R[i][1] * off
            lat, lon = game2deg(x, z)
            px, py = deg2px(lat, lon, zoom)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    need.add((int(px // 256) + dx, int(py // 256) + dy))
    print(f"нужно тайлов: {len(need)}")
    need = sorted(need)
    for i in range(0, len(need), 200):
        mo.need(need[i:i + 200])
        print(f"  скачано {min(i + 200, len(need))}/{len(need)}")

    im = Image.new('RGB', (ncol, M))
    px_data = im.load()
    for i in range(M):
        for k in range(ncol):
            off = -half_w + k * step
            x, z = P[i][0] + R[i][0] * off, P[i][1] + R[i][1] * off
            lat, lon = game2deg(x, z)
            fx, fy = deg2px(lat, lon, zoom)
            px_data[k, i] = mo.pixel(fx, fy)
    out = os.path.join(HERE, f'unrolled_{src}_{zoom}.png')
    im.save(out)
    json.dump(dict(src=src, zoom=zoom, half_w=half_w, step=step, M=M, S=S),
              open(out.replace('.png', '.json'), 'w'))
    print(f"{out}: {ncol}x{M}, столбец = {step} м, строка = станция")


if __name__ == '__main__':
    main()
