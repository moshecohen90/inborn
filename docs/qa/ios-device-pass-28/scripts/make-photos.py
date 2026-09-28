#!/usr/bin/env python3
"""Writes pass 28's three photos (J3): a shop receipt on a table, a street sign on a pole, and a phone screenshot of a
short paragraph. Deterministic (seeded), so a rerun writes the same pixels. Usage: make-photos.py <out dir>"""
import math, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

out = sys.argv[1]
rnd = random.Random(28)
MONO = "/System/Library/Fonts/Menlo.ttc"
SANS = "/System/Library/Fonts/Helvetica.ttc"
SF = "/System/Library/Fonts/SFNS.ttf"

def font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except OSError:
        return ImageFont.truetype(SANS, size)

def grain(img, amount):
    """Sensor noise, mild enough to keep the PNG small."""
    w, h = img.size
    noise = Image.effect_noise((w, h), amount).convert("L")
    return Image.blend(img, Image.merge("RGB", (noise, noise, noise)), 0.06)

# 1. receipt: thermal paper, slightly rotated, on a wooden table, soft shadow
W, H = 1080, 1440
table = Image.new("RGB", (W, H), (120, 84, 52))
d = ImageDraw.Draw(table)
for y in range(0, H, 6):
    c = 110 + int(14 * math.sin(y / 23.0) + rnd.randint(-6, 6))
    d.line([(0, y), (W, y + rnd.randint(-3, 3))], fill=(c + 20, int(c * 0.72), int(c * 0.45)), width=6)
paper = Image.new("RGB", (620, 1180), (246, 244, 236))
pd = ImageDraw.Draw(paper)
f_head, f_body, f_small = font(MONO, 40, 1), font(MONO, 30), font(MONO, 24)
y = 50
for line, f in (("GREENLEAF MARKET", f_head), ("12 Harbour Road", f_small), ("Tel 555-0199", f_small)):
    tw = pd.textlength(line, font=f); pd.text(((620 - tw) / 2, y), line, fill=(40, 40, 40), font=f); y += f.size + 14
y += 10; pd.text((40, y), "28/09/2026  10:42   #4417", fill=(60, 60, 60), font=f_small); y += 50
pd.line([(40, y), (580, y)], fill=(90, 90, 90), width=2); y += 26
items = [("Oat milk 1L", "2.49"), ("Sourdough bread", "3.80"), ("Bananas 1kg", "1.65"), ("Cheddar 200g", "4.20"), ("Orange juice", "2.95")]
for name, price in items:
    pd.text((40, y), name, fill=(35, 35, 35), font=f_body)
    tw = pd.textlength(price, font=f_body); pd.text((580 - tw, y), price, fill=(35, 35, 35), font=f_body); y += 52
pd.line([(40, y), (580, y)], fill=(90, 90, 90), width=2); y += 26
pd.text((40, y), "TOTAL", fill=(20, 20, 20), font=f_head); tw = pd.textlength("15.09", font=f_head); pd.text((580 - tw, y), "15.09", fill=(20, 20, 20), font=f_head); y += 70
pd.text((40, y), "CARD", fill=(60, 60, 60), font=f_body); tw = pd.textlength("15.09", font=f_body); pd.text((580 - tw, y), "15.09", fill=(60, 60, 60), font=f_body); y += 80
line = "THANK YOU FOR SHOPPING"; tw = pd.textlength(line, font=f_small); pd.text(((620 - tw) / 2, y), line, fill=(60, 60, 60), font=f_small)
for x in range(0, 620, 20):  # torn bottom edge
    pd.polygon([(x, 1180), (x + 10, 1166 + rnd.randint(-4, 4)), (x + 20, 1180)], fill=(120, 84, 52))
