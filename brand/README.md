# ProTop logo package

The package note below is the source of truth for file names. The brand sheet states where each variant is used.

```
ProTop LOGO PACKAGE

PRIMARY
- ProTop_logo_primary_transparent.png
- ProTop_logo_primary_transparent_4096px.png
- ProTop_logo_primary_white_background.jpg
- ProTop_logo_primary.svg
- ProTop_logo_primary.pdf

SYMBOL / DIGITAL
- ProTop_symbol_transparent.png
- ProTop_symbol_square_2048.png
- ProTop_symbol.svg
- ProTop_icon_*.png
- ProTop_favicon.ico

ALTERNATIVE COLOUR VERSIONS
- ProTop_logo_white_transparent.png
- ProTop_logo_white_on_navy.png
- ProTop_logo_navy_monochrome.png
- ProTop_logo_black_monochrome.png
- ProTop_symbol_white.png
- ProTop_symbol_navy.png

WORDMARK
- ProTop_wordmark_transparent.png

NOTE ABOUT SVG
The SVG files preserve the exact approved artwork by embedding the cleaned
transparent source image. They are valid SVG files, but the internal artwork
has not been manually redrawn as native Bézier vector paths.
```

## Usage

From `ProTop_logo_brand_sheet.pdf`:

- Primary use: full-colour logo on white or very light backgrounds.
- For dark backgrounds: use the all-white logo variant.
- For small digital surfaces: use the standalone symbol/app icon.

Reference colours on the sheet, for backgrounds and type only: Navy `#07274C`, digital blue `#1099F4`, white `#FFFFFF`. Do not recolor the artwork.

The product name is ProTop. The symbol files contain a small Digi watermark inside the approved artwork. That watermark is not the product name.

`ProTop_logo_primary.svg` and `ProTop_symbol.svg` are named in the package note but were not in this file drop, so they are not stored here.

## Used on the site

| Place | File | Why |
| --- | --- | --- |
| Header on white | `ProTop_logo_primary_transparent.png` | Full-colour primary lockup |
| Header on navy | `ProTop_logo_white_transparent.png` | All-white lockup for dark backgrounds |
| Favicon | `ProTop_favicon.ico` | Symbol / app icon for small digital surfaces |
| Apple touch icon and manifest | `ProTop_icon_192.png`, `ProTop_icon_512.png` | Same mark, at the supplied icon sizes |

The header uses the transparent lockups at their own aspect ratio (`width` limited, `height: auto`). Nothing is stretched, cropped, or redrawn.

## Other files in this folder

Kept with the package, not used as the header or favicon:

- `ProTop_logo_primary_transparent_4096px.png` — large primary
- `ProTop_logo_primary_white_background.jpg` — primary on a white plate
- `ProTop_logo_primary.pdf` — primary artwork
- `ProTop_logo_white_on_navy.png` — white lockup already composited on navy
- `ProTop_logo_navy_monochrome.png`, `ProTop_logo_black_monochrome.png`
- `ProTop_symbol_transparent.png`, `ProTop_symbol_square_2048.png`, `ProTop_symbol_white.png`, `ProTop_symbol_navy.png`
- `ProTop_icon_32.png` through `ProTop_icon_512.png`
- `ProTop_wordmark_transparent.png` — wordmark only, without the symbol

`source/` holds the original package note, the PDFs, a 1024 px export of the same primary lockup, and a second symbol export whose fully transparent pixels are white. That second symbol matches `ProTop_symbol_transparent.png` once composited.
