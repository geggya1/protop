import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform, Modal, Pressable, ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { addDoc, collection, doc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { colors, MEMBER_COLORS, radius, useLayout } from '../../src/theme';
import { dateKey, parseDateKey, WEEKDAYS_SHORT } from '../../src/utils/dates';
import {
  REPEAT_PRESETS, CUSTOM_FREQS, initRepeatFromEvent, buildRecurrencePayload,
  repeatSummaryLabel, repeatDescriptionText, memberPickId,
} from '../../src/utils/events';
import { Screen, Title, ScrollBody, BigButton, Mute } from '../../components/ui';
import DesktopFormShell from '../../components/DesktopFormShell';
import { InfoDialog } from '../../components/ConfirmDialog';
import HelpTarget from '../../components/HelpTarget';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import { notifyUsers } from '../../src/utils/notifications';
import { syncCalendarEventFriendShares } from '../../src/utils/friends';
import { friendUidsFromPicked, synligForSummary } from '../../src/utils/eventSharing';
import { resolveEventWriteTarget } from '../../src/utils/eventWriteTarget';
import {
  isExternalCalendarEvent,
  externalEventVisibilityDocId,
  externalEventMirrorId,
  defaultExternalEventVisibility,
  applyVisibilityToFormState,
  isOwnerOnlyVisibility,
  buildExternalVisibilityPayload,
  buildExternalMirrorEvent,
} from '../../src/utils/externalEventVisibility';

// Parse "HH:MM" -> Date (today at that time)
function parseTimeStr(str) {
  const parts = (str || '').split(':').map(Number);
  const d = new Date();
  d.setHours(parts[0] || 0, parts[1] || 0, 0, 0);
  return d;
}

// Format Date -> "HH:MM"
function fmtTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function addHour(str) {
  const d = parseTimeStr(str);
  d.setHours(d.getHours() + 1);
  return fmtTime(d);
}

// Default start = next round hour, end = start + 1h
function defaultTimes(existingStart, existingEnd) {
  if (existingStart) return { start: existingStart, end: existingEnd || addHour(existingStart) };
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const end = new Date(now);
  end.setHours(end.getHours() + 1);
  return { start: fmtTime(now), end: fmtTime(end) };
}

/** «31. aug. 2026» */
function formatCompactDate(key) {
  if (!key) return '';
  const dt = parseDateKey(key);
  if (!dt) return String(key);
  return dt.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

const INTERVAL_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1);

const STOP_PRESETS = [
  { id: 'never', label: 'Aldri' },
  { id: 'date', label: 'På en dato' },
];

function DateCapsule({ value, onChange, min, disabled }) {
  const [show, setShow] = useState(false);
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  const label = formatCompactDate(value);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.capsule, disabled && styles.capsuleDisabled]}>
        <Text style={styles.capsuleTxt} numberOfLines={1}>{label}</Text>
        {!disabled ? (
          <input
            type="date"
            value={value || ''}
            min={min || undefined}
            onChange={(e) => onChange(e.target.value)}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0,
              cursor: 'pointer',
              width: '100%',
              height: '100%',
              border: 'none',
            }}
          />
        ) : null}
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.capsule, disabled && styles.capsuleDisabled]}
        onPress={() => !disabled && setShow(true)}
        disabled={disabled}
      >
        <Text style={styles.capsuleTxt} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={date}
          mode="date"
          minimumDate={min ? new Date(`${min}T12:00:00`) : undefined}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(e, selected) => {
            if (Platform.OS !== 'ios') setShow(false);
            if (e?.type === 'dismissed') { setShow(false); return; }
            if (selected) onChange(dateKey(selected));
          }}
        />
      )}
      {Platform.OS === 'ios' && show && (
        <TouchableOpacity onPress={() => setShow(false)} style={styles.doneBtn}>
          <Text style={styles.doneBtnTxt}>Ferdig</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

function TimeCapsule({ value, onChange, disabled }) {
  const [show, setShow] = useState(false);
  const date = parseTimeStr(value);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.capsule, styles.timeCapsule, disabled && styles.capsuleDisabled]}>
        <Text style={styles.capsuleTxt}>{value || '--:--'}</Text>
        {!disabled ? (
          <input
            type="time"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0,
              cursor: 'pointer',
              width: '100%',
              height: '100%',
              border: 'none',
            }}
          />
        ) : null}
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.capsule, styles.timeCapsule, disabled && styles.capsuleDisabled]}
        onPress={() => !disabled && setShow(true)}
        disabled={disabled}
      >
        <Text style={styles.capsuleTxt}>{value || '--:--'}</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={date}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, selected) => {
            if (Platform.OS !== 'ios') setShow(false);
            if (e?.type === 'dismissed') { setShow(false); return; }
            if (selected) onChange(fmtTime(selected));
          }}
        />
      )}
      {Platform.OS === 'ios' && show && (
        <TouchableOpacity onPress={() => setShow(false)} style={styles.doneBtn}>
          <Text style={styles.doneBtnTxt}>Ferdig</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

function GroupCard({ children, style }) {
  return <View style={[styles.groupCard, style]}>{children}</View>;
}

function RowDivider() {
  return <View style={styles.rowDivider} />;
}

export default function EventFormScreen() {
  const nav = useNavigation();
  useHelpScene('inner', { onRetreat: () => nav.goBack() });
  const { params } = useRoute();
  const { isDesktop } = useLayout();
  const { familyId: activeFamilyId, members, friendPeople, uid, isParent } = useApp();

  const existing = params?.event || null;
  const isEdit = !!existing;
  const isReadOnly = !!existing?.readOnly;
  const isExternalEvent = isExternalCalendarEvent(existing);
  const visibilityEditOnly = isEdit && isParent && isExternalEvent;
  const contentReadOnly = isReadOnly || visibilityEditOnly;
  const canEditVisibility = visibilityEditOnly || !contentReadOnly;
  // Cross-family private events live under the source family — never the active one.
  const writeTarget = useMemo(
    () => resolveEventWriteTarget(existing, params?.familyId || activeFamilyId),
    [existing, params?.familyId, activeFamilyId],
  );
  const familyId = writeTarget.familyId || params?.familyId || activeFamilyId;
  const eventDocId = writeTarget.eventId || null;

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [infoDialog, setInfoDialog] = useState({ visible: false, title: '', message: '' });

  const showInfo = (title, message) => {
    if (Platform.OS === 'web') {
      setInfoDialog({ visible: true, title, message });
      return;
    }
    Alert.alert(title, message);
  };

  const slotStart = existing ? null : (params?.startTime || null);
  const slotEnd = existing ? null : (params?.endTime || null);
  const defaults = defaultTimes(existing?.startTime || slotStart, existing?.endTime || slotEnd);
  const initRepeat = useMemo(() => initRepeatFromEvent(existing), [existing]);

  const [title, setTitle] = useState(existing?.title || params?.title || '');
  // Ved redigering: alltid serie-/startdato (ikke occurrenceDateKey fra en midtdag)
  const [when, setWhen] = useState(
    existing?.dateKey
    || params?.dateKey
    || dateKey(new Date())
  );
  const [until, setUntil] = useState(() => {
    const start = existing?.dateKey || params?.dateKey || dateKey(new Date());
    const end = existing?.endDateKey || existing?.endKey || start;
    return String(end) >= String(start) ? end : start;
  });
  const [startTime, setStartTime] = useState(defaults.start);
  const [endTime, setEndTime] = useState(defaults.end);
  const [place, setPlace] = useState(existing?.place || '');
  const [wholeFamily, setWholeFamily] = useState(() => {
    if (!existing) return false;
    if (existing.audience === 'family') return true;
    if (existing.audience === 'selected') return false;
    return !Array.isArray(existing.memberIds) || existing.memberIds.length === 0;
  });
  const [picked, setPicked] = useState(() => {
    if (existing?.memberIds?.length) return [...existing.memberIds];
    if (existing && (!existing.memberIds || !existing.memberIds.length)) return [];
    return uid ? [uid] : [];
  });
  const [saving, setSaving] = useState(false);
  const [visibilityLoaded, setVisibilityLoaded] = useState(!visibilityEditOnly);
  const [initialVisibility, setInitialVisibility] = useState(null);
  const [allDay, setAllDay] = useState(() => {
    if (existing) return !existing.startTime;
    if (params?.allDay === true) return true;
    if (params?.allDay === false || params?.startTime) return false;
    // Nye hendelser: vis klokkeslett som standard (ikke heldag)
    return false;
  });

  useEffect(() => {
    if (isEdit || !uid) return;
    setPicked((prev) => (prev.length ? prev : [uid]));
  }, [uid, isEdit]);

  // Normaliser lagrede id-er til kanoniske pick-id-er (barn = doc id).
  useEffect(() => {
    if (!members?.length || !picked.length) return;
    setPicked((prev) => {
      const next = prev.map((id) => {
        const m = members.find((x) => (
          x.uid === id || x.id === id || x.docId === id || x.childId === id
        ));
        return m ? (memberPickId(m) || id) : id;
      });
      const same = next.length === prev.length && next.every((v, i) => v === prev[i]);
      return same ? prev : [...new Set(next.filter(Boolean))];
    });
  }, [members]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visibilityEditOnly || !familyId || !existing?.id) {
      setVisibilityLoaded(true);
      return undefined;
    }
    let alive = true;
    const visId = externalEventVisibilityDocId(existing.id);
    getDoc(doc(db, 'families', familyId, 'externalEventVisibility', visId))
      .then((snap) => {
        if (!alive) return;
        const state = snap.exists()
          ? applyVisibilityToFormState(snap.data(), uid)
          : defaultExternalEventVisibility(uid);
        setWholeFamily(state.wholeFamily);
        setPicked(state.picked);
        setInitialVisibility({ wholeFamily: state.wholeFamily, picked: [...state.picked] });
        setVisibilityLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        const state = defaultExternalEventVisibility(uid);
        setWholeFamily(state.wholeFamily);
        setPicked(state.picked);
        setInitialVisibility({ wholeFamily: state.wholeFamily, picked: [...state.picked] });
        setVisibilityLoaded(true);
      });
    return () => { alive = false; };
  }, [visibilityEditOnly, familyId, existing?.id, uid]);

  const visibilityDirty = useMemo(() => {
    if (!visibilityEditOnly || !initialVisibility) return false;
    if (wholeFamily !== initialVisibility.wholeFamily) return true;
    const a = [...picked].sort().join('|');
    const b = [...initialVisibility.picked].sort().join('|');
    return a !== b;
  }, [visibilityEditOnly, initialVisibility, wholeFamily, picked]);

  const [preset, setPreset] = useState(initRepeat.preset);
  const [customType, setCustomType] = useState(initRepeat.customType);
  const [customInterval, setCustomInterval] = useState(initRepeat.customInterval);
  const [recurrenceByDays, setRecurrenceByDays] = useState(initRepeat.recurrenceByDays);
  const [recurrenceUntilKey, setRecurrenceUntilKey] = useState(initRepeat.recurrenceUntilKey);

  const [showRepeatPicker, setShowRepeatPicker] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [showStopPicker, setShowStopPicker] = useState(false);
  const [showCustomFreqPicker, setShowCustomFreqPicker] = useState(false);

  const baseDay = useMemo(() => {
    const dt = parseDateKey(when);
    return dt?.getDay?.() ?? 0;
  }, [when]);

  useEffect(() => {
    if (preset === 'never' || preset === 'daily' || preset === 'monthly' || preset === 'yearly') return;
    const isWeekly = preset === 'weekly' || preset === 'biweekly' || (preset === 'custom' && customType === 'weekly');
    if (!isWeekly) return;
    if (Array.isArray(recurrenceByDays) && recurrenceByDays.length > 0) return;
    setRecurrenceByDays([baseDay]);
  }, [preset, customType, recurrenceByDays, baseDay]);

  const repeatLabel = useMemo(() => repeatSummaryLabel({
    preset, customType, customInterval, recurrenceByDays, recurrenceUntilKey,
  }), [preset, customType, customInterval, recurrenceByDays, recurrenceUntilKey]);

  const repeatHint = useMemo(() => repeatDescriptionText({
    preset, customType, customInterval, recurrenceByDays,
  }), [preset, customType, customInterval, recurrenceByDays]);

  const stopLabel = recurrenceUntilKey ? 'På en dato' : 'Aldri';

  const customFreqLabel = CUSTOM_FREQS.find((f) => f.id === customType)?.label || 'Ukentlig';
  const customUnit = CUSTOM_FREQS.find((f) => f.id === customType)?.unit || 'uke';

  const color = useMemo(() => {
    if (existing?.color) return existing.color;
    return MEMBER_COLORS[title.length % MEMBER_COLORS.length];
  }, [title.length, existing?.color]);

  // When start changes, push end +1h if end is at or before start
  const handleStartChange = (val) => {
    setStartTime(val);
    const start = parseTimeStr(val);
    const end = parseTimeStr(endTime);
    if (end <= start) {
      const newEnd = new Date(start);
      newEnd.setHours(newEnd.getHours() + 1);
      setEndTime(fmtTime(newEnd));
    }
  };

  const toggle = (id) => {
    // Klikk på person mens «Hele familien» er på → bytt til valgte, start med den personen.
    if (wholeFamily) {
      setWholeFamily(false);
      setPicked([id]);
      return;
    }
    setPicked((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        // Alltid minst én person når det ikke er «hele familien».
        return next.length ? next : (uid ? [uid] : prev);
      }
      return [...prev, id];
    });
  };

  const toggleWholeFamily = () => {
    setWholeFamily((prev) => {
      const next = !prev;
      if (!next && uid && !picked.length) setPicked([uid]);
      return next;
    });
  };

  const toggleRecurrenceDay = (day) => {
    setRecurrenceByDays((prev) => (prev.includes(day) ? prev.filter((x) => x !== day) : [...prev, day]));
  };

  const selectPreset = (id) => {
    if (id === 'custom') {
      setShowRepeatPicker(false);
      setShowCustomPicker(true);
      setPreset('custom');
      return;
    }
    setPreset(id);
    setShowRepeatPicker(false);
  };

  const setFromDate = (key) => {
    const wasSameDay = !until || String(until) === String(when);
    setWhen(key);
    setUntil((prev) => {
      if (wasSameDay) return key;
      return prev && String(prev) >= String(key) ? prev : key;
    });
  };

  const setToDate = (key) => {
    setUntil(key && String(key) < String(when) ? when : key);
  };

  const handleEndDateChange = (key) => {
    setToDate(key);
  };

  const handleEndTimeChange = (val) => {
    if (String(until) === String(when)) {
      const start = parseTimeStr(startTime);
      const end = parseTimeStr(val);
      if (end <= start) {
        const newEnd = new Date(start);
        newEnd.setHours(newEnd.getHours() + 1);
        setEndTime(fmtTime(newEnd));
        return;
      }
    }
    setEndTime(val);
  };

  const saveVisibility = async () => {
    if (!visibilityEditOnly || !familyId || !existing?.id || !uid) return;
    setSaving(true);
    try {
      const visId = externalEventVisibilityDocId(existing.id);
      const visRef = doc(db, 'families', familyId, 'externalEventVisibility', visId);
      const payload = buildExternalVisibilityPayload({
        existing,
        wholeFamily,
        picked,
        ownerUid: uid,
      });
      const ownerOnly = isOwnerOnlyVisibility({ wholeFamily, picked, ownerUid: uid });
      const mirrorEventId = externalEventMirrorId(existing.id);
      const prevFriendUids = friendUidsFromPicked(initialVisibility?.picked || [], {
        members,
        ownerUid: uid,
      });
      const nextFriendUids = wholeFamily
        ? []
        : friendUidsFromPicked(payload.memberIds, { members, ownerUid: uid });
      const familyUids = new Set(
        (members || []).map((m) => memberPickId(m)).filter(Boolean),
      );

      await setDoc(visRef, {
        ...payload,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      }, { merge: true });

      const mirrorRef = doc(db, 'families', familyId, 'events', mirrorEventId);
      if (ownerOnly) {
        try { await deleteDoc(mirrorRef); } catch { /* ignore */ }
        await syncCalendarEventFriendShares({
          familyId,
          eventId: mirrorEventId,
          title: payload.title,
          startsAt: payload.dateKey,
          ownerUid: uid,
          friendUids: [],
          previousFriendUids: prevFriendUids,
        }).catch(() => {});
      } else {
        await setDoc(mirrorRef, {
          ...buildExternalMirrorEvent(payload, uid),
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        }, { merge: true });
        const notifyIds = wholeFamily
          ? [...familyUids].filter((id) => id && id !== uid)
          : payload.memberIds.filter((id) => id !== uid && familyUids.has(id));
        if (notifyIds.length) {
          notifyUsers(notifyIds, {
            eventType: 'eventCreated',
            title: 'Delt kalenderhendelse',
            body: payload.title || 'Hendelse',
            familyId,
            createdBy: uid,
          }).catch(() => {});
        }
        await syncCalendarEventFriendShares({
          familyId,
          eventId: mirrorEventId,
          title: payload.title,
          startsAt: payload.dateKey,
          ownerUid: uid,
          friendUids: nextFriendUids,
          previousFriendUids: prevFriendUids,
        }).catch(() => {});
      }
      nav.goBack();
    } catch (e) {
      console.warn('[EventForm] save visibility failed', e);
      showInfo('Feil', 'Klarte ikke oppdatere synlighet.');
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (contentReadOnly) return;
    if (!title.trim() || !familyId) return;
    if (isEdit && !eventDocId) {
      showInfo('Feil', 'Mangler hendelses-id — kan ikke lagre.');
      return;
    }
    setSaving(true);
    try {
      const recurrence = buildRecurrencePayload({
        preset,
        customType,
        customInterval,
        recurrenceByDays,
        recurrenceUntilKey,
        baseDay,
      });

      const selectedIds = wholeFamily
        ? []
        : [...new Set((picked.length ? picked : (uid ? [uid] : [])).filter(Boolean))];
      const endDateKey = until && String(until) >= String(when) ? until : when;
      const payload = {
        title: title.trim(),
        dateKey: when,
        endDateKey,
        startTime: allDay ? null : (startTime || null),
        endTime: allDay ? null : (endTime || null),
        place: place.trim() || null,
        audience: wholeFamily ? 'family' : 'selected',
        memberIds: selectedIds,
        color,
        ...recurrence,
        updatedAt: serverTimestamp(),
      };

      const familyUids = new Set((members || []).map((m) => m.uid || m.id).filter(Boolean));
      const friendUids = selectedIds.filter((id) => id && id !== uid && !familyUids.has(id));
      const familyNotifyIds = wholeFamily
        ? []
        : selectedIds.filter((id) => id && id !== uid && familyUids.has(id));

      if (isEdit) {
        // Fjern legacy childIds helt ved lagring. Skriv alltid til kilde-familien.
        await updateDoc(doc(db, 'families', familyId, 'events', eventDocId), {
          ...payload,
          childIds: deleteField(),
        });
        const prevFriendUids = friendUidsFromPicked(existing?.memberIds || [], {
          members,
          ownerUid: uid,
        });
        await syncCalendarEventFriendShares({
          familyId,
          eventId: eventDocId,
          title: title.trim(),
          startsAt: when,
          ownerUid: uid,
          friendUids: wholeFamily ? [] : friendUids,
          previousFriendUids: prevFriendUids,
        }).catch(() => {});
      } else {
        const created = await addDoc(collection(db, 'families', familyId, 'events'), {
          ...payload,
          childIds: [],
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
        if (familyNotifyIds.length) {
          notifyUsers(familyNotifyIds, {
            eventType: 'eventCreated',
            title: 'Ny hendelse',
            body: title.trim(),
            familyId,
            createdBy: uid,
          }).catch(() => {});
        }
        if (friendUids.length) {
          await syncCalendarEventFriendShares({
            familyId,
            eventId: created.id,
            title: title.trim(),
            startsAt: when,
            ownerUid: uid,
            friendUids,
            previousFriendUids: [],
          }).catch(() => {});
        }
      }
      nav.goBack();
    } catch (e) {
      console.warn('[EventForm] save failed', e);
      showInfo('Feil', 'Klarte ikke lagre hendelsen.');
    } finally {
      setSaving(false);
    }
  };

  const performDelete = async () => {
    if (deleting) return;
    if (isReadOnly) {
      showInfo('Kan ikke slette', 'Eksterne kalenderhendelser kan ikke slettes her.');
      return;
    }
    if (!familyId || !eventDocId) {
      showInfo(
        'Kan ikke slette',
        `Mangler referanse til hendelsen (familie=${familyId || 'ukjent'}, id=${eventDocId || 'ukjent'}).`,
      );
      return;
    }
    setDeleting(true);
    setConfirmDeleteOpen(false);
    try {
      const ref = doc(db, 'families', familyId, 'events', eventDocId);
      try {
        await deleteDoc(ref);
      } catch (hardErr) {
        // Fallback: soft-delete hvis hard delete feiler (regler/tilgang/offline).
        console.warn('[EventForm] hard delete failed, trying soft-delete', hardErr);
        await updateDoc(ref, {
          deleted: true,
          active: false,
          updatedAt: serverTimestamp(),
        });
      }
      nav.goBack();
    } catch (e) {
      console.warn('[EventForm] delete failed', { familyId, eventDocId, error: e });
      showInfo('Feil', e?.message || 'Klarte ikke slette hendelsen. Prøv igjen.');
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    if (deleting) return;
    if (isReadOnly) {
      showInfo('Kan ikke slette', 'Eksterne kalenderhendelser kan ikke slettes her.');
      return;
    }
    if (!familyId || !eventDocId) {
      showInfo(
        'Kan ikke slette',
        `Mangler referanse til hendelsen (familie=${familyId || 'ukjent'}, id=${eventDocId || 'ukjent'}).`,
      );
      return;
    }
    // Inline bekreftelse — mer pålitelig enn Modal/Alert på mobil-web (Safari).
    setConfirmDeleteOpen(true);
  };

  const formTitle = contentReadOnly && isEdit && !visibilityEditOnly
    ? 'Hendelse'
    : (isEdit ? 'Rediger hendelse' : 'Ny hendelse');
  const externalReadOnly = visibilityEditOnly || !!(existing?.sourceProvider || existing?.externalCalendarId || (existing?.private && isExternalEvent));

  const visibilityActions = visibilityEditOnly ? (
    <View style={[styles.visibilityActions, isDesktop && styles.visibilityActionsDesk]}>
      <TouchableOpacity
        style={[styles.visibilityCloseBtn, isDesktop && styles.visibilityCloseBtnDesk]}
        onPress={() => nav.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Lukk"
      >
        <Text style={styles.visibilityCloseTxt}>Lukk</Text>
      </TouchableOpacity>
      <View style={styles.visibilityUpdateWrap}>
        <BigButton
          label="Oppdater"
          onPress={saveVisibility}
          disabled={!visibilityLoaded || saving || !visibilityDirty}
        />
      </View>
    </View>
  ) : null;

  const formBody = (
    <View style={styles.formStack}>
        {!isDesktop ? (
          <View style={styles.mobileHead}>
            <Title size={22} style={styles.formTitle}>{formTitle}</Title>
            <TouchableOpacity
              onPress={() => nav.goBack()}
              hitSlop={10}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Lukk"
            >
              <Ionicons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>
        ) : null}

        {contentReadOnly ? (
          <View style={styles.readOnlyBanner}>
            <Ionicons name="lock-closed" size={14} color={colors.muted} />
            <Text style={styles.readOnlyBannerTxt}>
              {externalReadOnly
                ? (visibilityEditOnly
                  ? 'Ekstern kalender — detaljer kan ikke endres her. Velg hvem i familien som skal se hendelsen.'
                  : 'Ekstern kalender — kan ikke endres her')
                : 'Lesevisning — du kan se detaljene, men ikke endre hendelsen'}
            </Text>
          </View>
        ) : null}

        {!!existing?.crossPlatform && !contentReadOnly && !!existing?.sourceLabel ? (
          <Text style={styles.crossHint}>
            Lagret i «{existing.sourceLabel}» — endringer gjelder der
          </Text>
        ) : null}

        <GroupCard>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Tittel"
            style={[styles.inlineInput, isDesktop && styles.inlineInputDesk]}
            autoFocus={!isEdit}
            editable={!contentReadOnly}
          />
          <RowDivider />
          <TextInput
            value={place}
            onChangeText={setPlace}
            placeholder="Sted (valgfritt)"
            style={[styles.inlineInput, isDesktop && styles.inlineInputDesk]}
            editable={!contentReadOnly}
          />
        </GroupCard>

        <GroupCard>
          <TouchableOpacity
            style={styles.inlineRow}
            onPress={() => !contentReadOnly && setAllDay(!allDay)}
            disabled={contentReadOnly}
            activeOpacity={0.7}
          >
            <Text style={styles.inlineRowLabel}>Hele dagen</Text>
            <View style={[styles.toggle, allDay && styles.toggleOn]}>
              <View style={[styles.toggleThumb, allDay && styles.toggleThumbOn]} />
            </View>
          </TouchableOpacity>

          <RowDivider />

          <View style={styles.inlineRow}>
            <Text style={styles.inlineRowLabel}>Starter</Text>
            <View style={styles.capsuleRow}>
              <DateCapsule value={when} onChange={setFromDate} disabled={contentReadOnly} />
              {!allDay ? (
                <TimeCapsule value={startTime} onChange={handleStartChange} disabled={contentReadOnly} />
              ) : null}
            </View>
          </View>

          <RowDivider />

          <View style={styles.inlineRow}>
            <Text style={styles.inlineRowLabel}>Slutter</Text>
            <View style={styles.capsuleRow}>
              <DateCapsule
                value={until}
                onChange={handleEndDateChange}
                min={when}
                disabled={contentReadOnly}
              />
              {!allDay ? (
                <TimeCapsule
                  value={endTime}
                  onChange={handleEndTimeChange}
                  disabled={contentReadOnly}
                />
              ) : null}
            </View>
          </View>
        </GroupCard>

        <GroupCard>
          <TouchableOpacity
            style={[styles.inlineRow, contentReadOnly && styles.inlineRowReadonly]}
            onPress={() => !contentReadOnly && setShowRepeatPicker(true)}
            activeOpacity={contentReadOnly ? 1 : 0.7}
            disabled={contentReadOnly}
          >
            <Text style={styles.inlineRowLabel}>Gjenta</Text>
            <View style={styles.formRowRight}>
              <Text style={styles.formRowValue}>{repeatLabel}</Text>
              {!contentReadOnly ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null}
            </View>
          </TouchableOpacity>

          {preset !== 'never' ? (
            <>
              <RowDivider />
              <TouchableOpacity
                style={[styles.inlineRow, contentReadOnly && styles.inlineRowReadonly]}
                onPress={() => !contentReadOnly && setShowStopPicker(true)}
                activeOpacity={contentReadOnly ? 1 : 0.7}
                disabled={contentReadOnly}
              >
                <Text style={styles.inlineRowLabel}>Stopp gjenta</Text>
                <View style={styles.formRowRight}>
                  <Text style={styles.formRowValue}>{stopLabel}</Text>
                  {!contentReadOnly ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null}
                </View>
              </TouchableOpacity>

              {recurrenceUntilKey ? (
                <>
                  <RowDivider />
                  <View style={styles.inlineRow}>
                    <Text style={styles.inlineRowLabel}>Sluttdato</Text>
                    <DateCapsule
                      value={recurrenceUntilKey || when}
                      onChange={setRecurrenceUntilKey}
                      min={when}
                      disabled={contentReadOnly}
                    />
                  </View>
                </>
              ) : null}

              {repeatHint ? (
                <>
                  <RowDivider />
                  <Text style={styles.repeatHintInCard}>{repeatHint}</Text>
                </>
              ) : null}
            </>
          ) : null}
        </GroupCard>

        {/* Preset picker modal */}
        <Modal visible={showRepeatPicker} transparent animationType="fade" onRequestClose={() => setShowRepeatPicker(false)}>
          <Pressable style={styles.overlay} onPress={() => setShowRepeatPicker(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Gjenta</Text>
              {REPEAT_PRESETS.map((row, idx) => (
                <TouchableOpacity
                  key={row.id}
                  style={[styles.sheetRow, idx === REPEAT_PRESETS.length - 1 && styles.sheetRowLast]}
                  onPress={() => selectPreset(row.id)}
                >
                  <Text style={styles.sheetRowTxt}>{row.label}</Text>
                  {preset === row.id && <Ionicons name="checkmark" size={20} color={colors.brand} />}
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowRepeatPicker(false)}>
                <Text style={styles.sheetCancelTxt}>Avbryt</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Custom recurrence modal */}
        <Modal visible={showCustomPicker} animationType="slide" onRequestClose={() => setShowCustomPicker(false)}>
          <View style={styles.customModalWrap}>
            <View style={styles.customScreen}>
            <View style={styles.customHeader}>
              <TouchableOpacity onPress={() => setShowCustomPicker(false)} style={styles.customBack}>
                <Ionicons name="chevron-back" size={22} color={colors.brand} />
              </TouchableOpacity>
              <Text style={styles.customTitle}>Tilpasset</Text>
              <TouchableOpacity
                onPress={() => {
                  setPreset('custom');
                  setShowCustomPicker(false);
                }}
                style={styles.customDone}
              >
                <Text style={styles.customDoneTxt}>Ferdig</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.customCard}>
              <TouchableOpacity style={styles.customRow} onPress={() => setShowCustomFreqPicker(true)}>
                <Text style={styles.customRowLabel}>Hyppighet</Text>
                <View style={styles.formRowRight}>
                  <Text style={styles.formRowValue}>{customFreqLabel}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </View>
              </TouchableOpacity>

              <View style={styles.customDivider} />

              <Text style={styles.customRowLabel}>Hver</Text>
              <View style={styles.intervalPickerRow}>
                <ScrollView style={styles.intervalScroll} contentContainerStyle={styles.intervalPickerCol} keyboardShouldPersistTaps="handled">
                  {INTERVAL_OPTIONS.map((n) => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.intervalPill, customInterval === n && styles.intervalPillOn]}
                      onPress={() => setCustomInterval(n)}
                    >
                      <Text style={[styles.intervalPillTxt, customInterval === n && styles.intervalPillTxtOn]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.intervalUnit}>{customUnit}</Text>
              </View>
            </View>

            {customType === 'weekly' && (
              <>
                <Text style={styles.label}>Ukedager</Text>
                <View style={styles.weekChipRow}>
                  {WEEKDAYS_SHORT.map((label, idx) => {
                    const day = (idx + 1) % 7;
                    const on = recurrenceByDays.includes(day);
                    return (
                      <TouchableOpacity
                        key={label}
                        style={[styles.weekChip, on && styles.weekChipOn]}
                        onPress={() => toggleRecurrenceDay(day)}
                      >
                        <Text style={[styles.weekChipTxt, on && styles.weekChipTxtOn]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {repeatHint ? <Text style={styles.repeatHint}>{repeatHint}</Text> : null}
            </View>
          </View>
        </Modal>

        {/* Custom frequency picker */}
        <Modal visible={showCustomFreqPicker} transparent animationType="fade" onRequestClose={() => setShowCustomFreqPicker(false)}>
          <Pressable style={styles.overlay} onPress={() => setShowCustomFreqPicker(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Hyppighet</Text>
              {CUSTOM_FREQS.map((row, idx) => (
                <TouchableOpacity
                  key={row.id}
                  style={[styles.sheetRow, idx === CUSTOM_FREQS.length - 1 && styles.sheetRowLast]}
                  onPress={() => {
                    setCustomType(row.id);
                    setShowCustomFreqPicker(false);
                  }}
                >
                  <Text style={styles.sheetRowTxt}>{row.label}</Text>
                  {customType === row.id && <Ionicons name="checkmark" size={20} color={colors.brand} />}
                </TouchableOpacity>
              ))}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Stop repeat picker */}
        <Modal visible={showStopPicker} transparent animationType="fade" onRequestClose={() => setShowStopPicker(false)}>
          <Pressable style={styles.overlay} onPress={() => setShowStopPicker(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Stopp gjenta</Text>
              {STOP_PRESETS.map((row, idx) => {
                const selected = row.id === 'date' ? !!recurrenceUntilKey : !recurrenceUntilKey;
                return (
                  <TouchableOpacity
                    key={row.id}
                    style={[styles.sheetRow, idx === STOP_PRESETS.length - 1 && styles.sheetRowLast]}
                    onPress={() => {
                      if (row.id === 'never') {
                        setRecurrenceUntilKey('');
                      } else {
                        setRecurrenceUntilKey(recurrenceUntilKey || when);
                      }
                      setShowStopPicker(false);
                    }}
                  >
                    <Text style={styles.sheetRowTxt}>{row.label}</Text>
                    {selected && <Ionicons name="checkmark" size={20} color={colors.brand} />}
                  </TouchableOpacity>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>

        <HelpTarget id="content">
          <GroupCard>
          <Text style={styles.whoLabel}>Hvem skal se denne?</Text>
          {canEditVisibility ? (
            <Mute style={styles.whoMute}>
              Standard er bare deg. «Hele familien» = alle.
            </Mute>
          ) : null}
          <View style={[styles.wrap, !canEditVisibility && styles.wrapReadonly]} pointerEvents={canEditVisibility ? 'auto' : 'none'}>
            <TouchableOpacity
              onPress={toggleWholeFamily}
              disabled={!canEditVisibility}
              style={[
                styles.chip,
                isDesktop && styles.chipDesk,
                wholeFamily && { backgroundColor: colors.brand },
                !canEditVisibility && styles.chipReadonly,
              ]}
            >
              <Text style={[styles.chipTxt, wholeFamily && { color: '#fff' }]}>Hele familien</Text>
            </TouchableOpacity>
            {members.map((m) => {
              const mid = memberPickId(m);
              if (!mid) return null;
              const on = !wholeFamily && picked.includes(mid);
              return (
                <TouchableOpacity
                  key={mid}
                  onPress={() => toggle(mid)}
                  disabled={!canEditVisibility}
                  style={[
                    styles.chip,
                    isDesktop && styles.chipDesk,
                    on && { backgroundColor: m.color || colors.brand },
                    !canEditVisibility && styles.chipReadonly,
                  ]}
                >
                  <Text style={[styles.chipTxt, on && { color: '#fff' }]}>{m.name}</Text>
                </TouchableOpacity>
              );
            })}
            {(friendPeople || []).map((m) => {
              const mid = m.uid || m.id;
              if (!mid) return null;
              const on = !wholeFamily && picked.includes(mid);
              return (
                <TouchableOpacity
                  key={`friend-${mid}`}
                  onPress={() => toggle(mid)}
                  disabled={!canEditVisibility}
                  style={[
                    styles.chip,
                    isDesktop && styles.chipDesk,
                    on && { backgroundColor: colors.brand },
                    !canEditVisibility && styles.chipReadonly,
                  ]}
                >
                  <Text style={[styles.chipTxt, on && { color: '#fff' }]}>{m.name} · venn</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.whoSummary}>
            {synligForSummary({
              wholeFamily,
              picked,
              members,
              friendPeople,
            })}
          </Text>
        </GroupCard>
        </HelpTarget>

        {!isDesktop && visibilityEditOnly && visibilityActions}

        {!isDesktop && !contentReadOnly && !visibilityEditOnly && (
          <BigButton label={isEdit ? 'Oppdater' : 'Lagre'} onPress={save} disabled={!title.trim() || saving} />
        )}

        {isEdit && !contentReadOnly && !visibilityEditOnly && !confirmDeleteOpen && (
          <TouchableOpacity
            style={[styles.deleteBtn, isDesktop && styles.deleteBtnDesk, deleting && { opacity: 0.5 }]}
            onPress={confirmDelete}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="Slett hendelse"
          >
            <Ionicons name="trash-outline" size={18} color="#b91c1c" />
            <Text style={styles.deleteTxt}>Slett hendelse</Text>
          </TouchableOpacity>
        )}

        {isEdit && !contentReadOnly && !visibilityEditOnly && confirmDeleteOpen && (
          <View style={styles.deleteConfirmBox}>
            <Text style={styles.deleteConfirmTitle}>Slette «{existing?.title || 'hendelsen'}»?</Text>
            <Text style={styles.deleteConfirmMsg}>
              Dette kan ikke angres.
              {existing?.crossPlatform && existing?.sourceLabel
                ? ` Hendelsen slettes i «${existing.sourceLabel}».`
                : ''}
            </Text>
            <View style={styles.deleteConfirmRow}>
              <TouchableOpacity
                style={styles.deleteCancelBtn}
                onPress={() => setConfirmDeleteOpen(false)}
                disabled={deleting}
              >
                <Text style={styles.deleteCancelTxt}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteConfirmBtn, deleting && { opacity: 0.6 }]}
                onPress={performDelete}
                disabled={deleting}
              >
                <Text style={styles.deleteConfirmBtnTxt}>
                  {deleting ? 'Sletter…' : 'Ja, slett'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
    </View>
  );

  const infoDialogEl = (
    <InfoDialog
      visible={infoDialog.visible}
      title={infoDialog.title}
      message={infoDialog.message}
      onClose={() => setInfoDialog({ visible: false, title: '', message: '' })}
    />
  );

  if (isDesktop) {
    return (
      <View style={styles.desktopRoot}>
        <DesktopFormShell
          title={formTitle}
          onClose={() => nav.goBack()}
          footer={visibilityEditOnly ? visibilityActions : (
            !contentReadOnly ? (
              <BigButton label={isEdit ? 'Oppdater' : 'Lagre'} onPress={save} disabled={!title.trim() || saving} />
            ) : null
          )}
        >
          {formBody}
        </DesktopFormShell>
        {infoDialogEl}
      </View>
    );
  }

  return (
    <Screen>
      <ScrollBody pad={12}>
        {formBody}
      </ScrollBody>
      {infoDialogEl}
    </Screen>
  );
}

const styles = StyleSheet.create({
  desktopRoot: { flex: 1, backgroundColor: 'transparent' },
  formStack: { gap: 8 },
  mobileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 2,
  },
  formTitle: { flex: 1, marginBottom: 0 },
  closeBtn: {
    alignSelf: 'flex-start',
    padding: 6,
    borderRadius: 10,
    backgroundColor: colors.sunken,
  },

  groupCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: 14,
  },
  inlineInput: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontWeight: '500',
    color: colors.ink,
    backgroundColor: 'transparent',
  },
  inlineInputDesk: { paddingVertical: 9, fontSize: 14 },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    minHeight: 44,
  },
  inlineRowLabel: {
    fontWeight: '500',
    color: colors.ink,
    fontSize: 15,
    flexShrink: 0,
  },
  inlineRowReadonly: { opacity: 0.72 },
  capsuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  capsule: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.sunken,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeCapsule: { minWidth: 56 },
  capsuleDisabled: { opacity: 0.55 },
  capsuleTxt: {
    fontWeight: '400',
    color: colors.ink,
    fontSize: 13,
  },

  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    padding: 14, fontSize: 16, fontWeight: '500', color: colors.ink,
  },
  inputDesk: { paddingVertical: 9, paddingHorizontal: 12, fontSize: 14, borderRadius: 8 },
  label: { fontWeight: '500', color: colors.ink, fontSize: 14, marginTop: 12, marginBottom: 6 },
  labelDesk: { fontWeight: '500', fontSize: 13, marginTop: 10, marginBottom: 4 },

  pickerBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 14,
  },
  pickerBtnTxt: { fontWeight: '500', color: colors.muted, fontSize: 14 },
  pickerBtnVal: { flex: 1, fontWeight: '500', color: colors.ink, fontSize: 15 },
  doneBtn: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8, marginTop: 4 },
  doneBtnTxt: { color: colors.brand, fontWeight: '400', fontSize: 15 },

  webPickerWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14,
  },
  webPickerWrapDesk: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8 },

  allDayRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, marginTop: 10,
  },
  allDayRowDesk: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, marginTop: 8 },
  toggle: {
    width: 44, height: 26, borderRadius: 13, backgroundColor: '#d1d5db',
    justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleOn: { backgroundColor: colors.brand },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.card },
  toggleThumbOn: { transform: [{ translateX: 18 }] },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeSep: { paddingTop: 24, alignItems: 'center' },

  h: { fontWeight: '400', fontSize: 18, color: colors.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 6 },
  wrapReadonly: { opacity: 0.85 },
  chip: {
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999,
    backgroundColor: colors.sunken, borderWidth: 1, borderColor: colors.line,
  },
  chipReadonly: { opacity: 0.9 },
  chipDesk: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8 },
  chipTxt: { fontWeight: '500', color: colors.ink, fontSize: 13 },
  whoLabel: {
    fontWeight: '500', color: colors.ink, fontSize: 15,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2,
  },
  whoMute: { paddingHorizontal: 14, marginBottom: 6, fontSize: 12 },
  whoSummary: {
    marginTop: 4, marginBottom: 10, paddingHorizontal: 14,
    color: colors.brand, fontWeight: '500', fontSize: 12,
  },
  visibilityActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  visibilityActionsDesk: { justifyContent: 'flex-end' },
  visibilityCloseBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    minWidth: 96,
    alignItems: 'center',
  },
  visibilityCloseBtnDesk: { paddingVertical: 10, borderRadius: 8 },
  visibilityCloseTxt: { fontWeight: '400', color: colors.ink, fontSize: 14 },
  visibilityUpdateWrap: { flex: 1, minWidth: 120 },
  deleteBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 8, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca',
  },
  deleteBtnDesk: { paddingVertical: 10, borderRadius: 8, marginTop: 8 },
  deleteTxt: { color: '#b91c1c', fontWeight: '400', fontSize: 14 },
  deleteConfirmBox: {
    marginTop: 8, padding: 14, borderRadius: 14,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', gap: 8,
  },
  deleteConfirmTitle: { fontWeight: '400', fontSize: 15, color: '#7f1d1d' },
  deleteConfirmMsg: { fontWeight: '400', fontSize: 13, color: '#991b1b', lineHeight: 18 },
  deleteConfirmRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  deleteCancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line,
  },
  deleteCancelTxt: { fontWeight: '400', color: colors.ink, fontSize: 14 },
  deleteConfirmBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, backgroundColor: '#b91c1c',
  },
  deleteConfirmBtnTxt: { fontWeight: '400', color: '#fff', fontSize: 14 },

  formRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14, marginTop: 10,
  },
  formRowDesk: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, marginTop: 8 },
  formRowLabel: { fontWeight: '500', color: colors.ink, fontSize: 15 },
  formRowLabelDesk: { fontSize: 13 },
  formRowRight: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  formRowValue: { fontWeight: '500', color: colors.muted, fontSize: 14, textAlign: 'right' },

  repeatHint: { marginTop: 8, color: colors.muted, fontSize: 13, fontWeight: '400', paddingHorizontal: 4 },
  repeatHintInCard: {
    color: colors.muted, fontSize: 12, fontWeight: '400',
    paddingHorizontal: 14, paddingVertical: 8,
  },
  rangeHint: { marginTop: 6, color: colors.muted, fontSize: 12, fontWeight: '400' },

  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20,
  },
  sheet: {
    backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden',
  },
  sheetTitle: {
    fontWeight: '400', fontSize: 15, color: colors.ink, textAlign: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  sheetRowLast: { borderBottomWidth: 0 },
  sheetRowTxt: { fontWeight: '500', fontSize: 15, color: colors.ink },
  sheetCancel: { paddingVertical: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line },
  sheetCancelTxt: { fontWeight: '400', color: colors.brand, fontSize: 15 },

  customModalWrap: { flex: 1, backgroundColor: colors.sunken },
  customScreen: { flex: 1, padding: 16 },
  customHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  customBack: { padding: 4, width: 60 },
  customTitle: { fontWeight: '400', fontSize: 17, color: colors.ink },
  customDone: { width: 60, alignItems: 'flex-end' },
  customDoneTxt: { color: colors.brand, fontWeight: '400', fontSize: 15 },
  customCard: {
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
    padding: 14, marginBottom: 12,
  },
  customRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  customRowLabel: { fontWeight: '500', color: colors.ink, fontSize: 15 },
  customDivider: { height: 1, backgroundColor: colors.line, marginVertical: 12 },

  intervalPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  intervalScroll: { flex: 1, maxHeight: 140 },
  intervalPickerCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  intervalPill: {
    minWidth: 36, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
    backgroundColor: colors.sunken, alignItems: 'center',
  },
  intervalPillOn: { backgroundColor: colors.brand },
  intervalPillTxt: { fontWeight: '400', color: colors.ink, fontSize: 15 },
  intervalPillTxtOn: { color: '#fff' },
  intervalUnit: { fontWeight: '500', color: colors.muted, fontSize: 15, minWidth: 48 },

  weekChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weekChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  weekChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  weekChipTxt: { fontWeight: '400', color: colors.ink, fontSize: 13 },
  weekChipTxtOn: { color: '#fff' },

  readOnlyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.sunken, borderWidth: 1, borderColor: colors.line,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 0,
  },
  readOnlyBannerTxt: { flex: 1, color: colors.muted, fontSize: 13, fontWeight: '400' },
  crossHint: { color: colors.muted, fontSize: 12, fontWeight: '400', marginBottom: 0 },
});

