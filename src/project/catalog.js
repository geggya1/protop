/** Public NS 3451 bygningsdeler (two-digit) used as project cost codes. */

export const COST_CODES = [
  { code: '21', name: 'Grunn og fundamenter' },
  { code: '22', name: 'Bæresystemer' },
  { code: '23', name: 'Yttervegger' },
  { code: '24', name: 'Innervegger' },
  { code: '25', name: 'Dekker' },
  { code: '26', name: 'Yttertak' },
  { code: '28', name: 'Trapper og balkonger' },
  { code: '31', name: 'Sanitær' },
  { code: '32', name: 'Varme' },
  { code: '36', name: 'Luftbehandling' },
  { code: '44', name: 'Lys' },
  { code: '45', name: 'Elvarme' },
  { code: '56', name: 'Automatisering' },
  { code: '62', name: 'Person- og varetransport' },
  { code: '71', name: 'Bearbeidet terreng' },
  { code: '76', name: 'Veier og plasser' },
  { code: '19', name: 'Felles rigg og drift' },
];

export const ACCOUNTS = [
  { code: '3000', name: 'Entrepriseinntekt', kind: 'income' },
  { code: '3100', name: 'Endringsinntekt', kind: 'income' },
  { code: '4010', name: 'Materialer', kind: 'cost' },
  { code: '4100', name: 'Underentreprenør', kind: 'cost' },
  { code: '5010', name: 'Egne timer', kind: 'cost' },
  { code: '5400', name: 'Overtid', kind: 'cost' },
  { code: '7100', name: 'Rigg og drift', kind: 'cost' },
  { code: '7790', name: 'Andre prosjektkostnader', kind: 'cost' },
];

export const HOUR_ACCOUNTS = ['5010', '5400'];

export const PHASES = [
  'tilbud',
  'planlegging',
  'produksjon',
  'overlevering',
  'garanti',
  'avsluttet',
];

export const ISO_STANDARDS = ['ISO 9001', 'ISO 14001', 'ISO 45001'];

export const CHECKLIST_TEMPLATES = [
  {
    id: 'oppstart',
    title: 'Oppstartsmøte',
    items: ['SHA gjennomgått', 'Tegningsliste stemmer', 'Riggeplan godkjent', 'Nabo varslet'],
  },
  {
    id: 'vernerunde',
    title: 'Vernerunde',
    items: ['Rømningsveier frie', 'Avfall sortert', 'Stillaser merket', 'Verneutstyr i bruk', 'Førstehjelp på plass'],
  },
  {
    id: 'stope',
    title: 'KS støp',
    items: ['Armering kontrollert', 'Utsparinger merket', 'Vær innenfor krav', 'Protokoll signert'],
  },
  {
    id: 'slutt',
    title: 'Sluttbefaring',
    items: ['Mangeliste opprettet', 'FDV samlet', 'Nøkler overlevert', 'Overtakelsesprotokoll'],
  },
];

export function defaultProcedures() {
  return [
    { id: 'P-4.1', title: 'Kontekst og interessenter', iso: 'ISO 9001 kap. 4', body: 'Kartlegg kunde, myndighet, nabo og egne mål før oppstart.' },
    { id: 'P-5.1', title: 'Ledelsens ansvar', iso: 'ISO 9001 kap. 5', body: 'Prosjektleder eier fremdrift, økonomi, HMS og kvalitet.' },
    { id: 'P-6.1', title: 'Risiko og muligheter', iso: 'ISO 9001 / 14001 / 45001 kap. 6', body: 'SJA før risikoarbeid. Miljømål for avfall settes per prosjekt.' },
    { id: 'P-7.5', title: 'Dokumentert informasjon', iso: 'ISO 9001 kap. 7.5', body: 'Tegninger og prosedyrer har revisjon. Gjeldende revisjon er den høyeste godkjente.' },
    { id: 'P-8.1', title: 'Drift av prosjekt', iso: 'ISO 9001 kap. 8', body: 'Aktiviteter, sjekklister og møter styrer produksjonen.' },
    { id: 'P-8.2', title: 'SHA og HMS', iso: 'ISO 45001 kap. 8', body: 'HMS-tavle, SJA, RUH og vernerunde er obligatorisk i produksjon.' },
    { id: 'P-9.2', title: 'Intern revisjon', iso: 'ISO 9001 kap. 9.2', body: 'Revider 9001, 14001 og 45001 minst én gang per prosjektfase.' },
    { id: 'P-10.2', title: 'Avvik og korrigerende tiltak', iso: 'ISO 9001 kap. 10.2', body: 'Et avvik lukkes først når årsak og tiltak er fylt ut.' },
  ];
}

export function costCode(code) {
  return COST_CODES.find((row) => row.code === String(code || '').trim()) || null;
}

export function account(code) {
  return ACCOUNTS.find((row) => row.code === String(code || '').trim()) || null;
}
