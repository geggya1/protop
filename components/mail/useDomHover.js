import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Hover som overlever knapper inni raden. Pressable i react-native-web avslutter
 * hover på forelderen når pekeren går inn i en Pressable inni (contain), så
 * knappene som bare vises ved hover forsvant før klikket. mouseenter/mouseleave
 * på selve elementet bryr seg ikke om barn.
 */
export default function useDomHover(ref, onEnter) {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const el = ref.current;
    if (!el?.addEventListener) return undefined;
    const enter = () => {
      setHover(true);
      onEnter?.();
    };
    const leave = () => setHover(false);
    el.addEventListener('mouseenter', enter);
    el.addEventListener('mouseleave', leave);
    return () => {
      el.removeEventListener('mouseenter', enter);
      el.removeEventListener('mouseleave', leave);
    };
  }, [ref, onEnter]);
  return hover;
}

/** Ref som også setter title (verktøytips) på web; react-native-web videresender ikke title. */
export function useTitleRef(title, outerRef) {
  const titleRef = useRef(title);
  titleRef.current = title;
  return useCallback((node) => {
    if (Platform.OS === 'web' && node?.setAttribute && titleRef.current) node.setAttribute('title', titleRef.current);
    if (typeof outerRef === 'function') outerRef(node);
    else if (outerRef) outerRef.current = node;
  }, [outerRef]);
}
