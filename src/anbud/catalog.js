/** CPV-koder som er vanlige for bygg og anlegg. Koden søkes med underkoder hos Doffin. */

export const CPV_CODES = [
  { code: '45000000', label: 'Bygge- og anleggsarbeid' },
  { code: '45100000', label: 'Klargjøring av byggeplass' },
  { code: '45110000', label: 'Riving og grunnarbeid' },
  { code: '45200000', label: 'Arbeid på bygg eller anlegg' },
  { code: '45210000', label: 'Byggearbeid' },
  { code: '45220000', label: 'Ingeniørarbeid og anlegg' },
  { code: '45230000', label: 'Rør, ledninger og anlegg i dagen' },
  { code: '45233000', label: 'Veier, gater og fortau' },
  { code: '45300000', label: 'Installasjonsarbeid i bygg' },
  { code: '45310000', label: 'Elektrisk installasjon' },
  { code: '45330000', label: 'Rørlegger- og sanitærarbeid' },
  { code: '45331000', label: 'Varme, ventilasjon og klima' },
  { code: '45400000', label: 'Ferdigstillelse av bygg' },
  { code: '45420000', label: 'Snekker- og tømrerarbeid' },
  { code: '45430000', label: 'Gulv og veggkledning' },
  { code: '45440000', label: 'Maling og glass' },
  { code: '71000000', label: 'Arkitekt-, konstruksjons- og ingeniørtjenester' },
  { code: '71300000', label: 'Ingeniørtjenester' },
  { code: '71500000', label: 'Tjenester tilknyttet bygg og anlegg' },
];

/** Fylker slik Doffin grupperer utførelsessted (NUTS). */
export const TENDER_AREAS = [
  { id: 'NO081', name: 'Oslo' },
  { id: 'NO084', name: 'Akershus' },
  { id: 'NO083', name: 'Østfold' },
  { id: 'NO085', name: 'Buskerud' },
  { id: 'NO020', name: 'Innlandet' },
  { id: 'NO093', name: 'Vestfold' },
  { id: 'NO094', name: 'Telemark' },
  { id: 'NO092', name: 'Agder' },
  { id: 'NO0A1', name: 'Rogaland' },
  { id: 'NO0A2', name: 'Vestland' },
  { id: 'NO0A3', name: 'Møre og Romsdal' },
  { id: 'NO060', name: 'Trøndelag' },
  { id: 'NO071', name: 'Nordland' },
  { id: 'NO072', name: 'Troms' },
  { id: 'NO073', name: 'Finnmark' },
];

export const CPV_GROUPS = [
  {
    code: '45000000',
    label: 'Bygge- og anleggsarbeid',
    children: CPV_CODES.filter((row) => row.code.startsWith('45') && row.code !== '45000000'),
  },
  {
    code: '71000000',
    label: 'Arkitekt-, konstruksjons- og ingeniørtjenester',
    children: [
      ...CPV_CODES.filter((row) => row.code.startsWith('71') && row.code !== '71000000'),
      { code: '71200000', label: 'Arkitekttjenester' },
      { code: '71240000', label: 'Arkitekttjenester, ingeniørfag og planlegging' },
      { code: '71250000', label: 'Arkitekttjenester, tilsyn' },
      { code: '71310000', label: 'Rådgivende ingeniørtjenester' },
      { code: '71311000', label: 'Rådgivning innen byggteknikk' },
      { code: '71320000', label: 'Ingeniørtjenester, prosjektering' },
      { code: '71322000', label: 'Ingeniørtjenester for bygg og anlegg' },
    ],
  },
];

export function cpvByCode(code) {
  return CPV_CODES.find((row) => row.code === String(code || '').trim()) || null;
}

export function areaById(id) {
  return TENDER_AREAS.find((row) => row.id === String(id || '').trim()) || null;
}
