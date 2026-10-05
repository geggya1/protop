import React, { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  BID_STEPS,
  GROUND_FOLDER_ID,
  addBidFile,
  addBidQuestion,
  answerBidQuestion,
  childFolders,
  createBidFolder,
  deleteBidFile,
  deleteBidFolder,
  filesInFolder,
  pullFormTemplate,
  setFormStatus,
  setFormValue,
  updateBidAssignment,
} from '../../src/anbud/bidLibrary';
import {
  awardContract,
  executionBlockers,
  markOutcome,
  openExecution,
  regulatoryChecks,
  STAGE_LABELS,
  STRATEGY_ITEMS,
  toggleStrategy,
} from '../../src/anbud/lifecycle';
import {
  deadlineInfo,
  formatNoticeText,
  officialNoticeUrl,
  sourceLabel,
} from '../../src/anbud/noticeText';
import { pickDocument } from '../../src/utils/media';
import FormAnswer from './FormAnswer';

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function payloadFromPicked(picked) {
  let blob = picked?.blob || null;
  if (!blob && picked?.uri && typeof fetch === 'function') {
    const res = await fetch(picked.uri);
    blob = await res.blob();
  }
  const name = picked?.name || 'Fil';
  const mimeType = blob?.type || picked?.mimeType || 'application/octet-stream';
  const size = blob?.size || picked?.size || 0;
  if (!blob || size > 480000) {
    return { name, mimeType, size, status: 'for-stor' };
  }
  const dataUrl = await readAsDataUrl(blob);
  return { name, mimeType, size, dataUrl, status: 'lastet' };
}

