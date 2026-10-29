/**
 * Purring, inkassovarsel, inkasso og rentefaktura. ProTop styrer innkrevingen, også for
 * fakturaer som er sendt fra PowerOffice. Betalingsstatus kommer derfra med synken.
 *
 * Regler (inkassoloven § 9 og § 17, inkassoforskriften kap. 1, forsinkelsesrenteloven):
 * - Purregebyr tidligst 14 dager etter forfall, og med ny frist på minst 14 dager.
 * - Gebyr for høyst to påminnelser/varsler per krav (purring + inkassovarsel).
 * - Inkassovarsel gir minst 14 dagers frist før saken kan sendes til inkasso.
 * - Gebyret har et tak (REMINDER_FEE_MAX, 1/20 av inkassosatsen: 38 kr i 2026).
 * - Forsinkelsesrenten settes per halvår (1. januar og 1. juli).
 */
import { REMINDER_FEE_MAX } from './companyInvoiceDefaults.js';
import { emptyInvoice, formatDate, formatMoney, newInvoiceId, normalizeInvoice, parseDate, parseMoney, text } from './invoices.js';
import { isCreditNote, isDraftInvoice, paidAmountOf, recalcInvoice, withEvent } from './invoiceFlow.js';

/** Forsinkelsesrente per halvår (Finanstilsynet). Ny sats legges inn her hvert halvår. */
export const LATE_INTEREST_RATES = [
  { from: '2024-01-01', rate: 12.5 },
  { from: '2024-07-01', rate: 12.5 },
  { from: '2025-01-01', rate: 12.5 },
  { from: '2025-07-01', rate: 12.25 },
  { from: '2026-01-01', rate: 12 },
  { from: '2026-07-01', rate: 12.25 },
];

export const NOTICE_DAYS = 14;
export const REMINDER_FEE_CAP = REMINDER_FEE_MAX;
export const FEE_NOTICES_MAX = 2;

export const COLLECTION_KINDS = {
  friendly: { label: 'Påminnelse', title: 'BETALINGSPÅMINNELSE' },
  reminder: { label: 'Purring', title: 'PURRING' },
  notice: { label: 'Inkassovarsel (purring 2)', title: 'INKASSOVARSEL' },
  debt: { label: 'Inkasso', title: 'KRAVSOPPSTILLING' },
  interest: { label: 'Rentefaktura', title: 'RENTEFAKTURA' },
};

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function dayNumber(iso) {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return dayNumber(to) - dayNumber(from);
}

function todayIso(today) {
  return parseDate(today) || new Date().toISOString().slice(0, 10);
}

/** Satsen som gjelder en dag, eller null før første sats i tabellen. */
export function lateInterestRate(date) {
  const day = parseDate(date);
  let hit = null;
  for (const row of LATE_INTEREST_RATES) {
    if (row.from <= day) hit = row;
  }
  return hit;
}

function invoiceTotal(invoice) {
  return round2(parseMoney(invoice?.amountInclVat) || 0);
}

/**
 * Hvor mye som var ubetalt, og hvor lenge, etter forfall: [{ from, to, principal }].
 * Renten løper fra forfall til betalingsdagen. Betalinger i ProTop teller med dato.
 * Fra PowerOffice vet vi bare saldo: betalt helt (paidAt) eller delvis (saldoendringen).
 */
export function overdueBalances(invoice, { today = '' } = {}) {
  const due = parseDate(invoice?.dueDate);
  const end = todayIso(today);
  if (!due || due >= end) return [];
  const credited = Math.abs(parseMoney(invoice?.creditedAmount) || 0);
  let payments = (Array.isArray(invoice?.payments) ? invoice.payments : [])
    .map((row) => ({ date: parseDate(row?.date), amount: parseMoney(row?.amount) || 0 }))
    .filter((row) => row.date && row.amount);
  const total = invoiceTotal(invoice);
  if (!payments.length) {
    const po = invoice?.poweroffice || {};
    const balance = parseMoney(invoice?.outstandingAmount ?? po.balance);
    if (invoice?.status === 'paid' && parseDate(invoice?.paidAt)) {
      payments = [{ date: parseDate(invoice.paidAt), amount: total - credited }];
    } else if (balance != null && balance < total - credited) {
      const when = parseDate(po.balanceChangedAt) || end;
      payments = [{ date: when, amount: total - credited - balance }];
    }
  }
  payments.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let principal = round2(total - credited);
  let cursor = due;
  const out = [];
  for (const row of payments) {
    if (row.date <= cursor) {
      principal = round2(principal - row.amount);
      continue;
    }
    const to = row.date < end ? row.date : end;
    if (principal > 0 && daysBetween(cursor, to) > 0) out.push({ from: cursor, to, principal });
    cursor = to;
    principal = round2(principal - row.amount);
    if (cursor >= end) break;
  }
  if (principal > 0 && cursor < end) out.push({ from: cursor, to: end, principal });
  return out;
}

