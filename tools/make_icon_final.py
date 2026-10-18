"""Chozem 图标（程序化矢量，炭黑 + 米白 + 琥珀）。
以生成图为视觉参考，重建为无描边高光的干净几何图形。
"""
import math
import os

from PIL import Image, ImageDraw

OUT = r"E:\榨干AI\Chozem\ui\assets"
BASE = 1024
SS = 4

PALETTE = {
    "bg_top": (62, 58, 51),
    "bg_bottom": (37, 34, 30),
    "ring": (247, 243, 233),
    "dot": (245, 154, 60),
}


def squircle(size: int, exponent: float = 4.2) -> Image.Image:
    big = size * SS
    img = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(img)
    pts = []
    for i in range(1440):
        t = 2 * math.pi * i / 1440
        c, s = math.cos(t), math.sin(t)
        x = math.copysign(abs(c) ** (2 / exponent), c)
        y = math.copysign(abs(s) ** (2 / exponent), s)
        pts.append(((x + 1) / 2 * (big - 1), (y + 1) / 2 * (big - 1)))
    draw.polygon(pts, fill=255)
    return img.resize((size, size), Image.LANCZOS)


def squircle_exact(px: int, exponent: float = 4.2) -> Image.Image:
    img = Image.new("L", (px, px), 0)
    draw = ImageDraw.Draw(img)
    pts = []
    for i in range(1440):
        t = 2 * math.pi * i / 1440
        c, s = math.cos(t), math.sin(t)
        x = math.copysign(abs(c) ** (2 / exponent), c)
        y = math.copysign(abs(s) ** (2 / exponent), s)
        pts.append(((x + 1) / 2 * (px - 1), (y + 1) / 2 * (px - 1)))
    draw.polygon(pts, fill=255)
    return img


def background(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), PALETTE["bg_bottom"])
    draw = ImageDraw.Draw(img)
    top = PALETTE["bg_top"]
    bottom = PALETTE["bg_bottom"]
    for y in range(size):
        t = y / max(1, size - 1)

        k = (1 - t) ** 1.45
        color = tuple(round(bottom[i] + (top[i] - bottom[i]) * k) for i in range(3))
        draw.line([(0, y), (size, y)], fill=color)
    return img


def draw_mark(size: int, compact: bool) -> Image.Image:
    big = size * SS
    scale = big / BASE

    bg = background(big).convert("RGBA")

    R = 318 * scale
    stroke = (126 if compact else 114) * scale
    half_gap = math.radians(21 if compact else 23)
    cx = cy = big / 2

    ring = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)

    outer = R + stroke / 2
    inner = R - stroke / 2
    rd.ellipse([cx - outer, cy - outer, cx + outer, cy + outer], fill=PALETTE["ring"] + (255,))
    rd.ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=(0, 0, 0, 0))


    pts = [(cx, cy)]
    steps = 60
    for i in range(steps + 1):
        a = -half_gap + (2 * half_gap) * i / steps
        pts.append((cx + math.cos(a) * (outer + 2), cy + math.sin(a) * (outer + 2)))
    rd.polygon(pts, fill=(0, 0, 0, 0))


    cap_r = stroke / 2
    for sign in (-1, 1):
        ex = cx + math.cos(sign * half_gap) * R
        ey = cy + math.sin(sign * half_gap) * R
        rd.ellipse([ex - cap_r, ey - cap_r, ex + cap_r, ey + cap_r], fill=PALETTE["ring"] + (255,))

    bg.alpha_composite(ring)


    dot_r = (60 if compact else 42) * scale
    dot_y = (cy / scale - (80 if compact else 128)) * scale
    dot = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dot)
    dd.ellipse([cx - dot_r, dot_y - dot_r, cx + dot_r, dot_y + dot_r], fill=PALETTE["dot"] + (255,))
    bg.alpha_composite(dot)

    mask = squircle_exact(big)
    bg.putalpha(mask)
    return bg.resize((size, size), Image.LANCZOS)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    master = draw_mark(1024, compact=False)
    master.save(os.path.join(OUT, "icon.png"), optimize=True)

    for name, size, compact in [
        ("icon-256.png", 256, False),
        ("icon-128.png", 128, True),
        ("icon-64.png", 64, True),
        ("icon-32.png", 32, True),
    ]:
        draw_mark(size, compact).save(os.path.join(OUT, name), optimize=True)


    ico_images = [draw_mark(s, s <= 64) for s in (256, 128, 64, 48, 32, 16)]
    ico_images[0].save(
        os.path.join(OUT, "icon.ico"),
        sizes=[(im.width, im.height) for im in ico_images],
        append_images=ico_images[1:],
    )
    print("done")


if __name__ == "__main__":
    main()
