import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  FIELD_GROUPS,
  duplicateField,
  fieldType,
  formAttention,
  insertField,
  isAnswerField,
  moveField,
  responsesToCsv,
  summarizeQuestion,
} from '../../src/anbud/formBuilder';
import { fileToDataUrl } from '../../src/anbud/intakeClient';
import { pickImage } from '../../src/utils/media';
import FormEditor from './FormEditor';
import { formPrintHtml, printForm } from './formPrint';

const PIE = ['#4285F4', '#EA4335', '#FBBC04', '#34A853', '#AB47BC', '#00ACC1', '#FF7043', '#8D6E63'];
const ICONS = {
  title: 'reader-outline',
  note: 'document-outline',
  long: 'document-text-outline',
  text: 'create-outline',
  choice: 'radio-button-on-outline',
  checks: 'checkbox-outline',
  dropdown: 'chevron-down-circle-outline',
  scale: 'options-outline',
  date: 'calendar-outline',
  time: 'time-outline',
  number: 'calculator-outline',
  check: 'checkmark-circle-outline',
  image: 'image-outline',
  file: 'document-attach-outline',
  table: 'grid-outline',
  sign: 'pencil-outline',
};

const SETTINGS = [
  ['Generelt', [
    ['collectEmail', 'Samle e-postadresser', 'Be om e-post før svaret sendes.'],
    ['requireLogin', 'Krever innlogging', 'Respondenten må være logget inn.'],
    ['allowEdit', 'Svar kan endres', 'Svaret kan endres etter at det er sendt.'],
    ['showSummary', 'Se resultatsammendrag', 'Den som svarer kan se sammendraget.'],
  ]],
  ['Varsler', [
    ['pushAlerts', 'Push-varsler', 'Varsle når et nytt svar kommer inn.'],
    ['emailAlerts', 'E-postvarsler', 'Send e-post når et nytt svar kommer inn.'],
  ]],
  ['Presentasjon', [
    ['progress', 'Vis fremdriftslinje', 'Vis hvor langt respondenten er kommet.'],
    ['shuffleQuestions', 'Bland spørsmålsrekkefølgen', 'Spørsmålene bytter plass for hvert svar.'],
    ['anotherResponse', 'Send inn et annet svar', 'Vis en lenke for å svare en gang til.'],
  ]],
];

