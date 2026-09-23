import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, Pressable, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { isPrivateList } from '../../src/utils/shoppingLists';
import PortionSteppers from './PortionSteppers';

/**
 * Rolig popup for ingredienser + valg av handleliste.
 * Antall personer justeres øverst, så mengdene oppdateres før import.
 */
export default function MealShoppingListSheet({
  visible,
  onClose,
  mealTitle = '',
  portionsLabel = '',
  adults,
  childrenCount,
  onChangeAdults,
  onChangeChildren,
  groups = [],
  generating = false,
  empty = false,
  isParent = false,
  lists = [],
  selectedListId = null,
  onSelectList,
  imported = false,
  addingList = false,
  listBtnLabel = '',
  listBtnDisabled = false,
  onAddAll,
  onGenerate,
}) {
  const { isDesktop } = useLayout();
  const itemCount = groups.reduce((n, g) => n + (g.items?.length || 0), 0);
  const canEditPortions = typeof onChangeAdults === 'function'
    && typeof onChangeChildren === 'function'
    && adults != null
    && childrenCount != null;

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={[styles.backdrop, isDesktop && desktopOverlay]}
        onPress={onClose}
      >
        <Pressable
          style={[styles.card, isDesktop && [desktopSheet, styles.cardDesk]]}
          onPress={() => {}}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.head}>
            <View style={styles.iconWrap}>
              <Ionicons name="cart-outline" size={20} color={colors.brand} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title}>Handleliste for retten</Text>
              <Text style={styles.sub} numberOfLines={2}>
                {[mealTitle, !canEditPortions ? portionsLabel : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Lukk"
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {canEditPortions ? (
            <View style={styles.portionsWrap}>
              <PortionSteppers
                adults={adults}
                childrenCount={childrenCount}
                onChangeAdults={onChangeAdults}
                onChangeChildren={onChangeChildren}
                compact
                hint="Juster før du legger varene i handlelisten. Mengdene oppdateres med en gang."
              />
            </View>
          ) : null}

          {generating ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.loadingTxt}>Lager handlelisten…</Text>
            </View>
          ) : empty ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTxt}>Ingen ingredienser ennå.</Text>
              {isParent && onGenerate ? (
                <TouchableOpacity onPress={onGenerate} style={styles.ghostBtn}>
                  <Text style={styles.ghostTxt}>Foreslå varer</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <ScrollView
              style={[styles.scroll, { maxHeight: isDesktop ? 420 : 340 }]}
              contentContainerStyle={styles.scrollBody}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.countHint}>
                {itemCount} {itemCount === 1 ? 'vare' : 'varer'}, gruppert etter butikkhylle
              </Text>
              {groups.map((group) => (
                <View key={group.key} style={styles.group}>
                  <Text style={styles.groupTitle}>{group.label}</Text>
                  {group.items.map((item) => (
                    <View key={item.id || item.name} style={styles.row}>
                      <Text style={styles.name}>{item.name}</Text>
                      {!!item.amount && <Text style={styles.amt}>{item.amount}</Text>}
                    </View>
                  ))}
                </View>
              ))}

              {isParent && lists.length > 1 && !imported ? (
                <View style={styles.picker}>
                  <Text style={styles.pickerTitle}>Velg handleliste</Text>
                  {lists.map((list) => {
                    const selected = selectedListId === list.id;
                    const privateList = isPrivateList(list);
                    return (
                      <TouchableOpacity
                        key={`${list.storage || 'x'}-${list.id}`}
                        style={[styles.pickRow, selected && styles.pickRowOn]}
                        onPress={() => onSelectList?.(list.id)}
                        activeOpacity={0.75}
                      >
                        <Ionicons
                          name={selected ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={selected ? colors.brand : colors.muted}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.pickName} numberOfLines={1}>{list.name}</Text>
                          <Text style={styles.pickMeta} numberOfLines={1}>
                            {privateList ? 'Privat' : 'Delt'}
                            {list.createdByName ? ` · ${list.createdByName}` : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </ScrollView>
          )}

          {isParent && !generating && !empty ? (
            <TouchableOpacity
              style={[styles.primary, listBtnDisabled && { opacity: 0.55 }]}
              onPress={onAddAll}
              disabled={listBtnDisabled}
            >
              {addingList ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="cart-outline" size={18} color="#fff" />
                  <Text style={styles.primaryTxt}>{listBtnLabel}</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.dismiss} onPress={onClose}>
            <Text style={styles.dismissTxt}>Lukk</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.38)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    paddingBottom: 12,
    maxWidth: 440,
    width: '100%',
    maxHeight: '84%',
    alignSelf: 'center',
  },
  cardDesk: { borderRadius: 14, padding: 18 },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  sub: { marginTop: 2, fontSize: 13, fontWeight: '500', color: colors.muted, lineHeight: 18 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  portionsWrap: { marginBottom: 12 },
  scroll: { flexGrow: 0 },
  scrollBody: { paddingBottom: 8, gap: 10 },
  countHint: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 2,
  },
  loadingBox: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 10,
  },
  loadingTxt: { color: colors.muted, fontWeight: '600' },
  emptyBox: { paddingVertical: 20, alignItems: 'center', gap: 10 },
  emptyTxt: { color: colors.muted, fontWeight: '600' },
  ghostBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  ghostTxt: { color: colors.brand, fontWeight: '700' },
  group: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    gap: 2,
  },
  groupTitle: {
    fontWeight: '700',
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  name: { flex: 1, fontWeight: '600', color: colors.ink, fontSize: 14 },
  amt: { color: colors.muted, fontWeight: '600', fontSize: 13, textAlign: 'right' },
  picker: { marginTop: 4, gap: 4 },
  pickerTitle: { fontWeight: '700', fontSize: 13, color: colors.ink, marginBottom: 4 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  pickRowOn: { backgroundColor: colors.brandSoft },
  pickName: { fontWeight: '700', fontSize: 14, color: colors.ink },
  pickMeta: { fontSize: 11, color: colors.muted, fontWeight: '500', marginTop: 1 },
  primary: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 13,
    minHeight: 48,
  },
  primaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  dismiss: { alignItems: 'center', paddingVertical: 10, marginTop: 2 },
  dismissTxt: { color: colors.muted, fontWeight: '700', fontSize: 14 },
});
