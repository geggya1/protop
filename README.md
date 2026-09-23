# ProTop

Digitale løsninger for bygg og anlegg.

The static landing page is `index.html`. Official logo files and the usage rules live in [`brand/README.md`](brand/README.md).

The signed-in shell is the Weekplan framework, loaded as-is for mobil, nettbrett and web. Visible modules are hjem, venner, kalender, e-post, oppgaver and notat, together with innstillinger, varslinger, hjelp and the rest of the account section. Other family modules are not shown. Product name, domain and Firebase project are ProTop.

The same Expo codebase is the client for web, tablet, App Store and Google Play (`no.protop.app`). Live data uses the Firebase JS SDK, so realtime listeners are shared. Brand colour is digital blue `#1099F4`, navy `#07274C`. Icons are generated from `brand/ProTop_symbol_square_2048.png` with `npm run sync:logo`.

Prosjekt is the construction platform inside that shell: portfolio, progress, HSE, quality, documents, meetings, project accounting on account and NS 3451 codes, and the ISO 9001/14001/45001 procedures. The project record is stored on the device. A hosted BIM viewer is not part of this build.

The Firebase client and Hosting config target only project `protop-c189c`. Cloud Functions source in `functions/` is retargeted to the same project and is not part of `firebase deploy` until Hosting is published on purpose. Do not deploy this app to Weekplan.

Offentlig adresse er [https://protop.no](https://protop.no), uten www til sertifikatet for www er klart. Reserve er [https://protop-c189c.web.app](https://protop-c189c.web.app).

```bash
npm run build:web
npx firebase deploy --only hosting --project protop-c189c
```