/**
 * Forsinkelsesrente for periodene, delt der satsen endres. Dager / 365.
 * Gir { amount, days, parts: [{ from, to, days, rate, principal, amount }], missingRate }.
 */
export function lateInterest(segments = []) {
  const parts = [];
  let missingRate = false;
  for (const seg of segments) {
    let from = seg.from;
    while (from < seg.to) {
      const rate = lateInterestRate(addDays(from, 1));
      const next = LATE_INTEREST_RATES.find((row) => row.from > addDays(from, 1));
      const stop = next && addDays(next.from, -1) < seg.to ? addDays(next.from, -1) : seg.to;
      const days = daysBetween(from, stop);
      if (days <= 0) break;
      if (!rate) missingRate = true;
      const pct = rate ? rate.rate : (LATE_INTEREST_RATES[0]?.rate || 0);
      parts.push({ from, to: stop, days, rate: pct, principal: seg.principal, amount: round2(seg.principal * (pct / 100) * (days / 365)) });
      from = stop;
    }
  }
  return {
    amount: round2(parts.reduce((sum, row) => sum + row.amount, 0)),
    days: parts.reduce((sum, row) => sum + row.days, 0),
    parts,
    missingRate,
  };
}

/** Steg i innkrevingen. Eldre fakturaer har bare avkrysninger. De vises som steg uten detaljer. */
export function collectionSteps(invoice) {
  const c = invoice?.collection && typeof invoice.collection === 'object' ? invoice.collection : {};
  const steps = Array.isArray(c.steps) ? c.steps.filter((row) => row && COLLECTION_KINDS[row.kind]) : [];
  const legacy = [
    ['reminderSent', 'reminder'],
    ['noticeSent', 'notice'],
    ['debtCollection', 'debt'],
    ['interestInvoice', 'interest'],
  ];
  for (const [flag, kind] of legacy) {
    if (c[flag] === true && !steps.some((row) => row.kind === kind)) {
      steps.push({ id: `legacy_${kind}`, kind, at: text(c[`${flag}At`]), legacy: true });
    }
  }
  return steps.sort((a, b) => (text(a.at) < text(b.at) ? -1 : 1));
}

export function outstandingOf(invoice) {
  const value = parseMoney(invoice?.outstandingAmount ?? invoice?.outstanding);
  if (value != null) return round2(value);
  return round2(invoiceTotal(invoice) - paidAmountOf(invoice) - Math.abs(parseMoney(invoice?.creditedAmount) || 0));
}

function whole(value, fallback, min = 0, max = 365) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/**
 * Innstillingene for innkrevingen (Fakturainnstillinger → Purring og inkasso), med lovens
 * minstekrav lagt på. Dager regnes fra forfall (påminnelse og purring) eller fra dagen etter
 * fristen i forrige brev (inkassovarsel og inkasso).
 */
export function collectionSettings(settings = {}) {
  const fee = Math.min(REMINDER_FEE_MAX, Math.max(0, Math.round(Number(settings?.reminderFee) || 0)));
  const friendlyDays = whole(settings?.friendlyReminderDays, 3, 0, 60);
  return {
    friendly: friendlyDays > 0,
    friendlyDays,
    // Med gebyr tidligst 14 dager etter forfall (inkassoforskriften § 1-2).
    reminderDays: Math.max(fee > 0 ? 14 : 1, whole(settings?.reminderDays, 14, 1, 120)),
    reminderFee: fee,
    noticeDays: whole(settings?.noticeDaysAfterDeadline, 1, 1, 60),
    debtDays: whole(settings?.debtDaysAfterDeadline, 1, 1, 60),
    deadlineDays: Math.max(NOTICE_DAYS, whole(settings?.collectionDeadlineDays, NOTICE_DAYS, NOTICE_DAYS, 60)),
    auto: {
      friendly: settings?.collectionAutoFriendly === true,
      reminder: settings?.collectionAutoReminder === true,
      notice: settings?.collectionAutoNotice === true,
      debt: settings?.collectionAutoDebt === true,
    },
    agencyEmail: text(settings?.collectionAgencyEmail),
  };
}

