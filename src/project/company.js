/** Bedrift, anbud og prosjekt — lagret på organisasjonen, ikke i det gamle lokale prosjektskuffet. */

export const PROJECT_PHASES = ['tilbud', 'planlegging', 'produksjon', 'overlevering', 'avsluttet'];
export const TENDER_STATUSES = ['utkast', 'sendt', 'vunnet', 'tapt'];

export function companyFromBrreg(hit) {
  if (!hit?.organisasjonsnummer || !hit?.navn) return null;
  return {
    organisasjonsnummer: hit.organisasjonsnummer,
    navn: hit.navn,
    organisasjonsform: hit.organisasjonsform || '',
    naeringskode: hit.naeringskode || '',
    naeringsbeskrivelse: hit.naeringsbeskrivelse || '',
    addressLabel: hit.addressLabel || '',
    hjemmeside: hit.hjemmeside || '',
    epostadresse: hit.epostadresse || '',
    telefon: '',
  };
}

export function createProjectRecord(input) {
  const name = String(input?.name || '').trim();
  const number = String(input?.number || '').trim();
  if (!name) return { ok: false, error: 'Prosjektnavn må fylles ut.' };
  if (!number) return { ok: false, error: 'Prosjektnummer må fylles ut.' };
  return {
    ok: true,
    record: {
      id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      number,
      place: String(input?.place || '').trim(),
      client: String(input?.client || '').trim(),
      phase: PROJECT_PHASES.includes(input?.phase) ? input.phase : 'planlegging',
      createdAt: new Date().toISOString(),
    },
  };
}

export function createTenderRecord(input) {
  const title = String(input?.title || '').trim();
  if (!title) return { ok: false, error: 'Anbudet må ha et navn.' };
  const status = TENDER_STATUSES.includes(input?.status) ? input.status : 'utkast';
  return {
    ok: true,
    record: {
      id: `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      client: String(input?.client || '').trim(),
      deadline: String(input?.deadline || '').trim(),
      amount: String(input?.amount || '').trim(),
      status,
      createdAt: new Date().toISOString(),
    },
  };
}
