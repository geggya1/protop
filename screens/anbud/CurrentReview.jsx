import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { STRATEGY_ITEMS } from '../../src/anbud/lifecycle';
import {
  attachDossier,
  createBidWork,
  createManualBidWork,
  releaseUntouchedBid,
  setNoticeDecision,
  toggleConsideration,
} from '../../src/anbud/model';
import { fetchCompetitionFile } from '../../src/anbud/doffinClient';
import { inquiryBrief, noticeBrief, noticeNeedsDossier } from '../../src/anbud/noticeBrief';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
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
import ProcessTrail from './ProcessTrail';
import OppdragBrief from './OppdragBrief';

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
  strategy,
  onToggleStrategy,
  brief,
  briefLoading,
  wide,
}) {
  const missing = assignmentGap({ departments, people, unitId, personId });
  const decision = (
    <View style={styles.col}>
      <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 16 }}>{title}</Text>
      <Text style={{ color: colors.ink }}>{buyer || 'Oppdragsgiver ikke oppgitt'}</Text>
      {meta ? <Text style={{ color: colors.muted }}>{meta}</Text> : null}
      <ProcessTrail steps={steps} colors={colors} />
      {strategy ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Før dere gir tilbud</Text>
          {STRATEGY_ITEMS.map((item) => {
            const on = !!strategy[item.id];
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => onToggleStrategy(item.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <Text style={{ color: on ? colors.ink : colors.muted }}>{on ? '✓' : '○'} {item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
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
          onPress={onGive}
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
          onPress={onDecline}
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
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
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
  const fetchedIds = useRef(new Set());
  const stateRef = useRef(null);
  stateRef.current = state;
  const { width } = useWindowDimensions();
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

  async function weigh(id, itemId) {
    const result = toggleConsideration(state, id, itemId);
    await commitState(result);
  }

  async function giveNotice(notice) {
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
    const made = await commitState(createBidWork(state, notice.id, chosenAssignment(notice.id)));
    setBusyId('');
    if (!made) return;
    const bid = (made.bids || []).find((row) => row.noticeId === notice.id);
    setNote(`${notice.title} er flyttet til 3. Tilbud.`);
    if (bid) onOpenBid?.(bid.id);
  }

  async function declineNotice(notice) {
    setBusyId(notice.id);
    const decided = setNoticeDecision(state, notice.id, 'ikke');
    if (!decided.ok) {
      setError(decided.error);
      setBusyId('');
      return;
    }
    await commitState(releaseUntouchedBid(decided.state, notice.id));
    setBusyId('');
    setNote(`${notice.title} er satt til ikke gi tilbud.`);
  }

  async function giveDirect(item) {
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
    const loaded = state || await loadAnbudState(company?.id);
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
    if (bid) onOpenBid?.(bid.id);
  }

  async function declineDirect(item) {
    setBusyId(item.id);
    setError('');
    const sourceList = item.queueKind === 'protop' ? inbox : inquiries;
    const patched = patchInquiry(sourceList, item.id, {
      status: 'ikke',
      decidedAt: new Date().toISOString(),
    });
    if (!patched.ok) {
      setError(patched.error);
      setBusyId('');
      return;
    }
    try {
      await saveList(item.queueKind, patched.list);
      setNote(`${item.title} er satt til ikke gi tilbud.`);
    } catch (err) {
      setError(err?.message || 'Kunne ikke oppdatere henvendelsen.');
    }
    setBusyId('');
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={[styles.lead, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>Vurdering av aktuelle</Text>
        <Text style={{ color: colors.muted, lineHeight: 20 }}>
          Steg 1 merker konkurransen som aktuell eller uaktuell. Her tar dere stilling til om det skal gis tilbud, og hvem som skal arbeide med det. Gi tilbud flytter saken til 3. Tilbud. Merkingen er lagret, så en annen kan fortsette.
        </Text>
      </View>
      {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>Fra anbudsvarsling</Text>
        <Text style={{ color: colors.muted }}>
          Offentlige kunngjøringer som allerede er merket aktuelle.
        </Text>
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
              onGive={() => giveNotice(notice)}
              onDecline={() => declineNotice(notice)}
              busy={busyId === notice.id}
              strategy={notice.consideration?.strategy || {}}
              onToggleStrategy={(itemId) => weigh(notice.id, itemId)}
              brief={noticeBrief(notice)}
              briefLoading={loadingIds.has(notice.id)}
              wide={wide}
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
        <Text style={{ color: colors.ink, fontWeight: '600' }}>Direkte registrert</Text>
        <Text style={{ color: colors.muted }}>
          Forespørsler som er registrert selv, eller mottatt direkte i ProTop.
        </Text>
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
              onGive={() => giveDirect(item)}
              onDecline={() => declineDirect(item)}
              onUnit={(unitId) => setPick(item.id, { unitId })}
              onPerson={(personId) => setPick(item.id, { personId })}
              busy={busyId === item.id}
              brief={inquiryBrief(item)}
              wide={wide}
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
  split: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  stack: { gap: 16 },
  col: { flex: 1, minWidth: 280, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  give: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  decline: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
});
