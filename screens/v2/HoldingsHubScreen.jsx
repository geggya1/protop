/**
 * Kjøretøy — liste → detalj med bilde.
 * Blyant = standard opplysninger. Pluss = service, kvittering, frister, kostnad.
 * Skjema tilpasser seg type. Oppslag via Statens vegvesen.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert,
  Modal, Pressable, Linking, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { Screen, Mute } from '../../components/ui';
import { ModulePageFrame, ModuleBgSpacer } from '../../components/ModulePageBg';
import ShellAddButton from '../../components/ShellAddButton';
import ModuleIntroHost from '../../components/ModuleIntroHost';
import CompactBackLink from '../../components/CompactBackLink';
import Fab from '../../components/Fab';
import PlusActionMenu from '../../components/PlusActionMenu';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import {
  listenHoldings, saveHolding, archiveHolding,
  VEHICLE_TYPES, VEHICLE_LOG_KINDS, HOLDING_DOC_KINDS, HOLDINGS_HUB_BLURB,
  vehicleSummaryLine, vehicleTypeMeta, vehicleDeadlines, vehicleLogTotal,
  vehicleFormConfig, isVehicleHolding, dueTone,
} from '../../src/utils/familyHoldings';
import { lookupVehicleByReg } from '../../src/utils/vegvesenLookupClient';
import {
  formatRegNumber,
  holdingFieldsFromLookup,
  VEGVESEN_PUBLIC_LOOKUP_URL,
} from '../../src/utils/vegvesenApis';
import {
  pickDocument, uploadFile, DEFAULT_DOCUMENT_ACCEPT,
  pickImage, uploadImage, alertPhotoError,
} from '../../src/utils/media';
import { useDocumentScanCrop } from '../../src/hooks/useDocumentScanCrop';

function emptyLog(kind = 'fuel') {
  return {
    dateKey: new Date().toISOString().slice(0, 10),
    kind,
    amount: '',
    liters: '',
    km: '',
    note: '',
  };
}

function emptyForm() {
  return {
    title: '',
    vehicleType: 'car',
    make: '',
    model: '',
    year: '',
    regNumber: '',
    understellsnummer: '',
    fuelType: 'petrol',
    mileageKm: '',
    insuranceCompany: '',
    insuranceKey: '',
    euControlKey: '',
    nextServiceKey: '',
    lastServiceKey: '',
    tireNote: '',
    purchaseKey: '',
    notes: '',
    vegvesenSyncedAt: null,
    logs: [],
    documents: [],
    photoUrl: null,
    photoPath: null,
  };
}

function formFromRow(row) {
  const typeCfg = vehicleFormConfig(row.vehicleType || 'car');
  return {
    form: {
      title: row.title || '',
      vehicleType: row.vehicleType || 'car',
      make: row.make || '',
      model: row.model || '',
      year: row.year || '',
      regNumber: row.regNumber || '',
      understellsnummer: row.understellsnummer || '',
      fuelType: row.fuelType || 'petrol',
      mileageKm: row.mileageKm != null ? String(row.mileageKm) : '',
      insuranceCompany: row.insuranceCompany || '',
      insuranceKey: row.insuranceKey || '',
      euControlKey: row.euControlKey || '',
      nextServiceKey: row.nextServiceKey || '',
      lastServiceKey: row.lastServiceKey || '',
      tireNote: row.tireNote || '',
      purchaseKey: row.purchaseKey || '',
      notes: row.notes || '',
      vegvesenSyncedAt: row.vegvesenSyncedAt || null,
      logs: row.logs || [],
      documents: Array.isArray(row.documents) ? row.documents : [],
      photoUrl: row.photoUrl || null,
      photoPath: row.photoPath || null,
    },
    defaultLogKind: typeCfg.defaultLogKind,
  };
}

function docKindLabel(kind) {
  return HOLDING_DOC_KINDS.find((k) => k.id === kind)?.label || 'Dokument';
}

function FactRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

export default function HoldingsHubScreen({ inShell = false }) {
  const { familyId, uid, isParent } = useApp();
  const { isDesktop } = useLayout();
  const [items, setItems] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [panel, setPanel] = useState(null); // create | basics | service | document | log | deadlines
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupHint, setLookupHint] = useState('');
  const [logDraft, setLogDraft] = useState(emptyLog());
  const [docKind, setDocKind] = useState('receipt');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const { prepareUpload, cropModal } = useDocumentScanCrop({
    title: 'Juster kvittering',
  });

  const cfg = useMemo(() => vehicleFormConfig(form.vehicleType), [form.vehicleType]);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenHoldings(familyId, setItems);
  }, [familyId]);

  const vehicles = useMemo(() => items.filter(isVehicleHolding), [items]);
  const detail = useMemo(
    () => vehicles.find((h) => h.id === detailId) || null,
    [vehicles, detailId],
  );

  useEffect(() => {
    if (detailId && !vehicles.some((h) => h.id === detailId)) {
      setDetailId(null);
    }
  }, [vehicles, detailId]);

  const upcoming = useMemo(() => {
    const rows = [];
    vehicles.forEach((h) => {
      vehicleDeadlines(h).forEach((d) => {
        rows.push({ ...d, title: h.title, vehicleId: h.id });
      });
    });
    return rows.sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey))).slice(0, 6);
  }, [vehicles]);

  const openPanel = useCallback((kind, row = null) => {
    setLookupHint('');
    setDocKind('receipt');
    if (row) {
      const { form: next, defaultLogKind } = formFromRow(row);
      setEditId(row.id);
      setForm(next);
      setLogDraft(emptyLog(defaultLogKind));
    } else {
      setEditId(null);
      setForm(emptyForm());
      setLogDraft(emptyLog('fuel'));
    }
    setPanel(kind);
  }, []);

  const closePanel = useCallback(() => {
    if (saving) return;
    setPanel(null);
    setLookupHint('');
  }, [saving]);

  const patch = useCallback((part) => {
    setForm((s) => {
      const next = { ...s, ...part };
      if (part.vehicleType && part.vehicleType !== s.vehicleType) {
        const nextCfg = vehicleFormConfig(part.vehicleType);
        if (!nextCfg.showFuel) next.fuelType = '';
        else if (!next.fuelType) next.fuelType = nextCfg.fuels[0]?.id || 'other';
        if (!nextCfg.showMileage) next.mileageKm = '';
        if (!nextCfg.showEu) next.euControlKey = '';
        if (!nextCfg.showTires) next.tireNote = '';
        if (!nextCfg.showPurchaseDate) next.purchaseKey = '';
        setLogDraft((ld) => ({
          ...ld,
          kind: nextCfg.logKinds.some((k) => k.id === ld.kind) ? ld.kind : nextCfg.defaultLogKind,
        }));
      }
      return next;
    });
  }, []);

  const runVegvesenLookup = useCallback(async () => {
    if (lookingUp) return;
    if (!String(form.regNumber || '').trim()) {
      setLookupHint('Skriv inn registreringsnummeret først.');
      return;
    }
    setLookingUp(true);
    setLookupHint('');
    try {
      const vehicle = await lookupVehicleByReg(form.regNumber);
      setForm((s) => ({
        ...s,
        ...holdingFieldsFromLookup(vehicle, s),
        regNumber: vehicle.regNumber || s.regNumber,
      }));
      setLookupHint(
        vehicle.summaryLine
          ? `Hentet fra Vegvesenet: ${vehicle.summaryLine}`
          : 'Hentet tekniske data fra Vegvesenet.',
      );
    } catch (e) {
      setLookupHint(e?.message || 'Klarte ikke slå opp hos Vegvesenet.');
    } finally {
      setLookingUp(false);
    }
  }, [form.regNumber, lookingUp]);

  const listAddBtn = useMemo(
    () => (isParent && !detailId
      ? <ShellAddButton label="Registrer kjøretøy" onPress={() => openPanel('create')} />
      : null),
    [isParent, detailId, openPanel],
  );
  useShellTitleRight(listAddBtn, { active: isParent && !detailId && !panel });

  const persistVehicle = useCallback(async (payload, id = editId) => {
    if (!familyId) return null;
    const typeCfg = vehicleFormConfig(payload.vehicleType);
    const title = String(payload.title || '').trim()
      || [payload.make, payload.model].filter(Boolean).join(' ')
      || payload.regNumber
      || typeCfg.defaultTitle;
    return saveHolding(familyId, id, {
      ...payload,
      title,
      kind: 'vehicle',
      emoji: vehicleTypeMeta(payload).emoji,
      mileageKm: payload.mileageKm,
      insuranceKey: String(payload.insuranceKey || '').trim() || null,
      euControlKey: String(payload.euControlKey || '').trim() || null,
      nextServiceKey: String(payload.nextServiceKey || '').trim() || null,
      lastServiceKey: String(payload.lastServiceKey || '').trim() || null,
      purchaseKey: String(payload.purchaseKey || '').trim() || null,
      understellsnummer: payload.understellsnummer || '',
      vegvesenSyncedAt: payload.vegvesenSyncedAt || null,
      documents: payload.documents || [],
      photoUrl: payload.photoUrl || null,
      photoPath: payload.photoPath || null,
    }, uid);
  }, [familyId, editId, uid]);

  const uploadDocument = useCallback(async () => {
    if (!familyId || uploadingDoc) return;
    try {
      const picked = await pickDocument({ accept: DEFAULT_DOCUMENT_ACCEPT });
      if (!picked) return;
      const ready = await prepareUpload(picked);
      if (!ready) return;
      setUploadingDoc(true);
      const name = ready.name || picked.name || `dokument-${Date.now()}`;
      const safe = String(name).replace(/[^\w.\-()+ ]/g, '_');
      const folder = editId || detailId || `draft-${uid || 'user'}`;
      const path = `families/${familyId}/holdings-files/${folder}/${Date.now()}-${safe}`;
      const downloadUrl = await uploadFile(path, ready, ready.mimeType || picked.mimeType);
      setForm((s) => ({
        ...s,
        documents: [
          ...(s.documents || []),
          {
            id: `doc_${Date.now()}`,
            kind: docKind,
            name,
            mimeType: ready.mimeType || picked.mimeType || null,
            size: ready.size || picked.size || null,
            storagePath: path,
            downloadUrl,
            uploadedBy: uid || null,
            uploadedAt: new Date().toISOString(),
          },
        ],
      }));
      if (ready.revoke && ready.uri && typeof URL !== 'undefined') {
        try { URL.revokeObjectURL(ready.uri); } catch { /* ignore */ }
      }
    } catch (e) {
      Alert.alert('Opplasting feilet', e?.message || 'Klarte ikke laste opp dokumentet.');
    } finally {
      setUploadingDoc(false);
    }
  }, [familyId, uploadingDoc, editId, detailId, uid, docKind, prepareUpload]);

  const uploadVehiclePhoto = useCallback(async (row) => {
    if (!familyId || !row?.id || uploadingPhoto) return;
    try {
      const picked = await pickImage({ edit: true, aspect: [16, 10] });
      if (!picked) return;
      setUploadingPhoto(true);
      const path = `families/${familyId}/holdings-photos/${row.id}/${Date.now()}.jpg`;
      const photoUrl = await uploadImage(path, picked);
      await saveHolding(familyId, row.id, {
        ...row,
        photoUrl,
        photoPath: path,
      }, uid);
    } catch (e) {
      alertPhotoError(e);
    } finally {
      setUploadingPhoto(false);
    }
  }, [familyId, uploadingPhoto, uid]);

  const savePanel = useCallback(async () => {
    if (!familyId || saving) return;
    setSaving(true);
    try {
      let nextForm = { ...form };
      if (panel === 'log') {
        if (logDraft.dateKey || logDraft.amount || logDraft.note) {
          nextForm = {
            ...nextForm,
            logs: [
              ...(nextForm.logs || []),
              {
                ...logDraft,
                id: `log_${Date.now()}`,
                amount: logDraft.amount,
                liters: logDraft.liters,
                km: logDraft.km,
              },
            ],
          };
        }
      }
      const id = await persistVehicle(nextForm, editId);
      if (panel === 'create' && id) setDetailId(id);
      setPanel(null);
      setForm(emptyForm());
      setLogDraft(emptyLog());
      setEditId(null);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre.');
    } finally {
      setSaving(false);
    }
  }, [familyId, saving, form, panel, logDraft, persistVehicle, editId]);

  const addMenuItems = useMemo(() => {
    if (!detail) return [];
    const typeCfg = vehicleFormConfig(detail.vehicleType);
    const items = [
      {
        id: 'service',
        icon: 'construct-outline',
        label: 'Ny service',
        hint: 'Neste og siste service',
        onPress: () => openPanel('service', detail),
      },
      {
        id: 'document',
        icon: 'receipt-outline',
        label: 'Ny kvittering',
        hint: 'Kvittering, kjøpsbevis eller dokumentasjon',
        onPress: () => openPanel('document', detail),
      },
      {
        id: 'deadlines',
        icon: 'calendar-outline',
        label: 'Oppdater frister',
        hint: typeCfg.showEu
          ? 'Kilometerstand, forsikring og EU-kontroll'
          : 'Kilometerstand og forsikring',
        onPress: () => openPanel('deadlines', detail),
      },
    ];
    if (typeCfg.logKinds?.length) {
      items.push({
        id: 'log',
        icon: 'cash-outline',
        label: typeCfg.showFuel ? 'Drivstoff / kostnad' : 'Ny kostnad',
        hint: 'Logg beløp og vedlikehold',
        onPress: () => openPanel('log', detail),
      });
    }
    items.push({
      id: 'info',
      icon: 'document-text-outline',
      label: 'Nye opplysninger',
      hint: 'Notater, dekk og øvrige detaljer',
      onPress: () => openPanel('basics', detail),
    });
    return items;
  }, [detail, openPanel]);

  const panelTitle = {
    create: 'Registrer kjøretøy',
    basics: 'Standard opplysninger',
    service: 'Ny service',
    document: 'Ny kvittering',
    log: cfg.logSectionLabel,
    deadlines: 'Oppdater frister',
  }[panel] || 'Kjøretøy';

  if (!isParent) {
    return (
      <Screen>
        <View style={styles.body}><Mute>Kun foresatte.</Mute></View>
      </Screen>
    );
  }

  const renderTypeAndLookup = () => (
    <>
      <Text style={styles.fieldLabel}>Type</Text>
      <View style={styles.chipRow}>
        {VEHICLE_TYPES.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.fuelChip, form.vehicleType === t.id && styles.fuelChipOn]}
            onPress={() => patch({ vehicleType: t.id })}
            accessibilityRole="button"
            accessibilityState={{ selected: form.vehicleType === t.id }}
          >
            <Text style={[styles.fuelChipTxt, form.vehicleType === t.id && styles.fuelChipTxtOn]}>
              {t.emoji} {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.typeHint}>{cfg.typeEmoji} {cfg.formHint}</Text>

      {cfg.showFuel ? (
        <>
          <Text style={styles.fieldLabel}>{cfg.fuelLabel}</Text>
          <View style={styles.chipRow}>
            {cfg.fuels.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={[styles.fuelChip, form.fuelType === f.id && styles.fuelChipOn]}
                onPress={() => patch({ fuelType: f.id })}
              >
                <Text style={[styles.fuelChipTxt, form.fuelType === f.id && styles.fuelChipTxtOn]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}

      {cfg.showRegField ? (
        <>
          <Text style={styles.fieldLabel}>{cfg.regLabel}</Text>
          <View style={styles.lookupRow}>
            <TextInput
              style={[styles.input, styles.lookupInput]}
              value={form.regNumber}
              onChangeText={(v) => {
                setLookupHint('');
                patch({ regNumber: cfg.showRegLookup ? v.toUpperCase() : v });
              }}
              placeholder={cfg.regPlaceholder}
              placeholderTextColor={colors.placeholder}
              autoCapitalize={cfg.showRegLookup ? 'characters' : 'none'}
              autoCorrect={false}
            />
            {cfg.showRegLookup ? (
              <TouchableOpacity
                style={[styles.lookupBtn, lookingUp && styles.lookupBtnDisabled]}
                onPress={runVegvesenLookup}
                disabled={lookingUp}
                accessibilityLabel="Slå opp hos Vegvesenet"
              >
                <Ionicons name="search" size={16} color="#fff" />
                <Text style={styles.lookupBtnTxt}>{lookingUp ? 'Søker…' : 'Slå opp'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {!!lookupHint && <Text style={styles.lookupHint}>{lookupHint}</Text>}
          {cfg.showRegLookup ? (
            <TouchableOpacity onPress={() => Linking.openURL(VEGVESEN_PUBLIC_LOOKUP_URL)} hitSlop={6}>
              <Text style={styles.lookupLink}>
                Åpne Vegvesenets offentlige oppslag
                {form.regNumber ? ` (${formatRegNumber(form.regNumber)})` : ''}
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
    </>
  );

  const renderBasicsFields = ({ includeType = true } = {}) => (
    <View key={`vehicle-fields-${form.vehicleType}`}>
      {includeType ? renderTypeAndLookup() : null}
      <Text style={styles.fieldLabel}>{cfg.basicsLabel}</Text>
      <TextInput
        style={styles.input}
        value={form.title}
        onChangeText={(title) => patch({ title })}
        placeholder={cfg.titlePlaceholder}
        placeholderTextColor={colors.placeholder}
      />
      <TextInput style={styles.input} value={form.make} onChangeText={(make) => patch({ make })} placeholder={cfg.makePlaceholder} placeholderTextColor={colors.placeholder} />
      <TextInput style={styles.input} value={form.model} onChangeText={(model) => patch({ model })} placeholder={cfg.modelPlaceholder} placeholderTextColor={colors.placeholder} />
      <TextInput style={styles.input} value={form.year} onChangeText={(year) => patch({ year })} placeholder={cfg.yearPlaceholder} placeholderTextColor={colors.placeholder} keyboardType="number-pad" />
      {cfg.showTires ? (
        <TextInput style={styles.input} value={form.tireNote} onChangeText={(tireNote) => patch({ tireNote })} placeholder={cfg.tireLabel} placeholderTextColor={colors.placeholder} />
      ) : null}
      {cfg.showPurchaseDate ? (
        <TextInput style={styles.input} value={form.purchaseKey} onChangeText={(purchaseKey) => patch({ purchaseKey })} placeholder="Kjøpsdato (ÅÅÅÅ-MM-DD)" placeholderTextColor={colors.placeholder} />
      ) : null}
      {cfg.showInsurance ? (
        <>
          <Text style={styles.fieldLabel}>Forsikringsselskap</Text>
          <TextInput style={styles.input} value={form.insuranceCompany} onChangeText={(insuranceCompany) => patch({ insuranceCompany })} placeholder="Forsikringsselskap" placeholderTextColor={colors.placeholder} />
        </>
      ) : null}
      {!!form.understellsnummer && (
        <Text style={styles.rowMeta}>VIN: {form.understellsnummer}</Text>
      )}
      <Text style={styles.fieldLabel}>Notater</Text>
      <TextInput
        style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]}
        value={form.notes}
        onChangeText={(notes) => patch({ notes })}
        placeholder="Notater (verksted, skader, nøkkel…)"
        placeholderTextColor={colors.placeholder}
        multiline
      />
    </View>
  );

  const renderPanelBody = () => {
    if (panel === 'create' || panel === 'basics') {
      return renderBasicsFields({ includeType: true });
    }
    if (panel === 'service') {
      return (
        <>
          <Mute>Registrer service uten å åpne hele skjemaet.</Mute>
          <TextInput style={styles.input} value={form.nextServiceKey} onChangeText={(nextServiceKey) => patch({ nextServiceKey })} placeholder={cfg.serviceNextLabel} placeholderTextColor={colors.placeholder} />
          <TextInput style={styles.input} value={form.lastServiceKey} onChangeText={(lastServiceKey) => patch({ lastServiceKey })} placeholder={cfg.serviceLastLabel} placeholderTextColor={colors.placeholder} />
        </>
      );
    }
    if (panel === 'deadlines') {
      return (
        <>
          {cfg.showMileage ? (
            <TextInput
              style={styles.input}
              value={form.mileageKm}
              onChangeText={(mileageKm) => patch({ mileageKm })}
              placeholder={cfg.mileagePlaceholder}
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
            />
          ) : null}
          {cfg.showInsurance ? (
            <TextInput style={styles.input} value={form.insuranceKey} onChangeText={(insuranceKey) => patch({ insuranceKey })} placeholder="Forsikring utløper (ÅÅÅÅ-MM-DD)" placeholderTextColor={colors.placeholder} />
          ) : null}
          {cfg.showEu ? (
            <TextInput style={styles.input} value={form.euControlKey} onChangeText={(euControlKey) => patch({ euControlKey })} placeholder="Neste EU-kontroll (ÅÅÅÅ-MM-DD)" placeholderTextColor={colors.placeholder} />
          ) : null}
        </>
      );
    }
    if (panel === 'document') {
      return (
        <>
          <Mute>Last opp kvittering, kjøpsbevis eller annen dokumentasjon (PDF/bilde). Bilder får auto-ramme som kan justeres før lagring.</Mute>
          <View style={styles.chipRow}>
            {HOLDING_DOC_KINDS.map((k) => (
              <TouchableOpacity
                key={k.id}
                style={[styles.fuelChip, docKind === k.id && styles.fuelChipOn]}
                onPress={() => setDocKind(k.id)}
              >
                <Text style={[styles.fuelChipTxt, docKind === k.id && styles.fuelChipTxtOn]}>
                  {k.emoji} {k.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {(form.documents || []).map((d) => (
            <View key={d.id} style={styles.docRow}>
              <TouchableOpacity
                style={{ flex: 1, minWidth: 0 }}
                onPress={() => d.downloadUrl && Linking.openURL(d.downloadUrl)}
                disabled={!d.downloadUrl}
              >
                <Text style={styles.docName} numberOfLines={1}>{d.name}</Text>
                <Text style={styles.rowMeta}>{docKindLabel(d.kind)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => patch({ documents: (form.documents || []).filter((x) => x.id !== d.id) })}
                hitSlop={8}
                accessibilityLabel={`Fjern ${d.name}`}
              >
                <Ionicons name="close" size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            style={[styles.secondaryBtn, { marginTop: 8, flex: 0 }]}
            onPress={uploadDocument}
            disabled={uploadingDoc}
          >
            {uploadingDoc ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Text style={styles.secondaryBtnTxt}>Last opp {docKindLabel(docKind).toLowerCase()}</Text>
            )}
          </TouchableOpacity>
        </>
      );
    }
    if (panel === 'log') {
      return (
        <>
          {(form.logs || []).slice().reverse().slice(0, 6).map((l) => (
            <View key={l.id} style={styles.logRow}>
              <Text style={styles.rowMeta}>
                {l.dateKey || '—'} · {VEHICLE_LOG_KINDS.find((k) => k.id === l.kind)?.label || l.kind}
                {l.amount != null && l.amount !== '' ? ` · ${l.amount} kr` : ''}
                {l.liters != null && l.liters !== '' ? ` · ${l.liters} l` : ''}
                {l.km != null && l.km !== '' ? ` · ${l.km} km` : ''}
              </Text>
              <TouchableOpacity
                onPress={() => patch({ logs: (form.logs || []).filter((x) => x.id !== l.id) })}
                hitSlop={8}
                accessibilityLabel="Fjern logg"
              >
                <Ionicons name="close" size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.chipRow}>
            {cfg.logKinds.map((k) => (
              <TouchableOpacity
                key={k.id}
                style={[styles.fuelChip, logDraft.kind === k.id && styles.fuelChipOn]}
                onPress={() => setLogDraft((s) => ({ ...s, kind: k.id }))}
              >
                <Text style={[styles.fuelChipTxt, logDraft.kind === k.id && styles.fuelChipTxtOn]}>{k.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={styles.input} value={logDraft.dateKey} onChangeText={(dateKey) => setLogDraft((s) => ({ ...s, dateKey }))} placeholder="Dato (ÅÅÅÅ-MM-DD)" placeholderTextColor={colors.placeholder} />
          <TextInput style={styles.input} value={logDraft.amount} onChangeText={(amount) => setLogDraft((s) => ({ ...s, amount }))} placeholder="Beløp (kr)" placeholderTextColor={colors.placeholder} keyboardType="numeric" />
          {logDraft.kind === 'fuel' ? (
            <>
              <TextInput style={styles.input} value={logDraft.liters} onChangeText={(liters) => setLogDraft((s) => ({ ...s, liters }))} placeholder="Liter (valgfritt)" placeholderTextColor={colors.placeholder} keyboardType="numeric" />
              <TextInput style={styles.input} value={logDraft.km} onChangeText={(km) => setLogDraft((s) => ({ ...s, km }))} placeholder="Km ved fylling (valgfritt)" placeholderTextColor={colors.placeholder} keyboardType="numeric" />
            </>
          ) : null}
          <TextInput style={styles.input} value={logDraft.note} onChangeText={(note) => setLogDraft((s) => ({ ...s, note }))} placeholder="Notat (stasjon, verksted…)" placeholderTextColor={colors.placeholder} />
        </>
      );
    }
    return null;
  };

  const renderDetail = () => {
    if (!detail) return null;
    const type = vehicleTypeMeta(detail);
    const typeCfg = vehicleFormConfig(detail.vehicleType);
    const deadlines = vehicleDeadlines(detail);
    const spent = vehicleLogTotal(detail.logs);
    const docs = Array.isArray(detail.documents) ? detail.documents : [];
    const logs = Array.isArray(detail.logs) ? detail.logs : [];

    return (
      <>
        <CompactBackLink label="Alle kjøretøy" onPress={() => setDetailId(null)} />
        <View style={styles.detailHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.detailTitle}>{detail.title}</Text>
            <Text style={styles.rowMeta}>{vehicleSummaryLine(detail) || type.label}</Text>
          </View>
          <TouchableOpacity
            style={styles.pencilBtn}
            onPress={() => openPanel('basics', detail)}
            accessibilityLabel="Rediger standard opplysninger"
          >
            <Ionicons name="pencil" size={18} color={colors.brand} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPendingDelete(detail)}
            hitSlop={8}
            accessibilityLabel={`Slett ${detail.title}`}
          >
            <Ionicons name="trash-outline" size={18} color="#b91c1c" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.photoBox}
          onPress={() => uploadVehiclePhoto(detail)}
          disabled={uploadingPhoto}
          accessibilityLabel={detail.photoUrl ? 'Bytt bilde' : 'Legg til bilde'}
        >
          {detail.photoUrl ? (
            <Image source={{ uri: detail.photoUrl }} style={styles.photoImg} resizeMode="cover" />
          ) : (
            <View style={styles.photoEmpty}>
              <Ionicons name="camera-outline" size={28} color={colors.brand} />
              <Text style={styles.photoEmptyTxt}>
                {uploadingPhoto ? 'Laster opp…' : 'Legg til bilde av kjøretøyet'}
              </Text>
            </View>
          )}
          {detail.photoUrl ? (
            <View style={styles.photoBadge}>
              <Ionicons name="camera" size={14} color="#fff" />
              <Text style={styles.photoBadgeTxt}>{uploadingPhoto ? '…' : 'Bytt'}</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Oversikt</Text>
          <FactRow label="Type" value={`${type.emoji} ${type.label}`} />
          {typeCfg.showMileage && detail.mileageKm != null ? (
            <FactRow
              label={typeCfg.mileageLabel}
              value={`${Number(detail.mileageKm).toLocaleString('nb-NO')}${detail.vehicleType === 'boat' ? ' timer' : ' km'}`}
            />
          ) : null}
          {typeCfg.showFuel && detail.fuelType ? (
            <FactRow label={typeCfg.fuelLabel} value={typeCfg.fuels.find((f) => f.id === detail.fuelType)?.label || detail.fuelType} />
          ) : null}
          <FactRow label="Forsikring" value={detail.insuranceCompany} />
          <FactRow label="Dekk" value={detail.tireNote} />
          <FactRow label="VIN" value={detail.understellsnummer} />
          <FactRow label="Notater" value={detail.notes} />
          {!detail.make && !detail.notes && detail.mileageKm == null && !detail.insuranceCompany ? (
            <Mute>Ingen standardopplysninger ennå — trykk blyanten for å legge til.</Mute>
          ) : null}
        </View>

        {deadlines.length ? (
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Frister</Text>
            {deadlines.map((d) => (
              <Text
                key={d.id}
                style={[
                  styles.deadlineLine,
                  d.tone === 'overdue' && styles.chipWarn,
                  d.tone === 'soon' && styles.chipSoon,
                ]}
              >
                {d.label}: {d.dateKey}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Dokumenter</Text>
          {docs.map((d) => (
            <TouchableOpacity
              key={d.id}
              style={styles.docRow}
              onPress={() => d.downloadUrl && Linking.openURL(d.downloadUrl)}
              disabled={!d.downloadUrl}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.docName} numberOfLines={1}>{d.name}</Text>
                <Text style={styles.rowMeta}>{docKindLabel(d.kind)}</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.brand} />
            </TouchableOpacity>
          ))}
          {!docs.length ? <Mute>Ingen kvitteringer ennå — bruk + for å legge til.</Mute> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{typeCfg.logSectionLabel}</Text>
          {logs.slice().reverse().slice(0, 10).map((l) => (
            <Text key={l.id} style={styles.listLine}>
              {l.dateKey || '—'} · {VEHICLE_LOG_KINDS.find((k) => k.id === l.kind)?.label || l.kind}
              {l.amount != null && l.amount !== '' ? ` · ${l.amount} kr` : ''}
            </Text>
          ))}
          {spent ? <Text style={styles.rowMeta}>{spent.toLocaleString('nb-NO')} kr totalt logget</Text> : null}
          {!logs.length ? <Mute>Ingen poster ennå — bruk + for drivstoff eller kostnad.</Mute> : null}
        </View>
      </>
    );
  };

  return (
    <Screen>
      <ModuleIntroHost scope="family" moduleId="holdings" />
      <ModulePageFrame name="holdings">
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.body, detail ? styles.bodyDetail : null]}
          keyboardShouldPersistTaps="handled"
        >
          {detail ? renderDetail() : (
            <>
              {!inShell ? <Text style={styles.title}>Kjøretøy</Text> : null}
              <Mute>{HOLDINGS_HUB_BLURB}</Mute>

              {upcoming.length ? (
                <View style={styles.deadlineBox}>
                  <Text style={styles.fieldLabel}>Neste frister</Text>
                  {upcoming.map((d) => (
                    <TouchableOpacity key={`${d.vehicleId}-${d.id}`} onPress={() => setDetailId(d.vehicleId)}>
                      <Text
                        style={[
                          styles.deadlineLine,
                          d.tone === 'overdue' && styles.chipWarn,
                          d.tone === 'soon' && styles.chipSoon,
                        ]}
                      >
                        {d.title}: {d.label} {d.dateKey}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {vehicles.map((h) => {
                const type = vehicleTypeMeta(h);
                const typeCfg = vehicleFormConfig(h.vehicleType);
                const eu = dueTone(h.euControlKey);
                const ins = dueTone(h.insuranceKey);
                const srv = dueTone(h.nextServiceKey);
                const spent = vehicleLogTotal(h.logs);
                const docs = Array.isArray(h.documents) ? h.documents.length : 0;
                return (
                  <View key={h.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row', gap: 10 }}
                        onPress={() => setDetailId(h.id)}
                      >
                        {h.photoUrl ? (
                          <Image source={{ uri: h.photoUrl }} style={styles.cardThumb} />
                        ) : (
                          <Text style={styles.emoji}>{type.emoji}</Text>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle}>{h.title}</Text>
                          <Text style={styles.rowMeta}>{vehicleSummaryLine(h) || 'Ingen detaljer ennå'}</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setPendingDelete(h)}
                        hitSlop={8}
                        accessibilityLabel={`Slett ${h.title}`}
                      >
                        <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => setDetailId(h.id)}>
                      <View style={styles.chipRow}>
                        {typeCfg.showMileage && h.mileageKm != null ? (
                          <Text style={styles.chip}>
                            {Number(h.mileageKm).toLocaleString('nb-NO')}
                            {h.vehicleType === 'boat' ? ' timer' : ' km'}
                          </Text>
                        ) : null}
                        {typeCfg.showFuel && h.fuelType ? (
                          <Text style={styles.chip}>
                            {typeCfg.fuels.find((f) => f.id === h.fuelType)?.label || h.fuelType}
                          </Text>
                        ) : null}
                        {h.insuranceCompany ? <Text style={styles.chip}>{h.insuranceCompany}</Text> : null}
                        {typeCfg.showEu && h.euControlKey ? (
                          <Text style={[styles.chip, eu === 'overdue' && styles.chipWarn, eu === 'soon' && styles.chipSoon]}>
                            EU {h.euControlKey}
                          </Text>
                        ) : null}
                        {h.insuranceKey ? (
                          <Text style={[styles.chip, ins === 'overdue' && styles.chipWarn, ins === 'soon' && styles.chipSoon]}>
                            Forsikring {h.insuranceKey}
                          </Text>
                        ) : null}
                        {h.nextServiceKey ? (
                          <Text style={[styles.chip, srv === 'overdue' && styles.chipWarn, srv === 'soon' && styles.chipSoon]}>
                            Service {h.nextServiceKey}
                          </Text>
                        ) : null}
                        {docs ? <Text style={styles.chip}>{docs} dokument{docs === 1 ? '' : 'er'}</Text> : null}
                        {spent ? <Text style={styles.chip}>{spent.toLocaleString('nb-NO')} kr logget</Text> : null}
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}

              {!vehicles.length ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTitle}>Ingen kjøretøy registrert</Text>
                  <Text style={styles.emptySub}>
                    Registrer bil, sykkel, båt eller annet — legg til bilde, service og kvittering etterpå.
                  </Text>
                </View>
              ) : null}
            </>
          )}
          <ModuleBgSpacer />
        </ScrollView>
      </ModulePageFrame>

      {detail && !panel ? (
        <Fab label="Registrer" onPress={() => setAddMenuOpen(true)} />
      ) : null}

      <PlusActionMenu
        visible={addMenuOpen}
        title="Hva vil du registrere?"
        subtitle={detail ? detail.title : undefined}
        items={addMenuItems}
        onClose={() => setAddMenuOpen(false)}
      />

      <Modal
        visible={!!panel}
        transparent
        animationType={isDesktop ? 'fade' : 'slide'}
        onRequestClose={closePanel}
      >
        <Pressable
          style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
          onPress={closePanel}
        >
          <Pressable
            style={[styles.modalSheet, isDesktop && [desktopSheet, styles.modalSheetDesk]]}
            onPress={(e) => e.stopPropagation?.()}
          >
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{panelTitle}</Text>
              {renderPanelBody()}
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={closePanel} disabled={saving}>
                  <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={savePanel} disabled={saving}>
                  <Text style={styles.primaryBtnTxt}>{saving ? 'Lagrer…' : 'Lagre'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmActionModal
        visible={!!pendingDelete}
        title="Fjerne kjøretøy?"
        body={`«${pendingDelete?.title || 'Kjøretøy'}» fjernes fra listen.`}
        confirmLabel="Fjern"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          await archiveHolding(familyId, pendingDelete.id);
          if (detailId === pendingDelete.id) setDetailId(null);
          setPendingDelete(null);
        }}
      />
      {cropModal}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, zIndex: 1, backgroundColor: 'transparent' },
  body: { padding: 16, paddingBottom: 40 },
  bodyDetail: { paddingBottom: 100 },
  title: { fontSize: 20, fontWeight: '500', color: colors.ink, marginBottom: 4 },
  detailHead: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8, marginBottom: 4,
  },
  detailTitle: { fontSize: 20, fontWeight: '500', color: colors.ink },
  pencilBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: colors.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  photoBox: {
    marginTop: 10, height: 180, borderRadius: 14, overflow: 'hidden',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  photoImg: { width: '100%', height: '100%' },
  photoEmpty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.brandSoft,
  },
  photoEmptyTxt: { color: colors.brand, fontWeight: '500', fontSize: 14 },
  photoBadge: {
    position: 'absolute', right: 10, bottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(15,23,42,0.72)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  photoBadgeTxt: { color: '#fff', fontSize: 12, fontWeight: '500' },
  factRow: { marginTop: 6 },
  factLabel: { color: colors.muted, fontSize: 11, fontWeight: '500' },
  factValue: { color: colors.ink, fontSize: 14, fontWeight: '400', marginTop: 1 },
  listLine: { color: colors.ink, marginTop: 4, fontWeight: '400', fontSize: 13 },
  card: {
    marginTop: 12, backgroundColor: colors.card, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: colors.line, gap: 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardThumb: { width: 44, height: 44, borderRadius: 10 },
  emoji: { fontSize: 22 },
  rowTitle: { fontWeight: '500', color: colors.ink, fontSize: 16 },
  rowMeta: { color: colors.muted, fontSize: 12, marginTop: 2, fontWeight: '400' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    fontSize: 11, fontWeight: '400', color: colors.ink, backgroundColor: colors.sunken,
    borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
  },
  chipWarn: { backgroundColor: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' },
  chipSoon: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', color: '#9a3412' },
  emptyBox: { marginTop: 28, alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  emptyTitle: { fontWeight: '500', fontSize: 17, color: colors.ink, textAlign: 'center' },
  emptySub: {
    color: colors.muted, fontWeight: '400', fontSize: 14, lineHeight: 20,
    textAlign: 'center', maxWidth: 360,
  },
  deadlineBox: {
    marginTop: 14, backgroundColor: colors.card, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: colors.line, gap: 4,
  },
  deadlineLine: {
    fontSize: 13, fontWeight: '400', color: colors.ink,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  typeHint: {
    marginTop: 8, marginBottom: 4, color: colors.ink, fontSize: 13, fontWeight: '400',
    lineHeight: 18, backgroundColor: colors.brandSoft, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  fieldLabel: {
    marginTop: 10, marginBottom: 6, color: colors.muted, fontWeight: '500',
    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  logRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginTop: 6,
  },
  docRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
    paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  docName: { color: colors.brand, fontWeight: '500', fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, paddingBottom: 28, maxHeight: '92%',
  },
  modalSheetDesk: {
    alignSelf: 'center', marginBottom: 0, maxWidth: 480, width: '100%',
    borderRadius: 12, padding: 18, maxHeight: '85%',
  },
  modalTitle: { fontSize: 17, fontWeight: '500', color: colors.ink, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12,
    backgroundColor: colors.card, color: colors.ink, fontSize: 15, marginTop: 8, fontWeight: '400',
  },
  fuelChip: {
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  fuelChipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  fuelChipTxt: { fontWeight: '400', color: colors.muted, fontSize: 13 },
  fuelChipTxtOn: { color: colors.brand, fontWeight: '500' },
  lookupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  lookupInput: { flex: 1, marginTop: 0 },
  lookupBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brand, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  lookupBtnDisabled: { opacity: 0.65 },
  lookupBtnTxt: { color: '#fff', fontWeight: '500', fontSize: 13 },
  lookupHint: {
    marginTop: 8, color: colors.muted, fontSize: 12, fontWeight: '400', lineHeight: 17,
  },
  lookupLink: {
    marginTop: 6, color: colors.brand, fontSize: 12, fontWeight: '500',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primaryBtn: {
    flex: 1, backgroundColor: colors.brand, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '500' },
  secondaryBtn: {
    flex: 1, backgroundColor: colors.brandSoft, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 44,
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '500' },
});
