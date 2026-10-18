import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Ikonknapp. Teksten ligger i tooltip og skjermleser, ikke som løpende tekst. */
export default function BidSymbolButton({
  icon,
  tip,
  label,
  color,
  backgroundColor,
  borderColor,
  onPress,
  disabled,
}) {
  const spoken = label || tip;
  const tipText = tip || spoken;
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!tipText || !node || typeof node.setAttribute !== 'function') return;
    node.setAttribute('title', tipText);
  }, [tipText]);
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      dataSet={Platform.OS === 'web' ? { title: tipText } : undefined}
      style={[
        styles.btn,
        {
          backgroundColor,
          borderColor: borderColor || color,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={18} color={color} />
    </Pressable>
  );
}

export function BidDeskActions({
  colors,
  title,
  canReturn,
  canLeave,
  busy,
  onOpen,
  onReturn,
  onLeave,
}) {
  return (
    <View style={styles.row}>
      <BidSymbolButton
        icon="open-outline"
        tip="Åpne"
        label={`Åpne ${title} her`}
        color="#fff"
        backgroundColor={colors.brand}
        borderColor={colors.brand}
        onPress={onOpen}
      />
      {canReturn ? (
        <BidSymbolButton
          icon="arrow-undo-outline"
          tip="Tilbake til vurdering"
          label={`Flytt ${title} tilbake til vurdering`}
          color={colors.brand}
          backgroundColor={colors.card}
          borderColor={colors.brand}
          onPress={onReturn}
          disabled={busy}
        />
      ) : null}
      {canLeave ? (
        <BidSymbolButton
          icon="ban-outline"
          tip="Uaktuell"
          label={`Meld ${title} som uaktuell`}
          color={colors.danger}
          backgroundColor={colors.card}
          borderColor={colors.danger}
          onPress={onLeave}
          disabled={busy}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, alignItems: 'center' },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
