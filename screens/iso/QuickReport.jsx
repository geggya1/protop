/**
 * «Meld RUH»: hurtigmelding fra telefonen på byggeplass (ISO-03).
 *
 *   1. Trykk «Meld RUH»   2. Velg type   3. Skriv eller snakk, og trykk «Send» (foto er valgfritt)
 *
 * Prosjektet fylles inn fra siste timeføring. Meldingen lagres uten at hele ISO lastes,
 * og legges i en lokal kø når nettet er borte. QuickReportButton er selvstendig og kan
 * legges på bedriftens forside eller i docken; den trenger bare AppContext og tilgang.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState, Image, Linking, Platform, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { addDays, todayKey } from '../../src/iso/core';
import { QUICK_TYPES, lastProjectFromHours, projectLabel, quickTypeLabel } from '../../src/iso/quickReport';
import { findingStateLabel, findingTypeLabel } from '../../src/iso/catalog';
import { prettyDate } from '../../src/iso/core';
import { loadMyReports } from '../../src/iso/storage';
import { ensureProjectHours, peekProjectState } from '../../src/project/storage';
import { pickableProjects } from '../../src/project/myProjects';
import { flushQueue, onQueueChange, readQueue, submitQuick } from './quickSend';
import { pickQuickPhoto } from './quickPhoto';
import { Banner, Btn, Check, Choice, ListRow, Pill, Row, Sheet } from './isoUi';

/** Antall meldinger i køen, og sending når nettet kommer tilbake (nettleser: «online», telefon: appen åpnes). */
export function useQuickQueue(companyId, uid, { onSent } = {}) {
  const [count, setCount] = useState(0);
  const busy = useRef(false);
  const sentRef = useRef(onSent);
  sentRef.current = onSent;
  const flush = useCallback(async () => {
    if (!companyId || !uid || busy.current) return;
    busy.current = true;
    try {
      const res = await flushQueue(companyId, uid);
      setCount(res.left);
      if (res.sent.length) sentRef.current?.(res.sent);
    } finally {
      busy.current = false;
    }
  }, [companyId, uid]);
  useEffect(() => {
    if (!companyId || !uid) return undefined;
    let live = true;
    readQueue(companyId, uid).then((list) => { if (live) setCount(list.length); });
    flush();
    const off = onQueueChange((c, u, n) => { if (c === companyId && u === uid) setCount(n); });
    const sub = AppState.addEventListener?.('change', (s) => { if (s === 'active') flush(); });
    const online = () => flush();
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('online', online);
    return () => {
      live = false;
      off();
      sub?.remove?.();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('online', online);
    };
  }, [companyId, uid, flush]);
  // Ligger det noe i køen, prøves det igjen hvert minutt.
  useEffect(() => {
    if (!count) return undefined;
    const t = setInterval(flush, 60000);
    return () => clearInterval(t);
  }, [count, flush]);
  return { count, flush };
}

