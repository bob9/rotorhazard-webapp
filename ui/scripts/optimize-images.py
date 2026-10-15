"""Converts generated artwork in art/ to compact WebP files in public/img/.

Timers are often reached over slow Wi-Fi, so images are resized and compressed.
Requires Pillow (pip install pillow).
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(HERE, 'art')
OUT = os.path.join(HERE, 'public', 'img')
MAX_WIDTH = {'welcome': 2000, 'results-hero': 2000}

for name in sorted(os.listdir(SRC)):
    base, _ = os.path.splitext(name)
    img = Image.open(os.path.join(SRC, name)).convert('RGB')
    width = MAX_WIDTH.get(base, 900)
    if img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    dest = os.path.join(OUT, base + '.webp')
    img.save(dest, 'WEBP', quality=78, method=6)
    print(f'{dest}: {img.width}x{img.height}, {os.path.getsize(dest) // 1024} KB')
