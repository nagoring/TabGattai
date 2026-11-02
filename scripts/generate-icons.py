"""Generate extension icons from the brand logo.

Usage:  python3 scripts/generate-icons.py   (requires Pillow: pip install pillow)

- Crops the transparent margin of assets/brand/logo.png
- 128px icon: 96x96 artwork with 16px transparent padding (Chrome Web Store guideline)
- 16/32/48px toolbar icons: artwork fills the canvas with minimal padding
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/brand/logo.png"
OUT = ROOT / "public/icons"


def trimmed(im: Image.Image) -> Image.Image:
    alpha = im.getchannel("A").point(lambda a: 255 if a > 8 else 0)
    im = im.crop(alpha.getbbox())
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return sq


def render(art: Image.Image, size: int, art_size: int) -> Image.Image:
    # Resample in premultiplied alpha to avoid dark fringes.
    small = art.convert("RGBa").resize((art_size, art_size), Image.LANCZOS).convert("RGBA")
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    off = (size - art_size) // 2
    canvas.paste(small, (off, off))
    return canvas


def main() -> None:
    art = trimmed(Image.open(SRC).convert("RGBA"))
    OUT.mkdir(parents=True, exist_ok=True)
    specs = {16: 16, 32: 30, 48: 44, 128: 96}
    for size, art_size in specs.items():
        render(art, size, art_size).save(OUT / f"icon-{size}.png", optimize=True)
    # Large square version used by the store image generator.
    render(art, 512, 512).save(ROOT / "assets/brand/logo-square-512.png", optimize=True)
    print("icons:", ", ".join(str(s) for s in specs))


if __name__ == "__main__":
    main()
