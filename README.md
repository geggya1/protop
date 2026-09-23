# ProTop

Digitale løsninger for bygg og anlegg.

The static landing page is `index.html`. Official logo files and the usage rules live in [`brand/README.md`](brand/README.md).

The signed-in shell is the Weekplan framework, loaded as-is for mobil, nettbrett and web. Visible modules are hjem, venner, kalender, e-post, oppgaver and notat, together with innstillinger, varslinger, hjelp and the rest of the account section. Other family modules are not shown. Product name, domain and Firebase project are ProTop.

The Firebase client and Hosting config target only project `protop-c189c`. Cloud Functions source in `functions/` is retargeted to the same project and is not part of `firebase deploy` until Hosting is published on purpose. Do not deploy this app to Weekplan.

Offentlig adresse er [https://protop.no](https://protop.no), uten www til sertifikatet for www er klart. Reserve er [https://protop-c189c.web.app](https://protop-c189c.web.app).

```bash
npm run build:web
npx firebase deploy --only hosting --project protop-c189c
```
