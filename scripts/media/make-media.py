"""Turn the PNGs from capture.cjs into docs/media (D-045, D-086).

Stills become WebP; the frames become gameplay.gif, quantised to one shared
palette so colours don't flicker between frames. Needs Pillow.
"""
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
OUT = HERE / "out"
MEDIA = HERE.parent.parent / "docs" / "media"

for png in sorted(OUT.glob("*.png")):
    target = MEDIA / f"{png.stem}.webp"
    Image.open(png).convert("RGB").save(target, "WEBP", quality=80, method=6)
    print(f"{target.name}: {target.stat().st_size // 1024} KB")

frames = [Image.open(f).convert("RGB") for f in sorted((OUT / "frames").glob("*.png"))]
if frames:
    # One palette from a strip of every fourth frame, used for all of them.
    sample = frames[::4]
    strip = Image.new("RGB", (frames[0].width, frames[0].height * len(sample)))
    for i, f in enumerate(sample):
        strip.paste(f, (0, i * f.height))
    palette = strip.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
    gif = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    durations = [70] * (len(gif) - 1) + [2200]  # hold the solved board before looping
    target = MEDIA / "gameplay.gif"
    gif[0].save(target, save_all=True, append_images=gif[1:], duration=durations, loop=0, disposal=1)
    print(f"{target.name}: {len(gif)} frames, {target.stat().st_size // 1024} KB")
