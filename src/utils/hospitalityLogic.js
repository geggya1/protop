/**
 * Pure hospitality / short-term rental helpers.
 * Used by client utils + mirrored in cloud functions.
 *
 * Competitor map (research):
 * - Hospitable: best at AI messaging + smart-lock automation for small hosts
 * - Hostaway: best integration marketplace / mid-size portfolios
 * - Guesty: enterprise depth
 * - Lodgify: direct-booking websites
 * - OwnerRez / Beds24: power-user control / budget channel manager
 *
 * What works without partner certification:
 * - iCal import from Airbnb + Booking.com (calendar only — NOT messaging)
 * - Nuki Web API keypad codes (API token)
 * - Manual reservations + status machine
 * - Email automessages for manual/direct bookings
 *
 * What requires Sign in (Partner / Connectivity API):
 * - Automessages delivered INTO Airbnb / Booking.com guest inbox
 * - Guest contact data beyond iCal SUMMARY
 * - Two-way reservation push / reviews API
 */

export const CHANNELS = {
  airbnb: 'airbnb',
  booking: 'booking',
  manual: 'manual',
  ical: 'ical',
  direct: 'direct',
};

export const RESERVATION_STATUS = {
  inquiry: 'inquiry',
  confirmed: 'confirmed',
  checked_in: 'checked_in',
  checked_out: 'checked_out',
  cancelled: 'cancelled',
  no_show: 'no_show',
};

export const MESSAGE_TRIGGERS = {
  booking_confirmed: 'booking_confirmed',
  hours_before_checkin: 'hours_before_checkin',
  hours_after_checkin: 'hours_after_checkin',
  hours_before_checkout: 'hours_before_checkout',
  hours_after_checkout: 'hours_after_checkout',
  on_cancellation: 'on_cancellation',
  review_request: 'review_request',
};

export const DEFAULT_MESSAGE_TEMPLATES = [
  {
    id: 'confirm',
    name: 'Bookingbekreftelse',
    trigger: MESSAGE_TRIGGERS.booking_confirmed,
    offsetHours: 0,
    enabled: true,
    subject: 'Velkommen, {{guestName}}!',
    body:
      'Hei {{guestName}}!\n\nBookingen din hos {{propertyName}} er bekreftet.\nInnsjekk: {{checkIn}}\nUtsjekk: {{checkOut}}\n\nVi gleder oss til å ta imot deg!',
  },
  {
    id: 'checkin_3h',
    name: 'Innsjekkinstruks (3 t før)',
    trigger: MESSAGE_TRIGGERS.hours_before_checkin,
    offsetHours: 3,
    enabled: true,
    subject: 'Innsjekk snart – {{propertyName}}',
    body:
      'Hei {{guestName}}!\n\nInnsjekk er om ca. 3 timer.\n\n{{checkInInstructions}}\n\nLåsekode: {{lockCode}}\nKoden er gyldig fra {{lockValidFrom}} til {{lockValidUntil}}.\n\nAdresse: {{address}}',
  },
  {
    id: 'checkin_5h',
    name: 'Påminnelse (5 t før)',
    trigger: MESSAGE_TRIGGERS.hours_before_checkin,
    offsetHours: 5,
    enabled: true,
    subject: 'Snart innsjekk',
    body:
      'Hei {{guestName}}!\n\nBare en påminnelse: innsjekk i dag kl. {{checkInTime}}.\nWiFi: {{wifiName}} / {{wifiPassword}}\n\nSi ifra om du trenger noe!',
  },
  {
    id: 'checkout',
    name: 'Utsjekk (3 t før)',
    trigger: MESSAGE_TRIGGERS.hours_before_checkout,
    offsetHours: 3,
    enabled: true,
    subject: 'Utsjekk i dag',
    body:
      'Hei {{guestName}}!\n\n{{checkOutInstructions}}\n\nTakk for oppholdet – vi håper du kommer tilbake!',
  },
  {
    id: 'review',
    name: 'Anmodning om vurdering',
    trigger: MESSAGE_TRIGGERS.review_request,
    offsetHours: 24,
    enabled: true,
    subject: 'Hvordan var oppholdet?',
    body:
      'Hei {{guestName}}!\n\nTakk for at du bodde hos oss på {{propertyName}}. Vi setter stor pris på en vurdering når du har tid.',
  },
];

/** Nuki keypad: 6 digits, digits 1–9 only, must not start with 12. */
export function isValidNukiPin(code) {
  const s = String(code ?? '');
  if (!/^[1-9]{6}$/.test(s)) return false;
  if (s.startsWith('12')) return false;
  return true;
}

export function generateNukiPin(existing = []) {
  const used = new Set((existing || []).map((c) => String(c)));
  for (let i = 0; i < 500; i += 1) {
    let code = '';
    for (let d = 0; d < 6; d += 1) {
      code += String(1 + Math.floor(Math.random() * 9));
    }
    if (isValidNukiPin(code) && !used.has(code)) return code;
  }
  throw new Error('Kunne ikke generere unik Nuki-PIN');
}

