/**
 * Nytt utlegg, laget for telefonen og bygget som Ny kjøretur:
 * Type (faktureres kunden? hvem betalte?) → Prosjekt → Kvittering → Se over.
 *
 * Kvitteringen tas med kameraet, hentes fra bildene eller velges som fil (PDF). Bildet rettes opp,
 * beskjæres til kvitteringen og får skarpere kontrast (receiptPrepare). Deretter lastes det opp,
 * og AI leser dato, beløp, valuta, mva, butikk og utgiftstype. Feltene merkes «Tolket» til den
 * ansatte endrer dem. Ingenting lagres før «Lagre».
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OptionPicker from '../OptionPicker';
import {
  EXPENSE_BILLING_CHOICES,
  EXPENSE_CATEGORIES,
  EXPENSE_PAID_BY,
  expenseCategory,
  normalizeExpense,
} from '../../src/economy/expenses.js';
import {
  expensePatchFromReceipt,
  expenseTypeHint,
  findDuplicateExpense,
  frequentExpenseTypes,
} from '../../src/economy/expenseReceipt.js';
import { formatMoney, parseDate } from '../../src/economy/invoices.js';
import { formatDate } from '../../src/economy/hoursList.js';
import { mileageModalFrame } from '../../src/mileage/modalFrame';
import { pickDocument, pickImage, pickImages, uploadFile } from '../../src/utils/media';
import { prepareReceipt, RECEIPT_ACCEPT, receiptStoragePath } from '../../src/utils/receiptPrepare';
import { ocrExpenseReceipt } from '../../src/utils/receiptOcr';

const STEPS = [
  { id: 'type', label: 'Type' },
  { id: 'prosjekt', label: 'Prosjekt' },
  { id: 'kvittering', label: 'Kvittering' },
  { id: 'seover', label: 'Se over' },
];

const VAT_CHOICES = [
  { id: 'HIGH', label: '25 %' },
  { id: 'MID', label: '15 %' },
  { id: 'LOW', label: '12 %' },
  { id: 'EXEMPT', label: '0 %' },
];

const MAX_FILES = 4;

// Skjemafeltene for dato og beløp er tekst. Tolkningen og utlegget bruker de lagrede navnene.
const FORM_KEY = { date: 'dateText', amountInclVat: 'amountText', originalAmount: 'originalAmountText' };
const STORED_KEY = { dateText: 'date', amountText: 'amountInclVat', originalAmountText: 'originalAmount' };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toNumber(value) {
  const n = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function amountText(value) {
  const n = Number(value);
  return Number.isFinite(n) && n ? n.toFixed(2).replace('.', ',') : '';
}

function fileId() {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function startDraft(employeeId) {
  return {
    billingChoice: '',
    paidBy: 'personal',
    projectId: '',
    internal: false,
    employeeId: employeeId || '',
    date: today(),
    dateText: formatDate(today()),
    amountText: '',
    currency: 'NOK',
    originalAmountText: '',
    vatCode: '',
    vendor: '',
    vendorOrgNr: '',
    receiptNumber: '',
    category: '',
    description: '',
    purpose: '',
    markupPercent: '',
  };
}

function Chip({ label, on, onPress, colors, nativeID, wide }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      nativeID={nativeID}
      style={[styles.chip, wide && styles.chipWide, {
        borderColor: on ? colors.ink : colors.line,
        backgroundColor: on ? colors.ink : colors.card,
      }]}
    >
      <Text style={{ color: on ? colors.card : colors.ink, fontSize: 15, fontWeight: on ? '700' : '500' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Tolket({ colors }) {
  return (
    <View style={[styles.tolket, { backgroundColor: `${colors.brand}22` }]}>
      <Text style={{ color: colors.brandInk || colors.ink, fontSize: 12 }}>Tolket</Text>
    </View>
  );
}

function Input({ label, value, onChange, colors, tolket, placeholder, keyboardType, nativeID, multiline, onBlur, required }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{`${label}${required ? ' *' : ''}`}</Text>
      <View style={[styles.inputWrap, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType={keyboardType || 'default'}
          nativeID={nativeID}
          accessibilityLabel={label}
          multiline={!!multiline}
          style={[styles.input, multiline && styles.inputMulti, { color: colors.ink }]}
        />
        {tolket ? <Tolket colors={colors} /> : null}
      </View>
    </View>
  );
}

function ActionRow({ icon, label, onPress, colors, nativeID, hint }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      nativeID={nativeID}
      style={[styles.actionRow, { borderColor: colors.line }]}
    >
      <Ionicons name={icon} size={26} color={colors.ink} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.ink, fontSize: 17 }}>{label}</Text>
        {hint ? <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const FILE_STATUS = {
  preparing: 'Retter opp bildet…',
  uploading: 'Laster opp…',
  ready: 'Lastet opp',
  error: 'Feilet',
};

function FileCard({ file, colors, onRemove, onRetry }) {
  return (
    <View style={[styles.fileCard, { borderColor: file.status === 'error' ? (colors.danger || '#b42318') : colors.line, backgroundColor: colors.card }]}>
      {file.previewUri ? (
        <Image source={{ uri: file.previewUri }} style={styles.thumb} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.thumb, styles.thumbIcon, { backgroundColor: colors.sunken || colors.bg }]}>
          <Ionicons name={file.pdf ? 'document-text-outline' : 'image-outline'} size={28} color={colors.muted} />
        </View>
      )}
      <View style={styles.fileMeta}>
        <Text style={{ color: colors.ink, fontSize: 13 }} numberOfLines={1}>{file.name || 'Kvittering'}</Text>
        <View style={styles.fileStatus}>
          {file.status === 'preparing' || file.status === 'uploading' ? <ActivityIndicator size="small" color={colors.muted} /> : null}
          <Text style={{ color: file.status === 'error' ? (colors.danger || '#b42318') : colors.muted, fontSize: 12 }} numberOfLines={2}>
            {file.status === 'error' ? (file.error || FILE_STATUS.error) : [FILE_STATUS[file.status], file.cropped ? 'beskåret' : '', file.enhanced ? 'skarpere' : ''].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {file.status === 'error' ? (
          <TouchableOpacity onPress={() => onRetry(file)} accessibilityRole="button" hitSlop={6}>
            <Text style={{ color: colors.brand, fontSize: 13, fontWeight: '600' }}>Prøv igjen</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <TouchableOpacity
        onPress={() => onRemove(file)}
        accessibilityRole="button"
        accessibilityLabel={`Fjern ${file.name || 'kvitteringen'}`}
        hitSlop={8}
        style={styles.fileRemove}
      >
        <Ionicons name="close" size={18} color={colors.muted} />
      </TouchableOpacity>
    </View>
  );
}

/**
 * props:
 * - onSave(input) → Promise<{ ok, error }>: lagrer utlegget (ExpensesScreen).
 * - projectOptions: [{ id, label }], people: [{ id, label }], existing: utlegg (ofte brukt, duplikat).
 */
