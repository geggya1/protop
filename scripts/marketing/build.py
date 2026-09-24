#!/usr/bin/env python3
"""Generate Weekplan marketing HTML into website/.

Sales-focused layouts with DeviceShowcase / ProductScreen compositions.
Uses only approved anonymized product shots 01–10.
"""
from __future__ import annotations

import json
import sys
from html import escape as e
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
OUT = REPO / "website"
DESIGN = OUT / "design"
sys.path.insert(0, str(ROOT))
from content import FAQ, MODULES  # noqa: E402

CONFIG = json.loads((DESIGN / "config.json").read_text())
ROUTES = json.loads((DESIGN / "routes.json").read_text())
MAP = {m["slug"]: m for m in MODULES}
ASSET = "/img"
CSS_V = "20260920v1"
JS_V = "20260919v1"

ARTS = {
    1: "art/01-kalender.png",
    2: "art/02-vase-og-hjerte.png",
    3: "art/03-gjoremal.png",
    4: "art/04-stjerne.png",
    5: "art/05-belonningsopplevelse.png",
    6: "art/06-ukelonn.png",
    7: "art/07-skole.png",
    8: "art/08-mat-og-handlepose.png",
    9: "art/09-matrett.png",
    10: "art/10-mengde-og-vekt.png",
    11: "art/11-strekkode.png",
    12: "art/21-familietre.png",
    13: "art/13-skole-og-ai.png",
    14: "art/14-ai-veiledning.png",
    15: "art/15-aldersvekst.png",
    16: "art/16-valg-av-apper.png",
    17: "art/17-familiespill.png",
    18: "art/18-familiechat.png",
    19: "art/19-reiser.png",
    20: "art/20-merkedager.png",
    21: "art/21-familietre.png",
    22: "art/22-aktiviteter.png",
}

# Approved anonymized product shots only (01–10)
SCREENS = {
    "01": f"{ASSET}/screens/01-kalender-iphone.png",
    "02": f"{ASSET}/screens/02-progresjon-iphone.png",
    "03": f"{ASSET}/screens/03-barnets-apper-iphone.png",
    "04": f"{ASSET}/screens/04-middagsvalg-iphone.png",
    "05": f"{ASSET}/screens/05-handleliste-iphone.png",
    "06": f"{ASSET}/screens/06-familiespill-iphone.png",
    "07": f"{ASSET}/screens/07-tilpasning-iphone.png",
    "07d": f"{ASSET}/screens/07-tilpasning-detalj-iphone.png",
    "08": f"{ASSET}/screens/08-barnets-hjem-nettbrett.png",
    "09": f"{ASSET}/screens/09-maltidsplan-nettbrett.png",
    "10": f"{ASSET}/screens/10-leksehjelp-nettbrett.png",
    # for-barn only (do not reuse on other pages)
    "11": f"{ASSET}/screens/11-barnets-appoversikt-anonymisert-iphone.png",
    "12": f"{ASSET}/screens/12-barnets-gjoremal-og-ukelonn-iphone.png",
}

ALTS = {
    "01": "Familiekalender i Weekplan på iPhone",
    "02": "Barnets progresjon og gjennomførte oppgaver i Weekplan",
    "03": "Barnets tilpassede appoversikt i Weekplan",
    "04": "Valg av middagsoppskrift i Weekplan",
    "05": "Familiens felles handleliste i Weekplan",
    "06": "Oversikt over familiespill i Weekplan",
    "07": "Foreldrestyring av apper og tilganger i Weekplan",
    "07d": "Foreldrestyring av apper og tilganger i Weekplan",
    "08": "Barnets personlige Weekplan-oversikt på stor skjerm",
    "09": "Familiens måltidsplan i Weekplan på stor skjerm",
    "10": "Leksehjelpen i Weekplan på stor skjerm",
    "11": "Barnets personlige appoversikt med valgte funksjoner i Weekplan",
    "12": "Barnets gjøremål, fremdrift og ukelønn i Weekplan",
}

PHONE_WH = (804, 1748)
WIDE_WH = (1365, 1022)

NAV = [
    ("funksjoner", "Funksjoner"),
    ("for-foreldre", "For foreldre"),
    ("for-barn", "For barn"),
    ("slik-fungerer-det", "Slik fungerer det"),
]

INTRO = (
    "Samle familiens planer, gjøremål, skole og middager på ett sted. "
    "Alle ser det de trenger – på mobil, nettbrett og PC."
)

LANDING = {
    "for-foreldre": {
        "title": "Du trenger ikke være familiens huskeliste.",
        "lead": "Samle det familien skal huske, fordel det som skal gjøres og følg fremgangen uten å måtte minne alle på alt.",
        "art": 2,
    },
    "for-barn": {
        "title": "Se hva jeg fikk til!",
        "lead": "En tydelig og personlig oversikt gjør det lettere å se dagens planer, finne egne oppgaver og oppdage hvor langt man har kommet.",
        "art": 15,
    },
    "skole": {
        "title": "En skoleuke det er lettere å følge.",
        "lead": "Samle ukeplaner, lekser og aktiviteter i én oversikt. Når barnet står fast, er hjelpen til neste steg lett tilgjengelig.",
        "art": 13,
    },
    "mat": {
        "title": "Middagen begynner med en god plan.",
        "lead": "Velg måltidene som passer uken. Samle ingrediensene i handlelisten og gjør planleggingen tilgjengelig for hele familien.",
        "art": 8,
    },
    "funksjoner": {
        "title": "Hva vil dere gjøre enklere først?",
        "lead": "En avtale å holde. En oppgave å mestre. Et måltid å planlegge. Finn funksjonene dere trenger nå, og oppdag resten underveis.",
        "art": 16,
    },
    "slik-fungerer-det": {
        "title": "Begynn med én ting. Bygg videre sammen.",
        "lead": "Start med familiens viktigste behov. Velg hvem som skal se hva, og legg til flere funksjoner etter hvert.",
        "art": 3,
    },
    "hjelp": {
        "title": "Finn svaret. Kom videre.",
        "lead": "Her finner dere korte forklaringer og praktiske veier inn i Weekplan. Velg området dere vil bli bedre kjent med.",
        "art": 14,
    },
    "kontakt": {
        "title": "La oss gjøre neste steg enklere.",
        "lead": "Har du spørsmål om Weekplan, trenger hjelp til en funksjon eller vil dele en idé? Send en melding, så tar vi den videre.",
        "art": 18,
    },
    "produktbilder": {
        "title": "Slik ser Weekplan faktisk ut.",
        "lead": "Utforsk utvalgte visninger på nettbrett og iPhone. Åpne et bilde for å se detaljene. Oppsettet varierer med profil, valgte funksjoner og registrert innhold.",
        "art": 16,
    },
}

