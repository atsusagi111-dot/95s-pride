"""95s PRIDE のロゴ(assets/logo.svg, assets/logo-mark.svg)を生成する。

座標は元画像 logo_screenshot.jpg(999x1639)のピクセル座標に合わせてあり、重ねて比較できる。
使い方: python tools/logo/gen_logo.py
"""
import math
import os

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.abspath(os.path.join(HERE, "..", "..", "assets"))

CX, CY = 499, 988          # badge centre
R_OUT, R_IN = 842, 645     # green ring radii

C_RING = "#2E6B5A"
C_RING_DASH = "#5C9A84"
C_WORD = "#1D4F47"
C_TAG = "#263A38"
C_GOLD_SQ = "#CDA962"
C_GREEN_SQ = "#2F7560"
GAP = 5                    # white cut-out between overlapping bands

# ---------------------------------------------------------------- font ----
font = TTFont(os.path.join(HERE, "fonts", "Montserrat-wght.ttf"))
cmap = font.getBestCmap()
UPM = font["head"].unitsPerEm


def glyph_path(ch, wght, size, x, y, rot=None):
    """SVG path data for one glyph; (x, y) = left baseline. Returns (d, advance)."""
    gs = font.getGlyphSet(location={"wght": wght})
    g = gs[cmap[ord(ch)]]
    s = size / UPM
    pen = SVGPathPen(gs)
    g.draw(TransformPen(pen, (s, 0, 0, -s, x, y)))
    return pen.getCommands(), g.width * s


def advance(ch, wght, size):
    gs = font.getGlyphSet(location={"wght": wght})
    return gs[cmap[ord(ch)]].width * size / UPM


def text_line(text, wght, size, x0, x1, baseline, fill):
    """Lay text out so its advance box spans x0..x1 (tracking adjusted)."""
    adv = [advance(c, wght, size) for c in text]
    track = (x1 - x0 - sum(adv)) / (len(text) - 1)
    x, parts = x0, []
    for c, a in zip(text, adv):
        if c != " ":
            d, _ = glyph_path(c, wght, size, x, baseline)
            parts.append(d)
        x += a + track
    return f'<path fill="{fill}" d="{" ".join(parts)}"/>'


def text_arc(text, wght, size, radius, a0, a1, fill):
    """Text on an arc (clockwise, reading upright on top of the circle)."""
    adv = [advance(c, wght, size) for c in text]
    span = math.radians(a1 - a0) * radius
    track = (span - sum(adv)) / (len(text) - 1)
    s, out = 0.0, []
    for c, a in zip(text, adv):
        mid = s + a / 2
        ang = a0 + math.degrees(mid / radius)
        if c != " ":
            d, _ = glyph_path(c, wght, size, -a / 2, 0)
            out.append(
                f'<path transform="translate({CX} {CY}) rotate({ang + 90:.3f}) '
                f'translate(0 {-radius})" d="{d}"/>'
            )
        s += a + track
    return f'<g fill="{fill}">' + "".join(out) + "</g>"


# ------------------------------------------------------------- shapes ----
def K(x, y):
    return (x, y, True)


def S(x, y):
    return (x, y, False)


def outline(pts, t=0.5):
    """Closed Catmull-Rom outline; K points are sharp corners."""
    n = len(pts)
    d = f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        if p1[2]:
            t1 = (0, 0)
        else:
            t1 = ((p2[0] - p0[0]) * t / 3, (p2[1] - p0[1]) * t / 3)
        if p2[2]:
            t2 = (0, 0)
        else:
            t2 = ((p3[0] - p1[0]) * t / 3, (p3[1] - p1[1]) * t / 3)
        d += (f" C{p1[0] + t1[0]:.1f},{p1[1] + t1[1]:.1f}"
              f" {p2[0] - t2[0]:.1f},{p2[1] - t2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}")
    return d + "Z"


def poly(*xy):
    return outline([K(x, y) for x, y in xy])


def shape(d, fill, gap=True):
    g = f' stroke="#fff" stroke-width="{GAP * 2}" stroke-linejoin="round" paint-order="stroke"' if gap else ""
    return f'<path d="{d}" fill="{fill}"{g}/>'


GR, GR2, GD, GD2 = "url(#g1)", "url(#g2)", "url(#d1)", "url(#d2)"

