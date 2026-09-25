/**
 * Reiseplanlegger — planlegg ferier A→B→C med kart, billetter, aktiviteter,
 * medlemmer (planlegger/leser), tidslinje som kollapser passerte dager,
 * innsjekk og minner.
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, Image,
  ActivityIndicator, ScrollView, Pressable, Platform, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Mute } from '../../components/ui';
import { ModulePageFrame, ModuleBgSpacer, ModuleHubIntro } from '../../components/ModulePageBg';
import CompactBackLink from '../../components/CompactBackLink';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { AvatarBubble } from '../../components/AvatarPicker';
import { DeskBtn } from '../../components/DeskBtn';
import ShellAddButton from '../../components/ShellAddButton';
import DateField from '../../components/DateField';
import TimeField from '../../components/TimeField';
import ReiseRouteMap from '../../components/ReiseRouteMap';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useApp } from '../../src/context/AppContext';
import { canEditTravelContent } from '../../src/utils/childTravelAccess';
import { colors, useLayout } from '../../src/theme';
import { dateKey } from '../../src/utils/dates';
import { pickImage, uploadImage } from '../../src/utils/media';
import {
  listenTrips,
  createTrip,
  updateTrip,
  softDeleteTrip,
  setTripMembers,
  addDestination,
  updateDestination,
  removeDestination,
  checkInDestination,
  addDestinationItem,
  updateDestinationItem,
  removeDestinationItem,
  emptyTripForm,
  emptyDestinationForm,
  emptyItemForm,
  categorizeTrips,
  buildTimeline,
  routePoints,
  tripStatus,
  formatTripDates,
  formatDisplayDateTime,
  canEditTrip,
  canViewTrip,
  memberRoleLabel,
  TICKET_KINDS,
  ITEM_TYPES,
  ROLES,
  searchTravelPlaces,
  sortedDestinations,
  splitDateTime,
  joinDateTime,
} from '../../src/utils/reiseplanlegger';

const ACCENT = '#0d9488';
const ACCENT_SOFT = '#ccfbf1';
const SUN = '#f59e0b';
const PAST_INK = '#94a3b8';

const STATUS_META = {
  upcoming: { label: 'Kommende', color: ACCENT, soft: ACCENT_SOFT },
  active: { label: 'Pågår nå', color: '#ea580c', soft: '#ffedd5' },
  past: { label: 'Fullført', color: PAST_INK, soft: '#f1f5f9' },
  draft: { label: 'Uten dato', color: colors.muted, soft: '#f8fafc' },
};

function memberKey(m) {
  return m.uid || m.id || m.childId || null;
}

function PlaceSearch({
  value,
  onChange,
  placeholder = 'Søk reisemål…',
  autoFocus = false,
}) {
  const [q, setQ] = useState(value?.label || '');
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  const picking = useRef(false);

  useEffect(() => {
    if (value?.label && value.label !== q && !open) setQ(value.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.label, value?.placeId]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    setQ('');
    setHits([]);
    setOpen(false);
    setBusy(false);
    onChange(null);
  };

  const run = (text) => {
    setQ(text);
    if (value?.label && text.trim() !== value.label) onChange(null);
    if (timer.current) clearTimeout(timer.current);
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setOpen(false);
      setBusy(false);
      return;
    }
    setBusy(true);
    setOpen(true);
    timer.current = setTimeout(async () => {
      try {
        const list = await searchTravelPlaces(trimmed, 'nb');
        setHits(list);
      } catch {
        setHits([]);
      } finally {
        setBusy(false);
      }
    }, 280);
  };

  const pick = (h) => {
    picking.current = true;
    onChange(h);
    setQ(h.label);
    setHits([]);
    setOpen(false);
    setTimeout(() => { picking.current = false; }, 0);
  };

  return (
    <View>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={ACCENT} style={styles.searchIcon} />
        <TextInput
          style={[styles.input, styles.searchInput]}
          value={q}
          onChangeText={run}
          onFocus={() => {
            if (hits.length || q.trim().length >= 2) setOpen(true);
          }}
          onBlur={() => {
            setTimeout(() => {
              if (!picking.current) setOpen(false);
            }, 180);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={() => {
            if (hits[0]) pick(hits[0]);
          }}
        />
        {busy ? <ActivityIndicator style={styles.searchSpin} color={ACCENT} /> : null}
        {q ? (
          <TouchableOpacity onPress={clear} hitSlop={8} accessibilityLabel="Tøm søk">
            <Ionicons name="close-circle" size={20} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {open && hits.length ? (
        <View style={styles.hitList}>
          {hits.map((h) => (
            <TouchableOpacity
              key={h.placeId || h.label}
              style={styles.hitRow}
              onPress={() => pick(h)}
            >
              <Ionicons name="location-outline" size={16} color={ACCENT} />
              <Text style={styles.hitTxt} numberOfLines={2}>{h.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {value?.lat != null && value?.lng != null ? (
        <Text style={styles.placeOk} numberOfLines={1}>
          På kartet · {Number(value.lat).toFixed(2)}, {Number(value.lng).toFixed(2)}
        </Text>
      ) : q.trim().length >= 2 && !busy && !hits.length && open ? (
        <Text style={styles.placeWarn}>Ingen treff — prøv et annet søkeord</Text>
      ) : null}
    </View>
  );
}

/** Date + optional time row — matches ParentTask / EventForm patterns. */
function DateTimeRow({
  date,
  time,
  onDateChange,
  onTimeChange,
  datePlaceholder = 'Velg dato',
  timePlaceholder = 'Klokke',
  requireDateForTime = true,
  minDate,
}) {
  const timeDisabled = requireDateForTime && !date;
  return (
    <View style={styles.dateTimeRow}>
      <DateField
        value={date || null}
        onChange={(d) => onDateChange(d ? dateKey(d) : '')}
        placeholder={datePlaceholder}
        min={minDate}
        style={styles.dateFieldFlex}
        iconColor={ACCENT}
      />
      <TimeField
        value={time || ''}
        onChange={onTimeChange}
        placeholder={timePlaceholder}
        disabled={timeDisabled}
        style={styles.timeFieldFixed}
        iconColor={ACCENT}
      />
    </View>
  );
}

