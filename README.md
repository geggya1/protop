# ProTop

Digitale løsninger for bygg og anlegg.

The static landing page is `index.html`. Official logo files and the usage rules live in [`brand/README.md`](brand/README.md).

The signed-in shell is the Expo app in this repo. The samhandling modules are hjem, venner, kalender, e-post, oppgaver and notat. The Firebase client and Hosting config target only project `protop-c189c`.

Offentlig adresse er [https://protop.no](https://protop.no), uten www til sertifikatet for www er klart. Reserve er [https://protop-c189c.web.app](https://protop-c189c.web.app).

```bash
npm run build:web
npx firebase deploy --only hosting --project protop-c189c
```
