/**
 * Ferdig utkast til søknad om utvidet overtid hos Arbeidstilsynet (aml. § 10-6 (6)).
 *
 * Fylles ut fra bedriften, den ansatte og overtiden i timelisten, og deles i avsnitt som
 * kan kopieres rett inn i søknaden i Altinn. Det systemet ikke kan vite (årsak, stilling,
 * tillitsvalgte, tiltak), står som «[…]» og må fylles inn før søknaden sendes.
 *
 * Krav fra Arbeidstilsynet (arbeidstilsynet.no, «Søk om utvidet overtid»):
 * - Bare i særlige tilfeller. Rammen er inntil 25 t overtid på sju dager og 200 t på 26 uker.
 * - Sendes senest fire uker før arbeidet starter. Godkjennes ikke i etterkant.
 * - Vedlegg: oversikt over overtidstimer, arbeidsplaner, og referat fra drøfting med tillitsvalgte
 *   (signert, med deltakere og vurdering av helse, miljø og sikkerhet). Verneombudet bør være med.
 *
 * Ren modul. Dato er «ÅÅÅÅ-MM-DD».
 */
import { formatDateNb, overtimeByDay } from './workingTimeRules.js';

export const ALTINN_FORM_URL = 'https://dat.apps.altinn.no/dat/overtid-soknad';
export const APPLICATION_INFO_URL = 'https://www.arbeidstilsynet.no/arbeidstid-og-organisering/arbeidstid/overtid/sok-utvidet-overtid/';

/** Rammen Arbeidstilsynet kan gi (§ 10-6 (6)). */
export const ARBEIDSTILSYNET_MAX = { overtime7d: 25, overtime26w: 200 };

const DAY_MS = 86400000;

function text(value) {
  return String(value ?? '').trim();
}

function shiftDay(key, days) {
  const at = Date.parse(`${key}T00:00:00Z`);
  return Number.isFinite(at) ? new Date(at + days * DAY_MS).toISOString().slice(0, 10) : '';
}

function hoursNb(value) {
  const n = Math.round((Number(value) || 0) * 10) / 10;
  return String(n).replace('.', ',');
}

function blank(label) {
  return `[${label}]`;
}

