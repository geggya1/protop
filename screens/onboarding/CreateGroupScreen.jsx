import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Alert,
  Image, ScrollView, Animated, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../firebase';
import { useI18n } from '../../src/i18n';
import { useApp } from '../../src/context/AppContext';
import { colors, radius } from '../../src/theme';
import { GROUP_TYPES } from '../../src/data/avatars';
import { createGroup, updateGroup } from '../../src/utils/groups';
import { openPlatformHome } from '../../src/utils/platformNav';
import { isSocialPlatformType } from '../../src/utils/groupTypes';
import { setupNewPlatform } from '../../src/platform/platformCore';
import { fetchCompanyCpv } from '../../src/anbud/doffinClient';
import { canAccessAllPlatforms } from '../../src/utils/platformAccess';
import { pickImage, uploadImage, alertPhotoError } from '../../src/utils/media';
import Wizard from '../../components/Wizard';
import BrandLogo from '../../components/BrandLogo';
import AvatarPicker, { AvatarBubble } from '../../components/AvatarPicker';
import WebImageCropperModal from '../../components/WebImageCropperModal';
import PendingFamilyInvitePrompt from '../../components/PendingFamilyInvitePrompt';
import PendingAddFriendBanner from '../../components/PendingAddFriendBanner';

const TYPE_META = {
  family: { icon: 'home-outline', tint: '#2563eb', soft: '#dbeafe' },
  friends: { icon: 'happy-outline', tint: '#0ea5e9', soft: '#e0f2fe' },
  class: { icon: 'school-outline', tint: '#0891b2', soft: '#cffafe' },
  classroom: { icon: 'school-outline', tint: '#4338ca', soft: '#e0e7ff' },
  congregation: { icon: 'business-outline', tint: '#64748b', soft: '#e2e8f0' },
  club: { icon: 'ribbon-outline', tint: '#d97706', soft: '#fef3c7' },
  group: { icon: 'people-outline', tint: '#334155', soft: '#e2e8f0' },
  daycare: { icon: 'balloon-outline', tint: '#e11d48', soft: '#ffe4e6' },
  team: { icon: 'football-outline', tint: '#16a34a', soft: '#dcfce7' },
  company: { icon: 'business-outline', tint: '#1099F4', soft: '#E5F6FE' },
};

const displayFont = Platform.OS === 'web' ? 'Fraunces, Georgia, serif' : undefined;
const bodyFont = Platform.OS === 'web' ? 'Nunito, sans-serif' : undefined;

