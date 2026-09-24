import { useEffect, useRef } from 'react';
import { useHelp } from '../context/HelpContext';

/**
 * Tell the help overlay which screen we are on so inner steps
 * (type an item, pick who, …) only show after that view is open.
 */
export function useHelpScene(scene, { onRetreat } = {}) {
  const { setHelpScene, registerRetreat } = useHelp();
  const retreatRef = useRef(onRetreat);
  retreatRef.current = onRetreat;

  useEffect(() => {
    setHelpScene(scene || 'hub');
    return () => setHelpScene('hub');
  }, [scene, setHelpScene]);

  useEffect(() => {
    if (typeof onRetreat !== 'function') return undefined;
    const bridge = (...args) => retreatRef.current?.(...args);
    registerRetreat(bridge);
    return () => registerRetreat(null);
  }, [registerRetreat, onRetreat != null]);
}

/** Current tour step anchor while the module walkthrough is open. */
export function useHelpTourAnchor() {
  const { mode, copy, tourIndex } = useHelp();
  if (mode !== 'module') return null;
  return copy?.tour?.[tourIndex]?.anchor || null;
}
