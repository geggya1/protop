/**
 * OCR/AI-uthenting av nøkkeldata fra arbeidsavtaler.
 * Bruker samme interpretImport-kanal som CV/ansatt-import når mulig,
 * med lokal fallback-parsing for åpne tekstfelter.
 * AI-klienten lastes dynamisk så lokal parsing kan testes uten Firebase.
 */
import { AML_CONTRACT_FIELDS } from './compliance.js';

const FIELD_HINTS = AML_CONTRACT_FIELDS.map((row) => `${row.key}: ${row.label}`).join('\n');

export function employmentContractPrompt(text) {
  return `Du leser en norsk arbeidsavtale / ansettelseskontrakt.
Trekk ut nøkkeldata. Ikke finn opp verdier. Tom streng når ukjent.
Returner KUN JSON med disse nøklene:
${FIELD_HINTS}

Datoer YYYY-MM-DD. Stillingsprosent som tall (f.eks. "100").
Prøvetid i hele måneder som tallstreng.
Tekst fra avtalen:
---
${String(text || '').slice(0, 120000)}
---`;
}

/** Enkel regex-fallback når AI ikke er tilgjengelig. */
export function parseEmploymentContractText(text) {
  const raw = String(text || '');
  const pick = (re) => {
    const m = raw.match(re);
    return m ? String(m[1] || m[2] || '').trim() : '';
  };
  const iso = (value) => {
    const m = String(value || '').match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const i = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    return i ? i[0] : '';
  };
  return {
    employerName: pick(/arbeidsgiver[:\s]+([^\n,]+)/i),
    employeeName: pick(/arbeidstaker[:\s]+([^\n,]+)/i) || pick(/navn[:\s]+([^\n,]+)/i),
    workplace: pick(/arbeidssted[:\s]+([^\n]+)/i) || pick(/arbeidsplass[:\s]+([^\n]+)/i),
    title: pick(/stilling(?:stittel)?[:\s]+([^\n]+)/i) || pick(/tittel[:\s]+([^\n]+)/i),
    positionTitle: pick(/stilling(?:stittel)?[:\s]+([^\n]+)/i) || pick(/tittel[:\s]+([^\n]+)/i),
    roleDescription: pick(/arbeidsoppgaver[:\s]+([^\n]+(?:\n(?![A-ZÆØÅ]).+)*)/i),
    startDate: iso(pick(/tiltrer[:\s]+([^\n]+)/i) || pick(/startdato[:\s]+([^\n]+)/i) || pick(/fra\s+og\s+med[:\s]+([^\n]+)/i)),
    employmentType: pick(/ansettelsesform[:\s]+([^\n]+)/i),
    endDate: iso(pick(/til\s+og\s+med[:\s]+([^\n]+)/i) || pick(/sluttdato[:\s]+([^\n]+)/i)),
    temporaryBasis: pick(/midlertidig[^.\n]*grunnlag[:\s]+([^\n]+)/i),
    probationMonths: pick(/prøvetid[:\s]+(\d+)\s*måned/i),
    holidayTerms: pick(/ferie[:\s]+([^\n]+)/i),
    noticePeriod: pick(/oppsigelsesfrist[:\s]+([^\n]+)/i),
    terminationProcedure: pick(/(?:opphør|søksmål)[^:\n]*:\s*([^\n]+)/i),
    salaryAmount: pick(/årslønn[:\s]+([\d\s.]+)/i) || pick(/lønn[:\s]+([\d\s.]+)/i),
    salaryExtras: pick(/tillegg[:\s]+([^\n]+)/i),
    paySchedule: pick(/utbetales[:\s]+([^\n]+)/i),
    workPercent: pick(/stillingsprosent[:\s]+(\d+)/i) || pick(/(\d+)\s*%\s*stilling/i),
    workHours: pick(/arbeidstid[:\s]+([^\n]+)/i),
    overtimeTerms: pick(/overtid[:\s]+([^\n]+)/i),
    breakLength: pick(/pause[:\s]+([^\n]+)/i),
    collectiveAgreement: pick(/tariffavtale[:\s]+([^\n]+)/i),
    hirerIdentity: pick(/innleievirksomhet[:\s]+([^\n]+)/i),
    competenceDevelopment: pick(/kompetanseutvikling[:\s]+([^\n]+)/i),
    pensionInsurance: pick(/pensjon[:\s]+([^\n]+)/i),
    passportOrId: pick(/pass(?:nummer)?[:\s]+([^\n]+)/i) || pick(/fødselsnummer[:\s]+([^\n]+)/i),
    loanOrAdvance: pick(/lån[:\s]+([^\n]+)/i) || pick(/forskudd[:\s]+([^\n]+)/i),
    otherTerms: '',
  };
}

