/** Hele tilbudsprosessen, fra inngang til konkurransens utfall.
 *  1.1 Anbudsvarsling og 1.2 Anbudsforespørsel er to innganger. Løpet viser den saken kom fra.
 */

import { inquiryOpenForBid, intakeChannelLabel } from './intake.js';

const WORK_CLOSED = new Set(['levert', 'kontrakt', 'tapt', 'trukket']);

function step(id, label, detail, at, done) {
  return { id, label, detail: detail || '', at: at || '', done: !!done };
}

function assigneeName(bid) {
  return [bid?.assignment?.unitName, bid?.assignment?.personName].filter(Boolean).join(' · ');
}

function workClosed(bid) {
  return WORK_CLOSED.has(bid?.stage || '');
}

function workDetail(bid, started) {
  if (!started) return 'Ikke startet';
  const name = assigneeName(bid);
  const phase = workClosed(bid) ? 'Avsluttet' : 'Pågår';
  return name ? `${phase} · ${name}` : phase;
}

function delivered(bid) {
  if (!bid) return false;
  if (bid.submittedAt) return true;
  const stage = bid.stage || '';
  return stage === 'levert' || stage === 'kontrakt';
}

function outcomeDetail(bid) {
  const stage = bid?.stage || '';
  if (stage === 'kontrakt') return 'Vunnet';
  if (stage === 'tapt') return 'Tapt';
  if (stage === 'trukket') return 'Trukket';
  if (delivered(bid)) return 'Venter på avgjørelse';
  return '';
}

function outcomeDone(bid) {
  const stage = bid?.stage || '';
  return stage === 'kontrakt' || stage === 'tapt' || stage === 'trukket';
}

/** Stegene etter vurderingen. Like for kunngjøring og direkte forespørsel. */
function laterSteps(bid, started, workAt) {
  const sent = delivered(bid);
  const decided = outcomeDone(bid);
  return [
    step('arbeid', 'Tilbudsarbeid', workDetail(bid, started), started ? workAt : '', started),
    step('levert', 'Tilbud levert', sent ? 'Levert' : '', sent ? (bid?.submittedAt || '') : '', sent),
    step('status', 'Status konkurranse', outcomeDetail(bid), decided ? (bid?.closedAt || '') : '', decided),
  ];
}

function noticeReview(notice, bid) {
  if (bid || notice?.decision === 'tilbud') {
    return { detail: 'Gi tilbud', at: notice?.reviewedAt || bid?.createdAt || notice?.interestAt || '', done: true };
  }
  if (notice?.decision === 'forkastet' || notice?.decision === 'ikke') {
    return { detail: 'Ikke gi tilbud', at: notice?.reviewedAt || notice?.interestAt || '', done: true };
  }
  if (notice?.decision === 'aktuell') {
    return { detail: 'Under vurdering', at: notice?.interestAt || '', done: true };
  }
  return { detail: '', at: '', done: false };
}

export function processStepsForNotice(notice, bid = null) {
  const review = noticeReview(notice, bid);
  const started = !!bid;
  return [
    step('opphav', 'Anbudsvarsling', notice?.source === 'ted' ? 'TED' : 'Doffin', notice?.publishedAt, true),
    step('vurdering', 'Vurdering', review.detail, review.at, review.done),
    ...laterSteps(bid, started, bid?.createdAt || ''),
  ];
}

function inquiryReview(inquiry, bid) {
  if (bid || inquiry?.status === 'tilbud') {
    return {
      detail: 'Gi tilbud',
      at: inquiry?.decidedAt || bid?.createdAt || inquiry?.interestAt || inquiry?.createdAt || '',
      done: true,
    };
  }
  if (inquiry?.status === 'ikke') {
    return { detail: 'Ikke gi tilbud', at: inquiry?.decidedAt || inquiry?.interestAt || '', done: true };
  }
  if (inquiry) {
    return { detail: 'Under vurdering', at: inquiry?.interestAt || inquiry?.createdAt || '', done: true };
  }
  return { detail: '', at: '', done: false };
}

export function processStepsForInquiry(inquiry, bid = null) {
  const protop = inquiry?.source === 'protop' || inquiry?.queueKind === 'protop';
  const channel = intakeChannelLabel(inquiry?.channel);
  const started = inquiry?.status === 'tilbud' || !!bid;
  const originDetail = channel || inquiry?.fromName || (protop ? 'Direkte' : 'Registrert selv');
  const review = inquiryReview(inquiry, bid);
  return [
    step(
      'opphav',
      'Anbudsforespørsel',
      originDetail,
      inquiry?.createdAt || inquiry?.originAt,
      true,
    ),
    step('vurdering', 'Vurdering', review.detail, review.at, review.done),
    ...laterSteps(bid, started, bid?.createdAt || (started ? inquiry?.decidedAt : '') || ''),
  ];
}