FUNKSJONER_ORDER = [
    "gjoremal",
    "belonning",
    "leksehjelpen",
    "maltidsplanlegger",
    "handleliste",
    "kalender",
    "tilpasning",
    "familiespill",
    "chat",
]

START = [
    ("Samle familien", "Opprett familien og inviter dem som skal være med. Finn et første behov dere vil gjøre enklere."),
    ("Tilpass hver visning", "Velg apper og funksjoner etter alder og behov. Gjør det lett å finne det som er viktig nå."),
    ("Bruk det i hverdagen", "Planlegg noen avtaler, gjøremål eller middager. Se på planen sammen og juster underveis."),
]


def href(slug: str) -> str:
    if slug in ("", "index", "/"):
        return "/"
    if slug.startswith("/") or slug.startswith("http") or slug.startswith("mailto:"):
        return slug
    return "/" + slug


def a(slug: str, text: str, cl: str = "") -> str:
    cls = f' class="{cl}"' if cl else ""
    return f'<a{cls} href="{e(href(slug))}">{e(text)}</a>'


def art(n: int, cl: str = "wp-illustration") -> str:
    src = f"{ASSET}/{ARTS.get(n, ARTS[2])}"
    return f'<img class="{cl}" src="{src}" alt="" loading="lazy" decoding="async">'


def cta(cl: str = "wp-button", label: str = "Prøv Weekplan") -> str:
    return f'<a class="{cl}" href="{e(CONFIG["signup"])}">{e(label)}</a>'


def _is_phone(key: str) -> bool:
    return key not in ("08", "09", "10")


def _dims(key: str) -> tuple[int, int]:
    return PHONE_WH if _is_phone(key) else WIDE_WH


def product_screen(
    key: str,
    *,
    size: str = "md",
    priority: bool = False,
    label: str | None = None,
    stage: str | None = None,
) -> str:
    """Reusable ProductScreen – single framed product capture."""
    src = SCREENS[key]
    alt = ALTS[key]
    phone = _is_phone(key)
    # Native app captures (11/12) use full 9:19.5 — no Safari chrome crop
    full = key in ("11", "12")
    w, h = PHONE_WH if phone else WIDE_WH
    loading = "eager" if priority else "lazy"
    fetch = ' fetchpriority="high"' if priority else ""
    size_cls = {
        "lg": "wp-ps--lg",
        "md": "wp-ps--md",
        "sm": "",
        "solo": "wp-ps--solo wp-ps--lg",
        "hero": "wp-ps--hero",
        "xl": "wp-ps--xl",
    }.get(size, "wp-ps--md")
    kind = "wp-ps--phone" if phone else "wp-ps--wide"
    if full and phone:
        kind += " wp-ps--full"
    if not phone and size in ("hero", "xl"):
        kind += " wp-ps--hero"
        if size == "xl":
            kind += " wp-ps--xl"
    label_html = f'<span class="wp-ps-label">{e(label)}</span>' if label else ""
    figure = (
        f'<figure class="wp-ps {kind} {size_cls}">'
        f"{label_html}"
        f'<button class="wp-ps-frame" type="button" data-image="{e(src)}?v={CSS_V}" data-caption="{e(alt)}" aria-label="Forstørr bilde">'
        f'<span class="wp-ps-viewport">'
        f'<img src="{e(src)}?v={CSS_V}" alt="{e(alt)}" width="{w}" height="{h}" loading="{loading}" decoding="async"{fetch}>'
        f"</span></button></figure>"
    )
    if stage:
        return f'<div class="wp-ps-stage wp-ps-stage--{e(stage)}">{figure}</div>'
    return figure


def device_showcase(
    wide: str,
    phone: str | None = None,
    *,
    variant: str = "hero",
    priority: bool = False,
    detail_crop: bool = False,
) -> str:
    """Reusable DeviceShowcase – wide main + overlapping phone (or CSS detail crop)."""
    cls = f"wp-showcase wp-showcase--{variant} wp-showcase--br"
    wide_html = product_screen(wide, size="hero", priority=priority)
    if detail_crop and phone is None:
        # Controlled CSS crop of the same wide file (leksehjelp detail)
        src = SCREENS[wide]
        alt = ALTS[wide]
        detail = (
            f'<div class="wp-showcase-detail-card" aria-hidden="true">'
            f'<span class="wp-detail-crop"><img src="{e(src)}?v={CSS_V}" alt="" width="680" height="850" loading="lazy" decoding="async"></span>'
            f"</div>"
        )
        return (
            f'<div class="{cls} wp-showcase--detail">'
            f'<div class="wp-showcase-wide">{wide_html}</div>{detail}</div>'
        )
    phone_html = product_screen(phone, size="md", priority=priority) if phone else ""
    return (
        f'<div class="{cls}">'
        f'<div class="wp-showcase-wide">{wide_html}</div>'
        f'<div class="wp-showcase-phone">{phone_html}</div>'
        f"</div>"
    )


def phone_pair(left: str, right: str, left_label: str, right_label: str, lift_right: bool = True) -> str:
    lift = " wp-phone-pair-item--lift" if lift_right else ""
    return (
        '<div class="wp-phone-pair">'
        f'<div class="wp-phone-pair-item">{product_screen(left, size="md", label=left_label)}</div>'
        f'<div class="wp-phone-pair-item{lift}">{product_screen(right, size="md", label=right_label)}</div>'
        "</div>"
    )


def bullets(items: list[str]) -> str:
    if not items:
        return ""
    return '<ul class="wp-bullets">' + "".join(f"<li>{e(i)}</li>" for i in items) + "</ul>"


def value_strip() -> str:
    items = [
        ("Én felles oversikt", "Avtaler, oppgaver, skole og middager samlet på ett sted."),
        ("Mindre å minne om", "Fordel ansvar og la alle se hva som skal skje."),
        ("Tilpasset familien", "Voksne og barn får en visning som passer deres behov."),
    ]
    cards = "".join(
        f"<article><h3>{e(h)}</h3><p>{e(p)}</p></article>" for h, p in items
    )
    return (
        f'<section class="wp-section"><div class="wp-container">'
        f'<div class="wp-value-strip">{cards}</div></div></section>'
    )


