import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, ActivityIndicator,
  TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { colors, radius } from '../../src/theme';
import { Screen, Mute } from '../../components/ui';
import { AvatarBubble } from '../../components/AvatarPicker';
import {
  listenFamilyLocations, isFreshLocation, formatLocationAge, effectiveLocationSharing,
  setChildLocationSharing,
} from '../../src/utils/familyLocation';
import { mapsEmbed, openGoogleMaps, getDeviceLocation } from '../../src/utils/location';
import {
  listenPlaces, savePlace, deletePlace, PLACE_TYPES,
} from '../../src/utils/familyPlaces';
import LocationPicker from '../../components/LocationPicker';
import HelpTarget from '../../components/HelpTarget';
import { ModulePageFrame, ModuleHubIntro } from '../../components/ModulePageBg';

function MemberChip({ member, selected, hasLive, isLive, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      accessibilityRole="button"
      accessibilityLabel={member.name}
    >
      <View style={[styles.chipAvatarWrap, selected && styles.chipAvatarSelected]}>
        <AvatarBubble
          photoURL={member.photoURL}
          avatarId={member.avatarId}
          name={member.name}
          size={48}
          color={member.color}
        />
        {hasLive ? (
          <View style={[styles.liveDot, !isLive && styles.lastKnownDot]} />
        ) : null}
      </View>
      <Text style={[styles.chipName, selected && styles.chipNameSelected]} numberOfLines={1}>
        {member.name?.split(' ')[0] || member.name}
      </Text>
    </TouchableOpacity>
  );
}

