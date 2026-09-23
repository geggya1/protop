import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, Switch, TextInput, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { signOut } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { auth } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useAppearance } from '../../src/appearance/AppearanceContext';
import { useI18n } from '../../src/i18n';
import { colors, useLayout } from '../../src/theme';
import { goPlatformOverview } from '../../src/utils/platformNav';
import { shouldOfferAddToHome } from '../../src/utils/addToHome';
import {
  defaultGreetingEnabled,
  loadGreetingPrefs,
  saveGreetingPrefs,
} from '../../src/utils/greetingPrefs';
import { guardedCallable } from '../../src/utils/guardedCallable';
import { isDeleteAccountConfirmed } from '../../src/utils/deleteAccount';
import { getAppVersion } from '../../src/utils/appUpdates';
import { Screen } from '../../components/ui';
import { AvatarBubble } from '../../components/AvatarPicker';
import AddToHomeGuide from '../../components/AddToHomeGuide';
import FriendQrModal from '../../components/FriendQrModal';

function SectionHeader({ title }) {
  const { isDesktop } = useLayout();
  return <Text style={[styles.sectionTitle, isDesktop && styles.sectionTitleDesk]}>{title}</Text>;
}

function Row({ icon, label, detail, onPress, danger, muted }) {
  const { isDesktop } = useLayout();
  return (
    <TouchableOpacity onPress={onPress} style={[styles.row, isDesktop && styles.rowCompact]} accessibilityRole="button">
      <View style={[styles.iconCircle, isDesktop && styles.iconCircleCompact, danger && styles.iconDanger]}>
        <Ionicons name={icon} size={isDesktop ? 16 : 18} color={danger ? '#fff' : colors.brand} />
      </View>
      <Text style={[styles.label, isDesktop && styles.labelCompact, danger && { color: colors.danger }, muted && { color: colors.muted }]}>{label}</Text>
      {detail ? <Text style={[styles.detail, isDesktop && styles.rowHintDesk]} numberOfLines={1}>{detail}</Text> : null}
      {isDesktop ? null : <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
    </TouchableOpacity>
  );
}

function CollapsibleRows({ icon, title, hint, countLabel, children, defaultOpen = false }) {
  const { isDesktop } = useLayout();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        style={[styles.row, isDesktop && styles.rowCompact]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={[styles.iconCircle, isDesktop && styles.iconCircleCompact]}>
          <Ionicons name={icon} size={isDesktop ? 16 : 18} color={colors.brand} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.label, isDesktop && styles.labelCompact]}>{title}</Text>
          {!open && hint ? (
            <Text style={[styles.rowHint, isDesktop && styles.rowHintDesk]} numberOfLines={1}>{hint}</Text>
          ) : null}
        </View>
        {countLabel ? (
          <Text style={[styles.detail, isDesktop && styles.rowHintDesk]}>{countLabel}</Text>
        ) : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
      </TouchableOpacity>
      {open ? (
        <View style={styles.nestedBlock}>
          {hint ? <Text style={styles.nestedHint}>{hint}</Text> : null}
          {children}
        </View>
      ) : null}
    </View>
  );
}

