# Flyt-boten

Testboter som spiller ekte brukere mot hverandre i ProTop: én inviterer, en annen godtar, en tredje jobber i samme prosjekt. Botene kjører i Playwright mot lokale Firebase-emulatorer med de ekte `firestore.rules` og alle skyfunksjonene appen bruker. De kjører aldri mot protop.no eller prosjektet i skyen.

## Kjøre

```bash
npm ci && npm ci --prefix functions

# 1. Emulatorer: Auth, Firestore, Storage og Functions (samme inngangsfiler som slim-deployen)
node scripts/e2e/emulators.mjs

# 2. Web koblet mot emulatorene (eget terminalvindu)
EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 npx expo start --web --port 8081

# 3. Sidegjennomgang med skjermbilder og automatiske sjekker
node scripts/e2e/crawl.mjs --views=phone,desktop --out=e2e-out/crawl

# 4. Scenarioene
node scripts/e2e/scenarios/<navn>.mjs
```

E-post og SMS sendes ikke ut. `mailcatcher.js` fanger dem i `e2e-out/mail.jsonl`, og botene henter invitasjonslenker derfra (`readMails`, `mailsTo` og `linksIn` i `lib/emu.mjs`).

## Sidegjennomgangen

`crawl.mjs` åpner alle sidene i hjelpekatalogen (`src/help/protopPages.js`). For hver side tar den skjermbilde og sjekker:

- JS-feil og funksjonskall som feiler
- vannrett rulling (innhold som er bredere enn telefonen)
- `undefined`, `NaN`, `[object Object]` og rå i18n-nøkler i synlig tekst
- engelsk tekst i norsk visning
- knapper uten tilgjengelig navn
- små trykkflater på telefon

Resultatet skrives til `<out>/crawl.json`.

## Bibliotek

- `lib/bot.mjs`: `Bot` er én bruker i sin egen nettleserkontekst. Den har `login`, `open(tab, subView)`, `click`, `fill`, `shot` og `hasText`, og samler JS-feil og kall som feiler.
- `lib/emu.mjs`: REST mot emulatorene. Den oppretter brukere, leser og skriver dokumenter med admin-tilgang, kaller funksjoner som innlogget bruker og leser fangede e-poster.

Scenarioene lager egne brukere og selskaper med unikt prefiks, så flere kan kjøre samtidig. Når du skal teste hva reglene faktisk tillater, bruker du REST med brukerens `idToken`, ikke admin-tilgang.

Lokalt bruker firebase-tools `HTTPS_PROXY` også for kall til `127.0.0.1`. Bak en proxy som stopper slike kall, kan ikke Functions-emulatoren registrere Firestore-triggere. Kjør da uten proxy for localhost.
