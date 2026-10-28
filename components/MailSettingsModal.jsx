import React, { useState } from 'react';
import {
  Modal, Pressable, ScrollView, View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, useLayout } from '../src/theme';
import { desktopOverlay, desktopFormSheet } from '../src/desktop';
import ConfirmDialog from './ConfirmDialog';
import BrandToggle from './BrandToggle';
import MailSignatureSettings from './MailSignatureSettings';

/**
 * E-postinnstillinger: kontoer, ny tilkobling, standardkonto og visningsvalg.
 */
export default function MailSettingsModal({
  visible,
  onClose,
  accounts = [],
  defaultId,
  unreadFirst,
  grantBusy,
  onDefaultChange,
  onUnreadFirstChange,
  onConnect,
  onGrant,
  onRemove,
  error = '',
  onDismissError,
  composePrefs,
  onComposePrefsChange,
}) {
  const { isDesktop } = useLayout();
  const [removeId, setRemoveId] = useState(null);
  const removeAcc = accounts.find((a) => a.id === removeId);

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType={isDesktop ? 'fade' : 'slide'}
      onRequestClose={onClose}
    >
      <Pressable
        style={[styles.backdrop, isDesktop && desktopOverlay]}
        onPress={onClose}
      >
        <Pressable
          style={[styles.sheet, isDesktop && [desktopFormSheet, styles.sheetDesktop]]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <View style={styles.head}>
            <Text style={styles.title}>E-postinnstillinger</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Lukk"
            >
              <Ionicons name="close" size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollInner}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {error ? (
              <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle-outline" size={16} color="#b91c1c" />
                <Text style={styles.errorTxt}>{error}</Text>
                {onDismissError ? (
                  <TouchableOpacity onPress={onDismissError} hitSlop={8} accessibilityRole="button" accessibilityLabel="Lukk feilmeldingen">
                    <Ionicons name="close" size={16} color={colors.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            <Text style={styles.kicker}>Kontoer</Text>
            {accounts.length === 0 ? (
              <Text style={styles.hint}>Ingen Outlook-kontoer ennå. Koble til for å lese e-post her.</Text>
            ) : accounts.map((acc) => {
              const isDefault = acc.id === defaultId;
              return (
                <View key={acc.id} style={styles.account}>
                  <View style={styles.accountIcon}>
                    <Ionicons name="mail" size={16} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.accountEmail} numberOfLines={1}>
                      {acc.email || acc.label || 'Outlook'}
                    </Text>
                    <Text style={styles.accountMeta}>
                      {acc.mailAccess ? 'E-posttilgang på' : 'Mangler e-posttilgang'}
                      {isDefault ? ' · Standard' : ''}
                    </Text>
                    <View style={styles.accountActions}>
                      {!acc.mailAccess ? (
                        <TouchableOpacity onPress={() => onGrant?.(acc.id)} disabled={grantBusy}>
                          <Text style={styles.link}>{grantBusy ? 'Kobler til…' : 'Gi e-posttilgang'}</Text>
                        </TouchableOpacity>
                      ) : null}
                      {!isDefault ? (
                        <TouchableOpacity onPress={() => onDefaultChange?.(acc.id)}>
                          <Text style={styles.link}>Bruk som standard</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity onPress={() => setRemoveId(acc.id)}>
                        <Text style={styles.linkDanger}>Fjern</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}

            <TouchableOpacity
              style={styles.connectBtn}
              onPress={() => onConnect?.()}
              disabled={grantBusy}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.connectTxt}>
                {grantBusy ? 'Kobler til…' : 'Koble til ny e-postkonto'}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.kicker, { marginTop: 18 }]}>Visning</Text>
            <View style={styles.optionRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.optionLbl}>Vis bare uleste</Text>
                <Text style={styles.hint}>Meldingslisten viser uleste til du velger et annet filter.</Text>
              </View>
              <BrandToggle
                value={!!unreadFirst}
                onValueChange={(v) => onUnreadFirstChange?.(v)}
              />
            </View>
            {composePrefs ? (
              <MailSignatureSettings
                prefs={composePrefs}
                onChange={(patch) => onComposePrefsChange?.(patch)}
              />
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
      <ConfirmDialog
        visible={!!removeId}
        title="Fjerne konto?"
        message={removeAcc
          ? `${removeAcc.email || removeAcc.label || 'Denne Outlook-kontoen'} fjernes fra e-post og kalender.`
          : ''}
        confirmText="Fjern"
        cancelText="Avbryt"
        danger
        onCancel={() => setRemoveId(null)}
        onConfirm={() => {
          const id = removeId;
          setRemoveId(null);
          onRemove?.(id);
        }}
        onClose={() => setRemoveId(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: colors.dangerSoft,
  },
  errorTxt: { flex: 1, minWidth: 0, color: colors.dangerInk, fontSize: 13, lineHeight: 18 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    maxHeight: '92%',
  },
  sheetDesktop: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    maxWidth: 760,
    width: '100%',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: '400', color: colors.ink, letterSpacing: -0.2 },
  closeBtn: {
    width: 28, height: 28, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { flexGrow: 0 },
  scrollInner: { paddingBottom: 12 },
  kicker: {
    fontSize: 11, fontWeight: '400', color: colors.muted, letterSpacing: 0.42,
    textTransform: 'uppercase', marginBottom: 8,
  },
  hint: { fontSize: 12, fontWeight: '400', color: colors.muted, lineHeight: 16 },
  account: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  accountIcon: {
    width: 28, height: 28, borderRadius: 6, backgroundColor: colors.brandSoft,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  accountEmail: { fontSize: 13, fontWeight: '400', color: colors.ink },
  accountMeta: { fontSize: 11, fontWeight: '400', color: colors.muted, marginTop: 2 },
  accountActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  link: { color: colors.brand, fontWeight: '400', fontSize: 12 },
  linkDanger: { color: colors.danger, fontWeight: '400', fontSize: 12 },
  connectBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  connectTxt: { color: '#fff', fontWeight: '400', fontSize: 13 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  optionLbl: { fontSize: 13, fontWeight: '500', color: colors.ink, marginBottom: 2 },
});
