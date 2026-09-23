import { useEffect, useState } from 'react';
import {
  getParentBottomNavChromeHeight,
  subscribeParentBottomNavChrome,
} from '../utils/parentBottomNav';

/** Live height of the parent theme bottom bar (0 when hidden). */
export function useParentBottomNavChrome() {
  const [height, setHeight] = useState(getParentBottomNavChromeHeight);
  useEffect(() => subscribeParentBottomNavChrome(setHeight), []);
  return height;
}
