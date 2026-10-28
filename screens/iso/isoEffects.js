/**
 * Effekter fra ISO (oppgaver i Oppgaver og varsler), utenfor hooken useIsoStore.
 * Brukes av ISO-sidene, av hurtigmeldingen og av automatikken som kjøres når skallet åpnes.
 */
import { addDays, todayKey } from '../../src/iso/core';
import { assignmentNotices, taskRecipient } from '../../src/iso/integrations';
import { notifyUsers } from '../../src/utils/notifications';
import { completeIsoTask, ensureTaskResult } from '../../src/iso/storage';

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
 * system = isoSystem/main: oppgaver til en rolle går til personen i rollen, ellers til ISO-ansvarlig.
 * Nye oppgaver gir «oppgave tildelt»-varsel til mottakeren (samlet når det blir mange).
 */
export async function runIsoEffects(companyId, effects, { actor = null, system = null, roleMap = null } = {}) {
  const sys = system || { roleMap: roleMap || {} };
  let created = 0;
  const fresh = [];
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
    const to = taskRecipient(e, sys);
    const title = e.type === 'requestApproval' ? `Godkjenn: ${e.title}` : e.title;
    const res = await ensureTaskResult(companyId, {
      key: e.key,
      title,
      description: [
        e.description,
        e.roleLabel ? `Ansvarlig rolle: ${e.roleLabel}` : '',
        to.via === 'ansvarlig' ? 'Sendt til ISO-ansvarlig fordi ingen person med innlogging står i rollen.' : '',
        to.via === 'ingen' ? 'Ingen mottaker: sett roller i ISO → Innstillinger.' : '',
        'Opprettet fra ISO / K-HMS.',
      ].filter(Boolean).join('\n'),
      assigneeUid: to.uid,
      deadline: e.deadline || (e.dueDays != null ? addDays(todayKey(), e.dueDays) : null),
      createdByUid: actor?.uid || '',
      source: 'iso',
    });
    if (res.id) created += 1;
    if (res.created && to.uid) fresh.push({ uid: to.uid, title, urgent: !!e.push });
  }
  // Hastesaker varsles hver for seg; resten samles per mottaker.
  for (const f of fresh.filter((x) => x.urgent)) await pushIso(companyId, actor?.uid, [f.uid], 'Ny oppgave fra ISO', f.title);
  for (const n of assignmentNotices(fresh.filter((x) => !x.urgent))) await pushIso(companyId, actor?.uid, [n.uid], n.title, n.body);
  return created;
}
