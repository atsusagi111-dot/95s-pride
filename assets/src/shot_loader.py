"""Capture loader frames every 0.3s (dev check only)."""
import os, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
URL = "file:///" + os.path.join(ROOT, "index.html").replace("\\", "/")
OUT = sys.argv[1]
from PIL import Image

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    page = b.new_page(viewport={"width": 960, "height": 600})
    page.goto(URL)
    frames = []
    t0 = time.time()
    while time.time() - t0 < 4.6:
        f = os.path.join(OUT, f"f{len(frames):02d}.png")
        page.screenshot(path=f); frames.append(f)
        time.sleep(0.25)
    b.close()

ims = [Image.open(f).resize((320, 200)) for f in frames]
cols = 5
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * 320, rows * 200), "black")
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * 320, (i // cols) * 200))
sheet.save(os.path.join(OUT, "loader_sheet.png"))
print(len(frames))
