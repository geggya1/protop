/** Avgjør om et orgnummer allerede er en bedrift, og bygger innpass-forespørsel. */

export function digitsOrgnr(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 9);
}

export function organizationByOrgnr(groups, orgnr) {
  const id = digitsOrgnr(orgnr);
  if (id.length !== 9) return null;
  return (groups || []).find((group) => {
    const stored = digitsOrgnr(group?.company?.organisasjonsnummer || group?.orgnr);
    return stored === id;
  }) || null;
}

export function companyRegistrationDecision(existing) {
  if (existing?.id) {
    return {
      kind: 'join',
      companyId: existing.id,
      companyName: existing.company?.navn || existing.name || 'Bedriften',
    };
  }
  return { kind: 'create' };
}

export function buildJoinRequest({ uid, name, email, at }) {
  return {
    uid: String(uid || ''),
    name: String(name || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    status: 'pending',
    createdAt: at || new Date().toISOString(),
  };
}

export function manualCompany({ name, address }) {
  const navn = String(name || '').trim();
  if (!navn) return { ok: false, error: 'Bedriftsnavn må fylles ut.' };
  return {
    ok: true,
    company: {
      organisasjonsnummer: '',
      navn,
      organisasjonsform: '',
      naeringskode: '',
      naeringsbeskrivelse: '',
      addressLabel: String(address || '').trim(),
      hjemmeside: '',
      epostadresse: '',
      telefon: '',
      manual: true,
    },
  };
}
