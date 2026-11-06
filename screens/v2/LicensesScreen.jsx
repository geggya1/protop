import React from 'react';
import { lazyScreen } from '../../src/ui/lazyScreen';
const PrivacyTermsScreen = lazyScreen(() => import('./PrivacyTermsScreen'), { name: 'PrivacyTermsScreen' });

/** Deep-link / stack: vis lisenser som underside av personvern-huben. */
export default function LicensesScreen() {
  return <PrivacyTermsScreen initialPage="licenses" />;
}
