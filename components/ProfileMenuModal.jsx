import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { signOut } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../firebase';
import { colors, useLayout } from '../src/theme';
import { AvatarBubble } from './AvatarPicker';
import ProfileSwitcherModal from './ProfileSwitcherModal';
import FriendQrModal from './FriendQrModal';
import { useProfileNavigation } from '../src/hooks/useProfileNavigation';
import { useApp } from '../src/context/AppContext';
import { goPlatformOverview } from '../src/utils/platformNav';
import { openNotifications } from '../src/navigation/openNotifications';
import { desktopMenu } from '../src/desktop';
import { hardReloadApp } from '../src/hooks/usePullToRefresh';

function MenuRow({ icon, label, onPress, danger, compact = false }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.row, compact && styles.rowCompact]} accessibilityRole="button">
      <Ionicons name={icon} size={compact ? 18 : 20} color={danger ? colors.danger : colors.brand} />
      <Text style={[styles.rowLabel, compact && styles.rowLabelCompact, danger && { color: colors.danger }]}>{label}</Text>
      {compact ? null : <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
    </TouchableOpacity>
  );
}

/** Profilmeny fra avatar — bytt bruker, oversikt, innstillinger, logg ut. */
export default function ProfileMenuModal({ visible, onClose }) {
  const nav = useNavigation();
  const { isDesktop } = useLayout();
  const { family, familyId, kids, requestShellTab, isParent } = useApp();
  const {
    activeProfile,
    activeProfileKind,
    activeChildId,
    parentTile,
    canSwitchProfiles,
    goParentProfile,
    goChildProfile,
    isChildAccount,
  } = useProfileNavigation();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut(auth);
      nav.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (e) {
      Alert.alert('Kunne ikke logge ut', e?.message || 'Ukjent feil');
    } finally {
      setSigningOut(false);
      onClose?.();
    }
  };

  if (!visible && !switcherOpen && !qrOpen) return null;

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType={isDesktop ? 'fade' : 'slide'}
        onRequestClose={onClose}
      >
        <Pressable style={[styles.backdrop, isDesktop && styles.backdropDesktop]} onPress={onClose} />
        <View style={isDesktop ? [styles.sheetDesktopBase, desktopMenu] : styles.sheet}>
          <View style={[styles.header, isDesktop && styles.headerDesktop]}>
            <AvatarBubble
              avatarId={activeProfile?.avatarId}
              photoURL={activeProfile?.photoURL}
              name={activeProfile?.name || '?'}
              size={isDesktop ? 32 : 52}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, isDesktop && styles.nameDesktop]}>{activeProfile?.name || 'Profil'}</Text>
              <Text style={[styles.sub, isDesktop && styles.subDesktop]}>
                {activeProfile?.username
                  ? `@${String(activeProfile.username).replace(/^@+/, '')}`
                  : 'Konto'}
                {family?.name ? ` · ${family.name}` : ''}
              </Text>
            </View>
          </View>

          <MenuRow
            compact={isDesktop}
            icon="swap-horizontal-outline"
            label="Skift organisasjon"
            onPress={() => { onClose?.(); goPlatformOverview(nav); }}
          />
          <MenuRow
            compact={isDesktop}
            icon="people-outline"
            label="Venner"
            onPress={() => {
              onClose?.();
              requestShellTab('more', 'friends');
              nav.navigate('Home', { openShell: { tab: 'more', subView: 'friends' } });
            }}
          />
          <MenuRow
            compact={isDesktop}
            icon="qr-code-outline"
            label="Min QR — legg til venn"
            onPress={() => { onClose?.(); setQrOpen(true); }}
          />
          <MenuRow
            compact={isDesktop}
            icon="notifications-outline"
            label="Varslinger"
            onPress={() => { onClose?.(); openNotifications(nav); }}
          />
          <MenuRow
            compact={isDesktop}
            icon="settings-outline"
            label="Innstillinger"
            onPress={() => {
              onClose?.();
              if (activeProfileKind === 'child' && activeChildId) {
                const child = kids.find((k) => k.id === activeChildId);
                if (child) {
                  nav.navigate('ChildSettings', {
                    familyId,
                    child,
                    focus: isChildAccount ? 'login' : undefined,
                  });
                  return;
                }
              }
              // Samme hub som hamburger → Innstillinger (SettingsScreen),
              // ikke den gamle «Din profil»-wizard med språkliste.
              requestShellTab('more', 'settings');
              nav.navigate('Home', { openShell: { tab: 'more', subView: 'settings' } });
            }}
          />
          {Platform.OS === 'web' ? (
            <MenuRow
              compact={isDesktop}
              icon="refresh-outline"
              label="Oppdater appen"
              onPress={() => {
                onClose?.();
                hardReloadApp();
              }}
            />
          ) : null}

          <View style={styles.divider} />
          <TouchableOpacity
            onPress={handleSignOut}
            style={[styles.row, isDesktop && styles.rowCompact, { opacity: signingOut ? 0.7 : 1 }]}
            disabled={signingOut}
          >
            <Ionicons name="log-out-outline" size={isDesktop ? 18 : 20} color={colors.danger} />
            <Text style={[styles.rowLabel, isDesktop && styles.rowLabelCompact, { color: colors.danger, flex: 1 }]}>
              {signingOut ? 'Logger ut…' : 'Logg ut'}
            </Text>
            {signingOut && <ActivityIndicator size="small" />}
          </TouchableOpacity>
        </View>
      </Modal>

      <ProfileSwitcherModal
        visible={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        parentProfile={parentTile}
        kids={kids}
        activeKind={activeProfileKind}
        activeChildId={activeChildId}
        canSwitchProfiles={canSwitchProfiles && !isChildAccount}
        onSelectParent={goParentProfile}
        onSelectChild={goChildProfile}
      />
      <FriendQrModal visible={qrOpen} onClose={() => setQrOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  backdropDesktop: { backgroundColor: 'rgba(15,23,42,0.18)' },
  sheet: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: '82%', maxWidth: 340,
    backgroundColor: colors.card, padding: 20, paddingTop: 56,
  },
  sheetDesktopBase: {
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  headerDesktop: {
    marginBottom: 10, paddingBottom: 10,
  },
  name: { fontSize: 18, fontWeight: '900', color: colors.ink },
  nameDesktop: { fontSize: 14, fontWeight: '600' },
  sub: { color: colors.muted, fontWeight: '600', fontSize: 13, marginTop: 2 },
  subDesktop: { fontWeight: '400', fontSize: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, minHeight: 48,
  },
  rowCompact: {
    paddingVertical: 7, minHeight: 34, gap: 10,
  },
  rowLabel: { flex: 1, fontWeight: '700', fontSize: 16, color: colors.ink },
  rowLabelCompact: { fontSize: 13, fontWeight: '500' },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 6 },
});
