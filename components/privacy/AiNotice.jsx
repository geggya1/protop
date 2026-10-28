import React from 'react';
import { Text } from 'react-native';
import { AI_OFF_MESSAGE } from '../../src/privacy/companyPrivacy';

/** Kort opplysning ved AI-funksjoner: hva som sendes hvor, eller at AI er slått av. */
export default function AiNotice({
  allowed = true, colors, style, what = 'Innholdet',
}) {
  return (
    <Text style={[{ color: colors.muted, fontSize: 12, lineHeight: 17 }, style]}>
      {allowed
        ? `${what} sendes til Google Gemini for tolking. Se personvernerklæringen.`
        : AI_OFF_MESSAGE}
    </Text>
  );
}
