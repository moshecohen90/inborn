# Builds the two degraded fixtures: a letter page photographed at an angle, and a blurred noisy copy of the clean receipt.
import random, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
out = sys.argv[1]
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Times New Roman.ttf", 34)
bold = ImageFont.truetype("/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf", 40)
page = Image.new("RGB", (1240, 1600), (246, 244, 238))
d = ImageDraw.Draw(page)
lines = ["Riverside Tenants Association", "", "14 March 2026", "", "Dear neighbours,", "",
  "The spring building meeting will take place on", "Thursday 9 April at 7:30 pm in the ground-floor",
  "laundry room. We will vote on the new bicycle", "storage and on raising the garden fund from", "15 to 20 euros per flat per year.", "",
  "Please bring your own chair. Children are welcome.", "", "With kind regards,", "Helena Brandt, secretary"]
y = 120
for i, l in enumerate(lines):
    d.text((110, y), l, font=bold if i == 0 else font, fill=(30, 30, 30)); y += 62
def coeffs(src, dst):
    import numpy as np
    A = []; B = []
    for (x, y), (u, v) in zip(dst, src):
        A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]; B += [u, v]
    return list(np.linalg.solve(np.array(A, float), np.array(B, float)))
W, H = 1600, 1200
bg = Image.new("RGB", (W, H), (120, 92, 64))
dst = [(330, 90), (1330, 210), (1240, 1130), (180, 1010)]
warped = page.transform((W, H), Image.PERSPECTIVE, coeffs([(0, 0), (1240, 0), (1240, 1600), (0, 1600)], dst), Image.BICUBIC)
mask = Image.new("L", page.size, 255).transform((W, H), Image.PERSPECTIVE, coeffs([(0, 0), (1240, 0), (1240, 1600), (0, 1600)], dst), Image.BICUBIC)
bg.paste(warped, (0, 0), mask)
bg = bg.filter(ImageFilter.GaussianBlur(1.6))
random.seed(7); px = bg.load()
for _ in range(120000):
    x, y = random.randrange(W), random.randrange(H); n = random.randint(-28, 28)
    r, g, b = px[x, y]; px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
bg.thumbnail((1024, 1024)); bg.save(f"{out}/letter-at-angle.jpg", quality=80)
r = Image.open(f"{out}/photo-receipt.png").convert("RGB").rotate(-9, expand=False, fillcolor=(90, 60, 40)).filter(ImageFilter.GaussianBlur(2.2))
r.thumbnail((1024, 1024)); r.save(f"{out}/receipt-blurred.jpg", quality=55)
