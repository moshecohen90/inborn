#!/usr/bin/env python3
# usage: frames.py <png>...; below the status bar: mean luminance and share of pixels brighter than 60. A black frame is 0.0 / 0 %.
import sys, os
from PIL import Image
for p in sys.argv[1:]:
    if not os.path.exists(p): print(f"{os.path.basename(p)}: MISSING"); continue
    im = Image.open(p).convert('L'); w, h = im.size
    im = im.crop((0, int(h * 0.08), w, h))
    hist = im.histogram(); n = sum(hist)
    mean = sum(i * c for i, c in enumerate(hist)) / n
    bright = sum(hist[61:]) / n
    print(f"{os.path.basename(p)}: mean {mean:.1f}, {bright*100:.2f} % brighter than 60 -> {'RENDERED' if mean > 5 and bright > 0.01 else 'BLACK or empty'}")
