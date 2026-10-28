/**
 * Usynlig komponent for bedriftsskallet (ISO-02 og ISO-03):
 *  - sender hurtigmeldinger (Meld RUH) som ligger i køen fra da nettet var borte, for alle brukere;
 *  - kjører ISO-automatikken (årshjul med innhenting, påminnelser, eskalering, kvalitetsplaner)
 *    én gang per dag når en med ISO-rettigheter (Begrenset redigering eller mer) åpner skallet.
 * Planlagte Cloud Functions deployes ikke av CI, så dette er motoren. Legg <IsoAutomation /> én gang
 * i skallet for bedriften. Den tegner ingenting.
 */
import { useEffect, useMemo } from 'react';
import { useApp } from '../../src/context/AppContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { isSuperAdmin } from '../../src/utils/groups';
import { isoCapabilities } from '../../src/iso/access';
import { isSetUp } from '../../src/iso/state';
import { appendAudit, ensureAccessMirror, loadIsoState, saveEntity } from '../../src/iso/storage';
import { loadProjectState } from '../../src/project/storage';
import { loadAnbudState } from '../../src/anbud/storage';
import { markRanToday, ranToday, runIsoAutomation } from './isoAutoRun';
import { runIsoEffects } from './isoEffects';
import { useQuickQueue } from './QuickReport';
import { peopleFromEmployees } from './useIsoSources';

export default function IsoAutomation() {
  const { familyId, uid, family, activeProfile } = useApp();
  const access = useCompanyAccess();
  // Meldinger lagret uten nett sendes når appen åpnes, uansett ISO-rettigheter.
  useQuickQueue(familyId, uid);
  const owner = isSuperAdmin(family, uid);
  const manage = useMemo(() => isoCapabilities({
    grants: access.active && access.ready ? access.grants : null,
    bypass: owner && !access.previewing,
    uid,
  }).manage, [access.active, access.ready, access.grants, access.previewing, owner, uid]);

  useEffect(() => {
    if (!familyId || !uid || !manage || access.previewing) return undefined;
    let live = true;
    const actor = { uid, name: String(activeProfile?.name || activeProfile?.displayName || '').trim() || 'ISO-automatikk' };
    (async () => {
      if (await ranToday(familyId, uid)) return;
      const mirror = await ensureAccessMirror(familyId, uid, { family, employees: access.employees });
      if (!live || !mirror.fresh || mirror.iso < 2) return;
      const res = await loadIsoState(familyId, { uid });
      if (!live || res.source !== 'remote' || !isSetUp(res.state)) return;
      await markRanToday(familyId, uid);
      const [project, anbud] = await Promise.all([
        loadProjectState(familyId).catch(() => null),
        loadAnbudState(familyId).catch(() => null),
      ]);
      if (!live) return;
      await runIsoAutomation({
        companyId: familyId,
        actor,
        state: res.state,
        people: peopleFromEmployees(access.employees || []),
        projects: (project?.projects || []).filter((p) => p.status !== 'arkivert'),
        contracts: (anbud?.contracts || []).filter((c) => !c.deletedAt),
        equipment: project?.equipment || [],
        saveRecord: async (result, effects) => {
          try {
            await saveEntity(familyId, 'records', result.record, { createOnly: true });
            await appendAudit(familyId, result.events || []);
            await runIsoEffects(familyId, effects, { actor, system: res.state.system });
            return { ok: true };
          } catch {
            return { ok: false };
          }
        },
      }).catch(() => null);
    })();
    return () => { live = false; };
  }, [familyId, uid, manage, access.previewing]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