/** Tale til tekst i nettleseren (Chrome, Edge, Safari). På telefon brukes mikrofonen på tastaturet. */
function useDictation(onText) {
  const [listening, setListening] = useState(false);
  const rec = useRef(null);
  const Speech = Platform.OS === 'web' && typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;
  const stop = useCallback(() => { try { rec.current?.stop(); } catch { /* ignorer */ } setListening(false); }, []);
  const start = useCallback(() => {
    if (!Speech) return;
    try {
      const r = new Speech();
      r.lang = 'nb-NO';
      r.interimResults = false;
      r.continuous = true;
      r.onresult = (e) => {
        const said = Array.from(e.results).slice(e.resultIndex).map((x) => x[0]?.transcript || '').join(' ').trim();
        if (said) onText(said);
      };
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      rec.current = r;
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [Speech, onText]);
  useEffect(() => () => stop(), [stop]);
  return { supported: !!Speech, listening, start, stop };
}

function TypeTile({ type, onPress, colors }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Meld ${type.label}`}
      nativeID={`quick-type-${type.id}`}
      style={{
        flexGrow: 1, flexBasis: '46%', minHeight: 84, gap: 4, padding: 12, borderRadius: 14, borderWidth: 1,
        borderColor: type.id === 'hms' ? `${colors.danger}66` : colors.line, backgroundColor: type.id === 'hms' ? `${colors.danger}10` : colors.bg,
        justifyContent: 'center',
      }}
    >
      <Ionicons name={type.icon} size={24} color={type.id === 'hms' ? colors.danger : colors.brand} />
      <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 15 }}>{type.label}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{type.hint}</Text>
    </TouchableOpacity>
  );
}

/**
 * Mine meldinger (ISO-04): sakene personen selv har meldt, med status. Virker også uten ISO-tilgang
 * (innleide og eksterne). Anonyme meldinger er ikke med; de er ikke knyttet til noen.
 */
export function MyReports({ companyId, uid, limit = 0, stamp = 0, title = 'Mine meldinger' }) {
  const colors = useColors();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    if (!companyId || !uid) return undefined;
    loadMyReports(companyId, uid).then((list) => { if (live) setRows(list); });
    return () => { live = false; };
  }, [companyId, uid, stamp]);
  if (!rows) return <Text style={{ color: colors.muted, fontSize: 12 }}>Henter meldingene dine …</Text>;
  const list = limit ? rows.slice(0, limit) : rows;
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: colors.ink, fontWeight: '700' }}>{title}{rows.length ? ` (${rows.length})` : ''}</Text>
      {!rows.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>Du har ikke meldt noe ennå.</Text> : null}
      {list.map((f) => (
        <ListRow
          key={f.id}
          icon={f.restricted ? 'lock-closed-outline' : 'flag-outline'}
          title={`${f.number || ''} · ${f.title || ''}`}
          subtitle={[findingTypeLabel(f.type), prettyDate(f.reportedAt), f.assigneeName ? `behandles av ${f.assigneeName}` : ''].filter(Boolean).join(' · ')}
          right={<Pill label={findingStateLabel(f.state)} tone={f.state === 'lukket' ? 'ok' : 'info'} />}
        />
      ))}
      {limit && rows.length > limit ? <Text style={{ color: colors.muted, fontSize: 12 }}>{`${rows.length - limit} eldre meldinger vises under Mine meldinger i ISO.`}</Text> : null}
    </View>
  );
}

/**
 * Selve skjemaet. companyId, actor ({ uid, name }), employee (ansattposten, for prosjekt fra timeføring),
 * employees og allProjects (Admin på Prosjekt ser alle prosjekter i velgeren).
 */
export function QuickReportSheet({
  visible, onClose, companyId, actor, employee = null, employees = [], allProjects = false, onSent = null, allowAnonymous = true,
}) {
  const colors = useColors();
  const [type, setType] = useState('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState([]);
  const [project, setProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [pickProject, setPickProject] = useState(false);
  const [serious, setSerious] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const append = useCallback((said) => setBody((cur) => (cur ? `${cur.trimEnd()} ${said}` : said)), []);
  const dictation = useDictation(append);

  useEffect(() => {
    if (!visible) { dictation.stop(); return; }
    setType(''); setBody(''); setPhotos([]); setSerious(false); setAnonymous(false); setError(''); setDone(null); setPickProject(false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prosjektet fra siste timeføring (45 dager). Bare personens egne timer hentes.
  useEffect(() => {
    if (!visible || !companyId) return undefined;
    let live = true;
    const apply = (state) => {
      if (!live || !state) return;
      const list = pickableProjects(state, employee, employees, { all: allProjects });
      setProjects(list);
      const last = lastProjectFromHours(state.timeEntries, employee?.id, list);
      setProject((cur) => cur || last);
    };
    apply(peekProjectState(companyId));
    if (employee?.id) {
      ensureProjectHours(companyId, { employeeId: employee.id, fromDate: addDays(todayKey(), -45) }).then(apply).catch(() => {});
    }
    return () => { live = false; };
  }, [visible, companyId, employee?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addPhoto(camera) {
    setError('');
    try {
      const p = await pickQuickPhoto({ camera });
      if (p) setPhotos((cur) => [...cur, p].slice(0, 2));
    } catch (e) {
      setError(e?.message === 'camera-denied' ? 'Appen har ikke tilgang til kameraet.' : 'Kunne ikke hente bildet.');
    }
  }

  async function send() {
    if (busy) return;
    dictation.stop();
    setBusy(true);
    setError('');
    const res = await submitQuick(companyId, {
      type, text: body, projectId: project?.id || '', projectName: project?.label || '', serious, anonymous, photos,
    }, { actor });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setDone(res);
    if (res.sent) onSent?.([res.sent]);
  }

  const chosen = QUICK_TYPES.find((t) => t.id === type);
  let content;
  if (done) {
    content = (
      <View style={{ gap: 12 }}>
        {done.sent ? (
          <Banner
            tone="ok"
            text={`Sendt som ${done.sent.number}.${done.assigneeName ? ` ${done.assigneeName} behandler saken.` : ' Saken behandles av den som har ansvaret for avvik.'}${done.photoFailed ? ' Ett bilde kunne ikke lastes opp.' : ''}${anonymous ? ' Navnet ditt er ikke lagret.' : ''}`}
          />
        ) : (
          <Banner tone="warn" icon="cloud-offline-outline" text={`Ingen nett. Meldingen er lagret på telefonen og sendes automatisk når du har dekning (${done.count} i kø).`} />
        )}
        <Row>
          <Btn kind="primary" icon="add" label="Meld en til" onPress={() => { setDone(null); setType(''); setBody(''); setPhotos([]); setSerious(false); }} />
          <Btn label="Lukk" onPress={onClose} />
        </Row>
      </View>
    );
  } else if (!chosen) {
    content = (
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Hva vil du melde? Resten tar behandleren seg av.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {QUICK_TYPES.map((t) => <TypeTile key={t.id} type={t} colors={colors} onPress={() => setType(t.id)} />)}
        </View>
        <MyReports companyId={companyId} uid={actor?.uid} limit={3} />
      </View>
    );
  } else {
    content = (
      <View style={{ gap: 12 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={6}><Ionicons name={chosen.icon} size={18} color={colors.brand} /><Text style={{ color: colors.ink, fontWeight: '700' }}>{chosen.label}</Text></Row>
          <Btn small label="Endre type" onPress={() => setType('')} />
        </Row>
        {type === 'hms' ? (
          <View style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.danger }}>
            <Text style={{ color: colors.danger, fontWeight: '800' }}>Alvorlig skade? Ring 113 først.</Text>
            <Row>
              <Btn kind="danger" icon="call-outline" label="Ring 113" onPress={() => Linking.openURL('tel:113').catch(() => {})} />
              <Check label="Alvorlig personskade (varsles straks)" value={serious} onChange={setSerious} />
            </Row>
          </View>
        ) : null}
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Hva skjedde?</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            autoFocus
            placeholder="Skriv kort, eller trykk mikrofonen og snakk"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Hva skjedde"
            nativeID="quick-text"
            style={{ minHeight: 110, borderWidth: 1, borderRadius: 12, borderColor: colors.line, backgroundColor: colors.bg, color: colors.ink, padding: 12, fontSize: 16, textAlignVertical: 'top' }}
          />
          {dictation.supported ? (
            <Btn small icon={dictation.listening ? 'stop-circle-outline' : 'mic-outline'} label={dictation.listening ? 'Stopp opptak' : 'Snakk'} onPress={dictation.listening ? dictation.stop : dictation.start} />
          ) : (
            <Text style={{ color: colors.muted, fontSize: 12 }}>Vil du heller snakke? Trykk mikrofonen på tastaturet.</Text>
          )}
        </View>
        <Row>
          <Btn icon="camera-outline" label={photos.length ? 'Ta et bilde til' : 'Ta bilde'} onPress={() => addPhoto(true)} disabled={photos.length >= 2} />
          {Platform.OS === 'web' ? null : <Btn icon="image-outline" label="Velg bilde" onPress={() => addPhoto(false)} disabled={photos.length >= 2} />}
          {photos.map((p, i) => (
            <TouchableOpacity key={i} onPress={() => setPhotos((cur) => cur.filter((_, j) => j !== i))} accessibilityLabel="Fjern bildet">
              <Image source={{ uri: p.uri }} style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: colors.line }} />
            </TouchableOpacity>
          ))}
        </Row>
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {project ? `Prosjekt: ${project.label}${project.auto === false ? '' : ' (fra siste timeføring)'}` : 'Ingen prosjekt valgt.'}
          </Text>
          {pickProject && projects.length ? (
            <Choice
              small
              title="Prosjekt"
              clearable
              options={projects.map((p) => ({ id: p.id, label: projectLabel(p) }))}
              value={project?.id || ''}
              onChange={(id) => { const p = projects.find((x) => x.id === id); setProject(p ? { id: p.id, label: projectLabel(p), auto: false } : null); }}
            />
          ) : (projects.length ? <Btn small label="Endre prosjekt" onPress={() => setPickProject(true)} /> : null)}
        </View>
        {allowAnonymous ? (
          <Check label="Meld anonymt (navnet ditt lagres ikke, og du kan ikke følge saken)" value={anonymous} onChange={setAnonymous} />
        ) : null}
        {error ? <Banner tone="danger" text={error} /> : null}
      </View>
    );
  }

  return (
    <Sheet
      visible={visible}
      title={done ? 'Takk for meldingen' : (chosen ? `Meld ${quickTypeLabel(type).toLowerCase()}` : 'Meld RUH')}
      onClose={onClose}
      footer={!done && chosen ? (
        <>
          <Btn label="Avbryt" onPress={onClose} />
          <Btn kind="primary" icon="send" label="Send" busy={busy} onPress={send} disabled={!body.trim() && !photos.length} />
        </>
      ) : null}
    >
      {content}
    </Sheet>
  );
}

/**
 * Snarveien «Meld RUH». Selvstendig: henter selskap, bruker og ansattpost selv, og sender køen
 * når nettet er tilbake. variant 'tile' (forside og dock) eller 'button' (inne i en side).
 */
export default function QuickReportButton({ variant = 'tile', label = 'Meld RUH', onSent = null }) {
  const colors = useColors();
  const { familyId, uid, activeProfile, user } = useApp();
  const access = useCompanyAccess();
  const [open, setOpen] = useState(false);
  const actor = useMemo(() => ({
    uid: uid || '',
    name: String(activeProfile?.name || activeProfile?.displayName || user?.displayName || '').trim() || 'Bruker',
  }), [uid, activeProfile?.name, activeProfile?.displayName, user?.displayName]);
  const queue = useQuickQueue(familyId, uid, { onSent });
  if (!familyId || !uid) return null;
  const allProjects = !!access.bypass || (!!access.ready && !!access.canAdmin?.('projects'));
  const sheet = (
    <QuickReportSheet
      visible={open}
      onClose={() => setOpen(false)}
      companyId={familyId}
      actor={actor}
      employee={access.employee}
      employees={access.employees || []}
      allProjects={allProjects}
      onSent={onSent}
    />
  );
  const waiting = queue.count ? ` · ${queue.count} venter på nett` : '';
  if (variant === 'button') {
    return (
      <>
        <Btn kind="danger" icon="warning-outline" label={`${label}${waiting}`} onPress={() => setOpen(true)} />
        {sheet}
      </>
    );
  }
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        nativeID="quick-report"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: `${colors.danger}55`, backgroundColor: `${colors.danger}10`, minHeight: 56 }}
      >
        <Ionicons name="warning-outline" size={22} color={colors.danger} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 15 }}>{label}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{queue.count ? `${queue.count} melding${queue.count === 1 ? '' : 'er'} venter på nett` : 'Avvik, nestenulykke eller skade – tre trykk'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </TouchableOpacity>
      {sheet}
    </>
  );
}
