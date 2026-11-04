# Makes public/cars/<model>-<paint>.webp from Tesla's configurator renders (white background, 1920 by 1080),
# cut out so they sit on light and dark pages. The car comes out solid from a segmentation model; the rest
# of the picture (the ground shadow) becomes black at partial alpha, so it shows on white and fades on dark.
# Every picture shares one crop (what's drawn in any of them), so all paints and both models line up.
#
#   pip install "rembg[cpu]" scipy pillow
#   python3 scripts/car-pictures.py out/ "Model Y=renders/y/*.jpeg" "Model Y L=renders/yl/*.jpeg"
#
# Name each render after its paint as lib/car.ts spells it ("pearl-white.jpeg"); the output is
# "model-y-pearl-white.webp". Add a new paint to PICTURES in lib/car.ts too.
import glob, os, sys
import numpy as np
from PIL import Image
from rembg import new_session, remove

out, groups = sys.argv[1], sys.argv[2:]
session = new_session("isnet-general-use")
results = []
for group in groups:
    model, pattern = group.split("=", 1)
    for path in sorted(glob.glob(pattern)):
        src = Image.open(path).convert("RGB")
        im = np.asarray(src).astype(np.float32) / 255
        car = np.asarray(remove(src, session=session, only_mask=True)).astype(np.float32) / 255
        ink = np.clip(1 - im.min(2), 0, 1)
        ink[ink < 0.012] = 0
        alpha = car + ink * (1 - car)
        rgb = im * car[..., None] / np.maximum(alpha, 1e-6)[..., None]
        name = f"{model.lower().replace(' ', '-')}-{os.path.splitext(os.path.basename(path))[0]}"
        results.append((name, np.dstack([np.clip(rgb, 0, 1), alpha])))
drawn = np.zeros(results[0][1].shape[:2], bool)
for _, a in results:
    drawn |= a[..., 3] > 0.03
ys, xs = np.nonzero(drawn)
box = (max(xs.min() - 8, 0), max(ys.min() - 8, 0), xs.max() + 8, ys.max() + 8)
for name, a in results:
    img = Image.fromarray((a * 255).round().astype(np.uint8), "RGBA").crop(box)
    img = img.resize((1200, round(img.height * 1200 / img.width)), Image.LANCZOS)
    img.save(os.path.join(out, f"{name}.webp"), quality=82, method=6, alpha_quality=90)
    print(name, img.size)
