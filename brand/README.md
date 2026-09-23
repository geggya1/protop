# ProTop-logoer

Pakkenotatet under er kilden for filnavn. Merkevarearket sier hvor hver variant skal brukes. Siden leser stier og farger fra `manifest.json`.

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

## Bruk

Fra `source/ProTop_logo_brand_sheet.pdf`:

- Primary use: full-colour logo on white or very light backgrounds.
- For dark backgrounds: use the all-white logo variant.
- For small digital surfaces: use the standalone symbol/app icon.

På siden:

- Lys bakgrunn: `ProTop_logo_primary_transparent.png` i toppfelt og hero.
- Mørk bakgrunn: `ProTop_logo_white_transparent.png`.
- Små flater: `ProTop_favicon.ico` og `ProTop_icon_*.png` (appikon 192 og 512).

Farger fra merkevarearket, bare til bakgrunn og tekst: marineblå `#07274C`, digital blå `#1099F4`, hvit `#FFFFFF`. Ikke fargelegg om logoen.

Produktnavnet er ProTop. Symbolfilene har en liten Digi-påskrift i originalen. Den er ikke produktnavnet.

`ProTop_logo_primary.svg` og `ProTop_symbol.svg` sto i pakkenotatet, men fulgte ikke med. PDF-ene er raster, ikke Bézier-kurver.

## Filer

Primærlås: `ProTop_logo_primary_transparent.png`, `ProTop_logo_primary_transparent_4096px.png`, `ProTop_logo_primary_white_background.jpg`, `ProTop_logo_primary.pdf`. Merkevarearket ligger i `source/ProTop_logo_brand_sheet.pdf`.

Andre låser: `ProTop_logo_white_transparent.png`, `ProTop_logo_white_on_navy.png`, `ProTop_logo_navy_monochrome.png`, `ProTop_logo_black_monochrome.png`.

Symbol og ordmerke: `ProTop_symbol_transparent.png`, `ProTop_symbol_square_2048.png`, `ProTop_symbol_white.png`, `ProTop_symbol_navy.png`, `ProTop_wordmark_transparent.png`.

`source/` har merkevarearket, pakkenotatet, en 1024 px-eksport av primærlåsen, og en symbolfil der gjennomsiktige piksler er hvite.
