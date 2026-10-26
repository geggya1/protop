import { useMemo } from 'react';
import { useApp } from '../../src/context/AppContext';
import { companyLogoOf } from '../../src/project/companyLogo';
import { tokenContext } from '../../src/forms/tokens';

/** Selskap, innlogget bruker og logo til maler, utfylling og PDF. */
export function useFormContext() {
  const { family, familyId, uid, activeProfile } = useApp();
  const actor = useMemo(() => ({
    uid: uid || '',
    name: String(activeProfile?.name || activeProfile?.displayName || '').trim(),
  }), [uid, activeProfile?.name, activeProfile?.displayName]);
  const company = useMemo(
    () => tokenContext(family?.company, { userName: actor.name, fallbackName: family?.name }),
    [family?.company, family?.name, actor.name],
  );
  const logo = companyLogoOf(family?.company);
  return { family, familyId, actor, company, logo };
}