MARK = [
    # --- "9" -------------------------------------------------------------
    # big gold lower swoosh rising to the right
    shape(outline([K(58, 735), S(88, 845), S(170, 932), S(280, 977), S(385, 955),
                   S(475, 880), K(585, 690), S(515, 760), S(430, 862), S(345, 918),
                   S(258, 928), S(168, 890), S(108, 820)]), GD),
    # two gold slanted stripes (bottom-left)
    shape(poly((62, 1182), (108, 1182), (238, 995), (192, 1008)), GD2),
    shape(poly((146, 1182), (198, 1182), (350, 966), (296, 980)), GD),
    # thin green swoosh bottom-left with gold lining
    shape(outline([K(-8, 1100), S(90, 1078), S(172, 1034), K(232, 988), S(160, 1008),
                   S(80, 1048)]), GR),
    shape(outline([K(8, 1082), S(100, 1048), K(214, 992), S(110, 1032)]), GD, gap=False),
    # outer green crescent of the 9
    shape(outline([K(356, 556), S(245, 585), S(150, 650), S(100, 742), S(122, 832),
                   S(205, 897), S(292, 905), K(338, 860), S(262, 876), S(186, 838),
                   S(142, 760), S(160, 670), S(232, 612)]), GR),
    # inner green arc
    shape(outline([K(395, 592), S(300, 562), S(222, 590), S(172, 660), S(166, 760),
                   K(208, 846), S(196, 760), S(202, 672), S(248, 614), S(312, 594)]), GR2),
    # gold inner bands
    shape(outline([K(204, 668), S(236, 620), S(288, 598), S(362, 606), K(432, 682),
                   S(356, 630), S(288, 619), S(240, 642)]), GD2),
    shape(outline([K(203, 716), S(236, 664), S(288, 633), S(352, 650), K(402, 752),
                   S(346, 676), S(290, 659), S(246, 682)]), GD),
    # gold arrow (upper left)
    shape(poly((490, 470), (494, 586), (460, 563), (372, 674), (334, 648), (424, 536), (384, 523)), GD2),
    # small two-tone arrow inside the 9
    shape(poly((336, 700), (338, 814), (310, 782), (236, 868), (205, 856), (282, 756), (232, 768)), GD),
    shape(poly((336, 700), (338, 814), (310, 782), (236, 868), (220, 862)), GR, gap=False),
    # long green diagonal arrow
    shape(poly((232, 1182), (574, 534), (526, 478), (645, 396), (656, 542), (612, 540), (284, 1182)), GR),
    # --- "5" -------------------------------------------------------------
    shape(outline([K(384, 1082), S(445, 1022), K(522, 978), S(452, 1008)]), GR),
    # green bowl (outer thick crescent)
    shape(outline([K(650, 877), S(742, 834), S(842, 852), S(906, 942), S(904, 1062),
                   S(830, 1160), S(700, 1186), S(560, 1162), S(440, 1112), K(384, 1080),
                   S(482, 1086), S(602, 1122), S(722, 1126), S(815, 1072), S(850, 972),
                   S(810, 892), S(742, 864)]), GR),
    # inner thinner green arc
    shape(outline([K(784, 898), S(830, 950), S(842, 1030), S(800, 1102), K(700, 1142),
                   S(770, 1090), S(806, 1022), S(810, 960)]), GR2),
    # gold bowl
    shape(outline([K(528, 898), S(600, 815), S(700, 772), S(802, 776), S(882, 832),
                   S(916, 922), K(928, 996), S(890, 918), S(858, 852), S(790, 810),
                   S(700, 806), S(622, 842), K(574, 898)]), GD),
    # green stem + top bar
    shape(outline([K(528, 900), K(620, 568), S(800, 574), S(896, 563), K(944, 542),
                   S(900, 596), S(800, 612), K(660, 622), K(568, 892)]), GR),
    # gold bar under it
    shape(outline([K(632, 780), K(673, 636), S(800, 641), S(890, 628), K(928, 606),
                   S(890, 650), S(800, 667), K(705, 668), K(664, 768)]), GD),
    # gold inner swoosh
    shape(outline([K(394, 1052), S(480, 1010), S(552, 1002), S(612, 1052), S(702, 1102),
                   S(772, 1072), K(802, 1024), S(730, 1070), S(652, 1050), S(592, 1000),
                   S(545, 972), S(470, 984)]), GD2),
    # small curved arrow
    '<path d="M598,966 C605,1040 650,1058 690,1052 C735,1044 752,1000 740,955" fill="none" '
    'stroke="url(#d3)" stroke-width="22" stroke-linecap="butt"/>',
    shape(poly((722, 890), (790, 942), (700, 972)), GD, gap=False),
]

