/**
 * Dokumenter den ansatte skal lese, bekrefte eller signere. Vises på Min side.
 * Påkrevde dokumenter står øverst til de er bekreftet. Til informasjon kan bekreftes frivillig.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { READ_RULES, ackFor, documentsForEmployee, latestAck, todayKey } from '../../src/doccontrol/model';
import { handbookFromControl } from '../../src/doccontrol/content';
import { formFromControl } from '../../src/doccontrol/templates';
import { completeFilledDoc, newFilledDoc, reopenFilledDoc } from '../../src/forms/filledDocs';
import { loadFilledDocs, peekFilledDocs, saveFilledDoc } from '../../src/forms/filledStore';
import { closeDocTask } from '../../src/doccontrol/store';
import { docTaskId } from '../../src/doccontrol/readTasks';
import { formWithTokens } from '../../src/forms/tokens';
import { FOCUS_FIELD_BG, FOCUS_FIELD_BORDER, FOCUS_FIELD_INK } from '../../src/forms/highlight';
import { showSaveToast } from '../../src/ui/saveToast';
import { HrButton, HrCard, HrSectionTitle } from '../hr/HrShared';
import { HandbookReader } from '../hr/HrHandbook';
import FormFill from '../anbud/FormFill';
import { formPrintHtml, printForm } from '../anbud/formPrint';
import { useDocControl } from './useDocControl';
import { CommentComposer, SelectionBar, useSelectionCapture } from './DocComments';
import { OK_INK, dateText } from './parts';

function TemplatePreview({ form, logo, company, colors }) {
  if (Platform.OS !== 'web') {
    return <HrButton colors={colors} icon="document-outline" label="Åpne dokumentet" onPress={() => printForm(form, logo, { company, highlight: false })} />;
  }
  return (
    <View style={[styles.frame, { borderColor: colors.line }]}>
      {React.createElement('iframe', {
        title: form.title,
        srcDoc: formPrintHtml(form, logo, { preview: true, company, highlight: false }),
        style: { width: '100%', height: '100%', border: 0, backgroundColor: '#e6ebf1' },
      })}
    </View>
  );
}

function ruleLabel(id) {
  return READ_RULES.find((row) => row.id === id)?.label || '';
}

export default function MyDocuments({ colors, employeeId, employeeName = '', self = true }) {
  const dc = useDocControl();
  const { familyId, actor, company, logo } = dc;
  const [filled, setFilled] = useState(() => (peekFilledDocs(familyId) || []).filter((row) => row.scope === 'hr'));
  const [openKey, setOpenKey] = useState('');
  const [fillDoc, setFillDoc] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [composing, setComposing] = useState(null);
  const [picked, setPicked] = useSelectionCapture(dc.canComment && openKey === 'handbook');

  useEffect(() => {
    let live = true;
    loadFilledDocs(familyId).then((list) => { if (live) setFilled(list.filter((row) => row.scope === 'hr')); });
    return () => { live = false; };
  }, [familyId]);

  const uid = self ? actor.uid : '';
  const rows = useMemo(
    () => documentsForEmployee(dc.controls, { acks: dc.acks, filled, uid, employeeId }),
    [dc.controls, dc.acks, filled, uid, employeeId],
  );
  const missing = rows.filter((row) => row.required && !row.done).length;
  const logoUrl = logo?.dataUrl || '';

  if (!rows.length) return null;

  async function acknowledge(row) {
    setBusy(true);
    const res = await dc.acknowledge(ackFor(row.control.id, row.revision, { uid: actor.uid, employeeId, name: actor.name || employeeName }));
    setBusy(false);
    setNote(res.ok ? '' : res.error);
    if (res.ok) {
      showSaveToast('Takk, bekreftelsen er lagret.');
      closeDocTask(familyId, { id: docTaskId(row.control.id, employeeId) }, { today: todayKey() });
    }
  }

  async function storeFilled(next, message) {
    setBusy(true);
    const res = await saveFilledDoc(familyId, next);
    setBusy(false);
    if (res.list) setFilled(res.list.filter((row) => row.scope === 'hr'));
    setFillDoc(res.doc || next);
    setNote(res.ok ? message : res.error);
    if (res.ok) showSaveToast(message);
  }

  function startSigning(row) {
    if (row.doc) {
      setFillDoc(row.doc);
      return;
    }
    const form = formFromControl(row.control);
    if (!form) return;
    setFillDoc(newFilledDoc(form, { actor, scope: 'hr', subject: { kind: 'employee', id: employeeId, name: employeeName || actor.name } }));
  }

  if (fillDoc) {
    return (
      <FormFill
        doc={fillDoc}
        colors={colors}
        company={company}
        logo={logoUrl}
        actor={actor}
        busy={busy}
        note={note}
        onChange={self ? setFillDoc : () => {}}
        onSave={() => storeFilled(fillDoc, 'Dokumentet er lagret.')}
        onComplete={() => {
          const res = completeFilledDoc(formWithTokens(fillDoc, company), { actor });
          if (!res.ok) setNote(res.error);
          else {
            storeFilled(res.doc, 'Dokumentet er signert og lagret i HR.');
            const control = rows.find((row) => row.control.refId === res.doc.templateId)?.control;
            if (control) closeDocTask(familyId, { id: docTaskId(control.id, employeeId) }, { today: todayKey() });
          }
        }}
        onReopen={() => storeFilled(reopenFilledDoc(fillDoc, { actor }), 'Dokumentet er åpnet for endring.')}
        onDelete={null}
        onBack={() => { setFillDoc(null); setNote(''); }}
        backLabel="Mine dokumenter"
      />
    );
  }

  return (
    <HrCard colors={colors}>
      <HrSectionTitle
        colors={colors}
        title="Dokumenter å lese"
        subtitle={missing ? `${missing} påkrevde gjenstår` : 'Alle påkrevde dokumenter er lest og bekreftet'}
      />
      {!!note && <Text style={{ color: colors.danger }}>{note}</Text>}
      {rows.map((row) => {
        const { control } = row;
        const isOpen = openKey === control.id;
        const book = control.kind === 'handbook' ? handbookFromControl(control) : null;
        const form = control.kind === 'template' && control.readRule !== 'signeres' && isOpen ? formFromControl(control) : null;
        const tone = row.done ? OK_INK : row.required ? FOCUS_FIELD_INK : colors.muted;
        return (
          <View key={control.id} style={[styles.doc, { borderColor: row.required && !row.done ? FOCUS_FIELD_BORDER : colors.line, backgroundColor: row.required && !row.done ? FOCUS_FIELD_BG : 'transparent' }]}>
            <TouchableOpacity onPress={() => setOpenKey(isOpen ? '' : control.id)} accessibilityRole="button" accessibilityLabel={`Åpne ${control.title}`} style={styles.head}>
              <Ionicons name={row.done ? 'checkmark-circle' : row.required ? 'alert-circle-outline' : 'document-text-outline'} size={20} color={tone} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{control.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {[control.code, `versjon ${row.revision}`, ruleLabel(control.readRule)].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={{ color: tone, fontSize: 13 }}>
                {row.done
                  ? (control.readRule === 'signeres' ? 'Signert' : `Bekreftet ${dateText(row.ack?.at)}`)
                  : row.ack ? `Har lest versjon ${row.ack.revision}` : (row.required ? 'Mangler' : 'Ikke lest')}
              </Text>
            </TouchableOpacity>
            {isOpen ? (
              <View style={{ gap: 10 }}>
                {book ? (
                  <HandbookReader
                    colors={colors}
                    book={book}
                    company={company}
                    ack={latestAck(dc.acks, control.id, { uid, employeeId })}
                    onAck={self ? () => acknowledge(row) : null}
                    busy={busy}
                    comments={dc.comments.filter((item) => item.docKey === control.id)}
                    onComment={self && dc.canComment ? setComposing : null}
                  />
                ) : null}
                {form ? <TemplatePreview form={form} logo={logoUrl} company={company} colors={colors} /> : null}
                {form && self && !row.done ? (
                  <HrButton
                    colors={colors}
                    primary={row.required}
                    icon="checkmark-done"
                    label={busy ? 'Lagrer …' : `Jeg har lest og forstått versjon ${row.revision}`}
                    onPress={() => acknowledge(row)}
                    disabled={busy}
                  />
                ) : null}
                {control.readRule === 'signeres' ? (
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: colors.muted }}>
                      {row.done ? 'Du har fylt ut og signert dokumentet. Det ligger i HR.' : 'Fyll ut og signer dokumentet. Det lagres i HR med begrenset tilgang.'}
                    </Text>
                    {self || row.doc ? (
                      <HrButton colors={colors} primary={!row.done} icon={row.done ? 'eye-outline' : 'create-outline'} label={row.done ? 'Vis dokumentet' : (row.doc ? 'Fortsett utfylling' : 'Fyll ut og signer')} onPress={() => startSigning(row)} />
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {composing ? (
        <CommentComposer colors={colors} dc={dc} control={dc.controlFor('handbook')} draft={composing} onClose={() => { setComposing(null); setPicked(null); }} />
      ) : (
        <SelectionBar colors={colors} picked={self && dc.canComment ? picked : null} onComment={() => setComposing(picked)} onClear={() => setPicked(null)} />
      )}
    </HrCard>
  );
}

const styles = StyleSheet.create({
  doc: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  frame: { height: 640, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
});
