/**
 * Møtetyper og ferdige møtemaler.
 *
 * En mal er en dagsorden (kapitler med punkter, varighet og veiledning) pluss
 * standardverdier: lengde, gjentakelse og hvem som ser møtet. Bedriften kan lagre
 * egne maler, lage dem fra et skjema i Skjemabygger eller la AI foreslå dem.
 */
import {
  createMeetingId,
  normalizeChapter,
  normalizeMeeting,
  normalizeRecurrence,
  text,
} from './model.js';

export const MEETING_TYPES = [
  { id: 'byggemote', label: 'Byggemøte', icon: 'construct', color: '#1099F4' },
  { id: 'oppstart', label: 'Oppstartsmøte', icon: 'flag', color: '#7c3aed' },
  { id: 'prosjektering', label: 'Prosjekteringsmøte', icon: 'git-merge', color: '#0891b2' },
  { id: 'hms', label: 'HMS- og vernemøte', icon: 'shield-checkmark', color: '#16a34a' },
  { id: 'tavle', label: 'Tavlemøte', icon: 'easel', color: '#ea580c' },
  { id: 'ledelse', label: 'Ledermøte', icon: 'trending-up', color: '#0f766e' },
  { id: 'styre', label: 'Styremøte', icon: 'briefcase', color: '#07274C' },
  { id: 'avdeling', label: 'Avdelings- og personalmøte', icon: 'people', color: '#db2777' },
  { id: 'kunde', label: 'Kunde- og statusmøte', icon: 'chatbubbles', color: '#2563eb' },
  { id: 'overtakelse', label: 'Overtakelsesmøte', icon: 'key', color: '#b45309' },
  { id: 'evaluering', label: 'Erfarings- og evalueringsmøte', icon: 'bulb', color: '#ca8a04' },
  { id: 'annet', label: 'Annet møte', icon: 'calendar', color: '#64748b' },
];

export function meetingType(id) {
  return MEETING_TYPES.find((row) => row.id === id) || MEETING_TYPES[MEETING_TYPES.length - 1];
}

const I = (title, minutes = 5, description = '') => ({ title, minutes, description });
const C = (title, ...items) => ({ title, items });

/** Felles åpning og avslutning for møter med referat. */
const OPEN = C('Innledning',
  I('Godkjenning av innkalling og dagsorden', 2),
  I('Godkjenning av referat fra forrige møte', 3, 'Merknader til forrige referat føres her. Åpne oppfølgingspunkter gjennomgås under sakene de hører til.'));
const CLOSE = C('Avslutning',
  I('Eventuelt', 5),
  I('Neste møte', 2, 'Dato, tid og sted for neste møte.'));

