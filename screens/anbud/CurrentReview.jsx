import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import {
  attachDossier,
  createBidWork,
  createManualBidWork,
  releaseUntouchedBid,
  saveNoticeReviewNotes,
  setNoticeDecision,
} from '../../src/anbud/model';
import { fetchCompetitionFile } from '../../src/anbud/doffinClient';
import { inquiryBrief, noticeBrief, noticeNeedsDossier } from '../../src/anbud/noticeBrief';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { showSaveToast } from '../../src/ui/saveToast';
import { patchInquiry } from '../../src/anbud/intake';
import {
  assignmentFromChoice,
  assignmentGap,
  assignmentHint,
  directQueueItems,
  noticesAwaitingBid,
  processStepsForInquiry,
  processStepsForNotice,
} from '../../src/anbud/processTrail';
import { deadlineInfo } from '../../src/anbud/noticeText';
import { departmentsOf } from '../../src/project/companyUnits';
import { updateGroup } from '../../src/utils/groups';
import { useLayout } from '../../src/theme';
import InfoButton from '../../components/InfoButton';
import { applyGeoHits, reviewMapRows } from '../../src/anbud/workMap';
import ProcessTrail from './ProcessTrail';
import OppdragBrief from './OppdragBrief';
import ReviewNotes from './ReviewNotes';
import MapRail, { activateMapRow, mapCardChrome, MapIndexBadge, revealAnbudRow } from './MapRail';

