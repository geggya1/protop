/**
 * Effekter fra ISO (oppgaver i Oppgaver og varsler), utenfor hooken useIsoStore.
 * Brukes av ISO-sidene og av hurtigmeldingen, som lagrer uten å laste hele ISO-tilstanden.
 */
import { addDays, todayKey } from '../../src/iso/core';
import { notifyUsers } from '../../src/utils/notifications';
import { completeIsoTask, ensureTask } from '../../src/iso/storage';

/** Oppgaver og varsler fra skjermede saker får ingen detaljer i Oppgaver (som alle i selskapet kan se). */
export function safeEffects(effects, entity) {
  if (!entity?.restricted) return effects;
  const title = `Skjermet sak ${entity.number || ''}: åpne ISO → Avvik`.replace('  ', ' ');
  return (effects || []).map((e) => {
    if (e.type === 'push') return { ...e, body: title };
    return e.type === 'createTask' || e.type === 'requestApproval' || e.type === 'notify'
      ? { ...e, title, description: 'Detaljer vises bare i ISO for dem som har tilgang til saken.' }
      : e;
  });
}

/** Saksnummeret byttes i tekster når telleren ga et annet nummer enn det klienten regnet ut. */
export function renumberEffects(effects, from, to) {
  if (!from || !to || from === to) return effects;
  const swap = (s) => (typeof s === 'string' ? s.split(from).join(to) : s);
  return (effects || []).map((e) => ({ ...e, title: swap(e.title), description: swap(e.description), body: swap(e.body) }));
}

/** Varsel i ProTop (og push på mobil) via den vanlige varselsmekanismen. Feil stopper ikke lagringen. */
export function pushIso(companyId, actorUid, uids, title, body) {
  return notifyUsers(uids, {
    eventType: 'taskReceived', title, body, familyId: companyId, createdBy: actorUid || null,
  }).catch(() => null);
}

/**
 * Utfører effektene. Returnerer antall oppgaver som finnes etterpå (nye og eksisterende).
 * roleMap = rollene i ISO-innstillingene (oppgaver til en rolle går til personen i rollen).
 */
export async function runIsoEffects(companyId, effects, { actor = null, roleMap = {} } = {}) {
  let created = 0;
  for (const e of effects || []) {
    if (e.type === 'completeTask') {
      await completeIsoTask(companyId, e.key);
      continue;
    }
    if (e.type === 'push') {
      await pushIso(companyId, actor?.uid, e.uids || [], e.title || 'ISO / K-HMS', e.body || '');
      continue;
    }
    if (!['createTask', 'requestApproval', 'notify'].includes(e.type)) continue;
    const mapped = roleMap[e.roleKey] || Object.values(roleMap || {}).find((r) => r?.label && r.label === e.roleLabel) || null;
    const to = e.assigneeUid || mapped?.uid || '';
    const id = await ensureTask(companyId, {
      key: e.key,
      title: e.type === 'requestApproval' ? `Godkjenn: ${e.title}` : e.title,
      description: [e.description, e.roleLabel ? `Ansvarlig rolle: ${e.roleLabel}` : '', 'Opprettet fra ISO / K-HMS.'].filter(Boolean).join('\n'),
      assigneeUid: to,
      deadline: e.deadline || (e.dueDays != null ? addDays(todayKey(), e.dueDays) : null),
      createdByUid: actor?.uid || '',
      source: 'iso',
    });
    if (id) created += 1;
    if (id && e.push && to) await pushIso(companyId, actor?.uid, [to], 'Ny oppgave fra ISO', e.title);
  }
  return created;
}
