import React from 'react';
import { defaultArbeidSubView } from '../../src/navigation/shellModules';
import ArbeidScreen from './ArbeidScreen';
import EconomyHours from '../economy/EconomyHours';
import TimesaldoScreen from './TimesaldoScreen';
import {
  AbsenceOverviewScreen,
  AbsenceReportScreen,
  PlannedAbsenceScreen,
} from './AbsenceScreens';
import {
  ApprovalsScreen,
  ProductSalesScreen,
  ProjectExpensesScreen,
} from './OpsScreens';
import ProductivityScreen from './ProductivityScreen';
import ProjectTimelineScreen from './ProjectTimelineScreen';
import AbsenceSettingsScreen from './AbsenceSettingsScreen';

export default function ArbeidHub({ subView } = {}) {
  const page = defaultArbeidSubView(subView);
  if (page === 'timerapport') return <EconomyHours />;
  if (page === 'timesaldo') return <TimesaldoScreen />;
  if (page === 'fravaer') return <AbsenceOverviewScreen />;
  if (page === 'fravaersrapport') return <AbsenceReportScreen />;
  if (page === 'planlagt') return <PlannedAbsenceScreen />;
  if (page === 'fravaer-innstillinger') return <AbsenceSettingsScreen />;
  if (page === 'utlegg') return <ProjectExpensesScreen />;
  if (page === 'salg') return <ProductSalesScreen />;
  if (page === 'godkjenning') return <ApprovalsScreen />;
  if (page === 'produktivitet') return <ProductivityScreen />;
  if (page === 'fremdrift') return <ProjectTimelineScreen />;
  return <ArbeidScreen />;
}