function SectionHeading({ title, hint, colors }) {
  const { isPhone } = useLayout();
  return (
    <View style={{ gap: isPhone ? 0 : 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>{title}</Text>
        {isPhone ? <InfoButton title={title}>{hint}</InfoButton> : null}
      </View>
      {isPhone ? null : <Text style={{ color: colors.muted }}>{hint}</Text>}
    </View>
  );
}

function peopleOf(members) {
  return (members || [])
    .filter((row) => row && row.role !== 'child')
    .map((person) => ({
      uid: person.uid || person.id,
      id: person.uid || person.id,
      name: person.name || person.displayName || 'Uten navn',
    }))
    .filter((person) => person.uid && person.name);
}

function ChoiceChips({ label, colors, options, selectedId, onSelect, empty }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>{label}</Text>
      {options.length ? (
        <View style={styles.chips}>
          {options.map((option) => {
            const on = selectedId === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                onPress={() => onSelect(on ? '' : option.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, {
                  borderColor: on ? colors.brand : colors.line,
                  backgroundColor: on ? colors.brandSoft : colors.card,
                }]}
              >
                <Text style={{ color: on ? colors.brand : colors.ink }}>{option.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <Text style={{ color: colors.muted }}>{empty}</Text>
      )}
    </View>
  );
}

function DecisionCard({
  title,
  buyer,
  meta,
  steps,
  colors,
  departments,
  people,
  unitId,
  personId,
  onUnit,
  onPerson,
  onGive,
  onDecline,
  busy,
  notes,
  onSaveNotes,
  onDeleteNotes,
  brief,
  briefLoading,
  wide,
  selected,
  anchorId,
  mapNo,
  onFocus,
}) {
  const missing = assignmentGap({ departments, people, unitId, personId });
  const collectRef = React.useRef(() => notes || []);
  const decision = (
    <View style={styles.col}>
      <TouchableOpacity
        onPress={onFocus}
        disabled={!onFocus}
        accessibilityRole="button"
        accessibilityState={{ selected: !!selected }}
        accessibilityLabel={selected ? `${mapNo ? `${mapNo}. ` : ''}${title} er valgt på kartet` : `Vis ${mapNo ? `${mapNo}. ` : ''}${title} på kartet`}
        style={styles.pick}
      >
        <MapIndexBadge n={mapNo} selected={!!selected} colors={colors} />
        <View style={{ flex: 1, gap: 2 }}>
          {selected ? <Text style={{ color: colors.brand, fontWeight: '800', fontSize: 12 }}>Valgt på kartet</Text> : null}
          <Text style={{ color: selected ? colors.brand : colors.ink, fontWeight: '700', fontSize: 16 }}>{title}</Text>
          <Text style={{ color: colors.ink }}>{buyer || 'Oppdragsgiver ikke oppgitt'}</Text>
          {meta ? <Text style={{ color: colors.muted }}>{meta}</Text> : null}
        </View>
      </TouchableOpacity>
      <ProcessTrail steps={steps} colors={colors} />
      <ReviewNotes
        notes={notes}
        colors={colors}
        onSave={onSaveNotes}
        onDelete={onDeleteNotes}
        onCollect={(fn) => { collectRef.current = fn; }}
      />
      <ChoiceChips
        label="Avdeling"
        colors={colors}
        options={departments}
        selectedId={unitId}
        onSelect={onUnit}
        empty="Ingen avdelinger er registrert. Tilbudsarbeidet kan starte uten avdeling."
      />
      <ChoiceChips
        label="Person"
        colors={colors}
        options={people}
        selectedId={personId}
        onSelect={onPerson}
        empty="Ingen ansatte er registrert. Tilbudsarbeidet kan starte uten person."
      />
      <Text style={{ color: missing.length ? colors.ink : colors.muted }}>{assignmentHint(missing)}</Text>
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => onGive(collectRef.current())}
          disabled={busy || missing.length > 0}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || missing.length > 0 }}
          style={[styles.give, { backgroundColor: busy || missing.length ? colors.sunken : colors.brand }]}
        >
          <Text style={{ color: busy || missing.length ? colors.muted : '#fff', fontWeight: '600' }}>
            {busy ? 'Oppretter …' : 'Gi tilbud'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onDecline(collectRef.current())}
          disabled={busy}
          accessibilityRole="button"
          style={[styles.decline, { borderColor: colors.line }]}
        >
          <Text style={{ color: colors.ink }}>Ikke gi tilbud</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
  return (
    <View
      dataSet={{
        ...(anchorId ? { anbudId: anchorId } : {}),
        ...(selected ? { mapSelected: '1' } : {}),
      }}
      {...(Platform.OS === 'web' && onFocus ? { onClick: (event) => activateMapRow(event, onFocus) } : null)}
      style={[styles.card, mapCardChrome(colors, !!selected)]}
    >
      <View style={wide ? styles.split : styles.stack}>
        {decision}
        <OppdragBrief brief={brief} colors={colors} loading={briefLoading} />
      </View>
    </View>
  );
}

export default function CurrentReview({
  company,
  colors,
  members = [],
  units = [],
  onOpenBid,
  onOpenAlerts,
  onOpenInquiry,
  onNoticeCount,
}) {
  const { applyFamilyPatch, family } = useApp();
  const [state, setState] = useState(null);
  const [choice, setChoice] = useState({});
  const [busyId, setBusyId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loadingIds, setLoadingIds] = useState(() => new Set());
  const [focusId, setFocusId] = useState('');
  const [focusTick, setFocusTick] = useState(0);
  const fetchedIds = useRef(new Set());
  const stateRef = useRef(null);
  stateRef.current = state;
  const { width } = useWindowDimensions();
  const { isPhone } = useLayout();
  const wide = width >= 1080;

  const inquiries = Array.isArray(family?.anbudInquiries) ? family.anbudInquiries : (company?.anbudInquiries || []);
  const inbox = Array.isArray(family?.anbudInbox) ? family.anbudInbox : (company?.anbudInbox || []);
  const departments = useMemo(
    () => departmentsOf(units).map((row) => ({ id: row.id, name: row.name, kind: row.kind || 'avdeling' })),
    [units],
  );
  const people = useMemo(() => peopleOf(members), [members]);

  useEffect(() => {
    let live = true;
    loadAnbudState(company?.id).then((loaded) => {
      if (live) setState(loaded);
    });
    return () => { live = false; };
  }, [company?.id]);

  const notices = noticesAwaitingBid(state?.notices);
  const direct = directQueueItems({ inquiries, inbox });
  const mapRows = useMemo(() => reviewMapRows({ notices, direct }), [notices, direct]);

  useEffect(() => {
    onNoticeCount?.(notices.length);
  }, [notices.length, onNoticeCount]);

  const noticeKey = notices.map((row) => row.id).join('|');
  useEffect(() => {
    const pending = (stateRef.current?.notices || [])
      .filter((row) => noticeNeedsDossier(row) && !fetchedIds.current.has(row.id));
    if (!pending.length) return undefined;
    let live = true;
    const done = new Set();
    pending.forEach((row) => fetchedIds.current.add(row.id));
    setLoadingIds((current) => {
      const next = new Set(current);
      pending.forEach((row) => next.add(row.id));
      return next;
    });
    (async () => {
      let base = stateRef.current;
      for (const notice of pending) {
        if (!live) break;
        try {
          const file = await fetchCompetitionFile(notice.id);
          if (!live || !file?.dossier) continue;
          const adopted = attachDossier(base, notice.id, file.dossier);
          if (!adopted.ok) continue;
          base = adopted.state;
          stateRef.current = base;
          done.add(notice.id);
          if (!live) return;
          setState(base);
          await saveAnbudState(base, company?.id);
        } catch {
          // Treffteksten og lenken til kunngjøringen blir stående.
        } finally {
          setLoadingIds((current) => {
            if (!current.has(notice.id)) return current;
            const next = new Set(current);
            next.delete(notice.id);
            return next;
          });
        }
      }
    })();
    return () => {
      live = false;
      for (const row of pending) {
        if (!done.has(row.id)) fetchedIds.current.delete(row.id);
      }
    };
  }, [noticeKey, company?.id]);

  function focusRow(id) {
    setFocusId(id);
    setFocusTick((n) => n + 1);
    revealAnbudRow(id);
  }

  async function persistGeo(hits) {
    const current = stateRef.current;
    if (current) {
      const applied = applyGeoHits(current.notices, hits);
      if (applied.changed) {
        const next = { ...current, notices: applied.rows };
        stateRef.current = next;
        setState(next);
        saveAnbudState(next, company?.id);
      }
    }
    for (const item of direct) {
      const hit = (hits || []).find((row) => row.id === item.id);
      if (!hit?.geo || item.geo) continue;
      const sourceList = item.queueKind === 'protop' ? inbox : inquiries;
      const patched = patchInquiry(sourceList, item.id, { geo: hit.geo });
      if (!patched.ok) continue;
      try { await saveList(item.queueKind, patched.list); } catch { /* kartet viser stedet likevel */ }
    }
  }

  function pick(id) {
    return choice[id] || { unitId: '', personId: '' };
  }

  function setPick(id, patch) {
    setChoice((current) => ({
      ...current,
      [id]: { unitId: '', personId: '', ...current[id], ...patch },
    }));
  }

  function chosenAssignment(id) {
    const selected = pick(id);
    return assignmentFromChoice({
      unit: departments.find((row) => row.id === selected.unitId) || null,
      person: people.find((row) => row.id === selected.personId) || null,
    });
  }

  async function commitState(result) {
    if (!result?.ok) {
      setError(result?.error || 'Kunne ikke lagre.');
      return null;
    }
    stateRef.current = result.state;
    setState(result.state);
    setError('');
    await saveAnbudState(result.state, company?.id);
    return result.state;
  }

  async function saveList(kind, list) {
    if (!company?.id) throw new Error('Bedriften mangler.');
    const patch = kind === 'protop' ? { anbudInbox: list } : { anbudInquiries: list };
    await updateGroup(company.id, patch);
    applyFamilyPatch?.(company.id, patch);
  }

  async function saveNoticeNotes(notice, notes) {
    const result = saveNoticeReviewNotes(stateRef.current, notice.id, notes);
    const saved = await commitState(result);
    return saved;
  }

  async function saveDirectNotes(item, notes) {
    const sourceList = item.queueKind === 'protop' ? inbox : inquiries;
    const patched = patchInquiry(sourceList, item.id, { reviewNotes: notes });
    if (!patched.ok) {
      setError(patched.error);
      return false;
    }
    try {
      await saveList(item.queueKind, patched.list);
      setError('');
      return true;
    } catch (err) {
      setError(err?.message || 'Kunne ikke lagre notatet.');
      return false;
    }
  }

  async function giveNotice(notice, notes) {
    const missing = assignmentGap({
      departments,
      people,
      unitId: pick(notice.id).unitId,
      personId: pick(notice.id).personId,
    });
    if (missing.length) {
      setError(assignmentHint(missing));
      return;
    }
    setBusyId(notice.id);
    setError('');
    const noted = saveNoticeReviewNotes(stateRef.current, notice.id, notes);
    const made = await commitState(createBidWork(noted.ok ? noted.state : stateRef.current, notice.id, chosenAssignment(notice.id)));
    setBusyId('');
    if (!made) return;
    const bid = (made.bids || []).find((row) => row.noticeId === notice.id);
    setNote(`${notice.title} er flyttet til 3. Tilbud.`);
    showSaveToast(`${notice.title} er flyttet til 3. Tilbud.`);
    if (bid) onOpenBid?.(bid.id);
  }

  async function declineNotice(notice, notes) {
    setBusyId(notice.id);
    const noted = saveNoticeReviewNotes(stateRef.current, notice.id, notes);
    const decided = setNoticeDecision(noted.ok ? noted.state : stateRef.current, notice.id, 'ikke');
    if (!decided.ok) {
      setError(decided.error);
      setBusyId('');
      return;
    }
    await commitState(releaseUntouchedBid(decided.state, notice.id));
    setBusyId('');
    setNote(`${notice.title} er satt til ikke gi tilbud.`);
    showSaveToast(`${notice.title} er satt til ikke gi tilbud.`);
  }

  async function giveDirect(item, notes) {
    const missing = assignmentGap({
      departments,
      people,
      unitId: pick(item.id).unitId,
      personId: pick(item.id).personId,
    });
    if (missing.length) {
      setError(assignmentHint(missing));
      return;
    }
    setBusyId(item.id);
    setError('');
    const loaded = stateRef.current || await loadAnbudState(company?.id);
    const made = await commitState(createManualBidWork(loaded, {
      title: item.title,
      buyer: item.buyer || item.fromName,
      deadline: item.deadline,
      description: item.description,
      assignment: chosenAssignment(item.id),
      inquiryId: item.id,
      source: item.queueKind === 'protop' ? 'protop' : 'manuell',
      channel: item.channel,
      originAt: item.createdAt,
      interestAt: item.interestAt || item.createdAt,
      reviewNotes: notes,
    }));
    if (!made) {
      setBusyId('');
      return;
    }
    const bid = (made.bids || []).find((row) => row.inquiryId === item.id) || made.bids?.[0];
    const sourceList = item.queueKind === 'protop' ? inbox : inquiries;
    const patched = patchInquiry(sourceList, item.id, {
      status: 'tilbud',
      bidId: bid?.id || '',
      decidedAt: new Date().toISOString(),
      interestAt: item.interestAt || item.createdAt,
      reviewNotes: notes,
    });
    if (!patched.ok) {
      setError(patched.error);
      setBusyId('');
      return;
    }
    try {
      await saveList(item.queueKind, patched.list);
    } catch (err) {
      setError(err?.message || 'Tilbudet er opprettet, men henvendelsen ble ikke oppdatert.');
      setBusyId('');
      if (bid) onOpenBid?.(bid.id);
      return;
    }
    setBusyId('');
    setNote(`${item.title} er flyttet til 3. Tilbud.`);
    showSaveToast(`${item.title} er flyttet til 3. Tilbud.`);
    if (bid) onOpenBid?.(bid.id);
  }

  async function declineDirect(item, notes) {
    setBusyId(item.id);
    setError('');
    const sourceList = item.queueKind === 'protop' ? inbox : inquiries;
    const patched = patchInquiry(sourceList, item.id, {
      status: 'ikke',
      decidedAt: new Date().toISOString(),
      reviewNotes: notes,
    });
    if (!patched.ok) {
      setError(patched.error);
      setBusyId('');
      return;
    }
    try {
      await saveList(item.queueKind, patched.list);
      setNote(`${item.title} er satt til ikke gi tilbud.`);
      showSaveToast(`${item.title} er satt til ikke gi tilbud.`);
    } catch (err) {
      setError(err?.message || 'Kunne ikke oppdatere henvendelsen.');
    }
    setBusyId('');
  }

  return (
    <View style={{ gap: 14 }}>
      <MapRail
        rows={mapRows}
        colors={colors}
        selectedId={focusId}
        focusTick={focusTick}
        legendLabel="Aktuelle"
        kindLabel="Aktuell"
        openLabel="Vis i vurderingen"
        mapTitle="Kart over aktuelle"
        onSelect={focusRow}
        onPreview={focusRow}
        onGeocode={persistGeo}
      />
      {isPhone ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>Vurdering av aktuelle</Text>
          <InfoButton title="Vurdering av aktuelle">
            Steg 1 merker konkurransen som aktuell eller uaktuell. Her tar dere stilling til om det skal gis tilbud, og hvem som skal arbeide med det. Gi tilbud flytter saken til 3. Tilbud. Merkingen er lagret, så en annen kan fortsette.
          </InfoButton>
        </View>
      ) : (
        <View style={[styles.lead, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Vurdering av aktuelle</Text>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            Steg 1 merker konkurransen som aktuell eller uaktuell. Her tar dere stilling til om det skal gis tilbud, og hvem som skal arbeide med det. Gi tilbud flytter saken til 3. Tilbud. Merkingen er lagret, så en annen kan fortsette.
          </Text>
        </View>
      )}
      {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}

      <View style={{ gap: 8 }}>
        <SectionHeading
          title="Fra anbudsvarsling"
          hint="Offentlige kunngjøringer som allerede er merket aktuelle."
          colors={colors}
        />
        {notices.map((notice) => {
          const selected = pick(notice.id);
          const deadline = deadlineInfo(notice.deadline);
          return (
            <DecisionCard
              key={notice.id}
              title={notice.title}
              buyer={notice.buyer}
              meta={[notice.source === 'ted' ? 'TED' : 'Doffin', deadline.headline].filter(Boolean).join(' · ')}
              steps={processStepsForNotice(notice)}
              colors={colors}
              departments={departments}
              people={people}
              unitId={selected.unitId}
              personId={selected.personId}
              onUnit={(unitId) => setPick(notice.id, { unitId })}
              onPerson={(personId) => setPick(notice.id, { personId })}
              onGive={(notes) => giveNotice(notice, notes)}
              onDecline={(notes) => declineNotice(notice, notes)}
              busy={busyId === notice.id}
              notes={notice.reviewNotes || []}
              onSaveNotes={(notes) => saveNoticeNotes(notice, notes)}
              onDeleteNotes={(notes) => saveNoticeNotes(notice, notes)}
              brief={noticeBrief(notice)}
              briefLoading={loadingIds.has(notice.id)}
              wide={wide}
              selected={focusId === notice.id}
              anchorId={notice.id}
              mapNo={mapRows.find((row) => row.id === notice.id)?.mapNo}
              onFocus={() => focusRow(notice.id)}
            />
          );
        })}
        {!notices.length ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.muted }}>Ingen aktuelle kunngjøringer venter.</Text>
            <TouchableOpacity onPress={onOpenAlerts} accessibilityRole="button">
              <Text style={{ color: colors.brand, fontWeight: '600' }}>Gå til 1.1 Anbudsvarsling</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <SectionHeading
          title="Direkte registrert"
          hint="Forespørsler som er registrert selv, eller mottatt direkte i ProTop."
          colors={colors}
        />
        {direct.map((item) => {
          const selected = pick(item.id);
          return (
            <DecisionCard
              key={`${item.queueKind}-${item.id}`}
              title={item.title || 'Henvendelse uten tittel'}
              buyer={item.buyer || item.fromName || item.contactName}
              meta={item.queueKind === 'protop' ? 'Mottatt i ProTop' : 'Registrert selv'}
              steps={processStepsForInquiry(item)}
              colors={colors}
              departments={departments}
              people={people}
              unitId={selected.unitId}
              personId={selected.personId}
              onGive={(notes) => giveDirect(item, notes)}
              onDecline={(notes) => declineDirect(item, notes)}
              notes={item.reviewNotes || []}
              onSaveNotes={(notes) => saveDirectNotes(item, notes)}
              onDeleteNotes={(notes) => saveDirectNotes(item, notes)}
              onUnit={(unitId) => setPick(item.id, { unitId })}
              onPerson={(personId) => setPick(item.id, { personId })}
              busy={busyId === item.id}
              brief={inquiryBrief(item)}
              wide={wide}
              selected={focusId === item.id}
              anchorId={item.id}
              mapNo={mapRows.find((row) => row.id === item.id)?.mapNo}
              onFocus={() => focusRow(item.id)}
            />
          );
        })}
        {!direct.length ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.muted }}>Ingen direkte forespørsler venter.</Text>
            <TouchableOpacity onPress={onOpenInquiry} accessibilityRole="button">
              <Text style={{ color: colors.brand, fontWeight: '600' }}>Gå til 1.2 Anbudsforespørsel</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  pick: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  split: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  stack: { gap: 16 },
  col: { flex: 1, minWidth: 280, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  give: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  decline: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
});