export function mergeContractExtract(base, extra) {
  const out = { ...(base || {}) };
  for (const field of AML_CONTRACT_FIELDS) {
    const next = String(extra?.[field.key] ?? '').trim();
    if (next && !String(out[field.key] || '').trim()) out[field.key] = next;
  }
  return out;
}

/**
 * Tolker avtale-tekst eller filvia interpretImport (kind employees/ocr-lignende).
 * Faller tilbake til lokal parsing.
 */
export async function interpretEmploymentContract({
  familyId = '',
  text = '',
  filename = '',
  bytes = null,
} = {}) {
  const local = parseEmploymentContractText(text);
  if (!familyId) return { ok: true, fields: local, source: 'local' };

  try {
    const { askImportInterpret } = await import('../imports/interpretClient.js');
    const result = await askImportInterpret({
      familyId,
      kind: 'employees',
      mode: 'ocr',
      filename: filename || 'arbeidsavtale.pdf',
      text: text
        ? `${employmentContractPrompt(text)}\n\nReturner også person.firstName/lastName når navn finnes.`
        : undefined,
      bytes: bytes || undefined,
    });
    const data = result?.data || result || {};
    // interpretImport returnerer ofte mapped rows — plukk felt aggressivt
    const row = Array.isArray(data.rows) ? data.rows[0] : (data.fields || data.mapping || data);
    const fromAi = {};
    if (row && typeof row === 'object') {
      for (const field of AML_CONTRACT_FIELDS) {
        const val = row[field.key]
          || row[`company.${field.key}`]
          || row[field.label]
          || '';
        if (val) fromAi[field.key] = String(val).trim();
      }
      if (row.person?.firstName || row.firstName) {
        fromAi.employeeName = [row.person?.firstName || row.firstName, row.person?.lastName || row.lastName]
          .filter(Boolean).join(' ');
      }
      if (row.company?.title) {
        fromAi.title = String(row.company.title);
        fromAi.positionTitle = String(row.company.title);
      }
      if (row.company?.periodFrom) fromAi.startDate = String(row.company.periodFrom).slice(0, 10);
      if (row.company?.workPercent) fromAi.workPercent = String(row.company.workPercent);
    }
    return {
      ok: true,
      fields: mergeContractExtract(local, fromAi),
      source: 'ai',
      raw: data,
    };
  } catch (error) {
    return {
      ok: true,
      fields: local,
      source: 'local',
      error: String(error?.message || error || ''),
    };
  }
}

/** Map ekstraherte avtalefelt inn i ansatt-stamdata. */
export function applyContractFieldsToEmployee(employee, fields = {}) {
  const next = JSON.parse(JSON.stringify(employee || {}));
  if (!next.person) next.person = {};
  if (!next.company) next.company = {};
  if (fields.employeeName && !next.person.firstName) {
    const parts = String(fields.employeeName).split(/\s+/).filter(Boolean);
    next.person.firstName = parts[0] || '';
    next.person.lastName = parts.slice(1).join(' ');
  }
  if (fields.positionTitle || fields.title) {
    next.company.title = fields.positionTitle || fields.title;
  }
  if (fields.startDate) next.company.periodFrom = fields.startDate;
  if (fields.endDate) next.company.periodTo = fields.endDate;
  if (fields.workPercent) next.company.workPercent = String(fields.workPercent).replace(/[^\d.]/g, '') || next.company.workPercent;
  if (fields.roleDescription) {
    next.company.comment = [next.company.comment, fields.roleDescription].filter(Boolean).join('\n');
  }
  return next;
}
