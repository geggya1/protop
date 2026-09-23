import { useMemo } from 'react';
import { shopFamilyIdsKey } from '../utils/shopFamilyIds';

/** Family ids for shopping-list listeners. Stable while the id set is unchanged. */
export function useShopFamilyIds(families, familyId) {
  const key = shopFamilyIdsKey(families, familyId);
  return useMemo(
    () => (key ? key.split('|') : []),
    [key],
  );
}

