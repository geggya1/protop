# Instruks til Cursor – ProTop ISO/K-HMS V2

Les først `00_START_HER.md` og deretter `01_` til `08_`-dokumentene. Åpne `ProTop_ISO_INTERAKTIV_PROTOTYPE.html` i nettleser og undersøk spesielt «Visuell katalog», «Prosessbygger», «Skjemabygger», «ISO-kravmatrise», «Avvik og tiltak» og «Mål og KPI-er». Alle illustrasjoner er produktkrav/referanser, ikke fungerende produksjonslogikk.

Start med faktisk GAP-analyse av eksisterende ProTop (auth, selskaper, ansatte, prosjekter, kunder, kontrakter, dokumenter, oppgaver, godkjenninger og design-system). Lag avhengighetskart, datamodell, migreringer, API-er og testplan. Implementer én fungerende vertikal E2E-kjede for avvik (registrering→vurdering→årsak→tiltak→effekt→lukking→evidens i kravmatrise/revisjon) og én for prosessdesign (dra/slipp→valider→godkjenn→publiser→kjør instans→oppgave→historikk). Utvid med resten av den dokumenterte funksjonskatalogen.

Alle grafer skal ha faktisk kilde, beregningsmetode, filter, enheter, tilgjengelig tabell og drilldown. Alle skjemaene skal versjoneres, lagres, ha rolle-/felttilganger og dokumenterbare registreringer. Gjenbruk ProTops masterdata; aldri vis fiktive demodata i produksjon. En app kan ikke garantere sertifisering. Normative krav må faglig kvalitetssikres mot lisensierte ISO-standarder.
