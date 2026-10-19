from PIL import Image, ImageDraw
import os

os.makedirs('assets', exist_ok=True)

def rounded_gradient(size, radius_ratio=0.27, padding=0):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    grad = Image.new('RGBA', (size, size))
    px = grad.load()
    c1 = (109, 141, 255)
    c2 = (57, 91, 235)
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = (
                int(c1[0] + (c2[0] - c1[0]) * t),
                int(c1[1] + (c2[1] - c1[1]) * t),
                int(c1[2] + (c2[2] - c1[2]) * t),
                255,
            )
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    r = int(size * radius_ratio)
    d.rounded_rectangle([padding, padding, size - 1 - padding, size - 1 - padding], radius=r, fill=255)
    img.paste(grad, (0, 0), mask)
    return img

size = 256
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
sd.rounded_rectangle([22, 28, 238, 244], radius=68, fill=(24, 37, 84, 40))
from PIL import ImageFilter
shadow = shadow.filter(ImageFilter.GaussianBlur(14))
img.alpha_composite(shadow)
icon = rounded_gradient(size, 0.27, 18)
img.alpha_composite(icon)
d = ImageDraw.Draw(img)
# Draw a crisp check with round joints/caps.
d.line([(75, 133), (113, 171), (184, 92)], fill=(255, 255, 255, 255), width=25, joint='curve')
for p in [(75, 133), (113, 171), (184, 92)]:
    d.ellipse([p[0] - 12, p[1] - 12, p[0] + 12, p[1] + 12], fill=(255, 255, 255, 255))
img.save('assets/app.png')
img.save('assets/app.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

tray = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
tray.alpha_composite(rounded_gradient(64, 0.27, 2))
td = ImageDraw.Draw(tray)
td.line([(18, 34), (28, 44), (47, 22)], fill=(255, 255, 255, 255), width=7, joint='curve')
for p in [(18, 34), (28, 44), (47, 22)]:
    td.ellipse([p[0] - 3, p[1] - 3, p[0] + 3, p[1] + 3], fill=(255, 255, 255, 255))
tray.save('assets/tray.png')
print('icons created')
