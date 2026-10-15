import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AGREEMENT_CASE_KINDS, agreementTemplates } from '../../src/anbud/agreementCase';
import { askCompanyForm, FORM_IMPORT_ACCEPT, readFormImport } from '../../src/anbud/formImport';
import { saveFormTemplate } from '../../src/anbud/bidLibrary';
import { AGREEMENT_IMPORT_ACCEPT } from '../../src/anbud/openDocument';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { pickDocument } from '../../src/utils/media';
import AgreementCustomerField from './AgreementCustomerField';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* native */ }
}

const STEPS_UTKAST = ['path', 'kind', 'customer', 'template'];
const STEPS_INGATT = ['path', 'upload'];

function stepIndex(path, step) {
  const list = path === 'inngatt' ? STEPS_INGATT : STEPS_UTKAST;
  return Math.max(0, list.indexOf(step));
}

function stepCount(path) {
  return path === 'inngatt' ? STEPS_INGATT.length : STEPS_UTKAST.length;
}

function emptyDraft() {
  return {
    kind: 'oppdrag',
    customerId: '',
    customerName: '',
    email: '',
    parentId: '',
    templateId: '',
    templateTitle: '',
    createProject: false,
  };
}

async function bytesFromFile(file) {
  let blob = file?.blob || null;
  if (!blob && file?.uri && typeof fetch === 'function') {
    blob = await (await fetch(file.uri)).blob();
  }
  if (!blob || typeof blob.arrayBuffer !== 'function') return null;
  return new Uint8Array(await blob.arrayBuffer());
}

