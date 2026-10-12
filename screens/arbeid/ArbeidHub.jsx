import React from 'react';
import { defaultArbeidSubView } from '../../src/navigation/shellModules';
import ArbeidScreen from './ArbeidScreen';
import EconomyHours from '../economy/EconomyHours';

export default function ArbeidHub({ subView } = {}) {
  const page = defaultArbeidSubView(subView);
  if (page === 'timerapport') return <EconomyHours />;
  return <ArbeidScreen />;
}