/** Rekkefølgen loven og praksis gir. Påminnelsen er valgfri. Se kommentaren øverst. */
export const COLLECTION_ORDER = ['friendly', 'reminder', 'notice', 'debt'];

/**
 * Hele løpet for én faktura: hvert steg med status, og neste steg som kan tas.
 * state: done (sendt), next (neste), waiting (neste, men ikke ennå), locked (forrige steg mangler),
 * skipped (hoppet over), off (slått av). availableFrom: første dag steget kan sendes.
 */
export function collectionStatus(invoice, { today = '', settings = {} } = {}) {
  const now = todayIso(today);
  const cs = collectionSettings(settings);
  const due = parseDate(invoice?.dueDate);
  const steps = collectionSteps(invoice);
  const outstanding = outstandingOf(invoice);
  const paid = invoice?.status === 'paid' || outstanding <= 0;
  const closed = isDraftInvoice(invoice) || isCreditNote(invoice) || ['credited', 'written_off'].includes(invoice?.status);
  const daysOverdue = due ? Math.max(0, daysBetween(due, now)) : 0;
  const hold = invoice?.collection?.hold === true;
  const open = !closed && !paid && daysOverdue > 0;
  const of = (kind) => steps.filter((row) => row.kind === kind);
  const last = (kind) => { const list = of(kind); return list[list.length - 1] || null; };
  const feeSteps = steps.filter((row) => (row.kind === 'reminder' || row.kind === 'notice') && Number(row.fee) > 0);
  const fees = round2(feeSteps.reduce((sum, row) => sum + Number(row.fee), 0));
  const unbilledFees = round2(feeSteps.filter((row) => !row.feeInvoiceId).reduce((sum, row) => sum + Number(row.fee), 0));
  const interest = lateInterest(overdueBalances(invoice, { today: now }));

  const friendly = last('friendly');
  const reminder = last('reminder');
  const notice = last('notice');
  const debt = last('debt');
  // Eldre avkrysninger har ingen frist. Da kan neste steg tas med en gang.
  const after = (step) => (step?.deadline ? addDays(step.deadline, 1) : (step?.legacy ? now : ''));
  // Første lovlige dag ved manuell sending, og dagen etter innstillingene ved automatisk.
  const plan = [
    {
      kind: 'friendly',
      done: friendly,
      earliest: due ? addDays(due, 1) : '',
      auto: due ? addDays(due, cs.friendlyDays) : '',
      skipped: !friendly && !!(reminder || notice || debt),
      off: !cs.friendly && !friendly,
    },
    {
      kind: 'reminder',
      done: reminder,
      earliest: due ? addDays(due, cs.reminderFee > 0 ? 14 : 1) : '',
      auto: due ? addDays(due, cs.reminderDays) : '',
      skipped: !reminder && !!(notice || debt),
    },
    {
      kind: 'notice',
      done: notice,
      // Gebyr for andre varsel bare når fristen i purringen er oversittet (inkassoforskriften § 1-3).
      locked: !reminder,
      earliest: after(reminder),
      auto: reminder?.deadline ? addDays(reminder.deadline, cs.noticeDays) : '',
      skipped: !notice && !!debt,
    },
    {
      kind: 'debt',
      done: debt,
      // Inkasso først når fristen i inkassovarselet er ute (inkassoloven § 9).
      locked: !notice,
      earliest: after(notice),
      auto: notice?.deadline ? addDays(notice.deadline, cs.debtDays) : '',
    },
  ];
  let next = null;
  for (const row of plan) {
    if (row.done) row.state = 'done';
    else if (row.skipped) row.state = 'skipped';
    else if (row.off) row.state = 'off';
    else if (row.locked || next) row.state = 'locked';
    else {
      row.availableFrom = row.earliest || now;
      row.ready = open && !hold && !!row.earliest && row.earliest <= now;
      row.autoReady = row.ready && cs.auto[row.kind] && !!row.auto && row.auto <= now;
      row.state = row.ready ? 'next' : 'waiting';
      next = row;
    }
  }
  if (!open) next = null;
  const feeAllowedFor = (kind) => {
    if (cs.reminderFee <= 0 || feeSteps.length >= FEE_NOTICES_MAX || daysOverdue < 14) return false;
    // Andre gebyr bare når fristen i første varsel er oversittet.
    if (kind === 'notice' || feeSteps.length === 1) return !!reminder?.deadline && reminder.deadline < now;
    return kind === 'reminder';
  };
  const nextKind = next?.kind || '';
  const feeAllowed = feeAllowedFor(nextKind);
  let debtHint = '';
  if (!notice) debtHint = 'Saken kan sendes til inkasso når inkassovarselet er sendt og fristen i det er ute.';
  else if (notice.deadline && notice.deadline >= now) debtHint = `Fristen i inkassovarselet går ut ${formatDate(notice.deadline)}. Saken kan sendes til inkasso fra ${formatDate(addDays(notice.deadline, 1))}.`;
  return {
    today: now,
    due,
    daysOverdue,
    outstanding,
    paid,
    open,
    hold,
    settings: cs,
    steps,
    plan,
    next,
    reminders: of('reminder'),
    notices: of('notice'),
    debt: of('debt'),
    interestInvoices: of('interest'),
    fees,
    unbilledFees,
    feeAllowed,
    suggestedFee: feeAllowed ? cs.reminderFee : 0,
    feeNote: cs.reminderFee <= 0
      ? 'Purregebyr er ikke slått på i Fakturainnstillinger.'
      : (!feeAllowed
        ? (daysOverdue < 14
          ? `Purregebyr kan kreves fra ${formatDate(addDays(due, 14))} (14 dager etter forfall).`
          : (feeSteps.length >= FEE_NOTICES_MAX ? 'Gebyr er krevd for to varsler. Flere gebyr er ikke lov for dette kravet.' : 'Gebyr kan ikke kreves for dette brevet.'))
        : `Høyst ${REMINDER_FEE_MAX} kr.`),
    defaultDeadline: addDays(now, Math.max(NOTICE_DAYS, cs.deadlineDays)),
    minDeadline: addDays(now, NOTICE_DAYS),
    debtHint,
    interest,
    // Rente også når fakturaen ble betalt for sent, og gebyr som ikke er fakturert.
    canInterest: !closed && (interest.amount > 0 || unbilledFees > 0),
  };
}

