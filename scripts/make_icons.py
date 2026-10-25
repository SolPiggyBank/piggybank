"""Extension icons: the front-facing pig head (the same PigFace as in the popup and on the site).
Usage: python3 scripts/make_icons.py .   (writes public/icons/icon{16,32,48,128}.png and scripts/icon.svg)"""
import sys, pathlib
from playwright.sync_api import sync_playwright

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.')
INK, BODY, INNER_EAR, BLUSH, SNOUT = '#3A0F1F', '#F4C3CC', '#EC8EA3', '#F28AA2', '#F8CFD7'


def face(sw=1.8, eye=1.9, nostril=(1.1, 1.8), shine=True, blush=0.6):
    """PigFace from src/components/Pig.jsx; small sizes get bolder lines and eyes."""
    return f'''
  <path d="M8 13 C6 6 8 3 13 2.5 C14.5 6 15 9 14 13 Z" fill="{BODY}" stroke="{INK}" stroke-width="{sw}" stroke-linejoin="round"/>
  <path d="M32 13 C34 6 32 3 27 2.5 C25.5 6 25 9 26 13 Z" fill="{BODY}" stroke="{INK}" stroke-width="{sw}" stroke-linejoin="round"/>
  <path d="M10.5 10 C10 7 10.8 5.6 12.4 5 C13 7 13 8.6 12.6 10.4 Z" fill="{INNER_EAR}"/>
  <path d="M29.5 10 C30 7 29.2 5.6 27.6 5 C27 7 27 8.6 27.4 10.4 Z" fill="{INNER_EAR}"/>
  <ellipse cx="20" cy="22" rx="15" ry="14" fill="{BODY}" stroke="{INK}" stroke-width="{sw}"/>
  {'<path d="M10 17 Q12 12.5 17 11" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.7"/>' if shine else ''}
  <ellipse cx="11" cy="26" rx="3" ry="2" fill="{BLUSH}" opacity="{blush}"/>
  <ellipse cx="29" cy="26" rx="3" ry="2" fill="{BLUSH}" opacity="{blush}"/>
  <circle cx="14.5" cy="19.5" r="{eye}" fill="{INK}"/>
  <circle cx="25.5" cy="19.5" r="{eye}" fill="{INK}"/>
  <ellipse cx="20" cy="27" rx="6.4" ry="4.8" fill="{SNOUT}" stroke="{INK}" stroke-width="{sw}"/>
  <ellipse cx="17.8" cy="27" rx="{nostril[0]}" ry="{nostril[1]}" fill="{INK}"/>
  <ellipse cx="22.2" cy="27" rx="{nostril[0]}" ry="{nostril[1]}" fill="{INK}"/>'''


# The drawing spans x 4..36, y 1.6..37 (with its outline). Each size gets its own frame:
# the store icon keeps Chrome's recommended transparent margin, toolbar sizes fill the square.
SIZES = {
    128: ('-2.9 -3.6 45.8 45.8', face()),                     # artwork ≈ 98 px of 128
    48: ('0 -0.6 40 40', face(sw=2.0, eye=2.0)),
    32: ('1.1 0.4 37.8 37.8', face(sw=2.1, eye=2.2, nostril=(1.1, 1.7))),
    16: ('0 0 16 16', None),
}

# 16 px is drawn on the pixel grid: the same pig, just few enough lines to stay crisp.
FACE16 = f'''
  <path d="M1.5 6.5 L2 1.5 L6.5 4" fill="{BODY}" stroke="{INK}" stroke-linejoin="round"/>
  <path d="M14.5 6.5 L14 1.5 L9.5 4" fill="{BODY}" stroke="{INK}" stroke-linejoin="round"/>
  <path d="M2.6 3 L5 4.4 L3 6 Z" fill="{INNER_EAR}"/>
  <path d="M13.4 3 L11 4.4 L13 6 Z" fill="{INNER_EAR}"/>
  <ellipse cx="8" cy="9.5" rx="6.5" ry="5.5" fill="{BODY}" stroke="{INK}"/>
  <rect x="2" y="10" width="2" height="1" fill="{BLUSH}" opacity="0.8"/>
  <rect x="12" y="10" width="2" height="1" fill="{BLUSH}" opacity="0.8"/>
  <rect x="5" y="7" width="1" height="2" fill="{INK}"/>
  <rect x="10" y="7" width="1" height="2" fill="{INK}"/>
  <rect x="4.5" y="9.5" width="7" height="4" rx="1.6" fill="{SNOUT}" stroke="{INK}"/>
  <rect x="6" y="10.5" width="1" height="2" fill="{INK}"/>
  <rect x="9" y="10.5" width="1" height="2" fill="{INK}"/>'''


def svg(size):
    box, body = SIZES[size]
    body = body or FACE16
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}" width="{size}" height="{size}">{body}\n</svg>'


(root / 'scripts/icon.svg').write_text(svg(128).replace(' width="128" height="128"', '') + '\n')
with sync_playwright() as p:
    b = p.chromium.launch()
    for size in SIZES:
        pg = b.new_page(viewport={'width': size, 'height': size}, device_scale_factor=1)
        pg.set_content('<html><body style="margin:0;background:transparent">' + svg(size) + '</body></html>')
        pg.screenshot(path=str(root / f'public/icons/icon{size}.png'), omit_background=True, clip={'x': 0, 'y': 0, 'width': size, 'height': size})
        pg.close()
    b.close()
print('icons ok')