export function lockValidityWindow(checkIn, checkOut, {
  earlyHours = 0,
  lateHours = 0,
} = {}) {
  const from = new Date(checkIn);
  const until = new Date(checkOut);
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) {
    throw new Error('Ugyldig innsjekk/utsjekk');
  }
  if (until <= from) throw new Error('Utsjekk må være etter innsjekk');
  const allowedFrom = new Date(from.getTime() - earlyHours * 3600_000);
  const allowedUntil = new Date(until.getTime() + lateHours * 3600_000);
  return {
    allowedFromDate: allowedFrom.toISOString(),
    allowedUntilDate: allowedUntil.toISOString(),
  };
}

export function nukiAuthName(guestName, reservationId) {
  const base = String(guestName || 'Guest').replace(/[^\wÆØÅæøå -]/gi, '').trim() || 'Guest';
  const shortId = String(reservationId || '').slice(-4);
  const combined = `${base} ${shortId}`.trim().slice(0, 20);
  return combined || 'Guest';
}

const TEMPLATE_KEYS = [
  'guestName', 'propertyName', 'checkIn', 'checkOut', 'checkInTime', 'checkOutTime',
  'lockCode', 'lockValidFrom', 'lockValidUntil', 'address', 'wifiName', 'wifiPassword',
  'checkInInstructions', 'checkOutInstructions', 'channel', 'guestEmail', 'guestPhone',
];

