# ProTop

ProTop er digitale løsninger for bygg og anlegg.

Logoene ligger i [`brand/`](brand/). Neste leveranse kan legges i samme mappe og registreres i [`brand/manifest.json`](brand/manifest.json).

Siden bruker primærlåsen i toppfelt og hero på lys bakgrunn, den hvite låsen på mørk bakgrunn, og merket som favicon og appikon.

## Deploy

Statisk side på Firebase Hosting, site `protop-bygg`:

https://protop-bygg.web.app

```bash
npx -y firebase-tools@latest deploy --only hosting --project weekplan-4310f
```

`firebase.json` setter `"site": "protop-bygg"`. Kommandoen publiserer ikke til standard-siten for Weekplan (`weekplan-4310f`). Eneste tilgjengelige Firebase-prosjekt for disse påloggingsdataene er `weekplan-4310f`.