function openStoredFile(file) {
  if (file?.dataUrl) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(file.dataUrl, '_blank', 'noopener,noreferrer');
    else Linking.openURL(file.dataUrl).catch(() => {});
    return;
  }
  if (file?.text && Platform.OS === 'web' && typeof window !== 'undefined') {
    const blob = new Blob([file.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (file?.url) Linking.openURL(file.url).catch(() => {});
}

function statusLabel(file) {
  if (file.status === 'lastet') return 'Lastet ned';
  if (file.status === 'for-stor') return 'For stor til å lagres';
  if (file.status === 'portal') return 'Krever innlogging på portalen';
  return 'Lenke';
}

function toneColor(tone, colors) {
  if (tone === 'danger') return colors.danger;
  if (tone === 'warn') return colors.warn || colors.danger;
  if (tone === 'brand') return colors.brand;
  return colors.ink;
}

export default function BidWorkspace({
  bid, state, colors, busy, note, onBack, onCommit, onRefresh, members = [], units = [], companies = [],
}) {
  const [step, setStep] = useState('grunnlag');
  const [folderId, setFolderId] = useState(null);
  const [folderName, setFolderName] = useState('');
  const [question, setQuestion] = useState('');
  const [openFileId, setOpenFileId] = useState('');
  const [value, setValue] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [localNote, setLocalNote] = useState('');

  if (!bid) {
    return (
      <View style={{ gap: 8 }}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Tilbake til tilbudene</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.muted }}>Tilbudet er ikke tilgjengelig.</Text>
      </View>
    );
  }

  const dossier = bid.dossier || {};
  const stage = bid.stage || 'planlegging';
  const locked = stage === 'kontrakt' || stage === 'tapt' || stage === 'trukket';
  const folder = folderId ? bid.folders.find((row) => row.id === folderId) : null;
  const message = localNote || note;
  const deadline = deadlineInfo(dossier.submissionDeadline || bid.deadline);
  const notice = (state?.notices || []).find((row) => row.id === bid.noticeId) || null;
  const noticeUrl = officialNoticeUrl({
    ...(notice || {}),
    id: bid.noticeId || notice?.id,
    source: notice?.source || bid.source,
    url: notice?.url || dossier.noticeUrl || dossier.documentsUrl,
    dossier,
  });
  const source = sourceLabel(notice || { source: /^\d{4}-\d+$/.test(String(bid.noticeId || '')) ? 'doffin' : 'ted' });

  async function commit(result) {
    setLocalNote('');
    await onCommit(result);
  }

  async function addFolder() {
    const result = createBidFolder(state, bid.id, { name: folderName, parentId: folder?.locked ? null : folderId });
    if (!result.ok) {
      setLocalNote(result.error);
      return;
    }
    setFolderName('');
    await commit(result);
  }

  async function upload() {
    if (!folder || folder.locked) return;
    setLocalNote('');
    const picked = await pickDocument({ accept: '.pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,application/pdf,image/*' });
    const file = Array.isArray(picked) ? picked[0] : picked;
    if (!file) return;
    let payload;
    try {
      payload = await payloadFromPicked(file);
    } catch (err) {
      setLocalNote(err?.message || 'Kunne ikke lese filen.');
      return;
    }
    if (payload.status === 'for-stor') {
      setLocalNote('Filen er over 500 KB og blir ikke lagret i tilbudet. Bruk en mindre fil.');
      return;
    }
    await commit(addBidFile(state, bid.id, folder.id, payload));
  }

  async function attachToField(form, field) {
    setLocalNote('');
    const picked = await pickDocument({
      accept: field.kind === 'image' ? 'image/*' : '.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,application/pdf,image/*',
    });
    const file = Array.isArray(picked) ? picked[0] : picked;
    if (!file) return;
    let payload;
    try {
      payload = await payloadFromPicked(file);
    } catch (err) {
      setLocalNote(err?.message || 'Kunne ikke lese filen.');
      return;
    }
    if (payload.status === 'for-stor') {
      setLocalNote('Filen er over 500 KB og blir ikke lagret i skjemaet. Bruk en mindre fil.');
      return;
    }
    await commit(setFormValue(state, bid.id, form.id, field.id, {
      name: payload.name,
      mimeType: payload.mimeType,
      dataUrl: payload.dataUrl,
    }));
  }

  return (
    <View style={{ gap: 12 }}>
      <TouchableOpacity onPress={onBack} accessibilityRole="button">
        <Text style={{ color: colors.brand }}>Alle tilbud</Text>
      </TouchableOpacity>
      <DeadlineBanner deadline={deadline} colors={colors} />
      <Text style={[styles.h, { color: colors.ink }]}>{bid.title}</Text>
      <Text style={{ color: colors.ink }}>{bid.buyer || 'Oppdragsgiver ikke oppgitt'}</Text>
      <Text style={{ color: colors.brand, fontWeight: '600' }}>{STAGE_LABELS[stage] || 'Planlegging'}</Text>
      {noticeUrl ? (
        <TouchableOpacity onPress={() => Linking.openURL(noticeUrl)} accessibilityRole="link">
          <Text style={{ color: colors.brand }}>Åpne på {source}</Text>
        </TouchableOpacity>
      ) : null}
      <AssignmentPanel
        bid={bid}
        state={state}
        colors={colors}
        locked={locked}
        members={members}
        units={units}
        companies={companies}
        onCommit={commit}
      />
      <View style={styles.row}>
        {BID_STEPS.map((item) => {
          const on = step === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => { setStep(item.id); setFolderId(null); setOpenFileId(''); }}
              accessibilityRole="button"
              style={[styles.step, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
            >
              <Text style={{ color: colors.ink, fontWeight: on ? '600' : '400' }}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!!message && <Text style={{ color: colors.brand }}>{message}</Text>}
      {step === 'grunnlag' ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Konkurransegrunnlaget</Text>
          <Line label="Tilbudsfrist" value={dossier.submissionDeadline} colors={colors} />
          <Line label="Frist for spørsmål" value={dossier.questionDeadline} colors={colors} />
          <Line label="Prosedyre" value={dossier.procedure} colors={colors} />
          {dossier.description ? <FoldedText text={formatNoticeText(dossier.description)} colors={colors} /> : null}
          <TouchableOpacity onPress={onRefresh} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>{busy ? 'Henter dokumenter …' : 'Hent dokumenter på nytt'}</Text>
          </TouchableOpacity>
          <FileList
            files={filesInFolder(bid.files, GROUND_FOLDER_ID)}
            colors={colors}
            openFileId={openFileId}
            onOpen={setOpenFileId}
          />
        </View>
      ) : null}
      {step === 'qa' ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Spørsmål og svar i konkurransen</Text>
          <TouchableOpacity onPress={onRefresh} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>{busy ? 'Henter …' : 'Hent publiserte svar på nytt'}</Text>
          </TouchableOpacity>
          {dossier.qa?.length ? dossier.qa.map((row) => (
            <View key={`${row.question}-${row.answer}`} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.question}</Text>
              <Text style={{ color: colors.ink }}>{row.answer || 'Svaret er ikke publisert ennå.'}</Text>
            </View>
          )) : <Text style={{ color: colors.muted }}>Ingen spørsmål og svar er publisert i kunngjøringen ennå.</Text>}
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Egne spørsmål</Text>
          {(bid.questions || []).map((row) => (
            <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink }}>{row.question}</Text>
              <TextInput
                value={row.answer}
                onChangeText={(answer) => commit(answerBidQuestion(state, bid.id, row.id, answer))}
                placeholder="Svar fra oppdragsgiver"
                placeholderTextColor={colors.placeholder}
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              />
            </View>
          ))}
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Nytt spørsmål til oppdragsgiver"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <TouchableOpacity
            onPress={() => {
              const result = addBidQuestion(state, bid.id, question);
              if (!result.ok) {
                setLocalNote(result.error);
                return;
              }
              setQuestion('');
              commit(result);
            }}
            accessibilityRole="button"
            style={[styles.btn, { backgroundColor: colors.brand }]}
          >
            <Text style={{ color: '#fff' }}>Legg til spørsmål</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {step === 'arbeid' ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Dokumentmappe</Text>
          <Text style={{ color: colors.muted }}>
            Opprett en mappe, åpne den og last opp filer. Konkurransegrunnlaget ligger i egen mappe og oppdateres fra kunngjøringen.
          </Text>
          {folder ? (
            <TouchableOpacity onPress={() => setFolderId(folder.parentId || null)} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>{folder.parentId ? 'Tilbake' : 'Alle mapper'}</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={{ color: colors.ink }}>{folder ? folder.name : 'Mapper'}</Text>
          {(folder ? childFolders(bid.folders, folder.id) : bid.folders.filter((row) => !row.parentId)).map((row) => (
            <TouchableOpacity
              key={row.id}
              onPress={() => setFolderId(row.id)}
              accessibilityRole="button"
              style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}
            >
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.emoji || '📁'} {row.name}</Text>
              <Text style={{ color: colors.muted }}>{filesInFolder(bid.files, row.id).length} filer</Text>
            </TouchableOpacity>
          ))}
          {folder ? (
            <FileList
              files={filesInFolder(bid.files, folder.id)}
              colors={colors}
              openFileId={openFileId}
              onOpen={setOpenFileId}
              onDelete={folder.locked ? null : ((fileId) => commit(deleteBidFile(state, bid.id, fileId)))}
            />
          ) : null}
          {!folder?.locked ? (
            <View style={{ gap: 8 }}>
              <TextInput
                value={folderName}
                onChangeText={setFolderName}
                placeholder={folder ? 'Ny undermappe' : 'Ny mappe'}
                placeholderTextColor={colors.placeholder}
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
              />
              <View style={styles.row}>
                <TouchableOpacity onPress={addFolder} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
                  <Text style={{ color: '#fff' }}>Opprett mappe</Text>
                </TouchableOpacity>
                {folder ? (
                  <TouchableOpacity onPress={upload} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
                    <Text style={{ color: '#fff' }}>Last opp fil</Text>
                  </TouchableOpacity>
                ) : null}
                {folder ? (
                  <TouchableOpacity onPress={() => { setFolderId(folder.parentId || null); commit(deleteBidFolder(state, bid.id, folder.id)); }} accessibilityRole="button">
                    <Text style={{ color: colors.danger }}>Slett mappe</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : (
            <Text style={{ color: colors.muted }}>Filene her oppdateres når grunnlaget hentes på nytt.</Text>
          )}
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Skjema fra bedriften</Text>
          {(state.formTemplates || []).map((template) => (
            <View key={template.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink }}>{template.title}</Text>
              <Text style={{ color: colors.muted }}>{template.intro}</Text>
              <TouchableOpacity onPress={() => commit(pullFormTemplate(state, bid.id, template.id))} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Hent inn og arbeid</Text>
              </TouchableOpacity>
            </View>
          ))}
          {(bid.forms || []).map((form) => (
            <View key={form.id} style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{form.title}</Text>
              <Text style={{ color: colors.muted }}>{form.status === 'ferdig' ? 'Ferdig' : 'Under arbeid'}</Text>
              {form.fields.map((field) => (
                <FormAnswer
                  key={field.id}
                  field={field}
                  colors={colors}
                  onChange={(next) => commit(setFormValue(state, bid.id, form.id, field.id, next))}
                  onPickFile={() => attachToField(form, field)}
                />
              ))}
              <TouchableOpacity
                onPress={() => commit(setFormStatus(state, bid.id, form.id, form.status === 'ferdig' ? 'apent' : 'ferdig'))}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.brand }}>{form.status === 'ferdig' ? 'Åpne igjen' : 'Merk ferdig'}</Text>
              </TouchableOpacity>
            </View>
          ))}
          <ExecutionPanel
            bid={bid}
            state={state}
            colors={colors}
            locked={locked}
            value={value}
            start={start}
            end={end}
            setValue={setValue}
            setStart={setStart}
            setEnd={setEnd}
            onCommit={commit}
          />
        </View>
      ) : null}
    </View>
  );
}

