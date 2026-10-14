/**
 * Teller om et arbeidsområde har ansatte, timer eller anbud.
 * Feil ved lesing er ukjent, ikke tomt, så et selskap med data ikke skjules.
 */
import { collection, doc, getDoc, getDocs, limit, query } from 'firebase/firestore';
import { companyWorkspaces } from './platformSwitch.js';

function noticeCount(snap) {
  if (!snap?.exists?.()) return 0;
  const notices = snap.data()?.notices;
  return Array.isArray(notices) ? notices.length : 0;
}

export async function probeWorkspaceOccupancy(db, families = []) {
  const companies = companyWorkspaces(families);
  const pairs = await Promise.all(companies.map(async (group) => {
    const subUnits = Array.isArray(group?.company?.subUnits) ? group.company.subUnits.length : 0;
    try {
      const [employeesSnap, hoursSnap, anbudSnap] = await Promise.all([
        getDocs(query(collection(db, 'families', group.id, 'employees'), limit(1))),
        getDocs(query(collection(db, 'families', group.id, 'timeEntries'), limit(1))),
        getDoc(doc(db, 'families', group.id, 'anbud', 'state')),
      ]);
      return [group.id, {
        unknown: false,
        employees: employeesSnap.size,
        hours: hoursSnap.size,
        notices: noticeCount(anbudSnap),
        subUnits,
      }];
    } catch {
      return [group.id, { unknown: true }];
    }
  }));
  return Object.fromEntries(pairs);
}