export function renderTemplate(text, vars = {}) {
  const src = String(text ?? '');
  return src.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    if (!TEMPLATE_KEYS.includes(key) && !(key in vars)) return '';
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

export function buildMessageVars(reservation = {}, property = {}, lock = {}) {
  const checkIn = toDate(reservation.checkIn);
  const checkOut = toDate(reservation.checkOut);
  const fmt = (d) => (d ? formatNbDateTime(d) : '');
  const fmtTime = (d) => (d ? formatNbTime(d) : '');
  return {
    guestName: reservation.guestName || 'gjest',
    guestEmail: reservation.guestEmail || '',
    guestPhone: reservation.guestPhone || '',
    propertyName: property.name || reservation.propertyName || 'boligen',
    address: property.address || '',
    wifiName: property.wifiName || '',
    wifiPassword: property.wifiPassword || '',
    checkInInstructions: property.checkInInstructions || '',
    checkOutInstructions: property.checkOutInstructions || '',
    checkIn: fmt(checkIn),
    checkOut: fmt(checkOut),
    checkInTime: fmtTime(checkIn) || property.checkInTime || '15:00',
    checkOutTime: fmtTime(checkOut) || property.checkOutTime || '11:00',
    lockCode: lock.code || reservation.lockCode || '',
    lockValidFrom: lock.allowedFromDate ? formatNbDateTime(toDate(lock.allowedFromDate)) : '',
    lockValidUntil: lock.allowedUntilDate ? formatNbDateTime(toDate(lock.allowedUntilDate)) : '',
    channel: reservation.channel || '',
  };
}

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') {
    try { return value.toDate(); } catch { return null; }
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatNbDateTime(d) {
  try {
    return new Intl.DateTimeFormat('nb-NO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function formatNbTime(d) {
  try {
    return new Intl.DateTimeFormat('nb-NO', { hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/**
 * Compute when an automessage should fire relative to stay.
 * offsetHours is always positive; direction comes from trigger.
 */
export function computeMessageSendAt(template, reservation, now = new Date()) {
  const checkIn = toDate(reservation?.checkIn);
  const checkOut = toDate(reservation?.checkOut);
  const confirmedAt = toDate(reservation?.confirmedAt) || toDate(reservation?.createdAt) || now;
  const cancelledAt = toDate(reservation?.cancelledAt) || now;
  const offsetMs = Math.max(0, Number(template?.offsetHours) || 0) * 3600_000;
  const trigger = template?.trigger;

  if (trigger === MESSAGE_TRIGGERS.booking_confirmed) {
    return new Date(confirmedAt.getTime() + offsetMs);
  }
  if (trigger === MESSAGE_TRIGGERS.on_cancellation) {
    return new Date(cancelledAt.getTime() + offsetMs);
  }
  if (trigger === MESSAGE_TRIGGERS.hours_before_checkin) {
    if (!checkIn) return null;
    return new Date(checkIn.getTime() - offsetMs);
  }
  if (trigger === MESSAGE_TRIGGERS.hours_after_checkin) {
    if (!checkIn) return null;
    return new Date(checkIn.getTime() + offsetMs);
  }
  if (trigger === MESSAGE_TRIGGERS.hours_before_checkout) {
    if (!checkOut) return null;
    return new Date(checkOut.getTime() - offsetMs);
  }
  if (trigger === MESSAGE_TRIGGERS.hours_after_checkout || trigger === MESSAGE_TRIGGERS.review_request) {
    if (!checkOut) return null;
    return new Date(checkOut.getTime() + offsetMs);
  }
  return null;
}

export function shouldSendMessage(template, reservation, {
  now = new Date(),
  alreadySentKeys = [],
} = {}) {
  if (!template?.enabled) return false;
  if (!reservation || reservation.status === RESERVATION_STATUS.cancelled) {
    if (template.trigger !== MESSAGE_TRIGGERS.on_cancellation) return false;
  }
  if (template.trigger === MESSAGE_TRIGGERS.on_cancellation
    && reservation.status !== RESERVATION_STATUS.cancelled) {
    return false;
  }
  const key = messageDedupeKey(template, reservation);
  if ((alreadySentKeys || []).includes(key)) return false;
  const sendAt = computeMessageSendAt(template, reservation, now);
  if (!sendAt) return false;
  // Send window: due and not older than 36h (avoid flooding after downtime)
  const ageMs = now.getTime() - sendAt.getTime();
  if (ageMs < 0) return false;
  if (ageMs > 36 * 3600_000) return false;
  return true;
}

export function messageDedupeKey(template, reservation) {
  return `${reservation.id || reservation.externalId || 'r'}::${template.id || template.trigger}::${template.offsetHours ?? 0}`;
}

export function nextReservationStatus(current, action) {
  const cur = current || RESERVATION_STATUS.inquiry;
  const map = {
    confirm: {
      [RESERVATION_STATUS.inquiry]: RESERVATION_STATUS.confirmed,
      [RESERVATION_STATUS.cancelled]: RESERVATION_STATUS.confirmed,
    },
    check_in: {
      [RESERVATION_STATUS.confirmed]: RESERVATION_STATUS.checked_in,
    },
    check_out: {
      [RESERVATION_STATUS.checked_in]: RESERVATION_STATUS.checked_out,
      [RESERVATION_STATUS.confirmed]: RESERVATION_STATUS.checked_out,
    },
    cancel: {
      [RESERVATION_STATUS.inquiry]: RESERVATION_STATUS.cancelled,
      [RESERVATION_STATUS.confirmed]: RESERVATION_STATUS.cancelled,
      [RESERVATION_STATUS.checked_in]: RESERVATION_STATUS.cancelled,
    },
    no_show: {
      [RESERVATION_STATUS.confirmed]: RESERVATION_STATUS.no_show,
    },
  };
  const next = map[action]?.[cur];
  if (!next) return null;
  return next;
}

export function detectChannelFromIcalUrl(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('airbnb.')) return CHANNELS.airbnb;
  if (u.includes('booking.') || u.includes('ical.booking')) return CHANNELS.booking;
  return CHANNELS.ical;
}

/**
 * Minimal iCal parser for VEVENT blocks (Airbnb / Booking.com feeds).
 */
export function parseIcalEvents(icsText) {
  const text = String(icsText || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const events = [];
  const blocks = text.split('BEGIN:VEVENT').slice(1);
  for (const raw of blocks) {
    const block = raw.split('END:VEVENT')[0] || '';
    const get = (key) => {
      const re = new RegExp(`^${key}[^:]*:(.*)$`, 'mi');
      const m = block.match(re);
      return m ? m[1].trim() : '';
    };
    const uid = get('UID');
    const summary = unescapeIcal(get('SUMMARY'));
    const description = unescapeIcal(get('DESCRIPTION'));
    const statusRaw = (get('STATUS') || '').toUpperCase();
    const dtStart = parseIcalDate(get('DTSTART'));
    const dtEnd = parseIcalDate(get('DTEND'));
    if (!dtStart || !dtEnd) continue;
    let status = RESERVATION_STATUS.confirmed;
    if (statusRaw === 'CANCELLED') status = RESERVATION_STATUS.cancelled;
    events.push({
      externalId: uid || `${dtStart.toISOString()}_${dtEnd.toISOString()}_${summary}`,
      guestName: extractGuestName(summary, description),
      summary,
      description,
      checkIn: dtStart.toISOString(),
      checkOut: dtEnd.toISOString(),
      status,
      channelHint: null,
    });
  }
  return events;
}

function unescapeIcal(s) {
  return String(s || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseIcalDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  // DATE: 20260826
  if (/^\d{8}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6)) - 1;
    const d = Number(s.slice(6, 8));
    return new Date(Date.UTC(y, m, d));
  }
  // DATETIME: 20260826T150000Z or 20260826T150000
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (m) {
    const [, Y, Mo, D, h, mi, se, z] = m;
    if (z) return new Date(Date.UTC(+Y, +Mo - 1, +D, +h, +mi, +se));
    return new Date(+Y, +Mo - 1, +D, +h, +mi, +se);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractGuestName(summary, description) {
  const s = String(summary || '');
  // Airbnb often: "Reserved" or "Name (Phone)" / "Closed" for blocks
  if (/^(reserved|blocked|not available|closed)/i.test(s.trim())) {
    const fromDesc = String(description || '').match(/(?:guest|gjest|name)[:\s]+(.+)/i);
    if (fromDesc) return fromDesc[1].trim().slice(0, 80);
    return s.trim();
  }
  const cleaned = s.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return cleaned.slice(0, 80) || 'Gjest';
}

/**
 * Merge iCal events into existing reservations: create / update / cancel missing.
 */
export function mergeIcalReservations(existing = [], events = [], {
  channel,
  propertyId,
  sourceId,
  now = new Date(),
} = {}) {
  const byExternal = new Map();
  for (const r of existing) {
    if (r.externalId && r.sourceId === sourceId) byExternal.set(r.externalId, r);
  }
  const upserts = [];
  const seen = new Set();
  for (const ev of events) {
    seen.add(ev.externalId);
    const prev = byExternal.get(ev.externalId);
    const base = {
      externalId: ev.externalId,
      sourceId: sourceId || null,
      propertyId,
      channel: channel || CHANNELS.ical,
      guestName: ev.guestName,
      summary: ev.summary,
      description: ev.description || '',
      checkIn: ev.checkIn,
      checkOut: ev.checkOut,
      status: ev.status,
      syncAt: now.toISOString(),
    };
    if (!prev) {
      upserts.push({ action: 'create', data: base });
    } else {
      const changed =
        prev.checkIn !== ev.checkIn
        || prev.checkOut !== ev.checkOut
        || (prev.status !== RESERVATION_STATUS.cancelled && ev.status === RESERVATION_STATUS.cancelled)
        || prev.guestName !== ev.guestName;
      if (changed) {
        let status = prev.status;
        if (ev.status === RESERVATION_STATUS.cancelled) status = RESERVATION_STATUS.cancelled;
        else if (prev.status === RESERVATION_STATUS.cancelled) status = RESERVATION_STATUS.confirmed;
        upserts.push({
          action: 'update',
          id: prev.id,
          data: { ...base, status },
        });
      }
    }
  }
  // Events that disappeared from feed → mark cancelled (if previously confirmed-ish)
  for (const [extId, prev] of byExternal) {
    if (seen.has(extId)) continue;
    if ([RESERVATION_STATUS.confirmed, RESERVATION_STATUS.inquiry, RESERVATION_STATUS.checked_in].includes(prev.status)) {
      upserts.push({
        action: 'update',
        id: prev.id,
        data: {
          status: RESERVATION_STATUS.cancelled,
          cancelledAt: now.toISOString(),
          syncAt: now.toISOString(),
          cancelReason: 'removed_from_ical',
        },
      });
    }
  }
  return upserts;
}

export function reviewScoreLabel(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'Ukjent';
  if (n >= 4.8) return 'Utmerket';
  if (n >= 4.5) return 'Meget bra';
  if (n >= 4.0) return 'Bra';
  if (n >= 3.0) return 'Middels';
  return 'Svakt';
}

export function connectionHealth(connections = []) {
  const list = Array.isArray(connections) ? connections : [];
  const required = ['airbnb', 'booking', 'nuki'];
  const byType = Object.fromEntries(list.map((c) => [c.type, c]));
  return required.map((type) => {
    const c = byType[type];
    if (type === 'nuki') {
      const connected = !!(c && (c.connected || c.apiTokenSet));
      return { type, connected, label: 'Nuki', lastSyncAt: c?.lastSyncAt || null, error: c?.lastError || null };
    }
    const messagingReady = !!(c && (c.messagingReady || c.oauthConnected));
    const calendarOnly = !!(c && !messagingReady && (c.icalUrl || c.calendarOnly || c.connected));
    return {
      type,
      connected: messagingReady,
      messagingReady,
      calendarOnly,
      label: type === 'airbnb' ? 'Airbnb' : 'Booking.com',
      lastSyncAt: c?.lastSyncAt || null,
      error: c?.lastError || null,
      oauthConnected: messagingReady,
    };
  });
}

export function statusLabelNb(status) {
  const map = {
    [RESERVATION_STATUS.inquiry]: 'Forespørsel',
    [RESERVATION_STATUS.confirmed]: 'Bekreftet',
    [RESERVATION_STATUS.checked_in]: 'Innsjekket',
    [RESERVATION_STATUS.checked_out]: 'Utsjekket',
    [RESERVATION_STATUS.cancelled]: 'Kansellert',
    [RESERVATION_STATUS.no_show]: 'No-show',
  };
  return map[status] || status || 'Ukjent';
}
