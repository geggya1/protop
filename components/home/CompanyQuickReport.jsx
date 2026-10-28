/**
 * «Meld RUH» på bedriftens Hjem (ISO-03): snarvei til hurtigmeldingen, for alle i bedriften,
 * også innleide. Vises bare i en bedrift der ISO-modulen er slått på.
 */
import React from 'react';
import { View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useCompanyModules } from '../../src/access/useCompanyModules';
import { isOrganizationType } from '../../src/utils/groupTypes';
import QuickReportButton from '../../screens/iso/QuickReport';

export default function CompanyQuickReport({ style }) {
  const { family } = useApp();
  const modules = useCompanyModules();
  if (!isOrganizationType(family?.type) || !modules.isActive('iso')) return null;
  return (
    <View style={style}>
      <QuickReportButton variant="button" label="Meld RUH" />
    </View>
  );
}