export default function LocationHubScreen({ inShell = false }) {
  const nav = useNavigation();
  const {
    familyId, members, parents, kids, uid, userProfile, meChild, meParent,
    requestShellTab, isParent, isChild,
  } = useApp();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUid, setSelectedUid] = useState(null);
  const [places, setPlaces] = useState([]);
  const [addingPlace, setAddingPlace] = useState(false);
  const [placeDraft, setPlaceDraft] = useState(null);
  const [placeName, setPlaceName] = useState('');
  const [placeType, setPlaceType] = useState('home');
  const [placeSaving, setPlaceSaving] = useState(false);

  useEffect(() => {
    if (!familyId) {
      setLocations([]);
      setLoading(false);
      return undefined;
    }
    return listenFamilyLocations(familyId, (data) => {
      setLocations(data.filter((l) => l.sharingEnabled !== false));
      setLoading(false);
    });
  }, [familyId]);

  useEffect(() => {
    if (!familyId) {
      setPlaces([]);
      return undefined;
    }
    return listenPlaces(familyId, setPlaces);
  }, [familyId]);

  const startAddPlace = useCallback(async (type = 'home') => {
    setPlaceType(type);
    setPlaceName(PLACE_TYPES.find((p) => p.id === type)?.label || 'Sted');
    setAddingPlace(true);
    try {
      const coords = await getDeviceLocation();
      setPlaceDraft({
        lat: coords.lat,
        lng: coords.lng,
        label: 'Her jeg er nå',
      });
    } catch {
      setPlaceDraft(null);
    }
  }, []);

  const placeDraftReady = Number.isFinite(Number(placeDraft?.lat))
    && Number.isFinite(Number(placeDraft?.lng));

  const saveNewPlace = useCallback(async () => {
    if (!familyId || !placeDraftReady || placeSaving) return;
    setPlaceSaving(true);
    try {
      const meta = PLACE_TYPES.find((p) => p.id === placeType);
      await savePlace(familyId, null, {
        name: placeName.trim() || meta?.label || 'Sted',
        type: placeType,
        lat: Number(placeDraft.lat),
        lng: Number(placeDraft.lng),
        radiusM: meta?.defaultRadius || 120,
        notifyOn: 'both',
        memberIds: [],
      }, uid);
      setAddingPlace(false);
      setPlaceDraft(null);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre sted.');
    } finally {
      setPlaceSaving(false);
    }
  }, [familyId, placeDraft, placeDraftReady, placeSaving, placeType, placeName, uid]);

  const locationByUid = useMemo(() => {
    const map = new Map();
    locations.forEach((l) => {
      if (l.uid) map.set(l.uid, l);
    });
    return map;
  }, [locations]);

  const sharingByUid = useMemo(() => {
    const map = new Map();
    members.forEach((m) => {
      const memberUid = m.uid || m.id;
      const childRecord = kids.find((k) => (k.uid || k.id) === memberUid || k.id === m.childId);
      const parentRecord = parents.find((p) => (p.uid || p.id) === memberUid);
      let sharing = effectiveLocationSharing({
        userProfile: memberUid === uid ? userProfile : null,
        childRecord,
        parentRecord,
      });
      if (!sharing && locationByUid.has(memberUid)) sharing = true;
      map.set(memberUid, sharing);
    });
    return map;
  }, [members, kids, parents, uid, userProfile, locationByUid]);

  const enrichedMembers = useMemo(() => (
    members.map((m) => {
      const memberUid = m.uid || m.id;
      return {
        ...m,
        memberUid,
        sharing: sharingByUid.get(memberUid) === true,
        live: locationByUid.get(memberUid) || null,
      };
    })
  ), [members, sharingByUid, locationByUid]);

  const liveMembers = useMemo(
    () => enrichedMembers.filter((m) => m.live),
    [enrichedMembers],
  );

  const enableChildSharing = useCallback(async (member) => {
    if (!familyId || !isParent) return;
    const child = kids.find((k) => (
      (k.uid || k.id) === member.memberUid
      || k.id === member.childId
      || k.id === member.docId
    ));
    if (!child?.id) {
      Alert.alert('Posisjon', 'Fant ikke barnets profil. Åpne barnets innstillinger.');
      return;
    }
    try {
      await setChildLocationSharing(familyId, child.id, true);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke slå på posisjonsdeling.');
    }
  }, [familyId, isParent, kids]);

  useEffect(() => {
    if (!selectedUid && liveMembers.length) {
      setSelectedUid(liveMembers[0].memberUid);
    }
  }, [selectedUid, liveMembers]);

  const selected = enrichedMembers.find((m) => m.memberUid === selectedUid) || liveMembers[0] || null;
  const mapLoc = selected?.live
    ? { lat: selected.live.lat, lng: selected.live.lng, label: selected.live.label }
    : null;
  const embedUrl = mapLoc ? mapsEmbed(mapLoc) : null;

  const mySharing = effectiveLocationSharing({
    userProfile,
    childRecord: meChild,
    parentRecord: meParent,
  });

  if (!familyId) {
    return (
      <Screen>
        <View style={{ padding: 16 }}>
          <Mute>Velg en familie for å se posisjoner.</Mute>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ModulePageFrame name="location">
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <ModuleHubIntro>
        {!inShell ? (
          <Text style={styles.title}>Familieposisjon</Text>
        ) : null}
        <Text style={styles.subtitle}>
          Se hvor familiemedlemmer er. Foresatte kan slå på deling — sist kjent sted vises også når appen ikke er åpen.
        </Text>
        </ModuleHubIntro>

        {!mySharing && !isChild ? (
          <TouchableOpacity
            style={styles.enableBanner}
            onPress={() => nav.navigate('LocationSettings')}
            accessibilityRole="button"
          >
            <Ionicons name="navigate-outline" size={20} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.enableTitle}>Del din posisjon</Text>
              <Text style={styles.enableSub}>Slå på i innstillinger for at familien skal se deg.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </TouchableOpacity>
        ) : null}

        {!mySharing && isChild ? (
          <View style={[styles.enableBanner, { opacity: 0.95 }]}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.enableTitle}>Posisjonsdeling er av</Text>
              <Text style={styles.enableSub}>
                En foresatt kan slå dette på under barnets innstillinger.
              </Text>
            </View>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {enrichedMembers.map((m) => (
            <MemberChip
              key={m.memberUid}
              member={m}
              selected={selected?.memberUid === m.memberUid}
              hasLive={!!m.live}
              isLive={!!m.live && isFreshLocation(m.live)}
              onPress={() => setSelectedUid(m.memberUid)}
            />
          ))}
        </ScrollView>

        <View style={styles.mapWrap}>
          {loading ? (
            <View style={styles.mapPlaceholder}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : embedUrl && Platform.OS === 'web' ? (
            React.createElement('iframe', {
              title: 'Kart',
              src: embedUrl,
              style: { border: 0, width: '100%', height: '100%', borderRadius: radius.lg },
              loading: 'lazy',
              referrerPolicy: 'no-referrer-when-downgrade',
            })
          ) : mapLoc ? (
            <TouchableOpacity
              style={styles.mapPlaceholder}
              onPress={() => openGoogleMaps(mapLoc)}
              accessibilityRole="button"
            >
              <Ionicons name="map-outline" size={36} color={colors.brand} />
              <Text style={styles.openMapTxt}>Åpne i kart</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.mapPlaceholder}>
              <Ionicons name="location-outline" size={36} color={colors.muted} />
              <Text style={styles.emptyMapTxt}>
                {selected?.live
                  ? `Sist kjent posisjon for ${selected.name?.split(' ')[0] || 'medlem'}.`
                  : selected?.sharing
                    ? `${selected.name?.split(' ')[0] || 'Medlem'} deler posisjon, men ingen posisjon er lagret ennå.`
                    : 'Ingen posisjon å vise. Slå på deling for å se sist kjent sted.'}
              </Text>
            </View>
          )}
        </View>

        {selected ? (
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <AvatarBubble
                photoURL={selected.photoURL}
                avatarId={selected.avatarId}
                name={selected.name}
                size={44}
                color={selected.color}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.detailName}>{selected.name}</Text>
                <Text style={styles.detailRole}>
                  {selected.role === 'child' ? 'Barn' : 'Forelder'}
                  {selected.sharing
                    ? (selected.live && isFreshLocation(selected.live)
                      ? ' · Deler posisjon'
                      : ' · Sist kjent vises')
                    : ' · Deling av'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => nav.navigate('LocationSettings')}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Ionicons name="settings-outline" size={20} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {selected.live ? (
              <>
                <Text style={styles.detailPlace} numberOfLines={2}>
                  {selected.live.label || `${selected.live.lat?.toFixed(4)}, ${selected.live.lng?.toFixed(4)}`}
                </Text>
                <View style={styles.detailMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={16} color={colors.muted} />
                    <Text style={styles.metaTxt}>
                      {isFreshLocation(selected.live)
                        ? formatLocationAge(selected.live)
                        : `Sist sett ${formatLocationAge(selected.live)}`}
                    </Text>
                  </View>
                  {selected.live.accuracy != null ? (
                    <View style={styles.metaItem}>
                      <Ionicons name="locate-outline" size={16} color={colors.muted} />
                      <Text style={styles.metaTxt}>{Math.round(selected.live.accuracy)} m</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.ghostBtn}
                    onPress={() => openGoogleMaps(mapLoc)}
                    accessibilityRole="button"
                    accessibilityLabel="Veibeskrivelse"
                  >
                    <Ionicons name="navigate-outline" size={14} color={colors.brand} />
                    <Text style={styles.ghostBtnTxt}>Veibeskrivelse</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.ghostBtn}
                    onPress={() => requestShellTab?.('chat')}
                    accessibilityRole="button"
                    accessibilityLabel="Melding"
                  >
                    <Ionicons name="chatbubble-outline" size={14} color={colors.brand} />
                    <Text style={styles.ghostBtnTxt}>Melding</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
              <Mute style={{ marginTop: 4 }}>
                {selected.sharing
                  ? 'Venter på første posisjon fra enheten. Sist kjent vises her når appen har fått tilgang.'
                  : isParent && selected.role === 'child'
                    ? 'Posisjonsdeling er av. Du kan slå den på her — sist kjent sted vises også når barnet ikke har appen åpen.'
                    : 'Posisjonsdeling er av for denne personen.'}
              </Mute>
              {isParent && selected.role === 'child' && !selected.sharing ? (
                <TouchableOpacity
                  style={[styles.primaryBtn, { marginTop: 12 }]}
                  onPress={() => enableChildSharing(selected)}
                  accessibilityRole="button"
                >
                  <Ionicons name="navigate" size={18} color="#fff" />
                  <Text style={styles.primaryBtnTxt}>
                    Slå på for {selected.name?.split(' ')[0] || 'barnet'}
                  </Text>
                </TouchableOpacity>
              ) : null}
              </>
            )}
          </View>
        ) : (
          <View style={styles.detailCard}>
            <Mute>Ingen familiemedlemmer å vise.</Mute>
          </View>
        )}

        {liveMembers.length === 0 && !loading ? (
          <Text style={styles.hint}>
            Tips: Foresatte kan slå på posisjon her eller under barnets innstillinger.
            Sist kjent sted vises også når barnet ikke har appen åpen.
          </Text>
        ) : null}

        <Text style={styles.placesTitle}>Steder & varsler</Text>
        <Text style={styles.placesSub}>
          Få beskjed når noen ankommer eller forlater hjem, skole eller andre steder.
        </Text>

        {places.map((p) => {
          const meta = PLACE_TYPES.find((t) => t.id === p.type);
          return (
            <View key={p.id} style={styles.placeRow}>
              <Text style={styles.placeEmoji}>{meta?.emoji || '📍'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.placeName}>{p.name}</Text>
                <Text style={styles.placeMeta}>
                  {meta?.label || 'Sted'} · {p.radiusM} m · varsel ved {p.notifyOn === 'both' ? 'ankomst/avgang' : p.notifyOn}
                </Text>
              </View>
              {isParent ? (
                <TouchableOpacity onPress={() => deletePlace(familyId, p.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}

        {isParent && !addingPlace ? (
          <HelpTarget id="add">
            <View style={styles.placeActions}>
              {PLACE_TYPES.filter((t) => t.id !== 'custom').map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.placeAddChip}
                  onPress={() => startAddPlace(t.id)}
                >
                  <Text style={styles.placeAddTxt}>{t.emoji} {t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </HelpTarget>
        ) : null}

        {addingPlace ? (
          <View style={styles.placeForm}>
            <Text style={styles.placeFormTitle}>Nytt sted</Text>
            <TextInput
              style={styles.placeInput}
              value={placeName}
              onChangeText={setPlaceName}
              placeholder="Navn"
            />
            <LocationPicker
              value={placeDraft}
              onChange={(loc) => setPlaceDraft(loc)}
            />
            <View style={styles.placeFormBtns}>
              <TouchableOpacity
                style={styles.placeCancel}
                onPress={() => { setAddingPlace(false); setPlaceDraft(null); }}
              >
                <Text style={styles.placeCancelTxt}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.placeSave}
                onPress={saveNewPlace}
                disabled={placeSaving || !placeDraftReady}
              >
                <Text style={styles.placeSaveTxt}>{placeSaving ? 'Lagrer…' : 'Lagre sted'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>
      </ModulePageFrame>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: '500', color: colors.ink, marginBottom: 4 },
  subtitle: { color: colors.muted, fontWeight: '400', fontSize: 14, lineHeight: 20, marginBottom: 14 },
  enableBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#eef6ff', borderRadius: radius.md, padding: 14,
    borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 14,
  },
  enableTitle: { fontWeight: '500', color: colors.ink, fontSize: 15 },
  enableSub: { color: colors.muted, fontSize: 13, marginTop: 2, fontWeight: '400' },
  chipRow: { gap: 10, paddingBottom: 12 },
  chip: { alignItems: 'center', width: 68 },
  chipSelected: {},
  chipAvatarWrap: { position: 'relative' },
  chipAvatarSelected: {
    borderWidth: 3, borderColor: colors.brand, borderRadius: 28, padding: 2,
  },
  liveDot: {
    position: 'absolute', bottom: 2, right: 2, width: 12, height: 12,
    borderRadius: 6, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#fff',
  },
  lastKnownDot: { backgroundColor: '#f59e0b' },
  chipName: { marginTop: 6, fontSize: 12, fontWeight: '500', color: colors.muted, maxWidth: 68, textAlign: 'center' },
  chipNameSelected: { color: colors.brand },
  mapWrap: {
    height: 260, borderRadius: radius.lg, overflow: 'hidden',
    backgroundColor: '#e5eef8', borderWidth: 1, borderColor: colors.line, marginBottom: 14,
  },
  mapPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8,
  },
  openMapTxt: { color: colors.brand, fontWeight: '500' },
  emptyMapTxt: { color: colors.muted, textAlign: 'center', fontWeight: '400', lineHeight: 20 },
  detailCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, padding: 16,
    borderWidth: 1, borderColor: colors.line,
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  detailName: { fontSize: 18, fontWeight: '500', color: colors.ink },
  detailRole: { fontSize: 13, color: colors.muted, fontWeight: '400', marginTop: 2 },
  detailPlace: { fontSize: 16, fontWeight: '500', color: colors.ink, lineHeight: 22 },
  detailMeta: { flexDirection: 'row', gap: 16, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaTxt: { color: colors.muted, fontWeight: '400', fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.line,
  },
  ghostBtnTxt: { color: colors.ink, fontWeight: '400', fontSize: 12 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.brand, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '500', fontSize: 13 },
  hint: {
    marginTop: 14, color: colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '400',
  },
  placesTitle: {
    marginTop: 22, fontSize: 18, fontWeight: '500', color: colors.ink,
  },
  placesSub: {
    marginTop: 4, marginBottom: 10, color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '400',
  },
  placeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: colors.line,
  },
  placeEmoji: { fontSize: 22 },
  placeName: { fontWeight: '500', color: colors.ink },
  placeMeta: { color: colors.muted, fontSize: 12, marginTop: 2, fontWeight: '400' },
  placeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  placeAddChip: {
    backgroundColor: colors.brandSoft || '#eef6ff', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  placeAddTxt: { color: colors.brand, fontWeight: '500', fontSize: 13 },
  placeForm: {
    marginTop: 12, backgroundColor: colors.card, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: colors.line, gap: 10,
  },
  placeFormTitle: { fontWeight: '500', color: colors.ink },
  placeInput: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12,
    backgroundColor: colors.sunken, color: colors.ink,
  },
  placeFormBtns: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  placeCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  placeCancelTxt: { color: colors.muted, fontWeight: '500' },
  placeSave: {
    backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
  },
  placeSaveTxt: { color: '#fff', fontWeight: '500' },
});