function companyAddress(company) {
  const a = company?.forretningsadresse || company?.kjoeradresse || null;
  if (a && (a.gate || a.adresse)) {
    const street = Array.isArray(a.adresse) ? a.adresse.join(', ') : text(a.gate || a.adresse);
    return [street, [text(a.postnummer), text(a.poststed)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }
  return text(company?.addressLabel || company?.forretning?.label);
}

/** Overtid per uke (mandag) for de siste weeks ukene fram til og med through. */
export function weeklyOvertime(entries, { employeeId = '', through = '', weeks = 8 } = {}) {
  const days = overtimeByDay(entries, { employeeId });
  const end = text(through) || (days.length ? days[days.length - 1].date : '');
  if (!end) return [];
  const endIdx = Math.round(Date.parse(`${end}T00:00:00Z`) / DAY_MS);
  const monday = endIdx - ((new Date(endIdx * DAY_MS).getUTCDay() + 6) % 7);
  const out = [];
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const from = monday - w * 7;
    const rows = days.filter((day) => day.index >= from && day.index < from + 7);
    out.push({
      from: new Date(from * DAY_MS).toISOString().slice(0, 10),
      to: new Date((from + 6) * DAY_MS).toISOString().slice(0, 10),
      hours: Math.round(rows.reduce((sum, day) => sum + day.hours, 0) * 100) / 100,
      overtime: Math.round(rows.reduce((sum, day) => sum + day.overtime, 0) * 100) / 100,
    });
  }
  return out;
}

/**
 * Hvor mye det bør søkes om: høyeste overtid på sju dager, og snittet per uke de siste
 * fire ukene ganget med 26. Rundet opp og innenfor Arbeidstilsynets ramme.
 */
export function suggestedFrame(result, weekly = []) {
  const peak7d = Math.max(
    0,
    Number(result?.totals?.overtime7d) || 0,
    ...(result?.warnings || []).filter((row) => row.rule === 'overtime7d').map((row) => Number(row.value) || 0),
    ...weekly.map((row) => row.overtime),
  );
  const recent = weekly.slice(-4);
  const avg = recent.length ? recent.reduce((sum, row) => sum + row.overtime, 0) / recent.length : 0;
  const per7d = Math.min(ARBEIDSTILSYNET_MAX.overtime7d, Math.max(1, Math.ceil(peak7d)));
  const per26w = Math.min(ARBEIDSTILSYNET_MAX.overtime26w, Math.max(per7d, Math.ceil(avg * 26 / 5) * 5));
  return { overtime7d: per7d, overtime26w: per26w };
}

/**
 * Søknadsutkastet.
 * company: bedriften (navn, organisasjonsnummer, adresse, workingTime).
 * employee: { name, position } for den det gjelder. result: checkWorkingTime for den ansatte.
 * entries: timene (for ukeoversikten). applicant: { name, email, phone } for kontaktpersonen.
 * today: dagens dato. Tidligste start er fire uker fram.
 * { subject, sections: [{ id, title, text }], fullText, frame, start, end, sendBy, checklist }
 */
export function buildArbeidstilsynetApplication({
  company = {}, employee = {}, result = null, entries = [], applicant = {}, today = '',
} = {}) {
  const day = text(today) || new Date().toISOString().slice(0, 10);
  const name = text(company?.navn) || blank('bedriftens navn');
  const orgnr = text(company?.organisasjonsnummer || company?.orgnr) || blank('org.nr.');
  const address = companyAddress(company) || blank('adresse');
  const tariff = company?.workingTime?.tariffBound === true;
  const person = text(employee?.name) || blank('navn på arbeidstaker');
  const position = text(employee?.position) || blank('stilling / yrkesgruppe');
  const contact = [text(applicant?.name) || blank('kontaktperson'), text(applicant?.email), text(applicant?.phone)]
    .filter(Boolean).join(', ');
  const weekly = weeklyOvertime(entries, { employeeId: employee?.id || '', through: day, weeks: 8 });
  const frame = suggestedFrame(result, weekly);
  const start = shiftDay(day, 28);
  const end = shiftDay(start, 26 * 7 - 1);
  const totals = result?.totals || {};
  const limits = result?.limits || {};
  const breaches = (result?.warnings || []).filter((row) => row.level === 'warn');
  const restBreaches = breaches.filter((row) => row.rule === 'dailyRest' || row.rule === 'weeklyRest').length;

  const subject = `Søknad om utvidet overtid etter arbeidsmiljøloven § 10-6 (6) – ${name}, org.nr. ${orgnr}`;

  const sections = [
    {
      id: 'to',
      title: 'Mottaker og emne',
      text: [
        'Til: Arbeidstilsynet',
        'Sendes i Altinn: «Søknad om utvidet overtid».',
        `Emne: ${subject}`,
      ].join('\n'),
    },
    {
      id: 'company',
      title: 'Virksomheten',
      text: [
        `Virksomhet: ${name}`,
        `Organisasjonsnummer: ${orgnr}`,
        `Adresse: ${address}`,
        `Kontaktperson: ${contact}`,
        `Bundet av tariffavtale: ${tariff ? 'Ja' : 'Nei'}`,
        `Tillitsvalgt / arbeidstakernes representant: ${blank('navn')}`,
        `Verneombud: ${blank('navn')}`,
      ].join('\n'),
    },
    {
      id: 'request',
      title: 'Hva vi søker om',
      text: [
        `Vi søker om tillatelse til samlet overtid inntil ${frame.overtime7d} timer i løpet av sju dager og ${frame.overtime26w} timer i løpet av 26 uker, jf. arbeidsmiljøloven § 10-6 (6).`,
        `Periode: ${formatDateNb(start)}–${formatDateNb(end)} ${blank('juster ved behov, tidligst fire uker etter at søknaden er sendt')}.`,
        `Søknaden gjelder 1 arbeidstaker: ${person}, ${position}.`,
        `Arbeidstakeren har sagt seg villig til overtid utover lovens grunngrenser, jf. § 10-6 (7) ${blank('bekreft')}.`,
      ].join('\n'),
    },
    {
      id: 'reason',
      title: 'Begrunnelse (særlig tilfelle)',
      text: [
        `Behovet for overtid er særlig og tidsavgrenset. Det skyldes ${blank('beskriv: oppdrag, frist, sesong, uforutsett hendelse eller mangel på kvalifisert personell')}.`,
        `Arbeidet kan ikke utsettes eller gjøres av andre fordi ${blank('begrunn')}.`,
        `Vi har vurdert ${blank('nyansettelse, innleie, omfordeling av oppgaver')} uten at det dekker behovet i perioden.`,
        tariff
          ? `Virksomheten er bundet av tariffavtale. Behovet går ut over det som kan avtales med tillitsvalgte etter § 10-6 (5) ${blank('eller: vi kom ikke til enighet med tillitsvalgte fordi …')}.`
          : 'Virksomheten er ikke bundet av tariffavtale og kan derfor ikke avtale utvidet overtid med tillitsvalgte etter § 10-6 (5).',
        `Registrert overtid for ${person} (fra timelisten): ${hoursNb(totals.overtime7d)} t siste sju dager, ${hoursNb(totals.overtime4w)} t siste fire uker og ${hoursNb(totals.overtime52w)} t siste 52 uker. Gjeldende grenser er ${limits.overtime7d ?? 10}, ${limits.overtime4w ?? 25} og ${limits.overtime52w ?? 200} timer.`,
      ].join('\n'),
    },
    {
      id: 'health',
      title: 'Helse, miljø og sikkerhet',
      text: [
        `Vi har vurdert om overtiden kan gå ut over helse, sikkerhet og velferd. ${blank('beskriv risiko i arbeidet for yrkesgruppen')}.`,
        'Tiltak:',
        '- Hviletid etter § 10-8 holdes: minst 11 timer sammenhengende fri på 24 timer og 35 timer på sju dager.',
        '- Arbeidstiden registreres daglig og følges opp ukentlig av nærmeste leder.',
        '- Arbeidstakeren kan be om fritak etter § 10-6 (10).',
        `- ${blank('andre tiltak, f.eks. kompenserende hvile, avløsning, begrensning av nattarbeid')}`,
        restBreaches
          ? `I timelisten er det registrert ${restBreaches} brudd på hviletiden. ${blank('beskriv hvordan dette rettes')}.`
          : 'Timelisten viser ingen brudd på hviletiden.',
      ].join('\n'),
    },
    {
      id: 'consultation',
      title: 'Drøfting med tillitsvalgte og verneombud',
      text: [
        `Behovet for utvidet overtid ble drøftet ${blank('dato')} med ${blank('tillitsvalgt / arbeidstakernes representant')}. Verneombud ${blank('navn')} deltok.`,
        `Tillitsvalgtes vurdering: ${blank('enig / uenig, og begrunnelse')}.`,
        'Referat signert av partene er vedlagt. Det viser hvem som deltok, hvordan overtiden er vurdert, og om den kan gå ut over sikkerhet, helse og velferd.',
      ].join('\n'),
    },
    {
      id: 'hours',
      title: 'Oversikt over overtidstimer (vedlegg)',
      text: [
        `${person}, siste åtte uker (fra timelisten i ProTop):`,
        ...weekly.map((row) => `Uke ${formatDateNb(row.from)}–${formatDateNb(row.to)}: ${hoursNb(row.hours)} t arbeid, ${hoursNb(row.overtime)} t overtid`),
      ].join('\n'),
    },
  ];

  const checklist = [
    'Oversikt over overtidstimer (avsnittet over, eller eksport fra Timesaldo)',
    'Arbeidsplanene arbeidstakerne jobber etter',
    'Referat fra drøfting med tillitsvalgte, signert av partene',
    'Beskrivelse av arbeidet, risiko og tiltak per yrkesgruppe',
    'Fullmakt fra arbeidsgiver hvis søknaden gjelder innleide',
    'Tariffavtale og risikovurdering (valgfritt)',
  ];

  const sendBy = shiftDay(start, -28);
  const fullText = [
    ...sections.map((row) => `${row.title.toUpperCase()}\n${row.text}`),
    `VEDLEGG\n${checklist.map((row) => `- ${row}`).join('\n')}`,
    `Med vennlig hilsen\n${text(applicant?.name) || blank('navn')}\n${name}`,
  ].join('\n\n');

  return { subject, sections, fullText, frame, start, end, sendBy, checklist };
}
