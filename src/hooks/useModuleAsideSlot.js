import { useContext, useLayoutEffect, useRef } from 'react';
import { ModuleAsideSlotContext } from '../../components/ModuleAside';

let ownerSeq = 0;

/**
 * Register extra widgets under the desktop tips panel (right column).
 * Inactive screens must pass `active={false}` so they release the slot.
 */
export function useModuleAsideSlot(node, { active = true } = {}) {
  const ctx = useContext(ModuleAsideSlotContext);
  const ownerRef = useRef(null);
  if (ownerRef.current == null) {
    ownerSeq += 1;
    ownerRef.current = ownerSeq;
  }
  const owner = ownerRef.current;

  useLayoutEffect(() => {
    if (!ctx?.claim) return undefined;
    return () => ctx.release(owner);
  }, [ctx, owner]);

  useLayoutEffect(() => {
    if (!ctx?.claim) return;
    if (!active) {
      ctx.release(owner);
      return;
    }
    ctx.claim(owner, node);
  }, [ctx, owner, node, active]);
}
