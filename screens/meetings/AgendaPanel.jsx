/**
 * Dagsorden: disposisjon til venstre og valgt punkt til høyre.
 * Før møtet planlegges punktene (tid, innleder, forberedelse). Under møtet
 * (møtemodus) føres notater, beslutninger og oppfølgingspunkter, ett punkt om gangen,
 * med klokke for møtet og for punktet.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import OptionPicker from '../../components/OptionPicker';
import DateField from '../../components/DateField';
import TimeField from '../../components/TimeField';
import { dateKey } from '../../src/utils/dates';
import {
  RECURRENCE,
  VISIBILITY,
  addChapter,
  addItem,
  agendaMinutes,
  clockFromMinutes,
  createMeetingId,
  durationLabel,
  flatItems,
  itemSchedule,
  meetingLength,
  minutesOf,
  moveChapter,
  moveItem,
  removeChapter,
  removeItem,
  shortDate,
  text,
} from '../../src/meetings/model';
import { MEETING_TYPES } from '../../src/meetings/templates';
import { tidyItemNotes } from '../../src/meetings/ai';
import {
  Banner, Btn, Check, Choice, Field, IconBtn, Label, Pill,
} from './meetingUi';

const DETAILS = '__details';

function mapItem(meeting, id, fn) {
  return {
    ...meeting,
    chapters: meeting.chapters.map((c) => ({ ...c, items: c.items.map((i) => (i.id === id ? fn(i) : i)) })),
  };
}

function elapsedLabel(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/* ───────── Disposisjon ───────── */

function OutlineItem({ row, active, current, onPress, start, live }) {
  const colors = useColors();
  const { item } = row;
  const hasNotes = !!text(item.notes);
  const open = item.actions.filter((a) => !a.done).length;
  return (
    <Pressable
      nativeID={`agenda-item-${item.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${row.number} ${item.title}`}
      style={({ hovered }) => [
        styles.oItem,
        active && { backgroundColor: `${colors.brand}14` },
        hovered && !active && { backgroundColor: colors.sunken },
      ]}
    >
      <View style={{ width: 30, alignItems: 'flex-start' }}>
        {live && item.done ? (
          <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
        ) : (
          <Text style={[styles.oNum, { color: active ? colors.brand : colors.muted }]}>{row.number}</Text>
        )}
      </View>
      <Text style={[styles.oTitle, { color: active ? colors.ink : colors.ink, fontWeight: active ? '700' : '400' }, live && item.done && { color: colors.muted }]} numberOfLines={2}>
        {item.title || 'Uten tittel'}
      </Text>
      <View style={styles.oMarks}>
        {current ? <View style={[styles.nowDot]} /> : null}
        {item.carried ? <Ionicons name="return-down-forward" size={13} color="#b45309" accessibilityLabel="Videreført" /> : null}
        {hasNotes ? <Ionicons name="document-text" size={13} color={colors.brand} accessibilityLabel="Har notater" /> : null}
        {item.decisions.length ? <Text style={[styles.mark, { color: '#166534', backgroundColor: '#dcfce7' }]}>{item.decisions.length}</Text> : null}
        {open ? <Text style={[styles.mark, { color: '#92400e', backgroundColor: '#fef3c7' }]}>{open}</Text> : null}
        {!live && start ? <Text style={[styles.oTime, { color: colors.muted }]}>{start.replace(':', '.')}</Text> : null}
      </View>
    </Pressable>
  );
}

