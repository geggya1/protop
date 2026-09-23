/**
 * Bursdagsforberedelser — når det er ≤20 dager til bursdag
 * får voksne forslag (gave, ønskeliste, feiring, gjøremål).
 */

import { toIsoDate } from './age.js';
import { memberBirthdayItems } from './rememberDatesLogic.js';

export const BIRTHDAY_PREP_DAYS = 20;
export const BIRTHDAY_PREP_EVENT = 'birthdayReminder';
export const BIRTHDAY_PREP_SHOWN_KEY = 'weekplan.birthdayPrep.v1';

export function firstNameFrom(name) {
  const raw = String(name || '').trim();
  if (!raw) return 'familiemedlemmet';
  return raw.split(/\s+/)[0];
}

export function birthdayPrepYear(nextDate, now = new Date()) {
  if (nextDate instanceof Date && !Number.isNaN(nextDate.getTime())) {
    return nextDate.getFullYear();
  }
  return now.getFullYear();
}

export function birthdayPrepDismissKey(uid, memberId, year) {
  return `${BIRTHDAY_PREP_SHOWN_KEY}.${uid}.${memberId}.${year}`;
}

export function birthdayPrepNotificationId(familyId, memberId, year) {
  return `birthday_prep_${familyId}_${memberId}_${year}`;
}

/** Bursdager innen forberedelsesvinduet (0–20 dager), sortert nærmest først. */
export function findDueBirthdayPrep({
  members = [],
  now = new Date(),
  maxDays = BIRTHDAY_PREP_DAYS,
  childrenOnly = false,
} = {}) {
  const items = memberBirthdayItems(members, now)
    .filter((item) => {
      if (item.daysUntil == null || item.daysUntil < 0 || item.daysUntil > maxDays) return false;
      if (childrenOnly && item.role && item.role !== 'child') return false;
      return true;
    })
    .sort((a, b) => (a.daysUntil - b.daysUntil)
      || String(a.memberName || '').localeCompare(String(b.memberName || ''), 'nb'));
  return items;
}

/**
 * Oppgaveforslag for dashboard-popup og varselmeny.
 * Gave/ønskeliste prioriteres for barn; feiring og gjøremål gjelder alle.
 */
export function buildBirthdayPrepSuggestions(item) {
  const name = firstNameFrom(item?.memberName || item?.title);
  const isChild = item?.role === 'child';
  const days = item?.daysUntil;
  const dayHint = days === 0
    ? 'I dag'
    : days === 1
      ? 'I morgen'
      : `${days} dager igjen`;

  const suggestions = [
    {
      id: 'gift',
      icon: 'gift-outline',
      title: `Kjøp bursdagsgave til ${name}`,
      body: isChild
        ? `Legg inn et gjøremål for å handle gave før bursdagen (${dayHint}).`
        : `Husk gave til ${name} (${dayHint}).`,
      action: 'createGiftTask',
      taskTitle: `Kjøp bursdagsgave til ${name}`,
    },
    {
      id: 'wishlist',
      icon: 'list-outline',
      title: isChild ? `Opprett eller velg ønskeliste til ${name}` : `Ønskeliste til ${name}s bursdag`,
      body: 'Åpne ønskelister — opprett ny eller velg eksisterende til bursdagen.',
      action: 'openWishlist',
    },
    {
      id: 'party',
      icon: 'sparkles-outline',
      title: `Planlegg bursdagsfeiring for ${name}`,
      body: 'Legg feiringen i kalenderen og fordel forberedelser.',
      action: 'createPartyEvent',
      eventTitle: `${name}s bursdagsfeiring`,
    },
    {
      id: 'todos',
      icon: 'checkbox-outline',
      title: 'Opprett gjøremål for forberedelser',
      body: `Gave, kake, invitasjoner og mer — klare forslag for ${name}.`,
      action: 'createPrepTasks',
    },
  ];

  if (isChild) {
    suggestions.push({
      id: 'cake',
      icon: 'cafe-outline',
      title: `Bestill eller bake kake til ${name}`,
      body: 'Eget gjøremål så kaken ikke blir glemt.',
      action: 'createCakeTask',
      taskTitle: `Bestill/bake kake til ${name}`,
    });
  }

  return suggestions;
}

export function buildBirthdayPrepNotificationPayload({ familyId, item, now = new Date() } = {}) {
  if (!familyId || !item?.memberId) return null;
  const name = firstNameFrom(item.memberName);
  const year = birthdayPrepYear(item.nextDate, now);
  const days = item.daysUntil;
  const when = days === 0
    ? 'i dag'
    : days === 1
      ? 'i morgen'
      : `om ${days} dager`;
  return {
    eventType: BIRTHDAY_PREP_EVENT,
    title: `${name}s bursdag ${when}`,
    body: `Vil du opprette gjøremål, handle gave, velge ønskeliste eller planlegge feiring for ${name}?`,
    familyId,
    childId: item.role === 'child' ? item.memberId : null,
    memberId: item.memberId,
    dateKey: item.nextDate ? toIsoDate(item.nextDate) : (item.dateKey || null),
    notificationId: birthdayPrepNotificationId(familyId, item.memberId, year),
  };
}

export function adultUidsFromMembers(members = []) {
  return [...new Set(
    (members || [])
      .filter((m) => m && m.role === 'parent' && (m.uid || m.id))
      .map((m) => m.uid || m.id),
  )];
}

/** Prefill-titler når «Opprett alle» lagres som parentTodos. */
export function prepTaskTitlesForMember(item) {
  const name = firstNameFrom(item?.memberName);
  const titles = [
    `Kjøp bursdagsgave til ${name}`,
    `Planlegg bursdagsfeiring for ${name}`,
    `Inviter gjester til ${name}s bursdag`,
  ];
  if (item?.role === 'child') {
    titles.push(`Bestill/bake kake til ${name}`);
  }
  return titles;
}
