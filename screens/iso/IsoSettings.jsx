import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { auditEvent, bump, nowIso, prettyDate } from '../../src/iso/core';
import { DEFAULT_RISK_METHOD, ISO_ROLES, STANDARDS, STANDARD_EDITIONS, standardEdition, standardLabel } from '../../src/iso/catalog';
import { allRequirements, markForReassessment, requirementIdsForArea } from '../../src/iso/requirements';
import { setupDefaultsFromCompany } from '../../src/iso/integrations';
import {
  APPROVER_ROLES, approverUidsFromRoles, employeeForRole, employeeIsoRank, recommendedRoleAccess, roleAccessCheck, restrictedUids,
} from '../../src/iso/access';
import { aclFor } from '../../src/iso/aclSync';
import { roleOwnerFixes } from '../../src/iso/roles';
import { ensureAccessMirror, loadIsoSystem, saveRestrictedGrants } from '../../src/iso/storage';
import { checkPersonChange } from '../../src/access/accessCeiling';
import { saveEmployee } from '../../src/employees/storage';
import { STARTER_OPTIONS, runStarterKit } from './starterKit';
import IsoImport from './IsoImport';
import BrandBusyOverlay from '../../components/BrandBusyOverlay';
import { normalizeDocStructure } from '../../src/iso/documents';
import { editionChanges, mergeOwnChanges, settingsKey } from '../../src/iso/settingsSave';
import { normalizeSystem } from '../../src/iso/state';
import { normalizeCompanyPage, shownAbout } from '../../src/project/companyPage';
import {
  Banner, Btn, Card, Check, Choice, Field, KV, ListRow, Page, PersonPick, Pill, Row, TextIn,
} from './isoUi';

function bumpVersion(v) {
  const [a, b] = String(v || '1.0').split('.').map((n) => Number(n) || 0);
  return `${a}.${b + 1}`;
}

/** Foreslå roller ut fra tittel i ansattregisteret. */
function suggestRoles(people) {
  const find = (re) => people.find((p) => p.own !== false && re.test(p.title || ''));
  const out = {};
  const pairs = [
    ['top_management', /daglig leder|ceo|adm\.? dir|administrerende/i],
    ['quality_manager', /kvalitet|ks-?leder|qa/i],
    ['hse_manager', /hms|sikkerhet|verne/i],
    ['project_manager', /prosjektleder/i],
    ['internal_auditor', /revisor|kvalitet/i],
    ['hr_manager', /\bhr\b|personal/i],
    ['safety_rep', /verneombud|tillitsvalgt/i],
  ];
  for (const [role, re] of pairs) {
    const p = find(re);
    if (p) out[role] = { name: p.name, uid: p.uid, label: ISO_ROLES.find((r) => r.id === role)?.label };
  }
  return out;
}

const DRAFT_PREFIX = 'protop.iso.setupDraft.v1.';
const AUTOSAVE_MS = 900;

/** Feil som hindrer lagring. Tom streng når alt er i orden. */
function settingsError(v) {
  if (!(v.standards || []).length) return 'Velg minst én standard.';
  if (!String(v.scopeText || '').trim()) return 'Beskriv omfanget av ledelsessystemet.';
  if (!String(v.ownerName || '').trim()) return 'Velg systemansvarlig.';
  const t = v.riskMethod?.thresholds || DEFAULT_RISK_METHOD.thresholds;
  if (!(t.medium > 0 && t.high > t.medium && t.critical > t.high && t.critical <= 25)) return 'Risikoterskler må være stigende og høyst 25.';
  return '';
}

