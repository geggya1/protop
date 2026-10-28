import { useCallback, useEffect, useRef } from 'react';
import { cancelConfirm, requestConfirm } from './confirm.js';

/**
 * Promise-basert bekreftelse som alltid tegner ProTops ConfirmDialog (ConfirmHost i skallet).
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Slette utlegget?', confirmText: 'Slett', tone: 'danger' }))) return;
 *
 * Svarer false ved Avbryt, Escape og trykk utenfor, og når skjermen som spurte forsvinner.
 */
export function useConfirm() {
  const open = useRef(new Set());

  useEffect(() => () => {
    for (const id of open.current) cancelConfirm(id);
    open.current.clear();
  }, []);

  return useCallback((input) => {
    const promise = requestConfirm(input);
    const id = promise.confirmId;
    if (id) open.current.add(id);
    return promise.finally(() => { if (id) open.current.delete(id); });
  }, []);
}

export default useConfirm;
