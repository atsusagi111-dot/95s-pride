"""Screenshot index.html at desktop / tablet / mobile widths (dev check only)."""
import os, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
URL = "file:///" + os.path.join(ROOT, "index.html").replace("\\", "/")
OUT = sys.argv[1]

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    for name, w, h in [("pc", 1366, 900), ("tab", 900, 1000), ("sp", 390, 844)]:
        page = b.new_page(viewport={"width": w, "height": h})
        page.goto(URL)
        # loader frames
        if name == "pc":
            time.sleep(1.2); page.screenshot(path=os.path.join(OUT, "load1.png"))
            time.sleep(1.8); page.screenshot(path=os.path.join(OUT, "load2.png"))
        time.sleep(4.5)
        page.evaluate("document.querySelectorAll('.reveal').forEach(e=>e.classList.add('is-visible'))")
        time.sleep(0.5)
        page.screenshot(path=os.path.join(OUT, f"{name}.png"), full_page=True)
        page.close()
    b.close()
print("ok")