async function readDraft(companyId) {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_PREFIX + companyId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDraft(companyId, v) {
  try {
    AsyncStorage.setItem(DRAFT_PREFIX + companyId, JSON.stringify(v)).catch(() => {});
  } catch {
    // Utkastet er en bekvemmelighet. Skjemaet virker uten.
  }
}

function clearDraft(companyId) {
  try {
    AsyncStorage.removeItem(DRAFT_PREFIX + companyId).catch(() => {});
  } catch {
    // Se over.
  }
}

export default function IsoSettings({ ctx }) {
  const colors = useColors();
  const { state, caps, actor, store, wide, people, sources, requestTab, companyId, go } = ctx;
  const sys = state.system;
  const first = !sys.setupAt;
  const defaults = useMemo(() => setupDefaultsFromCompany(sources.company, { employees: sources.employees }), [sources.company, sources.employees]);
  const [v, setV] = useState(sys);
  const [starter, setStarter] = useState(Object.fromEntries(STARTER_OPTIONS.map((o) => [o.id, true])));
  const [msg, setMsg] = useState('');
  const [log, setLog] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyNote, setBusyNote] = useState('');
  // Autolagring: idle | pending | saving | saved | invalid | error
  const [saveState, setSaveState] = useState('idle');
  const [saveNote, setSaveNote] = useState('');
  const vRef = useRef(v);
  vRef.current = v;
  const sysRef = useRef(sys);
  sysRef.current = sys;
  // Importkortet står på samme sted hele tiden. Flytter det seg når oppsettet blir aktivert
  // midt i en import, mister det fremdriften og feilmeldingene.
  const importAtTop = useRef(first);
  if (first) importAtTop.current = true;
  const edited = useRef(false);
  const timer = useRef(null);
  const chain = useRef(Promise.resolve());
  const draftLoaded = useRef(false);
  // Lagringen leser disse via ref, så den ikke lages på nytt hver gang ISO-siden tegnes
  // (da startet autolagringen på nytt for hver lagring).
  const live = useRef({});
  live.current = { store, actor, companyId };

  // Første gang: fyll ut fra selskapsprofil og ansattregisteret, eller fra utkastet som er lagret.
  useEffect(() => {
    if (!first) {
      // Ikke overskriv det brukeren holder på med; da lagres det uansett om litt.
      if (!edited.current) setV(state.system);
      return;
    }
    let alive = true;
    (async () => {
      const draft = draftLoaded.current ? null : await readDraft(companyId);
      draftLoaded.current = true;
      if (!alive) return;
      setV((cur) => {
        const base = draft && typeof draft === 'object' ? { ...cur, ...draft } : cur;
        return {
          ...state.system,
          ...base,
          name: base.name || defaults.name,
          scopeText: base.scopeText || defaults.scopeText,
          units: base.units || defaults.units,
          locations: base.locations || defaults.locations,
          activities: base.activities || defaults.activities,
          standards: base.standards?.length ? base.standards : defaults.standards,
          ownerName: base.ownerName || actor.name,
          ownerUid: base.ownerUid || actor.uid,
          roleMap: Object.keys(base.roleMap || {}).length ? base.roleMap : { system_owner: { name: actor.name, uid: actor.uid, label: 'Systemansvarlig K-HMS' }, ...suggestRoles(people) },
          setupAt: '',
        };
      });
    })();
    return () => { alive = false; };
  }, [state.system, first, defaults, people, actor.name, actor.uid, companyId]);

  /** Endre skjemaet. Alt som endres, lagres fortløpende. */
  const update = useCallback((fn) => {
    edited.current = true;
    setV((cur) => (typeof fn === 'function' ? fn(cur) : fn));
  }, []);
  const set = (k) => (x) => update((cur) => ({ ...cur, [k]: x }));

  const scopeChanged = !first && (v.scopeText !== sys.scopeText || v.units !== sys.units || v.locations !== sys.locations || v.activities !== sys.activities || (v.standards || []).join() !== (sys.standards || []).join());
  const rankFor = useMemo(() => {
    const cache = new Map();
    return (u) => {
      if (!cache.has(u)) cache.set(u, aclFor({ family: ctx.family, employees: ctx.accessEmployees, uid: u }).iso);
      return cache.get(u);
    };
  }, [ctx.family, ctx.accessEmployees]);
  // Personer som ikke er koblet til en innlogging ennå: nivået står på ansattposten og gjelder når de logger inn.
  const roleCheck = useMemo(() => roleAccessCheck(v.roleMap, rankFor, (person) => {
    const employee = employeeForRole(person, { employees: ctx.accessEmployees, people });
    return employee ? { rank: employeeIsoRank(ctx.accessPolicy, employee), linked: !!employee.personUid } : null;
  }), [v.roleMap, rankFor, ctx.accessEmployees, ctx.accessPolicy, people]);
  const accessRecs = useMemo(
    () => recommendedRoleAccess(v.roleMap, { employees: ctx.accessEmployees, policy: ctx.accessPolicy, people }),
    [v.roleMap, ctx.accessEmployees, ctx.accessPolicy, people],
  );
  const notLinked = roleCheck.filter((r) => r.has != null && !r.linked);

  // Rollene lagrer innloggingen (uid) da personen ble valgt. Er personen koblet til en innlogging
  // senere, oppdateres rollen, så oppgaver og godkjenning når fram.
  // Systemansvarlig følger feltet over, og en rolle som alt har en innlogging, røres ikke.
  // Navn brukes bare når det er entydig, ellers kan to personer med samme navn byttes om.
  useEffect(() => {
    if (first || !caps.admin) return;
    const next = {};
    for (const [role, person] of Object.entries(v.roleMap || {})) {
      if (role === 'system_owner' || !person?.name || person.uid) continue;
      const employee = employeeForRole(person, { employees: ctx.accessEmployees, people });
      if (employee?.personUid) next[role] = { ...person, uid: employee.personUid, employeeId: employee.id };
    }
    if (Object.keys(next).length) update((cur) => ({ ...cur, roleMap: { ...(cur.roleMap || {}), ...next } }));
  }, [first, caps.admin, v.roleMap, people, ctx.accessEmployees, update]);
  const [grant, setGrant] = useState({ busy: false, msg: '', err: '' });

  /** Legger til fagansvaret rollene trenger, med samme tak som i tilgangsstyringen. */
  async function grantRecommended() {
    setGrant({ busy: true, msg: '', err: '', done: 0, total: accessRecs.length });
    const done = [];
    const failed = [];
    const saved = [];
    for (const [i, rec] of accessRecs.entries()) {
      setGrant((g) => ({ ...g, done: i, detail: rec.name }));
      const check = checkPersonChange({ actor: ctx.accessActor, policy: ctx.accessPolicy, before: rec.employee, after: rec.next });
      if (!check.ok) { failed.push(`${rec.name}: ${check.reason}`); continue; }
      try {
        saved.push(await saveEmployee(companyId, rec.next));
        done.push(`${rec.name} (${rec.addLabels.join(', ')}${rec.linked ? '' : ', gjelder fra innlogging'})`);
      } catch (e) {
        failed.push(`${rec.name}: ${e?.message || 'kunne ikke lagre'}`);
      }
    }
    if (saved.length) {
      setGrant((g) => ({ ...g, done: accessRecs.length, detail: 'Oppdaterer tilgangen …' }));
      // Serveren beregner ISO-tilgangen på nytt, så knappene og reglene stemmer med en gang.
      const employees = (ctx.accessEmployees || []).map((e) => saved.find((x) => x.id === e.id) || e);
      await ensureAccessMirror(companyId, actor.uid, { family: ctx.family, employees, force: true }).catch(() => null);
    }
    setGrant({
      busy: false,
      msg: done.length ? `Fagansvar lagt til: ${done.join('; ')}.` : '',
      err: failed.length ? `Ble ikke endret: ${failed.join('; ')}` : '',
    });
  }

  /** Bygg neste systemdokument fra skjemaet. */
  function buildNext(cur, prev) {
    const { actor } = live.current;
    const methodChanged = JSON.stringify(cur.riskMethod?.thresholds) !== JSON.stringify(prev.riskMethod?.thresholds);
    const roleMap = { ...(cur.roleMap || {}), system_owner: { name: cur.ownerName, uid: cur.ownerUid, label: 'Systemansvarlig K-HMS' } };
    return bump({
      ...prev,
      ...cur,
      // Felt som også kan settes av importen: behold det som er lagret hvis skjemaet ikke har dem.
      docStructure: cur.docStructure !== undefined ? normalizeDocStructure(cur.docStructure) : (prev.docStructure || []),
      profile: cur.profile !== undefined ? cur.profile : (prev.profile || null),
      // Klimavurderingen eies av Kontekst-siden; skjemaet her skal ikke skrive en eldre kopi tilbake.
      climate: prev.climate || null,
      // Ny metodeversjon: forrige versjon legges i historikken, så eldre vurderinger beholder sine terskler.
      riskMethod: methodChanged && prev.setupAt ? {
        ...cur.riskMethod,
        version: bumpVersion(prev.riskMethod?.version),
        history: [...(prev.riskMethod?.history || []), { version: prev.riskMethod?.version || DEFAULT_RISK_METHOD.version, name: prev.riskMethod?.name || DEFAULT_RISK_METHOD.name, thresholds: prev.riskMethod?.thresholds || DEFAULT_RISK_METHOD.thresholds }].slice(-20),
      } : (cur.riskMethod || DEFAULT_RISK_METHOD),
      roleMap,
      // Byttet utgave logges, så kravmatrisen kan vise overgangen (ISO-09).
      editionHistory: editionChanges(prev, cur, actor).length
        ? [...(prev.editionHistory || []), ...editionChanges(prev, cur, actor)].slice(-20)
        : (prev.editionHistory || []),
      // Godkjennerne lagres som liste, så Firestore-reglene kan lese dem.
      approverUids: approverUidsFromRoles(roleMap, cur.ownerUid),
      setupAt: prev.setupAt || nowIso(),
      setupBy: prev.setupBy || actor.name,
    }, actor);
  }

  /** Lagre endringene i et allerede aktivert system. Køes, så to lagringer aldri går samtidig. */
  const persist = useCallback(() => {
    chain.current = chain.current.catch(() => {}).then(async () => {
      const { store, actor, companyId } = live.current;
      let cur = vRef.current;
      let prev = sysRef.current;
      if (!prev.setupAt) return;
      if (settingsKey(cur) === settingsKey(prev) && Array.isArray(prev.approverUids)) {
        setSaveState('saved');
        return;
      }
      const problem = settingsError(cur);
      if (problem) {
        setSaveState('invalid');
        setSaveNote(problem);
        return;
      }
      setSaveState('saving');
      setSaveNote('');
      const save = async () => {
        const next = buildNext(cur, prev);
        const res = await store.commit('system', 'system', { ok: true, system: next, events: [auditEvent({ entityType: 'system', entityId: 'main', action: 'iso.system.updated', actor, before: prev, after: next })] }, { previous: prev });
        return { res, next };
      };
      const base = prev;
      let { res, next } = await save();
      if (!res.ok && res.conflict) {
        // Oppsettet er lagret et annet sted i mellomtiden (en import, en annen fane). Hent det som
        // står lagret, legg det brukeren selv har endret oppå, og prøv én gang til.
        const saved = await loadIsoSystem(companyId).catch(() => null);
        if (saved?.setupAt) {
          prev = normalizeSystem(saved);
          cur = mergeOwnChanges(vRef.current, base, prev);
          sysRef.current = prev;
          setV(cur);
          ({ res, next } = await save());
        }
      }
      if (!res.ok) {
        setSaveState('error');
        setSaveNote(res.error || 'Kunne ikke lagre.');
        return;
      }
      sysRef.current = next;
      const scopeMoved = cur.scopeText !== base.scopeText || cur.units !== base.units || cur.locations !== base.locations || cur.activities !== base.activities || (cur.standards || []).join() !== (base.standards || []).join();
      // Ny utgave: kravene i standarden må vurderes på nytt mot den nye utgaven.
      for (const change of editionChanges(base, cur, actor)) {
        const now = store.current();
        const ids = allRequirements(now).filter((r) => r.kind === 'iso' && r.standard === change.code).map((r) => r.id);
        const flagged = markForReassessment(now, ids, `Ny utgave: ${standardLabel(change.code, { [change.code]: change.to })}`, { actor });
        if (flagged.events.length) await store.commitLists({ assessments: flagged.assessments }, flagged.events);
      }
      if (scopeMoved) {
        const now = store.current();
        const ids = requirementIdsForArea(now, 'scope').concat(requirementIdsForArea(now, 'context'));
        const flagged = markForReassessment(now, ids, 'Omfanget er endret', { actor });
        if (flagged.events.length) await store.commitLists({ assessments: flagged.assessments }, flagged.events);
      }
      if (settingsKey(vRef.current) === settingsKey(next)) {
        // Alt er lagret: skjemaet følger det som står i ProTop igjen (f.eks. etter en import).
        edited.current = false;
        setSaveState('saved');
        return;
      }
      // Kom det flere endringer mens vi lagret, tar neste runde dem.
      setSaveState('pending');
      if (!timer.current) {
        timer.current = setTimeout(() => {
          timer.current = null;
          persist();
        }, AUTOSAVE_MS);
      }
    });
    return chain.current;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Importen har lagret oppsettet: vis det, og glem det gamle skjemaet så autolagringen ikke skriver det tilbake. */
  const onSystemImported = useCallback((saved) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    edited.current = false;
    const next = saved || store.current().system;
    sysRef.current = next;
    setV(next);
    clearDraft(companyId);
    setSaveState('saved');
  }, [store, companyId]);

  /** Lagre nå (brukes før man går til en annen side). */
  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (first) {
      writeDraft(companyId, vRef.current);
      return;
    }
    await persist();
  }, [first, companyId, persist]);

  // Autolagring: et aktivert system lagres i ProTop, et oppsett som ikke er aktivert ennå
  // lagres som utkast på enheten. Ingenting forsvinner når man går til en annen side.
  useEffect(() => {
    if (!edited.current) return undefined;
    if (first) {
      writeDraft(companyId, v);
      setSaveState('draft');
      return undefined;
    }
    if (settingsKey(v) === settingsKey(sysRef.current)) return undefined;
    setSaveState('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      persist();
    }, AUTOSAVE_MS);
    return undefined;
  }, [v, first, companyId, persist]);

  // Eldre oppsett mangler godkjennerlisten. Admin som åpner innstillingene, lagrer den med en gang.
  useEffect(() => {
    if (!first && caps.admin && !Array.isArray(sys.approverUids) && sys.setupAt) persist();
  }, [first, caps.admin, sys.setupAt, sys.approverUids, persist]);

  // Går man bort før forsinkelsen er ute, lagres det likevel.
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      persist();
    }
  }, [persist]);

  /** Til tilgangsstyringen, med vei tilbake hit. */
  async function openAccess() {
    await flush();
    requestTab?.('selskap', 'tilgang', { type: 'returnTo', tab: 'iso', subView: 'innstillinger', label: 'Tilbake til ISO-oppsettet' });
  }

  async function activate() {
    setErr(''); setMsg(''); setLog([]);
    const problem = settingsError(v);
    if (problem) { setErr(problem); return; }
    setBusy(true);
    setBusyNote('Lagrer oppsettet …');
    const next = buildNext(v, sys);
    const res = await store.commit('system', 'system', { ok: true, system: next, events: [auditEvent({ entityType: 'system', entityId: 'main', action: 'iso.system.activated', actor, before: sys, after: next })] }, { previous: null });
    if (!res.ok) { setErr(res.error); setBusy(false); return; }
    clearDraft(companyId);
    edited.current = false;
    if (Object.values(starter).some(Boolean)) {
      setBusyNote('Oppretter prosesser, dokumenter og registre du valgte …');
      const lines = await runStarterKit({ companyId, state: store.current(), store, actor, caps, options: starter });
      sources.reloadAnbud();
      setLog(lines);
    }
    setBusy(false);
    setMsg('Ledelsessystemet er aktivert. Endringer du gjør herfra, lagres automatisk.');
  }

  const status = {
    draft: { tone: 'info', icon: 'phone-portrait-outline', label: 'Utkast lagret på enheten' },
    pending: { tone: 'info', icon: 'ellipsis-horizontal', label: 'Lagrer straks …' },
    saving: { tone: 'info', icon: 'cloud-upload-outline', label: 'Lagrer …' },
    saved: { tone: 'ok', icon: 'checkmark-circle-outline', label: 'Lagret' },
    invalid: { tone: 'warn', icon: 'alert-circle-outline', label: 'Ikke lagret' },
    error: { tone: 'danger', icon: 'cloud-offline-outline', label: 'Kunne ikke lagre' },
  }[saveState];

  return (
    <Page
      wide={wide}
      title={first ? 'Sett opp ledelsessystemet' : 'Omfang, standarder og roller'}
      intro={first
        ? 'Feltene er fylt ut fra selskapsprofilen og ansattregisteret. Sjekk dem, og velg hva som skal opprettes automatisk. Det du fyller inn, huskes til du aktiverer.'
        : 'Virksomheten velger selv standarder, omfang og hvem som har rollene. Endringer lagres automatisk.'}
      actions={status ? <Pill label={status.label} icon={status.icon} tone={status.tone} /> : null}
    >
      {scopeChanged ? <Banner tone="warn" text="Endret omfang: vurderingene av kontekst og omfang flagges for ny vurdering." /> : null}
      {saveState === 'invalid' || saveState === 'error' ? (
        <Banner tone={saveState === 'error' ? 'danger' : 'warn'} text={`${saveNote} Endringen er ikke lagret ennå.`} />
      ) : null}
      {saveState === 'error' ? <Btn small icon="refresh" label="Prøv igjen" onPress={() => persist()} /> : null}
      {msg ? <Banner tone="ok" text={msg} /> : null}
      {log.length ? (
        <Card title="Opprettet automatisk">
          {log.map((l) => <Text key={l} style={{ color: colors.ink, fontSize: 13 }}>✓ {l}</Text>)}
          <Row>
            <Btn kind="primary" label="Til oversikten" onPress={() => go('oversikt')} />
            <Btn label="Se prosessene" onPress={() => go('prosesser')} />
            <Btn label="Godkjenn policy" onPress={() => go('dokumenter')} />
          </Row>
        </Card>
      ) : null}
      {err ? <Banner tone="danger" text={err} /> : null}
      {importAtTop.current ? <IsoImport ctx={ctx} first={first} onSystemImported={onSystemImported} beforeImport={flush} /> : null}
      <Card title="Ledelsessystem" subtitle={sources.company?.navn ? `Hentet fra selskapsprofilen: ${sources.company.navn}${sources.company.organisasjonsnummer ? ` · ${sources.company.organisasjonsnummer}` : ''}` : ''}>
        <Field label="Navn"><TextIn value={v.name} onChangeText={set('name')} /></Field>
        <Field label="Standarder" required>
          {STANDARDS.map((s) => {
            const on = (v.standards || []).includes(s.code);
            const editions = STANDARD_EDITIONS[s.code] || [];
            return (
              <View key={s.code} style={{ gap: 4 }}>
                <Check label={`${standardLabel(s.code, v.editions)} – ${s.domain}`} value={on} onChange={(x) => update((cur) => ({ ...cur, standards: x ? [...(cur.standards || []), s.code] : (cur.standards || []).filter((y) => y !== s.code) }))} />
                {on && editions.length > 1 ? (
                  <View style={{ paddingLeft: 28 }}>
                    <Choice
                      small
                      title={`Utgave av ISO ${s.short}`}
                      options={editions.map((e) => ({ id: e.id, label: e.label }))}
                      value={standardEdition(s.code, v.editions)?.id}
                      onChange={(x) => x && update((cur) => ({ ...cur, editions: { ...(cur.editions || {}), [s.code]: x } }))}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
          <Text style={{ color: colors.muted, fontSize: 12 }}>Velg utgaven dere er sertifisert eller skal sertifiseres etter. Vurderinger og bevis følger kravet når utgaven byttes, og kravene i standarden merkes for ny vurdering.</Text>
        </Field>
        <Field label="Omfangserklæring" required><TextIn multiline rows={3} value={v.scopeText} onChangeText={set('scopeText')} /></Field>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Enheter og avdelinger"><TextIn multiline rows={2} value={v.units} onChangeText={set('units')} /></Field></View>
          <View style={{ flex: 1 }}><Field label="Lokasjoner"><TextIn multiline rows={2} value={v.locations} onChangeText={set('locations')} /></Field></View>
        </View>
        <Field label="Aktiviteter og tjenester"><TextIn multiline rows={2} value={v.activities} onChangeText={set('activities')} /></Field>
        <Field label="Avgrensninger og begrunnelse" hint="ISO 9001 kap. 8-krav kan begrunnes som ikke anvendbare. Krav i ISO 14001/45001 kan ikke velges bort."><TextIn multiline rows={2} value={v.exclusions} onChangeText={set('exclusions')} /></Field>
        <Field label="Systemansvarlig" required><PersonPick people={people} value={v.ownerName} onChange={(p) => update((cur) => ({ ...cur, ownerName: p.name, ownerUid: p.uid }))} /></Field>
      </Card>

      <Card title="Roller" subtitle="Én person per rolle. Prosesstrinn, nye saker og importerte poster med rollen som eier går til personen. Foreslått ut fra stillingstittel i ansattregisteret.">
        <View style={{ flexDirection: wide ? 'row' : 'column', flexWrap: 'wrap', gap: 12 }}>
          {ISO_ROLES.filter((r) => !['employee', 'system_owner'].includes(r.id)).map((r) => (
            <View key={r.id} style={wide ? { flexBasis: '48%', flexGrow: 1 } : { width: '100%' }}>
              <Field label={r.label} hint={r.summary}>
                <PersonPick people={people} value={v.roleMap?.[r.id]?.name || ''} onChange={(p) => update((cur) => ({ ...cur, roleMap: { ...(cur.roleMap || {}), [r.id]: p.name ? { name: p.name, uid: p.uid, employeeId: p.employeeId || '', label: r.label } : null } }))} />
              </Field>
            </View>
          ))}
        </View>
      </Card>

      <Card title="Roller og tilgang" subtitle="Hver rolle trenger Begrenset redigering på ISO (verneombud: Lese). Fagansvaret i tilgangsstyringen gir det uten å endre personens vanlige nivå. Systemansvarlig, kvalitetsleder, HMS-leder og øverste ledelse kan i tillegg godkjenne, publisere og lukke.">
        {!roleCheck.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Velg personer til rollene over.</Text> : null}
        {roleCheck.map((r) => {
          const employee = employeeForRole(r.person, { employees: ctx.accessEmployees, people });
          const rec = accessRecs.find((x) => x.employeeId === employee?.id);
          const login = r.linked ? '' : ' · ikke koblet til innlogging ennå';
          return (
            <ListRow
              key={r.role}
              icon={r.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              tone={r.ok ? 'ok' : 'warn'}
              title={`${ISO_ROLES.find((x) => x.id === r.role)?.label || r.role}: ${r.person.name}`}
              subtitle={r.has == null
                ? 'Finnes ikke i Ansatte. Velg personen fra listen i Roller over.'
                : (r.ok
                  ? `Har ${r.hasLabel}${APPROVER_ROLES.includes(r.role) ? ' · kan godkjenne' : ''}${login}`
                  : `Trenger ISO · ${r.needLabel}, har ${r.hasLabel}${login}. Anbefalt: fagansvar «${rec?.addLabels.join('», «') || r.levelLabel}».`)}
            />
          );
        })}
        {notLinked.length ? (
          <Banner
            tone="warn"
            text={`${notLinked.length === 1 ? 'Én person' : `${notLinked.length} personer`} i rollene er ikke koblet til en innlogging. Tilgangen står på ansattposten og gjelder fra de logger inn, men før det får de ikke oppgaver og kan ikke godkjenne. Inviter dem under Ansatte → Inviter brukere.`}
          />
        ) : null}
        {grant.msg ? <Banner tone="ok" text={grant.msg} /> : null}
        {grant.err ? <Banner tone="danger" text={grant.err} /> : null}
        <Row>
          {accessRecs.length && ctx.canGrantAccess
            ? <Btn small kind="primary" icon="shield-checkmark-outline" label={`Gi anbefalt tilgang (${accessRecs.length} ${accessRecs.length === 1 ? 'person' : 'personer'})`} busy={grant.busy} onPress={grantRecommended} />
            : null}
          {roleCheck.some((r) => !r.ok) && requestTab ? <Btn small icon="key-outline" label="Åpne tilgangsstyring" onPress={openAccess} /> : null}
        </Row>
        {accessRecs.length && !ctx.canGrantAccess
          ? <Text style={{ color: colors.muted, fontSize: 12 }}>Du kan ikke endre andres tilgang. Be en som har Tilgangsstyring, om å krysse av fagansvaret.</Text>
          : null}
      </Card>

      <RoleOwnerCard ctx={ctx} />

      <RestrictedAccessCard ctx={ctx} />

      <Card title="Automatikk" subtitle="Det ProTop gjør av seg selv. Alt blir oppgaver i Oppgaver med fast nøkkel, så ingenting dobles.">
        <Check label="Lag kvalitetsplan automatisk for nye prosjekter (fylt ut fra prosjekt og kontrakt)" value={v.autoQualityPlan !== false} onChange={(x) => set('autoQualityPlan')(!!x)} />
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
          Alltid på: ansvarlig og kravkobling på nye saker, påminnelse om forfalte gjennomganger og vurderinger, og eskalering av forfalte frister –
          først til kvalitets- eller HMS-leder, etter sju dager til øverste ledelse. Skjermede saker gir oppgaver uten detaljer.
        </Text>
      </Card>

      <Card title="Risikometode" subtitle={`${v.riskMethod?.name || DEFAULT_RISK_METHOD.name} · versjon ${v.riskMethod?.version || '1.0'}. Endring gir ny metodeversjon; eldre vurderinger beholder sin.`}>
        <Row>
          {['medium', 'high', 'critical'].map((k) => (
            <View key={k} style={{ minWidth: 120, flex: 1 }}>
              <Field label={{ medium: 'Middels fra', high: 'Høy fra', critical: 'Kritisk fra' }[k]}>
                <TextIn keyboardType="numeric" value={String(v.riskMethod?.thresholds?.[k] ?? DEFAULT_RISK_METHOD.thresholds[k])} onChangeText={(x) => update((cur) => ({ ...cur, riskMethod: { ...(cur.riskMethod || DEFAULT_RISK_METHOD), thresholds: { ...(cur.riskMethod?.thresholds || DEFAULT_RISK_METHOD.thresholds), [k]: Number(x) || 0 } } }))} />
              </Field>
            </View>
          ))}
        </Row>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Risikotall = sannsynlighet (1–5) × konsekvens (1–5).</Text>
      </Card>

      {first ? (
        <Card title="Startpakke" subtitle="Opprettes automatisk når du aktiverer. Alt kan endres etterpå.">
          {STARTER_OPTIONS.map((o) => <Check key={o.id} label={o.label} value={!!starter[o.id]} onChange={(x) => setStarter({ ...starter, [o.id]: x })} />)}
        </Card>
      ) : null}

      <ProfileCard v={v} update={update} wide={wide} about={shownAbout(normalizeCompanyPage(sources.company?.publicPage), sources.company?.brreg || sources.company)} onCompanyPage={() => requestTab?.('selskap')} />
      <DocStructureCard v={v} update={update} />
      {!importAtTop.current ? <IsoImport ctx={ctx} onSystemImported={onSystemImported} beforeImport={flush} /> : null}

      <Card title="Tilgang i ProTop">
        <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 20 }}>
          ISO · Lese: se publiserte prosesser og dokumenter, melde avvik, fylle ut skjema.{'\n'}
          ISO · Begrenset redigering: behandle saker, registre og utkast. Med en ledende rolle også godkjenne, publisere og lukke.{'\n'}
          ISO · Admin: bare innstillingene for ledelsessystemet. Selskapet bestemmer selv hvem som skal ha Admin.
        </Text>
        {requestTab ? <Btn small icon="key-outline" label="Åpne tilgangsstyring" onPress={openAccess} /> : null}
      </Card>
      {sys.setupAt ? <KV label="Aktivert" value={`${prettyDate(sys.setupAt)} av ${sys.setupBy}`} /> : null}
      {first ? (
        <Row>
          <Btn kind="primary" icon="flash-outline" label="Aktiver ledelsessystemet" busy={busy} onPress={activate} />
          <Pill label="Ingen eksempeldata legges inn" tone="info" />
        </Row>
      ) : null}
      <BrandBusyOverlay visible={busy} label="Aktiverer ledelsessystemet" detail={busyNote} testID="iso-activate-busy" />
      <BrandBusyOverlay visible={grant.busy} label="Gir anbefalt tilgang" detail={grant.detail} done={grant.done} total={grant.total} testID="iso-grant-busy" />
    </Page>
  );
}

/** Visjon, verdier og forretningsmål – vises på Oversikt (ISO 5.1 og 7.3). */
function ProfileCard({ v, update, wide, about = '', onCompanyPage }) {
  const colors = useColors();
  const p = v.profile || {};
  const setP = (k) => (x) => update((cur) => ({ ...cur, profile: { ...(cur.profile || {}), [k]: x } }));
  return (
    <Card title="Visjon, verdier og mål" subtitle="Vises for alle på Oversikt i ISO, sammen med policyene. Hjelper ansatte å forstå hva ledelsessystemet skal oppnå.">
      <Field label="Visjon"><TextIn multiline rows={2} value={p.vision || ''} onChangeText={setP('vision')} /></Field>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Verdier" hint="Én per linje.">
            <TextIn multiline rows={3} value={(p.values || []).join('\n')} onChangeText={(x) => setP('values')(String(x).split('\n').map((l) => l.trimStart()).filter((l, i, a) => l || i < a.length - 1))} />
          </Field>
        </View>
        <View style={{ flex: 1 }}><Field label="Forretningsmål og overordnede mål"><TextIn multiline rows={3} value={p.businessGoals || ''} onChangeText={setP('businessGoals')} /></Field></View>
      </View>
      {/* «Om oss» eies av bedriftssiden i Selskap; ISO viser den, så teksten ikke finnes to steder. */}
      <Field label="Om virksomheten (fra Selskap)" hint="Endres på bedriftssiden: Selskap → Rediger side.">
        <Text style={{ color: about ? colors.ink : colors.muted, fontSize: 13, lineHeight: 19 }}>{about || 'Ingen tekst på bedriftssiden ennå.'}</Text>
      </Field>
      {onCompanyPage ? <Btn small icon="open-outline" label="Åpne bedriftssiden" onPress={onCompanyPage} /> : null}
    </Card>
  );
}

/**
 * Dokumentstruktur: virksomhetens egne deler og mapper (f.eks. A – HMSK-system, A-01 Politikk).
 * Dokumenter plasseres i en mappe og får kode etter mappen (A-01-001).
 */
function DocStructureCard({ v, update }) {
  const colors = useColors();
  const parts = Array.isArray(v.docStructure) ? v.docStructure : [];
  const [draft, setDraft] = useState({ part: '', code: '', title: '' });
  const setParts = (next) => update((cur) => ({ ...cur, docStructure: next }));
  const patchPart = (i, patch) => setParts(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <Card title="Dokumentstruktur" subtitle="Deler og mapper for styrende dokumenter. Dokumenter vises gruppert slik, og nye dokumenter får neste ledige kode i mappen (f.eks. F-01-017). Tom struktur = gruppering etter dokumenttype.">
      {!parts.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen struktur ennå.</Text> : null}
      {parts.map((p, i) => (
        <View key={`${p.code}${i}`} style={{ gap: 6, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line }}>
          <Row>
            <View style={{ width: 70 }}><TextIn value={p.code} onChangeText={(x) => patchPart(i, { code: String(x).toUpperCase() })} accessibilityLabel="Kode for del" /></View>
            <View style={{ flex: 1, minWidth: 160 }}><TextIn value={p.title} onChangeText={(x) => patchPart(i, { title: x })} accessibilityLabel="Navn på del" /></View>
            <Btn small kind="danger" icon="trash-outline" accessibilityLabel={`Fjern del ${p.code}`} onPress={() => setParts(parts.filter((_, j) => j !== i))} />
          </Row>
          {(p.folders || []).map((f, k) => (
            <Row key={`${f.code}${k}`}>
              <View style={{ width: 24 }} />
              <View style={{ width: 90 }}><TextIn value={f.code} onChangeText={(x) => patchPart(i, { folders: p.folders.map((y, m) => (m === k ? { ...y, code: String(x).toUpperCase() } : y)) })} accessibilityLabel="Mappekode" /></View>
              <View style={{ flex: 1, minWidth: 140 }}><TextIn value={f.title} onChangeText={(x) => patchPart(i, { folders: p.folders.map((y, m) => (m === k ? { ...y, title: x } : y)) })} accessibilityLabel="Mappenavn" /></View>
              <Btn small icon="close" accessibilityLabel={`Fjern mappe ${f.code}`} onPress={() => patchPart(i, { folders: p.folders.filter((_, m) => m !== k) })} />
            </Row>
          ))}
          <Btn
            small
            icon="add"
            label="Legg til mappe"
            onPress={() => {
              const n = (p.folders || []).length + 1;
              patchPart(i, { folders: [...(p.folders || []), { code: `${p.code}-${String(n).padStart(2, '0')}`, title: 'Ny mappe' }] });
            }}
          />
        </View>
      ))}
      <Row>
        <View style={{ width: 70 }}><TextIn value={draft.code} onChangeText={(x) => setDraft({ ...draft, code: String(x).toUpperCase() })} placeholder="Kode" /></View>
        <View style={{ flex: 1, minWidth: 160 }}><TextIn value={draft.title} onChangeText={(x) => setDraft({ ...draft, title: x })} placeholder="Ny del, f.eks. «Prosesser»" /></View>
        <Btn small icon="add" label="Legg til del" disabled={!draft.code.trim()} onPress={() => { setParts([...parts, { code: draft.code.trim(), title: draft.title.trim() || draft.code.trim(), folders: [] }]); setDraft({ part: '', code: '', title: '' }); }} />
      </Row>
    </Card>
  );
}

/**
 * Eiere som er en rolle eller funksjon i stedet for en person (typisk fra import før rollene var satt).
 * Kobler dem til personen med rollen; uten eier eller ukjent funksjon → kvalitetsleder, merket til gjennomgang.
 */
function RoleOwnerCard({ ctx }) {
  const colors = useColors();
  const { state, caps, people, store, actor } = ctx;
  const fixes = useMemo(() => roleOwnerFixes(state, { people, build: false }), [state, people]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState({ done: 0, total: 0 });
  if (!caps.admin || (!fixes.length && !msg)) return null;
  const counts = { records: 0, documents: 0, processes: 0 };
  const pairs = new Map();
  for (const f of fixes) {
    counts[f.kind] += 1;
    const k = `«${f.from}» → ${f.to}${f.how === 'standard' ? ' (må gjennomgås)' : ''}`;
    pairs.set(k, (pairs.get(k) || 0) + 1);
  }
  const top = [...pairs.entries()].sort((a, b) => b[1] - a[1]);

  async function run() {
    setBusy(true); setErr(''); setMsg('');
    // Fersk beregning rett før lagring, så ingenting som er endret i mellomtiden, overskrives.
    const fresh = roleOwnerFixes(store.current(), { people, actor });
    setSaved({ done: 0, total: fresh.length });
    const res = await store.commitMany(fresh.map((f) => ({ kind: f.kind, entity: f.entity })), fresh.map((f) => f.event), {
      onProgress: (n, total) => setSaved({ done: n, total }),
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Kunne ikke lagre.'); return; }
    setMsg(`${fresh.length} eiere er koblet til personer. Poster som fikk kvalitetsleder som eier, står under «Må gjennomgås».`);
  }

  return (
    <Card title="Eiere som er roller" subtitle="Poster der eieren er en rolle, en funksjon eller «Ikke tildelt» i stedet for en person. I ProTop eier en person hver post, så oppgaver og varsler når fram.">
      {msg ? <Banner tone="ok" text={msg} /> : null}
      {err ? <Banner tone="danger" text={err} /> : null}
      {fixes.length ? (
        <>
          <Text style={{ color: colors.ink, fontSize: 13 }}>
            {[counts.records ? `${counts.records} registerposter` : '', counts.documents ? `${counts.documents} dokumenter` : '', counts.processes ? `${counts.processes} prosesser` : ''].filter(Boolean).join(', ')}:
          </Text>
          {top.slice(0, 8).map(([k, n]) => <Text key={k} style={{ color: colors.muted, fontSize: 12 }}>• {k} ({n})</Text>)}
          {top.length > 8 ? <Text style={{ color: colors.muted, fontSize: 12 }}>… og {top.length - 8} til.</Text> : null}
          <Text style={{ color: colors.muted, fontSize: 12 }}>Rollen går til personen i Roller over. Uten eier, eller en funksjon ProTop ikke har som rolle (f.eks. Tilbudsansvarlig), blir kvalitetsleder eier og posten merkes «må gjennomgås».</Text>
          <Row><Btn small kind="primary" icon="people-outline" label={`Koble rolle-eiere til personer (${fixes.length})`} busy={busy} onPress={run} /></Row>
        </>
      ) : null}
      <BrandBusyOverlay visible={busy} label="Kobler eiere til personer" detail={`${saved.done} av ${saved.total} poster lagret`} done={saved.done} total={saved.total} testID="iso-owner-busy" />
    </Card>
  );
}

/**
 * Særskilt tilgang til skjermede HMS- og personsaker. Lagres for seg (isoRestricted/main) og
 * håndheves i Firestore-reglene. Ingen får den automatisk – heller ikke eier eller ISO-admin.
 * Bare eier, eller en som selv står på listen og er ISO-admin, kan endre listen.
 */
function RestrictedAccessCard({ ctx }) {
  const colors = useColors();
  const { state, caps, people, store, actor, companyId } = ctx;
  const grants = state.restrictedGrants || { people: [], uids: [] };
  const [list, setList] = useState(grants.people || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setList(grants.people || []); }, [grants.rev, (grants.people || []).length]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify((list || []).map((p) => p.uid)) !== JSON.stringify((grants.people || []).map((p) => p.uid));
  const mine = restrictedUids(grants).has(actor.uid);

  async function save() {
    setBusy(true); setErr('');
    try {
      await saveRestrictedGrants(companyId, list, { actor });
      await store.reload();
    } catch {
      setErr('Kunne ikke lagre. Bare eieren, eller en som står på listen og er ISO-admin, kan endre den.');
    }
    setBusy(false);
  }

  if (!grants.readable && !caps.canGrantRestricted) {
    return (
      <Card title="Tilgang til skjermede HMS-saker">
        <Text style={{ color: colors.muted, fontSize: 13 }}>Listen styres av eieren av selskapet. Du har ikke særskilt tilgang.</Text>
      </Card>
    );
  }
  return (
    <Card
      title="Tilgang til skjermede HMS-saker"
      subtitle="Personskader og saker med person- eller helseopplysninger. Bare personene her ser alle skjermede saker. Den som meldte, er tildelt eller eier et tiltak, ser sin egen sak. Ingen får tilgang automatisk."
      right={mine ? <Pill label="Du har tilgang" icon="lock-open-outline" tone="info" /> : null}
    >
      {!(list || []).length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen har særskilt tilgang ennå.</Text> : null}
      {(list || []).map((p) => (
        <ListRow key={p.uid} icon="lock-closed-outline" title={p.name} right={caps.canGrantRestricted ? <Btn small kind="danger" label="Fjern" onPress={() => setList(list.filter((x) => x.uid !== p.uid))} /> : null} />
      ))}
      {caps.canGrantRestricted ? (
        <>
          <PersonPick people={people.filter((p) => p.uid && !(list || []).some((x) => x.uid === p.uid))} value="" placeholder="Gi en person særskilt tilgang" onChange={(p) => p.uid && setList([...(list || []), { name: p.name, uid: p.uid }])} />
          <Text style={{ color: colors.muted, fontSize: 12 }}>Bare ansatte med innlogging kan få tilgang. Endringen logges.</Text>
          {dirty ? <Btn kind="primary" icon="save-outline" label="Lagre tilgangslisten" busy={busy} onPress={save} /> : null}
        </>
      ) : null}
      {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
    </Card>
  );
}
