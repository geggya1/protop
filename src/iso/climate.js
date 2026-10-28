/**
 * Klima på systemnivå (ISO 9001/14001/45001 4.1 og 4.2, Amd 1:2024): virksomheten skal avgjøre om
 * klimaendringer er et relevant forhold, og interessenter kan ha klimakrav. Avgjørelsen lagres med
 * begrunnelse, dato og hvem på oppsettet (isoSystem/main) og brukes i sertifiseringsklar og i
 * ledelsens gjennomgang. Er klima relevant, foreslås klimarisikoer til risikoregisteret.
 */
import { auditEvent, bump, fail, text, todayKey } from './core.js';

export function climateDecided(system) {
  const c = system?.climate;
  return !!c && (c.relevant === true || c.relevant === false) && text(c.rationale).length >= 10;
}

/** Ny eller endret avgjørelse om klimaendringer. Krever valg og en begrunnelse på minst én setning. */
export function setClimateDecision(system, input, { actor, caps = null, now = new Date() } = {}) {
  if (caps && !caps.admin) return fail('Bare administrator i ISO kan endre oppsettet for ledelsessystemet.');
  if (input?.relevant !== true && input?.relevant !== false) return fail('Velg om klimaendringer er et relevant forhold.');
  const rationale = text(input?.rationale, 2000);
  if (rationale.length < 10) return fail('Begrunn avgjørelsen (minst én setning).');
  const climate = {
    relevant: input.relevant,
    rationale,
    assessedAt: todayKey(now),
    by: text(actor?.name, 160),
    byUid: text(actor?.uid, 128),
    history: [...(system?.climate?.history || []), ...(system?.climate?.assessedAt ? [{ relevant: system.climate.relevant, rationale: system.climate.rationale, assessedAt: system.climate.assessedAt, by: system.climate.by || '' }] : [])].slice(-10),
  };
  const next = bump({ ...system, climate }, actor, now);
  return {
    ok: true,
    system: next,
    events: [auditEvent({ entityType: 'system', entityId: 'main', action: 'iso.system.climate', actor, before: system, after: next, now })],
  };
}

/** Forslag til klimarisikoer når klima er relevant (ekstremvær, hete, krav fra kunder og myndigheter). */
export function climateRiskSuggestions(state) {
  if (state?.system?.climate?.relevant !== true) return [];
  const have = new Set((state.records?.risiko || []).map((r) => text(r.title).toLowerCase()));
  return [
    { kind: 'Risiko', title: 'Ekstremvær stopper eller skader arbeid på byggeplass', category: 'prosjekt', description: 'Kraftig nedbør, flom, storm og frost gir forsinkelser, fuktskader og farlige forhold.', controls: 'Værvarsel i planleggingen, sikring av materialer og stillas, beredskap ved flom.', source: 'Klimavurdering (Amd 1:2024)' },
    { kind: 'Risiko', title: 'Hete og kulde i arbeidsmiljøet ute', category: 'arbeidsmiljo', description: 'Hetebølger og kuldeperioder gir helsebelastning og flere ulykker.', controls: 'Tilpasset arbeidstid, pauser, drikke og verneutstyr.', source: 'Klimavurdering (Amd 1:2024)' },
    { kind: 'Risiko', title: 'Strengere klimakrav fra kunder og myndigheter', category: 'strategisk', description: 'Krav om klimagassregnskap, utslippsfrie byggeplasser og lavkarbonmaterialer i anbud.', controls: 'Følge med på krav i anbud og kontrakter, klimagassregnskap.', source: 'Klimavurdering (Amd 1:2024)' },
    { kind: 'Mulighet', title: 'Klimatilpassede løsninger som konkurransefortrinn', category: 'strategisk', description: 'Kunder etterspør klimatilpasning og lavutslippsbygg.', benefit: 'Flere oppdrag og bedre marginer på klimavennlige løsninger.', source: 'Klimavurdering (Amd 1:2024)' },
  ].filter((r) => !have.has(r.title.toLowerCase()));
}