/** Frist på minst 14 dager fra i dag. */
export function checkDeadline(deadline, today = '') {
  const day = parseDate(deadline);
  const min = addDays(todayIso(today), NOTICE_DAYS);
  if (!day) return { ok: false, error: 'Velg en betalingsfrist.' };
  if (day < min) return { ok: false, error: `Fristen må være minst 14 dager fram, tidligst ${formatDate(min)}.` };
  return { ok: true, deadline: day };
}

function stepText(step) {
  const fee = Number(step.fee) > 0 ? ` med gebyr ${formatMoney(step.fee)}` : '';
  const deadline = step.deadline ? `, frist ${formatDate(step.deadline)}` : '';
  const to = step.to ? ` til ${step.to}` : (step.channel === 'manual' ? ' (lastet ned og sendt selv)' : '');
  if (step.kind === 'friendly') return `sendte betalingspåminnelse${to}`;
  if (step.kind === 'reminder') return `sendte purring${fee}${deadline}${to}`;
  if (step.kind === 'notice') return `sendte inkassovarsel${fee}${deadline}${to}`;
  if (step.kind === 'debt') return `sendte saken til inkasso${to}`;
  return `laget rentefaktura${step.amount ? ` på ${formatMoney(step.amount)}` : ''}${step.invoiceId ? ' (utkast)' : ''}`;
}

export const COLLECTION_FLAGS_FOR = { friendly: 'friendlySent', reminder: 'reminderSent', notice: 'noticeSent', debt: 'debtCollection', interest: 'interestInvoice' };

/**
 * Kan steget tas nå? Bare neste steg i rekkefølgen, når fristen i forrige er ute.
 * Rentefaktura står utenfor rekkefølgen.
 */
