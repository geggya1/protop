/**
 * Nytt møte i to steg: hvordan du vil starte (mal, skjema, AI, blankt eller
 * neste møte i en serie), og så detaljene (tid, sted, deltakere, gjentakelse).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import DialogShell from '../economy/invoice/DialogShell';
import OptionPicker from '../../components/OptionPicker';
import DateField from '../../components/DateField';
import TimeField from '../../components/TimeField';
import { dateKey } from '../../src/utils/dates';
import {
  RECURRENCE,
  VISIBILITY,
  addDays,
  clockFromMinutes,
  durationLabel,
  minutesOf,
  nextRecurrenceDate,
  normalizeChapter,
  recurrenceLabel,
  seriesOverview,
  shortDate,
  text,
} from '../../src/meetings/model';
import {
  MEETING_TYPES,
  agendaFromForm,
  agendaFromTemplate,
  allTemplates,
  guessType,
  meetingType,
  templateStats,
} from '../../src/meetings/templates';
import { suggestAgenda } from '../../src/meetings/ai';
import AgendaPreview from './AgendaPreview';
import { Banner, Btn, Choice, Field, Label, Pill, SearchBox, TypeIcon } from './meetingUi';

const STARTS = [
  { id: 'mal', icon: 'albums', title: 'Fra møtemal', text: 'Byggemøte, HMS, styremøte og flere. Eller bedriftens egne maler.', color: '#1099F4' },
  { id: 'skjema', icon: 'clipboard', title: 'Fra skjema', text: 'Bruk et skjema fra Skjemabygger eller KS-biblioteket som dagsorden.', color: '#0f766e' },
  { id: 'ai', icon: 'sparkles', title: 'Lag med AI', text: 'Beskriv møtet, så setter AI opp kapitler, punkter og tid.', color: '#7c3aed' },
  { id: 'blank', icon: 'document-outline', title: 'Blankt møte', text: 'Start med en tom dagsorden og bygg den selv.', color: '#64748b' },
];

const AI_EXAMPLES = [
  'Byggemøte med byggherre og tre underentreprenører. Fokus på fremdrift, HMS og endringsmeldinger.',
  'Kvartalsvis ledermøte: økonomi, ordrereserve, bemanning og to investeringssaker til beslutning.',
  'Oppstartsmøte for nytt skoleprosjekt med prosjekterende og byggherre.',
  'Evaluering etter ferdigstilt prosjekt, med læring til neste anbud.',
];

const LENGTHS = [15, 30, 45, 60, 90, 120].map((m) => ({ id: String(m), label: durationLabel(m) }));

function tomorrow(today) {
  const d = addDays(today, 1);
  const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
  if (wd === 6) return addDays(d, 2);
  if (wd === 0) return addDays(d, 1);
  return d;
}

function StartCard({ item, onPress }) {
  const colors = useColors();
  return (
    <Pressable
      nativeID={`new-start-${item.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      style={({ hovered }) => [styles.start, { borderColor: hovered ? item.color : colors.line, backgroundColor: colors.card }, hovered && styles.lift]}
    >
      <View style={[styles.startIcon, { backgroundColor: `${item.color}18` }]}>
        <Ionicons name={item.icon} size={22} color={item.color} />
      </View>
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{item.title}</Text>
      <Text style={{ fontSize: 12.5, color: colors.muted, lineHeight: 18 }}>{item.text}</Text>
    </Pressable>
  );
}

function TemplateCard({ template, active, onPress }) {
  const colors = useColors();
  const stats = templateStats(template);
  return (
    <Pressable
      nativeID={`template-${template.id}`}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={({ hovered }) => [
        styles.tpl,
        { borderColor: active ? colors.brand : (hovered ? colors.muted : colors.line), backgroundColor: active ? `${colors.brand}0d` : colors.card },
      ]}
    >
      <TypeIcon typeId={template.typeId} size={34} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink, flexShrink: 1 }} numberOfLines={1}>{template.name}</Text>
          {!template.builtin ? <Pill label="Egen" tone="brand" small /> : null}
        </View>
        <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{stats.items} punkter · {durationLabel(template.durationMin || stats.minutes)}{template.recurrence !== 'none' ? ` · ${RECURRENCE.find((r) => r.id === template.recurrence)?.short || ''}` : ''}</Text>
      </View>
      {active ? <Ionicons name="checkmark-circle" size={20} color={colors.brand} /> : null}
    </Pressable>
  );
}

export default function NewMeetingDialog({
  visible, onClose, onCreate, onNext, meetings = [], templates = [], people = [], projects = [], viewer = {},
  today, store, companyId, preset = null, onOpenFormBuilder, width,
}) {
  const colors = useColors();
  const phone = width < 700;
  const [step, setStep] = useState('start');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Kilde
  const [source, setSource] = useState('blank');
  const [templateId, setTemplateId] = useState('');
  const [query, setQuery] = useState('');
  const [forms, setForms] = useState(null);
  const [formId, setFormId] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiLength, setAiLength] = useState('60');
  const [aiType, setAiType] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [chapters, setChapters] = useState([]);
  // Detaljer
  const [title, setTitle] = useState('');
  const [typeId, setTypeId] = useState('annet');
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [location, setLocation] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [freq, setFreq] = useState('none');
  const [visibility, setVisibility] = useState('alle');
  const [purpose, setPurpose] = useState('');
  const [peopleIds, setPeopleIds] = useState([]);
  const [leaderId, setLeaderId] = useState('');
  const [secretaryId, setSecretaryId] = useState('');

  const all = useMemo(() => allTemplates(templates), [templates]);
  const me = useMemo(() => people.find((p) => (viewer.employeeId && p.id === viewer.employeeId) || (viewer.uid && p.uid === viewer.uid)) || null, [people, viewer]);

  useEffect(() => {
    if (!visible) return;
    setStep(preset?.step || 'start');
    setSource(preset?.source || 'blank');
    setTemplateId(preset?.templateId || '');
    setError('');
    setQuery('');
    setAiResult(null);
    setChapters([]);
    setTitle('');
    setTypeId('annet');
    setProjectId(preset?.projectId || '');
    setDate(tomorrow(today));
    setStart('09:00');
    setEnd('10:00');
    setLocation('');
    setVideoUrl('');
    setFreq('none');
    setVisibility('alle');
    setPurpose('');
    setPeopleIds(me ? [me.id] : []);
    setLeaderId(me ? me.id : '');
    setSecretaryId('');
    if (preset?.templateId) {
      const tpl = allTemplates(templates).find((t) => t.id === preset.templateId);
      if (tpl) applyTemplate(tpl);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step !== 'skjema' || forms || !store) return;
    let live = true;
    store.loadForms().then((rows) => { if (live) setForms(rows || []); }).catch(() => { if (live) setForms([]); });
    return () => { live = false; };
  }, [step, forms, store]);

  const series = useMemo(() => seriesOverview(meetings, today).filter((s) => !s.next && s.latest.status !== 'avlyst').slice(0, 3), [meetings, today]);

  function applyDefaults({ name, type, minutes, recurrence, vis, purposeText }) {
    setTitle(name || '');
    setTypeId(type || 'annet');
    const len = Math.max(15, Number(minutes) || 60);
    setEnd(clockFromMinutes((minutesOf(start) ?? 540) + len));
    setFreq(recurrence || 'none');
    setVisibility(vis || 'alle');
    if (purposeText != null) setPurpose(purposeText);
  }

  function applyTemplate(tpl) {
    setSource('mal');
    setTemplateId(tpl.id);
    setChapters(agendaFromTemplate(tpl));
    applyDefaults({ name: tpl.name, type: tpl.typeId, minutes: tpl.durationMin, recurrence: tpl.recurrence, vis: tpl.visibility, purposeText: '' });
  }

  function useTemplate() {
    const tpl = all.find((t) => t.id === templateId);
    if (!tpl) return;
    applyTemplate(tpl);
    setStep('detaljer');
  }

  function useForm() {
    const form = (forms || []).find((f) => f.id === formId);
    if (!form) return;
    const agenda = agendaFromForm(form);
    if (!agenda.length) {
      setError('Skjemaet har ingen felt som kan bli punkter på dagsordenen.');
      return;
    }
    setSource('skjema');
    setChapters(agenda);
    const minutes = agenda.reduce((s, c) => s + c.items.reduce((t, i) => t + i.minutes, 0), 0);
    applyDefaults({ name: form.title, type: guessType(form.title), minutes, recurrence: 'none', vis: 'alle', purposeText: '' });
    setStep('detaljer');
  }

  async function runAi() {
    if (text(aiText).length < 8) {
      setError('Skriv litt mer om møtet, for eksempel hvem som deltar og hva som skal opp.');
      return;
    }
    setBusy(true);
    setError('');
    const project = projects.find((p) => p.id === projectId);
    const result = await suggestAgenda({
      description: aiText,
      typeId: aiType,
      minutes: Number(aiLength),
      companyId,
      projectName: project?.name || '',
    }, { remote: !store?.demo });
    setAiResult(result);
    setChapters(result.chapters);
    setBusy(false);
  }

  function useAi() {
    if (!chapters.length) return;
    setSource('ai');
    applyDefaults({
      name: aiResult?.title || '',
      type: aiResult?.typeId || aiType || guessType(aiText),
      minutes: Number(aiLength),
      recurrence: 'none',
      vis: ['styre', 'ledelse'].includes(aiResult?.typeId) ? 'deltakere' : 'alle',
      purposeText: aiResult?.purpose || aiText,
    });
    setStep('detaljer');
  }

  function blank() {
    setSource('blank');
    setChapters([normalizeChapter({ title: 'Saker', items: [{ title: 'Første sak', minutes: 10 }] })]);
    applyDefaults({ name: '', type: 'annet', minutes: 60, recurrence: 'none', vis: 'alle', purposeText: '' });
    setStep('detaljer');
  }

  function pickStart(id) {
    setError('');
    if (id === 'blank') blank();
    else setStep(id);
  }

  const personOptions = useMemo(() => people.map((p) => ({ id: p.id, label: p.name, hint: [p.title, p.company].filter(Boolean).join(' · ') })), [people]);
  const chosen = personOptions.filter((o) => peopleIds.includes(o.id));
  const projectOptions = projects.map((p) => ({ id: p.id, label: [p.number, p.name].filter(Boolean).join(' '), hint: p.customerName || '' }));

  async function create() {
    if (!text(title)) {
      setError('Gi møtet en tittel.');
      return;
    }
    const project = projects.find((p) => p.id === projectId);
    const participants = peopleIds.map((id) => {
      const p = people.find((row) => row.id === id);
      if (!p) return null;
      return {
        employeeId: p.id,
        uid: p.uid,
        name: p.name,
        company: p.company,
        email: p.email,
        phone: p.phone,
        title: p.title,
        photoUrl: p.photoUrl,
        role: id === leaderId ? 'leder' : (id === secretaryId ? 'referent' : 'deltaker'),
        external: false,
      };
    }).filter(Boolean);
    setBusy(true);
    setError('');
    try {
      await onCreate({
        title: text(title),
        typeId,
        templateId: source === 'mal' ? templateId : '',
        source,
        seriesId: freq !== 'none' ? `serie_${Date.now().toString(36)}` : '',
        number: freq !== 'none' ? 1 : 0,
        projectId: project?.id || '',
        projectName: project?.name || '',
        projectNumber: project?.number || '',
        date,
        start,
        end,
        location: text(location),
        videoUrl: text(videoUrl),
        purpose: text(purpose),
        visibility,
        recurrence: { freq },
        nextDate: freq !== 'none' && date ? nextRecurrenceDate({ freq }, date) : '',
        nextStart: freq !== 'none' ? start : '',
        nextLocation: freq !== 'none' ? text(location) : '',
        chapters,
        participants,
      });
    } catch (cause) {
      setError(String(cause?.message || 'Møtet ble ikke opprettet.'));
    } finally {
      setBusy(false);
    }
  }

  const visibleTemplates = all.filter((t) => !query || `${t.name} ${t.summary} ${meetingType(t.typeId).label}`.toLowerCase().includes(query.toLowerCase()));
  const selectedTemplate = all.find((t) => t.id === templateId) || null;
  const visibleForms = (forms || []).filter((f) => !query || `${f.title} ${f.summary || ''} ${f.ref || ''}`.toLowerCase().includes(query.toLowerCase()));
  const selectedForm = (forms || []).find((f) => f.id === formId) || null;
  const formAgenda = useMemo(() => (selectedForm ? agendaFromForm(selectedForm) : []), [selectedForm]);

  const titles = {
    start: 'Nytt møte',
    mal: 'Velg møtemal',
    skjema: 'Velg skjema',
    ai: 'Lag dagsorden med AI',
    detaljer: 'Detaljer for møtet',
  };

  const back = step !== 'start' ? (
    <Btn key="back" label="Tilbake" icon="arrow-back" tone="plain" onPress={() => { setError(''); setStep(step === 'detaljer' && source !== 'blank' ? source : 'start'); }} />
  ) : null;

  let footer = null;
  if (step === 'mal') footer = [back, <View key="sp" style={{ flex: 1 }} />, <Btn key="go" label="Bruk malen" icon="arrow-forward" iconRight tone="primary" disabled={!selectedTemplate} onPress={useTemplate} nativeID="new-use-template" />];
  if (step === 'skjema') footer = [back, <View key="sp" style={{ flex: 1 }} />, <Btn key="go" label="Bruk skjemaet" icon="arrow-forward" iconRight tone="primary" disabled={!selectedForm} onPress={useForm} nativeID="new-use-form" />];
  if (step === 'ai') {
    footer = [
      back,
      <View key="sp" style={{ flex: 1 }} />,
      aiResult ? <Btn key="again" label="Lag nytt forslag" icon="refresh" tone="ghost" onPress={runAi} disabled={busy} /> : null,
      aiResult
        ? <Btn key="go" label="Bruk dagsordenen" icon="arrow-forward" iconRight tone="primary" disabled={!chapters.length || busy} onPress={useAi} nativeID="new-use-ai" />
        : <Btn key="run" label="Lag dagsorden" icon="sparkles" tone="primary" busy={busy} onPress={runAi} nativeID="new-run-ai" />,
    ];
  }
  if (step === 'detaljer') footer = [back, <View key="sp" style={{ flex: 1 }} />, <Btn key="go" label="Opprett møte" icon="checkmark" tone="primary" busy={busy} onPress={create} nativeID="new-create" />];

  return (
    <DialogShell visible={visible} title={titles[step]} onClose={onClose} colors={colors} width={step === 'start' ? 760 : 980} footer={footer ? <View style={styles.footer}>{footer}</View> : null} nativeID="new-meeting-dialog">
      {error ? <Banner tone="danger" icon="alert-circle">{error}</Banner> : null}

      {step === 'start' ? (
        <View style={{ gap: 18 }}>
          <View style={[styles.startGrid, phone && { flexDirection: 'column' }]}>
            {STARTS.map((item) => <StartCard key={item.id} item={item} onPress={() => pickStart(item.id)} />)}
          </View>
          {series.length && onNext ? (
            <View style={{ gap: 8 }}>
              <Label>FORTSETT EN MØTESERIE</Label>
              {series.map((s) => (
                <Pressable
                  key={s.id}
                  nativeID={`new-series-${s.id}`}
                  onPress={() => onNext(s.latest)}
                  accessibilityRole="button"
                  style={({ hovered }) => [styles.seriesRow, { borderColor: hovered ? colors.brand : colors.line, backgroundColor: colors.card }]}
                >
                  <TypeIcon typeId={s.typeId} size={32} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{s.title} · møte {(s.latest.number || 0) + 1}</Text>
                    <Text style={{ fontSize: 12.5, color: colors.muted }} numberOfLines={1}>
                      {recurrenceLabel(s.recurrence, s.latest.date)} · forrige {s.latest.date ? shortDate(s.latest.date) : 'uten dato'} · dagsorden og åpne punkter tas med
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={18} color={colors.brand} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {step === 'mal' ? (
        <View style={[styles.split, phone && { flexDirection: 'column' }]}>
          <View style={{ flex: 1.1, gap: 10, minWidth: 0 }}>
            <SearchBox value={query} onChange={setQuery} placeholder="Søk i maler" />
            <View style={{ gap: 8 }}>
              {visibleTemplates.map((t) => <TemplateCard key={t.id} template={t} active={t.id === templateId} onPress={() => setTemplateId(t.id)} />)}
            </View>
          </View>
          <View style={[styles.previewPane, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
            {selectedTemplate ? (
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{selectedTemplate.name}</Text>
                {selectedTemplate.summary ? <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>{selectedTemplate.summary}</Text> : null}
                <AgendaPreview chapters={selectedTemplate.chapters} />
              </View>
            ) : (
              <Text style={{ color: colors.muted, fontSize: 13 }}>Velg en mal for å se dagsordenen.</Text>
            )}
          </View>
        </View>
      ) : null}

      {step === 'skjema' ? (
        <View style={[styles.split, phone && { flexDirection: 'column' }]}>
          <View style={{ flex: 1.1, gap: 10, minWidth: 0 }}>
            <SearchBox value={query} onChange={setQuery} placeholder="Søk i skjemaer" />
            {forms == null ? <ActivityIndicator color={colors.brand} style={{ padding: 20 }} /> : null}
            {(forms || []).length ? (
              <View style={{ gap: 8 }}>
                {visibleForms.map((f) => (
                  <Pressable
                    key={f.id}
                    nativeID={`form-${f.id}`}
                    onPress={() => setFormId(f.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: f.id === formId }}
                    style={({ hovered }) => [styles.tpl, { borderColor: f.id === formId ? colors.brand : (hovered ? colors.muted : colors.line), backgroundColor: f.id === formId ? `${colors.brand}0d` : colors.card }]}
                  >
                    <View style={[styles.formIcon, { backgroundColor: f.source === 'egen' ? '#0f766e18' : `${colors.brand}14` }]}>
                      <Ionicons name="clipboard-outline" size={17} color={f.source === 'egen' ? '#0f766e' : colors.brand} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink, flexShrink: 1 }} numberOfLines={1}>{f.title}</Text>
                        <Pill label={f.source === 'egen' ? 'Bedriftens' : (f.ref || 'KS')} tone={f.source === 'egen' ? 'success' : 'muted'} small />
                      </View>
                      {f.summary ? <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{f.summary}</Text> : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {onOpenFormBuilder ? (
              <Btn small label="Lag et nytt skjema i Skjemabygger" icon="open-outline" tone="plain" onPress={onOpenFormBuilder} />
            ) : null}
          </View>
          <View style={[styles.previewPane, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
            {selectedForm ? (
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{selectedForm.title}</Text>
                <Text style={{ fontSize: 12.5, color: colors.muted, lineHeight: 18 }}>
                  Overskrifter blir kapitler, spørsmål og felt blir punkter. Felt som prosjekt, møtested og deltakerliste har egne plasser i møtet og tas ikke med.
                </Text>
                {formAgenda.length ? <AgendaPreview chapters={formAgenda} /> : <Text style={{ color: colors.muted }}>Skjemaet har ingen felt som kan bli punkter.</Text>}
              </View>
            ) : (
              <Text style={{ color: colors.muted, fontSize: 13 }}>Velg et skjema for å se hvordan det blir som dagsorden.</Text>
            )}
          </View>
        </View>
      ) : null}

      {step === 'ai' ? (
        <View style={[styles.split, phone && { flexDirection: 'column' }]}>
          <View style={{ flex: 1, gap: 12, minWidth: 0 }}>
            <Field
              label="Beskriv møtet"
              value={aiText}
              onChange={setAiText}
              multiline
              minHeight={120}
              placeholder="Hva skal møtet handle om, hvem deltar og hva skal besluttes?"
              nativeID="new-ai-text"
            />
            <View style={{ gap: 6 }}>
              <Label>Eksempler</Label>
              <View style={{ gap: 6 }}>
                {AI_EXAMPLES.map((ex) => (
                  <Pressable key={ex} onPress={() => setAiText(ex)} style={({ hovered }) => [styles.example, { borderColor: colors.line, backgroundColor: hovered ? colors.sunken : colors.card }]}>
                    <Ionicons name="bulb-outline" size={14} color="#7c3aed" />
                    <Text style={{ fontSize: 12.5, color: colors.ink, flex: 1 }}>{ex}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Label>Lengde</Label>
              <Choice small options={LENGTHS} value={aiLength} onChange={setAiLength} nativeIDPrefix="new-ai-length" />
            </View>
            <View style={{ gap: 6 }}>
              <Label>Type (valgfritt)</Label>
              <OptionPicker
                options={MEETING_TYPES.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))}
                value={aiType}
                onChange={setAiType}
                placeholder="AI velger selv"
                clearLabel="AI velger selv"
                chipLimit={0}
                title="Møtetype"
              />
            </View>
          </View>
          <View style={[styles.previewPane, { borderColor: aiResult ? '#ddd6fe' : colors.line, backgroundColor: aiResult ? '#faf8ff' : colors.sunken }]}>
            {busy ? (
              <View style={{ alignItems: 'center', gap: 12, paddingVertical: 40 }}>
                <ActivityIndicator color="#7c3aed" />
                <Text style={{ color: '#6d28d9', fontWeight: '600' }}>AI setter opp dagsordenen …</Text>
                <Text style={{ color: colors.muted, fontSize: 12.5, textAlign: 'center' }}>Kapitler, punkter, veiledning og tid per punkt.</Text>
              </View>
            ) : aiResult ? (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, flexShrink: 1 }}>{aiResult.title || 'Forslag til dagsorden'}</Text>
                  <Pill label={aiResult.engine === 'lokal' ? 'Fra nærmeste mal' : 'Laget med AI'} icon="sparkles" tone={aiResult.engine === 'lokal' ? 'muted' : 'violet'} small />
                </View>
                {aiResult.note ? <Text style={{ fontSize: 12.5, color: colors.muted }}>{aiResult.note}</Text> : null}
                <Text style={{ fontSize: 12.5, color: colors.muted }}>Fjern det du ikke trenger. Resten kan du endre i møtet.</Text>
                <AgendaPreview chapters={chapters} onChange={setChapters} />
              </View>
            ) : (
              <View style={{ alignItems: 'center', gap: 10, paddingVertical: 36 }}>
                <View style={[styles.startIcon, { backgroundColor: '#7c3aed18', width: 54, height: 54 }]}>
                  <Ionicons name="sparkles" size={26} color="#7c3aed" />
                </View>
                <Text style={{ color: colors.ink, fontWeight: '700' }}>Forslaget vises her</Text>
                <Text style={{ color: colors.muted, fontSize: 12.5, textAlign: 'center', maxWidth: 280 }}>Du ser over og fjerner punkter før dagsordenen tas i bruk. Ingenting lagres før du oppretter møtet.</Text>
              </View>
            )}
          </View>
        </View>
      ) : null}

      {step === 'detaljer' ? (
        <View style={[styles.split, phone && { flexDirection: 'column' }]}>
          <View style={{ flex: 1.25, gap: 14, minWidth: 0 }}>
            <Field label="Tittel" value={title} onChange={setTitle} placeholder="For eksempel Byggemøte Kino Kino" nativeID="new-title" autoFocus />
            <View style={styles.pair}>
              <View style={{ flex: 1, gap: 6, minWidth: 180 }}>
                <Label>Type</Label>
                <OptionPicker options={MEETING_TYPES.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))} value={typeId} onChange={(id) => setTypeId(id || 'annet')} clearable={false} chipLimit={0} title="Møtetype" />
              </View>
              <View style={{ flex: 1, gap: 6, minWidth: 180 }}>
                <Label>Prosjekt (valgfritt)</Label>
                <OptionPicker options={projectOptions} value={projectId} onChange={setProjectId} placeholder="Ikke knyttet til prosjekt" clearLabel="Ikke knyttet til prosjekt" chipLimit={0} searchable title="Prosjekt" />
              </View>
            </View>
            <View style={styles.pair}>
              <View style={{ flex: 1.3, gap: 6, minWidth: 180 }}>
                <Label>Dato</Label>
                <DateField value={date} onChange={(d) => setDate(d ? dateKey(d) : '')} placeholder="Velg dato" style={[styles.box, { borderColor: colors.line, backgroundColor: colors.card }]} />
              </View>
              <View style={{ flex: 1, gap: 6, minWidth: 110 }}>
                <Label>Fra</Label>
                <TimeField
                  value={start}
                  onChange={(v) => {
                    const len = (minutesOf(end) ?? 600) - (minutesOf(start) ?? 540);
                    setStart(v);
                    if (len > 0) setEnd(clockFromMinutes((minutesOf(v) ?? 540) + len));
                  }}
                  style={[styles.box, { borderColor: colors.line, backgroundColor: colors.card }]}
                />
              </View>
              <View style={{ flex: 1, gap: 6, minWidth: 110 }}>
                <Label>Til</Label>
                <TimeField value={end} onChange={setEnd} style={[styles.box, { borderColor: colors.line, backgroundColor: colors.card }]} />
              </View>
            </View>
            <View style={styles.pair}>
              <Field label="Sted" value={location} onChange={setLocation} placeholder="Adresse eller møterom" style={{ flex: 1, minWidth: 200 }} />
              <Field label="Videolenke (valgfritt)" value={videoUrl} onChange={setVideoUrl} placeholder="Teams, Meet eller Zoom" style={{ flex: 1, minWidth: 200 }} />
            </View>
            <View style={{ gap: 6 }}>
              <Label>Gjentakelse</Label>
              <Choice options={RECURRENCE.map((r) => ({ id: r.id, label: r.label }))} value={freq} onChange={setFreq} nativeIDPrefix="new-freq" />
              {freq !== 'none' ? (
                <Text style={{ fontSize: 12.5, color: colors.muted }}>
                  Fast møte: dette blir møte 1 i serien. Neste møte lages med ett trykk fra dette, med samme dagsorden og åpne oppfølgingspunkter.
                </Text>
              ) : null}
            </View>
            <Field label="Formål (valgfritt)" value={purpose} onChange={setPurpose} multiline minHeight={64} placeholder="Hva skal møtet oppnå?" />
          </View>
          <View style={{ flex: 1, gap: 14, minWidth: 0 }}>
            <View style={{ gap: 6 }}>
              <Label>Deltakere fra bedriften</Label>
              <OptionPicker options={personOptions} value={peopleIds} onChange={setPeopleIds} multiple searchable placeholder="Velg ansatte" title="Deltakere" />
              <Text style={{ fontSize: 12, color: colors.muted }}>Eksterne deltakere legger du til inne i møtet.</Text>
            </View>
            {chosen.length ? (
              <View style={styles.pair}>
                <View style={{ flex: 1, gap: 6, minWidth: 160 }}>
                  <Label>Møteleder</Label>
                  <OptionPicker options={chosen} value={leaderId} onChange={setLeaderId} placeholder="Velg" chipLimit={0} title="Møteleder" />
                </View>
                <View style={{ flex: 1, gap: 6, minWidth: 160 }}>
                  <Label>Referent</Label>
                  <OptionPicker options={chosen.filter((o) => o.id !== leaderId)} value={secretaryId} onChange={setSecretaryId} placeholder="Velg" chipLimit={0} title="Referent" />
                </View>
              </View>
            ) : null}
            <View style={{ gap: 6 }}>
              <Label>Hvem ser møtet</Label>
              <Choice options={VISIBILITY.map((v) => ({ id: v.id, label: v.label, icon: v.id === 'deltakere' ? 'lock-closed-outline' : 'people-outline' }))} value={visibility} onChange={setVisibility} nativeIDPrefix="new-vis" />
              <Text style={{ fontSize: 12, color: colors.muted }}>{VISIBILITY.find((v) => v.id === visibility)?.hint}</Text>
            </View>
            <View style={[styles.previewPane, { borderColor: colors.line, backgroundColor: colors.sunken, flex: 0 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink, flex: 1 }}>Dagsorden</Text>
                <Pill
                  small
                  tone={{ mal: 'brand', skjema: 'success', ai: 'violet' }[source] || 'muted'}
                  icon={{ mal: 'albums', skjema: 'clipboard', ai: 'sparkles' }[source] || 'document-outline'}
                  label={{ mal: 'Fra mal', skjema: 'Fra skjema', ai: 'Fra AI' }[source] || 'Blank'}
                />
              </View>
              <AgendaPreview chapters={chapters} maxItems={12} />
            </View>
          </View>
        </View>
      ) : null}
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' },
  startGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  start: { flexGrow: 1, flexBasis: 160, borderWidth: 1.5, borderRadius: 16, padding: 16, gap: 8, minHeight: 168 },
  lift: { shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  startIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  seriesRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  split: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  previewPane: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 14, padding: 14, alignSelf: 'stretch' },
  tpl: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 12, padding: 10 },
  formIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  example: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  pair: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  box: { borderWidth: 1, borderRadius: 10, minHeight: 42, paddingHorizontal: 10 },
});