PIXELS = [
    (867, 727, 37, C_GOLD_SQ), (943, 687, 21, C_GOLD_SQ), (943, 728, 40, C_GREEN_SQ),
    (906, 768, 37, C_GREEN_SQ), (945, 828, 22, C_GREEN_SQ),
    (-8, 882, 36, C_GOLD_SQ), (28, 923, 39, C_GREEN_SQ), (67, 963, 34, "#A89250"),
    (5, 1001, 23, C_GREEN_SQ),
]

DEFS = """<defs>
<linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3F9277"/><stop offset="1" stop-color="#1D5747"/></linearGradient>
<linearGradient id="g2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2A6E5A"/><stop offset="1" stop-color="#4A9A80"/></linearGradient>
<linearGradient id="d1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E0BE72"/><stop offset="1" stop-color="#AE8A45"/></linearGradient>
<linearGradient id="d2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#B8944C"/><stop offset="1" stop-color="#E3C27A"/></linearGradient>
<linearGradient id="d3" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8E8A52"/><stop offset="1" stop-color="#D6B368"/></linearGradient>
<radialGradient id="ring" cx="0.5" cy="0.5" r="0.5"><stop offset="0.76" stop-color="#2A6353"/><stop offset="1" stop-color="#33745F"/></radialGradient>
</defs>"""


def arc_d(r, a0, a1):
    p = lambda a: (CX + r * math.cos(math.radians(a)), CY + r * math.sin(math.radians(a)))
    (x0, y0), (x1, y1) = p(a0), p(a1)
    return f"M{x0:.1f},{y0:.1f} A{r},{r} 0 0 1 {x1:.1f},{y1:.1f}"


def svg(viewbox, body, size=2000):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" '
            f'width="{size}" height="{size}">\n{DEFS}\n{body}\n</svg>\n')


def build():
    ring_d = (f"M{CX - R_OUT},{CY} a{R_OUT},{R_OUT} 0 1 0 {2 * R_OUT},0 a{R_OUT},{R_OUT} 0 1 0 {-2 * R_OUT},0Z "
              f"M{CX - R_IN},{CY} a{R_IN},{R_IN} 0 1 1 {2 * R_IN},0 a{R_IN},{R_IN} 0 1 1 {-2 * R_IN},0Z")
    rm = (R_OUT + R_IN) / 2
    ring = [
        f'<circle cx="{CX}" cy="{CY}" r="{R_OUT + 12}" fill="#FFFFFF"/>',
        f'<path fill-rule="evenodd" fill="url(#ring)" d="{ring_d}"/>',
        text_arc("95s PRIDE", 700, 128, 684, -120.5, -58.5, "#FFFFFF"),
    ]
    # decorative dashes on the ring: upper pair from the screenshot, mirrored lower pair
    for a0, a1 in [(-129, -121), (-59, -51), (51, 59), (121, 129)]:
        ring.append(f'<path d="{arc_d(rm + 8, a0, a1)}" fill="none" stroke="{C_RING_DASH}" '
                    f'stroke-width="7" stroke-linecap="round"/>')

    pixels = "".join(f'<rect x="{x}" y="{y}" width="{s}" height="{s}" fill="{c}"/>' for x, y, s, c in PIXELS)
    mark = "\n".join(MARK)
    words = [
        text_line("95s PRIDE", 700, 205, 12, 988, 1380, C_WORD),
        text_line("CONNECTING OUR GENERATION", 700, 52, 92, 908, 1456, C_TAG),
        text_line("SINCE 1995", 700, 52, 358, 642, 1516, C_TAG),
    ]
    pad = 12
    vb = f"{CX - R_OUT - pad} {CY - R_OUT - pad} {2 * (R_OUT + pad)} {2 * (R_OUT + pad)}"
    full = "\n".join(ring) + f'\n<g id="pixels">{pixels}</g>\n<g id="mark">\n{mark}\n</g>\n' + "\n".join(words)
    with open(os.path.join(ASSETS, "logo.svg"), "w", encoding="utf-8") as f:
        f.write(svg(vb, full))
    with open(os.path.join(ASSETS, "logo-mark.svg"), "w", encoding="utf-8") as f:
        f.write(svg("-20 310 980 980", f'<g id="mark">\n{mark}\n</g>', size=512))
    print("viewBox", vb)


if __name__ == "__main__":
    build()
