import { useSyncExternalStore } from 'react';
import {
  emptyVisualViewportFrame,
  getVisualViewportFrame,
  subscribeVisualViewportFrame,
} from './visualViewportFrame';

export function useVisualViewportFrame() {
  return useSyncExternalStore(
    subscribeVisualViewportFrame,
    getVisualViewportFrame,
    emptyVisualViewportFrame,
  );
}
