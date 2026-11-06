import React from 'react';
import { defaultArbeidSubView } from '../../src/navigation/shellModules';
import ProductivityScreen from './ProductivityScreen';
import ProjectTimelineScreen from './ProjectTimelineScreen';
import { lazyScreen } from '../../src/ui/lazyScreen';
const ApprovalsScreen = lazyScreen(() => import('./ApprovalsScreen'), { name: 'ApprovalsScreen', pick: 'ApprovalsScreen' });
const ProductSalesScreen = lazyScreen(() => import('./ProductSalesScreen'), { name: 'ProductSalesScreen', pick: 'ProductSalesScreen' });
const AbsenceOverviewScreen = lazyScreen(() => import('./AbsenceScreens'), { name: 'AbsenceOverviewScreen', pick: 'AbsenceOverviewScreen' });
const AbsenceReportScreen = lazyScreen(() => import('./AbsenceScreens'), { name: 'AbsenceReportScreen', pick: 'AbsenceReportScreen' });
const PlannedAbsenceScreen = lazyScreen(() => import('./AbsenceScreens'), { name: 'PlannedAbsenceScreen', pick: 'PlannedAbsenceScreen' });
const AbsenceSettingsScreen = lazyScreen(() => import('./AbsenceSettingsScreen'), { name: 'AbsenceSettingsScreen' });
const TimesaldoScreen = lazyScreen(() => import('./TimesaldoScreen'), { name: 'TimesaldoScreen' });
const EconomyHours = lazyScreen(() => import('../economy/EconomyHours'), { name: 'EconomyHours', silent: true });
const ArbeidScreen = lazyScreen(() => import('./ArbeidScreen'), { name: 'ArbeidScreen' });

export default function ArbeidHub({ subView } = {}) {
  const page = defaultArbeidSubView(subView);
  if (page === 'timerapport') return <EconomyHours />;
  if (page === 'timesaldo') return <TimesaldoScreen />;
  if (page === 'fravaer') return <AbsenceOverviewScreen />;
  if (page === 'fravaersrapport') return <AbsenceReportScreen />;
  if (page === 'planlagt') return <PlannedAbsenceScreen />;
  if (page === 'fravaer-innstillinger') return <AbsenceSettingsScreen />;
  // Den gamle adressen til Prosjektutlegg: skallet sender videre til Økonomi → Utlegg med filteret
  // Prosjekt (UX-17). Ingenting tegnes her, så filteret ikke tas imot av en side som straks forsvinner.
  if (page === 'utlegg') return null;
  if (page === 'salg') return <ProductSalesScreen />;
  if (page === 'godkjenning') return <ApprovalsScreen />;
  if (page === 'produktivitet') return <ProductivityScreen />;
  if (page === 'fremdrift') return <ProjectTimelineScreen />;
  return <ArbeidScreen />;
}
