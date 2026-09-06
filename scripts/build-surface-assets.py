#!/usr/bin/env python3
"""Author original, deterministic PBR surfaces; Python 3 + Pillow + NumPy.

No downloads, photographs, generated AI images, or third-party artwork are used.
Run from any directory: python3 scripts/build-surface-assets.py
"""
from pathlib import Path
import hashlib
import json
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SIZE = 512
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'textures'
OUT.mkdir(parents=True, exist_ok=True)


def noise(seed, scales=(8, 16, 32, 64, 128), weights=(1, .6, .32, .16, .08)):
    rng = np.random.default_rng(seed)
    data = np.zeros((SIZE, SIZE), np.float32)
    for scale, weight in zip(scales, weights):
        # Wrap the control lattice, so texture seams stay unobtrusive.
        a = rng.random((scale, scale)) * 255
        a[-1] = a[0]
        a[:, -1] = a[:, 0]
        layer = Image.fromarray(a.astype(np.uint8)).resize((SIZE, SIZE), Image.Resampling.BICUBIC)
        data += (np.asarray(layer, dtype=np.float32) / 255 - .5) * weight
    return data


def mask():
    return Image.new('L', (SIZE, SIZE), 0)


def draw_wrapped(draw, points, fill, width):
    for dx in (-SIZE, 0, SIZE):
        for dy in (-SIZE, 0, SIZE):
            draw.line([(x + dx, y + dy) for x, y in points], fill=fill, width=width, joint='curve')


def cracks(seed, count=5):
    rng = random.Random(seed)
    im = mask()
    d = ImageDraw.Draw(im)
    for _ in range(count):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        a = rng.uniform(0, math.tau)
        points = [(x, y)]
        for __ in range(rng.randrange(5, 14)):
            a += rng.uniform(-.65, .65)
            x += math.cos(a) * rng.uniform(7, 22)
            y += math.sin(a) * rng.uniform(7, 22)
            points.append((x, y))
        draw_wrapped(d, points, 180, rng.choice((1, 1, 2)))
        if len(points) > 7:
            px, py = points[4]
            draw_wrapped(d, [(px, py), (px + 14, py - 18), (px + 18, py - 33)], 125, 1)
    return np.asarray(im.filter(ImageFilter.GaussianBlur(.5)), dtype=np.float32) / 255


def stone(seed, masonry=False):
    rng = random.Random(seed)
    n = noise(seed)
    fine = noise(seed + 1, (96, 192, 256), (.5, .2, .08))
    h = .56 + n * .17 + fine * .06
    joints = mask()
    stones = mask()
    jd, sd = ImageDraw.Draw(joints), ImageDraw.Draw(stones)
    if masonry:
        for row in range(4):
            y = row * 128
            jd.line([(0, y), (512, y + rng.randrange(-3, 4))], fill=245, width=9)
            offset = 0 if row % 2 == 0 else 112
            for x in range(-256 + offset, 768, 256):
                xx = x + rng.randrange(-17, 18)
                jd.line([(xx, y), (xx + rng.randrange(-7, 8), y + 128)], fill=245, width=8)
                shade = rng.randrange(88, 173)
                sd.rectangle((xx + 5, y + 5, xx + 250, y + 122), fill=shade)
    else:
        # A single broad worn slab; the model supplies the floor's real joints.
        sd.rectangle((0, 0, 512, 512), fill=130)
        for side in range(4):
            pts = [(v, rng.uniform(0, 2)) for v in range(0, 513, 16)]
            if side == 1:
                pts = [(512 - y, x) for x, y in pts]
            elif side == 2:
                pts = [(x, 512 - y) for x, y in pts]
            elif side == 3:
                pts = [(y, x) for x, y in pts]
            jd.line(pts, fill=125, width=4)
    # Uneven broken edges, not a perfectly clean vector grid.
    edge = np.asarray(joints.filter(ImageFilter.GaussianBlur(2.0)), dtype=np.float32) / 255
    variation = (np.asarray(stones.filter(ImageFilter.GaussianBlur(2)), dtype=np.float32) - 128) / 255
    crack = cracks(seed + 3, 9 if masonry else 4)
    chips = mask()
    cd = ImageDraw.Draw(chips)
    for _ in range(370):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        w, hh = rng.randrange(1, 5), rng.randrange(1, 4)
        cd.polygon([(x, y), (x + w, y - 1), (x + w - 1, y + hh)], fill=rng.randrange(20, 120))
    pitting = np.asarray(chips.filter(ImageFilter.GaussianBlur(.45)), dtype=np.float32) / 255
    h -= edge * .18 + crack * .085 + pitting * .055
    h += variation * .05
    base = 174 + n * 54 + variation * 34 - edge * 82 - crack * 76 - pitting * 42
    warm = noise(seed + 4, (4, 12, 32), (1, .4, .2))
    albedo = np.stack((base + warm * 12, base + warm * 5, base - warm * 8), axis=2)
    rough = .83 + n * .11 + edge * .14 - pitting * .03
    return albedo, h, rough