function GroupTypePicker({ type, onSelect, onBack, onNext, t, types }) {
  const insets = useSafeAreaInsets();
  const createTypes = types || GROUP_TYPES.filter((id) => id !== 'team' && id !== 'class' && id !== 'classroom');
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start();
  }, [fade, rise]);

  return (
    <View style={tp.page}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#e8eef6' }} />
      <ScrollView
        style={tp.scroll}
        contentContainerStyle={[tp.body, { paddingBottom: Math.max(32, insets.bottom + 24), flexGrow: 1 }]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
      >
        <TouchableOpacity onPress={onBack} style={tp.backBtn} accessibilityRole="button">
          <Text style={tp.backTxt}>‹ {t('common.back')}</Text>
        </TouchableOpacity>

        <Animated.View style={{ opacity: fade, transform: [{ translateY: rise }] }}>
          <BrandLogo variant="full" height={52} maxWidth={280} style={tp.brandLogo} />
          <Text style={tp.title}>{t('group.type')}</Text>
          <Text style={tp.lead}>{t('group.typeHint')}</Text>

          <View style={tp.list}>
            {createTypes.map((id) => {
              const meta = TYPE_META[id] || TYPE_META.group;
              const active = type === id;
              const hintKey = `group.${id}Hint`;
              const hint = t(hintKey);
              const hasHint = hint && hint !== hintKey;
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => onSelect(id)}
                  style={[tp.option, active && tp.optionOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  activeOpacity={0.88}
                >
                  <View style={[tp.iconWrap, { backgroundColor: active ? 'rgba(255,255,255,0.22)' : meta.soft }]}>
                    <Ionicons name={meta.icon} size={22} color={active ? '#fff' : meta.tint} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[tp.optionTitle, active && tp.optionTitleOn]}>{t(`group.${id}`)}</Text>
                    {hasHint ? (
                      <Text style={[tp.optionHint, active && tp.optionHintOn]} numberOfLines={2}>
                        {hint}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[tp.check, active && tp.checkOn]}>
                    {active ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={tp.cta}
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel={t('group.continue')}
            activeOpacity={0.88}
          >
            <Text style={tp.ctaTxt}>{t('group.continue')}</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

export default function CreateGroupScreen({ navigation, route }) {
  const { t, lang } = useI18n();
  const { selectFamily, userProfile } = useApp();
  const allPlatforms = canAccessAllPlatforms(auth.currentUser);
  const lockedType = route?.params?.type === 'organization' || !allPlatforms ? 'organization' : 'organization';
  const [step, setStep] = useState('name');
  const [type, setType] = useState(lockedType);
  const [name, setName] = useState('');
  const [orgnr, setOrgnr] = useState('');
  const [avatarId, setAvatarId] = useState('home');
  const [photoURL, setPhotoURL] = useState('');
  const [saving, setSaving] = useState(false);
  const [cropVisible, setCropVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState(null);

  const save = async () => {
    if (!name.trim() || !auth.currentUser || saving) return;
    setSaving(true);
    try {
      const uid = auth.currentUser.uid;
      const id = await createGroup({
        name: name.trim(),
        type: 'organization',
        language: lang,
        user: auth.currentUser,
        profile: userProfile,
      });
      const patch = {};
      if (photoURL || avatarId) {
        patch.photoURL = photoURL || null;
        patch.avatarId = avatarId;
      }
      if ((allPlatforms ? type : 'family') === 'company') {
        const digits = orgnr.replace(/\D/g, '').slice(0, 9);
        patch.orgnr = digits;
        try {
          const data = await fetchCompanyCpv(digits);
          patch.name = data.company?.name || name.trim();
          patch.orgnr = data.company?.orgnr || digits;
          patch.cpvCodes = data.cpvCodes || [];
          patch.cpvSource = patch.cpvCodes.length ? 'doffin' : '';
        } catch {
          patch.cpvCodes = [];
          patch.cpvSource = '';
        }
      }
      if (Object.keys(patch).length) {
        await updateGroup(id, patch).catch(() => {});
      }
      await selectFamily(id, {
        name: name.trim(),
        type: 'organization',
        ownerUid: uid,
        adminUids: [uid],
        members: [uid],
        photoURL: photoURL || null,
        avatarId,
      });
      if (isSocialPlatformType(allPlatforms ? type : 'family')) {
        await setupNewPlatform(
          id,
          allPlatforms ? type : 'family',
          uid,
          userProfile?.displayName || userProfile?.name || auth.currentUser.displayName,
        ).catch(() => {});
      }
      openPlatformHome(navigation, 'organization');
    } catch (err) {
      setSaving(false);
      Alert.alert(t('common.error'));
    }
  };

  const photo = async (camera) => {
    try {
      const picked = await pickImage({ camera });
      if (!picked?.uri || !auth.currentUser) return;
      if (Platform.OS === 'web') {
        setSelectedImageUri(picked.uri);
        setCropVisible(true);
        return;
      }
      setPhotoURL(picked.uri);
      const url = await uploadImage(`groups/${auth.currentUser.uid}-${Date.now()}.jpg`, picked);
      setPhotoURL(url);
    } catch (e) {
      alertPhotoError(e, t);
    }
  };

  if (step === 'type' && allPlatforms) {
    // Idrettslag og klasserom opprettes via egen flyt (TeamCreate / ClassroomCreate), ikke her.
    return (
      <GroupTypePicker
        type={type}
        onSelect={setType}
        onBack={() => navigation.goBack()}
        onNext={() => setStep('name')}
        t={t}
      />
    );
  }

  return (
    <>
      <Wizard
        title={t('group.name')}
        onBack={() => navigation.goBack()}
        onNext={save}
        nextDisabled={!name.trim() || saving || (type === 'company' && orgnr.replace(/\D/g, '').length !== 9)}
        nextLabel={saving ? t('common.loading') : t('group.create')}
      >
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t(`group.${type}`)}
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={save}
        />
        {type === 'company' ? (
          <TextInput
            value={orgnr}
            onChangeText={setOrgnr}
            placeholder="Organisasjonsnummer"
            placeholderTextColor={colors.placeholder}
            keyboardType="number-pad"
            style={styles.input}
          />
        ) : null}
        <Text style={styles.picLabel}>{t('group.picture')} ({t('common.optional')})</Text>
        <View style={{ alignItems: 'center', marginVertical: 4 }}>
          <AvatarBubble group avatarId={avatarId} photoURL={photoURL} name={name} size={72} />
        </View>
        <View style={styles.picRow}>
          <TouchableOpacity style={styles.chip} onPress={() => photo(true)}>
            <Text style={styles.chipTxt}>{t('profile.takePhoto')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip} onPress={() => photo(false)}>
            <Text style={styles.chipTxt}>{t('profile.upload')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.picLabel}>{t('profile.cartoons')}</Text>
        <AvatarPicker group value={avatarId} onChange={(id) => { setAvatarId(id); setPhotoURL(''); }} />
      </Wizard>

      <WebImageCropperModal
        visible={cropVisible}
        imageUri={selectedImageUri}
        aspect={1}
        title="Crop"
        onCancel={() => { setCropVisible(false); setSelectedImageUri(null); }}
        onConfirm={async (blob) => {
          try {
            const url = await uploadImage(`groups/${auth.currentUser.uid}-${Date.now()}.jpg`, { blob });
            setPhotoURL(url);
          } catch (e) {
            alertPhotoError(e, t);
          } finally {
            setCropVisible(false);
            setSelectedImageUri(null);
          }
        }}
      />
    </>
  );
}

export function GetStartedScreen({ navigation }) {
  const { t } = useI18n();
  const {
    families, selectFamily, isParent, familiesLoadError, clearFamiliesLoadError, familyId,
  } = useApp();

  // Legacy route: new solo users go through HomeSetupOnboarding (personal shell).
  useEffect(() => {
    const live = (families || []).filter((f) => f.deleted !== true && f.archived !== true);
    if (live.length === 0 && isParent) {
      navigation.replace('HomeSetupOnboarding');
    }
  }, [families, isParent, navigation]);
  const [reloading, setReloading] = useState(false);
  const [reloadMsg, setReloadMsg] = useState(null);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const compact = winH < 720;
  const heroH = compact
    ? Math.min(200, Math.max(140, winH * 0.22))
    : Math.min(360, Math.max(240, winH * 0.34));
  const live = (families || []).filter((f) => f.deleted !== true && f.archived !== true);

  // New sign-ups land here to create a family — never keep a blocking load-error wall.
  useEffect(() => {
    if (live.length === 0 && familiesLoadError) {
      clearFamiliesLoadError?.();
    }
  }, [live.length, familiesLoadError, clearFamiliesLoadError]);

  const fadeHero = useRef(new Animated.Value(0)).current;
  const fadeCopy = useRef(new Animated.Value(0)).current;
  const riseCopy = useRef(new Animated.Value(14)).current;
  const fadeRest = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeHero, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(fadeCopy, { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.timing(riseCopy, { toValue: 0, duration: 480, useNativeDriver: true }),
      ]),
      Animated.timing(fadeRest, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]).start();
  }, [fadeHero, fadeCopy, riseCopy, fadeRest]);

  const openGroup = async (id) => {
    const group = live.find((f) => f.id === id);
    await selectFamily(id);
    if (group) {
      openPlatformHome(navigation, group);
      return;
    }
    navigation.replace('GroupHub', { familyId: id });
  };

  return (
    <View style={gs.page}>
      <PendingFamilyInvitePrompt />
      <ScrollView
        style={gs.scroll}
        contentContainerStyle={[gs.scrollBody, { paddingBottom: Math.max(36, insets.bottom + 20), flexGrow: 1 }]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <View style={gs.heroComposition}>
          <Animated.View style={[gs.heroBleed, { height: heroH, opacity: fadeHero }]}>
            <View style={gs.heroAtmosphere} />
            <Image source={HERO} style={gs.heroImg} resizeMode="cover" accessibilityLabel="ProTop" />
            <View style={gs.heroFade} />
          </Animated.View>

          <Animated.View
            style={[gs.heroCopy, { opacity: fadeCopy, transform: [{ translateY: riseCopy }] }]}
          >
            <BrandLogo
              variant="full"
              height={compact ? 48 : 64}
              maxWidth={compact ? 280 : 360}
              style={gs.brandLogo}
            />
            <Text style={[gs.headline, compact && gs.headlineCompact]}>
              {t('start.title')}
            </Text>
            <Text style={gs.lead}>
              {t('start.subtitle')}
            </Text>
            <PendingAddFriendBanner />
            {isParent ? (
              <TouchableOpacity
                style={gs.cta}
                onPress={() => {
                  clearFamiliesLoadError?.();
                  navigation.navigate('CreateGroup');
                }}
                accessibilityRole="button"
                accessibilityLabel={t('start.startGroup')}
                activeOpacity={0.88}
              >
                <Text style={gs.ctaTxt}>{t('start.startGroup')}</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            ) : null}
            {/* Returning users only: soft retry if a known family failed to load. Never block create. */}
            {familiesLoadError && isParent ? (
              <TouchableOpacity
                style={[gs.secondaryCta, { marginTop: 12 }, reloading && { opacity: 0.7 }]}
                disabled={reloading}
                onPress={async () => {
                  setReloading(true);
                  setReloadMsg(null);
                  try {
                    const { listMyFamilies } = await import('../../src/utils/joinRequests');
                    const list = await listMyFamilies();
                    if (list?.length) {
                      const id = familyId || list[0].id;
                      await selectFamily(id);
                      clearFamiliesLoadError?.();
                      openPlatformHome(navigation, list[0]);
                      return;
                    }
                    clearFamiliesLoadError?.();
                    setReloadMsg(null);
                  } catch (e) {
                    setReloadMsg('Kunne ikke hente en eksisterende familie. Du kan starte en ny gruppe over.');
                  } finally {
                    setReloading(false);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Hent eksisterende familie"
                activeOpacity={0.88}
              >
                <Text style={gs.secondaryCtaTxt}>
                  {reloading ? 'Henter…' : 'Har du allerede en familie? Hent på nytt'}
                </Text>
              </TouchableOpacity>
            ) : null}
            {reloadMsg ? <Text style={[gs.lead, { color: colors.muted, marginTop: 8 }]}>{reloadMsg}</Text> : null}
          </Animated.View>
        </View>

        <Animated.View style={{ opacity: fadeRest }}>
          <View style={gs.section}>
            <Text style={gs.sectionTitle}>{t('start.exciteTitle')}</Text>
            <Text style={gs.sectionLead}>{t('start.exciteLead')}</Text>
            {[
              { icon: 'calendar-outline', title: 'start.b1t', body: 'start.b1d' },
              { icon: 'star-outline', title: 'start.b2t', body: 'start.b2d' },
              { icon: 'people-outline', title: 'start.b3t', body: 'start.b3d' },
            ].map((b) => (
              <View key={b.title} style={gs.benefitRow}>
                <View style={gs.benefitIcon}>
                  <Ionicons name={b.icon} size={22} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={gs.benefitTitle}>{t(b.title)}</Text>
                  <Text style={gs.benefitBody}>{t(b.body)}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={gs.section}>
            <Text style={gs.sectionTitle}>{t('start.yourGroups')}</Text>
            <Text style={gs.sectionLead}>{t('start.groupsLead')}</Text>
            {live.length === 0 ? (
              <Text style={gs.empty}>{t('start.empty')}</Text>
            ) : (
              live.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={gs.row}
                  onPress={() => openGroup(f.id)}
                  accessibilityRole="button"
                  activeOpacity={0.85}
                >
                  <AvatarBubble group avatarId={f.avatarId} photoURL={f.photoURL} name={f.name} size={52} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={gs.name} numberOfLines={1}>{f.name}</Text>
                    <Text style={gs.sub}>{t(`group.${f.type || 'family'}`)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={colors.muted} />
                </TouchableOpacity>
              ))
            )}
            {isParent && live.length > 0 ? (
              <TouchableOpacity
                style={gs.secondaryCta}
                onPress={() => navigation.navigate('CreateGroup')}
                accessibilityRole="button"
              >
                <Text style={gs.secondaryCtaTxt}>{t('start.startGroup')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const HERO = require('../../assets/hero-family.png');

const tp = StyleSheet.create({
  page: { flex: 1, minHeight: 0, height: '100%', backgroundColor: '#e8eef6' },
  scroll: { flex: 1, minHeight: 0 },
  body: {
    paddingHorizontal: 24,
    paddingTop: 8,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 4 },
  backTxt: { fontFamily: bodyFont, fontWeight: '400', color: colors.brand, fontSize: 16 },
  brandLogo: {
    marginBottom: 10,
  },
  title: {
    fontFamily: displayFont,
    fontSize: 28,
    fontWeight: '400',
    color: colors.ink,
    lineHeight: 34,
    letterSpacing: -0.35,
    marginBottom: 8,
  },
  lead: {
    fontFamily: bodyFont,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '400',
    color: colors.muted,
    marginBottom: 20,
  },
  list: { gap: 10, marginBottom: 20 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  optionOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: {
    fontFamily: bodyFont,
    fontWeight: '400',
    fontSize: 16,
    color: colors.ink,
  },
  optionTitleOn: { color: '#fff' },
  optionHint: {
    fontFamily: bodyFont,
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    marginTop: 2,
  },
  optionHintOn: { color: 'rgba(255,255,255,0.88)' },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderColor: 'rgba(255,255,255,0.55)',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: 20,
    minHeight: 52,
  },
  ctaTxt: {
    fontFamily: bodyFont,
    color: '#fff',
    fontWeight: '400',
    fontSize: 17,
  },
});

const gs = StyleSheet.create({
  page: { flex: 1, minHeight: 0, height: '100%', backgroundColor: '#e8eef6' },
  scroll: { flex: 1, minHeight: 0 },
  scrollBody: {},
  heroComposition: { backgroundColor: '#e8eef6' },
  heroBleed: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#d7e6f8',
  },
  heroAtmosphere: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#c5daf3',
  },
  heroImg: { width: '100%', height: '100%' },
  heroFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    ...(Platform.OS === 'web'
      ? { backgroundImage: 'linear-gradient(to bottom, rgba(232,238,246,0), #e8eef6)' }
      : { backgroundColor: 'rgba(232,238,246,0.4)' }),
  },
  heroCopy: {
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 20,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  brandLogo: {
    marginBottom: 10,
  },
  headline: {
    fontFamily: displayFont,
    fontSize: 28,
    fontWeight: '400',
    color: colors.ink,
    lineHeight: 34,
    letterSpacing: -0.35,
    marginBottom: 8,
  },
  headlineCompact: { fontSize: 22, lineHeight: 28, marginBottom: 6 },
  lead: {
    fontFamily: bodyFont,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    color: colors.muted,
    marginBottom: 18,
    maxWidth: 420,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: 20,
    minHeight: 52,
  },
  ctaTxt: {
    fontFamily: bodyFont,
    color: '#fff',
    fontWeight: '400',
    fontSize: 17,
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 12,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    gap: 14,
  },
  sectionTitle: {
    fontFamily: displayFont,
    fontSize: 22,
    fontWeight: '400',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  sectionLead: {
    fontFamily: bodyFont,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: colors.muted,
    marginTop: -6,
    marginBottom: 4,
  },
  benefitRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: {
    fontFamily: bodyFont,
    fontWeight: '400',
    fontSize: 16,
    color: colors.ink,
    marginBottom: 2,
  },
  benefitBody: {
    fontFamily: bodyFont,
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
  },
  empty: {
    fontFamily: bodyFont,
    fontWeight: '400',
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  name: {
    fontFamily: bodyFont,
    fontWeight: '400',
    fontSize: 17,
    color: colors.ink,
  },
  sub: {
    fontFamily: bodyFont,
    color: colors.muted,
    fontWeight: '400',
    fontSize: 13,
    marginTop: 2,
  },
  secondaryCta: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  secondaryCtaTxt: {
    fontFamily: bodyFont,
    fontWeight: '400',
    fontSize: 15,
    color: colors.brand,
  },
});

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    padding: 16, fontSize: 16, fontWeight: '400',
  },
  picLabel: { fontWeight: '400', color: colors.muted, fontSize: 13, marginTop: 4 },
  picRow: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, backgroundColor: colors.brandSoft, padding: 12, borderRadius: 14, alignItems: 'center' },
  chipTxt: { fontWeight: '400', color: colors.ink, fontSize: 14 },
});