def sales_feature(
    *,
    eyebrow: str,
    title: str,
    lead: str,
    points: list[str],
    cta_label: str,
    cta_href: str,
    visual: str,
    tone: str = "sky",
    note: str | None = None,
) -> str:
    note_html = f'<p class="wp-note">{e(note)}</p>' if note else ""
    return (
        f'<section class="wp-section wp-{tone}"><div class="wp-container">'
        f'<div class="wp-feature"><div class="wp-feature-copy">'
        f'<span class="wp-eyebrow">{e(eyebrow)}</span>'
        f"<h2>{e(title)}</h2>"
        f"<p>{e(lead)}</p>"
        f"{note_html}{bullets(points)}"
        f'{a(cta_href, cta_label, "wp-button")}'
        f'</div><div class="wp-feature-visual">{visual}</div></div></div></section>'
    )


def benefits(items, icons=(3, 4, 16)) -> str:
    parts = []
    for i, (h, p) in enumerate(items):
        parts.append(
            f'<article class="wp-benefit">{art(icons[i % 3])}<h3>{e(h)}</h3><p>{e(p)}</p></article>'
        )
    return '<div class="wp-benefits">' + "".join(parts) + "</div>"


def cards(keys) -> str:
    out = []
    for k in keys:
        if k not in MAP:
            continue
        m = MAP[k]
        search = e(m["name"] + " " + m["lead"])
        out.append(
            f'<a class="wp-card" data-module data-category="{e(m["group"])}" data-search="{search}" href="{e(href(k))}">'
            f'{art(m["art"])}<h3>{e(m["name"])}</h3><p>{e(m["benefits"][0][1])}</p>'
            f"<span>Utforsk →</span></a>"
        )
    return '<div class="wp-grid">' + "".join(out) + "</div>"


def flow(items, eyebrow="Kom i gang", title="Tre steg inn i hverdagen.") -> str:
    arts_html = []
    for i, (h, p) in enumerate(items):
        arts_html.append(
            f'<article class="wp-card"><span class="wp-eyebrow">0{i + 1}</span><h3>{e(h)}</h3><p>{e(p)}</p></article>'
        )
    return (
        f'<section class="wp-section wp-lavender"><div class="wp-container">'
        f'<span class="wp-eyebrow">{e(eyebrow)}</span><h2>{e(title)}</h2>'
        f'<div class="wp-grid">{"".join(arts_html)}</div></div></section>'
    )


def faq(items=None) -> str:
    items = items or FAQ
    body = "".join(f"<details><summary>{e(q)}</summary><p>{e(a)}</p></details>" for q, a in items)
    return (
        f'<section class="wp-section"><div class="wp-container wp-faq">'
        f"<h2>Spørsmål og svar</h2>{body}</div></section>"
    )


def closing(
    lead: str = "Start med det familien trenger mest. Legg til flere funksjoner når dere er klare.",
    heading: str = "Gjør plass til mer familieliv.",
    action=None,
) -> str:
    secondary = a("slik-fungerer-det", "Se hvordan det fungerer", "wp-button wp-button-secondary")
    btn = action or (cta("wp-button") + secondary)
    return (
        f'<section class="wp-section wp-closing"><div class="wp-container">'
        f'<span class="wp-eyebrow">Weekplan · familiens hverdag, samlet</span>'
        f"<h2>{e(heading)}</h2><p>{e(lead)}</p>"
        f'<div class="wp-actions" style="justify-content:center">{btn}</div>'
        f"</div></section>"
    )


def breadcrumb(name: str, trail=None) -> str:
    trail = trail or [("index", "Forside"), ("funksjoner", "Funksjoner")]
    bits = []
    for slug, label in trail:
        bits.append(a(slug, label))
        bits.append("<span>/</span>")
    bits.append(f"<span>{e(name)}</span>")
    return f'<nav class="wp-breadcrumb" aria-label="Brødsmulesti">{"".join(bits)}</nav>'


def page_hero(
    name: str,
    title: str,
    lead: str,
    visual: str,
    *,
    trail=None,
    secondary_href: str = "slik-fungerer-det",
    secondary_label: str = "Se hvordan det fungerer",
    dark: bool = False,
) -> str:
    sec = a(secondary_href, secondary_label, "wp-button wp-button-secondary")
    if dark:
        return (
            f'<section class="wp-hero"><div class="wp-container"><div class="wp-hero-grid">'
            f"<div><span class=\"wp-eyebrow\">{e(name)}</span>"
            f"<h1>{title}</h1>"
            f'<p class="wp-lead">{e(lead)}</p>'
            f'<div class="wp-actions">{cta()}{sec}</div>'
            f'<p class="wp-small">For voksne. For barn. For hverdagen dere deler.</p></div>'
            f'<div class="wp-feature-visual">{visual}</div>'
            f"</div></div></section>"
        )
    return (
        f'<section class="wp-section wp-sky"><div class="wp-container">{breadcrumb(name, trail)}'
        f'<div class="wp-feature"><div>'
        f'<span class="wp-eyebrow">{e(name)}</span><h1>{e(title)}</h1>'
        f'<p class="wp-lead">{e(lead)}</p>'
        f'<div class="wp-actions">{cta()}{sec}</div>'
        f'</div><div class="wp-feature-visual">{visual}</div></div></div></section>'
    )


def chrome_nav() -> str:
    links = "".join(a(k, v) for k, v in NAV)
    return (
        f'<a class="wp-skip" href="#main">Hopp til innhold</a>'
        f'<header class="wp-header"><div class="wp-container wp-header-inner">'
        f'<a href="/" aria-label="Weekplan hjem">'
        f'<img class="wp-logo" src="/img/logo-nav.png?v=4" alt="Weekplan" width="154" height="50">'
        f"</a>"
        f'<nav id="main-nav" class="wp-nav" aria-label="Hovedmeny">{links}'
        f'<a href="{e(CONFIG["login"])}">Logg inn</a></nav>'
        f'<div class="wp-header-actions">{cta()}'
        f'<button type="button" class="wp-menu-toggle" aria-controls="main-nav" aria-expanded="false">Meny</button>'
        f"</div></div></header>"
    )