export function processStepsForBid(bid, notice = null) {
  const manual = bid?.source === 'manuell' || bid?.source === 'protop' || (bid?.inquiryId && !bid?.noticeId);
  if (!manual) {
    return processStepsForNotice(notice || {
      source: bid?.source === 'ted' ? 'ted' : 'doffin',
      publishedAt: bid?.originAt,
      interestAt: bid?.interestAt,
      decision: 'tilbud',
    }, bid);
  }
  return processStepsForInquiry({
    source: bid?.source === 'protop' ? 'protop' : 'manuell',
    channel: bid?.channel,
    createdAt: bid?.originAt || bid?.createdAt,
    interestAt: bid?.interestAt || bid?.originAt || bid?.createdAt,
    status: 'tilbud',
    fromName: bid?.buyer,
  }, bid);
}

/** Avtalebehandling: kunde → mal → utkast → motpart → signert. */
export function processStepsForAgreement(row = null, draft = null) {
  const kind = row?.kind || draft?.kind || 'oppdrag';
  const kindLabel = kind === 'rammeavtale' ? 'Rammeavtale' : (kind === 'avrop' ? 'Avrop' : 'Enkeltoppdrag');
  const customerName = row?.counterparty?.name || draft?.customerName || '';
  const customerDone = !!(row || draft?.customerId);
  const templateTitle = row?.templateTitle || draft?.templateTitle || '';
  const templateDone = !!(row || draft?.templateId);
  const locked = !!row;
  const lockedAt = row?.createdAt || row?.versions?.[0]?.lockedAt || '';
  const withParty = !!row && row.status !== 'utkast';
  const remarks = row?.status === 'merknader';
  const signed = row?.status === 'signert';
  const partyAt = row?.versions?.find((item) => item.sentAt)?.sentAt
    || row?.events?.find((event) => event.action === 'sendt')?.at
    || '';
  const signedAt = row?.signatures?.at(-1)?.at || row?.events?.find((event) => event.action === 'signert')?.at || '';
  return [
    step(
      'kunde',
      'Kunde og type',
      customerDone ? [kindLabel, customerName].filter(Boolean).join(' · ') : '',
      customerDone ? (row?.createdAt || '') : '',
      customerDone,
    ),
    step(
      'mal',
      'Avtalemal',
      templateDone ? (templateTitle || 'Valgt') : '',
      templateDone && locked ? lockedAt : '',
      templateDone,
    ),
    step(
      'utkast',
      'Utkast låst',
      locked ? `Versjon ${row.version || 1}` : '',
      locked ? lockedAt : '',
      locked,
    ),
    step(
      'motpart',
      remarks ? 'Merknader i retur' : 'Hos motpart',
      withParty ? (remarks ? 'Tilbake hos avsender' : (signed ? 'Behandlet' : 'Til behandling')) : '',
      withParty ? partyAt : '',
      withParty,
    ),
    step(
      'signert',
      'Signert',
      signed ? 'Forseglet' : '',
      signed ? signedAt : '',
      signed,
    ),
  ];
}

export function noticesAwaitingBid(notices) {
  return (Array.isArray(notices) ? notices : [])
    .filter((row) => row?.id && row.decision === 'aktuell')
    .slice()
    .sort((a, b) => String(b.interestAt || b.reviewedAt || '').localeCompare(String(a.interestAt || a.reviewedAt || '')));
}

export function directQueueItems({ inquiries = [], inbox = [] } = {}) {
  const manual = (Array.isArray(inquiries) ? inquiries : [])
    .filter(inquiryOpenForBid)
    .map((row) => ({ ...row, queueKind: 'manuell' }));
  const received = (Array.isArray(inbox) ? inbox : [])
    .filter(inquiryOpenForBid)
    .map((row) => ({ ...row, queueKind: 'protop', source: 'protop' }));
  return [...manual, ...received].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export function assignmentGap({ departments = [], people = [], unitId = '', personId = '' } = {}) {
  const missing = [];
  if (departments.length > 0 && !unitId) missing.push('avdeling');
  if (people.length > 0 && !personId) missing.push('person');
  return missing;
}

export function assignmentHint(missing) {
  if (!missing?.length) return 'Gi tilbud flytter saken til 3. Tilbud.';
  if (missing.length === 2) return 'Velg avdeling og person før tilbudsarbeidet starter.';
  if (missing[0] === 'avdeling') return 'Velg avdeling før tilbudsarbeidet starter.';
  return 'Velg person før tilbudsarbeidet starter.';
}

export function assignmentFromChoice({ unit, person } = {}) {
  return {
    personId: person?.uid || person?.id || '',
    personName: person?.name || '',
    unitId: unit?.id || '',
    unitName: unit?.name || '',
    unitKind: unit?.kind || (unit ? 'avdeling' : ''),
  };
}