export const BUILTIN_TEMPLATES = [
  {
    id: 'mal_byggemote',
    typeId: 'byggemote',
    name: 'Byggemøte',
    summary: 'Fast møte mellom byggherre og entreprenører: SHA, fremdrift, kvalitet, endringer og avklaringer.',
    durationMin: 90,
    recurrence: 'biweekly',
    visibility: 'alle',
    chapters: [
      OPEN,
      C('SHA',
        I('HMS-status og uønskede hendelser (RUH)', 10, 'Skader, nestenulykker og RUH siden sist. Tiltak og læring.'),
        I('SHA-plan og risikoforhold', 5, 'Endringer i SHA-plan, nye risikoforhold og SJA som må gjennomføres.'),
        I('Vernerunde og avvik', 5, 'Funn fra siste vernerunde og status på tiltak.'),
        I('Rigg og logistikk', 5, 'Riggplan, adkomst, kraner, varelevering og nabovarsling.')),
      C('Fremdrift',
        I('Status mot fremdriftsplan', 10, 'Hvor står vi mot planen? Forsinkelser og årsak.'),
        I('Kritiske aktiviteter neste periode', 5),
        I('Bemanning', 5, 'Bemanning per fag nå og neste periode.')),
      C('Kvalitet',
        I('Avvik og reklamasjoner', 5),
        I('Kontroller og sjekklister', 5, 'Egenkontroll, uavhengig kontroll og dokumentasjon.')),
      C('Økonomi og endringer',
        I('Endringsmeldinger og varsler', 10, 'Nye og åpne endringer, krav og varsler etter kontrakten.'),
        I('Tillegg og fradrag', 5)),
      C('Prosjektering og avklaringer',
        I('Tegninger og beskrivelser', 5, 'Nye revisjoner og mangler i grunnlaget.'),
        I('Åpne avklaringer', 5)),
      C('Miljø',
        I('Avfall og kildesortering', 3),
        I('Renhold og rydding', 2)),
      CLOSE,
    ],
  },
  {
    id: 'mal_oppstart',
    typeId: 'oppstart',
    name: 'Oppstartsmøte',
    summary: 'Første møte i prosjektet: parter, grunnlag, organisering, SHA, fremdrift og spilleregler.',
    durationMin: 120,
    recurrence: 'none',
    visibility: 'alle',
    chapters: [
      C('Presentasjon',
        I('Presentasjon av deltakere og roller', 10),
        I('Prosjektets mål og omfang', 10)),
      C('Kontrakt og grunnlag',
        I('Kontrakt, kontraktsform og vedlegg', 10, 'Kontraktsdokumenter, rangordning og standard (NS 8405/8407 o.l.).'),
        I('Tegninger, beskrivelser og leveranseomfang', 10),
        I('Grensesnitt mot andre entrepriser', 5)),
      C('Organisering',
        I('Kontaktpersoner og fullmakter', 5),
        I('Møteplan og kommunikasjon', 5, 'Byggemøter, prosjekteringsmøter, rapportering og kanaler.'),
        I('Dokumenthåndtering', 5)),
      C('SHA og miljø',
        I('SHA-plan og risikoforhold', 10),
        I('Riggplan og logistikk', 10),
        I('Miljøkrav og avfallsplan', 5)),
      C('Fremdrift og økonomi',
        I('Fremdriftsplan og milepæler', 10),
        I('Fakturering, endringer og varsling', 10),
        I('Kvalitetsplan og kontrollplan', 5)),
      CLOSE,
    ],
  },
  {
    id: 'mal_prosjektering',
    typeId: 'prosjektering',
    name: 'Prosjekteringsmøte',
    summary: 'Koordinering mellom fag: leveranser, tverrfaglige avklaringer, modell og kostnad.',
    durationMin: 90,
    recurrence: 'biweekly',
    visibility: 'alle',
    chapters: [
      OPEN,
      C('Status per fag',
        I('Arkitekt', 10),
        I('RIB', 10),
        I('RIV / RIE', 10)),
      C('Tverrfaglig',
        I('Grensesnitt og kollisjoner', 10, 'Funn fra modellkontroll og avklaringer mellom fag.'),
        I('Leveranseplan og frister', 10)),
      C('Kostnad og risiko',
        I('Kostnadsstatus og endringer', 10),
        I('Risiko og usikkerhet', 5)),
      CLOSE,
    ],
  },
  {
    id: 'mal_hms',
    typeId: 'hms',
    name: 'HMS- og vernemøte (AMU)',
    summary: 'Arbeidsmiljøutvalg eller HMS-møte: hendelser, sykefravær, vernerunder, risiko og handlingsplan.',
    durationMin: 60,
    recurrence: 'quarterly',
    visibility: 'alle',
    chapters: [
      OPEN,
      C('Status',
        I('Skader, RUH og avvik siden sist', 10),
        I('Sykefravær', 5, 'Utvikling og tiltak. Ingen personopplysninger i referatet.'),
        I('Vernerunder og funn', 10)),
      C('Forebygging',
        I('Risikovurderinger og SJA', 10),
        I('Opplæring og kompetanse', 5),
        I('Verneutstyr og arbeidsutstyr', 5)),
      C('Plan',
        I('HMS-handlingsplan', 10, 'Status på tiltak, nye tiltak og ansvar.')),
      CLOSE,
    ],
  },
  {
    id: 'mal_tavle',
    typeId: 'tavle',
    name: 'Tavlemøte / morgenmøte',
    summary: 'Kort daglig møte på byggeplassen: sikkerhet, dagens arbeid og hindringer.',
    durationMin: 15,
    recurrence: 'weekly',
    visibility: 'alle',
    chapters: [
      C('Tavlemøte',
        I('Sikkerhet i dag', 3, 'Farlige operasjoner, SJA og værforhold.'),
        I('Dagens arbeid og bemanning', 5),
        I('Hindringer og behov', 5),
        I('Leveranser og logistikk', 2)),
    ],
  },
  {
    id: 'mal_ledelse',
    typeId: 'ledelse',
    name: 'Ledermøte',
    summary: 'Ledergruppen: nøkkeltall, ordrereserve, kapasitet, HMS og saker som krever beslutning.',
    durationMin: 90,
    recurrence: 'weekly',
    visibility: 'deltakere',
    chapters: [
      OPEN,
      C('Nøkkeltall',
        I('Økonomi og likviditet', 10),
        I('Ordrereserve og salg', 10),
        I('Kapasitet og bemanning', 10)),
      C('Drift',
        I('HMS og kvalitet', 5),
        I('Prosjekter med risiko', 15, 'Prosjekter med avvik i fremdrift, økonomi eller kvalitet.')),
      C('Beslutningssaker',
        I('Sak til beslutning', 15)),
      CLOSE,
    ],
  },
  {
    id: 'mal_styre',
    typeId: 'styre',
    name: 'Styremøte',
    summary: 'Styremøte med orienteringssaker og beslutningssaker. Referatet er styreprotokollen.',
    durationMin: 120,
    recurrence: 'none',
    visibility: 'deltakere',
    chapters: [
      C('Konstituering',
        I('Godkjenning av innkalling og dagsorden', 2),
        I('Valg av én til å signere protokollen sammen med møteleder', 2),
        I('Godkjenning av protokoll fra forrige styremøte', 3)),
      C('Orienteringssaker',
        I('Daglig leders rapport', 15),
        I('Økonomisk rapport og prognose', 15),
        I('HMS og risiko', 10)),
      C('Beslutningssaker',
        I('Sak til beslutning', 20, 'Saksframlegg og forslag til vedtak legges ved innkallingen.')),
      C('Avslutning',
        I('Eventuelt', 5),
        I('Møteplan', 2)),
    ],
  },
  {
    id: 'mal_avdeling',
    typeId: 'avdeling',
    name: 'Avdelings- og personalmøte',
    summary: 'Informasjon, status og medvirkning for alle i avdelingen.',
    durationMin: 60,
    recurrence: 'monthly',
    visibility: 'alle',
    chapters: [
      C('Informasjon',
        I('Siden sist', 10),
        I('Nye prosjekter og oppdrag', 10)),
      C('Arbeidsmiljø',
        I('HMS og trivsel', 10),
        I('Kompetanse og opplæring', 10)),
      C('Innspill',
        I('Forbedringsforslag', 10),
        I('Eventuelt', 5)),
    ],
  },
  {
    id: 'mal_kunde',
    typeId: 'kunde',
    name: 'Kunde- og statusmøte',
    summary: 'Status for kunden: leveranser, fremdrift, økonomi, endringer og neste steg.',
    durationMin: 60,
    recurrence: 'monthly',
    visibility: 'alle',
    chapters: [
      C('Status',
        I('Leveranser siden sist', 10),
        I('Fremdrift og milepæler', 10),
        I('Økonomi og fakturering', 10)),
      C('Endringer',
        I('Endringsønsker og avklaringer', 10)),
      C('Veien videre',
        I('Neste steg og ansvar', 10),
        I('Eventuelt', 5)),
    ],
  },
  {
    id: 'mal_overtakelse',
    typeId: 'overtakelse',
    name: 'Overtakelsesforretning',
    summary: 'Overlevering til byggherre: mangler, dokumentasjon, frister og garantiperiode.',
    durationMin: 120,
    recurrence: 'none',
    visibility: 'alle',
    chapters: [
      C('Grunnlag',
        I('Tilstedeværende og fullmakter', 5),
        I('Kontraktsgrunnlag og varsel om overtakelse', 5)),
      C('Befaring',
        I('Gjennomgang av arbeidene', 45),
        I('Registrerte mangler og frister for utbedring', 20, 'Mangelliste med ansvar og frist.')),
      C('Dokumentasjon',
        I('FDV- og sluttdokumentasjon', 10),
        I('Ferdigattest / midlertidig brukstillatelse', 5)),
      C('Avslutning',
        I('Sikkerhetsstillelse og garantiperiode', 5),
        I('Beslutning om overtakelse', 5)),
    ],
  },
  {
    id: 'mal_evaluering',
    typeId: 'evaluering',
    name: 'Erfaringsmøte',
    summary: 'Evaluering etter prosjekt eller milepæl: hva gikk bra, hva bør gjøres annerledes.',
    durationMin: 60,
    recurrence: 'none',
    visibility: 'alle',
    chapters: [
      C('Evaluering',
        I('Hva gikk bra?', 15),
        I('Hva bør vi gjøre annerledes?', 15),
        I('Økonomi, fremdrift og kvalitet mot mål', 10)),
      C('Læring',
        I('Tiltak og forbedringer', 15, 'Konkrete tiltak med ansvar. Legg dem gjerne inn i ISO-avvik og forbedring.')),
    ],
  },
];

