import React, { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useLayout } from '../src/theme';
import EdgeSwipeBack from './EdgeSwipeBack';

/**
 * Kant-sveip → navigation.goBack() for stack-skjermer uten egen EdgeSwipeBack.
 * På desktop er gesten av (mus/trackpad), samme som AppShell.
 */
export default function StackEdgeSwipe({ enabled = true, children, style }) {
  const nav = useNavigation();
  const { isDesktop } = useLayout();
  const onBack = useCallback(() => {
    if (nav.canGoBack()) nav.goBack();
  }, [nav]);
  // Don't gate on canGoBack() at render — focus transitions can lag; onBack checks live.
  const active = enabled && !isDesktop;
  return (
    <EdgeSwipeBack enabled={active} onBack={onBack} style={style}>
      {children}
    </EdgeSwipeBack>
  );
}

/** HOC for Stack.Screen-komponenter. */
export function withStackEdgeSwipe(ScreenComponent) {
  function Wrapped(props) {
    return (
      <StackEdgeSwipe>
        <ScreenComponent {...props} />
      </StackEdgeSwipe>
    );
  }
  Wrapped.displayName = `StackEdgeSwipe(${ScreenComponent.displayName || ScreenComponent.name || 'Screen'})`;
  return Wrapped;
}