export default function SettingsScreen({ setSubView } = {}) {
  const nav = useNavigation();
  const { t } = useI18n();
  const { prefs, summary } = useAppearance();
  const { isDesktop } = useLayout();
  const {
    familyId, isParent, isAdmin, isSuperAdmin, kids, user, activeProfile,
    requestShellTab, isChild, uid,
  } = useApp();
  const activeKids = (kids || []).filter((k) => k.active !== false && k.archived !== true);
  const [addHomeOpen, setAddHomeOpen] = useState(false);
  const showAdultGreetingToggle = (isParent || isAdmin) && !isChild;
  const [greetingEnabled, setGreetingEnabled] = useState(() => defaultGreetingEnabled(isChild));
  const [greetingBusy, setGreetingBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  // Settings entry stays available even after banner dismiss (mobile browser only).
  const showInstallGuide = Platform.OS === 'web' && shouldOfferAddToHome();

  const displayName = activeProfile?.name || user?.email || '';
  const photoURL = activeProfile?.photoURL;
  const avatarId = activeProfile?.avatarId;

  useEffect(() => {
    if (!showAdultGreetingToggle || !uid) {
      setGreetingEnabled(defaultGreetingEnabled(isChild));
      return undefined;
    }
    let alive = true;
    loadGreetingPrefs(uid, { isChild }).then((s) => {
      if (alive) setGreetingEnabled(!!s.enabled);
    });
    return () => { alive = false; };
  }, [uid, isChild, showAdultGreetingToggle]);

  const toggleGreeting = async (next) => {
    if (!uid || greetingBusy) return;
    setGreetingBusy(true);
    setGreetingEnabled(next);
    await saveGreetingPrefs(uid, next, { isChild });
    setGreetingBusy(false);
  };

  const appVersion = getAppVersion();
  const privacyUrl = Constants.expoConfig?.extra?.privacyPolicyUrl || 'https://www.protop.no/personvern';
  const supportUrl = Constants.expoConfig?.extra?.supportUrl || 'https://www.protop.no/kontakt';
  const openUrl = (url) => { Linking.openURL(url).catch(() => {}); };
  const openUpdates = () => requestShellTab('more', 'help', 'help-news');
  const canDelete = isDeleteAccountConfirmed(deleteText) && !deleteBusy;

  const confirmDeleteAccount = async () => {
    if (!canDelete) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await guardedCallable('deleteMyAccount', { confirm: 'DELETE' }, { timeout: 120000 });
      await signOut(auth);
    } catch (err) {
      const code = String(err?.code || '');
      setDeleteError(code.includes('not-found') || code.includes('unavailable')
        ? t('settings.deleteAccountUnavailable')
        : (err?.message || t('settings.deleteAccountFailed')));
      setDeleteBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.body, isDesktop && styles.bodyDesktop]} showsVerticalScrollIndicator={false}>
        {isDesktop ? null : (
          <Text style={styles.screenTitle}>{t('settings.title')}</Text>
        )}

        <View style={[styles.group, styles.profileGroup]}>
          <TouchableOpacity
            style={[styles.profileCard, isDesktop && styles.profileCardDesktop]}
            onPress={() => nav.navigate('ProfileSettings')}
            accessibilityRole="button"
          >
            <AvatarBubble
              avatarId={avatarId}
              photoURL={photoURL}
              name={displayName}
              size={isDesktop ? 36 : 56}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.profileName, isDesktop && styles.profileNameDesk]}>{displayName}</Text>
              <Text style={[styles.profileSub, isDesktop && styles.profileSubDesk]}>{user?.email || t('settings.editProfileHint')}</Text>
            </View>
            {isDesktop ? null : <Ionicons name="chevron-forward" size={20} color={colors.muted} />}
          </TouchableOpacity>
          <Row icon="person-circle" label={t('settings.editProfile')} onPress={() => nav.navigate('ProfileSettings')} />
        </View>

        <SectionHeader title={t('settings.profileAccount')} />
        <View style={styles.group}>
          <Row
            icon="people-outline"
            label={t('friend.title')}
            onPress={() => {
              requestShellTab('more', 'friends');
              nav.navigate('Home', { openShell: { tab: 'more', subView: 'friends' } });
            }}
          />
          <Row icon="qr-code-outline" label={t('friend.qrTitle')} onPress={() => setQrOpen(true)} />
          <Row icon="globe" label={t('more.language')} onPress={() => nav.navigate('PickLanguage')} />
          <Row icon="navigate-outline" label={t('settings.locationSharing')} onPress={() => nav.navigate('LocationSettings')} />
          <Row icon="notifications-outline" label={t('tabs.notifications')} onPress={() => nav.navigate('Notifications')} muted />
          {showInstallGuide ? (
            <Row
              icon="phone-portrait-outline"
              label={t('settings.addToHome')}
              onPress={() => setAddHomeOpen(true)}
            />
          ) : null}
        </View>
        <AddToHomeGuide visible={addHomeOpen} onClose={() => setAddHomeOpen(false)} />

        <SectionHeader title={t('settings.homeAndLook')} />
        <View style={styles.group}>
          {(isParent || isAdmin) && !isChild ? (
            <Row
              icon="color-palette-outline"
              label={t('settings.dashboardSetup')}
              onPress={() => {
                if (typeof setSubView === 'function') setSubView('dashboardSetup');
                else nav.navigate('DashboardThemeSettings');
              }}
            />
          ) : null}
          {showAdultGreetingToggle ? (
            <View style={[styles.row, isDesktop && styles.rowCompact]}>
              <View style={[styles.iconCircle, isDesktop && styles.iconCircleCompact]}>
                <Ionicons name="moon-outline" size={isDesktop ? 16 : 18} color={colors.brand} />
              </View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.label, isDesktop && styles.labelCompact]}>{t('greeting.prefsTitle')}</Text>
                <Text style={[styles.rowHint, isDesktop && styles.rowHintDesk]}>{t('greeting.prefsHint')}</Text>
              </View>
              <Switch
                value={greetingEnabled}
                onValueChange={toggleGreeting}
                disabled={greetingBusy || !uid}
                trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                thumbColor={greetingEnabled ? '#0b74d1' : '#f9fafb'}
              />
            </View>
          ) : null}
          <Row
            icon="contrast-outline"
            label={t('settings.appearance')}
            detail={prefs.automatic
              ? (summary.key === 'darkUntil'
                ? t('settings.appearanceDarkUntil', { time: summary.time })
                : summary.key === 'lightUntil'
                  ? t('settings.appearanceLightUntil', { time: summary.time })
                  : t('settings.appearanceAutomatic'))
              : (prefs.manual === 'dark' ? t('settings.appearanceDark') : t('settings.appearanceLight'))}
            onPress={() => nav.navigate('AppearanceSettings')}
          />
          <Row icon="partly-sunny-outline" label={t('home.weatherSettings')} onPress={() => nav.navigate('WeatherSettings')} />
        </View>

        {isParent && (
          <>
            <SectionHeader title={t('settings.family')} />
            <View style={styles.group}>
              {isParent && !isChild && activeKids.length > 0 ? (
                <>
                  <CollapsibleRows
                    icon="key-outline"
                    title={t('settings.childLoginSection')}
                    hint={t('settings.childLoginSectionHint')}
                    countLabel={t('settings.childrenCount', { count: activeKids.length })}
                  >
                    {activeKids.map((kid) => {
                      const handle = String(kid.username || '').replace(/^@+/, '').trim();
                      return (
                        <TouchableOpacity
                          key={`login-${kid.id}`}
                          style={[styles.row, styles.nestedRow, isDesktop && styles.rowCompact]}
                          onPress={() => nav.navigate('ChildSettings', {
                            familyId,
                            child: kid,
                            focus: 'login',
                          })}
                          accessibilityRole="button"
                        >
                          <AvatarBubble
                            avatarId={kid.avatarId}
                            photoURL={kid.photoURL || kid.photoUrl}
                            name={kid.name}
                            size={isDesktop ? 28 : 32}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.label, isDesktop && styles.labelCompact]}>{kid.name || t('settings.child')}</Text>
                            <Text style={[styles.rowHint, isDesktop && styles.rowHintDesk]}>
                              {handle ? `@${handle}` : t('settings.childLoginMissing')}
                            </Text>
                          </View>
                          {isDesktop ? null : <Ionicons name="key-outline" size={16} color={colors.brand} />}
                        </TouchableOpacity>
                      );
                    })}
                  </CollapsibleRows>
                  <CollapsibleRows
                    icon="apps"
                    title={t('apps.childApps')}
                    hint={t('settings.childAppsHint')}
                    countLabel={t('settings.childrenCount', { count: activeKids.length })}
                  >
                    {activeKids.map((kid) => (
                      <TouchableOpacity
                        key={kid.id}
                        style={[styles.row, styles.nestedRow, isDesktop && styles.rowCompact]}
                        onPress={() => nav.navigate('ChildSettings', {
                          familyId,
                          child: kid,
                          focus: 'restrictions',
                        })}
                        accessibilityRole="button"
                      >
                        <AvatarBubble
                          avatarId={kid.avatarId}
                          photoURL={kid.photoURL || kid.photoUrl}
                          name={kid.name}
                          size={isDesktop ? 28 : 32}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.label, isDesktop && styles.labelCompact]}>{kid.name || t('settings.child')}</Text>
                          <Text style={[styles.rowHint, isDesktop && styles.rowHintDesk]}>{t('settings.appsAndSettings')}</Text>
                        </View>
                        {isDesktop ? null : <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.row, styles.nestedRow, isDesktop && styles.rowCompact]}
                      onPress={() => requestShellTab('more', 'childApps')}
                      accessibilityRole="button"
                    >
                      <View style={[styles.iconCircle, isDesktop && styles.iconCircleCompact]}>
                        <Ionicons name="apps" size={isDesktop ? 16 : 18} color={colors.brand} />
                      </View>
                      <Text style={[styles.label, isDesktop && styles.labelCompact]}>{t('settings.manageAllChildren')}</Text>
                      {isDesktop ? null : <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
                    </TouchableOpacity>
                  </CollapsibleRows>
                </>
              ) : null}
              <Row icon="swap-horizontal-outline" label={t('team.switchPlatform')} onPress={() => goPlatformOverview(nav)} />
              {isAdmin && (
                <>
                  <Row icon="people-circle" label={t('apps.members')} onPress={() => requestShellTab('more', 'members')} />
                  <Row icon="person-add" label={t('apps.addMember')} onPress={() => requestShellTab('more', 'addMember')} />
                  <Row icon="settings" label={t('apps.groupSettings')} onPress={() => requestShellTab('more', 'groupSettings')} />
                </>
              )}
              <Row icon="apps-outline" label={t('apps.moduleAccess')} onPress={() => requestShellTab('more', 'moduleAccess')} />
            </View>
          </>
        )}

        {/* Om */}
        <SectionHeader title={t('settings.about')} />
        <View style={styles.group}>
          <Row icon="document-text" label={t('more.legal')} onPress={() => requestShellTab('more', 'legal')} />
          <Row icon="shield-checkmark-outline" label={t('settings.privacyPolicy')} onPress={() => openUrl(privacyUrl)} />
          <Row icon="mail-outline" label={t('settings.contactSupport')} onPress={() => openUrl(supportUrl)} />
          <Row icon="help-circle" label={t('help.title')} onPress={() => requestShellTab('more', 'help')} />
          <Row
            icon="information-circle"
            label={t('settings.version', { version: appVersion })}
            detail={t('settings.versionHint')}
            onPress={openUpdates}
          />
        </View>

        {isSuperAdmin && (
          <>
            <SectionHeader title={t('settings.subscription')} />
            <View style={styles.group}>
              <Row icon="card" label={t('group.subscription')} onPress={() => requestShellTab('more', 'subscription')} />
            </View>
          </>
        )}

        {/* Logg ut */}
        <View style={[styles.group, { marginTop: 12 }]}>
          <Row icon="log-out" label={t('more.logout')} danger onPress={() => signOut(auth)} />
          <Row
            icon="trash-outline"
            label={t('settings.deleteAccount')}
            danger
            onPress={() => {
              setDeleteOpen((open) => !open);
              setDeleteError('');
            }}
          />
          {deleteOpen ? (
            <View style={styles.deleteBox}>
              <Text style={styles.deleteLead}>{t('settings.deleteAccountLead')}</Text>
              <Text style={styles.deleteLabel}>{t('settings.deleteAccountConfirm')}</Text>
              <TextInput
                value={deleteText}
                onChangeText={setDeleteText}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!deleteBusy}
                placeholder="DELETE"
                placeholderTextColor={colors.placeholder}
                style={styles.deleteInput}
                accessibilityLabel={t('settings.deleteAccountConfirm')}
              />
              {deleteError ? <Text style={styles.deleteError}>{deleteError}</Text> : null}
              <TouchableOpacity
                onPress={confirmDeleteAccount}
                disabled={!canDelete}
                style={[styles.deleteBtn, !canDelete && styles.deleteBtnOff]}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canDelete }}
              >
                <Text style={styles.deleteBtnTxt}>
                  {deleteBusy ? t('common.loading') : t('settings.deleteAccountAction')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
      <FriendQrModal visible={qrOpen} onClose={() => setQrOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  bodyDesktop: { paddingHorizontal: 12, paddingTop: 4, maxWidth: 680 },
  screenTitle: { fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 12 },
  screenTitleDesktop: { fontSize: 22, marginBottom: 12 },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.card, borderRadius: 0, padding: 16,
    borderWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
    marginBottom: 0,
  },
  profileCardDesktop: {
    borderRadius: 0, padding: 10, marginBottom: 0, gap: 10,
  },
  profileGroup: { marginBottom: 8 },
  profileName: { fontSize: 18, fontWeight: '900', color: colors.ink },
  profileNameDesk: { fontSize: 14, fontWeight: '600' },
  profileSub: { fontSize: 13, color: colors.muted, marginTop: 2, fontWeight: '600' },
  profileSubDesk: { fontSize: 12, fontWeight: '400' },

  sectionTitle: {
    fontSize: 13, fontWeight: '800', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 20, marginBottom: 8, marginLeft: 4,
  },
  sectionTitleDesk: {
    fontSize: 11, fontWeight: '600', letterSpacing: 0.42, marginTop: 14, marginBottom: 6,
  },

  group: {
    backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.line,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  rowCompact: {
    paddingVertical: 10, paddingHorizontal: 12,
  },

  iconCircle: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center',
  },
  iconCircleCompact: {
    width: 28, height: 28, borderRadius: 6,
  },
  iconDanger: { backgroundColor: '#fee2e2' },

  label: { flex: 1, fontWeight: '700', fontSize: 15, color: colors.ink },
  labelCompact: { fontSize: 13, fontWeight: '500' },
  rowHint: { fontSize: 12, fontWeight: '600', color: colors.muted, marginTop: 2 },
  rowHintDesk: { fontSize: 11, fontWeight: '400' },
  detail: { fontSize: 13, fontWeight: '600', color: colors.muted, maxWidth: '46%' },
  hint: {
    fontSize: 13, fontWeight: '600', color: colors.muted,
    marginBottom: 8, marginLeft: 4, marginTop: -4,
  },
  nestedBlock: {
    backgroundColor: colors.sunken || '#f8fafc',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  nestedHint: {
    fontSize: 12, fontWeight: '600', color: colors.muted,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
    lineHeight: 17,
  },
  nestedRow: {
    paddingLeft: 22,
    backgroundColor: 'transparent',
  },
  deleteBox: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  deleteLead: { fontSize: 13, lineHeight: 18, color: colors.muted, fontWeight: '600' },
  deleteLabel: { fontSize: 12, fontWeight: '700', color: colors.ink },
  deleteInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  deleteError: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  deleteBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.danger,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  deleteBtnOff: { opacity: 0.45 },
  deleteBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