export function normalizeTemplate(raw = {}) {
  const chapters = (Array.isArray(raw.chapters) ? raw.chapters : []).map((chapter) => normalizeChapter({
    ...chapter,
    items: (chapter.items || []).map((item) => ({
      title: item.title,
      description: item.description,
      minutes: item.minutes,
    })),
  })).filter((chapter) => chapter.title || chapter.items.length);
  return {
    id: text(raw.id) || createMeetingId('mal'),
    typeId: text(raw.typeId) || 'annet',
    name: text(raw.name) || 'Møtemal',
    summary: text(raw.summary),
    durationMin: Math.max(0, Math.min(600, Math.round(Number(raw.durationMin) || 0))) || 60,
    recurrence: normalizeRecurrence({ freq: raw.recurrence }).freq,
    visibility: raw.visibility === 'deltakere' ? 'deltakere' : 'alle',
    source: text(raw.source) || 'egen',
    builtin: !!raw.builtin,
    chapters,
    createdAt: text(raw.createdAt),
    createdBy: text(raw.createdBy),
    createdByName: text(raw.createdByName),
    updatedAt: text(raw.updatedAt),
  };
}

export function builtinTemplates() {
  return BUILTIN_TEMPLATES.map((row) => normalizeTemplate({ ...row, builtin: true, source: 'protop' }));
}