paper = paper.rotate(-4, expand=True, fillcolor=(0, 0, 0, 0), resample=Image.BICUBIC)
mask = paper.convert("L").point(lambda v: 255 if v > 8 else 0)
shadow = Image.new("RGB", paper.size, (40, 28, 18))
px, py = (W - paper.size[0]) // 2, (H - paper.size[1]) // 2
table.paste(shadow, (px + 14, py + 18), mask.filter(ImageFilter.GaussianBlur(12)))
table.paste(paper, (px, py), mask)
light = Image.new("L", (W, H)); ld = ImageDraw.Draw(light)
for r in range(0, 900, 10): ld.ellipse([W * 0.45 - r, H * 0.35 - r, W * 0.45 + r, H * 0.35 + r], outline=max(0, 60 - r // 15))
table = Image.composite(Image.new("RGB", (W, H), (255, 250, 235)), table, light.filter(ImageFilter.GaussianBlur(40)).point(lambda v: v // 3))
grain(table, 40).filter(ImageFilter.GaussianBlur(0.6)).save(f"{out}/photo-receipt.png", optimize=True)

# 2. street sign: green blade "Cedar Avenue" with a left arrow, on a pole, sky and a building behind
W, H = 1080, 1440
img = Image.new("RGB", (W, H))
d = ImageDraw.Draw(img)
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=(int(120 + 90 * t), int(170 + 60 * t), int(225 + 20 * t)))
d.rectangle([0, 900, 380, H], fill=(176, 150, 124))
for yy in range(930, H, 90):
    for xx in range(30, 360, 110): d.rectangle([xx, yy, xx + 70, yy + 55], fill=(90, 110, 130))
d.rectangle([700, 760, 1080, H], fill=(150, 146, 140))
d.rectangle([0, 1330, W, H], fill=(96, 96, 98))
img = img.filter(ImageFilter.GaussianBlur(6))
d = ImageDraw.Draw(img)
d.rectangle([520, 380, 548, H], fill=(128, 132, 136)); d.rectangle([524, 380, 530, H], fill=(170, 174, 178))
blade = Image.new("RGBA", (940, 230), (0, 0, 0, 0)); bd = ImageDraw.Draw(blade)
bd.rounded_rectangle([0, 0, 939, 229], radius=22, fill=(18, 110, 60)); bd.rounded_rectangle([10, 10, 929, 219], radius=16, outline=(245, 245, 245), width=6)
bd.polygon([(40, 115), (130, 50), (130, 90), (200, 90), (200, 140), (130, 140), (130, 180)], fill=(250, 250, 250))
f_sign = font(SANS, 96, 1)
bd.text((240, 62), "Cedar Avenue", fill=(250, 250, 250), font=f_sign)
blade = blade.rotate(2, expand=True, resample=Image.BICUBIC)
img.paste(blade, (70, 260), blade)
img = grain(img, 30)
img.save(f"{out}/photo-street-sign.png", optimize=True)

# 3. screenshot of a short paragraph: a phone notes screen with a status bar
W, H = 1170, 1500
img = Image.new("RGB", (W, H), (255, 255, 255)); d = ImageDraw.Draw(img)
f_status, f_title, f_body, f_meta = font(SF, 44), font(SF, 70), font(SF, 50), font(SF, 36)
d.text((90, 40), "9:41", fill=(0, 0, 0), font=f_status)
d.rounded_rectangle([1000, 50, 1080, 88], radius=10, outline=(0, 0, 0), width=3); d.rectangle([1006, 56, 1060, 82], fill=(0, 0, 0))
d.text((60, 150), "< Notes", fill=(230, 160, 0), font=f_status)
d.text((60, 260), "Pool update", fill=(0, 0, 0), font=f_title)
d.text((60, 360), "28 September 2026 at 09:12", fill=(140, 140, 140), font=f_meta)
para = ("The community pool opens at 7 a.m. on weekdays and at 9 a.m. on weekends. Swimming lessons for "
        "children start on 3 October. The pool is closed every Monday for cleaning.")
words, lines, cur = para.split(), [], ""
for w in words:
    nxt = (cur + " " + w).strip()
    if d.textlength(nxt, font=f_body) > W - 120: lines.append(cur); cur = w
    else: cur = nxt
lines.append(cur)
y = 450
for ln in lines: d.text((60, y), ln, fill=(20, 20, 20), font=f_body); y += 70
img.save(f"{out}/photo-text-screenshot.png", optimize=True)
print("wrote", out)