export function canTakeStep(invoice, kind, { today = '', settings = {} } = {}) {
  const st = collectionStatus(invoice, { today, settings });
  if (kind === 'interest') return st.canInterest ? { ok: true, status: st } : { ok: false, error: 'Det er ingen rente eller gebyr å fakturere.', status: st };
  if (!st.open) return { ok: false, error: st.paid ? 'Fakturaen er betalt.' : 'Fakturaen er ikke forfalt.', status: st };
  if (st.hold) return { ok: false, error: 'Oppfølgingen av fakturaen er satt på vent.', status: st };
  const row = st.plan.find((item) => item.kind === kind);
  if (!row || row.state === 'done') return { ok: false, error: `${COLLECTION_KINDS[kind]?.label || 'Steget'} er allerede sendt.`, status: st };
  if (st.next?.kind !== kind) {
    const wanted = st.next ? COLLECTION_KINDS[st.next.kind].label.toLowerCase() : 'forrige steg';
    return { ok: false, error: `Send ${wanted} først.`, status: st };
  }
  if (!row.ready) return { ok: false, error: `Kan sendes fra ${formatDate(row.availableFrom)}.`, status: st };
  return { ok: true, status: st };
}

/** Sett oppfølgingen på vent (for eksempel ved innsigelse), eller fortsett. */
export function setCollectionHold(invoice, hold, { actor = null, at = '' } = {}) {
  const stamp = text(at) || new Date().toISOString();
  const collection = { ...(invoice?.collection || {}), hold: !!hold, holdAt: hold ? stamp : '' };
  const row = withEvent({ ...invoice, collection, updatedAt: stamp }, {
    type: 'collection',
    text: hold ? 'satte purring og inkasso på vent' : 'fortsatte purring og inkasso',
    actor,
    at: stamp,
  });
  return normalizeInvoice(row);
}

