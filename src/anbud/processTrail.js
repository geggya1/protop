/** Stegene fra forespørsel til tilbudsarbeid, felles for varsling og direkte henvendelser. */

import { inquiryOpenForBid, intakeChannelLabel } from './intake.js';

function step(id, label, detail, at, done) {
  return { id, label, detail: detail || '', at: at || '', done: !!done };
}

function assigneeDetail(bid, started) {
  if (!started) return 'Ikke startet';
  const name = [bid?.assignment?.unitName, bid?.assignment?.personName].filter(Boolean).join(' · ');
  return name || 'Startet';
}

export function processStepsForNotice(notice, bid = null) {
  const decided = notice?.decision === 'aktuell' || notice?.decision === 'tilbud' || !!bid;
  return [
    step('opphav', 'Anbudsvarsling', notice?.source === 'ted' ? 'TED' : 'Doffin', notice?.publishedAt, true),
    step('aktuell', 'Aktuell', decided ? 'Merket aktuell' : 'Venter', notice?.interestAt, decided),
    step('arbeid', 'Tilbudsarbeid', assigneeDetail(bid, !!bid), bid?.createdAt, !!bid),
  ];
}

export function processStepsForInquiry(inquiry, bid = null) {
  const protop = inquiry?.source === 'protop' || inquiry?.queueKind === 'protop';
  const channel = intakeChannelLabel(inquiry?.channel);
  const started = inquiry?.status === 'tilbud' || !!bid;
  const originDetail = channel || inquiry?.fromName || (protop ? 'Direkte' : 'Registrert selv');
  return [
    step(
      'opphav',
      protop ? 'Mottatt i ProTop' : 'Manuelt registrert',
      originDetail,
      inquiry?.createdAt || inquiry?.originAt,
      true,
    ),
    step('aktuell', 'Aktuell', 'Tatt inn', inquiry?.interestAt || inquiry?.createdAt, inquiry?.status !== 'ikke'),
    step(
      'arbeid',
      'Tilbudsarbeid',
      assigneeDetail(bid, started),
      bid?.createdAt || (started ? inquiry?.decidedAt : ''),
      started,
    ),
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
