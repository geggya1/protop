import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Modal, Pressable, Dimensions, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../src/context/AppContext';
import { useColors } from '../src/context/ThemeContext';
import {
  applyPlatformSwitch,
  platformSegmentActive,
  platformSwitchSegments,
  platformSwitchSide,
  resolveWorkspaceId,
  workspacePickerItems,
} from '../src/utils/platformSwitch';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* native */ }
}

/**
 * Privat and Bedrift stay as two buttons.
 * Bedrift opens a menu under itself when there is more than one company.
 */
export default function PlatformSwitch({ compact = false }) {
  const nav = useNavigation();
  const colors = useColors();
  const {
    family, liveFamilies, families, selectFamily, isParent, isChild, isActingAsChild,
  } = useApp();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuBox, setMenuBox] = useState(null);
  const bedriftRef = useRef(null);

  const list = liveFamilies?.length ? liveFamilies : families;
  const segments = useMemo(() => platformSwitchSegments(list), [list]);
  const choices = useMemo(() => workspacePickerItems(list), [list]);
  const many = choices.length > 1;
  const personal = segments.find((segment) => segment.side === 'personal');
  const companySeg = segments.find((segment) => segment.side === 'company');
  const hidden = !isParent || isChild || isActingAsChild;
  const selectedCompanyId = platformSwitchSide(family) === 'company'
    ? resolveWorkspaceId(list, family?.id)
    : null;

  const webSet = useMemo(
    () => (Platform.OS === 'web' ? { dataSet: { wpPlatformSwitch: '1' } } : null),
    [],
  );

  const onPick = async (segment) => {
    if (busy || !segment) return;
    const groupId = segment.groupId ? resolveWorkspaceId(list, segment.groupId) : null;
    if (groupId && family?.id === groupId) return;
    if (!groupId && platformSegmentActive(segment, family, list)) return;
    setMenuOpen(false);
    setBusy(true);
    try {
      await applyPlatformSwitch({
        navigation: nav,
        selectFamily,
        families: list,
        family,
        side: segment.side,
        groupId,
      });
    } finally {
      setBusy(false);
    }
  };

  const openMenu = () => {
    readAnchorBox(bedriftRef.current, (box) => {
      setMenuBox(box);
      setMenuOpen(true);
    });
  };

  if (hidden) return null;

  return (
    <View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        { borderColor: colors.line, backgroundColor: colors.sunken },
      ]}
      accessibilityRole="tablist"
      accessibilityLabel="Bytt mellom privat og bedrift"
      nativeID="platform-switch"
      {...webSet}
    >
      <Seg
        label="Privat"
        active={platformSegmentActive(personal, family, list)}
        compact={compact}
        colors={colors}
        disabled={busy}
        nativeID="platform-switch-privat"
        onPress={() => {
          setMenuOpen(false);
          onPick(personal);
        }}
      />
      <View ref={bedriftRef} collapsable={false}>
        <Seg
          label="Bedrift"
          active={platformSegmentActive(companySeg, family, list)}
          compact={compact}
          colors={colors}
          disabled={busy}
          caret={many}
          expanded={menuOpen}
          nativeID="platform-switch-bedrift"
          onPress={() => {
            if (many) {
              if (menuOpen) setMenuOpen(false);
              else openMenu();
              return;
            }
            onPick(companySeg);
          }}
        />
      </View>
      <CompanyMenu
        open={menuOpen && many}
        box={menuBox}
        choices={choices}
        selectedId={selectedCompanyId}
        colors={colors}
        busy={busy}
        onClose={() => setMenuOpen(false)}
        onPick={onPick}
      />
    </View>
  );
}

