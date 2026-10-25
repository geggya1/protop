# Hjelpe-boten

Går gjennom alle ProTop-sidene i en ekte nettleser (Playwright) og kontrollerer hjelpen:

- **Lyspæren** finnes, ligger innenfor skjermen og er øverst (ikke dekket av toppbilde, modulbånd eller varselstripe) — på mobil, nettbrett og PC.
- **Hjelpekortet** viser riktig side: tittel, «Hvor», alle stegene og arbeidsflyten siden hører til.
- **Rundturen** («Vis meg steg for steg»): hvert steg har riktig overskrift og «Steg X av Y», markeringen ligger innenfor skjermen og ikke i menyen, kortet dekker ikke det markerte, og turen lukkes når den er ferdig. Rapporten teller hvor mange steg som fant den ekte knappen.
- **«Trykk for å åpne»**: ligger knappen bak noe annet (f.eks. «Lagre kunde» bak «Ny kunde», eller en ansatt som må velges først), markerer turen det brukeren må trykke først. Boten trykker markeringen slik en bruker gjør, og sjekker at turen da finner knappen — eller forklarer når den dukker opp. Rapporten lister steg som verken markeres eller forklares.
- **Arbeidsflytene** (f.eks. «Fra anbud til faktura») åpner riktig side for hvert steg.
- **ProTop-assistenten** i chatten: et batteri av spørsmål, avvisning av andre tema, lojalitet mot ProTop, supportsak med saksnummer, og «Vis meg» fra et svar som åpner siden og starter rundturen.

Boten kjører mot lokale Firebase-emulatorer, aldri mot protop.no eller prosjektet i skyen.

## Kjøre

```bash
npm ci && npm ci --prefix functions

# 1. Emulatorer (Auth, Firestore, AI-/supportfunksjonene) + testbedrift
node scripts/help-bot/emulators.mjs

# 2. Web koblet mot emulatorene (eget terminalvindu)
EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 npx expo start --web --port 8081

# 3. Boten (eget terminalvindu). Krever Playwright med Chromium.
node scripts/help-bot/run.mjs --views=phone,tablet,desktop
```

Valg:

| Valg | Betydning |
|---|---|
| `--views=phone,tablet,desktop` | Skjermstørrelser som testes |
| `--pages=anbud.varsling,projects` | Bare disse sidene (nøkler fra `src/help/protopPages.js`) |
| `--no-processes` / `--no-assistant` | Hopp over arbeidsflyter / assistent |
| `--shots=first\|all\|none` | Skjermbilder av første steg, alle steg eller ingen |
| `--out=help-bot-out` | Mappe for `rapport.md`, `rapport.json` og skjermbilder |

Boten avslutter med kode 1 hvis noe feiler.

## Hvordan den finner frem

`EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` kobler web-klienten til emulatorene (`firebase.js`) og slår på to test-kroker som bare finnes i slike bygg: `window.__protopBot.openShell(tab, subView)` åpner en side direkte, og `window.__protopHelp` viser hvilken hjelpeside, modus og steg som er aktive.

Sidelisten kommer fra `src/help/protopPages.js`, så en ny side med hjelp blir testet automatisk.

Steg peker på knapper med `find` (synlig tekst, aria-label, testID, plassholder — eller `#id` / `#prefiks*` for nativeID). `via` er knappen som åpner stedet der steget skjer, og `pending` forklarer når knappen vises (f.eks. «vises når det finnes fakturaer»).
