/**
 * «Forlat bedriften»: personen går selv. Serveren tar personen ut av bedriften
 * (functions/companyMembership.js leaveCompany). Etterpå skjules bedriften i bryteren,
 * og appen bytter til en annen bedrift eller arbeidsområde.
 */
import { useCallback, useState } from 'react';
import { useApp } from '../context/AppContext';
import { isOrganizationType } from '../utils/groupTypes';
import { confirmUser, notifyUser } from '../utils/dialog';
import { isCompanyOwnerUid } from './membership.js';
import { leaveCompany } from './membershipClient.js';

export function useLeaveCompany() {
  const {
    uid, familyId, family, families, selectFamily, applyFamilyPatch,
  } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const companyName = family?.company?.navn || family?.name || 'bedriften';
  const canLeave = !!uid && !!familyId && isOrganizationType(family?.type) && !isCompanyOwnerUid(family, uid);

  const leave = useCallback(async () => {
    if (!canLeave || busy) return false;
    const sure = await confirmUser(
      `Forlate «${companyName}»?`,
      'Du mister tilgangen til bedriften med en gang. Ansettelsen din settes til avsluttet, og administrator får beskjed. For å komme tilbake må du inviteres på nytt.',
      { ok: 'Forlat bedriften' },
    );
    if (!sure) return false;
    setBusy(true);
    setError('');
    try {
      await leaveCompany(familyId);
      const next = (families || []).find((row) => (
        row?.id && row.id !== familyId && row.deleted !== true && row.hiddenFromApp !== true
      ));
      applyFamilyPatch?.(familyId, { hiddenFromApp: true });
      await selectFamily?.(next?.id || null);
      notifyUser('Du har forlatt bedriften', `Du er ikke lenger med i «${companyName}».`);
      return true;
    } catch (err) {
      setError(err?.message || 'Kunne ikke forlate bedriften.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [canLeave, busy, companyName, familyId, families, applyFamilyPatch, selectFamily]);

  return { canLeave, leave, busy, error, companyName };
}
