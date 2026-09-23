import { useContext, useLayoutEffect, useRef } from 'react';
import { ShellTitleRightContext } from '../../components/ShellHeader';

let ownerSeq = 0;

/**
 * Register a control in ShellHeader titleRight (next to page title; help sits under it on phone).
 *
 * Hubs that nest detail screens should pass `active={view === 'hub'}`.
 * Ownership is tracked so a parent's cleanup cannot wipe a child's button,
 * and so inactive hubs leave the slot for the nested screen.
 */
export function useShellTitleRight(node, { active = true } = {}) {
  const ctx = useContext(ShellTitleRightContext);
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
