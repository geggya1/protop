/**
 * Advarsel når førte timer går over arbeidstidsgrensene: til den som fører timene (alerts i
 * svaret, vises i timelisten) og som varsel til øverste leder og administrator.
 * Kjøres etter at timene er lagret. Sperrer ingenting og feiler stille: kortet på timesaldoen
 * viser de samme overskridelsene uansett.
 *
 * Leser den ansattes timer 52 uker tilbake, så 52-ukersgrensen blir riktig. Hver overskridelse
 * har fast varsel-id per ansatt, regel og vindu, så samme brudd varsles bare én gang.
 */
import { checkWorkingTime } from './workingTimeRules.js';
import { workingTimeAlertRecipients, workingTimeAlerts, workingTimeOptions } from './workingTimePolicy.js';

const DAY_MS = 86400000;

function shiftDay(key, days) {
  const at = Date.parse(`${key}T00:00:00Z`);
  return Number.isFinite(at) ? new Date(at + days * DAY_MS).toISOString().slice(0, 10) : '';
}

/**
 * companyId, family (med company), employees (bedriftens ansatte), employeeId og -navn,
 * dates som ble ført, entries som er lagret nå (slås sammen med det som lastes),
 * actorUid (får ikke varsel selv: kortet viser det allerede).
 */
export async function notifyWorkingTimeBreaches({
  companyId, family, employees = [], employeeId, employeeName = '', dates = [], entries = [], actorUid = '',
} = {}) {
  try {
    const touched = [...new Set((dates || []).filter(Boolean))].sort();
    if (!companyId || !employeeId || !touched.length) return { sent: 0, alerts: [] };
    const first = touched[0];
    const last = touched[touched.length - 1];
    const { loadTimeEntries } = await import('../economy/timeEntryStorage.js');
    const loaded = await loadTimeEntries(companyId, {
      employeeId,
      fromDate: shiftDay(first, -364),
      toDate: shiftDay(last, 27),
      cache: false,
    });
    const byId = new Map();
    for (const row of [...(loaded || []), ...(entries || [])]) {
      if (row?.id && String(row.employeeId || '') === String(employeeId)) byId.set(row.id, row);
    }
    const result = checkWorkingTime([...byId.values()], {
      employeeId,
      ...workingTimeOptions(family?.company),
    });
    const alerts = workingTimeAlerts(result, { employeeId, employeeName, dates: touched });
    if (!alerts.length) return { sent: 0, alerts };
    const recipients = workingTimeAlertRecipients({ family, employees, exclude: [actorUid] });
    if (!recipients.length) return { sent: 0, alerts };
    const { notifyUsers } = await import('../utils/notifications.js');
    await Promise.all(alerts.map((alert) => notifyUsers(recipients, {
      eventType: 'workingTimeBreach',
      title: alert.title,
      body: alert.body,
      familyId: companyId,
      createdBy: actorUid || null,
      notificationId: alert.id,
      dateKey: alert.date,
    })));
    return { sent: alerts.length, alerts };
  } catch {
    return { sent: 0, alerts: [] };
  }
}
