import React from 'react';
import { useRoute } from '@react-navigation/native';
import PrivacyTermsScreen from './PrivacyTermsScreen';

/** Deep-link / stack: vis dokumentet som underside av personvern-huben. */
export default function LegalDocScreen() {
  const { params } = useRoute();
  const page = ['privacy', 'dpa'].includes(params?.doc) ? params.doc : 'terms';
  return <PrivacyTermsScreen initialPage={page} />;
}