/** Bedriftens egne maler først, deretter ProTop-malene. */
export function allTemplates(own = []) {
  const mine = (own || []).map(normalizeTemplate);
  return [...mine, ...builtinTemplates()];
}

export function templateStats(template) {
  const items = (template?.chapters || []).reduce((sum, c) => sum + (c.items || []).length, 0);
  const minutes = (template?.chapters || []).reduce(
    (sum, c) => sum + (c.items || []).reduce((s, i) => s + (Number(i.minutes) || 0), 0),
    0,
  );
  return { chapters: (template?.chapters || []).length, items, minutes };
}

/** Kopierer malens dagsorden med nye id-er. */
export function agendaFromTemplate(template) {
  return (template?.chapters || []).map((chapter) => normalizeChapter({
    title: chapter.title,
    items: (chapter.items || []).map((item) => ({
      title: item.title,
      description: item.description,
      minutes: item.minutes,
    })),
  }));
}

/** Lagrer et møte som mal (bare dagsorden og standardverdier, ikke innhold). */
export function templateFromMeeting(meeting, { name = '', at = '', by = '', byName = '' } = {}) {
  const m = normalizeMeeting(meeting);
  const length = (() => {
    const [sh, sm] = (m.start || '').split(':').map(Number);
    const [eh, em] = (m.end || '').split(':').map(Number);
    const total = (eh * 60 + em) - (sh * 60 + sm);
    return Number.isFinite(total) && total > 0 ? total : 0;
  })();
  return normalizeTemplate({
    name: text(name) || m.title,
    typeId: m.typeId,
    summary: m.purpose ? m.purpose.split('\n')[0].slice(0, 200) : '',
    durationMin: length || 60,
    recurrence: m.recurrence.freq,
    visibility: m.visibility,
    source: 'egen',
    chapters: m.chapters.map((c) => ({
      title: c.title,
      items: c.items.map((i) => ({ title: i.title, description: i.description, minutes: i.minutes })),
    })),
    createdAt: at,
    createdBy: by,
    createdByName: byName,
    updatedAt: at,
  });
}

/* ───────── Fra skjema (Skjemabygger) ───────── */

function plain(value, max = 2000) {
  return String(value ?? '').replace(/\{\{[^}]+\}\}/g, '').replace(/\s+\n/g, '\n').trim().slice(0, max);
}

