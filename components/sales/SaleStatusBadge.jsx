import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { saleStatusLabel } from '../../src/economy/productSalesView.js';

export function saleStatusTone(status, colors) {
  if (status === 'invoiced') return { bg: '#dcfce7', fg: '#166534' };
  if (status === 'approved') return { bg: '#e0f2fe', fg: '#075985' };
  return { bg: colors?.sunken || '#f1f5f9', fg: colors?.ink || '#334155' };
}

/** Status på et produktsalg. Fakturert får lås, siden raden ikke kan endres. */
export default function SaleStatusBadge({ status, colors }) {
  const tone = saleStatusTone(status, colors);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: tone.bg }}>
      {status === 'invoiced' ? <Ionicons name="lock-closed" size={11} color={tone.fg} /> : null}
      <Text style={{ color: tone.fg, fontSize: 12, fontWeight: '600' }}>{saleStatusLabel(status)}</Text>
    </View>
  );
}
