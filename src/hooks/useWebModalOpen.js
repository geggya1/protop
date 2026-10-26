import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Web: sann mens en dialog er åpen (react-native-web Modal: role="dialog" i en egen
 * portal under <body> så lenge den er åpen). Sjekken kjøres høyst én gang per bilde.
 */
export function useWebModalOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
      return undefined;
    }
    let frame = 0;
    const check = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setOpen(!!document.querySelector('[role="dialog"], [aria-modal="true"]'));
      });
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-modal'],
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  return open;
}

export default useWebModalOpen;