def chrome_footer() -> str:
    return (
        f'<footer class="wp-footer"><div class="wp-container"><div class="wp-footer-grid">'
        f'<div><a href="/"><img class="wp-logo" src="/img/logo.png?v=4" alt="Weekplan" width="155" height="51"></a>'
        f"<p>En felles plan.<br>Litt mer rom for familielivet.</p></div>"
        f'<nav aria-label="Utforsk"><strong>Utforsk Weekplan</strong>'
        f'{a("funksjoner", "Alle funksjoner")}{a("for-foreldre", "For foreldre")}'
        f'{a("for-barn", "For barn")}{a("slik-fungerer-det", "Slik fungerer det")}</nav>'
        f'<nav aria-label="Hverdagen"><strong>Gjør hverdagen enklere</strong>'
        f'{a("gjoremal", "Gjøremål og oppgaver")}{a("belonning", "Stjerner og ukelønn")}'
        f'{a("skole", "Skole og læring")}{a("mat", "Mat og handling")}{a("familiespill", "Familiespill")}</nav>'
        f'<nav aria-label="Hjelp og kontakt"><strong>Finn frem</strong>'
        f'{a("hjelp", "Hjelp og veiledning")}{a("kontakt", "Kontakt")}'
        f'{a("produktbilder", "Se produktet")}'
        f'<a href="{e(CONFIG["privacy"])}">Personvern</a></nav>'
        f"</div>"
        f'<div class="wp-footer-bottom"><span>© Weekplan · Familiens hverdag, samlet.</span>'
        f"<span>Mobil · Nettbrett · PC</span></div></div></footer>"
        f'<dialog class="wp-dialog" aria-label="Forstørret produktbilde">'
        f'<button type="button" class="wp-dialog-close">Lukk bildet ×</button>'
        f'<img alt=""><p class="wp-sr-only"></p>'
        f'<a class="wp-original" target="_blank" rel="noopener">Åpne bildet i original størrelse</a>'
        f"</dialog>"
    )


def document(slug: str, title: str, lead: str, body: str) -> None:
    page_title = f"{title} – Weekplan"
    canonical = "https://www.weekplan.no/" if slug == "index" else f"https://www.weekplan.no/{slug}"
    ld = json.dumps(
        {"@context": "https://schema.org", "@type": "WebPage", "name": page_title, "description": lead, "inLanguage": "nb"},
        ensure_ascii=False,
    )
    html = f"""<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(page_title)}</title>
<meta name="description" content="{e(lead)}">
<meta name="theme-color" content="#152c4b">
<link rel="canonical" href="{e(canonical)}">
<meta property="og:title" content="{e(page_title)}">
<meta property="og:description" content="{e(lead)}">
<meta property="og:type" content="website">
<meta property="og:url" content="{e(canonical)}">
<meta property="og:image" content="https://www.weekplan.no/img/og-image.png">
<link rel="icon" href="/img/favicon.png?v=4">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Weekplan">
<link rel="stylesheet" href="/css/site.css?v={CSS_V}">
<script type="application/ld+json">{ld}</script>
<script>
(function () {{
  try {{
    var standalone = navigator.standalone === true
      || (window.matchMedia && (
        window.matchMedia("(display-mode: standalone)").matches
        || window.matchMedia("(display-mode: fullscreen)").matches
      ));
    // Only bounce into the SPA when this device prefers the app (set while
    // signed in). Logged-out home-screen launches must keep the marketing
    // homepage — never the legacy in-app Welcome at /hjem.
    var preferApp = false;
    try {{ preferApp = localStorage.getItem("weekplan_prefer_app") === "1"; }} catch (e2) {{}}
    if (standalone && preferApp) {{
      location.replace("/hjem");
    }}
  }} catch (e) {{}}
}})();
</script>
</head>
<body>
<div class="wp-marketing">
{chrome_nav()}
<main id="main">{body}</main>
{chrome_footer()}
</div>
<script src="/js/site.js?v={JS_V}"></script>
</body>
</html>
"""
    (OUT / f"{slug}.html").write_text(html)
    print(f"  wrote {slug}.html")


def leksehjelp_visual(*, priority: bool = False) -> str:
    """Large tablet-only leksehjelp shot — no cramped phone/detail crop."""
    return product_screen("10", size="xl", priority=priority, stage="")


def module_visual(slug: str) -> str:
    """Default hero visual per module – no device tabs."""
    mapping = {
        "gjoremal": lambda: device_showcase("08", "02", variant="compact", priority=True),
        "belonning": lambda: product_screen("02", size="solo", priority=True, stage="mint"),
        "progresjon": lambda: product_screen("02", size="solo", priority=True, stage=""),
        "tilpasning": lambda: product_screen("07d", size="solo", priority=True, stage=""),
        "kalender": lambda: device_showcase("08", "01", variant="kalender", priority=True),
        "ukeplan": lambda: leksehjelp_visual(priority=True),
        "lekser": lambda: leksehjelp_visual(priority=True),
        "leksehjelpen": lambda: leksehjelp_visual(priority=True),
        "maltidsplanlegger": lambda: device_showcase("09", "04", variant="mat", priority=True),
        "handleliste": lambda: device_showcase("09", "05", variant="mat", priority=True),
        "familiespill": lambda: product_screen("06", size="solo", priority=True, stage="play"),
        "min-dag": lambda: device_showcase("08", "01", variant="compact", priority=True),
    }
    fn = mapping.get(slug)
    if fn:
        return fn()
    # Illustration-only modules
    return art(MAP[slug]["art"])


def module_page(m: dict) -> None:
    k = m["slug"]
    visual = module_visual(k)
    body = page_hero(m["name"], m["title"], m["lead"], visual)
    body += f'<section class="wp-section"><div class="wp-container">{benefits(m["benefits"], (m["art"], 4, 16))}</div></section>'

    # Extra result sections per instruction
    if k == "maltidsplanlegger":
        body += (
            f'<section class="wp-section wp-mint"><div class="wp-container">'
            f'<div class="wp-feature"><div class="wp-feature-copy">'
            f'<span class="wp-eyebrow">Fra plan til handling</span>'
            f"<h2>Planen blir til en handleliste.</h2>"
            f"<p>Ingredienser og mengder fra de valgte rettene samles, slik at familien får et bedre utgangspunkt for handlingen.</p>"
            f"</div><div class=\"wp-feature-visual\">{product_screen('05', size='solo', stage='')}</div>"
            f"</div></div></section>"
        )
    elif k == "mat" or False:
        pass
    elif k == "leksehjelpen":
        # Already has detail crop in hero; keep story without repeating person screenshots
        pass

    body += (
        f'<section class="wp-section wp-mint"><div class="wp-container wp-story">'
        f"<div>{art(m['art'])}</div>"
        f'<div><span class="wp-eyebrow">Slik kan det brukes i hverdagen</span>'
        f"<h2>{e(m['story'][0])}</h2><p>{e(m['story'][1])}</p></div></div></section>"
    )
    steps = [(f"Steg {i + 1}", s) for i, s in enumerate(m["steps"])]
    body += flow(steps, "Slik bruker dere " + m["name"].lower())
    body += (
        f'<section class="wp-section"><div class="wp-container">'
        f'<span class="wp-eyebrow">Det henger sammen</span><h2>Neste lille steg.</h2>'
        f'{cards(m["related"])}</div></section>'
    )
    body += closing(m["lead"])
    document(k, m["name"], m["lead"], body)


