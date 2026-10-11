import { useEffect, useRef } from 'react';
import { useApp } from '../src/context/AppContext';
import { claimEmployeeSeat } from '../src/employees/inviteClient';
import { recordUsage } from '../src/employees/usageClient';

function currentPath() {
  if (typeof window === 'undefined') return '';
  return window.location?.pathname || '';
}

/**
 * Skriver innlogging, aktivitet og sideskifte. En sendt bedriftsinvitasjon
 * knyttes til medarbeideren når personen er inne i bedriften.
 */
export default function UsageRecorder({ companyId = '', tab = '', subView = '' }) {
  const { uid } = useApp();
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    if (!uid) return undefined;
    if (companyId) {
      const seatKey = `protop.employeeSeat.${uid}.${companyId}`;
      let seen = false;
      try { seen = sessionStorage.getItem(seatKey) === '1'; } catch { seen = false; }
      if (!seen) {
        claimEmployeeSeat(companyId).then((result) => {
          if (result?.ok) {
            try { sessionStorage.setItem(seatKey, '1'); } catch { /* privatmodus */ }
          }
        }).catch(() => {});
      }
    }
    const loginKey = 'protop.usage.login';
    let seen = false;
    try { seen = sessionStorage.getItem(loginKey) === uid; } catch { seen = false; }
    if (!seen) {
      try { sessionStorage.setItem(loginKey, uid); } catch { /* privatmodus */ }
      recordUsage({
        type: 'login',
        companyId,
        detail: { path: currentPath() },
      }).catch(() => {});
    }
    const beat = () => {
      recordUsage({
        type: 'active',
        companyId,
        detail: { path: currentPath(), tab: tabRef.current || '' },
      }).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, 4 * 60 * 1000);
    const onVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') beat();
    };
    document.addEventListener?.('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener?.('visibilitychange', onVisible);
    };
  }, [uid, companyId]);

  useEffect(() => {
    if (!uid || !tab) return undefined;
    recordUsage({
      type: 'navigation',
      companyId,
      detail: { tab, subView: subView || '' },
    }).catch(() => {});
    return undefined;
  }, [uid, companyId, tab, subView]);

  return null;
}