function DeadlineBanner({ deadline, colors }) {
  const color = toneColor(deadline.tone, colors);
  const urgent = deadline.tone === 'danger' || deadline.tone === 'warn';
  return (
    <View
      style={[styles.deadlineBanner, {
        borderColor: color,
        backgroundColor: urgent ? colors.brandSoft : colors.card,
      }]}
      accessibilityRole="summary"
      accessibilityLabel={`${deadline.headline}. ${deadline.detail}`}
    >
      <Text style={{ color, fontSize: 28, fontWeight: '700', lineHeight: 32 }}>{deadline.headline}</Text>
      <Text style={{ color: colors.ink, fontSize: 15 }}>{deadline.detail}</Text>
      {deadline.daysLeft != null && deadline.daysLeft >= 0 && deadline.daysLeft <= 7 ? (
        <Text style={{ color, fontWeight: '600' }}>Fristen nærmer seg — prioriter dette tilbudet.</Text>
      ) : null}
    </View>
  );
}

function AssignmentPanel({ bid, state, colors, locked, members, units, companies, onCommit }) {
  const interest = bid.interest || {};
  const assignment = bid.assignment || {};
  const people = (members || []).filter((row) => row.role !== 'child');
  const unitRows = units || [];
  const companyRows = (companies || []).filter((row) => row.id && row.id !== state?.companyId);

  function assignPerson(person) {
    onCommit(updateBidAssignment(state, bid.id, {
      personId: person.id || person.uid || '',
      personName: person.name || '',
    }));
  }

  function assignUnit(unit) {
    onCommit(updateBidAssignment(state, bid.id, {
      unitId: unit.id,
      unitName: unit.name,
      unitKind: unit.kind || '',
      companyId: unit.companyId || '',
      companyName: unit.kind === 'underenhet' ? unit.name : assignment.companyName,
    }));
  }

  function assignCompany(company) {
    onCommit(updateBidAssignment(state, bid.id, {
      companyId: company.id,
      companyName: company.name,
      unitId: '',
      unitName: '',
      unitKind: '',
    }));
  }

  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, gap: 8 }]}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Tildeling og interesse</Text>
      <Text style={{ color: colors.muted }}>
        {interest.contactName || interest.username
          ? `Interesse meldt av ${[interest.contactName, interest.username].filter(Boolean).join(' · ')}${interest.registeredAt ? ` (${String(interest.registeredAt).slice(0, 10)})` : ''}.`
          : 'Ingen har meldt interesse via portalen ennå. Merking som aktuell lagres på tilbudet.'}
      </Text>
      {assignment.personName || assignment.unitName || assignment.companyName ? (
        <Text style={{ color: colors.ink }}>
          Tildelt:
          {assignment.personName ? ` ${assignment.personName}` : ''}
          {assignment.unitName ? ` · ${assignment.unitName}` : ''}
          {assignment.companyName ? ` · ${assignment.companyName}` : ''}
        </Text>
      ) : (
        <Text style={{ color: colors.muted }}>Ikke tildelt ennå.</Text>
      )}
      {!locked ? (
        <View style={{ gap: 8 }}>
          {people.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>Person i selskapet</Text>
              <View style={styles.row}>
                {people.map((person) => {
                  const on = assignment.personId === (person.id || person.uid);
                  return (
                    <TouchableOpacity
                      key={person.id || person.uid}
                      onPress={() => assignPerson(person)}
                      accessibilityRole="button"
                      style={[styles.chip, { backgroundColor: on ? colors.brand : colors.sunken }]}
                    >
                      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 13 }}>{person.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
          {unitRows.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>Avdeling eller underenhet</Text>
              <View style={styles.row}>
                {unitRows.map((unit) => {
                  const on = assignment.unitId === unit.id;
                  const label = unit.kind === 'underenhet' ? `${unit.name} (selskap)` : `${unit.name} (avdeling)`;
                  return (
                    <TouchableOpacity
                      key={unit.id}
                      onPress={() => assignUnit(unit)}
                      accessibilityRole="button"
                      style={[styles.chip, { backgroundColor: on ? colors.brand : colors.sunken }]}
                    >
                      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 13 }}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
          {companyRows.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>Annet selskap i konsernet</Text>
              <View style={styles.row}>
                {companyRows.map((company) => {
                  const on = assignment.companyId === company.id;
                  return (
                    <TouchableOpacity
                      key={company.id}
                      onPress={() => assignCompany(company)}
                      accessibilityRole="button"
                      style={[styles.chip, { backgroundColor: on ? colors.brand : colors.sunken }]}
                    >
                      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 13 }}>{company.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
          {!people.length && !unitRows.length && !companyRows.length ? (
            <Text style={{ color: colors.muted }}>
              Legg til medlemmer eller underenheter i selskapet for å tildele tilbudsarbeidet.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ExecutionPanel({ bid, state, colors, locked, value, start, end, setValue, setStart, setEnd, onCommit }) {
  const stage = bid.stage || 'planlegging';
  const checks = regulatoryChecks(bid);
  const blockers = stage === 'planlegging' ? executionBlockers(bid) : [];
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Status i konkurransen</Text>
      {STRATEGY_ITEMS.map((item) => {
        const on = !!bid.strategy?.[item.id];
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onCommit(toggleStrategy(state, bid.id, item.id))}
            disabled={locked}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled: locked }}
          >
            <Text style={{ color: on ? colors.ink : colors.muted }}>{on ? '✓' : '○'} {item.label}</Text>
          </TouchableOpacity>
        );
      })}
      {checks.map((check) => (
        <Text key={check.id} style={{ color: check.ok ? colors.ink : (check.blocking ? colors.danger : colors.warn) }}>
          {check.ok ? '✓' : '·'} {check.label}: {check.detail}
        </Text>
      ))}
      {stage === 'planlegging' ? (
        <View style={{ gap: 6 }}>
          {blockers.length ? <Text style={{ color: colors.muted }}>Gjenstår før gjennomføring: {blockers.join(' · ')}</Text> : null}
          <TouchableOpacity onPress={() => onCommit(openExecution(state, bid.id))} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff' }}>Start gjennomføring</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {stage === 'gjennomforing' ? (
        <View style={{ gap: 6 }}>
          <TextInput value={value} onChangeText={setValue} placeholder="Kontraktssum" placeholderTextColor={colors.placeholder} keyboardType="decimal-pad" style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]} />
          <TextInput value={start} onChangeText={setStart} placeholder="Oppstart ÅÅÅÅ-MM-DD" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]} />
          <TextInput value={end} onChangeText={setEnd} placeholder="Overlevering ÅÅÅÅ-MM-DD" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]} />
          <TouchableOpacity onPress={() => onCommit(awardContract(state, bid.id, { value, start, end }))} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff' }}>Registrer kontrakt</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!locked && (stage === 'planlegging' || stage === 'gjennomforing') ? (
        <View style={styles.row}>
          <TouchableOpacity onPress={() => onCommit(markOutcome(state, bid.id, 'tapt'))} accessibilityRole="button">
            <Text style={{ color: colors.danger }}>Tapt</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onCommit(markOutcome(state, bid.id, 'trukket'))} accessibilityRole="button">
            <Text style={{ color: colors.muted }}>Trukket</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function FileList({ files, colors, openFileId, onOpen, onDelete }) {
  if (!files.length) return <Text style={{ color: colors.muted }}>Ingen filer i denne mappen.</Text>;
  return (
    <View style={{ gap: 6 }}>
      {files.map((file) => {
        const open = openFileId === file.id;
        return (
          <View key={file.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <TouchableOpacity onPress={() => onOpen(open ? '' : file.id)} accessibilityRole="button">
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{file.name}</Text>
              <Text style={{ color: colors.muted }}>{statusLabel(file)}{file.sizeLabel ? ` · ${file.sizeLabel}` : ''}</Text>
            </TouchableOpacity>
            {open && file.text ? <FoldedText text={formatNoticeText(file.text)} colors={colors} limit={700} /> : null}
            <View style={styles.row}>
              {file.status === 'lastet' || file.url ? (
                <TouchableOpacity onPress={() => openStoredFile(file)} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>{file.status === 'portal' || file.status === 'lenke' ? 'Åpne på portalen' : 'Åpne fil'}</Text>
                </TouchableOpacity>
              ) : null}
              {onDelete ? (
                <TouchableOpacity onPress={() => onDelete(file.id)} accessibilityRole="button">
                  <Text style={{ color: colors.danger }}>Slett</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function FoldedText({ text, colors, limit = 280 }) {
  const [open, setOpen] = useState(false);
  const value = String(text || '');
  const long = value.length > limit;
  const shown = open || !long ? value : `${value.slice(0, limit).trim()} …`;
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.ink, lineHeight: 22 }}>{shown}</Text>
      {long ? (
        <TouchableOpacity onPress={() => setOpen((current) => !current)} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>{open ? 'Vis mindre' : 'Vis hele teksten'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Line({ label, value, colors }) {
  if (!value) return null;
  return <Text style={{ color: colors.ink }}>{label}: {value}</Text>;
}

const styles = StyleSheet.create({
  h: { fontSize: 22, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  step: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  long: { minHeight: 80, textAlignVertical: 'top' },
  deadlineBanner: { borderWidth: 2, borderRadius: 14, padding: 14, gap: 4 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
});
