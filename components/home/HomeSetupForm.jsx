import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, Platform, Alert, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  CUSTOM_BANNER_ID,
  HOME_BANNER_GROUPS,
  bannersInGroup,
  getHomeBanner,
} from '../../src/homeBanners';
import { MAX_PARENT_BOTTOM_SHORTCUTS } from '../../src/parentDashboardThemes';
import { normalizeBottomShortcutIds } from '../../src/utils/parentDashboardTheme';
import { parentAppShortLabel } from '../../src/utils/parentHomeShortcuts';
import { preparePersistedBannerUri } from '../../src/utils/homeBannerAsset';
import { homeSetupFormSteps, homeSetupSteps } from '../../src/homeSetupWizard';
import { colors as themeColors } from '../../src/theme';
import { useColors } from '../../src/context/ThemeContext';

export const BUILTIN_BOTTOM_CHOICES = [
  { id: 'home', label: 'Hjem', icon: 'home' },
  { id: 'projects', label: 'Prosjekt', icon: 'business' },
  { id: 'plan', label: 'Kalender', icon: 'calendar' },
  { id: 'mail', label: 'E-post', icon: 'mail' },
  { id: 'stars', label: 'Oppgaver', icon: 'checkmark-circle' },
];

function Stepper({ steps, index, onStep }) {
  const colors = useColors();
  return (
    <View style={styles.stepper} accessibilityRole="tablist" testID="home-setup-stepper">
      {steps.map((item, idx) => {
        const on = idx === index;
        const done = idx < index;
        const active = on || done;
        return (
          <React.Fragment key={item.id}>
            {idx > 0 ? (
              <View style={[
                styles.stepLine,
                { backgroundColor: done ? colors.brand : colors.line },
              ]}
              />
            ) : null}
            <TouchableOpacity
              style={styles.stepItem}
              onPress={() => onStep(idx)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Steg ${idx + 1} av ${steps.length}: ${item.label}`}
              testID={`home-setup-step-${item.id}`}
            >
              <View style={[
                styles.stepNum,
                {
                  backgroundColor: active ? colors.brand : colors.card,
                  borderColor: active ? colors.brand : colors.line,
                },
              ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                ) : (
                  <Text style={[styles.stepNumTxt, { color: on ? '#fff' : colors.muted }]}>{idx + 1}</Text>
                )}
              </View>
              <Text style={[styles.stepLabel, { color: on ? colors.ink : colors.muted }]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          </React.Fragment>
        );
      })}
    </View>
  );
}

function NavRow({
  isFirst,
  isLastForm,
  onBack,
  onNext,
  onFinish,
  nextLabel,
  finishLabel,
}) {
  const colors = useColors();
  return (
    <View style={styles.navRow}>
      {isFirst ? (
        <View style={{ flex: 1 }} />
      ) : (
        <TouchableOpacity
          style={[
            styles.secondaryBtn,
            { backgroundColor: colors.card, borderColor: colors.line },
          ]}
          onPress={onBack}
          accessibilityRole="button"
          testID="home-setup-back"
        >
          <Ionicons name="arrow-back" size={18} color={colors.ink} />
          <Text style={[styles.secondaryBtnTxt, { color: colors.ink }]}>Forrige</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.primaryBtn, styles.primaryBtnFlex, { backgroundColor: colors.brand }]}
        onPress={isLastForm ? onFinish : onNext}
        accessibilityRole="button"
        testID={isLastForm ? 'home-setup-finish' : 'home-setup-next'}
      >
        <Text style={styles.primaryBtnTxt}>
          {isLastForm ? (finishLabel || 'Til hjem') : (nextLabel || 'Neste')}
        </Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

export default function HomeSetupForm({
  bannerId,
  customBannerUri,
  bottomIds,
  bottomChoices = BUILTIN_BOTTOM_CHOICES,
  canEdit = true,
  suggestedGroup,
  onSelectBanner,
  onUploadBanner,
  onToggleBottom,
  onToggleBottomNav,
  bottomNavEnabled = true,
  role = 'parent',
  showDock = true,
  showIntro = true,
  onComplete,
}) {
  const colors = useColors();
  const steps = useMemo(() => homeSetupSteps({ showDock }), [showDock]);
  const formSteps = useMemo(() => homeSetupFormSteps(steps), [steps]);
  const [stepIndex, setStepIndex] = useState(0);
  const anchorRef = useRef(null);
  const step = formSteps[stepIndex] || formSteps[0];
  const isFirst = stepIndex === 0;
  const isLastForm = stepIndex === formSteps.length - 1;
  const initialGroup = suggestedGroup
    || getHomeBanner(bannerId)?.group
    || (bannerId === CUSTOM_BANNER_ID ? 'eget' : 'natur');
  const [groupId, setGroupId] = useState(initialGroup);
  const banners = useMemo(() => bannersInGroup(groupId), [groupId]);
  const selected = bannerId === CUSTOM_BANNER_ID
    ? { id: CUSTOM_BANNER_ID }
    : getHomeBanner(bannerId);

  useEffect(() => {
    const node = anchorRef.current;
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [stepIndex]);

  const go = (idx) => {
    const next = Math.max(0, Math.min(formSteps.length - 1, idx));
    setStepIndex(next);
  };

  const goStepper = (idx) => {
    const target = steps[idx];
    if (!target) return;
    if (target.opensHomeEdit) {
      onComplete?.();
      return;
    }
    const formIdx = formSteps.findIndex((s) => s.id === target.id);
    if (formIdx >= 0) go(formIdx);
  };

  const finishToHome = () => {
    onComplete?.();
  };

  const pickOwn = async () => {
    if (!canEdit) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status && perm.status !== 'granted' && perm.status !== 'limited') {
        Alert.alert('Bilder', 'ProTop trenger tilgang til bildene dine for å laste opp et bakgrunnsbilde.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
        allowsEditing: Platform.OS !== 'web',
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      const persisted = await preparePersistedBannerUri({
        uri: asset?.uri,
        base64: asset?.base64,
        mimeType: asset?.mimeType,
        width: asset?.width,
        height: asset?.height,
      });
      if (persisted) onUploadBanner?.(persisted);
    } catch {
      Alert.alert('Kunne ikke åpne bilder', 'Prøv igjen, eller velg et av de ferdige bildene.');
    }
  };

  const imageStep = (
    <>
      <Text style={[styles.section, { color: colors.muted }]}>Velg et ferdig bilde</Text>
      <View style={styles.chipRow}>
        {HOME_BANNER_GROUPS.map((g) => {
          const on = g.id === groupId;
          return (
            <TouchableOpacity
              key={g.id}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? colors.brandSoft : colors.card,
                  borderColor: on ? colors.brand : colors.line,
                },
              ]}
              onPress={() => setGroupId(g.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              testID={`home-banner-group-${g.id}`}
            >
              <Text style={[styles.chipTxt, { color: on ? colors.brand : colors.ink }]}>{g.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[styles.groupHint, { color: colors.muted }]}>
        {HOME_BANNER_GROUPS.find((g) => g.id === groupId)?.hint}
      </Text>

      {groupId === 'eget' ? (
        <View>
          {customBannerUri ? (
            <TouchableOpacity
              style={[
                styles.bannerCard,
                { backgroundColor: colors.card },
                bannerId === CUSTOM_BANNER_ID && { borderColor: colors.brand },
              ]}
              onPress={() => canEdit && onSelectBanner?.(CUSTOM_BANNER_ID, customBannerUri)}
            >
              <View style={styles.bannerImgWrap}>
                <Image source={{ uri: customBannerUri }} style={styles.bannerImg} resizeMode="cover" />
              </View>
              <Text style={[styles.bannerLabel, { color: colors.ink }]}>Ditt bilde</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.upload, { borderColor: colors.line, backgroundColor: colors.sunken }]}
            onPress={pickOwn}
            disabled={!canEdit}
            accessibilityRole="button"
            testID="home-banner-upload"
          >
            <Ionicons name="image-outline" size={28} color={colors.muted} />
            <Text style={[styles.uploadTxt, { color: colors.muted }]}>Last opp eget bilde</Text>
          </TouchableOpacity>
        </View>
      ) : banners.length ? (
        <View style={styles.grid}>
          {banners.map((b) => {
            const on = selected?.id === b.id;
            return (
              <TouchableOpacity
                key={b.id}
                style={[
                  styles.bannerCard,
                  { backgroundColor: colors.card },
                  on && { borderColor: colors.brand },
                ]}
                onPress={() => canEdit && onSelectBanner?.(b.id, null)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                testID={`home-banner-${b.id}`}
              >
                <View style={styles.bannerImgWrap}>
                  <Image
                    source={b.thumb || b.source}
                    style={[
                      styles.bannerImg,
                      b.cutout && Platform.OS === 'web' ? styles.bannerImgContain : null,
                    ]}
                    resizeMode={b.cutout ? 'contain' : 'cover'}
                  />
                </View>
                {on ? (
                  <View style={styles.check}>
                    <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
                  </View>
                ) : null}
                <Text style={[styles.bannerLabel, { color: colors.ink }]} numberOfLines={1}>{b.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={[styles.emptyGroup, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Ionicons name="image-outline" size={28} color={colors.muted} />
          <Text style={[styles.emptyTxt, { color: colors.muted }]}>Flere bilder kommer i denne gruppen.</Text>
        </View>
      )}

      {groupId !== 'eget' ? (
        <TouchableOpacity
          style={[styles.upload, { marginTop: 12, borderColor: colors.line, backgroundColor: colors.sunken }]}
          onPress={() => {
            setGroupId('eget');
            pickOwn();
          }}
          disabled={!canEdit}
          accessibilityRole="button"
        >
          <Ionicons name="cloud-upload-outline" size={20} color={colors.muted} />
          <Text style={[styles.uploadTxt, { color: colors.muted }]}>Eller last opp eget bilde</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );

  const dockStep = (
    <>
      <View style={styles.dockToggleRow}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={[styles.dockToggleTitle, { color: colors.ink }]}>Vis bunnmeny</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            Skru av hele menylinjen, eller behold den og velg inntil {MAX_PARENT_BOTTOM_SHORTCUTS} knapper. Samme bunnlinje vises i alle familymoduler.
          </Text>
        </View>
        <Switch
          value={bottomNavEnabled !== false}
          onValueChange={(v) => canEdit && onToggleBottomNav?.(v)}
          disabled={!canEdit || !onToggleBottomNav}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={bottomNavEnabled !== false ? themeColors.brand : '#f9fafb'}
          testID="home-bottom-nav-toggle"
        />
      </View>
      {bottomNavEnabled !== false ? (
        <>
          <Text style={[styles.hint, { color: colors.muted }]}>
            Velg inntil {MAX_PARENT_BOTTOM_SHORTCUTS} knapper.
          </Text>
          <View style={styles.bottomWrap}>
            {bottomChoices.map((item) => {
              const on = (bottomIds || []).includes(item.id);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.bottomChip,
                    {
                      backgroundColor: on ? colors.brand : colors.card,
                      borderColor: on ? colors.brand : colors.line,
                    },
                  ]}
                  onPress={() => canEdit && onToggleBottom?.(item.id)}
                  disabled={!canEdit}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  testID={`home-bottom-${item.id}`}
                >
                  <Ionicons name={item.icon || 'apps'} size={14} color={on ? '#fff' : colors.brand} />
                  <Text style={[styles.bottomChipTxt, { color: on ? '#fff' : colors.ink }]}>
                    {parentAppShortLabel(item) || item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.countHint, { color: colors.muted }]}>
            {(bottomIds || []).length}
            {' / '}
            {MAX_PARENT_BOTTOM_SHORTCUTS}
            {' valgt'}
          </Text>
        </>
      ) : null}
    </>
  );

  let body = null;
  if (step.id === 'image') {
    body = (
      <>
        <Text style={[styles.stepEyebrow, { color: colors.muted }]}>Steg {stepIndex + 1} av {steps.length}</Text>
        <Text style={[styles.stepTitle, { color: colors.ink }]}>Velg bilde</Text>
        <Text style={[styles.stepLead, { color: colors.muted }]}>
          {isLastForm
            ? 'På telefon dekker bildet hele hjemskjermen bak widgetene. Neste åpner hjem med standard widgets — du kan endre eller hoppe over der.'
            : 'På telefon dekker bildet hele hjemskjermen bak widgetene. Velg et ferdig bilde, eller last opp ditt eget.'}
        </Text>
        {imageStep}
      </>
    );
  } else {
    body = (
      <>
        <Text style={[styles.stepEyebrow, { color: colors.muted }]}>Steg {stepIndex + 1} av {steps.length}</Text>
        <Text style={[styles.stepTitle, { color: colors.ink }]}>Bunnmeny</Text>
        <Text style={[styles.stepLead, { color: colors.muted }]}>
          Vil du ha bunnmeny, og hva skal stå på den? Neste åpner hjem med standard widgets — du kan endre eller hoppe over der.
        </Text>
        {dockStep}
      </>
    );
  }

  const stepperIndex = Math.min(
    steps.findIndex((s) => s.id === step.id),
    steps.length - 1,
  );

  return (
    <View testID="home-setup-wizard">
      <View ref={anchorRef} collapsable={false}>
        {showIntro ? (
          <>
            <Text style={[styles.kicker, { color: colors.muted }]}>{role === 'child' ? 'Barneprofil' : 'Voksen profil'}</Text>
            <Text style={[styles.title, { color: colors.ink }]}>Tilpass hjem</Text>
          </>
        ) : null}
        <Text style={[styles.lead, { color: colors.muted, marginTop: showIntro ? 8 : 0 }]}>
          {steps.length} korte steg: {steps.map((s) => s.label.toLowerCase()).join(', ')}.
          {' '}Du kan gå tilbake når som helst. Siste steg åpner hjem i redigeringsmodus.
        </Text>
      </View>

      <Stepper steps={steps} index={stepperIndex < 0 ? 0 : stepperIndex} onStep={goStepper} />

      <View testID={`home-setup-panel-${step.id}`}>
        {body}
      </View>

      <NavRow
        isFirst={isFirst}
        isLastForm={isLastForm}
        onBack={() => go(stepIndex - 1)}
        onNext={() => go(stepIndex + 1)}
        onFinish={finishToHome}
        finishLabel="Til hjem"
      />
    </View>
  );
}

export function toggleBottomId(ids, id, max = MAX_PARENT_BOTTOM_SHORTCUTS) {
  const prev = Array.isArray(ids) ? ids : [];
  let next;
  if (prev.includes(id)) next = prev.filter((x) => x !== id);
  else if (prev.length >= max) next = prev;
  else next = [...prev, id];
  return normalizeBottomShortcutIds(next, { max });
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: 12, fontWeight: '600', letterSpacing: 0.4, marginTop: 4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 22, fontWeight: '700', marginTop: 4,
  },
  lead: {
    fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 12,
  },
  stepper: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 18,
  },
  stepItem: { alignItems: 'center', gap: 4, flex: 1, minWidth: 0 },
  stepNum: {
    width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  stepNumTxt: { fontSize: 12, fontWeight: '700' },
  stepLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  stepLine: {
    width: 10, height: 2, marginBottom: 16, flexShrink: 0,
  },
  stepEyebrow: {
    fontSize: 13, fontWeight: '600', marginBottom: 4,
  },
  stepTitle: {
    fontSize: 20, fontWeight: '700', marginBottom: 6,
  },
  stepLead: {
    fontSize: 15, lineHeight: 22, marginBottom: 14,
  },
  section: {
    fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 8, marginBottom: 6,
  },
  hint: { fontSize: 13, marginBottom: 10, lineHeight: 18 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: {
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipTxt: { fontSize: 13, fontWeight: '600' },
  groupHint: { fontSize: 12, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bannerCard: {
    width: '47%',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  bannerImgWrap: {
    width: '100%',
    aspectRatio: 941 / 1672,
    backgroundColor: '#1a2430',
    overflow: 'hidden',
  },
  bannerImg: {
    width: '100%',
    height: '100%',
    ...(Platform.OS === 'web' ? { objectFit: 'cover' } : null),
  },
  bannerImgContain: Platform.OS === 'web' ? { objectFit: 'contain' } : {},
  bannerLabel: {
    fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 8,
  },
  check: { position: 'absolute', right: 8, top: 8 },
  upload: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 8,
  },
  uploadTxt: { fontSize: 14, fontWeight: '600' },
  emptyGroup: {
    alignItems: 'center', gap: 8, paddingVertical: 24,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyTxt: { fontSize: 13 },
  bottomWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bottomChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bottomChipTxt: { fontSize: 13, fontWeight: '600' },
  countHint: { fontSize: 12, marginTop: 8 },
  dockToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dockToggleTitle: {
    fontSize: 15, fontWeight: '700', marginBottom: 4,
  },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  primaryBtnFlex: { flex: 1 },
  primaryBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 15, paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryBtnTxt: { fontSize: 16, fontWeight: '600' },
});
