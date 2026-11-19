from PIL import Image, ImageFilter, ImageDraw
import numpy as np

OUT = "/home/rizutov/ares-react/qa/recolor"
src = Image.open("/home/rizutov/.hermes/cache/images/img_9debab2477c9.jpg").convert("RGB")
a = np.asarray(src).astype(np.float32) / 255.0
h, w, _ = a.shape

mx = a.max(axis=2); mn = a.min(axis=2)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
alpha = np.clip((mx - 0.70) / 0.24, 0, 1) * np.clip((0.32 - sat) / 0.20, 0, 1)
alpha = np.clip(alpha, 0, 1).astype(np.float32)

ys, xs = np.where(alpha > 0.5)
x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())

Y, X = np.mgrid[0:h, 0:w].astype(np.float32)
t = np.clip((Y - y0) / float(y1 - y0), 0, 1)[:, :, None]
mark = np.array([240, 242, 246], np.float32)[None, None, :] * (1 - t) + \
       np.array([196, 203, 213], np.float32)[None, None, :] * t
mark = np.broadcast_to(mark, (h, w, 3)).copy()

# fondo
yy = (np.arange(h, dtype=np.float32) / (h - 1))[:, None, None]
bg = np.array([32, 33, 37], np.float32)[None, None, :] * (1 - yy) + \
     np.array([12, 13, 15], np.float32)[None, None, :] * yy
bg = np.broadcast_to(bg, (h, w, 3)).copy()
r = np.sqrt(((X - w / 2) / (w / 2)) ** 2 + ((Y - h / 2) / (h / 2)) ** 2) / 1.4142
bg *= (1 - 0.10 * np.clip(r - 0.45, 0, 1))[:, :, None]

alpha_img = Image.fromarray((alpha * 255).astype(np.uint8))
mark_img = Image.fromarray(np.clip(mark, 0, 255).astype(np.uint8)).convert("RGBA")
mark_img.putalpha(alpha_img)

# centrar ópticamente
dx = int(round(w / 2 - (x0 + x1) / 2))
dy = int(round(h / 2 - (y0 + y1) / 2)) - 10

canvas = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).convert("RGBA")

# sombra desplazada
sh = np.asarray(alpha_img.filter(ImageFilter.GaussianBlur(12))).astype(np.float32) / 255.0 * 0.60
sh_img = Image.fromarray((sh * 255).astype(np.uint8))
canvas.paste(Image.new("RGBA", (w, h), (0, 0, 0, 255)), (dx, dy + 16), sh_img)

# brillo tenue
gl = np.asarray(alpha_img.filter(ImageFilter.GaussianBlur(16))).astype(np.float32) / 255.0 * 0.08
gl_img = Image.fromarray((gl * 255).astype(np.uint8))
canvas.paste(Image.new("RGBA", (w, h), (255, 255, 255, 255)), (dx, dy), gl_img)

canvas.paste(mark_img, (dx, dy), mark_img)

final = canvas.convert("RGB")
final.save(f"{OUT}/casco-negro-1024.png")

# versión redondeada 512 con esquinas transparentes
size, rad = 512, 116
sq = final.resize((size, size), Image.LANCZOS).convert("RGBA")
mask = Image.new("L", (size, size), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=rad, fill=255)
sq.putalpha(mask)
sq.save(f"{OUT}/casco-app-512.png")

for s in (256, 128, 64, 34, 16):
    final.resize((s, s), Image.LANCZOS).save(f"{OUT}/casco-{s}.png")

print("offset", dx, dy, "bbox", x0, y0, x1, y1)
