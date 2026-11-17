"""Draws the app icons (blue square + white tick, same as the favicon). Run: python3 -I scripts/make_icons.py"""
from PIL import Image, ImageDraw
import os

BLUE = (47, 75, 208, 255)
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')


def icon(size, rounded, inset=0.0):
    """inset = fraction of the size kept clear around the tick (maskable icons need a safe zone)."""
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 7 / 32), fill=BLUE)
    else:
        d.rectangle([0, 0, S, S], fill=BLUE)
    # tick on a 32-unit grid (matches the favicon): (9,17) -> (14,22) -> (23,11)
    k = (1 - 2 * inset) * S / 32
    o = inset * S
    pts = [(o + x * k, o + y * k) for x, y in [(9, 17), (14, 22), (23, 11)]]
    w = int(3.2 * k)
    d.line(pts, fill='white', width=w, joint='curve')
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill='white')
    return img.resize((size, size), Image.LANCZOS)


icon(192, True).save(os.path.join(OUT, 'icon-192.png'))
icon(512, True).save(os.path.join(OUT, 'icon-512.png'))
icon(512, False, inset=0.12).save(os.path.join(OUT, 'icon-maskable-512.png'))  # full bleed, Android crops it
icon(180, False).save(os.path.join(OUT, 'apple-touch-icon.png'))               # iOS rounds it itself
print('icons written')
