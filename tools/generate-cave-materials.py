"""Deterministic, seamless chapter-two albedo / packed normal-roughness / height.

Requires Python, numpy and Pillow. Generated assets are original and CC0.
Run from any directory; no network or original hospital textures are used.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / 'public' / 'tex' / 'cave'
SIZE = 512
MATERIALS = [
    ('basalt', 'rock', (68, 76, 77), .95),
    ('limestone', 'rock', (155, 147, 118), .88),
    ('shale', 'strata', (82, 91, 92), .92),
    ('calcite', 'vein', (191, 183, 153), .46),
    ('wetrock', 'rock', (54, 70, 68), .27),
    ('flowstone', 'strata', (140, 115, 82), .52),
    ('breccia', 'rock', (113, 88, 69), .9),
    ('salt', 'vein', (195, 200, 185), .64),
    ('clay', 'mud', (101, 71, 50), .7),
    ('silt', 'mud', (87, 91, 77), .48),
    ('gravel', 'gravel', (110, 109, 100), .94),
    ('algae', 'mud', (47, 77, 54), .35),
    ('ceramic', 'tile', (150, 174, 161), .68),
    ('ochretile', 'tile', (172, 145, 90), .73),
    ('porcelain', 'vein', (198, 196, 166), .32),
    ('copper', 'metal', (92, 138, 113), .62),
    ('corroded', 'metal', (126, 70, 40), .86),
    ('enamel', 'metal', (173, 188, 166), .58),
    ('mesh', 'grid', (97, 105, 101), .82),
    ('cable', 'strata', (48, 48, 42), .65),
    ('gauze', 'fabric', (170, 156, 121), .97),
    ('canvas', 'fabric', (112, 126, 111), .91),
    ('sediment', 'strata', (156, 124, 87), .9),
    ('fossil', 'vein', (130, 135, 119), .82),
]

def noise(rng, cells):
    # Periodic bilinear sampling prevents seams, including at coarse octaves.
    grid = rng.random((cells, cells))
    p = np.arange(SIZE) * cells / SIZE
    i = np.floor(p).astype(int)
    t = p - i
    t = t * t * (3 - 2 * t)
    a = grid[i[:, None], i[None, :]]
    b = grid[(i[:, None] + 1) % cells, i[None, :]]
    c = grid[i[:, None], (i[None, :] + 1) % cells]
    d = grid[(i[:, None] + 1) % cells, (i[None, :] + 1) % cells]
    return (a * (1-t[:, None]) + b*t[:, None]) * (1-t[None, :]) + (c*(1-t[:, None]) + d*t[:, None])*t[None, :]

def generate(index, name, kind, color, roughness):
    rng = np.random.default_rng(1987 + index * 97)
    y, x = np.mgrid[0:SIZE, 0:SIZE] / SIZE
    broad, mid, fine = noise(rng, 4), noise(rng, 16), noise(rng, 64)
    h = broad*.42 + mid*.36 + fine*.16 + noise(rng, 128)*.06
    veins = np.exp(-np.abs(np.sin((x*6 + y*4 + mid*.45)*np.pi))*27)
    if kind == 'rock':
        h = np.clip(h*1.5 - veins*.24, 0, 1)
    elif kind == 'strata':
        h = h*.62 + np.sin((y*28 + broad*.8)*np.pi)*.12 + veins*.12
    elif kind == 'vein':
        h = h*.7 + veins*.3
    elif kind == 'mud':
        h = h*.6 - veins*.16
    elif kind == 'gravel':
        h = np.abs(fine-.5)*1.4 + mid*.3
    elif kind == 'tile':
        seam = ((x*8 % 1 < .055) | (y*8 % 1 < .055)).astype(float)
        h = h*.3 + .5 - seam*.42 - veins*.12
    elif kind == 'metal':
        h = h*.45 + .3 + (mid>.58)*.16 - veins*.1
    elif kind == 'grid':
        seam = ((x*24 % 1 < .22) | (y*24 % 1 < .22)).astype(float)
        h = seam*.6 + h*.3
    elif kind == 'fabric':
        h = h*.45 + np.sin(x*np.pi*256)*np.sin(y*np.pi*256)*.09 + .25
    h = np.clip(h, 0, 1)
    shade = .6 + h*.7 + (fine-.5)*.18
    rgb = np.array(color)[None, None, :] * shade[:, :, None]
    if kind in ('metal', 'tile'):
        rust = np.clip((broad + mid - 1.1)*3, 0, .85)
        rgb = rgb*(1-rust[:, :, None]) + np.array([84, 49, 26])*rust[:, :, None]
    gy, gx = (np.roll(h, -1, axis=a)-np.roll(h, 1, axis=a) for a in (0, 1))
    normal = np.dstack((-gx*12, -gy*12, np.ones_like(h)))
    normal /= np.linalg.norm(normal, axis=2)[:, :, None]
    packed = np.dstack((normal[:, :, :2]*.5+.5, np.clip(roughness + (fine-.5)*.15, .05, 1)))
    Image.fromarray(np.uint8(np.clip(rgb, 0, 255))).save(ROOT / f'{name}_c.jpg', quality=91)
    Image.fromarray(np.uint8(packed*255)).save(ROOT / f'{name}_n.jpg', quality=94)
    Image.fromarray(np.uint8(h*255)).save(ROOT / f'{name}_h.jpg', quality=93)

if __name__ == '__main__':
    ROOT.mkdir(parents=True, exist_ok=True)
    for i, spec in enumerate(MATERIALS):
        generate(i, *spec)
    (ROOT / 'manifest.json').write_text(json.dumps({'license': 'CC0-1.0', 'generator': 'tools/generate-cave-materials.py', 'resolution': SIZE, 'materials': [m[0] for m in MATERIALS]}, indent=2) + '\n')
    print(f'Generated {len(MATERIALS)} materials / {len(MATERIALS)*3} maps in {ROOT}')