/** Legg til et steg på fakturaen, med hendelse i endringsloggen. */
export function addCollectionStep(invoice, input = {}, { actor = null, at = '' } = {}) {
  const kind = input.kind;
  if (!COLLECTION_KINDS[kind]) return { ok: false, error: 'Ukjent steg.', invoice };
  const stamp = text(at) || new Date().toISOString();
  const step = {
    id: `col_${stamp.replace(/\D/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    at: stamp,
    fee: Math.max(0, Math.min(REMINDER_FEE_MAX, Math.round(Number(input.fee) || 0))),
    deadline: parseDate(input.deadline) || '',
    to: text(input.to).slice(0, 200),
    channel: input.channel === 'manual' ? 'manual' : (input.to ? 'email' : ''),
    amount: input.amount != null ? round2(input.amount) : null,
    invoiceId: text(input.invoiceId),
    note: text(input.note).slice(0, 500),
    auto: input.auto === true,
    byUid: text(actor?.byUid),
    byName: text(actor?.byName),
  };
  const current = invoice?.collection && typeof invoice.collection === 'object' ? invoice.collection : {};
  let steps = [...(Array.isArray(current.steps) ? current.steps : []), step];
  // Gebyrene som tas med på en rentefaktura, merkes, så de ikke faktureres to ganger.
  if (kind === 'interest' && Array.isArray(input.feeStepIds) && input.feeStepIds.length) {
    const ids = new Set(input.feeStepIds);
    steps = steps.map((row) => (ids.has(row.id) ? { ...row, feeInvoiceId: step.invoiceId || step.id } : row));
  }
  const flag = COLLECTION_FLAGS_FOR[kind];
  const collection = { ...current, steps, [flag]: true, [`${flag}At`]: stamp };
  const row = withEvent({ ...invoice, collection, updatedAt: stamp }, {
    type: 'collection',
    text: step.auto ? `ProTop ${stepText(step)} automatisk` : stepText(step),
    actor: step.auto ? null : actor,
    at: stamp,
  });
  return { ok: true, error: null, invoice: normalizeInvoice(row), step };
}

/**
 * Innholdet i purring, inkassovarsel og kravsoppstilling (til PDF og e-post).
 * Gir { title, paragraphs, facts: [[label, value, strong]] }.
 */
export function collectionLetter(invoice, kind, { fee = 0, deadline = '', today = '', supplier = {}, status = null } = {}) {
  const st = status || collectionStatus(invoice, { today });
  const no = text(invoice?.invoiceNumber);
  const due = formatDate(invoice?.dueDate);
  const outstanding = st.outstanding;
  const toPay = round2(outstanding + (Number(fee) || 0));
  const account = text(invoice?.bankAccount || supplier?.bankAccount);
  const feeLine = Number(fee) > 0 ? `Purregebyr på ${formatMoney(fee)} er lagt til (inkassoforskriften § 1-2).` : '';
  const paidNote = 'Har dere betalt de siste dagene, kan dere se bort fra dette brevet.';
  const facts = [
    ['Fakturanummer', no],
    ['Fakturadato', formatDate(invoice?.invoiceDate)],
    ['Forfall', due],
    ['KID', text(invoice?.kid)],
    ['Kontonummer', account],
    ['Utestående', formatMoney(outstanding)],
    Number(fee) > 0 ? ['Purregebyr', formatMoney(fee)] : null,
    ['Å betale', formatMoney(toPay), true],
    deadline ? ['Betal innen', formatDate(deadline), true] : null,
  ].filter((row) => row && text(row[1]) && row[1] !== '—');
  if (kind === 'friendly') {
    return {
      title: COLLECTION_KINDS.friendly.title,
      paragraphs: [
        `Vi minner vennlig om faktura ${no}, som forfalt ${due}.`,
        `Vi ser ikke at den er betalt ennå. Betal gjerne ${formatMoney(outstanding)} så snart som mulig, og bruk KID ved betaling.`,
        'Har dere spørsmål om fakturaen, er det bare å svare på denne e-posten.',
        paidNote,
      ],
      facts: facts.filter((row) => !['Purregebyr', 'Betal innen'].includes(row[0])),
    };
  }
  if (kind === 'reminder') {
    return {
      title: COLLECTION_KINDS.reminder.title,
      paragraphs: [
        `Vi kan ikke se å ha mottatt betaling for faktura ${no} med forfall ${due}.`,
        `Vi ber om at ${formatMoney(toPay)} betales innen ${formatDate(deadline)}. Bruk KID ved betaling.`,
        feeLine,
        paidNote,
      ].filter(Boolean),
      facts,
    };
  }
  if (kind === 'notice') {
    return {
      title: COLLECTION_KINDS.notice.title,
      paragraphs: [
        `Faktura ${no} med forfall ${due} er fortsatt ikke betalt.`,
        `Dersom ${formatMoney(toPay)} ikke er betalt innen ${formatDate(deadline)}, blir kravet sendt til inkasso uten flere varsler. Det vil gi dere økte kostnader.`,
        'Har dere innsigelser mot kravet, må de sendes oss skriftlig innen fristen.',
        feeLine,
        paidNote,
      ].filter(Boolean),
      facts,
    };
  }
  // Kravsoppstilling til inkassobyrået.
  const customer = invoice?.customerAddress && typeof invoice.customerAddress === 'object' ? invoice.customerAddress : {};
  const history = st.steps
    .filter((row) => row.kind === 'reminder' || row.kind === 'notice')
    .map((row) => [
      COLLECTION_KINDS[row.kind].label,
      [formatDate(String(row.at).slice(0, 10)), row.deadline ? `frist ${formatDate(row.deadline)}` : '', Number(row.fee) > 0 ? `gebyr ${formatMoney(row.fee)}` : '']
        .filter(Boolean).join(', '),
    ]);
  return {
    title: COLLECTION_KINDS.debt.title,
    recipient: false,
    paragraphs: [
      `Vi overlater kravet nedenfor til inkasso. Skyldner er varslet med inkassovarsel, og fristen er ute.`,
      'Faktura og eventuelle vedlegg følger med.',
    ],
    facts: [
      ['Kreditor', [text(supplier?.name), supplier?.orgnr ? `org.nr. ${supplier.orgnr}` : ''].filter(Boolean).join(', ')],
      ['Skyldner', [text(invoice?.customerName), invoice?.orgnr ? `org.nr. ${invoice.orgnr}` : ''].filter(Boolean).join(', ')],
      ['Adresse', [customer.street, [customer.postalCode, customer.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')],
      ['E-post', text(invoice?.customerEmail)],
      ['Fakturanummer', no],
      ['Fakturadato', formatDate(invoice?.invoiceDate)],
      ['Forfall', due],
      ['KID', text(invoice?.kid)],
      ['Fakturabeløp', formatMoney(invoiceTotal(invoice))],
      ['Innbetalt', formatMoney(round2(invoiceTotal(invoice) - outstanding))],
      ['Utestående hovedstol', formatMoney(outstanding), true],
      st.fees ? ['Purregebyr', formatMoney(st.fees)] : null,
      st.interest.amount ? ['Forsinkelsesrente', `${formatMoney(st.interest.amount)} (til ${formatDate(st.today)})`] : null,
      ...history,
    ].filter((row) => row && text(row[1])),
  };
}

const CUSTOMER_FIELDS = [
  'customerId', 'customerNumber', 'customerName', 'orgnr', 'customerAddress', 'customerEmail', 'customerVatNumber',
  'customerContact', 'customerReference', 'ourReference', 'projectId', 'projectNumber', 'projectName', 'department',
  'language', 'currency', 'deliveryMethod', 'addressLineAbove', 'addressLineBelow',
];

function rateLabel(rate) {
  return `${String(rate).replace('.', ',')} %`;
}

/**
 * Utkast til rentefaktura: forsinkelsesrente (per satsperiode) og gebyr som ikke er fakturert.
 * Renter og gebyr er utenfor mva-området (vatCode OUTSIDE).
 */
export function buildInterestInvoice(invoice, { today = '', includeFees = true, actor = null, at = '', creditDays = 14 } = {}) {
  const st = collectionStatus(invoice, { today });
  const no = text(invoice?.invoiceNumber);
  const lines = st.interest.parts.map((part, index) => ({
    id: `int_${index + 1}`,
    section: 'other',
    description: `Forsinkelsesrente faktura ${no}: ${formatDate(part.from)}–${formatDate(part.to)}, ${part.days} dager à ${rateLabel(part.rate)} av ${formatMoney(part.principal)}`,
    quantity: 1,
    unit: 'stk',
    unitPrice: part.amount,
    vatCode: 'OUTSIDE',
  })).filter((row) => row.unitPrice > 0);
  const feeSteps = includeFees
    ? st.steps.filter((row) => (row.kind === 'reminder' || row.kind === 'notice') && Number(row.fee) > 0 && !row.feeInvoiceId)
    : [];
  feeSteps.forEach((row, index) => {
    lines.push({
      id: `fee_${index + 1}`,
      section: 'other',
      description: `${row.kind === 'notice' ? 'Gebyr for inkassovarsel' : 'Purregebyr'} ${formatDate(String(row.at).slice(0, 10))}, faktura ${no}`,
      quantity: 1,
      unit: 'stk',
      unitPrice: Number(row.fee),
      vatCode: 'OUTSIDE',
    });
  });
  if (!lines.length) return { ok: false, error: 'Det er ingen rente eller gebyr å fakturere.', invoice: null };
  const stamp = text(at) || new Date().toISOString();
  const base = Object.fromEntries(CUSTOMER_FIELDS.filter((key) => invoice?.[key] != null).map((key) => [key, invoice[key]]));
  const draft = emptyInvoice({
    ...base,
    id: newInvoiceId(''),
    status: 'draft',
    exportStatus: 'utkast',
    invoiceDate: stamp.slice(0, 10),
    creditDays,
    lines,
    invoiceText: `Forsinkelsesrente og gebyr for faktura ${no} (forfall ${formatDate(invoice?.dueDate)}). `
      + 'Forsinkelsesrente etter forsinkelsesrenteloven. Renter og gebyr er utenfor mva-området.',
    source: { filename: 'rentefaktura', importedAt: stamp, values: { origin: 'interestInvoice', originalInvoiceId: text(invoice?.id), originalInvoiceNumber: no } },
    createdAt: stamp,
    updatedAt: stamp,
  });
  const withLog = withEvent(recalcInvoice(draft), {
    type: 'create',
    text: `opprettet rentefaktura for faktura ${no}`,
    actor,
    at: stamp,
  });
  return {
    ok: true,
    error: null,
    invoice: normalizeInvoice(withLog),
    interest: st.interest,
    feeStepIds: feeSteps.map((row) => row.id),
    amount: round2(lines.reduce((sum, row) => sum + row.unitPrice, 0)),
  };
}
