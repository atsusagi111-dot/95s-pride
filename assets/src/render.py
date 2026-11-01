"""Render logo.svg -> logo.png (2000px, transparent) and build a comparison image.
Usage: python render.py <comparison-output.png>
"""
import os
import sys

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.dirname(HERE)
SVG = os.path.join(ASSETS, "logo.svg")
PNG = os.path.join(ASSETS, "logo.png")

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    page = b.new_page(viewport={"width": 2000, "height": 2000})
    page.goto("file:///" + SVG.replace("\\", "/"))
    page.screenshot(path=PNG, omit_background=True)
    b.close()

# viewBox is (CX-R-pad, CY-R-pad, 2(R+pad)) -> screenshot px mapping
CX, CY, R = 499, 988, 842 + 12
side = 2 * R
logo = Image.open(PNG).convert("RGBA").resize((side, side), Image.LANCZOS)
shot = Image.open(os.path.join(ASSETS, "logo_screenshot.jpg")).convert("RGBA")
ox, oy = CX - R, CY - R  # screenshot coords of logo's top-left

aligned = Image.new("RGBA", shot.size, (216, 216, 216, 255))
aligned.paste(logo, (ox, oy), logo)
overlay = Image.blend(shot, aligned, 0.5)

full = Image.new("RGBA", logo.size, (216, 216, 216, 255))
full.alpha_composite(logo)
full = full.resize((int(side * shot.height / side * 0.6), int(shot.height * 0.6)))

W = shot.width
out = Image.new("RGB", (W * 3 + full.width + 60, shot.height + 60), "white")
d = ImageDraw.Draw(out)
for i, (im, label) in enumerate([(shot, "screenshot"), (aligned, "SVG (same crop)"), (overlay, "overlay 50%")]):
    out.paste(im.convert("RGB"), (i * (W + 20), 60))
    d.text((i * (W + 20) + 10, 20), label, fill="black")
out.paste(full.convert("RGB"), (3 * (W + 20), 60))
d.text((3 * (W + 20) + 10, 20), "SVG full badge", fill="black")
out.save(sys.argv[1])
print("ok", PNG)
