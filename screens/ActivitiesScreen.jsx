import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
  TextInput,
  Switch,
  Platform,
  ScrollView,
  Pressable,
  Linking,
} from 'react-native';
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline } from 'react-native-svg';
import { Screen, Mute } from '../components/ui';
import { ModulePageFrame, ModuleBgSpacer, ModuleHubIntro } from '../components/ModulePageBg';
import ShellAddButton from '../components/ShellAddButton';
import { useShellTitleRight } from '../src/hooks/useShellTitleRight';
import ConfirmActionModal from '../components/ConfirmActionModal';
import { StravaConnectButton, StravaPoweredBy, STRAVA_ATHLETE_URL } from '../components/StravaBrand';
import { desktopOverlay, desktopSheet } from '../src/desktop';
import { auth, db } from '../firebase';
import { useApp } from '../src/context/AppContext';
import { colors, space, useLayout } from '../src/theme';
import { readFamilyMembers } from '../src/utils/familyMembers';

import {
  ACTIVITY_TYPES,
  FEATURED_ACTIVITY_TYPES,
  MORE_ACTIVITY_TYPES,
  getActivityType,
  getSubcategories,
  getProgramsForType,
} from '../src/utils/activityPresets';
import {
  FITNESS_PROVIDERS,
  listenFitnessConnections,
  setFitnessConnection,
  setHealthProfile,
  providerConnectionLabel,
  connectStravaOAuth,
  syncStravaActivities,
  fetchStravaAppStatus,
  saveStravaAppConfig,
  disconnectStrava,
  enableStravaRealtime,
  getStravaRedirectUri,
  STRAVA_SETUP_STEPS,
  GARMIN_STRAVA_BRIDGE,
  APPLE_STRAVA_BRIDGE,
} from '../src/utils/activityIntegrations';
import {
  parseGpxOrTcx,
  pickGpxOrTcxFile,
  formatDistanceKm,
  formatDuration,
  formatCalories,
} from '../src/utils/gpxImport';
import {
  listenImportedWorkouts,
  saveImportedWorkout,
  deleteImportedWorkout,
  summarizeImportedHealth,
} from '../src/utils/importedWorkouts';

function MemberRow({ name, enabled, onToggle }) {
  return (
    <View style={styles.memberRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.memberName} numberOfLines={1}>{name}</Text>
      </View>
      <Switch value={enabled} onValueChange={onToggle} />
    </View>
  );
}