function arcPath(cx, cy, r, start, end) {
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

function PieChart({ counts, colors }) {
  const total = counts.reduce((sum, row) => sum + row.count, 0);
  if (!total) return null;
  let angle = -Math.PI / 2;
  const decorated = counts.map((part, index) => {
    const sweep = (part.count / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    return { ...part, start, end: angle, color: PIE[index % PIE.length] };
  });
  const slices = decorated.filter((part) => part.count > 0);
  return (
    <View style={styles.pieRow}>
      <Svg width={148} height={148}>
        {slices.length === 1 ? <Circle cx={74} cy={74} r={64} fill={slices[0].color} /> : slices.map((slice) => (
          <Path key={slice.id} d={arcPath(74, 74, 64, slice.start, slice.end)} fill={slice.color} />
        ))}
      </Svg>
      <View style={{ gap: 6, flex: 1 }}>
        {decorated.map((slice) => (
          <Text key={slice.id} style={{ color: colors.ink }}>
            {slice.label} · {Math.round((slice.count / total) * 1000) / 10}%
          </Text>
        ))}
      </View>
    </View>
  );
}

function PdfPreview({ draft, logo, colors, wide, company }) {
  return (
    <View style={[styles.pdfPane, { backgroundColor: colors.sunken, borderColor: colors.line }, wide ? styles.pdfPaneSide : styles.pdfPaneStack]}>
      <Text style={[styles.kicker, { color: colors.muted }]}>PDF</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>Slik blir dokumentet når det eksporteres. Dette er ikke utfyllingen.</Text>
      <View style={wide ? styles.pdfFrame : styles.pdfFrameStack}>
        {Platform.OS === 'web' ? React.createElement('iframe', {
          title: 'PDF-forhåndsvisning',
          srcDoc: formPrintHtml(draft, logo, { preview: true, company }),
          style: {
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 0,
            backgroundColor: '#e6ebf1',
            borderRadius: 8,
          },
        }) : (
          <Text style={{ color: colors.muted }}>PDF-visningen er tilgjengelig på nett.</Text>
        )}
      </View>
    </View>
  );
}

function BuilderWork({ wide, colors, draft, logo, company, layout, onLayout, onCategory, onCover, onAddField, onFill, editor, docPanel, shown }) {
  const category = draft.category === 'avtale' ? 'avtale' : 'skjema';
  const tools = (
    <View style={styles.row}>
      {[['skjema', 'Utfylling'], ['avtale', 'Avtalemal']].map(([id, label]) => (
        <TouchableOpacity key={`cat-${id}`} onPress={() => onCategory?.(id)} accessibilityRole="button" accessibilityLabel={`Kategori ${label}`} style={[styles.typeChip, { backgroundColor: category === id ? colors.brand : colors.sunken }]}>
          <Text style={{ color: category === id ? '#fff' : colors.ink }}>{label}</Text>
        </TouchableOpacity>
      ))}
      {[['brev', 'Brev'], ['skjema', 'Skjema']].map(([id, label]) => (
        <TouchableOpacity key={`layout-${id}`} onPress={() => onLayout(id)} accessibilityRole="button" accessibilityLabel={`Utseende ${label}`} style={[styles.typeChip, { backgroundColor: layout === id ? colors.brand : colors.sunken }]}>
          <Text style={{ color: layout === id ? '#fff' : colors.ink }}>{label}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={onCover} accessibilityRole="button">
        <Text style={{ color: colors.brand }}>{draft.cover ? 'Bytt forside' : 'Forsidebilde'}</Text>
      </TouchableOpacity>
      {!logo ? <Text style={{ color: colors.muted, fontSize: 12 }}>Ingen bedriftslogo ennå. Legg den inn under Bedriftsinnstillinger › Bedriftsprofil.</Text> : null}
      <TouchableOpacity onPress={onAddField} accessibilityRole="button" accessibilityLabel="Legg til felt">
        <Text style={{ color: colors.brand }}>Legg til felt</Text>
      </TouchableOpacity>
      {onFill ? (
        <TouchableOpacity onPress={onFill} accessibilityRole="button" accessibilityLabel="Fyll ut dokumentet" style={[styles.typeChip, { backgroundColor: colors.brand }]}>
          <Ionicons name="create-outline" size={14} color="#fff" />
          <Text style={{ color: '#fff' }}>Fyll ut</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
  if (wide) {
    return (
      <View style={styles.work}>
        <ScrollView style={styles.editorScroll} contentContainerStyle={styles.column} keyboardShouldPersistTaps="handled">
          {tools}
          {editor}
          {docPanel}
        </ScrollView>
        <PdfPreview draft={shown} logo={logo} colors={colors} wide company={company} />
      </View>
    );
  }
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.column} keyboardShouldPersistTaps="handled">
      {tools}
      {editor}
      <PdfPreview draft={shown} logo={logo} colors={colors} wide={false} company={company} />
      {docPanel}
    </ScrollView>
  );
}

export default function FormStudio({
  draft,
  colors,
  busy,
  note,
  noteBad,
  fill,
  onDraft,
  onBack,
  onSave,
  onScan,
  onImport,
  companyLogo = null,
  company = null,
  onFill = null,
  backLabel = 'Alle skjema',
  docHead = null,
  docStatus = null,
  docPanel = null,
}) {
  const [tab, setTab] = useState('questions');
  const [selected, setSelected] = useState(-1);
  const [typeOpen, setTypeOpen] = useState(false);
  const [typeFor, setTypeFor] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [responseTab, setResponseTab] = useState('summary');
  const [person, setPerson] = useState(0);
  const [imageNote, setImageNote] = useState('');
  const [readOpen, setReadOpen] = useState(false);
  const [insertAt, setInsertAt] = useState(null);
  const [rootNode, setRootNode] = useState(null);
  const [paneWidth, setPaneWidth] = useState(() => (
    Platform.OS === 'web' && typeof window !== 'undefined' ? window.innerWidth : 1200
  ));
  const settings = draft.settings || {};
  const responses = draft.responses || [];
  // Bedriftens logo brukes alltid. Dokumenthodet kommer fra dokumentstyringen.
  const logo = companyLogo?.dataUrl || '';
  const shown = docHead ? { ...draft, doc: docHead } : draft;

  useEffect(() => {
    const el = rootNode && typeof rootNode.addEventListener === 'function' ? rootNode : null;
    if (!el) return undefined;
    const block = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    el.addEventListener('dragover', block, true);
    el.addEventListener('drop', block, true);
    return () => {
      el.removeEventListener('dragover', block, true);
      el.removeEventListener('drop', block, true);
    };
  }, [rootNode]);

  function patch(index, part) {
    onDraft({
      ...draft,
      fields: draft.fields.map((field, i) => (i === index ? { ...field, ...part } : field)),
    });
  }

  function addKind(kind, at) {
    const index = at == null ? draft.fields.length : at;
    onDraft({ ...draft, fields: insertField(draft.fields, index, kind) });
    setSelected(index);
    setTypeOpen(false);
    setTab('questions');
  }

  function chooseType(kind) {
    if (typeFor == null) {
      const at = insertAt == null ? Math.min(Math.max(selected, -1) + 1, draft.fields.length) : insertAt;
      setInsertAt(null);
      addKind(kind, at);
      return;
    }
    const current = draft.fields[typeFor];
    if (!current) {
      setTypeOpen(false);
      return;
    }
    const optionKind = ['choice', 'checks', 'dropdown'].includes(kind);
    const options = optionKind
      ? ((current.options || []).length
        ? current.options
        : [{ id: `${current.id}_a`, label: 'Alternativ 1' }, { id: `${current.id}_b`, label: 'Alternativ 2' }])
      : [];
    patch(typeFor, {
      kind,
      options,
      review: '',
      other: optionKind && kind !== 'dropdown' ? !!current.other : false,
      shuffle: optionKind ? !!current.shuffle : false,
    });
    setTypeOpen(false);
  }

  function openTab(id) {
    if (id === 'preview') {
      setTab('questions');
      return;
    }
    setTab(id);
  }

  function changeDocument(index, part) {
    if (index < 0) {
      onDraft({ ...draft, ...part });
      return;
    }
    patch(index, part);
  }

  async function setCover() {
    const picked = await pickImage({ edit: false });
    if (!picked) return;
    const dataUrl = await fileToDataUrl(picked);
    if (!dataUrl || !dataUrl.startsWith('data:image/') || dataUrl.length > 500000) {
      setImageNote(dataUrl ? 'Forsidebildet er for stort.' : 'Kunne ikke lese bildet.');
      return;
    }
    setImageNote('');
    onDraft({ ...draft, cover: dataUrl });
  }

  async function setOptionImage(index, optionIndex) {
    const picked = await pickImage({ edit: false });
    if (!picked) return;
    const dataUrl = await fileToDataUrl(picked);
    if (!dataUrl || !dataUrl.startsWith('data:image/') || dataUrl.length > 180000) {
      setImageNote(dataUrl ? 'Alternativbildet er for stort.' : 'Kunne ikke lese bildet.');
      return;
    }
    setImageNote('');
    const field = draft.fields[index];
    patch(index, {
      options: field.options.map((row, i) => (i === optionIndex ? { ...row, image: dataUrl } : row)),
    });
  }

  function exportCsv() {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const csv = `\uFEFF${responsesToCsv(draft)}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${draft.title || 'skjema'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const attention = formAttention(draft);
  const activePerson = responses[person] || null;

  return (
    <View
      ref={setRootNode}
      style={[styles.fill, fill && { flex: 1, minHeight: 0 }]}
    >
      <View style={{ flex: 1, minHeight: 0 }} onLayout={(event) => setPaneWidth(event.nativeEvent.layout.width)}>
        <View style={[styles.toolbar, { borderBottomColor: colors.line, backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={onBack} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>{backLabel}</Text>
          </TouchableOpacity>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => setReadOpen((open) => !open)} disabled={busy} accessibilityRole="button" accessibilityLabel="Les inn dokument">
              <Text style={{ color: colors.brand }}>{busy ? 'Leser …' : 'Les inn'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => printForm(shown, logo, { company })} accessibilityRole="button" accessibilityLabel="Skriv ut eller lagre PDF">
              <Text style={{ color: colors.brand }}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openTab(tab === 'responses' ? 'questions' : 'responses')} accessibilityRole="button" accessibilityLabel={tab === 'responses' ? 'Vis malen' : 'Vis svar'}>
              <Text style={{ color: colors.brand }}>{tab === 'responses' ? 'Malen' : `Svar${responses.length ? ` (${responses.length})` : ''}`}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSettingsOpen(true)} accessibilityRole="button" accessibilityLabel="Innstillinger">
              <Ionicons name="settings-outline" size={20} color={colors.ink} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onSave} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff' }}>Lagre</Text>
            </TouchableOpacity>
          </View>
        </View>
        {readOpen ? (
          <View style={[styles.readPanel, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>Les inn dokument</Text>
            <Text style={{ color: colors.muted, lineHeight: 20 }}>Begge valgene leser malen med AI og lager et dokument du kan rette. Forskjellen er bare hvor filen kommer fra.</Text>
            <TouchableOpacity onPress={() => { setReadOpen(false); onScan(); }} disabled={busy} accessibilityRole="button" accessibilityLabel="Ta bilde av papir" style={[styles.readChoice, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>Ta bilde av papir</Text>
              <Text style={{ color: colors.muted }}>Åpner kameraet. Brukes når malen ligger foran deg.</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setReadOpen(false); onImport(); }} disabled={busy} accessibilityRole="button" accessibilityLabel="Last opp fil" style={[styles.readChoice, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>Last opp fil</Text>
              <Text style={{ color: colors.muted }}>PDF, Word, bilde eller tekst fra maskinen. Samme lesing, uten kamera.</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setReadOpen(false)} accessibilityRole="button">
              <Text style={{ color: colors.muted }}>Lukk</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {tab === 'questions' && attention.issues.length ? (
          <TouchableOpacity
            onPress={() => {
              const issue = attention.issues.find((row) => row.fieldId);
              const index = draft.fields.findIndex((field) => field.id === issue?.fieldId);
              if (index >= 0) setSelected(index);
            }}
            accessibilityRole="button"
            style={[styles.attention, { borderColor: '#9a6700', backgroundColor: colors.card, marginHorizontal: 16, marginTop: 8 }]}
          >
            <Text style={{ color: '#9a6700', fontWeight: '600' }}>{attention.issues.length} felt bør ses over. Trykk for å gå til det første.</Text>
          </TouchableOpacity>
        ) : null}
        {!!imageNote && <Text style={{ color: colors.danger, marginHorizontal: 16, marginTop: 8 }}>{imageNote}</Text>}
        {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand, marginHorizontal: 16, marginTop: 8 }}>{note}</Text>}
        {tab === 'responses' ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.column} keyboardShouldPersistTaps="handled">
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <TouchableOpacity onPress={exportCsv} accessibilityRole="button" style={styles.menuRow}>
                <Ionicons name="download-outline" size={18} color={colors.ink} />
                <Text style={{ color: colors.ink }}>Eksporter til CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { if (typeof window !== 'undefined') window.print(); }} accessibilityRole="button" style={styles.menuRow}>
                <Ionicons name="print-outline" size={18} color={colors.ink} />
                <Text style={{ color: colors.ink }}>Skriv ut</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDraft({ ...draft, responses: [] })} accessibilityRole="button" style={styles.menuRow}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                <Text style={{ color: colors.danger }}>Slette alle</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.row}>
              {[['summary', 'Sammendrag'], ['question', 'Spørsmål'], ['person', 'Individuell']].map(([id, label]) => (
                <TouchableOpacity key={id} onPress={() => setResponseTab(id)} accessibilityRole="button" style={[styles.typeChip, { backgroundColor: responseTab === id ? colors.brand : colors.sunken }]}>
                  <Text style={{ color: responseTab === id ? '#fff' : colors.ink }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ color: colors.muted }}>{responses.length} svar</Text>
            {responseTab === 'person' && !responses.length ? <Text style={{ color: colors.muted }}>Ingen svar ennå.</Text> : null}
            {responseTab === 'person' && activePerson ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line, gap: 8 }]}>
                <View style={styles.row}>
                  <TouchableOpacity onPress={() => setPerson(Math.max(0, person - 1))} accessibilityRole="button"><Text style={{ color: colors.brand }}>Forrige</Text></TouchableOpacity>
                  <Text style={{ color: colors.muted }}>{person + 1} / {responses.length}</Text>
                  <TouchableOpacity onPress={() => setPerson(Math.min(responses.length - 1, person + 1))} accessibilityRole="button"><Text style={{ color: colors.brand }}>Neste</Text></TouchableOpacity>
                </View>
                {activePerson.email ? <Text style={{ color: colors.ink }}>{activePerson.email}</Text> : null}
                {draft.fields.filter((field) => isAnswerField(field)).map((field) => (
                  <View key={field.id}>
                    <Text style={{ color: colors.muted }}>{field.label}</Text>
                    <Text style={{ color: colors.ink }}>{displayAnswer(field, activePerson.answers?.[field.id]) || '—'}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {responseTab !== 'person' ? draft.fields.filter((field) => isAnswerField(field)).map((field) => {
              const summary = summarizeQuestion(field, responses);
              return (
                <View key={field.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line, gap: 8 }]}>
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>{field.label}</Text>
                  <Text style={{ color: colors.muted }}>{summary.answered} svar</Text>
                  {summary.counts && summary.answered ? <PieChart counts={summary.counts} colors={colors} /> : null}
                  {field.kind === 'scale' && summary.answered ? <Text style={{ color: colors.ink }}>Snitt {summary.average}</Text> : null}
                  {(summary.texts || []).map((line) => <Text key={line} style={{ color: colors.ink }}>{line}</Text>)}
                  {!summary.answered ? <Text style={{ color: colors.muted }}>Ingen svar ennå på dette spørsmålet.</Text> : null}
                </View>
              );
            }) : null}
          </ScrollView>
        ) : (
          <BuilderWork
            wide={paneWidth >= 980}
            colors={colors}
            draft={draft}
            logo={logo}
            company={company}
            onFill={onFill}
            shown={shown}
            docPanel={docPanel}
            layout={settings.layout === 'skjema' ? 'skjema' : 'brev'}
            onLayout={(layout) => onDraft({ ...draft, settings: { ...settings, layout } })}
            onCategory={(category) => onDraft({ ...draft, category: category === 'avtale' ? 'avtale' : 'skjema' })}
            onCover={setCover}
            onAddField={() => { setTypeFor(null); setInsertAt(draft.fields.length); setTypeOpen(true); }}
            editor={(
              <FormEditor
                draft={draft}
                colors={colors}
                selected={selected}
                onSelect={setSelected}
                onPatch={changeDocument}
                onType={(index) => { setTypeFor(index); setTypeOpen(true); setSelected(index); }}
                onDuplicate={(index) => { onDraft({ ...draft, fields: duplicateField(draft.fields, index) }); setSelected(index + 1); }}
                onMove={(index, delta) => {
                  onDraft({ ...draft, fields: moveField(draft.fields, index, index + delta) });
                  setSelected(Math.max(0, Math.min(draft.fields.length - 1, index + delta)));
                }}
                onDelete={(index) => {
                  const fields = draft.fields.filter((_, i) => i !== index);
                  onDraft({ ...draft, fields });
                  setSelected(Math.max(0, index - 1));
                }}
                onDeleteIds={(indexes) => {
                  const drop = new Set(indexes);
                  onDraft({ ...draft, fields: draft.fields.filter((_, index) => !drop.has(index)) });
                  setSelected(-1);
                }}
                onAdd={(index) => { setTypeFor(null); setInsertAt(index); setTypeOpen(true); }}
                onOptionImage={setOptionImage}
                docHead={docHead}
                docStatus={docStatus}
              />
            )}
          />
        )}
      </View>
      {typeOpen ? (
        <View style={styles.sheetWrap}>
          <TouchableOpacity style={styles.scrim} onPress={() => setTypeOpen(false)} accessibilityRole="button" accessibilityLabel="Lukk" />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Velg felttype</Text>
            <ScrollView>
              {FIELD_GROUPS.map((group) => (
                <View key={group.id} style={{ gap: 4, marginBottom: 12 }}>
                  <Text style={[styles.kicker, { color: colors.muted }]}>{group.label}</Text>
                  {group.types.map((id) => {
                    const meta = fieldType(id);
                    return (
                      <TouchableOpacity key={id} onPress={() => chooseType(id)} accessibilityRole="button" style={styles.menuRow}>
                        <Ionicons name={ICONS[id]} size={18} color={colors.brand} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.ink }}>{meta.label}</Text>
                          <Text style={{ color: colors.muted, fontSize: 12 }}>{meta.hint}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      ) : null}
      {settingsOpen ? (
        <View style={styles.sheetWrap}>
          <TouchableOpacity style={styles.scrim} onPress={() => setSettingsOpen(false)} accessibilityRole="button" accessibilityLabel="Lukk innstillinger" />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Innstillinger</Text>
            <ScrollView>
              {SETTINGS.map(([title, rows]) => (
                <View key={title} style={{ gap: 8, marginBottom: 16 }}>
                  <Text style={[styles.kicker, { color: colors.muted }]}>{title}</Text>
                  {rows.map(([key, label, help]) => (
                    <View key={key} style={styles.switchRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.ink }}>{label}</Text>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>{help}</Text>
                      </View>
                      <Switch value={!!settings[key]} onValueChange={(value) => onDraft({ ...draft, settings: { ...settings, [key]: value } })} />
                    </View>
                  ))}
                </View>
              ))}
              <Text style={[styles.kicker, { color: colors.muted }]}>Bekreftelsesmelding</Text>
              <TextInput
                value={settings.confirmation || ''}
                onChangeText={(confirmation) => onDraft({ ...draft, settings: { ...settings, confirmation } })}
                placeholder="Svaret er sendt."
                placeholderTextColor={colors.placeholder}
                style={[styles.questionInput, { color: colors.ink, borderColor: colors.line }]}
              />
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function displayAnswer(field, value) {
  if (value == null || value === '') return '';
  if (field.kind === 'check') return value ? 'Ja' : 'Nei';
  if (Array.isArray(value)) {
    return value.map((id) => {
      if (String(id).startsWith('other:')) return String(id).slice(6) || 'Annet';
      return (field.options || []).find((row) => row.id === id)?.label || id;
    }).join(', ');
  }
  if (typeof value === 'object') return value.name || '';
  if (String(value).startsWith('other:')) return String(value).slice(6) || 'Annet';
  return (field.options || []).find((row) => row.id === value)?.label || String(value);
}

const styles = StyleSheet.create({
  fill: { position: 'relative', minHeight: 560 },
  scroll: { padding: 12, paddingBottom: 96 },
  column: { padding: 16, gap: 8, paddingBottom: 48 },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  readPanel: { marginHorizontal: 16, marginTop: 8, borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  readChoice: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  center: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 12 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  save: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  cover: { minHeight: 92, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  coverImage: { width: '100%', height: 160 },
  logo: { width: 180, height: 56, alignSelf: 'flex-start' },
  attention: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  pair: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pairItem: { flex: 1, minWidth: 140 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  headerCard: { borderTopWidth: 4 },
  title: { fontSize: 26, fontWeight: '600' },
  intro: { fontSize: 16, minHeight: 48 },
  questionHead: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  questionInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionInput: { flex: 1, borderBottomWidth: 1, paddingVertical: 6, fontSize: 16 },
  optionImage: { width: 28, height: 28, borderRadius: 6 },
  cardFoot: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  grip: { width: 28, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none' },
  gap: { borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fab: { position: 'absolute', right: 18, bottom: 120, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  sheetWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { maxHeight: '78%', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, gap: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  work: { flex: 1, minHeight: 0, flexDirection: 'row' },
  editorScroll: { flex: 1, minWidth: 0 },
  pdfPane: { minHeight: 0, padding: 12, gap: 6, overflow: 'hidden' },
  pdfPaneSide: { width: '44%', minWidth: 380, alignSelf: 'stretch', borderLeftWidth: 1 },
  pdfPaneStack: { marginTop: 8 },
  pdfFrame: { flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' },
  pdfFrameStack: { height: 640, position: 'relative' },
  kicker: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  pieRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  track: { height: 8, borderRadius: 99, overflow: 'hidden' },
  bar: { height: 8 },
  scaleN: { minWidth: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  ghost: { position: 'fixed', zIndex: 30, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
});
