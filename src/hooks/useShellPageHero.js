import { useContext, useLayoutEffect, useRef } from 'react';
import { ShellPageHeroContext } from '../../components/ShellHeader';

let ownerSeq = 0;

/**
 * On phone the band is the page heading: it replaces familienavn and the
 * large title under the logo, the same way ModuleHero does for Weekplan.
 * Pass a memoized node so the shell does not re-claim on every render.
 */
export function useShellPageHero(node, { active = true } = {}) {
  const ctx = useContext(ShellPageHeroContext);
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
    if (!active || !node) {
      ctx.release(owner);
      return;
    }
    ctx.claim(owner, node);
  }, [ctx, owner, node, active]);
}