function TrackMiniMap({ track, color = colors.brand, height = 72 }) {
  const pts = Array.isArray(track) ? track.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon)) : [];
  if (pts.length < 2) return null;
  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const pad = 4;
  const w = 220;
  const h = height;
  const dx = Math.max(1e-9, maxLon - minLon);
  const dy = Math.max(1e-9, maxLat - minLat);
  const points = pts.map((p) => {
    const x = pad + ((p.lon - minLon) / dx) * (w - pad * 2);
    const y = pad + (1 - (p.lat - minLat) / dy) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <View style={[styles.miniMap, { height: h }]}>
      <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
        <Polyline points={points} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/**
 * Aktiviteter-hub — type → underkategori/program → opprett plan.
 * Koblinger ligger under innstillinger (tannhjul); GPX/Strava-import fungerer.
 */
export default function ActivitiesScreen({ compactHeader = false, inShell = false }) {
  const nav = useNavigation();
  const route = useRoute();
  const { isDesktop } = useLayout();
  const {
    familyId: ctxFamilyId,
    shellIntent,
    clearShellIntent,
  } = useApp();
  const routeFamilyId = route?.params?.familyId;
  const openCreateParam = route?.params?.openCreate;
  const familyId = ctxFamilyId || routeFamilyId;
  const uid = auth.currentUser?.uid || null;

  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);
  const [members, setMembers] = useState([]);
  const [connections, setConnections] = useState({});
  const [imported, setImported] = useState([]);
  const [importBusy, setImportBusy] = useState(false);
  const [stravaBusy, setStravaBusy] = useState(false);
  const [stravaStatus, setStravaStatus] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupClientId, setSetupClientId] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [weightDraft, setWeightDraft] = useState('');

  const [view, setView] = useState('hub'); // hub | type | settings
  const [browseTypeId, setBrowseTypeId] = useState(null);
  const [subcategoryId, setSubcategoryId] = useState(null);
  const [programId, setProgramId] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedType, setSelectedType] = useState('tur');
  const [customTitle, setCustomTitle] = useState('');
  const [selectedUids, setSelectedUids] = useState([]);
  const [busyCreate, setBusyCreate] = useState(false);

  const [info, setInfo] = useState({ visible: false, title: '', message: '' });
  const showInfo = useCallback((title, message) => {
    setInfo({ visible: true, title, message: String(message || '') });
  }, []);
  const hideInfo = useCallback(() => {
    setInfo((prev) => ({ ...prev, visible: false }));
  }, []);

  const webClickable = Platform.OS === 'web' ? { cursor: 'pointer' } : null;

  const loadMembers = useCallback(async () => {
    if (!familyId) return;
    const ms = await readFamilyMembers(db, familyId);
    setMembers(ms);
  }, [familyId]);

  useEffect(() => {
    let unsub = null;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        await loadMembers();
        if (!uid || !familyId) {
          if (mounted) {
            setActivities([]);
            setLoading(false);
          }
          return;
        }

        const ref = collection(db, 'families', familyId, 'activities');
        unsub = onSnapshot(
          ref,
          (snap) => {
            const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
            const filtered = all
              .filter((a) => a.deleted !== true)
              .filter((a) => {
                const uids = Array.isArray(a.participantUids) ? a.participantUids : [];
                return uids.includes(uid) || a.createdByUid === uid;
              })
              .sort((a, b) => {
                const ta = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
                const tb = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
                return tb - ta;
              });
            if (mounted) {
              setActivities(filtered);
              setLoading(false);
            }
          },
          () => {
            if (mounted) {
              setActivities([]);
              setLoading(false);
            }
          },
        );
      } catch {
        if (mounted) {
          setLoading(false);
          setActivities([]);
        }
      }
    })();

    return () => {
      mounted = false;
      try { unsub?.(); } catch { /* ignore */ }
    };
  }, [familyId, uid, loadMembers]);

  useEffect(() => {
    if (!uid) return undefined;
    return listenFitnessConnections(uid, (data) => {
      setConnections(data || {});
      const w = data?.healthProfile?.weightKg;
      if (w != null && Number.isFinite(Number(w))) setWeightDraft(String(w));
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) return undefined;
    return listenImportedWorkouts(uid, setImported);
  }, [uid]);

  const refreshStravaStatus = useCallback(async () => {
    if (!uid) return;
    try {
      const st = await fetchStravaAppStatus(familyId);
      setStravaStatus(st || { configured: false });
      if (st?.clientId) setSetupClientId(String(st.clientId));
    } catch {
      setStravaStatus({ configured: false });
    }
  }, [uid, familyId]);

  useEffect(() => {
    if (view !== 'settings' || !uid) return;
    refreshStravaStatus();
  }, [view, uid, refreshStravaStatus]);

  const healthSummary = useMemo(() => summarizeImportedHealth(imported), [imported]);

  const openTypeBrowse = useCallback((typeId) => {
    const known = ACTIVITY_TYPES.some((t) => t.id === typeId);
    const id = known ? typeId : 'tur';
    setBrowseTypeId(id);
    setSubcategoryId(null);
    setProgramId(null);
    setView('type');
  }, []);

  const openCreateModal = useCallback((typeId, opts = {}) => {
    if (!uid) return;
    const known = typeof typeId === 'string' && ACTIVITY_TYPES.some((t) => t.id === typeId);
    setSelectedType(known ? typeId : (browseTypeId || 'tur'));
    setCustomTitle(opts.title || '');
    setSelectedUids([uid]);
    if (opts.programId) setProgramId(opts.programId);
    if (opts.subcategoryId) setSubcategoryId(opts.subcategoryId);
    setCreateOpen(true);
  }, [uid, browseTypeId]);

  useEffect(() => {
    if (!openCreateParam || !uid) return;
    openTypeBrowse('tur');
    nav.setParams?.({ openCreate: undefined });
  }, [openCreateParam, uid, openTypeBrowse, nav]);

  useEffect(() => {
    if (shellIntent !== 'create' || !uid) return;
    clearShellIntent?.();
    openTypeBrowse('tur');
  }, [shellIntent, uid, clearShellIntent, openTypeBrowse]);

  const onToggleMember = useCallback(
    (memberUid, value) => {
      setSelectedUids((prev) => {
        const set = new Set(prev || []);
        if (value) set.add(memberUid);
        else set.delete(memberUid);
        if (set.size === 0 && uid) set.add(uid);
        return Array.from(set);
      });
    },
    [uid],
  );

  const saveCreate = useCallback(async () => {
    if (!uid || !familyId) return;
    const typeMeta = getActivityType(selectedType);
    const programs = getProgramsForType(selectedType, subcategoryId);
    const program = programs.find((p) => p.id === programId) || null;
    const trimmed = (customTitle || '').trim()
      || (program ? program.title : typeMeta.label);
    const finalUids = Array.isArray(selectedUids) ? Array.from(new Set(selectedUids)) : [uid];
    if (!finalUids.includes(uid)) finalUids.push(uid);

    try {
      setBusyCreate(true);
      const ref = collection(db, 'families', familyId, 'activities');
      const docRef = await addDoc(ref, {
        title: trimmed,
        type: selectedType,
        icon: typeMeta.icon,
        color: typeMeta.color,
        createdByUid: uid,
        participantUids: finalUids,
        active: true,
        deleted: false,
        preferences: {
          defaultRestSec: typeMeta.mode === 'sport' || typeMeta.mode === 'outdoor' ? 30 : 60,
          weightUnit: 'kg',
          notes: typeMeta.blurb || '',
          subcategoryId: subcategoryId || null,
          programId: program?.id || null,
          programTitle: program?.title || null,
          programWeeks: program?.weeks || null,
          focusRotation: program?.focusRotation || null,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCreateOpen(false);
      setView('hub');
      setBrowseTypeId(null);
      nav.navigate('ActivityDetail', { familyId, activityId: docRef.id });
    } catch (e) {
      console.error(e);
      showInfo('Feil', 'Kunne ikke opprette aktiviteten.');
    } finally {
      setBusyCreate(false);
    }
  }, [
    uid, familyId, selectedType, customTitle, selectedUids, nav,
    subcategoryId, programId, showInfo,
  ]);

  const goToActivity = useCallback(
    (activityId) => {
      nav.navigate('ActivityDetail', { familyId, activityId });
    },
    [nav, familyId],
  );

  const importGpxFile = useCallback(async () => {
    if (!uid) return;
    try {
      setImportBusy(true);
      const picked = await pickGpxOrTcxFile();
      if (!picked) return;
      const workout = parseGpxOrTcx(picked.text, picked.name);
      await saveImportedWorkout(uid, workout, 'gpx');
      await setFitnessConnection(uid, 'gpx', {
        connected: true,
        enabled: true,
        source: 'import',
        lastImportAt: new Date().toISOString(),
      });
      await setFitnessConnection(uid, 'osm', { connected: true, enabled: true, source: 'auto' });
      showInfo(
        'Tur importert',
        `${workout.title}\n${formatDistanceKm(workout.distanceM)} · ${formatDuration(workout.durationSec)} · ${formatCalories(workout.calories)}`,
      );
      setView('settings');
    } catch (e) {
      console.error(e);
      showInfo('Import feilet', e?.message || 'Kunne ikke lese GPX/TCX-filen.');
    } finally {
      setImportBusy(false);
    }
  }, [uid, showInfo]);

  const runStravaConnect = useCallback(async () => {
    if (!uid) return;
    const configured = stravaStatus?.configured;
    if (!configured) {
      setSetupOpen(true);
      return;
    }
    try {
      setStravaBusy(true);
      const res = await connectStravaOAuth({
        clientId: stravaStatus?.clientId,
        familyId,
      });
      await refreshStravaStatus();
      // Auto-sync after login
      let syncMsg = '';
      try {
        const sync = await syncStravaActivities({ perPage: 30, familyId });
        syncMsg = `\n\nHentet ${sync?.imported ?? 0} nye turer (${sync?.skipped ?? 0} allerede lagret).`;
      } catch {
        syncMsg = '\n\nInnlogget — trykk «Synk turer» for å hente aktiviteter.';
      }
      showInfo(
        'Innlogget med Strava',
        `${res?.athleteName ? `Hei ${res.athleteName}! ` : ''}Turer hentes automatisk.${syncMsg}`,
      );
    } catch (e) {
      if (e?.code === 'cancelled' || e?.message === 'cancelled') return;
      if (e?.code === 'not_configured') {
        setSetupOpen(true);
        return;
      }
      showInfo('Strava', e?.message || 'Innlogging feilet. Sjekk Client ID/Secret og redirect URI (oauth/strava).');
    } finally {
      setStravaBusy(false);
    }
  }, [uid, stravaStatus, familyId, refreshStravaStatus, showInfo]);

  const runStravaSync = useCallback(async () => {
    if (!uid) return;
    try {
      setStravaBusy(true);
      const res = await syncStravaActivities({ perPage: 30, familyId });
      showInfo(
        'Strava-synk',
        `Importert ${res?.imported ?? 0} nye turer (${res?.skipped ?? 0} allerede lagret).`,
      );
    } catch (e) {
      showInfo('Strava', e?.message || 'Kunne ikke synke. Logg inn med Strava først.');
    } finally {
      setStravaBusy(false);
    }
  }, [uid, familyId, showInfo]);

  const saveStravaSetup = useCallback(async () => {
    if (!uid) return;
    try {
      setSetupBusy(true);
      await saveStravaAppConfig({
        clientId: setupClientId,
        clientSecret: setupSecret,
        familyId,
        scope: 'user',
      });
      setSetupSecret('');
      setSetupOpen(false);
      await refreshStravaStatus();
      showInfo('Strava-app lagret', 'Trykk «Logg inn med Strava» for å autorisere kontoen din.');
    } catch (e) {
      showInfo('Oppsett', e?.message || 'Kunne ikke lagre Strava-nøkler.');
    } finally {
      setSetupBusy(false);
    }
  }, [uid, setupClientId, setupSecret, familyId, refreshStravaStatus, showInfo]);

  const saveWeight = useCallback(async () => {
    if (!uid) return;
    const n = Number(String(weightDraft).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0 || n > 400) {
      showInfo('Vekt', 'Skriv inn en gyldig vekt i kg.');
      return;
    }
    try {
      await setHealthProfile(uid, { weightKg: Math.round(n * 10) / 10 });
      showInfo('Lagret', `Vekt oppdatert til ${n} kg.`);
    } catch {
      showInfo('Feil', 'Klarte ikke lagre vekt.');
    }
  }, [uid, weightDraft, showInfo]);

  const onProviderPress = useCallback(async (provider) => {
    if (!uid) return;
    if (provider.id === 'gpx' || provider.action === 'import') {
      await importGpxFile();
      return;
    }
    if (provider.id === 'strava' || provider.bridge === 'strava' || provider.action === 'bridge') {
      if (provider.id === 'garmin') {
        showInfo('Garmin → Strava', GARMIN_STRAVA_BRIDGE);
        return;
      }
      if (provider.id === 'apple_health') {
        showInfo('Apple → Strava', APPLE_STRAVA_BRIDGE);
        return;
      }
      if (connections.strava?.connected) {
        await runStravaSync();
      } else {
        await runStravaConnect();
      }
      return;
    }
    try {
      await setFitnessConnection(uid, provider.id, {
        connected: true,
        enabled: true,
        source: 'manual',
      });
      showInfo(provider.label, `${provider.label} er aktivert.`);
    } catch {
      showInfo('Feil', 'Klarte ikke lagre koblingen.');
    }
  }, [uid, connections, importGpxFile, runStravaConnect, runStravaSync, showInfo]);

  const browseMeta = getActivityType(browseTypeId);
  const subcategories = useMemo(
    () => (browseTypeId ? getSubcategories(browseTypeId) : []),
    [browseTypeId],
  );
  const programs = useMemo(
    () => (browseTypeId ? getProgramsForType(browseTypeId, subcategoryId) : []),
    [browseTypeId, subcategoryId],
  );

  const openNewPlan = useCallback(() => openTypeBrowse('tur'), [openTypeBrowse]);
  const shellAddBtn = useMemo(() => {
    if (view !== 'hub' || createOpen) return null;
    return (
      <ShellAddButton
        label="Ny plan"
        accessibilityLabel="Ny treningsplan"
        onPress={openNewPlan}
      />
    );
  }, [isDesktop, view, createOpen, openNewPlan]);
  // Alltid aktiv: null-node når ikke hub, så knappen fjernes i innstillinger/type-visning.
  useShellTitleRight(shellAddBtn);

  // Mobil: Ny-knapp i shell-header; koblinger kun via tannhjul (ikke stor CTA).
  const hubToolbar = view === 'hub' ? (
    <View style={[styles.toolbar, !isDesktop && styles.toolbarMobile, isDesktop && styles.toolbarDesk]}>
      <Pressable
        style={[styles.settingsIconBtn, webClickable]}
        onPress={() => setView('settings')}
        accessibilityRole="button"
        accessibilityLabel="Innstillinger og enhetskoblinger"
      >
        <Ionicons name="settings-outline" size={20} color={colors.brand} />
      </Pressable>
    </View>
  ) : null;

  const TypeBrowse = (
    <ScrollView
      contentContainerStyle={styles.browseBody}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity style={styles.backRow} onPress={() => setView('hub')}>
        <Ionicons name="chevron-back" size={18} color={colors.brand} />
        <Text style={styles.backRowTxt}>Alle aktiviteter</Text>
      </TouchableOpacity>

      <View style={styles.browseHero}>
        <View style={[styles.browseIcon, { backgroundColor: `${browseMeta.color}18` }]}>
          <Ionicons name={browseMeta.icon} size={22} color={browseMeta.color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.browseTitle, isDesktop && styles.browseTitleDesk]}>{browseMeta.label}</Text>
          <Text style={styles.browseBlurb}>{browseMeta.blurb}</Text>
        </View>
      </View>

      <Text style={[styles.sectionLbl, isDesktop && styles.sectionLblDesk]}>Underkategori</Text>
      <View style={styles.chipWrap}>
        {subcategories.map((s) => {
          const on = subcategoryId === s.id;
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.chip, on && { backgroundColor: browseMeta.color, borderColor: browseMeta.color }]}
              onPress={() => {
                setSubcategoryId(s.id);
                setProgramId(null);
              }}
            >
              <Text style={[styles.chipTxt, on && { color: '#fff' }]}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!!subcategoryId && (
        <Text style={styles.chipHint}>
          {subcategories.find((s) => s.id === subcategoryId)?.blurb}
        </Text>
      )}

      <Text style={[styles.sectionLbl, isDesktop && styles.sectionLblDesk]}>Foreslått program</Text>
      <View style={[styles.panel, isDesktop && styles.panelDesk]}>
        {programs.map((p, idx) => {
          const on = programId === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              style={[styles.programRow, idx > 0 && styles.programRowBorder, on && styles.programRowOn]}
              onPress={() => setProgramId(p.id)}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.programTitle, isDesktop && styles.programTitleDesk]}>{p.title}</Text>
                <Text style={styles.programMeta}>
                  {p.weeks} uker · {p.sessionsPerWeek} økter/uke
                </Text>
                <Text style={styles.programBlurb}>{p.blurb}</Text>
              </View>
              <Ionicons
                name={on ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={on ? browseMeta.color : colors.muted}
              />
            </TouchableOpacity>
          );
        })}
        {!programs.length ? (
          <Text style={styles.emptyInline}>Ingen ferdige program — opprett tom plan.</Text>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.primaryCta, isDesktop && styles.primaryCtaDesk]}
        onPress={() => openCreateModal(browseTypeId, {
          programId,
          subcategoryId,
          title: programs.find((p) => p.id === programId)?.title,
        })}
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.primaryCtaTxt}>
          {programId ? 'Bruk program og opprett' : 'Opprett plan uten program'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const oauthProviders = FITNESS_PROVIDERS.filter((p) => p.id === 'strava' || p.bridge === 'strava');
  const utilityProviders = FITNESS_PROVIDERS.filter((p) => p.id === 'osm' || p.id === 'open_meteo');
  const redirectHint = getStravaRedirectUri() || 'https://www.protop.no/oauth/strava';
  const stravaConnected = !!(connections.strava?.connected || stravaStatus?.connected);

  const SettingsView = (
    <ScrollView
      contentContainerStyle={styles.settingsBody}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity style={styles.backRow} onPress={() => setView('hub')}>
        <Ionicons name="chevron-back" size={18} color={colors.brand} />
        <Text style={styles.backRowTxt}>Tilbake</Text>
      </TouchableOpacity>

      <Text style={[styles.settingsTitle, isDesktop && styles.settingsTitleDesk]}>Innstillinger</Text>
      <Text style={styles.settingsLead}>
        Koble treningsenheter og synk turer. Garmin og Apple har ikke åpen web-API — koble dem til Strava én gang, deretter logger du inn her.
      </Text>

      <StravaConnectButton
        busy={stravaBusy}
        connected={stravaConnected}
        label={stravaStatus?.configured ? 'Connect with Strava' : 'Sett opp Strava-app'}
        onPress={stravaConnected ? runStravaSync : runStravaConnect}
        style={isDesktop ? { alignSelf: 'flex-start', minWidth: 260 } : null}
      />

      <StravaPoweredBy />

      {stravaConnected ? (
        <Text style={styles.connectedHint}>
          Innlogget{stravaStatus?.athleteName ? ` som ${stravaStatus.athleteName}` : connections.strava?.athleteName ? ` som ${connections.strava.athleteName}` : ''}.
          Nye turer hentes med synk — inkludert fra Garmin/Apple hvis de er koblet til Strava.
          {' '}
          <Text
            style={styles.viewOnStrava}
            onPress={() => Linking.openURL(STRAVA_ATHLETE_URL).catch(() => {})}
          >
            View on Strava
          </Text>
        </Text>
      ) : (
        <Pressable style={[styles.setupLink, webClickable]} onPress={() => setSetupOpen(true)}>
          <Text style={styles.setupLinkTxt}>Har du ikke Strava API-app? Sett opp Client ID (én gang)</Text>
        </Pressable>
      )}

      <View style={[styles.panel, isDesktop && styles.panelDesk, { marginTop: 14 }]}>
        {oauthProviders.map((p, idx) => {
          const conn = connections[p.id];
          return (
            <Pressable
              key={p.id}
              style={[styles.integRow, idx > 0 && styles.programRowBorder, webClickable]}
              onPress={() => { onProviderPress(p); }}
              disabled={stravaBusy}
              accessibilityRole="button"
            >
              <View style={[styles.integIcon, { backgroundColor: `${p.color}18` }]}>
                <Ionicons name={p.icon} size={16} color={p.color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.integName}>{p.label}</Text>
                <Text style={styles.integMeta} numberOfLines={3}>{p.detail}</Text>
              </View>
              <Text style={styles.integStatus}>
                {providerConnectionLabel(p, conn, stravaStatus)}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.muted} />
            </Pressable>
          );
        })}
      </View>

      {stravaConnected ? (
        <Pressable
          style={[styles.secondaryCta, webClickable]}
          onPress={async () => {
            try {
              setStravaBusy(true);
              await enableStravaRealtime();
              await refreshStravaStatus();
              showInfo('Sanntid', 'Strava push-abonnement er aktivert (når webhook-URL er deployet). Nye turer kan komme inn automatisk.');
            } catch (e) {
              showInfo('Sanntid', e?.message || 'Kunne ikke aktivere webhook. Sett STRAVA_WEBHOOK_CALLBACK_URL etter functions-deploy.');
            } finally {
              setStravaBusy(false);
            }
          }}
        >
          <Ionicons name="pulse-outline" size={16} color={colors.brand} />
          <Text style={styles.secondaryCtaTxt}>
            {connections.strava?.webhookEnabled ? 'Sanntid på (Strava webhook)' : 'Aktiver sanntid (Strava webhook)'}
          </Text>
        </Pressable>
      ) : null}

      {stravaConnected ? (
        <Pressable
          style={[styles.secondaryCta, webClickable]}
          onPress={async () => {
            try {
              await disconnectStrava();
              await refreshStravaStatus();
              showInfo('Strava', 'Logget ut.');
            } catch (e) {
              showInfo('Strava', e?.message || 'Kunne ikke logge ut.');
            }
          }}
        >
          <Text style={styles.secondaryCtaTxt}>Logg ut av Strava</Text>
        </Pressable>
      ) : null}

      <Pressable
        style={[styles.manualToggle, webClickable]}
        onPress={() => setManualOpen((v) => !v)}
      >
        <Text style={styles.manualToggleTxt}>
          {manualOpen ? 'Skjul manuell GPX' : 'Manuell GPX (reserve — ikke anbefalt)'}
        </Text>
        <Ionicons name={manualOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
      </Pressable>
      {manualOpen ? (
        <Pressable
          style={[styles.secondaryCta, webClickable, importBusy && { opacity: 0.7 }]}
          onPress={importGpxFile}
          disabled={importBusy}
        >
          {importBusy ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={16} color={colors.brand} />
              <Text style={styles.secondaryCtaTxt}>Importer GPX / TCX-fil</Text>
            </>
          )}
        </Pressable>
      ) : null}

      <View style={[styles.panel, isDesktop && styles.panelDesk, { marginTop: 12 }]}>
        {utilityProviders.map((p, idx) => (
          <Pressable
            key={p.id}
            style={[styles.integRow, idx > 0 && styles.programRowBorder, webClickable]}
            onPress={() => onProviderPress(p)}
          >
            <View style={[styles.integIcon, { backgroundColor: `${p.color}18` }]}>
              <Ionicons name={p.icon} size={16} color={p.color} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.integName}>{p.label}</Text>
              <Text style={styles.integMeta}>{p.blurb}</Text>
            </View>
            <Text style={styles.integStatus}>{providerConnectionLabel(p, connections[p.id], stravaStatus)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.sectionLbl, isDesktop && styles.sectionLblDesk, { marginTop: 16 }]}>
        Helseopplysninger
      </Text>
      <View style={[styles.panel, isDesktop && styles.panelDesk]}>
        <View style={styles.healthStats}>
          <View style={styles.healthStat}>
            <Text style={styles.healthVal}>{healthSummary.count}</Text>
            <Text style={styles.healthKey}>turer</Text>
          </View>
          <View style={styles.healthStat}>
            <Text style={styles.healthVal}>{formatDistanceKm(healthSummary.distanceM)}</Text>
            <Text style={styles.healthKey}>totalt</Text>
          </View>
          <View style={styles.healthStat}>
            <Text style={styles.healthVal}>{formatCalories(healthSummary.calories)}</Text>
            <Text style={styles.healthKey}>kalorier</Text>
          </View>
        </View>
        <Text style={styles.weightLbl}>Vekt (kg)</Text>
        <View style={styles.weightRow}>
          <TextInput
            style={[styles.weightInput, isDesktop && styles.inputDesk]}
            value={weightDraft}
            onChangeText={setWeightDraft}
            keyboardType="decimal-pad"
            placeholder="f.eks. 72.5"
            placeholderTextColor={colors.muted}
          />
          <TouchableOpacity style={styles.weightSave} onPress={saveWeight}>
            <Text style={styles.weightSaveTxt}>Lagre</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.integMeta}>
          Vekt kan også hentes fra Strava-profil ved innlogging. Kalorier/distanse kommer fra synkede turer.
        </Text>
      </View>

      <Text style={[styles.sectionLbl, isDesktop && styles.sectionLblDesk, { marginTop: 16 }]}>
        Synkede turer
      </Text>
      {!imported.length ? (
        <Text style={styles.emptyInline}>Ingen turer ennå. Logg inn med Strava for å hente dem automatisk.</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {imported.map((w) => (
            <View key={w.id} style={[styles.importCard, isDesktop && styles.cardDesk]}>
              <View style={styles.importHead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.cardTitle, isDesktop && styles.cardTitleDesk]} numberOfLines={1}>
                    {w.title || 'Tur'}
                  </Text>
                  <Text style={styles.cardSub} numberOfLines={2}>
                    {formatDistanceKm(w.distanceM)}
                    {' · '}
                    {formatDuration(w.durationSec)}
                    {' · '}
                    {formatCalories(w.calories)}
                    {w.avgHr ? ` · ${w.avgHr} bpm` : ''}
                    {w.source === 'strava' ? ' · Strava' : w.sourceFormat ? ` · ${String(w.sourceFormat).toUpperCase()}` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => deleteImportedWorkout(uid, w.id).catch(() => {})}
                  hitSlop={8}
                  accessibilityLabel="Slett tur"
                >
                  <Ionicons name="trash-outline" size={16} color={colors.muted} />
                </TouchableOpacity>
              </View>
              <TrackMiniMap track={w.track} color={colors.brand} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );

  const Empty = (
    <View style={[styles.emptyWrap, isDesktop && styles.emptyWrapDesk]}>
      {isDesktop ? (
        <View style={styles.hubIntroDesk}>
          <Text style={styles.hubTitleDesk}>Aktiviteter</Text>
          <Text style={styles.hubLeadDesk}>
            Planlegg treningsøkter for familien — velg aktivitetstype, få programforslag og følg fremgang.
          </Text>
        </View>
      ) : null}

      {isDesktop ? (
        <View style={styles.hubStatsRow}>
          <View style={styles.hubStatCard}>
            <Text style={styles.hubStatVal}>{imported.length}</Text>
            <Text style={styles.hubStatLbl}>Synkede turer</Text>
          </View>
          <View style={styles.hubStatCard}>
            <Text style={styles.hubStatVal}>{formatDistanceKm(healthSummary.distanceM)}</Text>
            <Text style={styles.hubStatLbl}>Total distanse</Text>
          </View>
          <View style={styles.hubStatCard}>
            <Text style={styles.hubStatVal}>{formatCalories(healthSummary.calories)}</Text>
            <Text style={styles.hubStatLbl}>Kalorier</Text>
          </View>
          <TouchableOpacity
            style={[styles.hubStatCard, styles.hubStatCardLink]}
            onPress={() => setView('settings')}
            accessibilityRole="button"
          >
            <Ionicons
              name={connections.strava?.connected ? 'checkmark-circle' : 'link-outline'}
              size={18}
              color={connections.strava?.connected ? '#16a34a' : colors.brand}
            />
            <Text style={styles.hubStatLbl}>
              {connections.strava?.connected ? 'Strava koblet' : 'Koble Strava'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={[styles.emptyTitle, isDesktop && styles.emptyTitleDesk]}>Velg aktivitet</Text>
      <Mute style={[styles.emptyLead, isDesktop && styles.emptyLeadDesk]}>
        {isDesktop
          ? 'Ni aktivitetstyper — klikk for underkategorier og ferdige programforslag.'
          : 'Gåtur, hiking og mer — åpne underkategorier og få programforslag.'}
      </Mute>

      <View style={[styles.typePickGrid, isDesktop && styles.typePickGridDesk]}>
        {FEATURED_ACTIVITY_TYPES.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.typePick, isDesktop && styles.typePickDesk]}
            onPress={() => openTypeBrowse(t.id)}
            accessibilityRole="button"
            accessibilityLabel={`Åpne ${t.label}`}
            activeOpacity={0.85}
          >
            <View style={[styles.typePickIcon, isDesktop && styles.typePickIconDesk, { backgroundColor: `${t.color}18` }]}>
              <Ionicons name={t.icon} size={isDesktop ? 20 : 18} color={t.color} />
            </View>
            <Text style={[styles.typePickLabel, isDesktop && styles.typePickLabelDesk]} numberOfLines={2}>
              {t.label}
            </Text>
            {isDesktop ? (
              <Text style={styles.typePickBlurbDesk} numberOfLines={2}>{t.blurb}</Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      {isDesktop && MORE_ACTIVITY_TYPES.length > 0 ? (
        <View style={styles.hubMoreDesk}>
          <Text style={[styles.sectionLbl, styles.sectionLblDesk]}>Flere idretter</Text>
          <View style={styles.chipWrap}>
            {MORE_ACTIVITY_TYPES.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={styles.chip}
                onPress={() => openTypeBrowse(t.id)}
              >
                <Ionicons name={t.icon} size={14} color={t.color} />
                <Text style={styles.chipTxt}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );

  const RecentImports = imported.length > 0 ? (
    <View style={{ marginBottom: 10 }}>
      <View style={styles.integHead}>
        <Text style={[styles.sectionLbl, isDesktop && styles.sectionLblDesk, { marginTop: 0, marginBottom: 0 }]}>
          Siste turer
        </Text>
        <TouchableOpacity onPress={() => setView('settings')}>
          <Text style={styles.linkTxt}>Se alle</Text>
        </TouchableOpacity>
      </View>
      {imported.slice(0, 3).map((w) => (
        <View key={w.id} style={[styles.importCardCompact, isDesktop && styles.cardDesk]}>
          <Text style={[styles.cardTitle, isDesktop && styles.cardTitleDesk]} numberOfLines={1}>
            {w.title || 'Tur'}
          </Text>
          <Text style={styles.cardSub}>
            {formatDistanceKm(w.distanceM)} · {formatCalories(w.calories)}
          </Text>
        </View>
      ))}
    </View>
  ) : null;

  let main = null;
  if (view === 'type') main = TypeBrowse;
  else if (view === 'settings') main = SettingsView;
  else {
    main = (
      <>
        {hubToolbar}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : (
          <FlatList
            data={activities}
            keyExtractor={(it) => it.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={Empty}
            ListHeaderComponent={
              <>
                {RecentImports}
                {activities.length > 0 ? (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={[styles.sectionLbl, isDesktop && styles.sectionLblDesk]}>Hurtigvalg</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipWrap}>
                      {FEATURED_ACTIVITY_TYPES.slice(0, 6).map((t) => (
                        <TouchableOpacity
                          key={t.id}
                          style={styles.chip}
                          onPress={() => openTypeBrowse(t.id)}
                        >
                          <Ionicons name={t.icon} size={14} color={t.color} />
                          <Text style={styles.chipTxt}>{t.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </>
            }
            renderItem={({ item }) => {
              const typeMeta = getActivityType(item.type);
              const inactive = item.active === false;
              const count = Array.isArray(item.participantUids) ? item.participantUids.length : 0;
              return (
                <TouchableOpacity
                  style={[styles.card, isDesktop && styles.cardDesk, inactive && styles.cardInactive]}
                  onPress={() => goToActivity(item.id)}
                  accessibilityRole="button"
                  activeOpacity={0.75}
                >
                  <View style={[styles.cardIcon, isDesktop && styles.cardIconDesk, { backgroundColor: `${typeMeta.color}18` }]}>
                    <Ionicons name={item.icon || typeMeta.icon} size={isDesktop ? 16 : 20} color={typeMeta.color} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.cardTitle, isDesktop && styles.cardTitleDesk]} numberOfLines={1}>
                      {item.title || typeMeta.label}
                    </Text>
                    <Text style={styles.cardSub} numberOfLines={2}>
                      {typeMeta.label}
                      {item.preferences?.programTitle ? ` · ${item.preferences.programTitle}` : ''}
                      {inactive ? ' · Deaktivert' : ''}
                      {` · ${count} ${count === 1 ? 'deltaker' : 'deltakere'}`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>
              );
            }}
          />
        )}
      </>
    );
  }

  return (
    <Screen>
      <ModulePageFrame name={view === 'hub' ? 'activities' : null}>
      <View style={[styles.body, isDesktop && styles.bodyDesk, styles.fg]}>
        <View style={[styles.contentCol, isDesktop && styles.contentColDesk]}>
          {!compactHeader && !inShell && view === 'hub' && (
            <ModuleHubIntro>
            <View style={[styles.pageHead, isDesktop && styles.pageHeadDesk]}>
              <Text style={styles.pageTitle}>Aktiviteter</Text>
              <Mute>Treningsplaner, turer og programforslag.</Mute>
            </View>
            </ModuleHubIntro>
          )}

          {main}
          {view === 'hub' ? <ModuleBgSpacer /> : null}
        </View>
      </View>
      </ModulePageFrame>
      <Modal
        visible={createOpen}
        transparent
        animationType={isDesktop ? 'fade' : 'slide'}
        onRequestClose={() => setCreateOpen(false)}
      >
        <Pressable
          style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
          onPress={() => !busyCreate && setCreateOpen(false)}
        >
          <Pressable
            style={[styles.modalCard, isDesktop && [desktopSheet, styles.modalCardDesk]]}
            onPress={() => {}}
          >
            {!isDesktop ? <View style={styles.sheetHandle} /> : null}
            <ScrollView
              style={{ maxHeight: isDesktop ? 420 : (Platform.OS === 'web' ? '75vh' : 480) }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.modalTitle, isDesktop && styles.modalTitleDesk]}>Ny treningsplan</Text>
              <Text style={styles.modalHelp}>
                {getActivityType(selectedType).label}
                {programId ? ` · ${getProgramsForType(selectedType).find((p) => p.id === programId)?.title || 'Program'}` : ''}
              </Text>

              <Text style={styles.modalSectionTitle}>Type</Text>
              <View style={styles.typeGrid}>
                {ACTIVITY_TYPES.map((t) => {
                  const on = selectedType === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.typeChip, on && { backgroundColor: t.color, borderColor: t.color }]}
                      onPress={() => {
                        setSelectedType(t.id);
                        setProgramId(null);
                        setSubcategoryId(null);
                      }}
                    >
                      <Ionicons name={t.icon} size={14} color={on ? '#fff' : t.color} />
                      <Text style={[styles.typeChipTxt, on && { color: '#fff' }]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.modalSectionTitle}>Navn (valgfritt)</Text>
              <TextInput
                style={[styles.input, isDesktop && styles.inputDesk]}
                placeholder={`F.eks. ${getActivityType(selectedType).label}`}
                placeholderTextColor={colors.muted}
                value={customTitle}
                onChangeText={setCustomTitle}
              />

              <Text style={styles.modalSectionTitle}>Deltakere</Text>
              <View style={{ marginTop: 6, gap: 8 }}>
                {members.length === 0 ? (
                  <Text style={{ color: colors.muted, fontSize: 13 }}>Fant ingen familiemedlemmer.</Text>
                ) : (
                  members.map((m) => (
                    <MemberRow
                      key={m.uid}
                      name={m.name}
                      enabled={selectedUids.includes(m.uid)}
                      onToggle={(v) => onToggleMember(m.uid, v)}
                    />
                  ))
                )}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost, isDesktop && styles.btnDesk]}
                onPress={() => setCreateOpen(false)}
                disabled={busyCreate}
              >
                <Text style={[styles.btnTxt, { color: colors.ink }]}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, isDesktop && styles.btnDesk]}
                onPress={saveCreate}
                disabled={busyCreate}
              >
                <Text style={[styles.btnTxt, { color: '#fff' }]}>
                  {busyCreate ? 'Lagrer…' : 'Opprett'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmActionModal
        visible={info.visible}
        title={info.title || 'Info'}
        body={info.message}
        confirmLabel="OK"
        cancelLabel="Lukk"
        onConfirm={hideInfo}
        onCancel={hideInfo}
      />

      <Modal
        visible={setupOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSetupOpen(false)}
      >
        <Pressable
          style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
          onPress={() => !setupBusy && setSetupOpen(false)}
        >
          <Pressable
            style={[styles.modalCard, isDesktop && [desktopSheet, styles.modalCardDesk]]}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitle, isDesktop && styles.modalTitleDesk]}>Sett opp Strava Sign-in</Text>
            <Text style={styles.modalHelp}>{STRAVA_SETUP_STEPS}</Text>
            <Pressable
              style={{ marginTop: 8, marginBottom: 10 }}
              onPress={() => Linking.openURL('https://www.strava.com/settings/api').catch(() => {})}
            >
              <Text style={styles.linkTxt}>Åpne strava.com/settings/api →</Text>
            </Pressable>
            <Text style={styles.modalSectionTitle}>Redirect URI (lim inn i Strava-appen)</Text>
            <Text style={styles.redirectUri} selectable>{redirectHint}</Text>
            <Text style={styles.modalSectionTitle}>Client ID</Text>
            <TextInput
              style={[styles.input, isDesktop && styles.inputDesk]}
              value={setupClientId}
              onChangeText={setSetupClientId}
              keyboardType="number-pad"
              placeholder="f.eks. 123456"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
            />
            <Text style={styles.modalSectionTitle}>Client Secret</Text>
            <TextInput
              style={[styles.input, isDesktop && styles.inputDesk]}
              value={setupSecret}
              onChangeText={setSetupSecret}
              placeholder="Fra Strava API-innstillingene"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              secureTextEntry
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost, isDesktop && styles.btnDesk]}
                onPress={() => setSetupOpen(false)}
                disabled={setupBusy}
              >
                <Text style={[styles.btnTxt, { color: colors.ink }]}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, isDesktop && styles.btnDesk, setupBusy && { opacity: 0.6 }]}
                onPress={saveStravaSetup}
                disabled={setupBusy}
              >
                <Text style={[styles.btnTxt, { color: '#fff' }]}>
                  {setupBusy ? 'Lagrer…' : 'Lagre'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fg: { zIndex: 1, backgroundColor: 'transparent' },
  body: { flex: 1, paddingHorizontal: space.md, paddingTop: space.sm },
  bodyDesk: { paddingHorizontal: 12, paddingTop: 8, alignItems: 'center' },
  contentCol: { flex: 1, width: '100%', maxWidth: 680, alignSelf: 'center', gap: space.sm },
  contentColDesk: { maxWidth: 720 },
  pageHead: { gap: 2, marginBottom: 4 },
  pageHeadDesk: { marginBottom: 0 },
  pageTitle: { fontSize: 20, fontWeight: '600', color: colors.ink },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 180 },
  listContent: { paddingBottom: 40, flexGrow: 1, paddingTop: 2 },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6,
  },
  toolbarMobile: {
    justifyContent: 'flex-end', marginBottom: 2,
  },
  toolbarDesk: {
    justifyContent: 'flex-end',
  },
  settingsIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    backgroundColor: colors.card,
  },
  settingsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 40, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    backgroundColor: colors.card,
  },
  settingsBtnTxt: { color: colors.brand, fontWeight: '500', fontSize: 13 },
  addBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12,
  },
  addBtnTxt: { color: '#fff', fontWeight: '500', fontSize: 14 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    paddingVertical: 10, paddingHorizontal: 10, marginBottom: 6, minHeight: 52,
  },
  cardDesk: { borderRadius: 8, paddingVertical: 8, gap: 8 },
  cardInactive: { opacity: 0.55 },
  cardIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  cardIconDesk: { width: 32, height: 32, borderRadius: 8 },
  cardTitle: { fontWeight: '600', color: colors.ink, fontSize: 14 },
  cardTitleDesk: { fontWeight: '500', fontSize: 13 },
  cardSub: { marginTop: 1, color: colors.muted, fontWeight: '400', fontSize: 12 },

  emptyWrap: { alignItems: 'center', paddingTop: 16, paddingHorizontal: 4, gap: 6 },
  emptyWrapDesk: {
    alignItems: 'stretch', paddingTop: 4, paddingHorizontal: 0, gap: 14, width: '100%',
  },
  hubIntroDesk: { gap: 4, marginBottom: 2 },
  hubTitleDesk: { fontSize: 18, fontWeight: '600', color: colors.ink },
  hubLeadDesk: { fontSize: 13, color: colors.muted, fontWeight: '400', lineHeight: 19, maxWidth: 560 },
  hubStatsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%',
  },
  hubStatCard: {
    flex: 1, minWidth: 120, backgroundColor: colors.card, borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    paddingVertical: 10, paddingHorizontal: 12, gap: 2,
  },
  hubStatCardLink: { alignItems: 'flex-start', justifyContent: 'center', minHeight: 56 },
  hubStatVal: { fontSize: 16, fontWeight: '700', color: colors.ink },
  hubStatLbl: { fontSize: 11, fontWeight: '500', color: colors.muted },
  hubMoreDesk: { width: '100%', marginTop: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  emptyTitleDesk: { fontWeight: '600', fontSize: 15, textAlign: 'left', alignSelf: 'flex-start' },
  emptyLead: { textAlign: 'center', marginBottom: 6, paddingHorizontal: 8, fontSize: 13 },
  emptyLeadDesk: { textAlign: 'left', alignSelf: 'flex-start', paddingHorizontal: 0, marginBottom: 0 },
  typePickGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%', marginTop: 4,
  },
  typePickGridDesk: {
    gap: 10, marginTop: 0, justifyContent: 'flex-start',
  },
  typePick: {
    width: '31%', flexGrow: 1, minWidth: 96,
    backgroundColor: colors.card, borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', gap: 6,
  },
  typePickDesk: {
    width: '31.5%',
    flexGrow: 0,
    minWidth: 0,
    maxWidth: '32%',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'flex-start',
    gap: 8,
    ...(Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)' } : {}),
  },
  typePickIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  typePickIconDesk: { width: 40, height: 40, borderRadius: 10 },
  typePickLabel: { fontWeight: '500', fontSize: 12, color: colors.ink, textAlign: 'center' },
  typePickLabelDesk: { fontSize: 13, fontWeight: '600', textAlign: 'left' },
  typePickBlurbDesk: {
    fontSize: 11, color: colors.muted, fontWeight: '400', lineHeight: 15, textAlign: 'left',
  },
  textCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingVertical: 6,
  },
  textCtaTxt: { fontWeight: '500', fontSize: 13, color: colors.brand },

  sectionLbl: {
    color: colors.muted, fontWeight: '600', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, marginTop: 4,
  },
  sectionLblDesk: { fontWeight: '500', fontSize: 11 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  chipTxt: { fontWeight: '500', color: colors.ink, fontSize: 12 },
  chipHint: { color: colors.muted, fontSize: 12, fontWeight: '400', marginBottom: 8 },

  panel: {
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: 10,
  },
  panelDesk: { borderRadius: 8, padding: 8 },
  emptyInline: { color: colors.muted, fontWeight: '400', fontSize: 13, paddingVertical: 8 },

  browseBody: { paddingBottom: 32, gap: 4 },
  settingsBody: { paddingBottom: 40, gap: 4 },
  settingsTitle: { fontWeight: '600', fontSize: 18, color: colors.ink },
  settingsTitleDesk: { fontWeight: '500', fontSize: 16 },
  settingsLead: {
    color: colors.muted, fontSize: 13, fontWeight: '400', lineHeight: 18, marginBottom: 8,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  backRowTxt: { color: colors.brand, fontWeight: '500', fontSize: 13 },
  browseHero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  browseIcon: {
    width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  browseTitle: { fontWeight: '600', fontSize: 18, color: colors.ink },
  browseTitleDesk: { fontWeight: '500', fontSize: 16 },
  browseBlurb: { color: colors.muted, fontWeight: '400', fontSize: 13, marginTop: 2 },
  programRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10,
  },
  programRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line,
  },
  programRowOn: { backgroundColor: '#f8fafc', marginHorizontal: -6, paddingHorizontal: 6, borderRadius: 8 },
  programTitle: { fontWeight: '600', fontSize: 14, color: colors.ink },
  programTitleDesk: { fontWeight: '500', fontSize: 13 },
  programMeta: { color: colors.brand, fontWeight: '500', fontSize: 11, marginTop: 2 },
  programBlurb: { color: colors.muted, fontWeight: '400', fontSize: 12, marginTop: 3, lineHeight: 16 },
  primaryCta: {
    marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 12,
  },
  primaryCtaDesk: { alignSelf: 'flex-start', paddingHorizontal: 16, borderRadius: 8 },
  primaryCtaTxt: { color: '#fff', fontWeight: '600', fontSize: 14 },
  stravaCta: {
    marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fc4c02', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 14,
  },
  connectedHint: {
    marginTop: 8, color: colors.muted, fontSize: 12, fontWeight: '400', lineHeight: 17,
  },
  viewOnStrava: {
    color: '#FC5200', fontWeight: '700', textDecorationLine: 'underline',
  },
  setupLink: { marginTop: 10, paddingVertical: 4 },
  setupLinkTxt: { color: colors.brand, fontWeight: '500', fontSize: 13 },
  manualToggle: {
    marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8,
  },
  manualToggleTxt: { color: colors.muted, fontWeight: '500', fontSize: 12 },
  redirectUri: {
    marginTop: 4, marginBottom: 4, padding: 8, borderRadius: 8, backgroundColor: colors.bg,
    color: colors.ink, fontSize: 12, fontWeight: '500',
  },
  secondaryCta: {
    marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    backgroundColor: colors.card, borderRadius: 10, paddingVertical: 10,
  },
  secondaryCtaTxt: { color: colors.brand, fontWeight: '500', fontSize: 13 },

  integHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
  },
  integRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  integIcon: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  integName: { fontWeight: '500', fontSize: 13, color: colors.ink },
  integMeta: { color: colors.muted, fontWeight: '400', fontSize: 11, marginTop: 1, lineHeight: 15 },
  integStatus: { color: colors.brand, fontWeight: '500', fontSize: 11, maxWidth: 88, textAlign: 'right' },
  linkTxt: { color: colors.brand, fontWeight: '500', fontSize: 12 },

  healthStats: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  healthStat: {
    flex: 1, backgroundColor: colors.bg, borderRadius: 8, paddingVertical: 10, alignItems: 'center',
  },
  healthVal: { fontWeight: '600', fontSize: 13, color: colors.ink },
  healthKey: { fontWeight: '400', fontSize: 11, color: colors.muted, marginTop: 2 },
  weightLbl: { fontWeight: '500', fontSize: 12, color: colors.ink, marginBottom: 4 },
  weightRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  weightInput: {
    flex: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: colors.bg, color: colors.ink, fontSize: 14,
  },
  weightSave: {
    paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  weightSaveTxt: { color: '#fff', fontWeight: '500', fontSize: 13 },

  importCard: {
    backgroundColor: colors.card, borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    padding: 10, gap: 8,
  },
  importCardCompact: {
    backgroundColor: colors.card, borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6,
  },
  importHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  miniMap: {
    width: '100%', borderRadius: 8, backgroundColor: '#f1f5f9', overflow: 'hidden',
  },

  sheetHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.line, marginBottom: 12,
  },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.4)',
    alignItems: 'center', justifyContent: 'flex-end', padding: 16,
  },
  modalCard: {
    width: '100%', maxWidth: 520, backgroundColor: colors.card,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: 16,
  },
  modalCardDesk: {
    borderRadius: 12, justifyContent: 'center', marginBottom: 0, padding: 16, maxWidth: 440,
  },
  modalTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  modalTitleDesk: { fontSize: 15, fontWeight: '500' },
  modalHelp: { marginTop: 4, color: colors.muted, fontWeight: '400', fontSize: 12, lineHeight: 17 },
  modalSectionTitle: {
    marginTop: 12, fontWeight: '600', color: colors.muted, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  input: {
    marginTop: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    borderRadius: 10, padding: 10, backgroundColor: colors.bg,
    fontWeight: '500', color: colors.ink, fontSize: 14,
  },
  inputDesk: { borderRadius: 8, paddingVertical: 8, fontWeight: '400', fontSize: 13 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    backgroundColor: colors.card, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  typeChipTxt: { fontWeight: '500', color: colors.ink, fontSize: 12 },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: {
    flex: 1, borderRadius: 10, paddingVertical: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  btnDesk: { borderRadius: 8, paddingVertical: 10 },
  btnGhost: { backgroundColor: colors.bg },
  btnPrimary: { backgroundColor: colors.brand },
  btnTxt: { fontWeight: '600', fontSize: 14 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberName: { fontWeight: '500', color: colors.ink, fontSize: 13 },
});