def index_page() -> None:
    # 1 Hero
    body = page_hero(
        "En felles plan for hele familien",
        'Tenk om hodet ditt fikk <em>litt fri.</em>',
        INTRO,
        device_showcase("08", "01", variant="hero", priority=True),
        dark=True,
        secondary_href="slik-fungerer-det",
        secondary_label="Se hvordan det fungerer",
    )
    # 2 Value strip
    body += value_strip()
    # 3 Gjøremål / progresjon
    body += sales_feature(
        eyebrow="Gjøremål, stjerner og progresjon",
        title="Mindre mas. Mer mestring.",
        lead=(
            "Fordel oppgaver, gjør forventningene tydelige og la barnet markere det som er gjort. "
            "Den voksne følger fremgangen, godkjenner innsatsen og kan knytte gjøremålene til stjerner, "
            "opplevelser eller avtalt ukelønn."
        ),
        points=[
            "Tydelige oppgaver til riktig person",
            "Synlig progresjon og godkjenning",
            "Stjerner som kan spares mot et avtalt mål",
        ],
        cta_label="Utforsk gjøremål og belønning",
        cta_href="gjoremal",
        visual=product_screen("02", size="solo", stage="mint", priority=True),
        tone="sky",
    )
    # 4 Skole
    body += sales_feature(
        eyebrow="Skoleuke og leksehjelp",
        title="Fra ukeplan til oversikt. Fra spørsmål til neste steg.",
        lead=(
            "Weekplan kan lese ukeplaner og lekseplaner fra bilder og samle innholdet i en oversiktlig skoleuke. "
            "Når barnet står fast, kan det få barnevennlige hint og veiledning til å komme videre."
        ),
        points=[
            "Samle ukeplanen på ett sted",
            "Finn lekser og aktiviteter uten å lete",
            "Få hjelp til å forstå neste steg",
        ],
        cta_label="Utforsk skole og leksehjelp",
        cta_href="skole",
        visual=leksehjelp_visual(),
        tone="lavender",
        note="Innhold som leses inn med AI, skal alltid kontrolleres av en voksen før det brukes.",
    )
    # 5 Mat
    body += sales_feature(
        eyebrow="Måltidsplan og handleliste",
        title="Velg middagene. Handlelisten fyller seg.",
        lead=(
            "Planlegg måltidene ut fra familiens uke. Ingredienser og mengder samles i handlelisten, "
            "slik at veien fra middagsidé til handling blir kortere."
        ),
        points=[
            "Velg måltider for hele uken",
            "Samle ingredienser og mengder",
            "Legg inn varer med strekkodeskanning når noe går tomt",
        ],
        cta_label="Utforsk mat og handling",
        cta_href="mat",
        visual=device_showcase("09", "05", variant="mat"),
        tone="mint",
    )
    # 6 Barnevisning / tilpasning
    body += sales_feature(
        eyebrow="Tilpasset barnet",
        title="En barnevisning som kan vokse med barnet.",
        lead=(
            "Velg hvilke apper og funksjoner barnet skal ha tilgang til. Tilpass størrelse, innhold og snarveier "
            "etter alder og behov, slik at barnet møter en oversikt det forstår og ønsker å bruke."
        ),
        points=[
            "Foreldrestyrte apper og tilganger",
            "Enklere visning for yngre barn",
            "Flere funksjoner etter hvert som barnet blir eldre",
        ],
        cta_label="Se hvordan barnevisningen fungerer",
        cta_href="for-barn",
        visual=phone_pair("07d", "03", "Den voksne velger", "Barnet får sin visning"),
        tone="sky",
    )
    # 7 Familiespill
    body += sales_feature(
        eyebrow="Familiespill",
        title="En liten pause. En god grunn til å være sammen.",
        lead=(
            "Start en familiequiz, spill tre på rad eller velg en av de andre små aktivitetene. "
            "En enkel pause kan også få en naturlig plass i familiens hverdag."
        ),
        points=[],
        cta_label="Utforsk familiespill",
        cta_href="familiespill",
        visual=product_screen("06", size="solo", stage="play"),
        tone="mint",
    )
    # Fix empty bullets for familiespill – sales_feature always renders bullets
    # Rebuild familiespill without empty bullets list issue by patching: use custom if no points
    # Actually bullets([]) returns empty ul which is fine. Or remove ul when empty.
    # 8 Øvrige funksjoner
    body += (
        f'<section class="wp-section"><div class="wp-container">'
        f'<span class="wp-eyebrow">Alt har sin plass</span>'
        f"<h2>Alt det andre får også en fast plass.</h2>"
        f"<p>Notater, beskjeder, merkedager, ønsker og reiser er tilgjengelige når familien trenger dem "
        f"– uten at forsiden blir overfylt.</p>"
        f'{cards(["kalender", "notater", "chat", "gaveonsker", "vare-reiser", "familietreet", "husk-dato"])}'
        f'<p>{a("funksjoner", "Se alle funksjoner", "wp-button")}</p>'
        f"</div></section>"
    )
    # 9 Closing
    body += closing()
    document("index", "Tenk om hodet ditt fikk litt fri", INTRO, body)