export default function ExpenseWizard({
  colors,
  companyId,
  onSave,
  onClose,
  projectOptions = [],
  people = [],
  existing = [],
  myEmployeeId = '',
  canPickEmployee = false,
  canInternal = false,
  initialStep = 'type',
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const frame = mileageModalFrame(width, height, insets);
  const [step, setStep] = useState(initialStep);
  const [draft, setDraft] = useState(() => startDraft(myEmployeeId));
  const [touched, setTouched] = useState({});
  const [interpreted, setInterpreted] = useState([]);
  const [files, setFiles] = useState([]);
  const [ocr, setOcr] = useState({ status: 'idle', error: '', warnings: [] });
  const [projectQuery, setProjectQuery] = useState('');
  const [typeOpen, setTypeOpen] = useState(false);
  const [typeQuery, setTypeQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const live = useRef(true);
  const touchedRef = useRef(touched);
  touchedRef.current = touched;
  const ocrRun = useRef(0);

  useEffect(() => () => { live.current = false; }, []);

  const set = (key) => (value) => {
    setDraft((row) => ({ ...row, [key]: value }));
    setTouched((row) => ({ ...row, [key]: true }));
  };

  const project = projectOptions.find((row) => row.id === draft.projectId) || null;
  const projects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    const list = q ? projectOptions.filter((row) => String(row.label || '').toLowerCase().includes(q)) : projectOptions;
    return list.slice(0, 60);
  }, [projectOptions, projectQuery]);
  const frequent = useMemo(
    () => frequentExpenseTypes(existing, { employeeId: draft.employeeId || myEmployeeId }),
    [existing, draft.employeeId, myEmployeeId],
  );
  const typeList = useMemo(() => {
    const q = typeQuery.trim().toLowerCase();
    return EXPENSE_CATEGORIES
      .filter((row) => row.id !== 'mileage')
      .filter((row) => !q || row.label.toLowerCase().includes(q))
      .sort((a, b) => (a.id === 'other') - (b.id === 'other') || a.label.localeCompare(b.label, 'nb'));
  }, [typeQuery]);

  const foreign = !!draft.currency && draft.currency !== 'NOK';
  const amount = toNumber(draft.amountText);
  const preview = normalizeExpense({ amountInclVat: amount, vatCode: draft.vatCode || expenseCategory(draft.category || 'other').vatCode, category: draft.category || 'other' });
  const duplicate = findDuplicateExpense(existing, {
    employeeId: draft.employeeId || myEmployeeId,
    date: parseDate(draft.dateText) || draft.date,
    amountInclVat: amount,
  });
  const representation = draft.category === 'representation';
  const pending = files.some((file) => file.status === 'preparing' || file.status === 'uploading');
  const isTolket = (key) => interpreted.includes(key) && !touched[key];

  /** Tolker alle ferdige bilder samlet (flere bilder kan være samme lange kvittering). */
  async function interpret(list) {
    const images = list.map((file) => file.dataUrl).filter(Boolean).slice(0, MAX_FILES);
    if (!images.length) return;
    const run = ocrRun.current + 1;
    ocrRun.current = run;
    setOcr({ status: 'reading', error: '', warnings: [] });
    try {
      const bilag = await ocrExpenseReceipt(companyId, images, {
        expenseTypes: expenseTypeHint(),
        hint: project ? `Prosjekt: ${project.label}` : '',
      });
      if (!live.current || run !== ocrRun.current) return;
      const seen = touchedRef.current;
      const { patch, interpreted: keys, warnings } = expensePatchFromReceipt(bilag, {
        touched: { ...seen, date: seen.dateText, amountInclVat: seen.amountText, originalAmount: seen.originalAmountText },
      });
      const { date, amountInclVat, originalAmount, ...rest } = patch;
      setDraft((row) => ({
        ...row,
        ...rest,
        ...(date ? { dateText: formatDate(date) } : {}),
        ...(amountInclVat != null ? { amountText: amountText(amountInclVat) } : {}),
        ...(originalAmount != null ? { originalAmountText: amountText(originalAmount) } : {}),
      }));
      setInterpreted((current) => [...new Set([...current, ...keys.map((key) => FORM_KEY[key] || key)])]);
      setOcr({ status: 'done', error: '', warnings });
    } catch (cause) {
      if (!live.current || run !== ocrRun.current) return;
      setOcr({ status: 'error', error: String(cause?.message || '') || 'Kunne ikke lese kvitteringen.', warnings: [] });
    }
  }

  function patchFile(id, partial) {
    setFiles((list) => list.map((file) => (file.id === id ? { ...file, ...partial } : file)));
  }

  async function upload(file) {
    patchFile(file.id, { status: 'uploading', error: '' });
    try {
      const path = receiptStoragePath(companyId, file.name);
      const source = file.blob ? { blob: file.blob, name: file.name, mimeType: file.mimeType } : { uri: file.uri, name: file.name, mimeType: file.mimeType };
      const url = await uploadFile(path, source, file.mimeType);
      if (!live.current) return;
      patchFile(file.id, { status: 'ready', url, path });
    } catch (cause) {
      if (!live.current) return;
      patchFile(file.id, { status: 'error', error: String(cause?.message || '') || 'Opplastingen feilet.' });
    }
  }

  /** Legg til valgte filer: gjør klar, last opp og tolk. */
  async function addPicked(picked) {
    const list = (Array.isArray(picked) ? picked : [picked]).filter(Boolean).slice(0, MAX_FILES - files.length);
    if (!list.length) return;
    setError('');
    const fresh = list.map((item) => ({ id: fileId(), status: 'preparing', name: item.name || 'Kvittering', previewUri: '', pdf: /pdf/i.test(item.mimeType || item.name || '') }));
    setFiles((current) => [...current, ...fresh]);
    setStep('seover');
    const prepared = await Promise.all(list.map(async (item, index) => {
      try {
        const ready = await prepareReceipt(item);
        return { ...fresh[index], ...ready, status: 'uploading' };
      } catch (cause) {
        return { ...fresh[index], status: 'error', error: String(cause?.message || '') || 'Kunne ikke lese bildet.' };
      }
    }));
    if (!live.current) return;
    setFiles((current) => current.map((file) => prepared.find((row) => row.id === file.id) || file));
    prepared.filter((file) => file.status === 'uploading').forEach((file) => { upload(file); });
    interpret([...files, ...prepared].filter((file) => file.dataUrl && file.status !== 'error'));
  }

  async function takePhoto() {
    try {
      addPicked(await pickImage({ camera: true, edit: false }));
    } catch (cause) {
      setError(/denied/.test(String(cause?.message)) ? 'Appen har ikke tilgang til kameraet. Gi tilgang i innstillingene.' : 'Kunne ikke åpne kameraet.');
    }
  }

  async function fromLibrary() {
    try {
      addPicked(await pickImages({ max: MAX_FILES - files.length }));
    } catch (cause) {
      setError(/denied/.test(String(cause?.message)) ? 'Appen har ikke tilgang til bildene. Gi tilgang i innstillingene.' : 'Kunne ikke åpne bildene.');
    }
  }

  async function fromFiles() {
    try {
      addPicked(await pickDocument({ accept: RECEIPT_ACCEPT, multiple: true }));
    } catch {
      setError('Kunne ikke åpne filene.');
    }
  }

  function removeFile(file) {
    const rest = files.filter((row) => row.id !== file.id);
    setFiles(rest);
    if (file.previewUri && Platform.OS === 'web' && /^blob:/.test(file.previewUri)) {
      try { URL.revokeObjectURL(file.previewUri); } catch { /* ignore */ }
    }
    if (rest.some((row) => row.dataUrl)) interpret(rest.filter((row) => row.dataUrl && row.status !== 'error'));
  }

  function retryFile(file) {
    if (file.blob || file.uri) upload(file);
  }

  function chooseBilling(id) {
    setDraft((row) => ({ ...row, billingChoice: id, ...(id === 'yes' ? { internal: false } : {}) }));
    setError('');
  }

  function chooseProject(id) {
    setDraft((row) => ({ ...row, projectId: id, internal: !id }));
    setError('');
    setStep('kvittering');
  }

  function chooseType(id) {
    setDraft((row) => ({ ...row, category: id }));
    setTouched((row) => ({ ...row, category: true }));
    setTypeOpen(false);
    setTypeQuery('');
  }

  function stepProblem(id) {
    if (id === 'type') {
      if (!draft.billingChoice) return 'Velg om utlegget skal faktureres videre til kunden.';
    }
    if (id === 'prosjekt') {
      if (!draft.projectId && (draft.billingChoice === 'yes' || !canInternal)) {
        return draft.billingChoice === 'yes' ? 'Velg prosjektet kunden skal faktureres på.' : 'Velg prosjekt.';
      }
    }
    return '';
  }

  function saveProblem() {
    if (!parseDate(draft.dateText) || !/^\d{4}-\d{2}-\d{2}$/.test(parseDate(draft.dateText))) return 'Skriv datoen som dd.mm.åååå.';
    if (!(amount > 0)) return foreign ? `Skriv beløpet i NOK fra kontoutskriften.` : 'Skriv beløpet.';
    if (!draft.category) return 'Velg utgiftstype.';
    if (!String(draft.description || '').trim()) return 'Skriv en kort beskrivelse.';
    if (representation && !String(draft.purpose || '').trim()) return 'Representasjon: skriv hvem som deltok og formålet.';
    if (pending) return 'Vent til kvitteringen er lastet opp.';
    return '';
  }

  async function save() {
    const problem = saveProblem();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    const ready = files.filter((file) => file.status === 'ready' && file.url);
    const input = {
      date: parseDate(draft.dateText),
      employeeId: draft.employeeId || myEmployeeId,
      projectId: draft.projectId,
      category: draft.category,
      description: String(draft.description || '').trim(),
      purpose: String(draft.purpose || '').trim(),
      vendor: String(draft.vendor || '').trim(),
      vendorOrgNr: draft.vendorOrgNr,
      receiptNumber: draft.receiptNumber,
      paidBy: draft.paidBy,
      // Beløpene på utlegget er i NOK. Kvitteringens valuta og beløp står ved siden av.
      currency: 'NOK',
      originalAmount: foreign ? toNumber(draft.originalAmountText) : 0,
      originalCurrency: foreign ? draft.currency : '',
      amountExVat: 0,
      amountInclVat: amount,
      vatCode: foreign ? 'OUTSIDE' : (draft.vatCode || expenseCategory(draft.category).vatCode),
      billingChoice: draft.billingChoice,
      billable: draft.billingChoice !== 'no',
      chargeType: 'reinvoice',
      markupPercent: draft.billingChoice === 'yes' ? toNumber(draft.markupPercent) : 0,
      attachments: ready.map((file) => ({ url: file.url, path: file.path, name: file.name, type: file.mimeType })),
      interpreted: interpreted.filter((key) => !touched[key]).map((key) => STORED_KEY[key] || key),
    };
    const result = await onSave(input);
    if (!live.current) return;
    setSaving(false);
    if (!result?.ok) setError(result?.error || 'Kunne ikke lagre utlegget.');
  }

  function goNext() {
    const problem = stepProblem(step);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    if (step === 'seover') {
      save();
      return;
    }
    const index = STEPS.findIndex((row) => row.id === step);
    setStep(STEPS[index + 1].id);
  }

  function goBack() {
    setError('');
    const index = STEPS.findIndex((row) => row.id === step);
    if (index <= 0) {
      onClose();
      return;
    }
    setStep(STEPS[index - 1].id);
  }

  const stepIndex = STEPS.findIndex((row) => row.id === step);
  const nextLabel = step === 'seover' ? 'Lagre' : 'Neste';
  const bodyMax = Math.max(200, frame.maxHeight - 132);
  const ink = colors.ink;
  const danger = colors.dangerInk || colors.danger || '#b42318';
  const projectLine = draft.projectId ? (project?.label || 'Valgt prosjekt') : 'Internt (uten prosjekt)';
  const billingLabel = EXPENSE_BILLING_CHOICES.find((row) => row.id === draft.billingChoice)?.label || '';
  const paidLabel = EXPENSE_PAID_BY.find((row) => row.id === draft.paidBy)?.label || '';

  const typeStep = (
    <View style={styles.stack}>
      <Text style={[styles.question, { color: ink }]}>Skal utlegget faktureres videre til kunde?</Text>
      <View style={styles.row}>
        {EXPENSE_BILLING_CHOICES.map((row) => (
          <Chip key={row.id} label={row.label} on={draft.billingChoice === row.id} onPress={() => chooseBilling(row.id)} colors={colors} nativeID={`expense-billing-${row.id}`} wide />
        ))}
      </View>
      {draft.billingChoice ? (
        <Text style={[styles.hint, { color: colors.muted }]}>{EXPENSE_BILLING_CHOICES.find((row) => row.id === draft.billingChoice)?.hint}</Text>
      ) : null}
      <Text style={[styles.question, { color: ink, marginTop: 12 }]}>Hvem betalte?</Text>
      <View style={styles.row}>
        {EXPENSE_PAID_BY.map((row) => (
          <Chip key={row.id} label={row.label} on={draft.paidBy === row.id} onPress={() => setDraft((d) => ({ ...d, paidBy: row.id }))} colors={colors} nativeID={`expense-paid-${row.id}`} wide />
        ))}
      </View>
      <Text style={[styles.hint, { color: colors.muted }]}>{EXPENSE_PAID_BY.find((row) => row.id === draft.paidBy)?.hint}</Text>
      {canPickEmployee ? (
        <View style={[styles.field, { marginTop: 12 }]}>
          <Text style={[styles.label, { color: colors.muted }]}>Ansatt som har lagt ut</Text>
          <OptionPicker
            options={people}
            value={draft.employeeId || ''}
            onChange={(id) => setDraft((d) => ({ ...d, employeeId: id || '' }))}
            title="Ansatt"
            placeholder="Velg ansatt"
            accessibilityLabel="Ansatt som har lagt ut"
          />
        </View>
      ) : null}
    </View>
  );

  const projectStep = (
    <View style={styles.stack}>
      <View style={[styles.inputWrap, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Ionicons name="search" size={18} color={colors.muted} style={{ marginLeft: 10 }} />
        <TextInput
          value={projectQuery}
          onChangeText={setProjectQuery}
          placeholder="Søk prosjekt, nummer eller kunde"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Søk prosjekt"
          nativeID="expense-project-search"
          style={[styles.input, { color: ink }]}
        />
      </View>
      {canInternal && draft.billingChoice !== 'yes' ? (
        <TouchableOpacity
          onPress={() => chooseProject('')}
          accessibilityRole="button"
          accessibilityState={{ selected: draft.internal }}
          nativeID="expense-project-internal"
          style={[styles.listRow, { borderColor: draft.internal ? ink : colors.line, borderWidth: draft.internal ? 2 : StyleSheet.hairlineWidth }]}
        >
          <Text style={{ color: ink, fontSize: 16, fontWeight: draft.internal ? '700' : '400' }}>Uten prosjekt (internt)</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Kostnad for bedriften. Faktureres ikke.</Text>
        </TouchableOpacity>
      ) : null}
      {projects.map((row) => {
        const on = draft.projectId === row.id;
        return (
          <TouchableOpacity
            key={row.id}
            onPress={() => chooseProject(row.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={row.label}
            style={[styles.listRow, { borderColor: on ? ink : colors.line, borderWidth: on ? 2 : StyleSheet.hairlineWidth }]}
          >
            <Text style={{ color: ink, fontSize: 16, fontWeight: on ? '700' : '400' }} numberOfLines={2}>{row.label}</Text>
          </TouchableOpacity>
        );
      })}
      {!projects.length ? (
        <Text style={{ color: colors.muted, paddingVertical: 8 }}>{projectQuery ? 'Ingen prosjekt matcher søket.' : 'Ingen prosjekter.'}</Text>
      ) : null}
    </View>
  );

  const receiptStep = (
    <View style={styles.stack}>
      <Text style={[styles.hint, { color: colors.muted }]}>
        Legg kvitteringen på et mørkt underlag og ta bildet rett ovenfra. Bildet beskjæres og gjøres skarpere, og AI fyller ut feltene.
      </Text>
      <ActionRow icon="camera-outline" label="Ta bilde" onPress={takePhoto} colors={colors} nativeID="expense-receipt-camera" />
      <ActionRow icon="image-outline" label="Legg til fra bildene" onPress={fromLibrary} colors={colors} nativeID="expense-receipt-library" />
      <ActionRow icon="document-outline" label="Legg til fil" hint="Bilde eller PDF, f.eks. e-postkvittering" onPress={fromFiles} colors={colors} nativeID="expense-receipt-file" />
      <ActionRow icon="ban-outline" label="Fortsett uten" hint="Kvittering kan legges til senere." onPress={() => setStep('seover')} colors={colors} nativeID="expense-receipt-skip" />
    </View>
  );

  const typePicker = (
    <View style={[styles.typePanel, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="expense-type-panel">
      <View style={[styles.inputWrap, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Ionicons name="search" size={18} color={colors.muted} style={{ marginLeft: 10 }} />
        <TextInput
          value={typeQuery}
          onChangeText={setTypeQuery}
          placeholder="Søk etter utgiftstyper…"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Søk etter utgiftstyper"
          style={[styles.input, { color: ink }]}
        />
      </View>
      {frequent.length && !typeQuery ? (
        <>
          <Text style={[styles.label, { color: colors.muted }]}>Ofte brukt</Text>
          <View style={styles.row}>
            {frequent.map((id) => (
              <Chip key={id} label={expenseCategory(id).label} on={draft.category === id} onPress={() => chooseType(id)} colors={colors} />
            ))}
          </View>
          <Text style={[styles.label, { color: colors.muted }]}>Alle utgiftstyper</Text>
        </>
      ) : null}
      {typeList.map((row) => (
        <TouchableOpacity
          key={row.id}
          onPress={() => chooseType(row.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: draft.category === row.id }}
          style={styles.typeRow}
        >
          <Text style={{ color: ink, fontSize: 16, fontWeight: draft.category === row.id ? '700' : '400' }}>{row.label}</Text>
          {draft.category === row.id ? <Ionicons name="checkmark" size={18} color={ink} /> : null}
        </TouchableOpacity>
      ))}
    </View>
  );

  const reviewStep = (
    <View style={styles.stack}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fileStrip}>
        {files.length < MAX_FILES ? (
          <TouchableOpacity
            onPress={() => setStep('kvittering')}
            accessibilityRole="button"
            accessibilityLabel="Legg til kvittering"
            nativeID="expense-add-file"
            style={[styles.addFile, { borderColor: colors.line, backgroundColor: colors.card }]}
          >
            <Ionicons name="add" size={28} color={ink} />
          </TouchableOpacity>
        ) : null}
        {files.map((file) => (
          <FileCard key={file.id} file={file} colors={colors} onRemove={removeFile} onRetry={retryFile} />
        ))}
      </ScrollView>
      {ocr.status === 'reading' ? (
        <View style={[styles.banner, { backgroundColor: `${colors.brand}14` }]} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={{ color: ink, flex: 1 }}>Leser kvitteringen…</Text>
        </View>
      ) : null}
      {ocr.status === 'error' ? (
        <View style={[styles.banner, { backgroundColor: `${danger}14` }]}>
          <Text style={{ color: ink, flex: 1 }}>{`Kunne ikke lese kvitteringen. ${ocr.error} Fyll ut feltene selv.`}</Text>
        </View>
      ) : null}
      {ocr.warnings.map((text) => (
        <View key={text} style={[styles.banner, { backgroundColor: '#f59e0b22' }]}>
          <Ionicons name="alert-circle-outline" size={18} color={ink} />
          <Text style={{ color: ink, flex: 1 }}>{text}</Text>
        </View>
      ))}
      <View style={styles.pair}>
        <View style={styles.half}>
          <Input label="Dato" value={draft.dateText} onChange={set('dateText')} onBlur={() => setDraft((d) => ({ ...d, dateText: formatDate(parseDate(d.dateText)) || d.dateText }))} colors={colors} tolket={isTolket('dateText')} placeholder="dd.mm.åååå" nativeID="expense-date" required />
        </View>
        <View style={styles.half}>
          <Input label="Valuta" value={draft.currency} onChange={(v) => set('currency')(String(v || '').toUpperCase().slice(0, 3))} colors={colors} tolket={isTolket('currency')} placeholder="NOK" nativeID="expense-currency" />
        </View>
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.muted }]}>Utgiftstype *</Text>
        <TouchableOpacity
          onPress={() => setTypeOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={`Utgiftstype: ${draft.category ? expenseCategory(draft.category).label : 'ikke valgt'}`}
          nativeID="expense-type"
          style={[styles.inputWrap, styles.select, { borderColor: colors.line, backgroundColor: colors.card }]}
        >
          <Text style={{ color: draft.category ? ink : colors.muted, fontSize: 16, fontWeight: draft.category ? '700' : '400', flex: 1 }}>
            {draft.category ? expenseCategory(draft.category).label : 'Velg utgiftstype'}
          </Text>
          {isTolket('category') ? <Tolket colors={colors} /> : null}
          <Ionicons name={typeOpen ? 'chevron-up' : 'chevron-down'} size={20} color={ink} style={{ marginRight: 10 }} />
        </TouchableOpacity>
      </View>
      {typeOpen ? typePicker : null}
      {foreign ? (
        <View style={styles.pair}>
          <View style={styles.half}>
            <Input label={`Beløp i ${draft.currency}`} value={draft.originalAmountText} onChange={set('originalAmountText')} colors={colors} tolket={isTolket('originalAmountText')} keyboardType="decimal-pad" nativeID="expense-original-amount" />
          </View>
          <View style={styles.half}>
            <Input label="Beløp i NOK" value={draft.amountText} onChange={set('amountText')} colors={colors} keyboardType="decimal-pad" placeholder="Fra kontoutskriften" nativeID="expense-amount" required />
          </View>
        </View>
      ) : (
        <Input label="Beløp inkl. mva" value={draft.amountText} onChange={set('amountText')} colors={colors} tolket={isTolket('amountText')} keyboardType="decimal-pad" placeholder="0,00" nativeID="expense-amount" required />
      )}
      {!foreign ? (
        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: colors.muted }]}>Mva-sats</Text>
            {isTolket('vatCode') ? <Tolket colors={colors} /> : null}
          </View>
          <View style={styles.row}>
            {VAT_CHOICES.map((row) => (
              <Chip key={row.id} label={row.label} on={(draft.vatCode || (draft.category ? expenseCategory(draft.category).vatCode : '')) === row.id} onPress={() => set('vatCode')(row.id)} colors={colors} />
            ))}
          </View>
          {amount > 0 ? (
            <Text style={[styles.hint, { color: colors.muted }]}>{`Herav mva ${formatMoney(preview.vatAmount)} · eks. mva ${formatMoney(preview.amountExVat)}`}</Text>
          ) : null}
        </View>
      ) : null}
      <Input label="Butikk / leverandør" value={draft.vendor} onChange={set('vendor')} colors={colors} tolket={isTolket('vendor')} nativeID="expense-vendor" />
      <Input label="Beskrivelse" value={draft.description} onChange={set('description')} colors={colors} tolket={isTolket('description')} nativeID="expense-description" required />
      <Input
        label={representation ? 'Deltakere og formål' : 'Formål / merknad'}
        value={draft.purpose}
        onChange={set('purpose')}
        colors={colors}
        placeholder={representation ? 'Hvem deltok, firma og hvorfor' : ''}
        nativeID="expense-purpose"
        multiline
        required={representation}
      />
      {draft.billingChoice === 'yes' ? (
        <Input label="Påslag %" value={String(draft.markupPercent ?? '')} onChange={set('markupPercent')} colors={colors} keyboardType="decimal-pad" placeholder="0" nativeID="expense-markup" />
      ) : null}
      {duplicate ? (
        <View style={[styles.banner, { backgroundColor: '#f59e0b22' }]} nativeID="expense-duplicate">
          <Ionicons name="copy-outline" size={18} color={ink} />
          <Text style={{ color: ink, flex: 1 }}>
            {`Du har et utlegg med samme dato og beløp fra før: ${duplicate.description || duplicate.purpose || 'utlegg'}. Kontroller at det ikke er samme kvittering.`}
          </Text>
        </View>
      ) : null}
      <View style={[styles.summary, { borderColor: colors.line }]}>
        <TouchableOpacity onPress={() => setStep('type')} accessibilityRole="button" style={styles.summaryRow}>
          <Text style={[styles.label, { color: colors.muted }]}>Faktureres kunde</Text>
          <Text style={{ color: ink, fontSize: 15 }}>{`${billingLabel} · ${paidLabel}`}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setStep('prosjekt')} accessibilityRole="button" style={styles.summaryRow}>
          <Text style={[styles.label, { color: colors.muted }]}>Prosjekt</Text>
          <Text style={{ color: ink, fontSize: 15 }} numberOfLines={2}>{projectLine}</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Ingenting lagres før du trykker Lagre. Utlegget sendes til godkjenning.</Text>
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, { paddingTop: insets.top + 8, paddingBottom: Math.max(8, insets.bottom) }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Lukk registrering" />
        <View
          nativeID="expense-wizard"
          style={[styles.sheet, { width: frame.width, maxHeight: frame.maxHeight, backgroundColor: colors.card, borderColor: colors.line }]}
        >
          <View style={styles.head}>
            <View style={styles.headRow}>
              <Text style={[styles.title, { color: ink }]}>Nytt utlegg</Text>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk" hitSlop={8} style={styles.closeHit}>
                <Ionicons name="close" size={22} color={ink} />
              </TouchableOpacity>
            </View>
            <View style={styles.steps}>
              {STEPS.map((item, index) => {
                const active = item.id === step;
                const reached = index <= stepIndex;
                return (
                  <TouchableOpacity
                    key={item.id}
                    disabled={!reached}
                    onPress={() => { setError(''); setStep(item.id); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={styles.stepHit}
                  >
                    <View style={[styles.stepBar, { backgroundColor: reached ? colors.brand : colors.line }]} />
                    <Text numberOfLines={1} style={{ color: active ? ink : colors.muted, fontSize: 12, fontWeight: active ? '700' : '500' }}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <ScrollView
            style={[styles.body, { maxHeight: bodyMax }]}
            contentContainerStyle={styles.bodyInner}
            keyboardShouldPersistTaps="handled"
          >
            {step === 'type' ? typeStep : null}
            {step === 'prosjekt' ? projectStep : null}
            {step === 'kvittering' ? receiptStep : null}
            {step === 'seover' ? reviewStep : null}
          </ScrollView>
          {error ? (
            <Text style={[styles.error, { color: danger }]} accessibilityRole="alert" nativeID="expense-wizard-error">{error}</Text>
          ) : null}
          <View style={[styles.foot, { borderTopColor: colors.line }]}>
            <TouchableOpacity
              onPress={goBack}
              accessibilityRole="button"
              nativeID="expense-wizard-back"
              style={[styles.footBtn, { borderColor: colors.line, backgroundColor: colors.card }]}
            >
              <Text style={{ color: ink, fontSize: 16, fontWeight: '600' }}>{stepIndex <= 0 ? 'Avbryt' : 'Tilbake'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={goNext}
              disabled={saving}
              accessibilityRole="button"
              accessibilityState={{ busy: saving }}
              nativeID="expense-wizard-next"
              style={[styles.footBtn, styles.footPrimary, { backgroundColor: ink, borderColor: ink, opacity: saving ? 0.7 : 1 }]}
            >
              {saving ? <ActivityIndicator size="small" color={colors.card} /> : null}
              <Text style={{ color: colors.card, fontSize: 16, fontWeight: '700' }}>{nextLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', alignItems: 'center', justifyContent: 'center' },
  sheet: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', flexDirection: 'column' },
  head: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  title: { flex: 1, fontSize: 18, fontWeight: '700' },
  closeHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  steps: { flexDirection: 'row', gap: 8 },
  stepHit: { flex: 1, minHeight: 32, justifyContent: 'center', gap: 6 },
  stepBar: { height: 4, borderRadius: 2 },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyInner: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  stack: { gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  question: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 16 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  chipWide: { minWidth: 96, alignItems: 'center' },
  field: { alignSelf: 'stretch', gap: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 13 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, minHeight: 48 },
  // minWidth 0: på nett er tekstfeltet ellers minst ~20 tegn bredt og skyver «Tolket» ut.
  input: { flex: 1, minWidth: 0, fontSize: 16, paddingHorizontal: 12, paddingVertical: 10, minHeight: 46 },
  inputMulti: { minHeight: 64, textAlignVertical: 'top' },
  select: { paddingLeft: 12, gap: 8 },
  tolket: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 60, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  listRow: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 48, justifyContent: 'center', gap: 2 },
  typePanel: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 },
  typeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 4 },
  fileStrip: { gap: 8, paddingVertical: 2 },
  addFile: { width: 64, height: 84, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fileCard: { width: 220, height: 84, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6 },
  thumb: { width: 54, height: 70, borderRadius: 6 },
  thumbIcon: { alignItems: 'center', justifyContent: 'center' },
  fileMeta: { flex: 1, minWidth: 0, gap: 2 },
  fileStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fileRemove: { alignSelf: 'flex-start', padding: 2 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, padding: 10 },
  summary: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  summaryRow: { paddingVertical: 8, gap: 2 },
  error: { fontSize: 13, paddingHorizontal: 16, paddingTop: 6, textAlign: 'right' },
  foot: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth },
  footBtn: { minHeight: 44, minWidth: 104, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, flexDirection: 'row', gap: 6 },
  footPrimary: {},
});