function StatusChip({ status }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  return (
    <View style={[styles.statusChip, { backgroundColor: meta.soft }]}>
      <Text style={[styles.statusChipTxt, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

function TripCard({ trip, onPress, members }) {
  const status = tripStatus(trip);
  const dests = sortedDestinations(trip);
  const route = dests.map((d) => d.name).filter(Boolean).join(' → ');
  const tripMembers = (trip.memberIds || [])
    .map((id) => members.find((m) => memberKey(m) === id))
    .filter(Boolean)
    .slice(0, 5);
  const startMs = trip.startDate ? Date.parse(String(trip.startDate).slice(0, 10) + 'T00:00:00') : NaN;
  const daysUntil = Number.isFinite(startMs)
    ? Math.ceil((startMs - Date.now()) / 86400000)
    : null;

  return (
    <TouchableOpacity style={styles.tripCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.tripCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.tripTitle} numberOfLines={1}>{trip.title}</Text>
          <Text style={styles.tripDates}>{formatTripDates(trip)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <StatusChip status={status} />
          {status === 'upcoming' && daysUntil != null && daysUntil >= 0 ? (
            <Text style={styles.countdown}>
              {daysUntil === 0 ? 'I dag' : daysUntil === 1 ? 'I morgen' : `${daysUntil} dager`}
            </Text>
          ) : null}
        </View>
      </View>
      {route ? (
        <Text style={styles.tripRoute} numberOfLines={2}>{route}</Text>
      ) : (
        <Text style={styles.tripRouteMuted}>Ingen destinasjoner ennå</Text>
      )}
      <View style={styles.tripCardFoot}>
        <View style={styles.avatarRow}>
          {tripMembers.map((m) => (
            <View key={memberKey(m)} style={styles.avatarOverlap}>
              <AvatarBubble
                photoURL={m.photoURL}
                avatarId={m.avatarId}
                name={m.name}
                size={26}
                color={m.color}
              />
            </View>
          ))}
        </View>
        <Text style={styles.tripMeta}>
          {dests.length} destinasjon{dests.length === 1 ? '' : 'er'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function TimelineDay({ day, onEventPress, editable, isLast }) {
  const [open, setOpen] = useState(!day.collapsed);
  useEffect(() => { setOpen(!day.collapsed); }, [day.collapsed]);

  return (
    <View style={[styles.dayBlock, day.muted && styles.dayBlockPast]}>
      {!isLast ? <View style={[styles.timelineRail, day.muted && styles.timelineRailPast]} /> : null}
      <TouchableOpacity
        style={styles.dayHead}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
      >
        <View style={[styles.dayDot, day.highlight && styles.dayDotHot, day.muted && styles.dayDotPast]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.dayLabel, day.muted && styles.dayLabelPast]}>
            {day.isToday ? 'I dag · ' : ''}{day.label}
          </Text>
          <Text style={[styles.daySub, day.muted && styles.dayLabelPast]}>
            {day.events.length} begivenhet{day.events.length === 1 ? '' : 'er'}
            {day.muted ? ' · passert' : day.isToday ? ' · nå' : ''}
          </Text>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={day.muted ? PAST_INK : colors.ink}
        />
      </TouchableOpacity>
      {open ? day.events.map((ev) => (
        <TouchableOpacity
          key={`${ev.kind}-${ev.id}`}
          style={[styles.eventRow, day.muted && styles.eventRowPast]}
          onPress={() => onEventPress?.(ev)}
          disabled={!editable && ev.kind !== 'destination' && ev.kind !== 'departure'}
        >
          <View style={[styles.eventIcon, day.muted && styles.eventIconPast]}>
            <Ionicons
              name={
                  ev.kind === 'destination' ? 'flag-outline'
                    : ev.kind === 'departure' ? 'exit-outline'
                      : ev.type === 'ticket' ? (TICKET_KINDS.find((t) => t.id === ev.ticketKind)?.icon || 'ticket-outline')
                        : ev.type === 'memory' ? 'heart-outline'
                          : ev.type === 'todo' ? 'checkbox-outline'
                            : ev.type === 'photo' ? 'image-outline'
                              : 'sparkles-outline'
              }
              size={16}
              color={day.muted ? PAST_INK : ACCENT}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eventTitle, day.muted && styles.dayLabelPast]} numberOfLines={1}>
              {ev.title}
            </Text>
            <Text style={[styles.eventSub, day.muted && styles.dayLabelPast]} numberOfLines={1}>
              {[ev.destinationName && ev.kind !== 'destination' ? ev.destinationName : null,
                formatDisplayDateTime(ev.startAt), ev.subtitle]
                .filter(Boolean).join(' · ')}
            </Text>
          </View>
          {ev.checkedIn ? <Ionicons name="checkmark-circle" size={18} color={ACCENT} /> : null}
        </TouchableOpacity>
      )) : null}
    </View>
  );
}

export default function ReiseplanleggerHubScreen({
  compactHeader = false, inShell = false, onBack,
}) {
  const { isDesktop } = useLayout();
  const {
    familyId, members, uid, family, isAdmin, isGrandparent,
    isChild, isActingAsChild, viewingChild, meChild,
  } = useApp();
  const isFamilyAdmin = !!(isAdmin || family?.ownerUid === uid
    || (family?.adminUids || []).includes(uid));
  const childViewer = isChild || isActingAsChild;
  const travelSelfEdit = childViewer
    ? ((isChild ? meChild : viewingChild)?.travelSelfEdit === true)
    : true;

  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [expandPast, setExpandPast] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState(null);

  // modals
  const [tripFormOpen, setTripFormOpen] = useState(false);
  const [tripForm, setTripForm] = useState(emptyTripForm());
  const [editingTripId, setEditingTripId] = useState(null);

  const [destFormOpen, setDestFormOpen] = useState(false);
  const [destForm, setDestForm] = useState(emptyDestinationForm());
  const [editingDestId, setEditingDestId] = useState(null);

  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItemForm());
  const [itemDestId, setItemDestId] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);

  const [membersOpen, setMembersOpen] = useState(false);
  const [memberDraft, setMemberDraft] = useState({ ids: [], roles: {} });
  const [focusDestId, setFocusDestId] = useState(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryText, setMemoryText] = useState('');
  const [memoryDestId, setMemoryDestId] = useState(null);

  useEffect(() => {
    if (!familyId) {
      setTrips([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return listenTrips(familyId, (rows) => {
      const visible = (rows || []).filter((trip) => canViewTrip(trip, uid, {
        isFamilyMember: true,
        isGrandparent,
      }));
      setTrips(visible);
      setLoading(false);
    });
  }, [familyId, uid, isGrandparent]);

  const selected = useMemo(
    () => trips.find((t) => t.id === selectedId) || null,
    [trips, selectedId],
  );

  const tripEditable = canEditTrip(selected, uid, { isFamilyAdmin });
  const editable = canEditTravelContent({
    isChildViewer: childViewer,
    travelSelfEdit,
    tripEditable,
  });
  const canCreateTrips = canEditTravelContent({ isChildViewer: childViewer, travelSelfEdit });
  const cats = useMemo(() => categorizeTrips(trips), [trips]);
  const timeline = useMemo(
    () => (selected ? buildTimeline(selected, { expandPast }) : null),
    [selected, expandPast],
  );
  const points = useMemo(() => (selected ? routePoints(selected) : []), [selected]);
  const dests = useMemo(() => (selected ? sortedDestinations(selected) : []), [selected]);

  const openNewTrip = useCallback(() => {
    setEditingTripId(null);
    setTripForm(emptyTripForm());
    setTripFormOpen(true);
    setError('');
  }, []);

  const addBtn = useMemo(
    () => (!selectedId && canCreateTrips
      ? <ShellAddButton label="Ny reise" onPress={openNewTrip} />
      : null),
    [selectedId, openNewTrip, canCreateTrips],
  );
  useShellTitleRight(addBtn, { active: !selectedId && !tripFormOpen });

  const saveTrip = async () => {
    if (!familyId || !uid) return;
    setSaving(true);
    setError('');
    try {
      if (editingTripId) {
        const existing = trips.find((t) => t.id === editingTripId);
        await updateTrip(familyId, editingTripId, tripForm, existing);
      } else {
        const id = await createTrip(familyId, uid, tripForm, {
          memberIds: [uid],
          memberRoles: { [uid]: ROLES.planner },
        });
        setSelectedId(id);
      }
      setTripFormOpen(false);
    } catch (e) {
      setError(e?.message || 'Kunne ikke lagre');
    } finally {
      setSaving(false);
    }
  };

  const saveDest = async () => {
    if (!familyId || !selected) return;
    if (!String(destForm.name || '').trim() && !destForm.location) {
      setError('Søk etter et reisemål, eller skriv et visningsnavn.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...destForm,
        name: String(destForm.name || '').trim()
          || destForm.location?.shortName
          || (destForm.location?.label || '').split(',')[0]
          || '',
      };
      if (editingDestId) {
        await updateDestination(familyId, selected, editingDestId, payload);
      } else {
        await addDestination(familyId, selected, payload);
      }
      setDestFormOpen(false);
    } catch (e) {
      setError(e?.message || 'Kunne ikke lagre destinasjon');
    } finally {
      setSaving(false);
    }
  };

  const saveItem = async () => {
    if (!familyId || !selected || !itemDestId) return;
    setSaving(true);
    setError('');
    try {
      if (editingItemId) {
        await updateDestinationItem(familyId, selected, itemDestId, editingItemId, itemForm);
      } else {
        await addDestinationItem(familyId, selected, itemDestId, itemForm, uid);
      }
      setItemFormOpen(false);
    } catch (e) {
      setError(e?.message || 'Kunne ikke lagre');
    } finally {
      setSaving(false);
    }
  };

  const saveMembers = async () => {
    if (!familyId || !selected) return;
    setSaving(true);
    try {
      await setTripMembers(familyId, selected, memberDraft.ids, memberDraft.roles, selected.createdBy);
      setMembersOpen(false);
    } catch (e) {
      setError(e?.message || 'Kunne ikke lagre medlemmer');
    } finally {
      setSaving(false);
    }
  };

  const saveMemory = async () => {
    if (!familyId || !selected || !memoryDestId) return;
    setSaving(true);
    try {
      await addDestinationItem(familyId, selected, memoryDestId, {
        type: ITEM_TYPES.memory,
        title: 'Minne',
        description: memoryText,
      }, uid);
      setMemoryOpen(false);
      setMemoryText('');
    } catch (e) {
      setError(e?.message || 'Kunne ikke lagre minne');
    } finally {
      setSaving(false);
    }
  };

  const pickCover = async (target) => {
    try {
      const picked = await pickImage({ allowsEditing: true, aspect: [16, 9] });
      if (!picked || !familyId) return;
      setSaving(true);
      const path = `families/${familyId}/reiseplanlegger/${Date.now()}.jpg`;
      const url = await uploadImage(path, picked);
      if (target === 'trip') setTripForm((f) => ({ ...f, coverUrl: url }));
      else if (target === 'dest') setDestForm((f) => ({ ...f, coverUrl: url }));
      else if (target === 'item') setItemForm((f) => ({ ...f, imageUrl: url }));
    } catch (e) {
      setError(e?.message || 'Opplasting feilet');
    } finally {
      setSaving(false);
    }
  };

  const renderList = () => (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {!inShell && !compactHeader ? (
        <CompactBackLink onPress={onBack} label="Tilbake" />
      ) : null}
      <ModuleHubIntro>
        <View style={styles.hero}>
          {!(inShell || compactHeader) ? (
            <Text style={styles.brand}>Reiseplanlegger</Text>
          ) : null}
          <Text style={styles.heroLead}>
            Fra drøm til destinasjon — planlegg A→B→C, ta med reisefølge, billetter og minner.
          </Text>
        </View>
      </ModuleHubIntro>

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 24 }} />
      ) : (
        <>
          {cats.active.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pågår nå</Text>
              {cats.active.map((t) => (
                <TripCard key={t.id} trip={t} members={members} onPress={() => setSelectedId(t.id)} />
              ))}
            </View>
          ) : null}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Kommende reiser</Text>
            {cats.upcoming.length === 0 && cats.draft.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="airplane" size={28} color={ACCENT} />
                <Text style={styles.emptyTitle}>Planlegg neste eventyr</Text>
                <Mute>Opprett en reise, legg til destinasjoner og inviter familien.</Mute>
                <View style={{ marginTop: 12 }}>
                  {canCreateTrips ? <DeskBtn label="Ny reise" primary onPress={openNewTrip} /> : null}
                </View>
              </View>
            ) : (
              <>
                {cats.upcoming.map((t) => (
                  <TripCard key={t.id} trip={t} members={members} onPress={() => setSelectedId(t.id)} />
                ))}
                {cats.draft.map((t) => (
                  <TripCard key={t.id} trip={t} members={members} onPress={() => setSelectedId(t.id)} />
                ))}
              </>
            )}
          </View>
          {cats.past.length ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: PAST_INK }]}>Tidligere reiser</Text>
              {cats.past.map((t) => (
                <TripCard key={t.id} trip={t} members={members} onPress={() => setSelectedId(t.id)} />
              ))}
            </View>
          ) : null}
        </>
      )}
      <ModuleBgSpacer />
    </ScrollView>
  );

  const renderDetail = () => {
    if (!selected) return null;
    const status = tripStatus(selected);
    return (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backRow} onPress={() => setSelectedId(null)}>
          <Ionicons name="chevron-back" size={20} color={ACCENT} />
          <Text style={styles.backTxt}>Alle reiser</Text>
        </TouchableOpacity>

        {selected.coverUrl ? (
          <Image source={{ uri: selected.coverUrl }} style={styles.cover} />
        ) : null}

        <View style={styles.detailHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>{selected.title}</Text>
            <Text style={styles.tripDates}>{formatTripDates(selected)}</Text>
          </View>
          <StatusChip status={status} />
        </View>

        {timeline?.nextEvent && status === 'active' ? (
          <View style={styles.nowNext}>
            <Text style={styles.nowNextKicker}>Neste</Text>
            <Text style={styles.nowNextTitle}>{timeline.nextEvent.title}</Text>
            <Text style={styles.nowNextSub}>
              {[timeline.nextEvent.destinationName, formatDisplayDateTime(timeline.nextEvent.startAt)]
                .filter(Boolean).join(' · ')}
            </Text>
          </View>
        ) : null}

        <ReiseRouteMap points={points} height={isDesktop ? 240 : 200} />

        <View style={styles.actionRow}>
          {editable ? (
            <>
              <DeskBtn
                label="Destinasjon"
                primary
                icon="add"
                onPress={() => {
                  setEditingDestId(null);
                  setDestForm(emptyDestinationForm());
                  setDestFormOpen(true);
                }}
              />
              <DeskBtn
                label="Medlemmer"
                muted
                icon="people-outline"
                onPress={() => {
                  setMemberDraft({
                    ids: [...(selected.memberIds || [])],
                    roles: { ...(selected.memberRoles || {}) },
                  });
                  setMembersOpen(true);
                }}
              />
              <DeskBtn
                label="Rediger"
                muted
                onPress={() => {
                  setEditingTripId(selected.id);
                  setTripForm({
                    title: selected.title || '',
                    startDate: selected.startDate || '',
                    endDate: selected.endDate || '',
                    coverUrl: selected.coverUrl || null,
                    notes: selected.notes || '',
                  });
                  setTripFormOpen(true);
                }}
              />
            </>
          ) : (
            <View style={styles.readerBadge}>
              <Ionicons name="eye-outline" size={16} color={colors.muted} />
              <Text style={styles.readerBadgeTxt}>Du har leserettigheter</Text>
            </View>
          )}
        </View>

        {/* Destinations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Destinasjoner</Text>
          {dests.length === 0 ? (
            <Mute>Søk etter første reisemål — deretter B, C og videre. Destinasjonene vises på kartet.</Mute>
          ) : dests.map((d, i) => (
            <View
              key={d.id}
              style={[
                styles.destCard,
                focusDestId === d.id && styles.destCardFocus,
                d.checkedIn && styles.destCardIn,
              ]}
            >
              {i < dests.length - 1 ? <View style={styles.destRail} /> : null}
              <TouchableOpacity onPress={() => setFocusDestId(focusDestId === d.id ? null : d.id)}>
                <View style={styles.destHead}>
                  <View style={styles.destBadge}>
                    <Text style={styles.destBadgeTxt}>{String.fromCharCode(65 + (i % 26))}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.destName}>{d.name}</Text>
                    <Text style={styles.destSub} numberOfLines={2}>
                      {d.location?.label || 'Uten sted på kartet'}
                    </Text>
                    <Text style={styles.destDates} numberOfLines={1}>
                      {[
                        d.arriveAt ? `Ankomst ${formatDisplayDateTime(d.arriveAt)}` : null,
                        d.leaveAt ? `Avreise ${formatDisplayDateTime(d.leaveAt)}` : null,
                      ].filter(Boolean).join(' · ') || 'Uten dato'}
                    </Text>
                  </View>
                  {d.checkedIn ? (
                    <Ionicons name="checkmark-circle" size={22} color={ACCENT} />
                  ) : d.location?.lat != null ? (
                    <Ionicons name="location" size={18} color={ACCENT} />
                  ) : (
                    <Ionicons name="alert-circle-outline" size={18} color="#b45309" />
                  )}
                </View>
              </TouchableOpacity>

              {focusDestId === d.id || dests.length === 1 ? (
                <View style={styles.destBody}>
                  {d.notes ? <Text style={styles.destNotes}>{d.notes}</Text> : null}
                  <View style={styles.destActions}>
                    {!d.checkedIn ? (
                      <TouchableOpacity
                        style={styles.pillBtn}
                        onPress={() => checkInDestination(familyId, selected, d.id, uid)}
                      >
                        <Ionicons name="navigate" size={14} color="#fff" />
                        <Text style={styles.pillBtnTxt}>Sjekk inn</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.pillBtn, styles.pillBtnGhost]}
                      onPress={() => {
                        setMemoryDestId(d.id);
                        setMemoryText('');
                        setMemoryOpen(true);
                      }}
                    >
                      <Ionicons name="heart-outline" size={14} color={ACCENT} />
                      <Text style={[styles.pillBtnTxt, { color: ACCENT }]}>Minne</Text>
                    </TouchableOpacity>
                    {editable ? (
                      <>
                        <TouchableOpacity
                          style={[styles.pillBtn, styles.pillBtnGhost]}
                          onPress={() => {
                            setItemDestId(d.id);
                            setEditingItemId(null);
                            setItemForm(emptyItemForm(ITEM_TYPES.activity));
                            setItemFormOpen(true);
                          }}
                        >
                          <Ionicons name="add" size={14} color={ACCENT} />
                          <Text style={[styles.pillBtnTxt, { color: ACCENT }]}>Aktivitet</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.pillBtn, styles.pillBtnGhost]}
                          onPress={() => {
                            setItemDestId(d.id);
                            setEditingItemId(null);
                            setItemForm(emptyItemForm(ITEM_TYPES.ticket));
                            setItemFormOpen(true);
                          }}
                        >
                          <Ionicons name="ticket-outline" size={14} color={ACCENT} />
                          <Text style={[styles.pillBtnTxt, { color: ACCENT }]}>Billett</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.pillBtn, styles.pillBtnGhost]}
                          onPress={() => {
                            setEditingDestId(d.id);
                            setDestForm({
                              name: d.name || '',
                              location: d.location || null,
                              arriveAt: d.arriveAt || '',
                              leaveAt: d.leaveAt || '',
                              notes: d.notes || '',
                              coverUrl: d.coverUrl || null,
                            });
                            setDestFormOpen(true);
                          }}
                        >
                          <Text style={[styles.pillBtnTxt, { color: colors.muted }]}>Rediger</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </View>

                  {(d.items || []).map((it) => (
                    <View key={it.id} style={styles.itemRow}>
                      <Ionicons
                        name={
                          it.type === 'ticket'
                            ? (TICKET_KINDS.find((t) => t.id === it.ticketKind)?.icon || 'ticket')
                            : it.type === 'memory' ? 'heart' : 'sparkles'
                        }
                        size={16}
                        color={ACCENT}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>{it.title}</Text>
                        {it.description ? (
                          <Text style={styles.itemSub} numberOfLines={3}>{it.description}</Text>
                        ) : null}
                        {it.confirmationCode ? (
                          <Text style={styles.itemCode}>Ref: {it.confirmationCode}</Text>
                        ) : null}
                        {it.url ? (
                          <TouchableOpacity onPress={() => Linking.openURL(it.url)}>
                            <Text style={styles.itemLink}>Åpne lenke</Text>
                          </TouchableOpacity>
                        ) : null}
                        {it.imageUrl ? (
                          <Image source={{ uri: it.imageUrl }} style={styles.itemImg} />
                        ) : null}
                      </View>
                      {editable ? (
                        <TouchableOpacity
                          onPress={() => removeDestinationItem(familyId, selected, d.id, it.id)}
                          hitSlop={8}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.muted} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>

        {/* Timeline */}
        {timeline ? (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Tidslinje</Text>
              {timeline.pastCount > 0 ? (
                <TouchableOpacity onPress={() => setExpandPast((v) => !v)}>
                  <Text style={styles.linkBtn}>
                    {expandPast ? 'Skjul passerte' : `Vis ${timeline.pastCount} passerte`}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {!timeline.days.length ? (
              <View style={styles.timelineEmpty}>
                <Ionicons name="calendar-outline" size={22} color={ACCENT} />
                <Text style={styles.timelineEmptyTxt}>
                  Tidslinjen fylles når destinasjoner har ankomst- eller avreisedato.
                </Text>
              </View>
            ) : null}
            {!expandPast && timeline.pastDays.length ? (
              <TouchableOpacity
                style={styles.pastCollapse}
                onPress={() => setExpandPast(true)}
              >
                <Ionicons name="time-outline" size={16} color={PAST_INK} />
                <Text style={styles.pastCollapseTxt}>
                  {timeline.pastDays.length} passert{timeline.pastDays.length === 1 ? '' : 'e'} dag
                  {timeline.pastDays.length === 1 ? '' : 'er'} · trykk for å ekspandere
                </Text>
              </TouchableOpacity>
            ) : null}
            {(expandPast ? timeline.days : timeline.liveDays).map((day, idx, arr) => (
              <TimelineDay
                key={day.key}
                day={day}
                editable={editable}
                isLast={idx === arr.length - 1}
                onEventPress={(ev) => {
                  if (ev.destinationId) setFocusDestId(ev.destinationId);
                }}
              />
            ))}
          </View>
        ) : null}

        {selected.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notater</Text>
            <Text style={styles.destNotes}>{selected.notes}</Text>
          </View>
        ) : null}

        {editable ? (
          <TouchableOpacity style={styles.dangerBtn} onPress={() => setDeleteId(selected.id)}>
            <Text style={styles.dangerTxt}>Slett reise</Text>
          </TouchableOpacity>
        ) : null}

        <ModuleBgSpacer />
      </ScrollView>
    );
  };

  return (
    <Screen style={styles.screen}>
      <ModulePageFrame name="reiseplanlegger">
        {selected ? renderDetail() : renderList()}
      </ModulePageFrame>

      {/* Trip form */}
      <Modal visible={tripFormOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.sheet, isDesktop && styles.sheetDesk]}>
            <Text style={styles.sheetTitle}>{editingTripId ? 'Rediger reise' : 'Ny reise'}</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Navn</Text>
              <TextInput
                style={styles.input}
                value={tripForm.title}
                onChangeText={(t) => setTripForm((f) => ({ ...f, title: t }))}
                placeholder="F.eks. Sommerferie Italia"
                placeholderTextColor={colors.placeholder}
              />
              <Text style={styles.label}>Fra dato</Text>
              <DateField
                value={tripForm.startDate || null}
                onChange={(d) => setTripForm((f) => ({
                  ...f,
                  startDate: d ? dateKey(d) : '',
                  endDate: f.endDate && d && dateKey(d) > f.endDate ? dateKey(d) : f.endDate,
                }))}
                placeholder="Velg startdato"
                iconColor={ACCENT}
              />
              <Text style={styles.label}>Til dato</Text>
              <DateField
                value={tripForm.endDate || null}
                onChange={(d) => setTripForm((f) => ({ ...f, endDate: d ? dateKey(d) : '' }))}
                placeholder="Velg sluttdato"
                min={tripForm.startDate || undefined}
                iconColor={ACCENT}
              />
              <Text style={styles.label}>Notater</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={tripForm.notes}
                onChangeText={(t) => setTripForm((f) => ({ ...f, notes: t }))}
                multiline
                placeholder="Praktisk info, ønsker…"
                placeholderTextColor={colors.placeholder}
              />
              <DeskBtn label="Last opp cover" muted onPress={() => pickCover('trip')} />
              {tripForm.coverUrl ? (
                <Image source={{ uri: tripForm.coverUrl }} style={styles.preview} />
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>
            <View style={styles.sheetActions}>
              <DeskBtn label="Avbryt" muted onPress={() => setTripFormOpen(false)} />
              <DeskBtn label={saving ? 'Lagrer…' : 'Lagre'} primary onPress={saveTrip} disabled={saving} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Destination form */}
      <Modal visible={destFormOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.sheet, isDesktop && styles.sheetDesk]}>
            <Text style={styles.sheetTitle}>{editingDestId ? 'Rediger destinasjon' : 'Ny destinasjon'}</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Reisemål (søk)</Text>
              <Mute>Søk sted først — det plasserer stoppet på kartet.</Mute>
              <View style={{ height: 6 }} />
              <PlaceSearch
                value={destForm.location}
                autoFocus={!editingDestId}
                placeholder="Søk fra / til destinasjon…"
                onChange={(loc) => setDestForm((f) => {
                  if (!loc) return { ...f, location: null };
                  const prevShort = f.location?.shortName
                    || (f.location?.label || '').split(',')[0]?.trim()
                    || '';
                  const nextShort = loc.shortName || (loc.label || '').split(',')[0]?.trim() || '';
                  const keepName = f.name && f.name !== prevShort;
                  return {
                    ...f,
                    location: loc,
                    name: keepName ? f.name : nextShort,
                  };
                })}
              />
              <Text style={styles.label}>Visningsnavn</Text>
              <TextInput
                style={styles.input}
                value={destForm.name}
                onChangeText={(t) => setDestForm((f) => ({ ...f, name: t }))}
                placeholder="F.eks. Roma"
                placeholderTextColor={colors.placeholder}
              />
              <Text style={styles.label}>Ankomst</Text>
              <DateTimeRow
                date={splitDateTime(destForm.arriveAt).date}
                time={splitDateTime(destForm.arriveAt).time}
                onDateChange={(date) => {
                  const { time } = splitDateTime(destForm.arriveAt);
                  setDestForm((f) => ({ ...f, arriveAt: joinDateTime(date, time) }));
                }}
                onTimeChange={(time) => {
                  const { date } = splitDateTime(destForm.arriveAt);
                  setDestForm((f) => ({ ...f, arriveAt: joinDateTime(date || dateKey(new Date()), time) }));
                }}
                datePlaceholder="Ankomstdato"
                timePlaceholder="Klokke"
              />
              <Text style={styles.label}>Avreise</Text>
              <DateTimeRow
                date={splitDateTime(destForm.leaveAt).date}
                time={splitDateTime(destForm.leaveAt).time}
                onDateChange={(date) => {
                  const { time } = splitDateTime(destForm.leaveAt);
                  setDestForm((f) => ({ ...f, leaveAt: joinDateTime(date, time) }));
                }}
                onTimeChange={(time) => {
                  const { date } = splitDateTime(destForm.leaveAt);
                  const fallback = splitDateTime(destForm.arriveAt).date || dateKey(new Date());
                  setDestForm((f) => ({ ...f, leaveAt: joinDateTime(date || fallback, time) }));
                }}
                datePlaceholder="Avreisedato"
                timePlaceholder="Klokke"
                minDate={splitDateTime(destForm.arriveAt).date || undefined}
              />
              {(destForm.arriveAt || destForm.leaveAt) ? (
                <TouchableOpacity
                  onPress={() => setDestForm((f) => ({ ...f, arriveAt: '', leaveAt: '' }))}
                  style={{ marginBottom: 8 }}
                >
                  <Text style={styles.clearDates}>Fjern datoer</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={styles.label}>Tekst / tips</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={destForm.notes}
                onChangeText={(t) => setDestForm((f) => ({ ...f, notes: t }))}
                multiline
                placeholderTextColor={colors.placeholder}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>
            <View style={styles.sheetActions}>
              <DeskBtn label="Avbryt" muted onPress={() => setDestFormOpen(false)} />
              <DeskBtn label={saving ? 'Lagrer…' : 'Lagre'} primary onPress={saveDest} disabled={saving} />
            </View>
            {editingDestId ? (
              <TouchableOpacity
                style={styles.dangerBtn}
                onPress={async () => {
                  await removeDestination(familyId, selected, editingDestId);
                  setDestFormOpen(false);
                }}
              >
                <Text style={styles.dangerTxt}>Fjern destinasjon</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Item form */}
      <Modal visible={itemFormOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.sheet, isDesktop && styles.sheetDesk]}>
            <Text style={styles.sheetTitle}>
              {itemForm.type === ITEM_TYPES.ticket ? 'Billett / booking' : 'Aktivitet / gjøremål'}
            </Text>
            <ScrollView>
              <View style={styles.typeRow}>
                {[ITEM_TYPES.activity, ITEM_TYPES.todo, ITEM_TYPES.ticket, ITEM_TYPES.event, ITEM_TYPES.note, ITEM_TYPES.photo]
                  .map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeChip, itemForm.type === t && styles.typeChipOn]}
                      onPress={() => setItemForm((f) => ({ ...f, type: t }))}
                    >
                      <Text style={[styles.typeChipTxt, itemForm.type === t && styles.typeChipTxtOn]}>
                        {t === 'todo' ? 'Gjøremål' : t === 'ticket' ? 'Billett' : t === 'event' ? 'Event' : t === 'note' ? 'Tekst' : t === 'photo' ? 'Bilde' : 'Aktivitet'}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>
              {itemForm.type === ITEM_TYPES.ticket ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {TICKET_KINDS.map((k) => (
                    <TouchableOpacity
                      key={k.id}
                      style={[styles.typeChip, itemForm.ticketKind === k.id && styles.typeChipOn]}
                      onPress={() => setItemForm((f) => ({ ...f, ticketKind: k.id }))}
                    >
                      <Text style={[styles.typeChipTxt, itemForm.ticketKind === k.id && styles.typeChipTxtOn]}>
                        {k.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}
              <Text style={styles.label}>Tittel</Text>
              <TextInput
                style={styles.input}
                value={itemForm.title}
                onChangeText={(t) => setItemForm((f) => ({ ...f, title: t }))}
                placeholderTextColor={colors.placeholder}
              />
              <Text style={styles.label}>Beskrivelse</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={itemForm.description}
                onChangeText={(t) => setItemForm((f) => ({ ...f, description: t }))}
                multiline
                placeholderTextColor={colors.placeholder}
              />
              <Text style={styles.label}>Tidspunkt</Text>
              <DateTimeRow
                date={splitDateTime(itemForm.startAt).date}
                time={splitDateTime(itemForm.startAt).time}
                onDateChange={(date) => {
                  const { time } = splitDateTime(itemForm.startAt);
                  setItemForm((f) => ({ ...f, startAt: joinDateTime(date, time) }));
                }}
                onTimeChange={(time) => {
                  const { date } = splitDateTime(itemForm.startAt);
                  setItemForm((f) => ({
                    ...f,
                    startAt: joinDateTime(date || dateKey(new Date()), time),
                  }));
                }}
                datePlaceholder="Velg dato"
                timePlaceholder="Klokke"
              />
              {itemForm.startAt ? (
                <TouchableOpacity
                  onPress={() => setItemForm((f) => ({ ...f, startAt: '' }))}
                  style={{ marginBottom: 8 }}
                >
                  <Text style={styles.clearDates}>Fjern tidspunkt</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={styles.label}>Lenke</Text>
              <TextInput
                style={styles.input}
                value={itemForm.url || ''}
                onChangeText={(t) => setItemForm((f) => ({ ...f, url: t }))}
                autoCapitalize="none"
                placeholder="https://…"
                placeholderTextColor={colors.placeholder}
              />
              <Text style={styles.label}>Bookingkode</Text>
              <TextInput
                style={styles.input}
                value={itemForm.confirmationCode || ''}
                onChangeText={(t) => setItemForm((f) => ({ ...f, confirmationCode: t }))}
                placeholderTextColor={colors.placeholder}
              />
              <DeskBtn label="Legg ved bilde" muted onPress={() => pickCover('item')} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>
            <View style={styles.sheetActions}>
              <DeskBtn label="Avbryt" muted onPress={() => setItemFormOpen(false)} />
              <DeskBtn label={saving ? 'Lagrer…' : 'Lagre'} primary onPress={saveItem} disabled={saving} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Members */}
      <Modal visible={membersOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.sheet, isDesktop && styles.sheetDesk]}>
            <Text style={styles.sheetTitle}>Reisefølge & rettigheter</Text>
            <Mute>Planleggere kan redigere. Lesere ser planen.</Mute>
            <ScrollView style={{ marginTop: 12 }}>
              {members.map((m) => {
                const id = memberKey(m);
                if (!id) return null;
                const on = memberDraft.ids.includes(id);
                const role = memberDraft.roles[id] || ROLES.reader;
                const isOwner = id === selected?.createdBy;
                return (
                  <View key={id} style={styles.memberRow}>
                    <TouchableOpacity
                      style={styles.memberLeft}
                      onPress={() => {
                        if (isOwner) return;
                        setMemberDraft((d) => {
                          const ids = on ? d.ids.filter((x) => x !== id) : [...d.ids, id];
                          const roles = { ...d.roles };
                          if (!on) roles[id] = ROLES.reader;
                          else delete roles[id];
                          return { ids, roles };
                        });
                      }}
                    >
                      <AvatarBubble
                        photoURL={m.photoURL}
                        avatarId={m.avatarId}
                        name={m.name}
                        size={36}
                        color={m.color}
                      />
                      <View>
                        <Text style={styles.memberName}>{m.name}</Text>
                        <Text style={styles.memberRole}>
                          {isOwner ? 'Eier · planlegger' : on ? memberRoleLabel(role) : 'Ikke invitert'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    {on && !isOwner ? (
                      <TouchableOpacity
                        style={styles.roleToggle}
                        onPress={() => setMemberDraft((d) => ({
                          ...d,
                          roles: {
                            ...d.roles,
                            [id]: role === ROLES.planner ? ROLES.reader : ROLES.planner,
                          },
                        }))}
                      >
                        <Text style={styles.roleToggleTxt}>
                          {role === ROLES.planner ? 'Planlegger' : 'Leser'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Ionicons
                        name={on ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={on ? ACCENT : colors.line}
                      />
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.sheetActions}>
              <DeskBtn label="Avbryt" muted onPress={() => setMembersOpen(false)} />
              <DeskBtn label={saving ? 'Lagrer…' : 'Lagre'} primary onPress={saveMembers} disabled={saving} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Memory */}
      <Modal visible={memoryOpen} animationType="fade" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setMemoryOpen(false)}>
          <Pressable style={[styles.sheet, isDesktop && styles.sheetDesk]} onPress={(e) => e.stopPropagation?.()}>
            <Text style={styles.sheetTitle}>Legg til minne</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={memoryText}
              onChangeText={setMemoryText}
              placeholder="Hva husker du fra dette stedet?"
              placeholderTextColor={colors.placeholder}
              multiline
            />
            <View style={styles.sheetActions}>
              <DeskBtn label="Avbryt" muted onPress={() => setMemoryOpen(false)} />
              <DeskBtn label="Lagre minne" primary onPress={saveMemory} disabled={saving || !memoryText.trim()} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmActionModal
        visible={!!deleteId}
        title="Slett reise?"
        body="Reisen og destinasjonene fjernes fra listen."
        confirmLabel="Slett"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={async () => {
          if (deleteId) {
            await softDeleteTrip(familyId, deleteId);
            setSelectedId(null);
          }
          setDeleteId(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  scroll: { padding: 16, paddingBottom: 40, gap: 8 },
  hero: { marginBottom: 8 },
  brand: {
    fontSize: 28,
    fontWeight: '400',
    color: '#0f766e',
    letterSpacing: -0.6,
    fontFamily: Platform.OS === 'web' ? 'Fraunces, Georgia, serif' : undefined,
  },
  heroLead: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    maxWidth: 520,
  },
  section: { marginTop: 18, gap: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '400',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#0f766e',
    marginBottom: 2,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tripCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#99f6e4',
    gap: 6,
  },
  tripCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tripTitle: { fontSize: 17, fontWeight: '400', color: colors.ink },
  tripDates: { fontSize: 13, color: colors.muted, marginTop: 2 },
  tripRoute: { fontSize: 14, color: '#0f766e', fontWeight: '400' },
  tripRouteMuted: { fontSize: 13, color: colors.placeholder },
  tripCardFoot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4,
  },
  tripMeta: { fontSize: 12, color: colors.muted },
  avatarRow: { flexDirection: 'row' },
  avatarOverlap: { marginRight: -8 },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusChipTxt: { fontSize: 11, fontWeight: '400' },
  countdown: { fontSize: 11, fontWeight: '400', color: SUN },
  emptyBox: {
    alignItems: 'center',
    padding: 24,
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ACCENT_SOFT,
  },
  emptyTitle: { fontSize: 16, fontWeight: '400', color: colors.ink, marginTop: 6 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 8 },
  backTxt: { color: ACCENT, fontWeight: '400', fontSize: 14 },
  cover: {
    width: '100%',
    height: 160,
    borderRadius: 18,
    marginBottom: 12,
    backgroundColor: ACCENT_SOFT,
  },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  nowNext: {
    backgroundColor: '#ffedd5',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  nowNextKicker: {
    fontSize: 11, fontWeight: '400', letterSpacing: 0.5, color: '#c2410c', textTransform: 'uppercase',
  },
  nowNextTitle: { fontSize: 18, fontWeight: '400', color: colors.ink, marginTop: 2 },
  nowNextSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 4 },
  readerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
  },
  readerBadgeTxt: { fontSize: 13, color: colors.muted, fontWeight: '400' },
  destCard: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    position: 'relative',
    overflow: 'visible',
  },
  destCardFocus: { borderColor: ACCENT },
  destCardIn: { borderColor: '#5eead4', backgroundColor: '#f0fdfa' },
  destRail: {
    position: 'absolute',
    left: 27,
    top: 44,
    bottom: -18,
    width: 2,
    backgroundColor: '#99f6e4',
    zIndex: 0,
  },
  destHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  destBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center',
    zIndex: 1,
  },
  destBadgeTxt: { color: '#fff', fontWeight: '400', fontSize: 13 },
  destName: { fontSize: 16, fontWeight: '400', color: colors.ink },
  destSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  destDates: { fontSize: 12, color: '#0f766e', fontWeight: '400', marginTop: 2 },
  destBody: { marginTop: 10, gap: 8 },
  destNotes: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  destActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pillBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: ACCENT, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  pillBtnGhost: { backgroundColor: ACCENT_SOFT },
  pillBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '400' },
  itemRow: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line,
  },
  itemTitle: { fontSize: 14, fontWeight: '400', color: colors.ink },
  itemSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  itemCode: { fontSize: 12, color: SUN, fontWeight: '400', marginTop: 2 },
  itemLink: { fontSize: 13, color: colors.brand, marginTop: 2, fontWeight: '400' },
  itemImg: { width: '100%', height: 120, borderRadius: 12, marginTop: 6 },
  dayBlock: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    position: 'relative',
    overflow: 'visible',
  },
  dayBlockPast: { backgroundColor: 'rgba(248,250,252,0.85)', borderColor: '#e2e8f0' },
  timelineRail: {
    position: 'absolute',
    left: 14,
    top: 28,
    bottom: -18,
    width: 2,
    backgroundColor: '#99f6e4',
    zIndex: 0,
  },
  timelineRailPast: { backgroundColor: '#e2e8f0' },
  timelineEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: ACCENT_SOFT,
  },
  timelineEmptyTxt: { flex: 1, fontSize: 13, color: '#0f766e', fontWeight: '500', lineHeight: 18 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT, zIndex: 1 },
  dayDotHot: { backgroundColor: '#ea580c', width: 12, height: 12, borderRadius: 6 },
  dayDotPast: { backgroundColor: PAST_INK },
  dayLabel: { fontSize: 14, fontWeight: '400', color: colors.ink },
  dayLabelPast: { color: PAST_INK, fontWeight: '500' },
  daySub: { fontSize: 12, color: colors.muted },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 8, marginLeft: 8, paddingVertical: 4,
  },
  eventRowPast: { opacity: 0.72 },
  eventIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: ACCENT_SOFT, alignItems: 'center', justifyContent: 'center',
  },
  eventIconPast: { backgroundColor: '#f1f5f9' },
  eventTitle: { fontSize: 14, fontWeight: '400', color: colors.ink },
  eventSub: { fontSize: 12, color: colors.muted },
  pastCollapse: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, borderRadius: 12, backgroundColor: '#f8fafc',
  },
  pastCollapseTxt: { fontSize: 13, color: PAST_INK, fontWeight: '400' },
  linkBtn: {
    alignSelf: 'flex-start', fontSize: 13, color: ACCENT, fontWeight: '400' },
  dangerBtn: {
    alignSelf: 'flex-start', alignItems: 'center', padding: 14, marginTop: 20 },
  dangerTxt: { color: colors.danger, fontWeight: '400' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    maxHeight: '92%',
    gap: 8,
  },
  sheetDesk: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
    borderRadius: 20,
    marginBottom: 40,
  },
  sheetTitle: { fontSize: 18, fontWeight: '400', color: colors.ink, marginBottom: 4 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  label: { fontSize: 12, fontWeight: '400', color: colors.muted, marginTop: 8, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  error: { color: colors.danger, marginTop: 8 },
  preview: { width: '100%', height: 120, borderRadius: 12, marginTop: 8 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 10,
    backgroundColor: colors.card,
  },
  searchIcon: { marginLeft: 2 },
  searchInput: {
    flex: 1,
    borderWidth: 0,
    paddingHorizontal: 0,
    marginBottom: 0,
  },
  searchSpin: { marginRight: 2 },
  hitList: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 12, marginTop: 4, overflow: 'hidden',
  },
  hitRow: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    padding: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  hitTxt: { flex: 1, fontSize: 13, color: colors.ink },
  placeOk: { marginTop: 6, fontSize: 12, color: '#0f766e', fontWeight: '400' },
  placeWarn: { marginTop: 6, fontSize: 12, color: '#b45309' },
  dateTimeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dateFieldFlex: { flex: 1 },
  timeFieldFixed: { width: 118, flexShrink: 0 },
  clearDates: { fontSize: 13, color: ACCENT, fontWeight: '400' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  typeChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  typeChipOn: { backgroundColor: ACCENT_SOFT },
  typeChipTxt: { fontSize: 12, fontWeight: '400', color: colors.muted },
  typeChipTxtOn: { color: '#0f766e' },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  memberLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  memberName: { fontSize: 15, fontWeight: '400', color: colors.ink },
  memberRole: { fontSize: 12, color: colors.muted },
  roleToggle: {
    backgroundColor: ACCENT_SOFT, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  roleToggleTxt: { fontSize: 12, fontWeight: '400', color: '#0f766e' },
});
