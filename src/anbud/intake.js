/** Mottak av anbud: direkte i ProTop, Doffin-varsel, eller manuell henvendelse. */

export const INTAKE_SOURCES = ['protop', 'doffin', 'manuell'];
export const INTAKE_CHANNELS = [
  { id: 'epost', label: 'E-post' },
  { id: 'telefon', label: 'Telefon' },
  { id: 'brev', label: 'Brev' },
  { id: 'annet', label: 'Annet' },
];

function text(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function id() {
  return `in_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function tenderFromScan(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const amount = Number(src.amount);
  return {
    title: text(src.title, 160),
    buyer: text(src.buyer, 160),
    contactName: text(src.contactName, 120),
    email: text(src.email, 160).toLowerCase(),
    phone: text(src.phone, 40),
    deadline: text(src.deadline, 40),
    description: text(src.description, 2000),
    reference: text(src.reference, 80),
    amount: Number.isFinite(amount) ? amount : null,
  };
}

function fill(current, incoming) {
  const value = text(current);
  if (!value || value === 'Henvendelse uten tittel') return incoming || value;
  return value;
}

export function applyScan(inquiry, raw, { engine = 'gemini' } = {}) {
  const extracted = tenderFromScan(raw);
  const next = {
    ...inquiry,
    title: fill(inquiry.title, extracted.title),
    buyer: fill(inquiry.buyer, extracted.buyer),
    contactName: fill(inquiry.contactName, extracted.contactName),
    email: fill(inquiry.email, extracted.email),
    phone: fill(inquiry.phone, extracted.phone),
    deadline: fill(inquiry.deadline, extracted.deadline),
    description: fill(inquiry.description, extracted.description),
    reference: fill(inquiry.reference, extracted.reference),
    amount: inquiry.amount == null ? extracted.amount : inquiry.amount,
    ocrStatus: 'done',
    ocrEngine: engine,
  };
  return next;
}

export function createManualInquiry(input, attachments = []) {
  const channel = INTAKE_CHANNELS.some((row) => row.id === input?.channel) ? input.channel : 'annet';
  const title = text(input?.title, 160);
  const contactName = text(input?.contactName, 120);
  const email = text(input?.email, 160).toLowerCase();
  const phone = text(input?.phone, 40);
  if (!title && !contactName && !email && !phone) {
    return { ok: false, error: 'Fyll inn tittel eller en kontakt.' };
  }
  const files = (Array.isArray(attachments) ? attachments : []).slice(0, 12).map((file) => ({
    name: text(file?.name, 180) || 'vedlegg',
    mime: text(file?.mime, 80) || 'application/octet-stream',
    size: Number(file?.size) || 0,
  }));
  return {
    ok: true,
    inquiry: {
      id: id(),
      source: 'manuell',
      channel,
      title: title || 'Henvendelse uten tittel',
      buyer: text(input?.buyer, 160),
      contactName,
      email,
      phone,
      deadline: text(input?.deadline, 40),
      description: text(input?.description, 2000),
      reference: text(input?.reference, 80),
      amount: Number.isFinite(Number(input?.amount)) ? Number(input.amount) : null,
      attachments: files,
      ocrStatus: input?.ocrStatus || (files.length ? 'pending' : ''),
      ocrEngine: text(input?.ocrEngine, 40),
      status: 'mottatt',
      createdAt: new Date().toISOString(),
    },
  };
}

export function createDirectInquiry(input) {
  const title = text(input?.title, 160);
  const toOrgnr = String(input?.toOrgnr || '').replace(/\D/g, '').slice(0, 9);
  if (!title) return { ok: false, error: 'Forespørselen må ha et navn.' };
  if (toOrgnr.length !== 9) return { ok: false, error: 'Mottaker må ha et organisasjonsnummer.' };
  return {
    ok: true,
    inquiry: {
      id: id(),
      source: 'protop',
      channel: 'protop',
      title,
      buyer: text(input?.fromName, 160),
      fromCompanyId: text(input?.fromCompanyId, 80),
      fromName: text(input?.fromName, 160),
      toOrgnr,
      contactName: text(input?.contactName, 120),
      email: text(input?.email, 160).toLowerCase(),
      phone: text(input?.phone, 40),
      description: text(input?.message, 2000),
      deadline: '',
      reference: '',
      amount: null,
      attachments: [],
      ocrStatus: '',
      ocrEngine: '',
      status: 'mottatt',
      createdAt: new Date().toISOString(),
    },
  };
}
