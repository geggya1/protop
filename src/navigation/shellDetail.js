/**
 * Detaljsider med egen adresse (UX-20): /hjem/prosjekt/:id, /hjem/okonomi/faktura/:id, /hjem/ansatte/:id,
 * /hjem/iso/avvik/:id. AppShell eier adressen og deler detaljen her. Modulen sier hvilken detalj den viser,
 * og får beskjed når adressen endres utenfra (en delt lenke, nettleserens tilbake eller fram).
 * Utenfor skallet (andre skall, tester) gjør dette ingenting.
 */
import { createContext, useContext, useEffect, useRef } from 'react';
import { SHELL_DETAILS, detailSyncStep } from './shellPaths.js';

/** { tab, subView, detailId, setDetail(route, id | null) } fra AppShell. */
export const ShellDetailContext = createContext(null);

/**
 * kind: 'project' | 'invoice' | 'employee' | 'finding' (SHELL_DETAILS).
 * openId: id-en modulen viser nå ('' = listen).
 * onOpen(id): adressen peker på en detalj (lenke, tilbake/fram). Modulen åpner den, eller viser
 * DetailMissing når den ikke finnes eller brukeren ikke har tilgang. onClose(): tilbake til listen.
 * Svar: { urlId, list, thing, close } — close() går til listen også når detaljen ikke kunne åpnes.
 */
export function useShellDetail(kind, openId, { onOpen, onClose } = {}) {
  const ctx = useContext(ShellDetailContext);
  const route = SHELL_DETAILS[kind] || null;
  const active = !!ctx && !!route && ctx.tab === route.tab && (ctx.subView || null) === route.subView;
  const urlId = active ? String(ctx.detailId || '') : '';
  const open = String(openId || '');
  const seen = useRef({ url: '', open });
  const handlers = useRef({ onOpen, onClose });
  handlers.current = { onOpen, onClose };

  useEffect(() => {
    if (!active) return;
    const step = detailSyncStep(seen.current, { urlId, openId: open });
    seen.current = step.seen;
    const action = step.action;
    if (!action) return;
    if (action.type === 'open') handlers.current.onOpen?.(action.id);
    else if (action.type === 'close') handlers.current.onClose?.();
    else ctx.setDetail(route, action.id || null);
  }, [active, urlId, open]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    urlId,
    list: route?.list || '',
    thing: route?.thing || '',
    close: () => {
      if (active) ctx.setDetail(route, null);
    },
  };
}
