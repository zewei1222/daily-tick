#!/usr/bin/env python3
"""產生 icons/ 與 splash/ 的 PNG。圖形與 tokens.css 的黑白高對比風格一致。
用法：python3 tools_gen_assets.py"""
from PIL import Image, ImageDraw

INK = (17, 17, 17)
BG = (255, 255, 255)


def draw_check(img, cx, cy, size, width_ratio=0.155, color=INK):
    """在 (cx, cy) 畫一個寬 size 的勾。線端用圓形補圓角。"""
    d = ImageDraw.Draw(img)
    w = max(2, int(size * width_ratio))
    pts = [(-0.30, 0.06), (-0.08, 0.28), (0.32, -0.26)]
    pts = [(cx + x * size, cy + y * size) for x, y in pts]
    d.line(pts, fill=color, width=w, joint="curve")
    for x, y in pts:
        r = w / 2
        d.ellipse([x - r, y - r, x + r, y + r], fill=color)


def icon(size, bordered=True, check_scale=0.62):
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    if bordered:
        inset = round(size * 0.075)
        bw = max(2, round(size * 0.05))
        d.rounded_rectangle(
            [inset, inset, size - inset - 1, size - inset - 1],
            radius=round(size * 0.16), outline=INK, width=bw,
        )
    draw_check(img, size / 2, size / 2, size * check_scale)
    return img


def splash(w, h, check_px):
    img = Image.new("RGB", (w, h), BG)
    draw_check(img, w / 2, h / 2, check_px)
    return img


if __name__ == "__main__":
    icon(180).save("icons/icon-180.png")
    icon(192).save("icons/icon-192.png")
    icon(512).save("icons/icon-512.png")
    # maskable：圖形限制在中央 60%，四周留給系統裁切
    icon(512, bordered=False, check_scale=0.42).save("icons/icon-512-maskable.png")
    # iPhone 15 Pro：393x852 @3x
    splash(1179, 2556, 320).save("splash/splash-1179x2556.png")
    print("assets written")