def landing_page(slug: str, title: str) -> None:
    meta = LANDING[slug]

    if slug == "for-foreldre":
        body = page_hero(
            "For foreldre",
            meta["title"],
            meta["lead"],
            device_showcase("08", "01", variant="compact", priority=True),
            trail=[("index", "Forside")],
            secondary_href="funksjoner",
            secondary_label="Se funksjonene",
        )
        body += sales_feature(
            eyebrow="Progresjon",
            title="Følg fremgangen uten å følge etter.",
            lead="Se hva barnet har gjennomført, hva som venter på godkjenning og hvordan innsatsen utvikler seg over tid.",
            points=[],
            cta_label="Utforsk progresjon",
            cta_href="progresjon",
            visual=product_screen("02", size="solo", stage=""),
            tone="mint",
        )
        body += sales_feature(
            eyebrow="Tilpasning",
            title="Du bestemmer hvor mye barnet skal se.",
            lead="Skru apper og funksjoner av eller på, og tilpass opplevelsen etter alder, modenhet og familiens behov.",
            points=[],
            cta_label="Se tilpasning",
            cta_href="tilpasning",
            visual=product_screen("07d", size="solo", stage=""),
            tone="sky",
        )
        body += (
            f'<section class="wp-section"><div class="wp-container">'
            f'<span class="wp-eyebrow">Finn deres inngang</span>'
            f"<h2>En sammenhengende hverdag.</h2>"
            f'{cards(["min-dag", "kalender", "gjoremal", "progresjon", "tilpasning"])}'
            f"</div></section>"
        )
        body += closing(meta["lead"])
        document(slug, title, meta["lead"], body)
        return

    if slug == "for-barn":
        body = page_hero(
            "For barn",
            meta["title"],
            meta["lead"],
            device_showcase("08", "11", variant="compact", priority=True),
            trail=[("index", "Forside")],
        )
        body += sales_feature(
            eyebrow="Gjøremål og belønning",
            title="Mine oppgaver. Min fremgang.",
            lead="Barnet kan se egne oppgaver, markere det som er gjort og følge fremgangen mot ukelønn eller en annen belønning familien har avtalt.",
            points=[],
            cta_label="Utforsk gjøremål",
            cta_href="gjoremal",
            visual=product_screen("12", size="solo", stage="mint"),
            tone="mint",
        )
        body += (
            f'<section class="wp-section"><div class="wp-container">'
            f'{cards(["gjoremal", "belonning", "tilpasning", "lekser", "leksehjelpen", "familiespill"])}'
            f"</div></section>"
        )
        body += closing(meta["lead"])
        document(slug, title, meta["lead"], body)
        return

    if slug == "skole":
        body = page_hero(
            "Skole og læring",
            meta["title"],
            meta["lead"],
            leksehjelp_visual(priority=True),
            trail=[("index", "Forside")],
        )
        matte_card = (
            '<a class="wp-card" data-module data-category="Skole" '
            'data-search="Mattehjelpen Se barnet ditt blomstre på skolen oppgavebasert" '
            'href="/mattehjelpen">'
            f'{art(14)}'
            "<h3>Mattehjelpen</h3>"
            "<p>Oppgavebasert hjelp i matte, norsk og engelsk — hint først, blyanttavle og ros.</p>"
            "<span>Utforsk →</span></a>"
        )
        other = cards(["ukeplan", "lekser", "leksehjelpen", "bokhylla"])
        # cards() wraps in wp-grid; unwrap so we can prepend Mattehjelpen
        inner = other.removeprefix('<div class="wp-grid">').removesuffix("</div>")
        body += (
            f'<section class="wp-section"><div class="wp-container">'
            f'<div class="wp-grid">{matte_card}{inner}</div></div></section>'
        )
        body += closing(meta["lead"])
        document(slug, title, meta["lead"], body)
        return

    if slug == "mat":
        body = page_hero(
            "Mat og handling",
            meta["title"],
            meta["lead"],
            device_showcase("09", "05", variant="mat", priority=True),
            trail=[("index", "Forside")],
        )
        body += sales_feature(
            eyebrow="Oppskrifter",
            title="Fra middagsidé til ferdig handleliste.",
            lead="Velg en rett, tilpass måltidene til uken og samle varene som skal handles.",
            points=[],
            cta_label="Utforsk måltidsplanlegger",
            cta_href="maltidsplanlegger",
            visual=product_screen("04", size="solo", label="Velg middag", stage=""),
            tone="mint",
        )
        body += (
            f'<section class="wp-section"><div class="wp-container">'
            f'{cards(["maltidsplanlegger", "handleliste", "kalender", "chat"])}</div></section>'
        )
        body += closing(meta["lead"])
        document(slug, title, meta["lead"], body)
        return

    if slug == "slik-fungerer-det":
        body = page_hero(
            "Slik fungerer det",
            meta["title"],
            meta["lead"],
            art(meta["art"]),
            trail=[("index", "Forside")],
        )
        steps = [
            ("1. Den voksne tilpasser", "Velg apper og tilganger.", product_screen("07d", size="md")),
            ("2. Barnet får sin visning", "Bare det barnet trenger.", product_screen("03", size="md")),
            (
                "3. Familien følger den samme planen",
                "Tilgjengelig på mobil, nettbrett og PC.",
                device_showcase("08", "01", variant="compact"),
            ),
        ]
        workflow = '<div class="wp-workflow">'
        for label, heading, visual in steps:
            workflow += (
                f'<article class="wp-workflow-step"><div>'
                f'<span class="wp-eyebrow">{e(label)}</span><h2>{e(heading)}</h2></div>'
                f'<div>{visual}</div></article>'
            )
        workflow += "</div>"
        body += f'<section class="wp-section"><div class="wp-container">{workflow}</div></section>'
        body += flow(START, "Kom i gang", "Begynn med én ting. Bygg videre sammen.")
        body += faq()
        body += closing(meta["lead"])
        document(slug, title, meta["lead"], body)
        return

    if slug == "funksjoner":
        body = page_hero(
            "Funksjoner",
            meta["title"],
            meta["lead"],
            art(meta["art"]),
            trail=[("index", "Forside")],
        )
        ordered = [s for s in FUNKSJONER_ORDER if s in MAP]
        rest = [m["slug"] for m in MODULES if m["slug"] not in ordered]
        groups = list(dict.fromkeys(m["group"] for m in MODULES))
        chips = "".join(
            f'<button class="wp-chip" type="button" data-filter="{e(g)}" aria-pressed="{str(i == 0).lower()}">{e(g)}</button>'
            for i, g in enumerate(["Alle"] + groups)
        )
        body += (
            f'<section class="wp-section"><div class="wp-container" data-search-area>'
            f'<label for="module-search">Søk etter en funksjon eller et behov</label>'
            f'<div class="wp-search"><input id="module-search" type="search" placeholder="For eksempel lekser">'
            f'<button class="wp-button wp-button-secondary" type="button" data-reset>Nullstill</button></div>'
            f'<div class="wp-search">{chips}</div>'
            f'<p data-count aria-live="polite"></p>'
            f"{cards(ordered + rest)}"
            f'<p data-empty hidden>Ingen treff. Prøv et annet søkeord eller nullstill filtrene.</p>'
            f"</div></section>"
        )
        body += closing(meta["lead"])
        document(slug, title, meta["lead"], body)
        return

    if slug == "produktbilder":
        body = page_hero(
            "Produktbilder",
            meta["title"],
            meta["lead"],
            art(meta["art"]),
            trail=[("index", "Forside"), ("funksjoner", "Funksjoner")],
        )
        gallery_keys = ["08", "01", "02", "03", "09", "04", "05", "06", "07d", "10"]
        items = "".join(
            f'<article class="wp-card"><h2>{e(ALTS[k])}</h2>{product_screen(k, size="md")}</article>'
            for k in gallery_keys
        )
        body += f'<section class="wp-section"><div class="wp-container"><div class="wp-grid wp-grid-two">{items}</div></div></section>'
        body += closing(meta["lead"])
        document(slug, title, meta["lead"], body)
        return

    # hjelp / kontakt defaults
    body = page_hero(
        title,
        meta["title"],
        meta["lead"],
        art(meta["art"]),
        trail=[("index", "Forside")],
    )
    if slug == "hjelp":
        body += (
            f'<section class="wp-section"><div class="wp-container">'
            f'{cards(["tilpasning", "gjoremal", "ukeplan", "leksehjelpen", "maltidsplanlegger", "familieposisjon"])}'
            f"</div></section>"
        )
        body += faq()
        body += closing(
            "Se kontaktmulighetene på kontaktsiden.",
            "Trenger du hjelp med noe konkret?",
            a("kontakt", "Kontakt Weekplan", "wp-button"),
        )
    elif slug == "kontakt":
        body += (
            '<section class="wp-section"><div class="wp-container"><div class="wp-grid">'
            f'<article class="wp-card"><h2>Spørsmål om bruken?</h2>'
            f"<p>Se forklaringene om familiens verktøy.</p>{a('hjelp', 'Finn hjelp og veiledning →')}</article>"
            f'<article class="wp-card"><h2>Send oss en melding</h2>'
            f"<p>Bruk skjemaet. Fortell hvilken funksjon og enhet det gjelder. Skjul navn og personopplysninger i vedlegg.</p></article>"
            f'<article class="wp-card"><h2>Personvern</h2>'
            f"<p>Les hvordan vi behandler personopplysninger.</p>"
            f'{a("personvern", "Les personvernerklæringen →")}</article>'
            f"</div>"
            f'<form class="wp-form" data-contact-form>'
            f"<label>Navn <input type=\"text\" name=\"name\" autocomplete=\"name\"></label>"
            f"<label>E-post <input type=\"email\" name=\"email\" required autocomplete=\"email\"></label>"
            f"<label>Melding <textarea name=\"message\" rows=\"5\" required></textarea></label>"
            f'<button class="wp-button" type="submit">Send melding</button>'
            f'<p class="note" role="status"></p>'
            f"</form></div></section>"
        )
        body += closing(meta["lead"])
    else:
        body += closing(meta["lead"])
    document(slug, title, meta["lead"], body)


