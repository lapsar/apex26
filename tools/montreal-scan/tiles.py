#!/usr/bin/env python3
"""Скачать и склеить спутниковую мозаику вокруг точки. Печатает геопривязку."""
import math, os, subprocess, sys
from PIL import Image

SRC = {
    'esri': "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    'goog': "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    'osm':  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
}
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tilecache')


def deg2px(lat, lon, z):
    n = 256 * 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def px2deg(x, y, z):
    n = 256 * 2 ** z
    lon = x / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat, lon


def fetch(src, z, x, y):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, f"{src}_{z}_{x}_{y}.img")
    if os.path.exists(p) and os.path.getsize(p) > 500:
        return p
    url = SRC[src].format(z=z, x=x, y=y)
    subprocess.run(["curl", "-sS", "--max-time", "30", "-A", "apex26-dev", url, "-o", p], check=True)
    return p


def mosaic(lat, lon, z, w_tiles, h_tiles, src='esri', out='mosaic.png'):
    cx, cy = deg2px(lat, lon, z)
    tx0 = int(cx // 256) - w_tiles // 2
    ty0 = int(cy // 256) - h_tiles // 2
    im = Image.new('RGB', (256 * w_tiles, 256 * h_tiles))
    for i in range(w_tiles):
        for j in range(h_tiles):
            t = Image.open(fetch(src, z, tx0 + i, ty0 + j)).convert('RGB')
            im.paste(t, (256 * i, 256 * j))
    im.save(out)
    lat_nw, lon_nw = px2deg(tx0 * 256, ty0 * 256, z)
    lat_se, lon_se = px2deg((tx0 + w_tiles) * 256, (ty0 + h_tiles) * 256, z)
    mpp = 156543.03392 * math.cos(math.radians(lat)) / (2 ** z)
    print(f"{out}: {im.size[0]}x{im.size[1]} px, {mpp:.3f} м/пиксель, "
          f"NW {lat_nw:.6f},{lon_nw:.6f}  SE {lat_se:.6f},{lon_se:.6f}")
    return dict(out=out, z=z, tx0=tx0, ty0=ty0, mpp=mpp)


if __name__ == '__main__':
    lat, lon, z = float(sys.argv[1]), float(sys.argv[2]), int(sys.argv[3])
    w = int(sys.argv[4]) if len(sys.argv) > 4 else 3
    h = int(sys.argv[5]) if len(sys.argv) > 5 else 3
    src = sys.argv[6] if len(sys.argv) > 6 else 'esri'
    out = sys.argv[7] if len(sys.argv) > 7 else 'mosaic.png'
    mosaic(lat, lon, z, w, h, src, out)
