import { useCallback, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { aiImportNavParams } from '../utils/childNav';

/**
 * Starter AI-import av ukeplan/lekseplan fra bilde.
 * Viser barnvelger automatisk når familien har flere barn.
 */
export function useAiPlanImport() {
  const navigation = useNavigation();
  const { familyId, kids } = useApp();
  const [childPickerOpen, setChildPickerOpen] = useState(false);

  const activeKids = useMemo(
    () => (kids || []).filter((k) => k.active !== false),
    [kids],
  );

  const openImport = useCallback((child) => {
    if (!child || !familyId) return;
    navigation.navigate('AiImportReview', aiImportNavParams({ familyId, child }));
  }, [familyId, navigation]);

  const startImport = useCallback(() => {
    if (!activeKids.length) return false;
    if (activeKids.length === 1) {
      openImport(activeKids[0]);
      return true;
    }
    setChildPickerOpen(true);
    return true;
  }, [activeKids, openImport]);

  const selectChild = useCallback((child) => {
    setChildPickerOpen(false);
    openImport(child);
  }, [openImport]);

  const closePicker = useCallback(() => {
    setChildPickerOpen(false);
  }, []);

  return {
    startImport,
    openImport,
    activeKids,
    childPickerOpen,
    setChildPickerOpen,
    selectChild,
    closePicker,
    canImport: activeKids.length > 0 && !!familyId,
  };
}
