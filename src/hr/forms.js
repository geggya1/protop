/**
 * Standardmaler for skjemabyggeren: arbeidsavtale og medarbeidersamtale.
 */
import { blankField, blankForm } from '../anbud/formBuilder.js';

export function employmentContractFormTemplate() {
  const base = blankForm();
  return {
    ...base,
    id: base.id,
    title: 'Arbeidsavtale',
    category: 'avtale',
    intro: 'Standardisert arbeidsavtale etter AML § 14-6. Fyll ut og lagre på den ansatte.',
    fields: [
      { ...blankField('text'), label: 'Arbeidsgiver', required: true },
      { ...blankField('text'), label: 'Arbeidstaker', required: true },
      { ...blankField('text'), label: 'Arbeidssted', required: true },
      { ...blankField('text'), label: 'Stilling / tittel', required: true },
      { ...blankField('long'), label: 'Beskrivelse av arbeidet / rollen' },
      { ...blankField('date'), label: 'Startdato', required: true },
      { ...blankField('date'), label: 'Sluttdato (midlertidig)' },
      { ...blankField('text'), label: 'Grunnlag for midlertidighet' },
      { ...blankField('number'), label: 'Prøvetid (måneder)' },
      { ...blankField('text'), label: 'Stillingsprosent', required: true },
      { ...blankField('text'), label: 'Arbeidstid' },
      { ...blankField('text'), label: 'Pauser' },
      { ...blankField('text'), label: 'Årslønn / lønn', required: true },
      { ...blankField('text'), label: 'Tillegg / godtgjørelser' },
      { ...blankField('text'), label: 'Utbetalingsmåte' },
      { ...blankField('text'), label: 'Oppsigelsesfrist', required: true },
      { ...blankField('text'), label: 'Ferie / feriepenger' },
      { ...blankField('text'), label: 'Tariffavtale' },
      { ...blankField('long'), label: 'Øvrige betingelser' },
    ],
  };
}

export function performanceReviewFormTemplate() {
  const base = blankForm();
  return {
    ...base,
    id: base.id,
    title: 'Medarbeidersamtale',
    category: 'skjema',
    intro: 'Strukturert samtale om trivsel, utvikling og mål (AML §§ 4-2 / 4-3).',
    fields: [
      { ...blankField('date'), label: 'Dato', required: true },
      { ...blankField('text'), label: 'Samtalepartner / leder', required: true },
      { ...blankField('text'), label: 'Medarbeider', required: true },
      {
        ...blankField('choice'),
        label: 'Trivsel',
        options: [
          { id: '1', label: '1' }, { id: '2', label: '2' }, { id: '3', label: '3' },
          { id: '4', label: '4' }, { id: '5', label: '5' },
        ],
      },
      { ...blankField('long'), label: 'Hva fungerer bra' },
      { ...blankField('long'), label: 'Utfordringer / forbedringsområder' },
      { ...blankField('long'), label: 'Kompetanse og utvikling' },
      { ...blankField('long'), label: 'Mål frem til neste samtale' },
      { ...blankField('long'), label: 'Oppfølgingspunkter / avvik' },
      { ...blankField('long'), label: 'Sammendrag' },
    ],
  };
}

/** Map skjemasvar → HR-kontraktfelter. */
export function answersToContractFields(form) {
  const byLabel = {};
  for (const field of form?.fields || []) {
    byLabel[String(field.label || '').toLowerCase()] = field.value;
  }
  const g = (...labels) => {
    for (const label of labels) {
      const v = byLabel[label.toLowerCase()];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return '';
  };
  return {
    employerName: g('Arbeidsgiver'),
    employeeName: g('Arbeidstaker'),
    workplace: g('Arbeidssted'),
    positionTitle: g('Stilling / tittel', 'Stilling'),
    roleDescription: g('Beskrivelse av arbeidet / rollen'),
    startDate: g('Startdato'),
    endDate: g('Sluttdato (midlertidig)'),
    temporaryBasis: g('Grunnlag for midlertidighet'),
    probationMonths: g('Prøvetid (måneder)'),
    workPercent: g('Stillingsprosent'),
    workHours: g('Arbeidstid'),
    breakLength: g('Pauser'),
    salaryAmount: g('Årslønn / lønn', 'Årslønn'),
    salaryExtras: g('Tillegg / godtgjørelser'),
    paySchedule: g('Utbetalingsmåte'),
    noticePeriod: g('Oppsigelsesfrist'),
    holidayTerms: g('Ferie / feriepenger'),
    collectiveAgreement: g('Tariffavtale'),
    otherTerms: g('Øvrige betingelser'),
  };
}

export function answersToReviewFields(form) {
  const byLabel = {};
  for (const field of form?.fields || []) {
    byLabel[String(field.label || '').toLowerCase()] = field.value;
  }
  const g = (label) => {
    const v = byLabel[label.toLowerCase()];
    return v != null ? String(v).trim() : '';
  };
  return {
    date: g('Dato'),
    interviewer: g('Samtalepartner / leder'),
    summary: g('Sammendrag') || g('Hva fungerer bra'),
    goals: g('Mål frem til neste samtale'),
    wellbeing: g('Trivsel'),
    strengths: g('Hva fungerer bra'),
    challenges: g('Utfordringer / forbedringsområder'),
    development: g('Kompetanse og utvikling'),
    followUps: g('Oppfølgingspunkter / avvik'),
  };
}
