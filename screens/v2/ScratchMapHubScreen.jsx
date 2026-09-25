/**
 * Våre reiser — markér besøkte land med familiemedlemmer, bilde, kommentar, år og periode.
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, Image,
  ActivityIndicator, ScrollView, Pressable, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Mute } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { AvatarBubble } from '../../components/AvatarPicker';
import { DeskBtn } from '../../components/DeskBtn';
import ShellAddButton from '../../components/ShellAddButton';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import ScratchWorldMap from '../../components/ScratchWorldMap';
import { useApp } from '../../src/context/AppContext';
import { canEditTravelContent } from '../../src/utils/childTravelAccess';
import { colors, radius, useLayout } from '../../src/theme';
import { pickImage, uploadImage } from '../../src/utils/media';
import {
  WORLD_COUNTRIES, REGIONS, COUNTRY_BY_CODE, searchCountries,
} from '../../src/utils/worldCountries';
import {
  PERIODS, listenScratchVisits, createScratchVisit, updateScratchVisit,
  deleteScratchVisit, buildScratchStats, emptyVisitForm, periodLabel, visitYearLabel,
} from '../../src/utils/scratchMap';
import {
  mapPlacesForCountry, placeDisplayName, visitPlaceKey,
} from '../../src/utils/scratchMapLogic';
import { ModulePageFrame, ModuleHubIntro } from '../../components/ModulePageBg';

function MemberToggle({ member, selected, onToggle }) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={[styles.memberChip, selected && styles.memberChipOn]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={member.name}
    >
      <AvatarBubble
        photoURL={member.photoURL}
        avatarId={member.avatarId}
        name={member.name}
        size={28}
        color={member.color}
      />
      <Text style={[styles.memberChipTxt, selected && styles.memberChipTxtOn]} numberOfLines={1}>
        {member.name?.split(' ')[0] || member.name}
      </Text>
      {selected ? <Ionicons name="checkmark-circle" size={16} color={colors.brand} /> : null}
    </TouchableOpacity>
  );
}

function memberIdForChild(members, childId) {
  if (!childId) return null;
  const m = members.find(
    (x) => x.id === childId || x.childId === childId || x.docId === childId,
  );
  return m?.id || null;
}

export default function ScratchMapHubScreen({
  compactHeader = false, inShell = false, onBack, profileChildId = null,
}) {
  const { width } = useWindowDimensions();
  const { isDesktop } = useLayout();
  const {
    familyId, uid, members, requestShellTab,
    isChild, isActingAsChild, viewingChild, meChild,
  } = useApp();
  const childViewer = isChild || isActingAsChild;
  const travelSelfEdit = childViewer
    ? ((isChild ? meChild : viewingChild)?.travelSelfEdit === true)
    : true;
  const canEditTravel = canEditTravelContent({ isChildViewer: childViewer, travelSelfEdit });

  const profileMemberId = useMemo(
    () => memberIdForChild(members, profileChildId),
    [members, profileChildId],
  );
  const defaultNewVisitMemberIds = useMemo(
    () => (profileMemberId ? [profileMemberId] : members.map((m) => m.id)),
    [profileMemberId, members],
  );

  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState(null);
  const [memberFilter, setMemberFilter] = useState(null);
  const memberFilterDefaulted = useRef(false);
  const [onlyVisited, setOnlyVisited] = useState(false);
  const [selectedCode, setSelectedCode] = useState(null);
  const [selectedPlaceKey, setSelectedPlaceKey] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyVisitForm());
  const [countryPickQuery, setCountryPickQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState({ visible: false, title: '', message: '' });
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    if (!familyId) {
      setVisits([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return listenScratchVisits(familyId, (rows) => {
      setVisits(rows);
      setLoading(false);
    });
  }, [familyId]);

  useEffect(() => {
    memberFilterDefaulted.current = false;
    setMemberFilter(null);
  }, [profileChildId]);

  useEffect(() => {
    if (memberFilterDefaulted.current || !profileMemberId) return;
    setMemberFilter(profileMemberId);
    memberFilterDefaulted.current = true;
  }, [profileMemberId]);

  const stats = useMemo(
    () => buildScratchStats(visits, { memberId: memberFilter }),
    [visits, memberFilter],
  );

  const countries = useMemo(() => {
    let list = searchCountries(query, { region: region || undefined });
    if (onlyVisited) {
      list = list.filter((c) => stats.visitedCodes.has(c.code));
    }
    return list.slice().sort((a, b) => {
      const av = stats.visitedCodes.has(a.code) ? 0 : 1;
      const bv = stats.visitedCodes.has(b.code) ? 0 : 1;
      if (av !== bv) return av - bv;
      return a.name.localeCompare(b.name, 'nb');
    });
  }, [query, region, onlyVisited, stats.visitedCodes]);

  const selectedCountry = selectedCode ? COUNTRY_BY_CODE[selectedCode] : null;
  const selectedPlaces = useMemo(
    () => (selectedCode ? mapPlacesForCountry(selectedCode) : []),
    [selectedCode],
  );
  const selectedPlace = useMemo(
    () => selectedPlaces.find((p) => p.placeKey === selectedPlaceKey) || null,
    [selectedPlaces, selectedPlaceKey],
  );
  const selectedVisits = useMemo(() => {
    if (!selectedCode) return [];
    const rows = stats.byCountry.get(selectedCode) || [];
    const filtered = selectedPlaceKey
      ? rows.filter((v) => visitPlaceKey(v) === selectedPlaceKey)
      : rows;
    return filtered.slice().sort((a, b) => {
      const ya = Number(a.year);
      const yb = Number(b.year);
      const aValid = Number.isFinite(ya);
      const bValid = Number.isFinite(yb);
      if (aValid && bValid && yb !== ya) return yb - ya;
      if (aValid && !bValid) return -1;
      if (!aValid && bValid) return 1;
      return 0;
    });
  }, [selectedCode, selectedPlaceKey, stats.byCountry]);

  const goBack = useCallback(() => {
    if (onBack) onBack();
    else requestShellTab?.('more', null);
  }, [onBack, requestShellTab]);

  const showInfo = useCallback((title, message) => {
    setInfo({ visible: true, title, message: String(message || '') });
  }, []);

  const openCountry = useCallback((code) => {
    const places = mapPlacesForCountry(code);
    setSelectedCode(code);
    setSelectedPlaceKey(places.length === 1 ? places[0].placeKey : null);
  }, []);

  const openPlace = useCallback((place) => {
    if (!place?.code) return;
    setSelectedCode(place.code);
    setSelectedPlaceKey(place.placeKey);
  }, []);

  const openNewVisit = useCallback((code, placeKey) => {
    const c = code || selectedCode || '';
    const places = mapPlacesForCountry(c);
    let partId = null;
    let key = placeKey || selectedPlaceKey || '';
    if (key) {
      partId = Number(String(key).split(':')[1] || 0) || 0;
    } else if (places.length === 1) {
      partId = places[0].partId;
      key = places[0].placeKey;
    }
    setEditingId(null);
    setCountryPickQuery('');
    setForm(emptyVisitForm({
      countryCode: c,
      ...(partId != null ? { partId, placeKey: key } : {}),
      memberIds: defaultNewVisitMemberIds,
    }));
    setFormOpen(true);
  }, [selectedCode, selectedPlaceKey, defaultNewVisitMemberIds]);

  const travelAddBtn = useMemo(
    () => (canEditTravel
      ? <ShellAddButton label="Ny reise" onPress={() => openNewVisit(selectedCode)} />
      : null),
    [openNewVisit, selectedCode, canEditTravel],
  );
  useShellTitleRight(travelAddBtn, { active: !formOpen });

  const openEditVisit = useCallback((visit) => {
    setEditingId(visit.id);
    setCountryPickQuery('');
    setForm(emptyVisitForm({
      countryCode: visit.countryCode,
      partId: visit.partId,
      placeKey: visitPlaceKey(visit),
      memberIds: visit.memberIds || [],
      skipYear: visit.year == null,
      year: visit.year,
      period: visit.period,
      periodNote: visit.periodNote,
      comment: visit.comment,
      imageUrl: visit.imageUrl,
    }));
    setFormOpen(true);
  }, []);

  const pickFormImage = useCallback(async () => {
    try {
      const picked = await pickImage({ aspect: [4, 3], edit: true });
      if (!picked) return;
      setForm((f) => ({
        ...f,
        imageLocalUri: picked.uri || null,
        _picked: picked,
      }));
    } catch {
      showInfo('Bilde', 'Klarte ikke hente bildet.');
    }
  }, [showInfo]);

  const saveVisit = useCallback(async () => {
    if (!familyId || !uid) return;
    if (!form.countryCode) {
      showInfo('Land', 'Velg et land.');
      return;
    }
    const places = mapPlacesForCountry(form.countryCode);
    if (places.length > 1 && !form.placeKey) {
      showInfo('Område', 'Velg hvilket område du har besøkt.');
      return;
    }
    if (!form.skipYear && !String(form.year || '').trim()) {
      showInfo('År', 'Oppgi et år, eller kryss av om du ikke vil oppgi årstall.');
      return;
    }
    setSaving(true);
    try {
      let imageUrl = form.imageUrl || null;
      if (form._picked) {
        const path = `families/${familyId}/scratch-map/${uid}-${Date.now()}.jpg`;
        imageUrl = await uploadImage(path, form._picked);
      }
      const payload = {
        countryCode: form.countryCode,
        partId: form.partId,
        placeKey: form.placeKey,
        memberIds: form.memberIds,
        skipYear: form.skipYear,
        year: form.skipYear ? null : Number(form.year),
        period: form.period,
        periodNote: form.periodNote,
        comment: form.comment,
        imageUrl,
      };
      if (editingId) {
        await updateScratchVisit(familyId, editingId, payload);
      } else {
        await createScratchVisit(familyId, uid, payload);
      }
      setFormOpen(false);
      setEditingId(null);
      if (!selectedCode) setSelectedCode(form.countryCode);
      if (form.placeKey) setSelectedPlaceKey(form.placeKey);
    } catch (e) {
      showInfo('Lagre', e?.message || 'Kunne ikke lagre besøket.');
    } finally {
      setSaving(false);
    }
  }, [familyId, uid, form, editingId, selectedCode, showInfo]);

  const doDelete = useCallback(async () => {
    if (!familyId || !confirmDelete) return;
    try {
      await deleteScratchVisit(familyId, confirmDelete);
      setConfirmDelete(null);
    } catch (e) {
      showInfo('Slett', e?.message || 'Kunne ikke slette.');
    }
  }, [familyId, confirmDelete, showInfo]);

  const memberName = useCallback((id) => {
    const m = members.find((x) => x.id === id || x.docId === id || x.uid === id);
    return m?.name?.split(' ')[0] || 'Ukjent';
  }, [members]);

  const showInlineChrome = !compactHeader && !inShell;

  return (
    <Screen>
      <ModulePageFrame name="scratchMap">
      <View style={styles.page}>
        <ScrollView
          style={styles.pageScroll}
          contentContainerStyle={[styles.pageContent, isDesktop && styles.bodyDesk]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          {showInlineChrome ? (
            <CompactBackLink onPress={goBack} label="Tilbake" />
          ) : null}

          <ModuleHubIntro>
          {showInlineChrome ? (
            <View style={styles.hero}>
              <Text style={styles.title}>Våre reiser</Text>
              <Mute>
                Markér hvor familien har reist — land, hvem som var med, bilde, kommentar, år og periode.
              </Mute>
            </View>
          ) : (
            <Mute style={styles.heroInShell}>
              Markér besøkte land — hvem som var med, bilde, år og periode.
            </Mute>
          )}
          </ModuleHubIntro>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{stats.visitedCount}</Text>
              <Text style={styles.statLbl}>av {stats.totalCountries} land</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{stats.percent}%</Text>
              <Text style={styles.statLbl}>besøkt</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{stats.visitCount}</Text>
              <Text style={styles.statLbl}>reiser</Text>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginVertical: 24 }} />
          ) : (
            <ScratchWorldMap
              visitedPlaceKeys={stats.visitedPlaceKeys}
              visitedCodes={stats.visitedCodes}
              selectedPlaceKey={selectedPlaceKey}
              selectedCode={selectedCode}
              onPressPlace={openPlace}
              width={isDesktop ? Math.min(720, width - 48) : width - 32}
              height={isDesktop ? 360 : 260}
            />
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <TouchableOpacity
              style={[styles.filterPill, !memberFilter && styles.filterPillOn]}
              onPress={() => setMemberFilter(null)}
            >
              <Text style={[styles.filterTxt, !memberFilter && styles.filterTxtOn]}>Hele familien</Text>
            </TouchableOpacity>
            {members.map((m) => {
              const on = memberFilter === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.filterPill, on && styles.filterPillOn]}
                  onPress={() => setMemberFilter(on ? null : m.id)}
                >
                  <Text style={[styles.filterTxt, on && styles.filterTxtOn]}>
                    {m.name?.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Søk land…"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, Platform.OS === 'web' && { outlineStyle: 'none' }]}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Søk land"
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Tøm søk">
                <Ionicons name="close-circle" size={16} color={colors.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <TouchableOpacity
              style={[styles.filterPill, !region && styles.filterPillOn]}
              onPress={() => setRegion(null)}
            >
              <Text style={[styles.filterTxt, !region && styles.filterTxtOn]}>Alle regioner</Text>
            </TouchableOpacity>
            {REGIONS.map((r) => {
              const on = region === r;
              const reg = stats.byRegion[r];
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.filterPill, on && styles.filterPillOn]}
                  onPress={() => setRegion(on ? null : r)}
                >
                  <Text style={[styles.filterTxt, on && styles.filterTxtOn]}>
                    {r}{reg ? ` ${reg.visited}/${reg.total}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.filterPill, onlyVisited && styles.filterPillOn]}
              onPress={() => setOnlyVisited((v) => !v)}
            >
              <Text style={[styles.filterTxt, onlyVisited && styles.filterTxtOn]}>Kun besøkte</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.listHead}>
            <Text style={styles.sectionTitle}>{countries.length} land</Text>
          </View>

          <View style={styles.countryList}>
            {countries.map((c) => {
              const scratched = stats.visitedCodes.has(c.code);
              const tripCount = (stats.byCountry.get(c.code) || []).length;
              const places = mapPlacesForCountry(c.code);
              const placeHits = places.filter((p) => stats.visitedPlaceKeys.has(p.placeKey)).length;
              return (
                <TouchableOpacity
                  key={c.code}
                  style={[styles.countryRow, scratched && styles.countryRowOn]}
                  onPress={() => openCountry(c.code)}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name}${scratched ? ', besøkt' : ''}`}
                >
                  <Text style={styles.flag}>{c.flag}</Text>
                  <View style={styles.countryMeta}>
                    <Text style={[styles.countryName, scratched && styles.countryNameOn]} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={styles.countrySub} numberOfLines={1}>
                      {places.length > 1
                        ? `${placeHits}/${places.length} områder`
                        : c.region}
                      {scratched ? ` · ${tripCount} reise${tripCount === 1 ? '' : 'r'}` : ''}
                    </Text>
                  </View>
                  {scratched ? (
                    <View style={styles.scratchBadge}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                  ) : (
                    <Ionicons name="ellipse-outline" size={18} color={colors.line} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

      {/* Land-detalj */}
      <Modal
        visible={!!selectedCountry}
        animationType="slide"
        transparent
        onRequestClose={() => { setSelectedCode(null); setSelectedPlaceKey(null); }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => { setSelectedCode(null); setSelectedPlaceKey(null); }}
        >
          <Pressable style={[styles.sheet, isDesktop && styles.sheetDesk]} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.sheetHandle} />
            {selectedCountry ? (
              <>
                <View style={styles.sheetHead}>
                  <Text style={styles.sheetFlag}>{selectedCountry.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetTitle}>{selectedCountry.name}</Text>
                    <Text style={styles.sheetSub}>
                      {selectedPlace?.label || selectedCountry.region}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { setSelectedCode(null); setSelectedPlaceKey(null); }}
                    hitSlop={12}
                  >
                    <Ionicons name="close" size={22} color={colors.muted} />
                  </TouchableOpacity>
                </View>

                {selectedPlaces.length > 1 ? (
                  <View style={styles.placePickWrap}>
                    <Text style={styles.fieldLabel}>Hvilket område?</Text>
                    <Text style={styles.placePickHint}>
                      Landet har flere adskilte steder — trykk området du vil markere på kartet.
                    </Text>
                    <ScratchWorldMap
                      focusCountryCode={selectedCountry.code}
                      visitedPlaceKeys={stats.visitedPlaceKeys}
                      selectedPlaceKey={selectedPlaceKey}
                      onPressPlace={(p) => setSelectedPlaceKey(p.placeKey)}
                      width={isDesktop ? 480 : Math.min(width - 64, 400)}
                      height={isDesktop ? 260 : 200}
                      compact
                      showControls={false}
                    />
                    {selectedPlace ? (
                      <Text style={styles.selectedPlaceLabel}>
                        Valgt: {selectedPlace.label || selectedCountry.name}
                      </Text>
                    ) : (
                      <Text style={styles.placePickHint}>
                        Valgte områder fremheves med blå kant.
                      </Text>
                    )}
                  </View>
                ) : null}

                <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                  {selectedPlaces.length > 1 && !selectedPlaceKey ? (
                    <View style={{ marginBottom: 12 }}>
                      <Mute>Velg et område på kartet for å se reiser eller legge til besøk.</Mute>
                    </View>
                  ) : selectedVisits.length === 0 ? (
                    <View style={{ marginBottom: 12 }}>
                      <Mute>Ikke markert ennå — legg til en reise.</Mute>
                    </View>
                  ) : (
                    selectedVisits.map((v) => (
                      <View key={v.id} style={styles.visitCard}>
                        {v.imageUrl ? (
                          <Image source={{ uri: v.imageUrl }} style={styles.visitImg} resizeMode="cover" />
                        ) : null}
                        <View style={styles.visitBody}>
                          <Text style={styles.visitYear}>
                            {placeDisplayName(v)} · {visitYearLabel(v)} · {periodLabel(v)}
                          </Text>
                          {(v.memberIds || []).length > 0 ? (
                            <Text style={styles.visitMembers}>
                              Med: {(v.memberIds || []).map(memberName).join(', ')}
                            </Text>
                          ) : null}
                          {v.comment ? <Text style={styles.visitComment}>{v.comment}</Text> : null}
                          {canEditTravel ? (
                          <View style={styles.visitActions}>
                            <TouchableOpacity onPress={() => openEditVisit(v)} style={styles.linkBtn}>
                              <Text style={styles.linkTxt}>Rediger</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setConfirmDelete(v.id)} style={styles.linkBtn}>
                              <Text style={[styles.linkTxt, { color: colors.danger }]}>Slett</Text>
                            </TouchableOpacity>
                          </View>
                          ) : null}
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>

                {canEditTravel ? (
<View style={{ marginTop: 12 }}>
                  <DeskBtn
                    label="Legg til reise"
                    icon="add"
                    primary
                    onPress={() => {
                      if (selectedPlaces.length > 1 && !selectedPlaceKey) {
                        showInfo('Område', 'Velg hvilket område du har besøkt først.');
                        return;
                      }
                      openNewVisit(selectedCountry.code, selectedPlaceKey);
                    }}
                  />
                </View>
) : null}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Skjema */}
      <Modal visible={formOpen} animationType="slide" transparent onRequestClose={() => setFormOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !saving && setFormOpen(false)}>
          <Pressable style={[styles.sheet, isDesktop && styles.sheetDesk]} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{editingId ? 'Rediger reise' : 'Ny reise'}</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 480 }}>
              {!form.countryCode || editingId ? (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Land</Text>
                  <TextInput
                    value={form.countryCode ? (COUNTRY_BY_CODE[form.countryCode]?.name || form.countryCode) : ''}
                    editable={false}
                    style={[styles.input, { opacity: 0.7 }]}
                  />
                </View>
              ) : (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Land</Text>
                  <Text style={styles.countryPicked}>
                    {COUNTRY_BY_CODE[form.countryCode]?.flag} {COUNTRY_BY_CODE[form.countryCode]?.name}
                  </Text>
                </View>
              )}

              {!form.countryCode ? (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Velg land</Text>
                  <TextInput
                    placeholder="Søk land…"
                    placeholderTextColor={colors.muted}
                    value={countryPickQuery}
                    onChangeText={setCountryPickQuery}
                    style={styles.input}
                  />
                  <ScrollView style={{ maxHeight: 140 }}>
                    {searchCountries(countryPickQuery).slice(0, 40).map((c) => (
                      <TouchableOpacity
                        key={c.code}
                        style={styles.pickRow}
                        onPress={() => {
                          const places = mapPlacesForCountry(c.code);
                          const only = places.length === 1 ? places[0] : null;
                          setForm((f) => ({
                            ...f,
                            countryCode: c.code,
                            partId: only ? only.partId : null,
                            placeKey: only ? only.placeKey : '',
                          }));
                        }}
                      >
                        <Text>{c.flag} {c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {form.countryCode && mapPlacesForCountry(form.countryCode).length > 1 ? (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Hvilket område?</Text>
                  <Mute>Trykk området du har besøkt på kartet.</Mute>
                  <ScratchWorldMap
                    focusCountryCode={form.countryCode}
                    selectedPlaceKey={form.placeKey}
                    onPressPlace={(p) => setForm((f) => ({
                      ...f,
                      partId: p.partId,
                      placeKey: p.placeKey,
                    }))}
                    width={isDesktop ? 480 : Math.min(width - 64, 400)}
                    height={isDesktop ? 240 : 180}
                    compact
                    showControls={false}
                  />
                  {form.placeKey ? (
                    <Text style={styles.selectedPlaceLabel}>
                      Valgt: {mapPlacesForCountry(form.countryCode).find((p) => p.placeKey === form.placeKey)?.label
                        || COUNTRY_BY_CODE[form.countryCode]?.name}
                    </Text>
                  ) : (
                    <Text style={styles.placePickHint}>
                      Valgte områder fremheves med blå kant.
                    </Text>
                  )}
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Hvem var med</Text>
                <View style={styles.memberWrap}>
                  {members.map((m) => (
                    <MemberToggle
                      key={m.id}
                      member={m}
                      selected={(form.memberIds || []).includes(m.id)}
                      onToggle={() => setForm((f) => {
                        const set = new Set(f.memberIds || []);
                        if (set.has(m.id)) set.delete(m.id);
                        else set.add(m.id);
                        return { ...f, memberIds: [...set] };
                      })}
                    />
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={styles.skipYearRow}
                onPress={() => setForm((f) => ({
                  ...f,
                  skipYear: !f.skipYear,
                  year: !f.skipYear ? '' : String(new Date().getFullYear()),
                }))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!form.skipYear }}
                accessibilityLabel="Ønsker ikke å oppgi årstall"
              >
                <Ionicons
                  name={form.skipYear ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={form.skipYear ? colors.brand : colors.muted}
                />
                <Text style={styles.skipYearTxt}>Ønsker ikke å oppgi årstall</Text>
              </TouchableOpacity>

              <View style={styles.row2}>
                <View style={[styles.field, { flex: 1, opacity: form.skipYear ? 0.45 : 1 }]}>
                  <Text style={styles.fieldLabel}>År</Text>
                  <TextInput
                    value={form.year}
                    onChangeText={(t) => setForm((f) => ({ ...f, year: t.replace(/[^\d]/g, '').slice(0, 4) }))}
                    keyboardType="number-pad"
                    style={styles.input}
                    placeholder="2024"
                    placeholderTextColor={colors.muted}
                    editable={!form.skipYear}
                  />
                </View>
                <View style={[styles.field, { flex: 2 }]}>
                  <Text style={styles.fieldLabel}>Periode</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {PERIODS.map((p) => {
                      const on = form.period === p.id;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.filterPill, on && styles.filterPillOn]}
                          onPress={() => setForm((f) => ({ ...f, period: p.id }))}
                        >
                          <Text style={[styles.filterTxt, on && styles.filterTxtOn]}>{p.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Periode-detalj (valgfritt)</Text>
                <TextInput
                  value={form.periodNote}
                  onChangeText={(t) => setForm((f) => ({ ...f, periodNote: t }))}
                  placeholder="f.eks. juli–august"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Kommentar</Text>
                <TextInput
                  value={form.comment}
                  onChangeText={(t) => setForm((f) => ({ ...f, comment: t }))}
                  placeholder="Minner, tips, favorittsted…"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, styles.inputMulti]}
                  multiline
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Bilde</Text>
                <TouchableOpacity style={styles.imagePick} onPress={pickFormImage}>
                  {(form.imageLocalUri || form.imageUrl) ? (
                    <Image
                      source={{ uri: form.imageLocalUri || form.imageUrl }}
                      style={styles.imagePreview}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.imageEmpty}>
                      <Ionicons name="camera-outline" size={28} color={colors.muted} />
                      <Text style={styles.imageEmptyTxt}>Legg til bilde</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {(form.imageLocalUri || form.imageUrl) ? (
                  <TouchableOpacity
                    onPress={() => setForm((f) => ({
                      ...f, imageLocalUri: null, imageUrl: null, _picked: null,
                    }))}
                  >
                    <Text style={[styles.linkTxt, { color: colors.danger, marginTop: 6 }]}>Fjern bilde</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </ScrollView>

            <View style={[styles.formActions, (saving || !form.countryCode) && { opacity: 0.7 }]}>
              <DeskBtn label="Avbryt" muted onPress={() => !saving && setFormOpen(false)} />
              <DeskBtn
                label={saving ? 'Lagrer…' : 'Lagre'}
                primary
                onPress={() => {
                  if (saving || !form.countryCode) return;
                  saveVisit();
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmActionModal
        visible={info.visible}
        title={info.title}
        body={info.message}
        confirmLabel="OK"
        cancelLabel="Lukk"
        onConfirm={() => setInfo((s) => ({ ...s, visible: false }))}
        onCancel={() => setInfo((s) => ({ ...s, visible: false }))}
      />
      <ConfirmActionModal
        visible={!!confirmDelete}
        title="Slett reise?"
        body="Besøket fjernes fra reisegalleriet."
        confirmLabel="Slett"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
      </View>
      </ModulePageFrame>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageScroll: { flex: 1 },
  pageContent: { padding: 16, paddingBottom: 48, gap: 12 },
  bodyDesk: { maxWidth: 760, alignSelf: 'center', width: '100%' },
  hero: { gap: 6 },
  heroInShell: { marginBottom: 2 },
  title: { fontSize: 22, fontWeight: '400', color: colors.ink, letterSpacing: -0.3 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  statNum: { fontSize: 20, fontWeight: '400', color: colors.brand },
  statLbl: { fontSize: 11, color: colors.muted, marginTop: 2 },
  filterScroll: { marginHorizontal: -4 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    marginRight: 6,
  },
  filterPillOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  filterTxt: { fontSize: 12, fontWeight: '400', color: colors.muted },
  filterTxtOn: { color: colors.brand },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink, padding: 0 },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: { fontSize: 13, fontWeight: '400', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  countryList: { gap: 6 },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  countryRowOn: {
    backgroundColor: '#ecfdf5',
    borderColor: '#99f6e4',
  },
  flag: { fontSize: 22, width: 32, textAlign: 'center' },
  countryMeta: { flex: 1, minWidth: 0 },
  countryName: { fontSize: 15, fontWeight: '400', color: colors.ink },
  countryNameOn: { color: '#134e4a' },
  countrySub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  scratchBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  sheetDesk: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
    borderRadius: 16,
    marginBottom: 40,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 12,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sheetFlag: { fontSize: 36 },
  sheetTitle: { fontSize: 18, fontWeight: '400', color: colors.ink },
  sheetSub: { fontSize: 13, color: colors.muted },
  visitCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    overflow: 'hidden',
    marginBottom: 10,
  },
  visitImg: { width: '100%', height: 140, backgroundColor: colors.line },
  visitBody: { padding: 12, gap: 4 },
  visitYear: { fontWeight: '400', color: colors.ink, fontSize: 14 },
  visitMembers: { fontSize: 13, color: colors.muted },
  visitComment: { fontSize: 14, color: colors.ink, marginTop: 4, lineHeight: 20 },
  visitActions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  linkBtn: {
    alignSelf: 'flex-start', paddingVertical: 4 },
  linkTxt: { fontWeight: '400', color: colors.brand, fontSize: 13 },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '400', color: colors.muted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  countryPicked: { fontSize: 16, fontWeight: '400', color: colors.ink },
  memberWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  memberChipOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  memberChipTxt: { fontSize: 13, fontWeight: '400', color: colors.muted, maxWidth: 80 },
  memberChipTxtOn: { color: colors.brand },
  placePickWrap: { marginBottom: 12 },
  placePickHint: { fontSize: 12, color: colors.muted, marginBottom: 8, marginTop: 2 },
  selectedPlaceLabel: { fontSize: 13, fontWeight: '400', color: colors.brand, marginTop: 4 },
  skipYearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    paddingVertical: 4,
  },
  skipYearTxt: { fontSize: 14, fontWeight: '400', color: colors.ink, flex: 1 },
  placeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    maxWidth: '100%',
  },
  placeChipOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  placeChipScratched: { borderColor: '#99f6e4' },
  placeChipTxt: { fontSize: 13, fontWeight: '400', color: colors.ink, flexShrink: 1 },
  placeChipTxtOn: { color: colors.brand },
  row2: { flexDirection: 'row', gap: 10 },
  pickRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  imagePick: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
  },
  imagePreview: { width: '100%', height: 160 },
  imageEmpty: { height: 120, alignItems: 'center', justifyContent: 'center', gap: 6 },
  imageEmptyTxt: { color: colors.muted, fontWeight: '400' },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
});
