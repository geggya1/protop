import React from 'react';
import { defaultArbeidSubView } from '../../src/navigation/shellModules';
import ArbeidScreen from './ArbeidScreen';
import EconomyHours from '../economy/EconomyHours';
import TimesaldoScreen from './TimesaldoScreen';
import {
  AbsenceOverviewScreen,
  AbsenceReportScreen,
  MyOverviewScreen,
  PlannedAbsenceScreen,
} from './AbsenceScreens';
import {
  ApprovalsScreen,
  LeadershipScreen,
  ProductSalesScreen,
  ProjectExpensesScreen,
} from './OpsScreens';

export default function ArbeidHub({ subView } = {}) {
  const page = defaultArbeidSubView(subView);
  if (page === 'timerapport') return <EconomyHours />;
  if (page === 'timesaldo') return <TimesaldoScreen />;
  if (page === 'fravaer') return <AbsenceOverviewScreen />;
  if (page === 'fravaersrapport') return <AbsenceReportScreen />;
  if (page === 'planlagt') return <PlannedAbsenceScreen />;
  if (page === 'oversikt') return <MyOverviewScreen />;
  if (page === 'utlegg') return <ProjectExpensesScreen />;
  if (page === 'salg') return <ProductSalesScreen />;
  if (page === 'ledelse') return <LeadershipScreen />;
  if (page === 'godkjenning') return <ApprovalsScreen />;
  return <ArbeidScreen />;
}