def personvern_page() -> None:
    lead = "Vi behandler personopplysninger for å levere Weekplan – ikke for å selge dem."
    body = page_hero(
        "Personvern",
        "Familiens data skal føles trygt.",
        lead,
        art(2),
        trail=[("index", "Forside")],
    )
    body += (
        '<section class="wp-section"><div class="wp-container wp-prose">'
        "<p>Konto, familieinnhold og nødvendig teknisk informasjon. Du kan be om innsyn, retting eller sletting.</p>"
        "<p>Kontakt <a href=\"mailto:support@weekplan.no\">support@weekplan.no</a> ved spørsmål om personvern.</p>"
        f"<p>{cta()}</p></div></section>"
    )
    body += closing(lead)
    document("personvern", "Personvern", lead, body)


def mattehjelpen_page() -> None:
    """Kampanjeside: Mattehjelpen — lekbasert læringsmodul 3–16 år."""
    title = "Mattehjelpen"
    lead = (
        "Læring som føles som lek. Spill, oppdrag og AI-los i matte, norsk og engelsk — "
        "fra 3 år og oppover. Norske metoder, hint først, stjerner for innsats."
    )
    signup = a("signup", "Start gratis i 14 dager", "wp-button")
    secondary = a("leksehjelpen", "Se også Leksehjelpen", "wp-button wp-button-secondary")

    worlds = [
        ("Småtroll", "3–5 år", "Telle, sortere, bokstaver og farger — store knapper, umiddelbar ros.", "smaatroll"),
        ("Oppdagere", "6–9 år", "Små oppdrag, pluss/minus, rim og engelske ord med stjerner.", "oppdagere"),
        ("Mestring", "10–13 år", "Mengdetrening, strategier og AI-los med hint — ikke fasit først.", "mestring"),
        ("Utfordring", "14–16 år", "Brøk, prosent, likninger og resonnering mot prøver.", "utfordring"),
    ]
    world_tones = ["matte", "norsk", "engelsk", "matte"]
    world_html = "".join(
        f'<article class="wp-theme-card wp-theme-card--{world_tones[i]}" role="listitem">'
        f'<span class="wp-theme-age">{e(age)}</span>'
        f'<span class="wp-theme-kicker">VERDEN</span>'
        f"<h3>{e(name)}</h3><p>{e(blurb)}</p></article>"
        for i, (name, age, blurb, _) in enumerate(worlds)
    )

    themes = [
        ("MATTE", "Matematikk", "3–16 år", "Fra antall og former til gangetabell, brøk og likninger.", "14-ai-veiledning.png", "matte"),
        ("NORSK", "Norsk", "3–16 år", "Bokstaver, rim, verb og komma — lek først, deretter dybde.", "13-skole-og-ai.png", "norsk"),
        ("ENGLISH", "Engelsk", "3–16 år", "Farger, dyr, ord og past tense gjennom spill og oppdrag.", "07-skole.png", "engelsk"),
    ]
    theme_cards = "".join(
        f'<article class="wp-theme-card wp-theme-card--{tone}" role="listitem">'
        f'<span class="wp-theme-age">{e(age)}</span>'
        f'<img class="wp-illustration" src="{ASSET}/art/{img}" alt="" loading="lazy" decoding="async">'
        f'<span class="wp-theme-kicker">{e(kicker)}</span>'
        f"<h3>{e(label)}</h3><p>{e(blurb)}</p></article>"
        for kicker, label, age, blurb, img, tone in themes
    )

    body = (
        f'<section class="wp-section wp-sky"><div class="wp-container">'
        f'{breadcrumb(title, [("index", "Forside"), ("skole", "Skole og læring")])}'
        f'<div class="wp-feature"><div>'
        f'<span class="wp-eyebrow">Mattehjelpen · egen modul i Weekplan</span>'
        f"<h1>Læring som føles som lek</h1>"
        f'<p class="wp-lead">{e(lead)}</p>'
        f'<div class="wp-offer" role="group" aria-label="Pristilbud">'
        f'<span class="wp-offer-was">Etter prøveperioden</span>'
        f'<span class="wp-offer-price">49 kr/mnd</span>'
        f'<span class="wp-offer-note">14 dager gratis — uten kort først · hele familien</span>'
        f"</div>"
        f'<div class="wp-actions">{signup}{secondary}</div>'
        f'</div><div class="wp-feature-visual">{leksehjelp_visual(priority=True)}</div>'
        f"</div></div></section>"
    )

    body += (
        '<section class="wp-section"><div class="wp-container">'
        '<span class="wp-eyebrow">Fire verdener</span>'
        "<h2>Fra 3 år — tilpasset barnet foran deg</h2>"
        '<p class="wp-lead" style="max-width:40rem">'
        "Ikke én flat app for alle. Mattehjelpen møter barnet i riktig verden: "
        "lek for de minste, oppdrag for skolestartere, AI-los for de eldre."
        "</p>"
        f'<div class="wp-theme-rail" role="list">{world_html}</div>'
        "</div></section>"
    )

    body += (
        '<section class="wp-section wp-lavender"><div class="wp-container">'
        '<span class="wp-eyebrow">Tre måter å lære</span>'
        "<h2>Spill. Oppdrag. AI-los.</h2>"
        '<div class="wp-grid">'
        '<article class="wp-card"><span class="wp-eyebrow">01</span><h3>Lek &amp; spill</h3>'
        "<p>Trykk, match og tell. Umiddelbar feedback — inspirert av Kikora-mengdetrening, "
        "pakket som mini-spill (Albert-stil, Weekplan-unik).</p></article>"
        '<article class="wp-card"><span class="wp-eyebrow">02</span><h3>Dagens oppdrag</h3>'
        "<p>En tilpasset løype med flere runder. Stjerner for innsats. Growth mindset: "
        "vi roser metode, ikke «du er smart».</p></article>"
        '<article class="wp-card"><span class="wp-eyebrow">03</span><h3>AI-losen</h3>'
        "<p>Sokratiske hint, blyanttavle og scaffolding (Lekselos / Wood). "
        "Aldri blank fasit først — foresatte styrer om fasit finnes.</p></article>"
        "</div></div></section>"
    )

    body += (
        '<section class="wp-section"><div class="wp-container">'
        '<span class="wp-eyebrow">Fag</span>'
        "<h2>Matte, norsk og engelsk — samlet</h2>"
        f'<div class="wp-theme-rail" role="list">{theme_cards}</div>'
        f'<div class="wp-actions" style="margin-top:28px">{signup}</div>'
        "</div></section>"
    )

    body += (
        f'<section class="wp-section"><div class="wp-container">'
        f'{benefits([("Norske metoder", "Rammeplan for barnehagen (3–5) og LK20 for skolealder. Scaffolding, sokratiske spørsmål, mengdetrening."), ("Unik AI-los", "Hint og delsteg før fasit. Blyanttavle som tegner tenkningen. Ros for innsats — ikke juks."), ("Hele familien", "Samme Weekplan-abonnement: Mattehjelpen + Leksehjelpen + ukeplan og lekser. 49 kr/mnd etter prøve.")], (14, 4, 7))}'
        f"</div></section>"
    )

    body += (
        '<section class="wp-section wp-mint"><div class="wp-container wp-story">'
        f"<div>{art(14)}</div>"
        "<div><span class=\"wp-eyebrow\">Bedre enn kjøkkenbord-krigen</span>"
        "<h2>Leksehjelp uten masing — læring med mestring.</h2>"
        "<p>Albert viste at barn elsker spillbasert læring. Lekselos viste at hint slår fasit. "
        "Kikora viste at mengdetrening virker. House of Math viste mikrolæring. "
        "Mattehjelpen tar det beste, legger til en AI-los som faktisk loser — og knytter det til "
        "familiens ukeplan og lekser i Weekplan. Én plan. Mer mestring. Mindre mas.</p>"
        "</div></div></section>"
    )

    body += flow(
        [
            ("Velg barnets verden", "Småtroll, Oppdagere, Mestring eller Utfordring — alder styrer vanskelighetsgrad."),
            ("Spill eller ta et oppdrag", "Interaktive runder med umiddelbar feedback, eller AI-los med hint."),
            ("Samle stjerner, se fremgang", "Innsats synlig for barnet — ro hjemme for foresatte."),
        ],
        "Slik fungerer Mattehjelpen",
        "Tre steg til mer mestring.",
    )

    body += (
        f'<section class="wp-section"><div class="wp-container">'
        f'<span class="wp-eyebrow">Det henger sammen</span><h2>Neste lille steg.</h2>'
        f'{cards(["leksehjelpen", "lekser", "ukeplan"])}</div></section>'
    )
    body += closing(
        "Aktiver Mattehjelpen i Weekplan. Legg til Leksehjelpen når leksen trenger bilde og blyanttavle.",
        "Gi barnet et sted å blomstre — gjennom lek.",
        action=signup + secondary,
    )
    document("mattehjelpen", title, lead, body)


def main() -> None:
    print("Generating marketing pages…")
    for m in MODULES:
        module_page(m)
    index_page()
    for r in ROUTES:
        k = r["file"][:-5]
        if k in MAP or k == "index" or k == "mattehjelpen":
            continue
        if k not in LANDING:
            continue
        landing_page(k, r["title"])
    personvern_page()
    mattehjelpen_page()
    print("Done.")


if __name__ == "__main__":
    main()