function Outline({ meeting, selected, onSelect, onChange, readOnly, live, currentId, width }) {
  const colors = useColors();
  const schedule = useMemo(() => itemSchedule(meeting), [meeting]);
  const planned = agendaMinutes(meeting);
  const length = meetingLength(meeting);
  const over = length && planned > length;
  const pct = length ? Math.min(100, Math.round((planned / length) * 100)) : 0;
  let index = 0;
  return (
    <View style={[styles.outline, { borderColor: colors.line, backgroundColor: colors.card }, width < 900 && { width: '100%' }]}>
      <Pressable
        nativeID="agenda-details"
        onPress={() => onSelect(DETAILS)}
        accessibilityRole="button"
        style={({ hovered }) => [styles.oItem, styles.oDetails, { borderBottomColor: colors.line }, selected === DETAILS && { backgroundColor: `${colors.brand}14` }, hovered && selected !== DETAILS && { backgroundColor: colors.sunken }]}
      >
        <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink }}>Om møtet</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.muted} />
      </Pressable>
      <View style={{ paddingVertical: 6 }}>
        {meeting.chapters.map((chapter, ci) => (
          <View key={chapter.id}>
            <Pressable
              nativeID={`agenda-chapter-${chapter.id}`}
              onPress={() => onSelect(chapter.id)}
              accessibilityRole="button"
              style={({ hovered }) => [styles.oChapter, selected === chapter.id && { backgroundColor: `${colors.brand}10` }, hovered && selected !== chapter.id && { backgroundColor: colors.sunken }]}
            >
              <Text style={[styles.oChNum, { color: colors.brand }]}>{ci + 1}.</Text>
              <Text style={[styles.oChTitle, { color: colors.brand }]} numberOfLines={1}>{chapter.title || 'Kapittel uten navn'}</Text>
            </Pressable>
            {chapter.items.map((item, ii) => {
              index += 1;
              const row = { item, chapter, number: `${ci + 1}.${ii + 1}` };
              return (
                <OutlineItem
                  key={item.id}
                  row={row}
                  active={selected === item.id}
                  current={live && currentId === item.id}
                  live={live}
                  start={schedule[item.id]}
                  onPress={() => onSelect(item.id)}
                />
              );
            })}
          </View>
        ))}
        {!index ? <Text style={{ padding: 14, color: colors.muted, fontSize: 13 }}>Dagsordenen er tom.</Text> : null}
      </View>
      {!readOnly ? (
        <View style={[styles.oFoot, { borderTopColor: colors.line }]}>
          <Btn
            small
            label="Punkt"
            icon="add"
            tone="soft"
            nativeID="agenda-add-item"
            onPress={() => {
              const chapterId = meeting.chapters.find((c) => c.id === selected || c.items.some((i) => i.id === selected))?.id
                || meeting.chapters[meeting.chapters.length - 1]?.id;
              const made = addItem(meeting, chapterId, { title: '', minutes: 5 });
              onChange(made.meeting);
              onSelect(made.item.id, { focus: true });
            }}
          />
          <Btn
            small
            label="Kapittel"
            icon="add"
            tone="ghost"
            nativeID="agenda-add-chapter"
            onPress={() => {
              const made = addChapter(meeting, '', { withItem: false });
              onChange(made.meeting);
              onSelect(made.chapter.id, { focus: true });
            }}
          />
        </View>
      ) : null}
      {!live ? (
        <View style={[styles.budget, { borderTopColor: colors.line }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: colors.muted }}>Planlagt tid</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: over ? '#b91c1c' : colors.ink }}>
              {durationLabel(planned)}{length ? ` av ${durationLabel(length)}` : ''}
            </Text>
          </View>
          {length ? (
            <View style={[styles.bar, { backgroundColor: colors.sunken }]}>
              <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: over ? '#ef4444' : colors.brand }]} />
            </View>
          ) : null}
          {over ? <Text style={{ fontSize: 11.5, color: '#b91c1c' }}>Dagsordenen er {planned - length} min lenger enn møtet.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/* ───────── Møtemodus ───────── */

function LiveBar({ meeting, currentRow, itemStartedAt, onPrev, onNext, onEnd, canPrev, canNext, position, total }) {
  const colors = useColors();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const startedMs = meeting.startedAt ? new Date(meeting.startedAt).getTime() : now;
  const itemMs = now - (itemStartedAt || now);
  const planned = (currentRow?.item.minutes || 0) * 60000;
  const ratio = planned ? itemMs / planned : 0;
  const tone = ratio > 1 ? '#ef4444' : (ratio > 0.8 ? '#f59e0b' : '#22c55e');
  return (
    <View style={[styles.live, { backgroundColor: '#0b1b33' }]} nativeID="live-bar">
      <View style={styles.liveLeft}>
        <View style={styles.livePulse} />
        <Text style={styles.liveKicker}>PÅGÅR</Text>
        <Text style={styles.liveClock} accessibilityLabel="Tid siden møtet startet">{elapsedLabel(now - startedMs)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 200, gap: 5 }}>
        <Text style={{ color: '#cbd5e1', fontSize: 12 }}>Punkt {position} av {total}</Text>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
          {currentRow ? `${currentRow.number} ${currentRow.item.title}` : 'Ingen punkter'}
        </Text>
        {currentRow && planned ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.liveBar]}>
              <View style={{ width: `${Math.min(100, Math.round(ratio * 100))}%`, height: 4, borderRadius: 2, backgroundColor: tone }} />
            </View>
            <Text style={{ color: ratio > 1 ? '#fca5a5' : '#cbd5e1', fontSize: 12 }}>{elapsedLabel(itemMs)} / {currentRow.item.minutes} min</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.liveActions}>
        <Pressable onPress={onPrev} disabled={!canPrev} accessibilityRole="button" accessibilityLabel="Forrige punkt" style={[styles.liveBtn, !canPrev && { opacity: 0.35 }]}>
          <Ionicons name="chevron-back" size={18} color="#fff" />
        </Pressable>
        <Pressable nativeID="live-next" onPress={onNext} disabled={!canNext} accessibilityRole="button" accessibilityLabel="Neste punkt" style={[styles.liveBtn, styles.liveNext, !canNext && { opacity: 0.35 }]}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Neste punkt</Text>
          <Ionicons name="chevron-forward" size={16} color="#fff" />
        </Pressable>
        <Pressable nativeID="live-end" onPress={onEnd} accessibilityRole="button" style={[styles.liveBtn, { backgroundColor: '#dc2626' }]}>
          <Ionicons name="stop" size={14} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Avslutt møtet</Text>
        </Pressable>
      </View>
      {Platform.OS === 'web' ? <Text style={{ color: '#64748b', fontSize: 11, width: '100%' }}>Tips: Alt + → går til neste punkt, Alt + ← til forrige.</Text> : null}
    </View>
  );
}

/* ───────── Punkt ───────── */