function CompanyMenu({
  open, box, choices, selectedId, colors, busy, onClose, onPick,
}) {
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const pos = menuPosition(box, choices.length);
  const card = (
    <View
      nativeID="platform-switch-menu"
      style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.line, width: pos.width }]}
      accessibilityRole="menu"
    >
      <Text style={[styles.menuTitle, { color: colors.muted }]}>Velg bedrift</Text>
      <ScrollView style={styles.menuScroll} keyboardShouldPersistTaps="handled">
        {choices.map((segment) => {
          const selected = segment.groupId === selectedId;
          return (
            <TouchableOpacity
              key={segment.id}
              onPress={() => onPick(segment)}
              disabled={busy}
              accessibilityRole="menuitem"
              accessibilityState={{ selected }}
              aria-selected={selected}
              style={[
                styles.menuRow,
                selected && { backgroundColor: colors.sunken },
              ]}
            >
              <Text
                style={[
                  styles.menuLabel,
                  { color: colors.ink },
                  selected && styles.menuLabelOn,
                ]}
              >
                {segment.label}
              </Text>
              {selected ? (
                <Ionicons name="checkmark" size={18} color={colors.brand || colors.ink} />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  if (Platform.OS === 'web' && typeof document !== 'undefined' && document.body && createPortal) {
    return createPortal(
      <div style={webLayerStyle}>
        <div role="presentation" onClick={onClose} style={webBackdropStyle} />
        <div
          role="presentation"
          onClick={(event) => event.stopPropagation()}
          style={{ position: 'absolute', top: pos.top, left: pos.left, width: pos.width }}
        >
          {card}
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.menuRoot}>
        <Pressable
          style={styles.menuBackdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Lukk bedriftsvalg"
        />
        <View style={[styles.menuAnchor, { top: pos.top, left: pos.left, width: pos.width }]}>
          {card}
        </View>
      </View>
    </Modal>
  );
}

function readAnchorBox(node, done) {
  if (node && typeof node.measureInWindow === 'function') {
    node.measureInWindow((x, y, width, height) => {
      done({ x, y, width, height });
    });
    return;
  }
  const el = node?.getBoundingClientRect
    ? node
    : node?._nativeNode || node?.getNode?.();
  if (el && typeof el.getBoundingClientRect === 'function') {
    const rect = el.getBoundingClientRect();
    done({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    return;
  }
  done(null);
}

function menuPosition(box, count) {
  const { width: viewportW, height: viewportH } = Dimensions.get('window');
  const width = Math.min(360, Math.max(240, viewportW - 16));
  const margin = 8;
  const height = Math.min(360, 48 + (count * 48));
  if (!box) {
    return {
      top: 64,
      left: Math.max(margin, (viewportW - width) / 2),
      width,
    };
  }
  let left = box.x;
  if (left + width > viewportW - margin) left = viewportW - margin - width;
  if (left < margin) left = margin;
  let top = box.y + box.height + 6;
  if (top + height > viewportH - margin && box.y > height) {
    top = Math.max(margin, box.y - height - 6);
  }
  return { top, left, width };
}

function Seg({
  label, active, compact, colors, disabled, caret, expanded, nativeID, onPress,
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      nativeID={nativeID}
      style={[
        styles.seg,
        compact && styles.segCompact,
        active && { backgroundColor: colors.card },
        active && styles.segActive,
      ]}
      // react-native-web 0.21 gjør ikke accessibilityState om til aria-*: hvilken side som er valgt,
      // må stå som aria-selected (og aria-expanded for menyen).
      aria-selected={!!active}
      aria-expanded={caret ? !!expanded : undefined}
      accessibilityRole={caret ? 'button' : 'tab'}
      accessibilityState={{ selected: !!active, expanded: caret ? !!expanded : undefined }}
      accessibilityLabel={caret ? 'Bedrift. Velg bedrift' : label}
    >
      <Text
        style={[
          styles.label,
          compact && styles.labelCompact,
          { color: active ? colors.ink : colors.muted },
          active && styles.labelActive,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {caret ? (
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted || colors.ink} />
      ) : null}
    </TouchableOpacity>
  );
}

const webLayerStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 2147483646,
};
const webBackdropStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 3,
    gap: 2,
    maxWidth: 280,
    minHeight: 44,
    overflow: 'visible',
  },
  wrapCompact: {
    borderRadius: 7,
    padding: 3,
    maxWidth: 260,
    minHeight: 40,
  },
  menuRoot: {
    flex: 1,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  menuAnchor: {
    position: 'absolute',
  },
  menuCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    maxHeight: 360,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  menuScroll: {
    maxHeight: 300,
  },
  menuTitle: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
  },
  menuLabelOn: {
    fontWeight: '600',
  },
  seg: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 72,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  segCompact: {
    minWidth: 64,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 5,
  },
  segActive: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
  labelCompact: {
    fontSize: 13,
    fontWeight: '500',
  },
  labelActive: {
    fontWeight: '600',
  },
});
