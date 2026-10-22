/**
 * Skjemabygger og registreringer (M05 / fil 04).
 * Et styrt skjema er en versjonert definisjon. En innsendt registrering er et eget
 * objekt som bevarer skjemaversjon og felt. Innsendt = låst; retting krever ny hendelse.
 * Regler er deklarative (show/require når felt = verdi). Ingen eval av kode.
 */
import {
  auditEvent, bump, checksum, fail, isoDate, newId, nowIso, pushHistory, text,
} from './core.js';

export const FIELD_TYPES = [
  { id: 'short_text', label: 'Kort tekst', group: 'Tekst' },
  { id: 'long_text', label: 'Lang tekst', group: 'Tekst' },
  { id: 'integer', label: 'Heltall', group: 'Tall' },
  { id: 'decimal', label: 'Desimaltall', group: 'Tall' },
  { id: 'percentage', label: 'Prosent', group: 'Tall' },
  { id: 'date', label: 'Dato', group: 'Tid' },
  { id: 'time', label: 'Klokkeslett', group: 'Tid' },
  { id: 'single_select', label: 'Enkeltvalg', group: 'Valg' },
  { id: 'multi_select', label: 'Flervalg', group: 'Valg' },
  { id: 'checkbox', label: 'Avkrysning', group: 'Valg' },
  { id: 'yes_no_na', label: 'Ja / Nei / Ikke aktuelt', group: 'Valg' },
  { id: 'rating', label: 'Vurdering 1–5', group: 'Valg' },
  { id: 'user_ref', label: 'Person', group: 'Oppslag' },
  { id: 'project_ref', label: 'Prosjekt', group: 'Oppslag' },
  { id: 'customer_ref', label: 'Kunde', group: 'Oppslag' },
  { id: 'requirement_ref', label: 'Krav', group: 'Oppslag' },
  { id: 'location', label: 'Sted', group: 'Oppslag' },
  { id: 'file', label: 'Vedlegg (lenke)', group: 'Filer' },
  { id: 'likelihood', label: 'Sannsynlighet 1–5', group: 'Risiko' },
  { id: 'consequence', label: 'Konsekvens 1–5', group: 'Risiko' },
  { id: 'table_repeatable', label: 'Tabell (rader)', group: 'Struktur' },
  { id: 'signature_ack', label: 'Bekreftelse', group: 'Kontroll' },
  { id: 'calculated', label: 'Beregnet (sum/produkt)', group: 'Kontroll' },
  { id: 'heading', label: 'Overskrift', group: 'Struktur' },
  { id: 'help_text', label: 'Hjelpetekst', group: 'Struktur' },
];

const INPUT_TYPES = new Set(FIELD_TYPES.map((f) => f.id).filter((id) => !['heading', 'help_text', 'calculated'].includes(id)));

export function fieldTypeLabel(id) {
  return FIELD_TYPES.find((f) => f.id === id)?.label || id;
}

