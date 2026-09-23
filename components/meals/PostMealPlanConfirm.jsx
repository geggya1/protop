import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, Pressable, StyleSheet, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';
import { isPrivateList } from '../../src/utils/shoppingLists';

/**
 * Etter at et måltid er planlagt:
 * 1) Bekreftelse + spørsmål om å legge ingredienser i handleliste
 * 2) Ved Ja og flere lister: velg hvilken handleliste
 */
export default function PostMealPlanConfirm({
  visible,
  mealTitle = '',
  mealTag = 'Middag',
  dayLabel = '',
  lists = [],
  onDecline,
  onConfirm,
  onClose,
}) {
  const [step, setStep] = useState('ask'); // ask | pick
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!visible) {
      setStep('ask');
      setSelectedId(null);
      return;
    }
    setStep('ask');
    setSelectedId(lists.length === 1 ? lists[0].id : null);
  }, [visible, lists]);

  const close = () => {
    onClose?.();
  };

  const handleNo = () => {
    onDecline?.();
    close();
  };

  const proceedWithList = (listId) => {
    onConfirm?.(listId || null);
    close();
  };

  const handleYes = () => {
    if (lists.length > 1) {
      setStep('pick');
      if (!selectedId) setSelectedId(lists[0]?.id || null);
      return;
    }
    proceedWithList(lists[0]?.id || null);
  };

  const handlePickContinue = () => {
    if (lists.length > 1 && !selectedId) return;
    proceedWithList(selectedId || lists[0]?.id || null);
  };

  const confirmMessage = [
    mealTitle
      ? `«${mealTitle}» er lagt til som ${mealTag || 'måltid'}${dayLabel ? ` ${dayLabel}` : ''}.`
      : `Matretten er lagt til som ${mealTag || 'måltid'}${dayLabel ? ` ${dayLabel}` : ''}.`,
    '',
    'Ønsker du å legge til ingrediensene i handlelisten?',
  ].join('\n');

  return (
    <Modal
      visible={!!visible}
      animationType="fade"
      transparent
      onRequestClose={() => {
        if (step === 'pick') {
          setStep('ask');
          return;
        }
        handleNo();
      }}
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => {
          if (step === 'pick') {
            setStep('ask');
            return;
          }
          handleNo();
        }}
      >
        <Pressable style={styles.card} onPress={() => {}} onStartShouldSetResponder={() => true}>
          {step === 'ask' ? (
            <>
              <Text style={styles.title}>Lagt til i planen</Text>
              <Text style={styles.msg}>{confirmMessage}</Text>
              <View style={styles.row}>
                <TouchableOpacity style={[styles.btn, styles.muted]} onPress={handleNo}>
                  <Text style={[styles.btnTxt, { color: '#0f172a' }]}>Nei</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.primary]} onPress={handleYes}>
                  <Text style={styles.btnTxt}>Ja</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>Velg handleliste</Text>
              <Text style={styles.msg}>
                Hvilken handleliste skal ingrediensene legges i?
              </Text>
              <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
                {lists.map((list) => {
                  const selected = selectedId === list.id;
                  const privateList = isPrivateList(list);
                  return (
                    <TouchableOpacity
                      key={`${list.storage || 'x'}-${list.id}`}
                      style={[styles.listRow, selected && styles.listRowOn]}
                      onPress={() => setSelectedId(list.id)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.listIcon, selected && styles.listIconOn]}>
                        <Ionicons
                          name="cart"
                          size={18}
                          color={selected ? '#fff' : colors.brand}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[styles.listName, selected && styles.listNameOn]}
                          numberOfLines={1}
                        >
                          {list.name || 'Handleliste'}
                        </Text>
                        <Text style={[styles.listMeta, selected && styles.listMetaOn]} numberOfLines={1}>
                          {privateList ? 'Privat' : 'Delt'}
                          {list.createdByName ? ` · ${list.createdByName}` : ''}
                        </Text>
                      </View>
                      {selected ? (
                        <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
                      ) : (
                        <View style={styles.radio} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={styles.row}>
                <TouchableOpacity
                  style={[styles.btn, styles.muted]}
                  onPress={() => setStep('ask')}
                >
                  <Text style={[styles.btnTxt, { color: '#0f172a' }]}>Tilbake</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.primary, !selectedId && styles.btnDisabled]}
                  onPress={handlePickContinue}
                  disabled={!selectedId}
                >
                  <Text style={styles.btnTxt}>Fortsett</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  msg: { marginTop: 8, color: '#334155', lineHeight: 20, fontWeight: '500' },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  btnTxt: { color: '#fff', fontWeight: '800' },
  muted: { backgroundColor: '#e5e7eb' },
  primary: { backgroundColor: colors.brand },
  btnDisabled: { opacity: 0.45 },
  listScroll: { maxHeight: 280, marginTop: 10 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 8,
    backgroundColor: colors.card,
  },
  listRowOn: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  listIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listIconOn: { backgroundColor: colors.brand },
  listName: { fontWeight: '700', fontSize: 14, color: colors.ink },
  listNameOn: { color: colors.ink },
  listMeta: { fontSize: 11, color: colors.muted, fontWeight: '500', marginTop: 1 },
  listMetaOn: { color: colors.muted },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
});