function ChoiceCard({ colors, title, hint, onPress, primary = false }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      style={[
        styles.choice,
        primary
          ? { backgroundColor: colors.brand, borderColor: colors.brand }
          : { backgroundColor: colors.card, borderColor: colors.line },
      ]}
    >
      <Text style={{ color: primary ? '#fff' : colors.ink, fontWeight: '600', fontSize: 16 }}>{title}</Text>
      {hint ? (
        <Text style={{ color: primary ? 'rgba(255,255,255,0.88)' : colors.muted, fontSize: 13, lineHeight: 18 }}>
          {hint}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

function Chip({ colors, label, on, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
    >
      <Text style={{ color: colors.ink, fontWeight: on ? '600' : '400' }}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * Stegvis popup for Ny avtale:
 * path → (inngått: upload) | (utkast: type → kunde → mal)
 */
export default function AgreementCreateWizard({
  visible,
  colors,
  companyId,
  people = [],
  contracts = [],
  seed = null,
  onClose,
  onCompleteInngatt,
  onCompleteUtkast,
  onOpenFormBuilder,
}) {
  const [step, setStep] = useState('path');
  const [path, setPath] = useState('');
  const [draft, setDraft] = useState(emptyDraft);
  const [state, setState] = useState(null);
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [noteBad, setNoteBad] = useState(false);
  const [allowDismiss, setAllowDismiss] = useState(false);

  const templates = useMemo(() => agreementTemplates(state), [state]);
  const parents = useMemo(
    () => [...(state?.agreementCases || []), ...(contracts || [])].filter((row) => row.kind === 'rammeavtale' && !row.deletedAt),
    [state, contracts],
  );

  useEffect(() => {
    if (!visible || !companyId) return undefined;
    let live = true;
    loadAnbudState(companyId).then((loaded) => { if (live) setState(loaded); });
    return () => { live = false; };
  }, [visible, companyId]);

  useEffect(() => {
    if (!visible) {
      setAllowDismiss(false);
      return undefined;
    }
    const id = setTimeout(() => setAllowDismiss(true), 350);
    return () => clearTimeout(id);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (seed && typeof seed === 'object') {
      setPath(seed.path || 'utkast');
      setStep(seed.step || 'template');
      setDraft({ ...emptyDraft(), ...(seed.draft || {}) });
      setFiles(Array.isArray(seed.files) ? seed.files : []);
      setNote(seed.note || '');
      setNoteBad(false);
      return;
    }
    setPath('');
    setStep('path');
    setDraft(emptyDraft());
    setFiles([]);
    setNote('');
    setNoteBad(false);
    setBusy(false);
  }, [visible, seed]);

  function say(text, bad = false) {
    setNote(text);
    setNoteBad(bad);
  }

  function dismiss() {
    if (!allowDismiss || busy) return;
    onClose?.();
  }

  function choosePath(next) {
    setPath(next);
    setStep(next === 'inngatt' ? 'upload' : 'kind');
    say('');
  }

  function back() {
    if (busy) return;
    if (step === 'path') {
      onClose?.();
      return;
    }
    if (path === 'inngatt') {
      setStep('path');
      setPath('');
      return;
    }
    const order = STEPS_UTKAST;
    const index = order.indexOf(step);
    if (index <= 1) {
      setStep('path');
      setPath('');
      return;
    }
    setStep(order[index - 1]);
  }

  async function addPicks(picked) {
    const list = (Array.isArray(picked) ? picked : (picked ? [picked] : [])).filter(Boolean);
    if (!list.length) return;
    setFiles((current) => {
      const names = new Set(current.map((row) => row.name));
      const extra = list.filter((row) => row?.name && !names.has(row.name));
      return [...current, ...extra].slice(0, 12);
    });
    say(`${list.length} dokument${list.length === 1 ? '' : 'er'} lagt til.`);
  }

  async function pickUploadFiles() {
    const picked = await pickDocument({ accept: AGREEMENT_IMPORT_ACCEPT, multiple: true });
    await addPicks(picked);
  }

  function removeFile(name) {
    setFiles((current) => current.filter((row) => row.name !== name));
  }

  async function finishInngatt() {
    if (!files.length) {
      say('Last opp minst ett avtaledokument.', true);
      return;
    }
    setBusy(true);
    try {
      await onCompleteInngatt?.({ files });
      onClose?.();
    } catch (error) {
      say(error?.message || 'Kunne ikke starte registreringen.', true);
    } finally {
      setBusy(false);
    }
  }

  async function finishUtkast() {
    if (!draft.templateId) {
      say('Velg eller lag en avtalemal før du fortsetter.', true);
      return;
    }
    setBusy(true);
    try {
      await onCompleteUtkast?.({ draft: { ...draft } });
      onClose?.();
    } catch (error) {
      say(error?.message || 'Kunne ikke åpne utkastet.', true);
    } finally {
      setBusy(false);
    }
  }

  function openNewTemplate() {
    onOpenFormBuilder?.({
      mode: 'blank',
      returnDraft: {
        wizardPath: 'utkast',
        wizardStep: 'template',
        ...draft,
      },
    });
    onClose?.();
  }

  async function importTemplateFile() {
    setBusy(true);
    say('');
    try {
      const picked = await pickDocument({ accept: FORM_IMPORT_ACCEPT });
      const file = Array.isArray(picked) ? picked[0] : picked;
      if (!file) return;
      const bytes = await bytesFromFile(file);
      if (!bytes?.length) {
        say('Kunne ikke lese filen.', true);
        return;
      }
      const interpreted = await readFormImport(bytes, file.name || 'mal.pdf', {
        ask: (payload) => askCompanyForm(payload.bytes, payload.filename, file.mimeType || ''),
      });
      const form = {
        ...interpreted.form,
        category: 'avtale',
        title: interpreted.form?.title || file.name?.replace(/\.[^.]+$/, '') || 'Avtalemal',
        id: '',
      };
      const before = new Set((state?.formTemplates || []).map((row) => row.id));
      const result = saveFormTemplate(state, form);
      if (!result.ok) {
        say(result.error || 'Kunne ikke lagre malen.', true);
        return;
      }
      const savedState = await saveAnbudState(result.state, companyId);
      setState(savedState);
      const saved = (savedState.formTemplates || []).find((row) => row.category === 'avtale' && !before.has(row.id))
        || (savedState.formTemplates || []).find((row) => row.title === form.title);
      if (!saved) {
        say('Malen ble lest, men ble ikke lagret.', true);
        return;
      }
      setDraft((current) => ({
        ...current,
        templateId: saved.id,
        templateTitle: saved.title,
      }));
      say(`Malen «${saved.title}» er lagret som avtalemal. Fortsett for å låse utkastet.`);
    } catch (error) {
      say(error?.message || 'Kunne ikke tolke malen.', true);
    } finally {
      setBusy(false);
    }
  }

  const progress = path
    ? `Steg ${stepIndex(path, step) + 1} av ${stepCount(path)}`
    : 'Steg 1';

  const title = step === 'path'
    ? 'Ny avtale'
    : step === 'upload'
      ? 'Last opp avtaledokumenter'
      : step === 'kind'
        ? 'Velg avtaletype'
        : step === 'customer'
          ? 'Registrer kunde'
          : 'Velg avtalemal';

  const body = (
    <View style={[styles.card, { backgroundColor: colors.card }]} accessibilityRole="dialog" accessibilityViewIsModal>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={back} accessibilityRole="button" disabled={busy}>
          <Text style={{ color: colors.brand }}>{step === 'path' ? 'Lukk' : 'Tilbake'}</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{progress}</Text>
      </View>
      <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand }}>{note}</Text>}

      {step === 'path' ? (
        <View style={styles.stack}>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            Velg om avtalen allerede er inngått, eller om dere skal behandle et nytt utkast med motparten.
          </Text>
          <ChoiceCard
            colors={colors}
            primary
            title="Registrer inngått"
            hint="Last opp alle avtaledokumentene. Feltene fylles ut til gjennomgang og godkjenning."
            onPress={() => choosePath('inngatt')}
          />
          <ChoiceCard
            colors={colors}
            title="Registrering nytt utkast"
            hint="Velg type, kunde og avtalemal. Utkastet sendes mellom partene i ProTop."
            onPress={() => choosePath('utkast')}
          />
        </View>
      ) : null}

      {step === 'upload' ? (
        <View style={styles.stack}>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            Last opp alle avtaledokumentene. Deretter åpnes registreringssiden ferdig utfylt til gjennomgang.
          </Text>
          <View
            {...(Platform.OS === 'web' ? {
              onDragEnter: (event) => { event.preventDefault?.(); setDragOver(true); },
              onDragOver: (event) => { event.preventDefault?.(); setDragOver(true); },
              onDragLeave: () => setDragOver(false),
              onDrop: (event) => {
                event.preventDefault?.();
                setDragOver(false);
                const list = Array.from(event?.dataTransfer?.files || []).map((file) => ({
                  name: file.name,
                  mimeType: file.type || 'application/octet-stream',
                  size: file.size || 0,
                  blob: file,
                }));
                if (list.length) addPicks(list);
              },
            } : {})}
            style={[
              styles.drop,
              {
                borderColor: dragOver ? colors.brand : colors.line,
                backgroundColor: dragOver ? colors.sunken : colors.bg,
              },
            ]}
          >
            <Ionicons name="cloud-upload-outline" size={28} color={colors.brand} />
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Slipp dokumenter her</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>PDF, Word eller bilde</Text>
            <TouchableOpacity
              onPress={pickUploadFiles}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.primary, { backgroundColor: colors.brand }]}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Velg filer</Text>
            </TouchableOpacity>
          </View>
          {files.length ? (
            <View style={styles.stack}>
              {files.map((file) => (
                <View key={file.name} style={styles.fileRow}>
                  <Text style={{ color: colors.ink, flex: 1 }} numberOfLines={1}>{file.name}</Text>
                  <TouchableOpacity onPress={() => removeFile(file.name)} accessibilityRole="button">
                    <Text style={{ color: colors.muted }}>Fjern</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: colors.muted }}>Ingen dokumenter er valgt ennå.</Text>
          )}
          <TouchableOpacity
            onPress={finishInngatt}
            disabled={busy || !files.length}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: files.length ? colors.brand : colors.muted }]}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>{busy ? 'Åpner…' : 'Fullfør og gjennomgå'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {step === 'kind' ? (
        <View style={styles.stack}>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>Hvilken type avtale skal behandles?</Text>
          {AGREEMENT_CASE_KINDS.map((item) => (
            <ChoiceCard
              key={item.id}
              colors={colors}
              primary={draft.kind === item.id}
              title={item.label}
              onPress={() => setDraft((current) => ({ ...current, kind: item.id, parentId: item.id === 'avrop' ? current.parentId : '' }))}
            />
          ))}
          {draft.kind === 'avrop' ? (
            <View style={styles.stack}>
              <Text style={{ color: colors.muted }}>Knytt avropet til en rammeavtale</Text>
              <View style={styles.wrap}>
                {parents.map((item) => (
                  <Chip
                    key={item.id}
                    colors={colors}
                    label={item.title}
                    on={draft.parentId === item.id}
                    onPress={() => setDraft((current) => ({ ...current, parentId: item.id }))}
                  />
                ))}
              </View>
              {!parents.length ? <Text style={{ color: colors.muted }}>Ingen rammeavtale er registrert ennå.</Text> : null}
            </View>
          ) : null}
          <TouchableOpacity
            onPress={() => {
              if (draft.kind === 'avrop' && !draft.parentId) {
                say('Velg rammeavtalen avropet hører til.', true);
                return;
              }
              setStep('customer');
              say('');
            }}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: colors.brand }]}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Neste</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {step === 'customer' ? (
        <View style={styles.stack}>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            Velg kunde og e-post til motparten. Opplysningene fylles inn i avtalen automatisk.
          </Text>
          <AgreementCustomerField
            colors={colors}
            customers={state?.customers || []}
            customerId={draft.customerId}
            companyId={companyId}
            people={people}
            onSelect={(customer) => setDraft((current) => {
              const previous = (state?.customers || []).find((row) => row.id === current.customerId);
              const email = customer
                ? (customer.email || '')
                : (previous?.email && current.email === previous.email ? '' : current.email);
              return {
                ...current,
                customerId: customer?.id || '',
                customerName: customer?.name || '',
                email,
              };
            })}
            onSavedState={(saved) => setState(saved)}
          />
          <TextInput
            value={draft.email}
            onChangeText={(email) => setDraft((current) => ({ ...current, email }))}
            placeholder="E-post til motpart"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <TouchableOpacity
            onPress={() => setDraft((current) => ({ ...current, createProject: !current.createProject }))}
            accessibilityRole="button"
          >
            <Text style={{ color: colors.ink }}>
              {draft.createProject ? 'Prosjekt opprettes sammen med avtalen' : 'Opprett også prosjekt'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (!draft.customerId) {
                say('Velg en kunde for å gå videre.', true);
                return;
              }
              if (!String(draft.email || '').trim()) {
                say('Fyll inn e-post til motpart.', true);
                return;
              }
              setStep('template');
              say('');
            }}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: colors.brand }]}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Neste</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {step === 'template' ? (
        <View style={styles.stack}>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            Velg hvordan avtalemalen skal komme på plass. Bare maler merket som avtalemal i skjemabyggeren vises her.
          </Text>
          <ChoiceCard
            colors={colors}
            title="Opprett ny fra begynnelsen"
            hint="Åpner skjemabyggeren. Lagre malen der for å fortsette her."
            onPress={openNewTemplate}
          />
          <ChoiceCard
            colors={colors}
            title="Last opp og tolk mal"
            hint="PDF, Word eller bilde. AI bygger en avtalemal du kan bruke videre."
            onPress={importTemplateFile}
          />
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Eksisterende avtalemaler</Text>
          {templates.length ? (
            <View style={styles.wrap}>
              {templates.map((item) => (
                <Chip
                  key={item.id}
                  colors={colors}
                  label={`${item.title} · ${item.fields?.length || 0} felt`}
                  on={draft.templateId === item.id}
                  onPress={() => setDraft((current) => ({
                    ...current,
                    templateId: item.id,
                    templateTitle: item.title,
                  }))}
                />
              ))}
            </View>
          ) : (
            <Text style={{ color: colors.muted }}>
              Ingen avtalemaler ennå. Opprett ny, last opp, eller merk en mal som avtalemal under Skjema.
            </Text>
          )}
          <TouchableOpacity
            onPress={finishUtkast}
            disabled={busy || !draft.templateId}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: draft.templateId ? colors.brand : colors.muted }]}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>{busy ? 'Åpner…' : 'Fortsett til utkast'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  if (!visible) return null;

  if (Platform.OS === 'web' && typeof document !== 'undefined' && document.body && createPortal) {
    return createPortal(
      <div style={webPortalStyle}>
        <div role="presentation" onClick={dismiss} style={webBackdropStyle} />
        <div role="dialog" onClick={(event) => event.stopPropagation()} style={webDialogStyle}>
          {body}
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <View style={styles.nativeRoot}>
        <Pressable style={styles.nativeBackdrop} onPress={dismiss} />
        <View style={styles.nativeCenter} pointerEvents="box-none">
          {body}
        </View>
      </View>
    </Modal>
  );
}

const webPortalStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 2147483646,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};
const webBackdropStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(26, 39, 68, 0.55)',
};
const webDialogStyle = {
  position: 'relative',
  zIndex: 1,
  width: '100%',
  maxWidth: 520,
  maxHeight: '90vh',
  overflow: 'auto',
};

const styles = StyleSheet.create({
  nativeRoot: { flex: 1 },
  nativeBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 39, 68, 0.5)',
  },
  nativeCenter: { flex: 1, justifyContent: 'center', padding: 20 },
  card: {
    borderRadius: 18,
    padding: 18,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    gap: 12,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  stack: { gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  drop: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 18,
    gap: 8,
    alignItems: 'center',
  },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  primary: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