/** «# 1. Overskrift» → «Overskrift» */
function groupTitle(raw) {
  return plain(raw).replace(/^#+\s*/, '').replace(/^\d+(\.\d+)*\.?\s*/, '').trim();
}

const SKIP_LABELS = /^(prosjektnavn|prosjektnummer|prosjekt|møte\s*nr\.?|møtenummer|møtetidspunkt|møtested|referent|dato|tidspunkt|sted|signatur.*|tidspunkt for neste møte|sted for neste møte|type referat)$/i;
const PARTICIPANT_TABLE = /deltaker|tilstede|til stede/i;

/**
 * Gjør et skjema om til en dagsorden.
 * - Overskriftsfelt (kind `title`) blir kapitler.
 * - Spørsmål og felt blir punkter; hjelpetekst og faste tekster blir veiledning.
 * - Tabeller med grupperader (som «Saker» i Møtereferat) blir kapitler med punkter.
 * - Metafelt (prosjekt, møtested, referent …) og deltakertabeller hoppes over,
 *   de har egne felt i møtet.
 */
export function agendaFromForm(form) {
  const fields = Array.isArray(form?.fields) ? form.fields : [];
  const chapters = [];
  let current = null;
  const ensure = (title) => {
    if (!current) {
      current = { title: title || plain(form?.title) || 'Saker', items: [] };
      chapters.push(current);
    }
    return current;
  };
  for (const field of fields) {
    const kind = field?.kind;
    const label = plain(field?.label, 200);
    if (kind === 'title') {
      current = { title: label || 'Kapittel', items: [] };
      chapters.push(current);
      continue;
    }
    if (kind === 'sign' || kind === 'image' || kind === 'file') continue;
    if (kind === 'note') {
      const body = plain(field?.value || field?.label, 1200);
      const last = current?.items[current.items.length - 1];
      if (last && body) last.description = [last.description, body].filter(Boolean).join('\n\n');
      else if (body && current && !current.items.length) current.note = body;
      continue;
    }
    if (kind === 'table') {
      if (PARTICIPANT_TABLE.test(label)) continue;
      const rows = Array.isArray(field.rows) ? field.rows : [];
      const groups = rows.filter((row) => row && row.group);
      if (groups.length) {
        // Hver grupperad blir et kapittel; radene under blir punkter.
        if (current && !current.items.length && (/^(referat|saker)$/i.test(current.title))) {
          chapters.splice(chapters.indexOf(current), 1);
        }
        let chapter = null;
        for (const row of rows) {
          if (row.group) {
            chapter = { title: groupTitle(row.group) || 'Kapittel', items: [] };
            chapters.push(chapter);
          } else if (chapter) {
            const cells = row.cells || {};
            const textCell = Object.values(cells).map((v) => plain(v, 200)).find((v) => v && !/^\d+([.,]\d+)?$/.test(v));
            chapter.items.push({ title: textCell || `Punkt ${chapter.items.length + 1}`, minutes: 5 });
          }
        }
        current = chapter;
        continue;
      }
      ensure().items.push({
        title: label || 'Tabell',
        description: plain(field.help || field.legend, 600),
        minutes: 10,
      });
      continue;
    }
    if (!label || SKIP_LABELS.test(label)) continue;
    const description = [plain(field.help, 600), plain(field.placeholder, 200)].filter(Boolean).join('\n');
    const options = Array.isArray(field.options) && field.options.length
      ? `Valg: ${field.options.map((o) => plain(o.label, 60)).filter(Boolean).join(', ')}`
      : '';
    ensure().items.push({
      title: label,
      description: [description, options].filter(Boolean).join('\n'),
      minutes: kind === 'long' || kind === 'table' ? 10 : 5,
    });
  }
  return chapters
    .filter((chapter) => chapter.items.length)
    .map((chapter) => normalizeChapter({
      title: chapter.title,
      items: chapter.items.map((item, index) => ({
        ...item,
        description: index === 0 && chapter.note
          ? [chapter.note, item.description].filter(Boolean).join('\n\n')
          : item.description,
      })),
    }));
}

/** Gjetter møtetype ut fra tittel/tekst. */
export function guessType(...parts) {
  const hay = parts.map((p) => String(p || '').toLowerCase()).join(' ');
  const rules = [
    ['byggemote', /bygge?møte|byggeplass|entrepren/],
    ['oppstart', /oppstart|kick.?off/],
    ['prosjektering', /prosjektering|rib|riv|arkitekt|modell/],
    ['hms', /hms|verne|amu|arbeidsmiljø|sja|sikkerhet/],
    ['tavle', /tavle|morgenmøte|daglig|stand.?up/],
    ['styre', /styre(møte)?|generalforsamling|protokoll/],
    ['ledelse', /leder(møte|gruppe)|ledelse/],
    ['avdeling', /avdeling|personal(møte)?|allmøte|felles/],
    ['kunde', /kunde|status(møte)?|oppdragsgiver/],
    ['overtakelse', /overtakelse|overlevering|ferdigbefaring|mangel/],
    ['evaluering', /erfaring|evaluering|læring|retro/],
  ];
  return rules.find(([, re]) => re.test(hay))?.[0] || 'annet';
}

/** Malen som passer best til en fritekst (brukes når AI ikke svarer). */
export function bestTemplateFor(description) {
  const typeId = guessType(description);
  return builtinTemplates().find((row) => row.typeId === typeId) || null;
}
