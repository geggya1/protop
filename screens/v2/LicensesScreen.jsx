import React from 'react';
import PrivacyTermsScreen from './PrivacyTermsScreen';

/** Deep-link / stack: vis lisenser som underside av personvern-huben. */
export default function LicensesScreen() {
  return <PrivacyTermsScreen initialPage="licenses" />;
}
