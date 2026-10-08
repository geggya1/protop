import React from 'react';
import { View } from 'react-native';
import IntakePanel from './IntakePanel';

export default function TenderInquiry({ company, colors }) {
  return (
    <View style={{ gap: 12 }}>
      <IntakePanel colors={colors} company={company} />
    </View>
  );
}
