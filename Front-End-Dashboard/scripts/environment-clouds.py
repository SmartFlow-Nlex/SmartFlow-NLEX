"""Procedural cumulus sprites for the NLEX environment (no source images; seeded, repeatable).

A cloud is a heap of spheres on a flat base. Its surface is the union of the
sphere caps (max over sqrt(r^2 - d^2)), which gives the cauliflower crown; the
surface normal lights it from the upper left with a soft wrap, crevices between
puffs get a little occlusion, the underside cools to blue-grey, and the edge
thins to translucent. Written as RGBA WebP into the output folder.
Usage: python clouds.py <out_dir>
"""
import math
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

OUT = sys.argv[1]


def cloud(seed, w, h, n_main, n_small):
    rng = np.random.default_rng(seed)
    ss = 2
    W, H = w * ss, h * ss
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    base = H * 0.80
    spheres = []
    # Main puffs along a dome, leaving a margin so nothing touches the edges.
    for i in range(n_main):
        t = (i + rng.uniform(-0.25, 0.25)) / max(n_main - 1, 1)
        t = min(max(t, 0.0), 1.0)
        dome = math.sin(math.pi * (0.08 + 0.84 * t))
        r = H * (0.13 + 0.22 * dome) * rng.uniform(0.85, 1.1)
        cx = W * (0.14 + 0.72 * t)
        cy = base - r * (0.25 + 0.75 * dome) * rng.uniform(0.75, 1.0)
        spheres.append((cx, cy, r))
    # Crown puffs on top of the main ones.
    for _ in range(n_small):
        px, py, pr = spheres[rng.integers(1, len(spheres) - 1)]
        ang = rng.uniform(math.pi * 1.1, math.pi * 1.9)
        r = pr * rng.uniform(0.35, 0.6)
        cx = px + math.cos(ang) * pr * 0.7
        cy = py + math.sin(ang) * pr * 0.7
        spheres.append((cx, cy, r))
    top_needed = min(cy - r for cx, cy, r in spheres)
    # Shift down if the crown would leave the canvas.
    shift = max(0.0, H * 0.06 - top_needed)
    hmap = np.full((H, W), -1.0, np.float32)
    for cx, cy, r in spheres:
        d2 = (xx - cx) ** 2 + (yy - (cy + shift)) ** 2
        cap = np.sqrt(np.clip(r * r - d2, 0, None))
        cap[d2 > r * r] = -1.0
        hmap = np.maximum(hmap, cap)
    inside = hmap > 0
    # Flat underside: cut at the base, softly.
    base_s = base + shift
    under = np.clip((yy - (base_s - H * 0.05)) / (H * 0.11), 0, 1)
    under = under * under * (3 - 2 * under)
    hpos = np.where(inside, hmap, 0).astype(np.float32)
    # Normals from a well-smoothed surface, so puffs meet in soft valleys, not creases.
    hs = gaussian_filter(hpos, 7 * ss)
    gy, gx = np.gradient(hs)
    nz = np.full_like(hs, 1.0)
    nlen = np.sqrt(gx * gx + gy * gy + nz * nz)
    nxn, nyn, nzn = -gx / nlen, -gy / nlen, nz / nlen
    L = np.array([-0.45, -0.62, 0.64])
    L /= np.linalg.norm(L)
    lam = nxn * L[0] + nyn * L[1] + nzn * L[2]
    wrap = np.clip((lam + 0.35) / 1.35, 0, 1)
    # Occlusion: low points in a high neighbourhood are crevices.
    occ = np.clip((gaussian_filter(hpos, 14 * ss) - hs) / (H * 0.08), 0, 1)
    vert = np.clip((base_s - yy) / (H * 0.7), 0, 1)
    tone = 0.5 + 0.42 * wrap + 0.18 * vert - 0.22 * occ
    tone = np.clip(tone, 0, 1)
    top = np.array([255, 255, 255], np.float32)
    shadow = np.array([196, 214, 238], np.float32)
    rgb = shadow + (top - shadow) * tone[..., None]
    # Alpha: solid in the body, thinning toward the rim, gone below the base.
    thick = np.clip(hpos / (H * 0.12), 0, 1)
    thick = thick * thick * (3 - 2 * thick)
    alpha = thick * (1 - under)
    alpha = gaussian_filter(alpha, 3.2 * ss)
    alpha = np.clip(alpha * 1.05, 0, 1) * 0.97
    img = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(img, "RGBA").resize((w, h), Image.LANCZOS)


SPECS = [
    ("cloud-a", 11, 900, 380, 7, 9),
    ("cloud-b", 23, 720, 320, 6, 7),
    ("cloud-c", 37, 560, 260, 5, 6),
    ("cloud-d", 41, 1100, 420, 9, 12),
    ("cloud-e", 58, 440, 200, 5, 4),
]
for name, seed, w, h, n_main, n_small in SPECS:
    im = cloud(seed, w, h, n_main, n_small)
    bbox = im.getchannel("A").point(lambda a: 255 if a > 3 else 0).getbbox()
    if bbox:
        l, t, r, b = bbox
        im = im.crop((max(0, l - 10), max(0, t - 10), min(im.width, r + 10), min(im.height, b + 10)))
    im.save(f"{OUT}/{name}.webp", "WEBP", quality=90, method=6)
    print(name, im.size)
