/** Avtaleinnstillinger for indeksregulering: nivå, hyppighet og første dato. */

export const REGULATION_FREQUENCIES = [
  { id: 'month', label: 'Hver måned' },
  { id: 'quarter', label: 'Hvert kvartal' },
  { id: 'half', label: 'Hvert halvår' },
  { id: 'year', label: 'Én gang i året' },
  { id: 'once', label: 'Bare én gang' },
];

export const REGULATION_SCOPES = [
  { id: 'avtale', label: 'På denne avtalen' },
  { id: 'ramme', label: 'På rammeavtalen' },
  { id: 'avrop', label: 'På hvert avrop' },
];

const FREQUENCIES = new Set(REGULATION_FREQUENCIES.map((row) => row.id));
const SCOPES = new Set(REGULATION_SCOPES.map((row) => row.id));

function text(value) {
  return String(value || '').trim();
}

export function frequencyLabel(id) {
  return REGULATION_FREQUENCIES.find((row) => row.id === id)?.label || '';
}

export function scopeLabel(id) {
  return REGULATION_SCOPES.find((row) => row.id === id)?.label || '';
}

export function readRegulation(contract) {
  const fields = contract?.fields && typeof contract.fields === 'object' ? contract.fields : {};
  const draft = contract?.indexDraft && typeof contract.indexDraft === 'object' ? contract.indexDraft : {};
  const terms = fields.terms && typeof fields.terms === 'object'
    ? fields.terms
    : (draft.terms && typeof draft.terms === 'object' ? draft.terms : {});
  const scope = text(fields.regulationScope || terms.scope);
  const frequency = text(fields.regulationFrequency || terms.frequency);
  return {
    scope: SCOPES.has(scope) ? scope : '',
    frequency: FREQUENCIES.has(frequency) ? frequency : '',
    firstRegulationDate: text(fields.firstRegulationDate || draft.firstRegulationDate),
    indexId: text(fields.indexId || draft.indexId),
  };
}

/**
 * Gjeldende vilkår. Avrop uten eget valg arver rammeavtalen.
 * Rammeavtale reguleres på rammen til noe annet er valgt.
 */
export function effectiveRegulation(contract, contracts = []) {
  const own = readRegulation(contract);
  const parent = (Array.isArray(contracts) ? contracts : []).find((row) => row?.id && row.id === contract?.parentId) || null;
  const parentOwn = parent ? readRegulation(parent) : null;
  let scope = own.scope;
  if (!scope && contract?.kind === 'avrop') scope = parentOwn?.scope || 'ramme';
  if (!scope) scope = contract?.kind === 'rammeavtale' ? 'ramme' : 'avtale';
  const frequency = own.frequency || (contract?.kind === 'avrop' ? parentOwn?.frequency : '') || 'month';
  const firstRegulationDate = own.firstRegulationDate
    || (contract?.kind === 'avrop' ? parentOwn?.firstRegulationDate : '')
    || '';
  const regulatesHere = contract?.kind === 'avrop'
    ? scope !== 'ramme'
    : contract?.kind === 'rammeavtale'
      ? scope !== 'avrop'
      : true;
  const indexId = own.indexId || (regulatesHere ? '' : (parentOwn?.indexId || ''));
  return {
    scope,
    frequency,
    firstRegulationDate,
    regulatesHere,
    indexId: own.indexId || indexId,
  };
}

/** Verdier som skal vises og lagres på avtalesiden. */
export function regulationFormFields(contract, contracts = []) {
  const effective = effectiveRegulation(contract, contracts);
  return {
    regulationScope: effective.scope,
    regulationFrequency: effective.frequency,
    firstRegulationDate: effective.firstRegulationDate,
  };
}
