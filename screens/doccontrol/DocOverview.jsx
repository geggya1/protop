/**
 * Dokumentstyring i Skjemabygger: det som venter på godkjenning, gjennomgang
 * (for eksempel i ledelsens årlige gjennomgang), merknader, dokumentlisten og innstillingene.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  READ_RULES,
  approveRevision,
  markReviewed,
  overviewRows,
  pendingFor,
  shouldNotify,
  workingRevision,
} from '../../src/doccontrol/model';
import { showSaveToast } from '../../src/ui/saveToast';
import { HrButton, HrCard, HrSectionTitle } from '../hr/HrShared';
import DocControlPanel from './DocControlPanel';
import DocComments from './DocComments';
import { ChoiceChips, Label, OK_INK, PersonChips, StatusChip, dateText, dayText } from './parts';
import { printDocList } from './docListPrint';

const MONTHS = [6, 12, 24, 36].map((months) => ({ id: String(months), label: months === 12 ? '12 måneder' : `${months} måneder` }));

function ReviewRow({ colors, dc, control, onOpen }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const open = dc.comments.filter((row) => row.docKey === control.id && row.status === 'apen').length;

  async function review(decision) {
    const res = markReviewed(control, { decision, note, actor: dc.actor });
    if (!res.ok) return;
    setBusy(true);
    const saved = await dc.storeControl(res.control);
    setBusy(false);
    if (saved.ok) {
      setNote('');
      showSaveToast(decision === 'revideres' ? 'Ny revisjon er startet.' : 'Gjennomgangen er registrert.');
    }
  }

  return (
    <View style={[styles.item, { borderColor: colors.line }]}>
      <View style={styles.row}>
        <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>{`${control.code ? `${control.code} · ` : ''}${control.title}`}</Text>
        <TouchableOpacity onPress={() => onOpen(control)} accessibilityRole="button"><Text style={{ color: colors.brand }}>Åpne</Text></TouchableOpacity>
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        {`Neste gjennomgang ${dayText(control.nextReview) || '–'}${control.lastReview ? ` · sist ${dateText(control.lastReview.at)} av ${control.lastReview.by || '–'}` : ''}${open ? ` · ${open} åpne merknader` : ''}`}
      </Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Konklusjon fra gjennomgangen (valgfritt)"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
      />
      <View style={styles.row}>
        <HrButton colors={colors} icon="checkmark" label="Gjennomgått, ingen endring" onPress={() => review('uendret')} disabled={busy || !!workingRevision(control)} />
        <HrButton colors={colors} primary icon="create-outline" label="Skal revideres" onPress={() => review('revideres')} disabled={busy} />
      </View>
    </View>
  );
}

function SettingsCard({ colors, dc }) {
  const [busy, setBusy] = useState(false);
  const { settings, isAdmin } = dc;

  async function change(part) {
    setBusy(true);
    const res = await dc.updateSettings({ ...settings, ...part });
    setBusy(false);
    if (res.ok) showSaveToast('Innstillingene er lagret.');
  }

  const toggles = [
    ['notifyOnPublish', 'Varsle ansatte om ny versjon', 'Når et dokument med lesekrav godkjennes, får ansatte varsel. Kan overstyres per dokument.'],
    ['employeesCanComment', 'Ansatte kan skrive merknader', 'Ledere kan alltid. Merknadene er bare synlige for utpekte personer.'],
    ['fourEyes', 'Fire øyne', 'Den som sender inn en revisjon, kan ikke godkjenne den selv.'],
  ];

  return (
    <HrCard colors={colors}>
      <HrSectionTitle colors={colors} title="Innstillinger" subtitle={isAdmin ? 'Gjelder alle styrte dokumenter.' : 'Bare eier og administratorer kan endre innstillingene.'} />
      <Label colors={colors}>Godkjennere</Label>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Kan godkjenne alle dokumenter som ikke har egen godkjenner. Uten godkjennere godkjenner administrator.</Text>
      <PersonChips colors={colors} people={dc.people} value={settings.approvers} multiple onChange={(approvers) => change({ approvers })} disabled={!isAdmin || busy} />
      <Label colors={colors}>Lesere av merknader</Label>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Ser alle merknader, i tillegg til godkjennere, dokumentets eier og administrator.</Text>
      <PersonChips colors={colors} people={dc.people} value={settings.commentReaders} multiple onChange={(commentReaders) => change({ commentReaders })} disabled={!isAdmin || busy} />
      {toggles.map(([key, label, hint]) => (
        <View key={key} style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.ink }}>{label}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text>
          </View>
          <Switch value={!!settings[key]} onValueChange={(value) => change({ [key]: value })} disabled={!isAdmin || busy} accessibilityLabel={label} />
        </View>
      ))}
      <Label colors={colors}>Standard gjennomgang for nye dokumenter</Label>
      <ChoiceChips colors={colors} options={MONTHS} value={String(settings.defaultReviewMonths)} onChange={(months) => change({ defaultReviewMonths: Number(months) })} disabled={!isAdmin || busy} />
      {settings.updatedBy ? <Text style={{ color: colors.muted, fontSize: 12 }}>{`Sist endret ${dateText(settings.updatedAt)} av ${settings.updatedBy}`}</Text> : null}
    </HrCard>
  );
}

export default function DocOverview({
  colors,
  dc,
  filled = [],
  canEdit = true,
  onOpen,
  onPreview,
  snapshotFor = null,
  libraryMissing = 0,
  onAddLibrary = null,
}) {
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState('alle');
  const [busy, setBusy] = useState('');
  const { controls, actor, settings, isAdmin } = dc;
  const live = useMemo(() => controls.filter((row) => !row.archived), [controls]);
  const rows = useMemo(
    () => overviewRows(live, { acks: dc.acks, comments: dc.comments, employees: dc.employees, filled }),
    [live, dc.acks, dc.comments, dc.employees, filled],
  );
  const pending = pendingFor(live, actor, settings, { isAdmin });
  const openComments = dc.comments.filter((row) => row.status === 'apen');
  const withComments = live.filter((control) => openComments.some((row) => row.docKey === control.id));
  const reviewList = live.filter((control) => pending.reviews.includes(control) || openComments.some((row) => row.docKey === control.id));
  const shown = rows.filter((row) => (filter === 'alle' ? true
    : filter === 'venter' ? row.working?.state === 'til_gjennomgang'
      : filter === 'utkast' ? !row.version
        : filter === 'lesing' ? !!row.read && row.read.done < row.read.total
          : true));
  const current = selected ? live.find((row) => row.id === selected) : null;

  async function approve(control) {
    setBusy(control.id);
    const res = approveRevision(control, { actor, settings, isAdmin });
    if (!res.ok) {
      setBusy('');
      showSaveToast(res.error);
      return;
    }
    const saved = await dc.storeControl(res.control);
    setBusy('');
    if (saved.ok) {
      dc.notifyPublished(saved.control, res.revision);
      showSaveToast(`${control.title} versjon ${res.revision} er godkjent${shouldNotify(saved.control, settings) ? '. Ansatte får varsel.' : '.'}`);
    }
  }

  return (
    <View style={{ gap: 12 }} nativeID="doc-control">
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Dokumentstyring"
          subtitle="Versjon, godkjenning og lesekrav for KS-malene og personalhåndboken. Revisjonskrav etter ISO 9001/14001/45001 punkt 7.5."
          right={<HrButton colors={colors} icon="print-outline" label="Dokumentliste" onPress={() => printDocList(rows, { company: dc.company, logo: dc.logo?.dataUrl || '' })} />}
        />
        <View style={styles.stats}>
          {[
            [live.length, 'styrte dokumenter'],
            [rows.filter((row) => row.working?.state === 'til_gjennomgang').length, 'venter på godkjenning'],
            [pending.reviews.length, 'gjennomgang forfalt'],
            [openComments.length, 'åpne merknader'],
          ].map(([value, label]) => (
            <View key={label} style={[styles.stat, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700' }}>{value}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
            </View>
          ))}
        </View>
        {libraryMissing && canEdit && onAddLibrary ? (
          <View style={styles.row}>
            <Text style={{ color: colors.ink, flex: 1 }}>{`${libraryMissing} KS-maler er ikke tatt inn ennå. De får dokument-ID fra KS og sendes til godkjenning som rev. 1.`}</Text>
            <HrButton colors={colors} primary icon="shield-checkmark-outline" label="Ta inn KS-malene" onPress={onAddLibrary} />
          </View>
        ) : null}
        <Text style={{ color: colors.muted, fontSize: 12 }}>Politikk, rutiner og prosedyrer styres under ISO › Dokumenter.</Text>
      </HrCard>

      {pending.approvals.length ? (
        <HrCard colors={colors}>
          <HrSectionTitle colors={colors} title="Venter på din godkjenning" subtitle={`${pending.approvals.length} dokumenter`} />
          {pending.approvals.map((control) => {
            const work = workingRevision(control);
            return (
              <View key={control.id} style={[styles.item, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{`${control.code ? `${control.code} · ` : ''}${control.title} · rev. ${work.revision}`}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  {`Sendt ${dateText(work.submittedAt)}${work.submittedBy ? ` av ${work.submittedBy}` : ''} · ${work.changeReason || '–'}`}
                </Text>
                <View style={styles.row}>
                  <HrButton colors={colors} icon="eye-outline" label="Se innsendt versjon" onPress={() => onPreview(work.snapshot, control)} />
                  <HrButton colors={colors} primary icon="checkmark-done" label={busy === control.id ? 'Godkjenner …' : 'Godkjenn og publiser'} onPress={() => approve(control)} disabled={!!busy} />
                  <HrButton colors={colors} label="Åpne" onPress={() => setSelected(control.id)} />
                </View>
              </View>
            );
          })}
        </HrCard>
      ) : null}

      {reviewList.length ? (
        <HrCard colors={colors}>
          <HrSectionTitle
            colors={colors}
            title="Gjennomgang"
            subtitle="Dokumenter med forfalt gjennomgang eller åpne merknader. Brukes i ledelsens gjennomgang: gå gjennom merknadene, revider og send til godkjenning."
          />
          {reviewList.map((control) => <ReviewRow key={control.id} colors={colors} dc={dc} control={control} onOpen={onOpen} />)}
        </HrCard>
      ) : null}

      {withComments.map((control) => (
        <DocComments key={control.id} colors={colors} dc={dc} control={control} title={`Merknader: ${control.title}`} />
      ))}

      {current ? (
        <View style={{ gap: 8 }}>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => setSelected('')} accessibilityRole="button" style={styles.row}>
              <Ionicons name="arrow-back" size={16} color={colors.brand} />
              <Text style={{ color: colors.brand }}>Alle dokumenter</Text>
            </TouchableOpacity>
            <HrButton colors={colors} icon="open-outline" label="Åpne dokumentet" onPress={() => onOpen(current)} />
          </View>
          <DocControlPanel
            colors={colors}
            dc={dc}
            control={current}
            title={current.title}
            snapshot={snapshotFor ? snapshotFor(current) : null}
            canEdit={canEdit}
            filled={filled}
            onPreview={onPreview}
          />
        </View>
      ) : null}

      <HrCard colors={colors}>
        <HrSectionTitle colors={colors} title="Alle dokumenter" subtitle="Trykk på et dokument for versjon, godkjenning, lesekrav og revisjonslogg." />
        <ChoiceChips
          colors={colors}
          options={[
            { id: 'alle', label: 'Alle' },
            { id: 'venter', label: 'Venter på godkjenning' },
            { id: 'utkast', label: 'Ikke godkjent' },
            { id: 'lesing', label: 'Mangler lesing' },
          ]}
          value={filter}
          onChange={setFilter}
        />
        {shown.map((row) => (
          <TouchableOpacity
            key={row.id}
            onPress={() => setSelected(row.id === selected ? '' : row.id)}
            accessibilityRole="button"
            accessibilityLabel={`Dokumentstyring for ${row.title}`}
            style={[styles.docRow, { borderBottomColor: colors.line, backgroundColor: row.id === selected ? `${colors.brand}12` : 'transparent' }]}
          >
            <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.title}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {[row.code, row.version ? `versjon ${row.version}` : 'ikke godkjent', row.approvedAt ? `godkjent ${dateText(row.approvedAt)}` : '', row.owner ? `eier ${row.owner}` : ''].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={styles.meta}>
              <StatusChip status={row.status} colors={colors} />
              <Text style={{ color: colors.muted, fontSize: 12 }}>{READ_RULES.find((rule) => rule.id === row.readRule)?.label}</Text>
              {row.read ? (
                <Text style={{ color: row.read.done >= row.read.total ? OK_INK : colors.muted, fontSize: 12 }}>
                  {`${row.readRule === 'signeres' ? 'Signert' : 'Lest'} ${row.read.done}/${row.read.total}`}
                </Text>
              ) : null}
              {row.openComments ? <Text style={{ color: '#1d4f91', fontSize: 12 }}>{`${row.openComments} merknader`}</Text> : null}
            </View>
          </TouchableOpacity>
        ))}
        {!shown.length ? <Text style={{ color: colors.muted }}>{rows.length ? 'Ingen dokumenter i dette utvalget.' : 'Ingen styrte dokumenter ennå. Ta inn KS-malene, eller åpne en mal og ta den inn.'}</Text> : null}
      </HrCard>

      <SettingsCard colors={colors} dc={dc} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: 130, borderWidth: 1, borderRadius: 10, padding: 10 },
  item: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  docRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
});