def metal():
    n, oxidation = noise(901), noise(902, (8, 24, 64), (1, .5, .2))
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    hammered = np.sin(x * .49 + np.sin(y * .21) * 2) * np.sin(y * .52 + np.sin(x * .17))
    h = .5 + n * .08 + hammered * .002
    scratches = mask()
    d = ImageDraw.Draw(scratches)
    rng = random.Random(903)
    for _ in range(210):
        xx, yy = rng.randrange(SIZE), rng.randrange(SIZE)
        draw_wrapped(d, [(xx, yy), (xx + rng.randrange(-4, 5), yy + rng.randrange(5, 48))], rng.randrange(20, 130), 1)
    s = np.asarray(scratches.filter(ImageFilter.GaussianBlur(.45)), dtype=np.float32) / 255
    rust = np.clip((oxidation - .04) * 2.8, 0, .7)
    base = 185 + n * 52 - s * 55
    albedo = np.stack((base - rust * 34, base - rust * 62, base - rust * 88), axis=2)
    return albedo, h - s * .025, .42 + rust * .6 + s * .15 + n * .12


def cloth():
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    n = noise(1201)
    warp = .5 + .5 * np.cos(x * math.tau / 4)
    weft = .5 + .5 * np.cos(y * math.tau / 4)
    weave = (warp + weft) / 2
    # Woven diamond damask, visible in close hero shots without colored branding.
    diamond = np.abs((x / 64) % 2 - 1) + np.abs((y / 64) % 2 - 1)
    pattern = np.exp(-((diamond - 1) * 12) ** 2)
    h = .5 + weave * .011 + n * .027 + pattern * .008
    base = 174 + weave * 22 + n * 36 + pattern * 20
    return np.stack((base * 1.02, base, base * .985), axis=2), h, np.clip(.94 + n * .05, 0, 1)


def runestone():
    albedo, h, rough = stone(1701)
    carved = mask()
    d = ImageDraw.Draw(carved)
    # Original geometric covenant sigil, not taken from an existing alphabet.
    d.ellipse((49, 49, 463, 463), outline=235, width=5)
    d.ellipse((66, 66, 446, 446), outline=190, width=2)
    d.polygon([(256, 115), (351, 277), (256, 401), (161, 277)], outline=235, width=5)
    d.line([(256, 115), (256, 401)], fill=235, width=5)
    d.line([(161, 277), (351, 277)], fill=235, width=5)
    d.ellipse((230, 225, 282, 277), outline=235, width=4)
    for i in range(12):
        a = i * math.tau / 12
        def pt(radius, tangent=0):
            return (256 + math.sin(a) * radius + math.cos(a) * tangent,
                    256 - math.cos(a) * radius + math.sin(a) * tangent)
        d.line([pt(167), pt(190)], fill=220, width=4)
        d.line([pt(176), pt(185, 8 if i % 2 else -8)], fill=220, width=3)
        if i % 3 == 0:
            d.line([pt(176), pt(168, -7)], fill=220, width=3)
    groove = np.asarray(carved.filter(ImageFilter.GaussianBlur(.8)), dtype=np.float32) / 255
    h -= groove * .11
    albedo -= groove[:, :, None] * np.array([80, 70, 55])
    rough += groove * .08
    return albedo, h, rough


def save(name, maps):
    albedo, height, roughness = maps
    # OpenGL tangent normals: +Y follows increasing texture V (opposite image rows).
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 10
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 10
    normal = np.stack((-dx, dy, np.ones_like(dx)), axis=2)
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    arrays = {
        'albedo': np.clip(albedo, 0, 255).astype(np.uint8),
        'normal': ((normal * .5 + .5) * 255).astype(np.uint8),
        'roughness': (np.clip(roughness, 0, 1) * 255).astype(np.uint8),
    }
    result = {}
    for role, array in arrays.items():
        filename = f'{name}-{role}.webp'
        image = Image.fromarray(array)
        image.save(OUT / filename, 'WEBP', lossless=role != 'albedo', quality=87, method=6)
        data = (OUT / filename).read_bytes()
        result[role] = {'url': f'assets/textures/{filename}', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    return {'width': SIZE, 'height': SIZE, 'maps': result}


surfaces = {
    'flagstone': save('flagstone', stone(401)),
    'masonry': save('masonry', stone(601, masonry=True)),
    'metal': save('metal', metal()),
    'cloth': save('cloth', cloth()),
    'runestone': save('runestone', runestone()),
}
manifest = {'version': 1, 'authoring': 'Original deterministic mathematical artwork for Runic Depths',
            'generator': 'scripts/build-surface-assets.py', 'resolution': SIZE,
            'normalConvention': 'OpenGL tangent space +Y', 'surfaces': surfaces}
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
total = sum(m['bytes'] for s in surfaces.values() for m in s['maps'].values())
assert total < 3 * 1024 * 1024, f'Texture budget exceeded: {total}'
print(f'Authored {len(surfaces)} PBR surfaces, {len(surfaces) * 3} maps, {total / 1024:.1f} KiB')
