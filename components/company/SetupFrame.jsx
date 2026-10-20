import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useOptionalApp } from '../../src/context/AppContext';

export function SetupFrame({
  colors,
  nativeID,
  crumbs = [],
  title,
  action = null,
  note = '',
  error = '',
  children,
}) {
  const requestShellTab = useOptionalApp()?.requestShellTab;
  return (
    <View nativeID={nativeID} style={styles.wrap}>
      <Text style={[styles.crumbs, { color: colors.muted }]}>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          const label = `${index ? ' / ' : ''}${crumb.label}`;
          if (last) return <Text key={`${crumb.label}-${index}`}>{label}</Text>;
          const canNavigate = crumb.tab || crumb.page != null;
          if (!canNavigate) return <Text key={`${crumb.label}-${index}`}>{label}</Text>;
          return (
            <Text key={`${crumb.label}-${index}`}>
              {index ? ' / ' : ''}
              <Text
                onPress={() => {
                  const tab = crumb.tab || 'selskap';
                  if (crumb.page === '' || crumb.page == null) requestShellTab?.(tab);
                  else requestShellTab?.(tab, crumb.page);
                }}
                style={{ color: colors.brand }}
                accessibilityRole="link"
              >
                {crumb.label}
              </Text>
            </Text>
          );
        })}
      </Text>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{title}</Text>
        {action}
      </View>
      {note ? <Text style={{ color: colors.brand }}>{note}</Text> : null}
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}
      {children}
    </View>
  );
}

export function TextAction({ label, onPress, colors, nativeID, filled = false }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      nativeID={nativeID}
      accessibilityRole="button"
      style={[
        styles.action,
        filled
          ? { backgroundColor: colors.brand }
          : { backgroundColor: 'transparent' },
      ]}
    >
      <Text style={{ color: filled ? '#fff' : colors.brand, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 980, gap: 12, alignSelf: 'flex-start' },
  crumbs: { fontSize: 13 },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 28, fontWeight: '600' },
  action: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
});
