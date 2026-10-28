import React, { useState } from 'react';
import { TextInput } from 'react-native';
import { shownText } from './typedText';

/**
 * TextInput som beholder mellomrom og linjeskift mens man skriver, også når verdien
 * trimmes før den kommer tilbake. same: når verdien regnes som det som er skrevet
 * (standard sameExceptSpace; sameOrCleared når et tømt felt faller tilbake til en standardtekst).
 */
export default function TypedInput({ value, onChangeText, onBlur, same, ...rest }) {
  const [typed, setTyped] = useState(null);
  return (
    <TextInput
      {...rest}
      value={shownText(typed, value, same)}
      onChangeText={(next) => {
        setTyped(next);
        onChangeText?.(next);
      }}
      onBlur={(event) => {
        setTyped(null);
        onBlur?.(event);
      }}
    />
  );
}