export function makeField(type, patch = {}) {
  const key = text(patch.key, 60) || `felt_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id: patch.id || newId('fld'),
    key,
    type: FIELD_TYPES.some((f) => f.id === type) ? type : 'short_text',
    label: text(patch.label, 200) || fieldTypeLabel(type),
    help: text(patch.help, 500),
    required: !!patch.required,
    options: (patch.options || []).map((o) => text(o, 120)).filter(Boolean),
    columns: (patch.columns || []).map((o) => text(o, 80)).filter(Boolean),
    showIf: patch.showIf?.field ? { field: text(patch.showIf.field, 60), equals: patch.showIf.equals } : null,
    requireIf: patch.requireIf?.field ? { field: text(patch.requireIf.field, 60), equals: patch.requireIf.equals } : null,
    min: patch.min ?? null,
    max: patch.max ?? null,
    unit: text(patch.unit, 20),
    sensitive: !!patch.sensitive,
    calc: patch.calc?.op ? { op: patch.calc.op === 'product' ? 'product' : 'sum', fields: (patch.calc.fields || []).map((f) => text(f, 60)) } : null,
  };
}

function matches(answers, rule) {
  if (!rule?.field) return true;
  const value = answers?.[rule.field];
  if (Array.isArray(value)) return value.includes(rule.equals);
  return String(value ?? '') === String(rule.equals ?? '');
}

export function fieldVisible(field, answers) {
  return !field.showIf || matches(answers, field.showIf);
}

export function fieldRequired(field, answers) {
  if (!fieldVisible(field, answers)) return false;
  return !!field.required || (field.requireIf ? matches(answers, field.requireIf) : false);
}

export function calculatedValue(field, answers) {
  if (!field.calc) return null;
  const nums = field.calc.fields.map((k) => Number(answers?.[k])).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  return field.calc.op === 'product' ? nums.reduce((a, b) => a * b, 1) : nums.reduce((a, b) => a + b, 0);
}

function empty(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'boolean') return value === false;
  return String(value).trim() === '';
}

/** Validering ved innsending. Returnerer { ok, errors: {key: melding} }. */
export function validateAnswers(definition, answers) {
  const errors = {};
  for (const field of definition?.fields || []) {
    if (!INPUT_TYPES.has(field.type)) continue;
    const value = answers?.[field.key];
    if (!fieldVisible(field, answers)) continue;
    if (fieldRequired(field, answers) && empty(value)) {
      errors[field.key] = field.type === 'signature_ack' ? 'Må bekreftes.' : 'Må fylles ut.';
      continue;
    }
    if (empty(value)) continue;
    if (['integer', 'decimal', 'percentage', 'likelihood', 'consequence', 'rating'].includes(field.type)) {
      const n = Number(String(value).replace(',', '.'));
      if (!Number.isFinite(n)) { errors[field.key] = 'Må være et tall.'; continue; }
      if (field.type === 'integer' && !Number.isInteger(n)) errors[field.key] = 'Må være et heltall.';
      const min = field.min ?? (['likelihood', 'consequence', 'rating'].includes(field.type) ? 1 : null);
      const max = field.max ?? (['likelihood', 'consequence', 'rating'].includes(field.type) ? 5 : (field.type === 'percentage' ? 100 : null));
      if (min != null && n < min) errors[field.key] = `Minst ${min}.`;
      if (max != null && n > max) errors[field.key] = `Høyst ${max}.`;
    }
    if (field.type === 'date' && !isoDate(value)) errors[field.key] = 'Bruk dato (ÅÅÅÅ-MM-DD).';
    if (field.type === 'single_select' && field.options.length && !field.options.includes(value)) errors[field.key] = 'Ugyldig valg.';
    if (field.type === 'yes_no_na' && value === 'Ikke aktuelt' && empty(answers?.[`${field.key}__begrunnelse`])) {
      errors[field.key] = 'Begrunn «Ikke aktuelt».';
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Kontroll av definisjonen før publisering. */
export function validateDefinition(definition) {
  const errors = [];
  const keys = new Set();
  for (const f of definition?.fields || []) {
    if (!f.key || !/^[a-zA-Z0-9_æøåÆØÅ]+$/.test(f.key)) errors.push(`Feltet «${f.label}» har ugyldig nøkkel.`);
    if (keys.has(f.key)) errors.push(`Nøkkelen «${f.key}» er brukt to ganger.`);
    keys.add(f.key);
    if (['single_select', 'multi_select'].includes(f.type) && f.options.length < 2) errors.push(`«${f.label}» trenger minst to valg.`);
    for (const rule of [f.showIf, f.requireIf]) {
      if (rule?.field && !definition.fields.some((x) => x.key === rule.field)) errors.push(`«${f.label}» viser til ukjent felt «${rule.field}».`);
    }
    if (f.calc) {
      for (const k of f.calc.fields) if (!definition.fields.some((x) => x.key === k)) errors.push(`Beregning i «${f.label}» viser til ukjent felt «${k}».`);
    }
  }
  if (!(definition?.fields || []).some((f) => INPUT_TYPES.has(f.type))) errors.push('Skjemaet har ingen felt å fylle ut.');
  return { ok: errors.length === 0, errors };
}

/* ───────── Definisjoner (versjonert) ───────── */

export function createFormDefinition(input, { actor, now = new Date() } = {}) {
  if (!text(input?.title)) return fail('Gi skjemaet et navn.');
  const key = text(input.key, 60) || `SF_${Date.now().toString(36).toUpperCase()}`;
  const def = bump({
    id: newId('frm'),
    key,
    title: text(input.title, 200),
    description: text(input.description, 2000),
    category: text(input.category, 60),
    versions: [{ version: 1, state: 'utkast', fields: (input.fields || []).map((f) => makeField(f.type, f)), createdAt: nowIso(now), createdBy: text(actor?.name, 160) }],
    publishedVersion: 0,
    state: 'utkast',
    templateKey: text(input.templateKey, 60),
    createsFinding: !!input.createsFinding,
    history: pushHistory({}, 'Opprettet', actor, '', now),
    rev: 0,
  }, actor, now);
  return { ok: true, form: def, events: [auditEvent({ entityType: 'form', entityId: def.id, action: 'iso.form.created', actor, after: def, now })] };
}

export function formDraft(def) {
  return (def?.versions || []).find((v) => v.state === 'utkast') || null;
}

export function formPublished(def) {
  return (def?.versions || []).find((v) => v.version === def?.publishedVersion) || null;
}

export function formVersion(def, version) {
  return (def?.versions || []).find((v) => v.version === Number(version)) || null;
}

export function saveFormDraft(def, fields, { actor, now = new Date(), meta = null } = {}) {
  const draft = formDraft(def);
  if (!draft) return fail('Publisert versjon er låst. Lag ny versjon.');
  const next = bump({
    ...def,
    title: meta?.title ? text(meta.title, 200) : def.title,
    description: meta?.description != null ? text(meta.description, 2000) : def.description,
    versions: def.versions.map((v) => (v.version === draft.version ? { ...v, fields: fields.map((f) => makeField(f.type, f)), savedAt: nowIso(now) } : v)),
  }, actor, now);
  return { ok: true, form: next, events: [] };
}

export function publishForm(def, { actor, caps, now = new Date() } = {}) {
  if (caps && !caps.admin) return fail('Du har ikke fullmakt til å publisere skjema.');
  const draft = formDraft(def);
  if (!draft) return fail('Ingen utkast å publisere.');
  const check = validateDefinition({ fields: draft.fields });
  if (!check.ok) return fail(check.errors[0], { errors: check.errors });
  const stamp = nowIso(now);
  const next = bump({
    ...def,
    versions: def.versions.map((v) => {
      if (v.version === draft.version) return { ...v, state: 'publisert', publishedAt: stamp, publishedBy: text(actor?.name, 160), hash: checksum(v.fields) };
      if (v.state === 'publisert') return { ...v, state: 'erstattet', supersededAt: stamp };
      return v;
    }),
    publishedVersion: draft.version,
    state: 'publisert',
    history: pushHistory(def, `v${draft.version} publisert`, actor, '', now),
  }, actor, now);
  return { ok: true, form: next, events: [auditEvent({ entityType: 'form', entityId: def.id, action: 'iso.form.published', actor, before: def, after: next, now })] };
}

export function newFormVersion(def, { actor, now = new Date() } = {}) {
  if (formDraft(def)) return fail('Det finnes allerede et utkast.');
  const base = formPublished(def) || def.versions.at(-1);
  const version = Math.max(...def.versions.map((v) => v.version)) + 1;
  const next = bump({
    ...def,
    versions: [...def.versions, { version, state: 'utkast', fields: (base?.fields || []).map((f) => ({ ...f })), createdAt: nowIso(now), createdBy: text(actor?.name, 160) }],
    history: pushHistory(def, `Utkast v${version}`, actor, '', now),
  }, actor, now);
  return { ok: true, form: next, events: [] };
}

/* ───────── Registreringer ───────── */

export function submitForm(def, answers, { actor, now = new Date(), subjectRef = null, idempotencyKey = '', existing = [] } = {}) {
  const version = formPublished(def);
  if (!version) return fail('Skjemaet er ikke publisert.');
  const key = text(idempotencyKey, 160);
  if (key) {
    const dup = (existing || []).find((s) => s.idempotencyKey === key);
    if (dup) return { ok: true, submission: dup, events: [], duplicate: true };
  }
  const check = validateAnswers({ fields: version.fields }, answers);
  if (!check.ok) return fail('Noen felt mangler eller er ugyldige.', { errors: check.errors });
  const clean = {};
  for (const f of version.fields) {
    if (!fieldVisible(f, answers)) continue;
    if (f.type === 'calculated') { clean[f.key] = calculatedValue(f, answers); continue; }
    if (answers?.[f.key] !== undefined) clean[f.key] = answers[f.key];
    if (answers?.[`${f.key}__begrunnelse`]) clean[`${f.key}__begrunnelse`] = text(answers[`${f.key}__begrunnelse`], 2000);
  }
  const submission = {
    id: newId('reg'),
    formId: def.id,
    formKey: def.key,
    formTitle: def.title,
    formVersion: version.version,
    answers: clean,
    subjectRef: subjectRef || null,
    submittedAt: nowIso(now),
    submittedBy: text(actor?.name, 160),
    submittedByUid: text(actor?.uid, 128),
    state: 'innsendt',
    locked: true,
    hash: checksum(clean),
    idempotencyKey: key,
    sensitive: version.fields.some((f) => f.sensitive && !empty(clean[f.key])),
  };
  return { ok: true, submission, events: [auditEvent({ entityType: 'formSubmission', entityId: submission.id, action: 'iso.form.submitted', actor, after: submission, now })] };
}

/** Retting av låst registrering: ny hendelse, originalen bevares. */
export function correctSubmission(submission, patch, reason, { actor, now = new Date() } = {}) {
  if (text(reason).length < 5) return fail('Begrunn rettingen.');
  const corrections = [...(submission.corrections || []), { at: nowIso(now), by: text(actor?.name, 160), reason: text(reason, 1000), patch, beforeHash: submission.hash }];
  const answers = { ...submission.answers, ...patch };
  const next = { ...submission, answers, corrections, hash: checksum(answers) };
  return { ok: true, submission: next, events: [auditEvent({ entityType: 'formSubmission', entityId: submission.id, action: 'iso.form.corrected', actor, before: submission, after: next, reason, now })] };
}

/* ───────── Malbibliotek SF01–SF30 ───────── */

const F = (key, type, label, extra = {}) => ({ key, type, label, ...extra });
const YN = ['Ja', 'Nei'];
const STATUS = ['Utkast', 'Godkjent', 'Avvist'];

export const FORM_TEMPLATES = [
  { key: 'SF01_OMFANG', title: 'Etabler ledelsessystem / sertifiseringsomfang', category: 'Styring', fields: [F('virksomhet', 'short_text', 'Virksomhet', { required: true }), F('org_enhet', 'short_text', 'Organisasjonsenhet'), F('standarder', 'multi_select', 'Standarder', { options: ['ISO 9001:2026', 'ISO 14001:2026', 'ISO 45001:2018+A1:2024'], required: true }), F('lokasjoner', 'long_text', 'Lokasjoner'), F('tjenester', 'long_text', 'Tjenester og aktiviteter', { required: true }), F('omfangstekst', 'long_text', 'Omfangserklæring', { required: true }), F('avgrensning', 'long_text', 'Avgrensning og begrunnelse'), F('prosessansvarlig', 'user_ref', 'Systemansvarlig'), F('godkjenningsdato', 'date', 'Godkjent dato')] },
  { key: 'SF02_KONTEKST', title: 'Kontekstkartlegging', category: 'Styring', fields: [F('internt_eksternt', 'single_select', 'Internt eller eksternt', { options: ['Internt', 'Eksternt'], required: true }), F('forhold', 'short_text', 'Forhold', { required: true }), F('arsak', 'long_text', 'Årsak / kilde'), F('pavirkning', 'long_text', 'Mulig påvirkning', { required: true }), F('klima', 'yes_no_na', 'Klimarelevant?'), F('eier', 'user_ref', 'Eier'), F('revurdering', 'date', 'Neste vurdering')] },
  { key: 'SF03_INTERESSENT', title: 'Interessentregister', category: 'Styring', fields: [F('interessent', 'short_text', 'Interessent', { required: true }), F('kategori', 'single_select', 'Kategori', { options: ['Kunde', 'Ansatte', 'Myndighet', 'Leverandør', 'Eier', 'Nabo/samfunn', 'Annet'] }), F('behov', 'long_text', 'Behov og forventninger', { required: true }), F('forpliktelse', 'single_select', 'Blir det en samsvarsforpliktelse?', { options: YN }), F('kravref', 'requirement_ref', 'Kravreferanse', { showIf: { field: 'forpliktelse', equals: 'Ja' } }), F('eier', 'user_ref', 'Eier'), F('neste', 'date', 'Neste revisjon')] },
  { key: 'SF04_POLICY', title: 'Policygodkjenning', category: 'Ledelse', fields: [F('policytype', 'single_select', 'Policytype', { options: ['Kvalitet', 'Miljø', 'Arbeidsmiljø', 'Integrert'], required: true }), F('tekst', 'long_text', 'Policytekst', { required: true }), F('omfang', 'short_text', 'Omfang'), F('godkjenner', 'user_ref', 'Ledelsesgodkjenner', { required: true }), F('ikraft', 'date', 'Ikrafttredelse', { required: true }), F('revisjonsdato', 'date', 'Neste revisjon')] },
  { key: 'SF05_RACI', title: 'RACI / ansvarsmatrise', category: 'Ledelse', fields: [F('prosess', 'short_text', 'Prosess', { required: true }), F('raci', 'table_repeatable', 'Ansvar', { columns: ['Rolle', 'R', 'A', 'C', 'I'] }), F('fullmakt', 'long_text', 'Fullmakter'), F('godkjent_av', 'user_ref', 'Godkjent av'), F('dato', 'date', 'Dato')] },
  { key: 'SF06_MAL', title: 'Mål og handlingsplan', category: 'Mål', fields: [F('omrade', 'single_select', 'Standardområde', { options: ['Kvalitet', 'Miljø', 'Arbeidsmiljø'], required: true }), F('mal', 'short_text', 'Mål', { required: true }), F('enhet', 'short_text', 'Måleenhet', { required: true }), F('baseline', 'decimal', 'Utgangsverdi'), F('maltall', 'decimal', 'Måltall', { required: true }), F('datakilde', 'short_text', 'Datakilde'), F('frekvens', 'single_select', 'Målefrekvens', { options: ['Måned', 'Kvartal', 'År'] }), F('eier', 'user_ref', 'Eier', { required: true }), F('frist', 'date', 'Frist')] },
  { key: 'SF07_RISIKO', title: 'Risikovurdering', category: 'Risiko', fields: [F('kategori', 'single_select', 'Risikokategori', { options: ['Strategisk', 'Kvalitet', 'Miljø', 'Arbeidsmiljø', 'Prosjekt', 'Beredskap', 'Leverandør'], required: true }), F('aktivitet', 'short_text', 'Område/aktivitet'), F('hendelse', 'long_text', 'Fare / risikohendelse', { required: true }), F('arsaker', 'long_text', 'Årsaker'), F('konsekvenser', 'long_text', 'Konsekvenser'), F('barrierer', 'long_text', 'Eksisterende barrierer'), F('s', 'likelihood', 'Sannsynlighet', { required: true }), F('k', 'consequence', 'Konsekvens', { required: true }), F('score', 'calculated', 'Risikotall (S × K)', { calc: { op: 'product', fields: ['s', 'k'] } }), F('tiltak', 'long_text', 'Tiltak'), F('eier', 'user_ref', 'Eier'), F('revurdering', 'date', 'Revurderingsdato')] },
  { key: 'SF08_MULIGHET', title: 'Mulighetsvurdering', category: 'Risiko', fields: [F('mulighet', 'short_text', 'Mulighet', { required: true }), F('malrelasjon', 'short_text', 'Mål den støtter'), F('gevinst', 'long_text', 'Potensiell gevinst', { required: true }), F('forutsetninger', 'long_text', 'Forutsetninger'), F('handling', 'long_text', 'Valgt handling'), F('eier', 'user_ref', 'Eier'), F('effekt', 'short_text', 'Effektmåling')] },
  { key: 'SF09_ENDRING', title: 'Endringsvurdering', category: 'Risiko', fields: [F('endring', 'long_text', 'Endring', { required: true }), F('begrunnelse', 'long_text', 'Begrunnelse'), F('prosesser', 'long_text', 'Berørte prosesser'), F('lovkrav', 'long_text', 'Berørte lovkrav'), F('risiko', 'long_text', 'Risikovurdering', { required: true }), F('kompetanse', 'long_text', 'Kompetansetiltak'), F('dokumenter', 'long_text', 'Dokumenter som må revideres'), F('beslutning', 'single_select', 'Beslutning', { options: STATUS, required: true }), F('godkjent_av', 'user_ref', 'Godkjent av')] },
  { key: 'SF10_MILJOASPEKT', title: 'Miljøaspekt og vesentlighetsvurdering', category: 'Miljø', fields: [F('aktivitet', 'short_text', 'Aktivitet', { required: true }), F('livslop', 'single_select', 'Livsløpstrinn', { options: ['Innkjøp', 'Prosjektering', 'Transport', 'Drift', 'Avfall', 'Avhending'] }), F('aspekt', 'short_text', 'Miljøaspekt', { required: true }), F('pavirkning', 'long_text', 'Miljøpåvirkning', { required: true }), F('situasjon', 'single_select', 'Situasjon', { options: ['Normal', 'Unormal', 'Nødsituasjon'] }), F('kontroll', 'single_select', 'Kontroll eller innflytelse', { options: ['Direkte kontroll', 'Innflytelse'] }), F('omfang', 'rating', 'Omfang (1–5)'), F('alvor', 'rating', 'Alvorlighet (1–5)'), F('vesentlig', 'single_select', 'Vesentlig?', { options: YN, required: true }), F('begrunnelse', 'long_text', 'Begrunnelse', { required: true }), F('tiltak', 'long_text', 'Tiltak/kontroller', { requireIf: { field: 'vesentlig', equals: 'Ja' } })] },
  { key: 'SF11_MILJOMALING', title: 'Miljømåling', category: 'Miljø', fields: [F('malepunkt', 'short_text', 'Målepunkt', { required: true }), F('periode', 'short_text', 'Periode (ÅÅÅÅ-MM)', { required: true }), F('verdi', 'decimal', 'Verdi', { required: true }), F('enhet', 'single_select', 'Enhet', { options: ['kWh', 'kg', 'tonn', 'km', 'liter', 'kg CO₂e'], required: true }), F('kvalitet', 'single_select', 'Datakvalitet', { options: ['Målt', 'Estimert', 'Ukjent'], required: true }), F('metode', 'short_text', 'Metode'), F('kilde', 'short_text', 'Datakilde'), F('faktor', 'short_text', 'Faktor og versjon (ved omregning)', { requireIf: { field: 'enhet', equals: 'kg CO₂e' } })] },
  { key: 'SF12_SJA', title: 'Arbeidsmiljøfare / SJA', category: 'HMS', fields: [F('aktivitet', 'short_text', 'Arbeidsaktivitet', { required: true }), F('sted', 'location', 'Sted / prosjekt'), F('deltakere', 'long_text', 'Deltakere', { required: true }), F('farer', 'table_repeatable', 'Farer og tiltak', { columns: ['Fare', 'Risiko før', 'Tiltak (hierarki)', 'Ansvar', 'Rest-risiko'] }), F('bekreftet', 'signature_ack', 'SJA gjennomgått med alle deltakere', { required: true }), F('gyldig', 'date', 'Gyldig til')] },
  { key: 'SF13_VERNERUNDE', title: 'Vernerunde', category: 'HMS', fields: [F('sted', 'location', 'Sted', { required: true }), F('dato', 'date', 'Dato', { required: true }), F('deltakere', 'long_text', 'Deltakere'), F('punkter', 'table_repeatable', 'Kontrollpunkter', { columns: ['Punkt', 'OK / Ikke OK', 'Observasjon', 'Tiltak', 'Frist'] }), F('alvor', 'single_select', 'Mest alvorlige funn', { options: ['Ingen', 'Lav', 'Middels', 'Høy'] })] },
  { key: 'SF14_MEDVIRKNING', title: 'Arbeidstakermedvirkning', category: 'HMS', fields: [F('tema', 'short_text', 'Tema', { required: true }), F('innspill', 'long_text', 'Innspill', { required: true }), F('representant', 'short_text', 'Representant'), F('kanal', 'single_select', 'Møte/kanal', { options: ['AMU', 'Verneombud', 'Avdelingsmøte', 'Digitalt innspill', 'Annet'] }), F('vurdering', 'long_text', 'Vurdering'), F('beslutning', 'long_text', 'Beslutning'), F('tilbakemeldt', 'yes_no_na', 'Tilbakemeldt?'), F('note', 'help_text', 'Personsaker og varsling skal ikke registreres her.')] },
  { key: 'SF15_BEREDSKAP', title: 'Beredskapsplan og øvelse', category: 'HMS', fields: [F('scenario', 'short_text', 'Scenario', { required: true }), F('dato', 'date', 'Øvelsesdato', { required: true }), F('forlop', 'long_text', 'Hendelsesforløp'), F('funn', 'long_text', 'Evalueringsfunn', { required: true }), F('tiltak', 'long_text', 'Tiltak'), F('ansvar', 'user_ref', 'Ansvar')] },
  { key: 'SF16_AVVIK', title: 'Avvik / RUH / hendelse', category: 'Avvik', createsFinding: true, fields: [F('kategori', 'single_select', 'Kategori', { options: ['KVALITET', 'MILJO', 'HMS'], required: true }), F('tittel', 'short_text', 'Tittel', { required: true }), F('beskrivelse', 'long_text', 'Beskrivelse', { required: true }), F('dato', 'date', 'Dato', { required: true }), F('prosjekt', 'project_ref', 'Prosjekt'), F('sted', 'location', 'Sted'), F('konsekvens', 'long_text', 'Faktisk konsekvens'), F('mulig', 'long_text', 'Mulig konsekvens'), F('midlertidig', 'long_text', 'Midlertidige tiltak'), F('skade', 'single_select', 'Personskade', { options: ['Ingen', 'Førstehjelp', 'Fravær', 'Alvorlig'], showIf: { field: 'kategori', equals: 'HMS' }, sensitive: true }), F('medium', 'single_select', 'Miljømedium', { options: ['Luft', 'Vann', 'Jord', 'Avfall', 'Annet'], showIf: { field: 'kategori', equals: 'MILJO' } }), F('leveranse', 'short_text', 'Leveranse / dokument-ID', { showIf: { field: 'kategori', equals: 'KVALITET' } }), F('varsling', 'single_select', 'Mulig meldeplikt til myndighet?', { options: YN }), F('varsler', 'user_ref', 'Hvem varsler', { requireIf: { field: 'varsling', equals: 'Ja' }, showIf: { field: 'varsling', equals: 'Ja' } })] },
  { key: 'SF17_ARSAK', title: 'Årsaksanalyse', category: 'Avvik', fields: [F('metode', 'single_select', 'Metode', { options: ['5 × hvorfor', 'Fiskebein', 'Fritekst'], required: true }), F('hva', 'long_text', 'Hva skjedde', { required: true }), F('hvorfor1', 'short_text', 'Hvorfor 1'), F('hvorfor2', 'short_text', 'Hvorfor 2'), F('hvorfor3', 'short_text', 'Hvorfor 3'), F('hvorfor4', 'short_text', 'Hvorfor 4'), F('hvorfor5', 'short_text', 'Hvorfor 5'), F('systemarsak', 'long_text', 'Systemårsak', { required: true }), F('berort', 'long_text', 'Andre berørte forhold')] },
  { key: 'SF18_TILTAK', title: 'Korrigerende tiltak og effektkontroll', category: 'Avvik', fields: [F('tiltak', 'long_text', 'Tiltak', { required: true }), F('type', 'single_select', 'Type', { options: ['Korreksjon', 'Korrigerende', 'Forebyggende'] }), F('ansvarlig', 'user_ref', 'Ansvarlig', { required: true }), F('frist', 'date', 'Frist', { required: true }), F('bevis', 'short_text', 'Påkrevd bevis'), F('effektmetode', 'short_text', 'Effektmetode'), F('utfall', 'single_select', 'Utfall', { options: ['Verifisert', 'Ikke verifisert'] })] },
  { key: 'SF19_KONTRAKT', title: 'Kundekrav- og kontraktsgjennomgang', category: 'Prosjekt', fields: [F('kunde', 'customer_ref', 'Kunde', { required: true }), F('foresporsel', 'long_text', 'Forespørsel / avtale'), F('omfang', 'long_text', 'Leveranseomfang', { required: true }), F('krav', 'long_text', 'Krav (kunde, lov, standard)'), F('kapasitet', 'yes_no_na', 'Kapasitet OK?', { required: true }), F('kompetanse', 'yes_no_na', 'Kompetanse OK?', { required: true }), F('forbehold', 'long_text', 'Forbehold og uklarheter'), F('aksept', 'single_select', 'Konklusjon', { options: ['Aksepteres', 'Avklares', 'Avstås'], required: true }), F('godkjent_av', 'user_ref', 'Godkjent av')] },
  { key: 'SF20_KVALITETSPLAN', title: 'Prosjektkvalitetsplan', category: 'Prosjekt', fields: [F('prosjekt', 'project_ref', 'Prosjekt', { required: true }), F('leveranse', 'long_text', 'Leveranser'), F('krav', 'long_text', 'Gjeldende krav'), F('roller', 'table_repeatable', 'Roller', { columns: ['Rolle', 'Person', 'Ansvar'] }), F('kontrollplan', 'table_repeatable', 'Kontrollplan', { columns: ['Fase', 'Kontroll', 'Kontrollør', 'Dokumentasjon'] }), F('risiko', 'long_text', 'Risiko'), F('endring', 'long_text', 'Endringsrutine'), F('godkjent', 'signature_ack', 'Kvalitetsplan godkjent', { required: true })] },
  { key: 'SF21_FAGKONTROLL', title: 'Prosjekteringskontroll og leveransegodkjenning', category: 'Prosjekt', fields: [F('prosjekt', 'project_ref', 'Prosjekt', { required: true }), F('fag', 'short_text', 'Fag', { required: true }), F('dokument', 'short_text', 'Dokument-ID', { required: true }), F('revisjon', 'short_text', 'Revisjon', { required: true }), F('kontrolltype', 'single_select', 'Kontrolltype', { options: ['Egenkontroll', 'Sidemannskontroll', 'Tverrfaglig kontroll', 'Uavhengig kontroll'], required: true }), F('punkter', 'table_repeatable', 'Kontrollpunkter', { columns: ['Punkt', 'OK / Merknad'] }), F('funn', 'long_text', 'Funn og korrigeringer'), F('frigivelse', 'single_select', 'Frigivelse', { options: ['Frigis', 'Frigis ikke'], required: true })] },
  { key: 'SF22_LEVERANDOR', title: 'Leverandørkvalifisering og evaluering', category: 'Leverandør', fields: [F('leverandor', 'short_text', 'Leverandør', { required: true }), F('kategori', 'short_text', 'Kategori'), F('kritikalitet', 'single_select', 'Kritikalitet', { options: ['Lav', 'Middels', 'Høy'], required: true }), F('kvalitet', 'rating', 'Kvalitet (1–5)'), F('hms', 'rating', 'HMS (1–5)'), F('miljo', 'rating', 'Miljø (1–5)'), F('levering', 'rating', 'Leveringsdyktighet (1–5)'), F('sertifikater', 'long_text', 'Sertifikater'), F('status', 'single_select', 'Status', { options: ['Godkjent', 'Betinget godkjent', 'Ikke godkjent'], required: true }), F('neste', 'date', 'Neste evaluering')] },
  { key: 'SF23_KOMPETANSE', title: 'Kompetansekrav og -bevis', category: 'Kompetanse', fields: [F('person', 'user_ref', 'Ansatt', { required: true }), F('krav', 'short_text', 'Kompetansekrav', { required: true }), F('dokumentasjon', 'file', 'Dokumentasjon'), F('gyldig_fra', 'date', 'Gyldig fra'), F('gyldig_til', 'date', 'Gyldig til'), F('effekt', 'long_text', 'Effektvurdering')] },
  { key: 'SF24_REVPROGRAM', title: 'Internrevisjonsprogram', category: 'Revisjon', fields: [F('periode', 'short_text', 'Periode', { required: true }), F('prosesser', 'long_text', 'Prosesser/enheter', { required: true }), F('risiko', 'long_text', 'Risikobegrunnelse', { required: true }), F('revisor', 'user_ref', 'Revisor'), F('uavhengighet', 'signature_ack', 'Revisor reviderer ikke eget arbeid', { required: true })] },
  { key: 'SF25_REVISJON', title: 'Internrevisjon og sjekkliste', category: 'Revisjon', fields: [F('dato', 'date', 'Dato', { required: true }), F('kriterier', 'long_text', 'Revisjonskriterier', { required: true }), F('punkter', 'table_repeatable', 'Kravpunkter', { columns: ['Krav', 'Bevis', 'Vurdering'] }), F('konklusjon', 'long_text', 'Konklusjon', { required: true })] },
  { key: 'SF26_SAMSVAR', title: 'Vurdering av lov-/samsvarsforpliktelse', category: 'Lovkrav', fields: [F('lovkrav', 'requirement_ref', 'Lovkrav', { required: true }), F('relevans', 'long_text', 'Virksomhetsrelevans', { required: true }), F('plikt', 'long_text', 'Tolket plikt'), F('metode', 'short_text', 'Vurderingsmetode', { required: true }), F('resultat', 'single_select', 'Resultat', { options: ['Etterleves', 'Delvis', 'Etterleves ikke', 'Krever juridisk vurdering'], required: true }), F('neste', 'date', 'Neste vurdering', { required: true })] },
  { key: 'SF27_LEDELSE', title: 'Ledelsens gjennomgang', category: 'Ledelse', fields: [F('periode', 'short_text', 'Periode', { required: true }), F('deltakere', 'long_text', 'Deltakere', { required: true }), F('vurdering', 'long_text', 'Vurdering av systemets egnethet og effektivitet', { required: true }), F('beslutninger', 'table_repeatable', 'Beslutninger', { columns: ['Beslutning', 'Ansvar', 'Frist'] })] },
  { key: 'SF28_TILFREDSHET', title: 'Kunde-/prosjekttilfredshet', category: 'Prosjekt', fields: [F('kunde', 'customer_ref', 'Kunde', { required: true }), F('prosjekt', 'project_ref', 'Prosjekt'), F('vurdering', 'rating', 'Samlet vurdering (1–5)', { required: true }), F('tilbakemelding', 'long_text', 'Tilbakemelding'), F('klage', 'single_select', 'Inneholder klage?', { options: YN })] },
  { key: 'SF29_DOKENDRING', title: 'Dokumentendring / godkjenning', category: 'Dokument', fields: [F('dokument', 'short_text', 'Dokument', { required: true }), F('arsak', 'long_text', 'Endringsårsak', { required: true }), F('beskrivelse', 'long_text', 'Endringsbeskrivelse', { required: true }), F('prosesser', 'long_text', 'Berørte prosesser'), F('ikraft', 'date', 'Ikrafttredelse')] },
  { key: 'SF30_BEVISPAKKE', title: 'Sertifiserings-/revisjonsbevispakke', category: 'Sertifisering', fields: [F('omfang', 'long_text', 'Sertifiseringsomfang', { required: true }), F('revisjon', 'short_text', 'Revisjon / sertifiseringsorgan', { required: true }), F('utvalg', 'long_text', 'Utvalg av krav og bevis', { required: true }), F('anonymisering', 'signature_ack', 'Persondata er sladdet der det ikke trengs', { required: true }), F('tilgang', 'date', 'Tilgang til og med', { required: true })] },
];

export function formTemplateByKey(key) {
  return FORM_TEMPLATES.find((t) => t.key === key) || null;
}
