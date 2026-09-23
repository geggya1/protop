import React from 'react';
import { View, StyleSheet } from 'react-native';
import { widgetMeta, widgetVariant } from '../../src/homeWidgetCatalog';

export default function HomeWidgetFrame({
  widget,
  role = 'parent',
  testID,
  children,
}) {
  const meta = widgetMeta(widget.type, role);
  const spec = widgetVariant(widget.type, widget.variant);
  const onGrid = Number.isFinite(widget?.gw) && Number.isFinite(widget?.gh);
  const lockedHeight = onGrid ? null : (Number.isFinite(spec.height) ? spec.height : null);

  return (
    <View
      style={[styles.frame, lockedHeight != null ? { height: lockedHeight } : null]}
      accessibilityLabel={meta?.label || widget.type}
      testID={testID}
    >
      <View style={[styles.body, (onGrid || lockedHeight != null) && styles.bodyLocked]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
    minWidth: 0,
    width: '100%',
    flex: 1,
    alignSelf: 'stretch',
  },
  body: { minWidth: 0, flex: 1 },
  bodyLocked: { height: '100%', overflow: 'hidden' },
});