function ListAdd({ placeholder, onAdd, nativeID, tone }) {
  const colors = useColors();
  const [value, setValue] = useState('');
  const submit = () => {
    const v = text(value);
    if (!v) return;
    onAdd(v);
    setValue('');
  };
  return (
    <View style={[styles.addRow, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Ionicons name="add" size={17} color={tone || colors.brand} />
      <TextInput
        nativeID={nativeID}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        returnKeyType="done"
        blurOnSubmit={false}
        accessibilityLabel={placeholder}
        style={[styles.addInput, { color: colors.ink }]}
      />
      {value ? <Btn small label="Legg til" tone="soft" onPress={submit} /> : null}
    </View>
  );
}

function ActionRow({ action, participants, readOnly, onPatch, onRemove, today }) {
  const colors = useColors();
  const overdue = !action.done && action.due && action.due < today;
  const options = participants.map((p) => ({ id: p.id, label: p.name, hint: p.company }));
  const value = participants.find((p) => p.id === action.assigneeId || p.name === action.assigneeName)?.id || '';
  return (
    <View style={[styles.action, { borderColor: action.done ? '#bbf7d0' : (overdue ? '#fecaca' : '#fde68a'), backgroundColor: action.done ? '#f0fdf4' : '#fffbeb' }]}>
      <Check checked={action.done} onPress={() => onPatch({ done: !action.done, doneAt: !action.done ? new Date().toISOString() : '' })} disabled={readOnly} color="#16a34a" a11y={action.done ? 'Utført' : 'Marker som utført'} />
      <View style={{ flex: 1, minWidth: 180, gap: 6 }}>
        {readOnly ? (
          <Text style={[{ fontSize: 14, color: colors.ink }, action.done && { textDecorationLine: 'line-through', color: colors.muted }]}>{action.text}</Text>
        ) : (
          <TextInput
            value={action.text}
            onChangeText={(v) => onPatch({ text: v })}
            multiline
            accessibilityLabel="Oppfølgingspunkt"
            style={[styles.inlineText, { color: colors.ink }, action.done && { textDecorationLine: 'line-through', color: colors.muted }]}
          />
        )}
        <View style={styles.actionMeta}>
          {action.originNumber && action.originMeetingId ? <Pill label={`Fra møte ${action.originNumber}`} icon="return-down-forward" tone="warn" small /> : null}
          {overdue ? <Pill label="Forfalt" icon="alert-circle" tone="danger" small /> : null}
        </View>
      </View>
      <View style={styles.actionSide}>
        {readOnly ? (
          <Text style={{ fontSize: 13, color: colors.ink, fontWeight: '600' }}>{action.assigneeName || 'Uten ansvarlig'}</Text>
        ) : (
          <View style={{ width: 190 }}>
            <OptionPicker
              small
              options={options}
              value={value}
              onChange={(id) => {
                const p = participants.find((row) => row.id === id);
                onPatch({ assigneeId: p?.id || '', assigneeName: p?.name || '' });
              }}
              onCustom={(name) => onPatch({ assigneeId: '', assigneeName: text(name) })}
              placeholder={action.assigneeName || 'Ansvarlig'}
              clearLabel="Ingen ansvarlig"
              chipLimit={0}
              searchable
              title="Ansvarlig"
            />
          </View>
        )}
        {readOnly ? (
          <Text style={{ fontSize: 13, color: overdue ? '#b91c1c' : colors.muted }}>{action.due ? `Frist ${shortDate(action.due)}` : 'Ingen frist'}</Text>
        ) : (
          <DateField
            value={action.due}
            onChange={(d) => onPatch({ due: d ? dateKey(d) : '' })}
            placeholder="Frist"
            style={[styles.dateBox, { borderColor: overdue ? '#fca5a5' : colors.line, backgroundColor: colors.card }]}
            textStyle={{ fontSize: 13 }}
          />
        )}
        {!readOnly ? <IconBtn icon="trash-outline" label="Fjern oppfølgingspunkt" onPress={onRemove} /> : null}
      </View>
    </View>
  );
}

function TidySuggestion({ result, onApply, onDismiss }) {
  const colors = useColors();
  return (
    <View style={[styles.tidy, { borderColor: '#ddd6fe' }]} nativeID="ai-tidy-result">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="sparkles" size={16} color="#7c3aed" />
        <Text style={{ fontWeight: '700', color: '#5b21b6', flex: 1 }}>{result.engine === 'lokal' ? 'Ryddet lokalt' : 'Forslag fra AI'}</Text>
      </View>
      {result.note ? <Text style={{ fontSize: 12.5, color: colors.muted }}>{result.note}</Text> : null}
      {result.notes ? <Text style={{ fontSize: 14, color: colors.ink, lineHeight: 21 }}>{result.notes}</Text> : null}
      {result.decisions.map((d) => (
        <View key={d} style={styles.tidyRow}><Ionicons name="checkmark-done" size={14} color="#16a34a" /><Text style={{ flex: 1, fontSize: 13.5, color: colors.ink }}>Beslutning: {d}</Text></View>
      ))}
      {result.actions.map((a) => (
        <View key={a.text} style={styles.tidyRow}><Ionicons name="flag" size={14} color="#d97706" /><Text style={{ flex: 1, fontSize: 13.5, color: colors.ink }}>Oppfølging: {a.text}{a.assigneeName ? ` (${a.assigneeName})` : ''}{a.due ? `, frist ${shortDate(a.due)}` : ''}</Text></View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Btn small label="Bruk forslaget" icon="checkmark" tone="ai" onPress={onApply} nativeID="ai-tidy-apply" />
        <Btn small label="Forkast" tone="plain" onPress={onDismiss} />
      </View>
    </View>
  );
}

function ItemEditor({
  meeting, row, schedule, participants, readOnly, live, onChange, onRemove, onMove, focusKey, today, companyId, remoteAi,
}) {
  const colors = useColors();
  const { item } = row;
  const [tidy, setTidy] = useState(null);
  const [tidyBusy, setTidyBusy] = useState(false);
  const titleRef = useRef(null);
  const notesRef = useRef(null);
  useEffect(() => { setTidy(null); }, [item.id]);
  useEffect(() => {
    if (focusKey && focusKey === item.id && !readOnly) setTimeout(() => (live ? notesRef : titleRef).current?.focus?.(), 60);
  }, [focusKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p) => onChange(mapItem(meeting, item.id, (i) => ({ ...i, ...p, updatedAt: new Date().toISOString() })));
  const patchAction = (id, p) => patch({ actions: item.actions.map((a) => (a.id === id ? { ...a, ...p } : a)) });
  const presenter = participants.map((p) => ({ id: p.id, label: p.name, hint: p.company }));

  async function runTidy() {
    setTidyBusy(true);
    const result = await tidyItemNotes({ meeting, itemId: item.id, companyId }, { remote: remoteAi });
    setTidy(result);
    setTidyBusy(false);
  }

  function applyTidy() {
    const byName = (name) => participants.find((p) => p.name === name);
    patch({
      notes: tidy.notes || item.notes,
      decisions: [...item.decisions, ...tidy.decisions.map((d) => ({ id: createMeetingId('bes'), text: d }))],
      actions: [...item.actions, ...tidy.actions.map((a) => ({
        id: createMeetingId('akt'),
        text: a.text,
        assigneeId: byName(a.assigneeName)?.id || '',
        assigneeName: a.assigneeName,
        due: a.due,
        done: false,
        originMeetingId: meeting.id,
        originNumber: meeting.number,
        originDate: meeting.date,
        createdAt: new Date().toISOString(),
      }))],
    });
    setTidy(null);
  }

  return (
    <View style={{ gap: 16 }} nativeID="agenda-editor">
      <View style={styles.edHead}>
        <Text style={[styles.edNum, { color: colors.brand }]}>{row.number}</Text>
        {readOnly ? (
          <Text style={[styles.edTitle, { color: colors.ink, flex: 1 }]}>{item.title}</Text>
        ) : (
          <TextInput
            ref={titleRef}
            nativeID="item-title"
            dataSet={{ meetingInput: 'title' }}
            value={item.title}
            onChangeText={(v) => patch({ title: v })}
            placeholder="Tittel på punktet"
            placeholderTextColor={colors.placeholder}
            accessibilityLabel="Tittel på punktet"
            style={[styles.edTitle, styles.edTitleInput, { color: colors.ink }]}
          />
        )}
        {!readOnly ? (
          <View style={{ flexDirection: 'row' }}>
            <IconBtn icon="arrow-up" label="Flytt opp" onPress={() => onMove(-1)} />
            <IconBtn icon="arrow-down" label="Flytt ned" onPress={() => onMove(1)} />
            <IconBtn icon="trash-outline" label="Slett punktet" onPress={onRemove} color="#dc2626" />
          </View>
        ) : null}
      </View>

      <View style={styles.metaRow}>
        <View style={{ gap: 6, minWidth: 200, flex: 1 }}>
          <Label>Innleder</Label>
          {readOnly ? (
            <Text style={{ color: colors.ink }}>{participants.find((p) => p.id === item.presenterId)?.name || '–'}</Text>
          ) : (
            <OptionPicker small options={presenter} value={item.presenterId} onChange={(id) => patch({ presenterId: id || '' })} placeholder="Ingen innleder" clearLabel="Ingen innleder" chipLimit={0} searchable title="Innleder" />
          )}
        </View>
        <View style={{ gap: 6 }}>
          <Label>Varighet</Label>
          <View style={[styles.stepper, { borderColor: colors.line, backgroundColor: colors.card }]}>
            {!readOnly ? <IconBtn icon="remove" size={16} label="Kortere" onPress={() => patch({ minutes: Math.max(0, (item.minutes || 0) - 5) })} /> : null}
            <Text style={{ minWidth: 56, textAlign: 'center', fontWeight: '700', color: colors.ink }}>{item.minutes || 0} min</Text>
            {!readOnly ? <IconBtn icon="add" size={16} label="Lengre" onPress={() => patch({ minutes: Math.min(600, (item.minutes || 0) + 5) })} /> : null}
          </View>
        </View>
        {schedule[item.id] ? (
          <View style={{ gap: 6 }}>
            <Label>Starter</Label>
            <Text style={{ fontSize: 15, color: colors.ink, paddingVertical: 8 }}>kl. {schedule[item.id].replace(':', '.')}</Text>
          </View>
        ) : null}
      </View>

      {item.carried ? (
        <Banner tone="warn" icon="return-down-forward">Punktet har åpne oppfølgingspunkter fra et tidligere møte i serien. Gå gjennom dem og marker det som er gjort.</Banner>
      ) : null}

      {!live || item.description ? (
        <View style={{ gap: 6 }}>
          <Label>Bakgrunn og forberedelse</Label>
          {readOnly ? (
            <Text style={{ fontSize: 14, color: item.description ? colors.ink : colors.muted, lineHeight: 21 }}>{item.description || 'Ingen bakgrunn.'}</Text>
          ) : (
            <TextInput
              value={item.description}
              onChangeText={(v) => patch({ description: v })}
              multiline
              placeholder="Står i innkallingen. Hva skal deltakerne vite eller forberede?"
              placeholderTextColor={colors.placeholder}
              accessibilityLabel="Bakgrunn og forberedelse"
              style={[styles.area, { minHeight: live ? 50 : 80, color: colors.ink, borderColor: colors.line, backgroundColor: live ? colors.sunken : colors.card }]}
            />
          )}
        </View>
      ) : null}

      <View style={[styles.minutesBox, { borderColor: live ? colors.brand : colors.line, backgroundColor: colors.card }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Ionicons name="create-outline" size={17} color={colors.brand} />
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink, flex: 1 }}>Referat</Text>
          {!readOnly && text(item.notes) ? (
            <Btn small label="Rydd med AI" icon="sparkles" tone="ai" busy={tidyBusy} onPress={runTidy} nativeID="ai-tidy" />
          ) : null}
        </View>
        {readOnly ? (
          <Text style={{ fontSize: 14.5, color: item.notes ? colors.ink : colors.muted, lineHeight: 22 }}>{item.notes || 'Ingen notater.'}</Text>
        ) : (
          <TextInput
            ref={notesRef}
            nativeID="item-notes"
            dataSet={{ meetingInput: 'notes' }}
            value={item.notes}
            onChangeText={(v) => patch({ notes: v })}
            multiline
            placeholder={live ? 'Skriv det som blir sagt. Stikkord holder, «Rydd med AI» gjør det om til ferdig tekst.' : 'Fylles ut under møtet.'}
            placeholderTextColor={colors.placeholder}
            accessibilityLabel="Referat for punktet"
            style={[styles.area, { minHeight: live ? 170 : 110, color: colors.ink, borderColor: colors.line, backgroundColor: colors.card, fontSize: 15 }]}
          />
        )}
        {tidy ? <TidySuggestion result={tidy} onApply={applyTidy} onDismiss={() => setTidy(null)} /> : null}

        <View style={{ gap: 8 }}>
          <View style={styles.subHead}>
            <Ionicons name="checkmark-done" size={15} color="#16a34a" />
            <Text style={[styles.subTitle, { color: colors.ink }]}>Beslutninger</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{item.decisions.length || ''}</Text>
          </View>
          {item.decisions.map((d) => (
            <View key={d.id} style={styles.decision}>
              {readOnly ? (
                <Text style={{ flex: 1, fontSize: 14, color: colors.ink }}>{d.text}</Text>
              ) : (
                <TextInput
                  value={d.text}
                  onChangeText={(v) => patch({ decisions: item.decisions.map((row) => (row.id === d.id ? { ...row, text: v } : row)) })}
                  multiline
                  accessibilityLabel="Beslutning"
                  style={[styles.inlineText, { flex: 1, color: colors.ink }]}
                />
              )}
              {!readOnly ? <IconBtn icon="close" size={15} label="Fjern beslutning" onPress={() => patch({ decisions: item.decisions.filter((row) => row.id !== d.id) })} /> : null}
            </View>
          ))}
          {!readOnly ? (
            <ListAdd nativeID="add-decision" tone="#16a34a" placeholder="Ny beslutning, trykk Enter" onAdd={(v) => patch({ decisions: [...item.decisions, { id: createMeetingId('bes'), text: v }] })} />
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <View style={styles.subHead}>
            <Ionicons name="flag" size={14} color="#d97706" />
            <Text style={[styles.subTitle, { color: colors.ink }]}>Oppfølging</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{item.actions.length || ''}</Text>
          </View>
          {item.actions.map((a) => (
            <ActionRow
              key={a.id}
              action={a}
              participants={participants}
              readOnly={readOnly}
              today={today}
              onPatch={(p) => patchAction(a.id, p)}
              onRemove={() => patch({ actions: item.actions.filter((row) => row.id !== a.id) })}
            />
          ))}
          {!readOnly ? (
            <ListAdd
              nativeID="add-action"
              tone="#d97706"
              placeholder="Nytt oppfølgingspunkt, trykk Enter"
              onAdd={(v) => patch({
                actions: [...item.actions, {
                  id: createMeetingId('akt'), text: v, assigneeId: '', assigneeName: '', due: '', done: false,
                  originMeetingId: meeting.id, originNumber: meeting.number, originDate: meeting.date, createdAt: new Date().toISOString(),
                }],
              })}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ChapterEditor({ meeting, chapter, index, readOnly, onChange, onSelect }) {
  const colors = useColors();
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.edHead}>
        <Text style={[styles.edNum, { color: colors.brand }]}>{index + 1}</Text>
        {readOnly ? (
          <Text style={[styles.edTitle, { color: colors.ink, flex: 1 }]}>{chapter.title}</Text>
        ) : (
          <TextInput
            nativeID="chapter-title"
            dataSet={{ meetingInput: 'title' }}
            value={chapter.title}
            onChangeText={(v) => onChange({ ...meeting, chapters: meeting.chapters.map((c) => (c.id === chapter.id ? { ...c, title: v } : c)) })}
            placeholder="Navn på kapittelet"
            placeholderTextColor={colors.placeholder}
            accessibilityLabel="Navn på kapittelet"
            autoFocus={!chapter.title}
            style={[styles.edTitle, styles.edTitleInput, { color: colors.ink }]}
          />
        )}
        {!readOnly ? (
          <View style={{ flexDirection: 'row' }}>
            <IconBtn icon="arrow-up" label="Flytt kapittel opp" onPress={() => onChange(moveChapter(meeting, chapter.id, -1))} />
            <IconBtn icon="arrow-down" label="Flytt kapittel ned" onPress={() => onChange(moveChapter(meeting, chapter.id, 1))} />
            <IconBtn icon="trash-outline" color="#dc2626" label="Slett kapittelet" onPress={() => { onChange(removeChapter(meeting, chapter.id)); onSelect(DETAILS); }} />
          </View>
        ) : null}
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{chapter.items.length} punkt{chapter.items.length === 1 ? '' : 'er'} · {durationLabel(chapter.items.reduce((s, i) => s + (i.minutes || 0), 0))}</Text>
      <View style={{ gap: 6 }}>
        {chapter.items.map((item, ii) => (
          <Pressable key={item.id} onPress={() => onSelect(item.id)} style={({ hovered }) => [styles.chItem, { borderColor: colors.line, backgroundColor: hovered ? colors.sunken : colors.card }]}>
            <Text style={{ width: 34, color: colors.muted, fontWeight: '600' }}>{index + 1}.{ii + 1}</Text>
            <Text style={{ flex: 1, color: colors.ink }} numberOfLines={1}>{item.title || 'Uten tittel'}</Text>
            <Text style={{ color: colors.muted, fontSize: 12.5 }}>{item.minutes} min</Text>
          </Pressable>
        ))}
      </View>
      {!readOnly ? (
        <Btn
          small
          label="Nytt punkt i kapittelet"
          icon="add"
          tone="soft"
          style={{ alignSelf: 'flex-start' }}
          onPress={() => {
            const made = addItem(meeting, chapter.id, { title: '', minutes: 5 });
            onChange(made.meeting);
            onSelect(made.item.id, { focus: true });
          }}
        />
      ) : null}
    </View>
  );
}

function DetailsEditor({ meeting, readOnly, onChange, projects }) {
  const colors = useColors();
  const set = (patch) => onChange({ ...meeting, ...patch });
  const box = [styles.dateBox, { borderColor: colors.line, backgroundColor: readOnly ? colors.sunken : colors.card, minHeight: 42 }];
  return (
    <View style={{ gap: 14 }} nativeID="details-editor">
      <Text style={[styles.edTitle, { color: colors.ink }]}>Om møtet</Text>
      <Field label="Tittel" value={meeting.title} onChange={(v) => set({ title: v })} editable={!readOnly} nativeID="details-title" />
      <View style={styles.metaRow}>
        <View style={{ flex: 1, minWidth: 180, gap: 6 }}>
          <Label>Type</Label>
          <OptionPicker options={MEETING_TYPES.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))} value={meeting.typeId} onChange={(id) => set({ typeId: id || 'annet' })} clearable={false} chipLimit={0} disabled={readOnly} title="Møtetype" />
        </View>
        <View style={{ flex: 1, minWidth: 180, gap: 6 }}>
          <Label>Prosjekt</Label>
          <OptionPicker
            options={projects.map((p) => ({ id: p.id, label: [p.number, p.name].filter(Boolean).join(' ') }))}
            value={meeting.projectId}
            onChange={(id) => {
              const p = projects.find((row) => row.id === id);
              set({ projectId: p?.id || '', projectName: p?.name || '', projectNumber: p?.number || '' });
            }}
            placeholder={meeting.projectName || 'Ikke knyttet til prosjekt'}
            clearLabel="Ikke knyttet til prosjekt"
            chipLimit={0}
            searchable
            disabled={readOnly}
            title="Prosjekt"
          />
        </View>
      </View>
      <View style={styles.metaRow}>
        <View style={{ flex: 1.3, gap: 6, minWidth: 170 }}>
          <Label>Dato</Label>
          {readOnly ? <Text style={{ color: colors.ink }}>{meeting.date ? shortDate(meeting.date) : 'Ikke satt'}</Text> : (
            <DateField value={meeting.date} onChange={(d) => set({ date: d ? dateKey(d) : '' })} placeholder="Velg dato" style={box} />
          )}
        </View>
        <View style={{ flex: 1, gap: 6, minWidth: 110 }}>
          <Label>Fra</Label>
          <TimeField
            value={meeting.start}
            disabled={readOnly}
            onChange={(v) => {
              const len = meetingLength(meeting);
              set({ start: v, end: len ? clockFromMinutes((minutesOf(v) ?? 540) + len) : meeting.end });
            }}
            style={box}
          />
        </View>
        <View style={{ flex: 1, gap: 6, minWidth: 110 }}>
          <Label>Til</Label>
          <TimeField value={meeting.end} disabled={readOnly} onChange={(v) => set({ end: v })} style={box} />
        </View>
      </View>
      <View style={styles.metaRow}>
        <Field label="Sted" value={meeting.location} onChange={(v) => set({ location: v })} editable={!readOnly} placeholder="Adresse eller møterom" style={{ flex: 1, minWidth: 200 }} />
        <Field label="Videolenke" value={meeting.videoUrl} onChange={(v) => set({ videoUrl: v })} editable={!readOnly} placeholder="Teams, Meet eller Zoom" style={{ flex: 1, minWidth: 200 }} />
      </View>
      <Field label="Formål" value={meeting.purpose} onChange={(v) => set({ purpose: v })} editable={!readOnly} multiline minHeight={70} placeholder="Hva skal møtet oppnå? Står i innkallingen." />
      <View style={{ gap: 6 }}>
        <Label>Hvem ser møtet</Label>
        {readOnly ? <Text style={{ color: colors.ink }}>{VISIBILITY.find((v) => v.id === meeting.visibility)?.label}</Text> : (
          <Choice options={VISIBILITY.map((v) => ({ id: v.id, label: v.label, icon: v.id === 'deltakere' ? 'lock-closed-outline' : 'people-outline' }))} value={meeting.visibility} onChange={(v) => set({ visibility: v })} />
        )}
      </View>
      <View style={{ gap: 6 }}>
        <Label>Gjentakelse</Label>
        {readOnly ? <Text style={{ color: colors.ink }}>{RECURRENCE.find((r) => r.id === meeting.recurrence.freq)?.label}</Text> : (
          <Choice small options={RECURRENCE.map((r) => ({ id: r.id, label: r.short }))} value={meeting.recurrence.freq} onChange={(v) => set({ recurrence: { ...meeting.recurrence, freq: v } })} />
        )}
      </View>
      <View style={[styles.nextBox, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>Neste møte</Text>
        <Text style={{ fontSize: 12.5, color: colors.muted }}>Står nederst i referatet. Neste møte i serien lages med denne datoen.</Text>
        <View style={styles.metaRow}>
          <View style={{ flex: 1.3, gap: 6, minWidth: 170 }}>
            <Label>Dato</Label>
            {readOnly ? <Text style={{ color: colors.ink }}>{meeting.nextDate ? shortDate(meeting.nextDate) : 'Ikke satt'}</Text> : (
              <DateField value={meeting.nextDate} onChange={(d) => set({ nextDate: d ? dateKey(d) : '' })} placeholder="Velg dato" style={box} />
            )}
          </View>
          <View style={{ flex: 1, gap: 6, minWidth: 110 }}>
            <Label>Kl.</Label>
            <TimeField value={meeting.nextStart} disabled={readOnly} onChange={(v) => set({ nextStart: v })} style={box} />
          </View>
          <Field label="Sted" value={meeting.nextLocation} onChange={(v) => set({ nextLocation: v })} editable={!readOnly} placeholder={meeting.location || 'Sted'} style={{ flex: 1.5, minWidth: 180 }} />
        </View>
      </View>
    </View>
  );
}

/* ───────── Panelet ───────── */

export default function AgendaPanel({
  meeting, onChange, readOnly, live, participants, projects, today, width, companyId, remoteAi = true, onEnd, initialSelected,
}) {
  const colors = useColors();
  const rows = useMemo(() => flatItems(meeting), [meeting]);
  const schedule = useMemo(() => itemSchedule(meeting), [meeting]);
  const firstOpen = rows.find((r) => !r.item.done)?.item.id || rows[0]?.item.id || DETAILS;
  const [selected, setSelected] = useState(initialSelected || (live ? firstOpen : (rows[0]?.item.id || DETAILS)));
  const [focusKey, setFocusKey] = useState('');
  const [currentId, setCurrentId] = useState(live ? firstOpen : '');
  const [itemStartedAt, setItemStartedAt] = useState(Date.now());
  const wide = width >= 900;
  const [showOutline, setShowOutline] = useState(true);

  useEffect(() => {
    if (live && !currentId) {
      setCurrentId(firstOpen);
      setSelected(firstOpen);
      setItemStartedAt(Date.now());
    }
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (id, opts = {}) => {
    setSelected(id);
    if (opts.focus) setFocusKey(id);
    if (!wide && id !== DETAILS) setShowOutline(false);
  };

  const currentIndex = rows.findIndex((r) => r.item.id === currentId);
  const go = (dir) => {
    const nextIndex = currentIndex + dir;
    if (nextIndex < 0 || nextIndex >= rows.length) return;
    let next = meeting;
    if (dir > 0 && currentId) next = mapItem(next, currentId, (i) => ({ ...i, done: true }));
    const id = rows[nextIndex].item.id;
    if (next !== meeting) onChange(next);
    setCurrentId(id);
    setSelected(id);
    setFocusKey(id);
    setItemStartedAt(Date.now());
  };

  useEffect(() => {
    if (!live || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onKey = (e) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const selectedRow = rows.find((r) => r.item.id === selected) || null;
  const selectedChapterIndex = meeting.chapters.findIndex((c) => c.id === selected);

  let editor = null;
  if (selected === DETAILS) {
    editor = <DetailsEditor meeting={meeting} readOnly={readOnly} onChange={onChange} projects={projects} />;
  } else if (selectedChapterIndex >= 0) {
    editor = (
      <ChapterEditor
        meeting={meeting}
        chapter={meeting.chapters[selectedChapterIndex]}
        index={selectedChapterIndex}
        readOnly={readOnly}
        onChange={onChange}
        onSelect={select}
      />
    );
  } else if (selectedRow) {
    editor = (
      <ItemEditor
        key={selectedRow.item.id}
        meeting={meeting}
        row={selectedRow}
        schedule={schedule}
        participants={participants}
        readOnly={readOnly}
        live={live}
        today={today}
        companyId={companyId}
        remoteAi={remoteAi}
        focusKey={focusKey}
        onChange={onChange}
        onMove={(dir) => onChange(moveItem(meeting, selectedRow.item.id, dir))}
        onRemove={() => {
          const idx = rows.findIndex((r) => r.item.id === selectedRow.item.id);
          onChange(removeItem(meeting, selectedRow.item.id));
          select(rows[idx + 1]?.item.id || rows[idx - 1]?.item.id || DETAILS);
        }}
      />
    );
  } else {
    editor = <Text style={{ color: colors.muted }}>Velg et punkt i dagsordenen.</Text>;
  }

  const currentRow = rows[currentIndex] || null;

  return (
    <View style={{ gap: 12 }}>
      {live ? (
        <LiveBar
          meeting={meeting}
          currentRow={currentRow}
          itemStartedAt={itemStartedAt}
          position={currentIndex + 1}
          total={rows.length}
          canPrev={currentIndex > 0}
          canNext={currentIndex < rows.length - 1}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          onEnd={onEnd}
        />
      ) : null}
      {live && selected !== currentId && currentId ? (
        <Banner
          tone="info"
          icon="eye-outline"
          action={<Btn small label="Tilbake til gjeldende punkt" tone="soft" onPress={() => { setSelected(currentId); }} />}
        >
          Du ser på et annet punkt enn det møtet er på.
        </Banner>
      ) : null}
      <View style={[styles.split, !wide && { flexDirection: 'column' }]}>
        {wide || showOutline ? (
          <Outline
            meeting={meeting}
            selected={selected}
            onSelect={select}
            onChange={onChange}
            readOnly={readOnly}
            live={live}
            currentId={currentId}
            width={width}
          />
        ) : (
          <Btn small label="Vis dagsorden" icon="list" tone="ghost" onPress={() => setShowOutline(true)} style={{ alignSelf: 'flex-start' }} />
        )}
        <View style={[styles.editor, { borderColor: colors.line, backgroundColor: colors.card }, !wide && { width: '100%' }]}>
          {editor}
        </View>
      </View>
    </View>
  );
}

export { DETAILS };

const styles = StyleSheet.create({
  split: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  outline: { width: 340, borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  oDetails: { borderBottomWidth: 1, paddingVertical: 12 },
  oChapter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  oChNum: { fontSize: 14, fontWeight: '800' },
  oChTitle: { fontSize: 14, fontWeight: '800', flex: 1 },
  oItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  oNum: { fontSize: 12.5, fontWeight: '600' },
  oTitle: { flex: 1, fontSize: 13.5 },
  oMarks: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  oTime: { fontSize: 11.5, width: 38, textAlign: 'right' },
  mark: { fontSize: 10.5, fontWeight: '800', paddingHorizontal: 5, borderRadius: 6, overflow: 'hidden', minWidth: 16, textAlign: 'center' },
  nowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  oFoot: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1 },
  budget: { padding: 12, gap: 6, borderTopWidth: 1 },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  editor: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 14, padding: 20 },
  edHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  edNum: { fontSize: 20, fontWeight: '800', minWidth: 34 },
  edTitle: { fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  edTitleInput: { flex: 1, paddingVertical: 4, outlineStyle: 'none', minWidth: 120 },
  metaRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, minHeight: 34, paddingHorizontal: 2 },
  area: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14.5, lineHeight: 22, textAlignVertical: 'top' },
  minutesBox: { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 14 },
  subHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subTitle: { fontSize: 13.5, fontWeight: '700' },
  decision: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0fdf4', borderLeftWidth: 3, borderLeftColor: '#16a34a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  inlineText: { fontSize: 14, paddingVertical: 4, outlineStyle: 'none', minHeight: 26 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 10, minHeight: 40 },
  addInput: { flex: 1, fontSize: 14, paddingVertical: 8, outlineStyle: 'none' },
  action: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 10, padding: 10, flexWrap: 'wrap' },
  actionMeta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  actionSide: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dateBox: { borderWidth: 1, borderRadius: 8, minHeight: 34, paddingHorizontal: 8 },
  tidy: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8, backgroundColor: '#faf8ff' },
  tidyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  chItem: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  nextBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  live: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  liveLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  livePulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444', shadowColor: '#ef4444', shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  liveKicker: { color: '#fca5a5', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  liveClock: { color: '#fff', fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  liveBar: { flex: 1, maxWidth: 240, height: 4, borderRadius: 2, backgroundColor: '#1e3a5f' },
  liveActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 12, minHeight: 38, backgroundColor: '#1e3a5f' },
  liveNext: { backgroundColor: '#1099F4' },
});
