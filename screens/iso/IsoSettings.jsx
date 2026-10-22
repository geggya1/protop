import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { auditEvent, bump, nowIso, prettyDate } from '../../src/iso/core';
import { DEFAULT_RISK_METHOD, ISO_ROLES, STANDARDS } from '../../src/iso/catalog';
import { markForReassessment, requirementIdsForArea } from '../../src/iso/requirements';
import { setupDefaultsFromCompany } from '../../src/iso/integrations';
import { roleAccessCheck, restrictedUids } from '../../src/iso/access';
import { aclFor } from '../../src/iso/aclSync';
import { saveRestrictedGrants } from '../../src/iso/storage';
import { STARTER_OPTIONS, runStarterKit } from './starterKit';
import {
  Banner, Btn, Card, Check, Field, KV, ListRow, Page, PersonPick, Pill, Row, TextIn,
} from './isoUi';

function bumpVersion(v) {
  const [a, b] = String(v || '1.0').split('.').map((n) => Number(n) || 0);
  return `${a}.${b + 1}`;
}

/** Foreslå roller ut fra tittel i ansattregisteret. */
function suggestRoles(people) {
  const find = (re) => people.find((p) => re.test(p.title || ''));
  const out = {};
  const pairs = [
    ['top_management', /daglig leder|ceo|adm\.? dir|administrerende/i],
    ['quality_manager', /kvalitet|ks-?leder|qa/i],
    ['hse_manager', /hms|sikkerhet|verne/i],
    ['project_manager', /prosjektleder/i],
    ['internal_auditor', /revisor|kvalitet/i],
    ['safety_rep', /verneombud|tillitsvalgt/i],
  ];
  for (const [role, re] of pairs) {
    const p = find(re);
    if (p) out[role] = { name: p.name, uid: p.uid, label: ISO_ROLES.find((r) => r.id === role)?.label };
  }
  return out;
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

  // Første gang: fyll ut fra selskapsprofil og ansattregister automatisk.
  useEffect(() => {
    if (!first) { setV(state.system); return; }
    setV((cur) => ({
      ...state.system,
      name: cur.name || defaults.name,
      scopeText: cur.scopeText || defaults.scopeText,
      units: cur.units || defaults.units,
      locations: cur.locations || defaults.locations,
      activities: cur.activities || defaults.activities,
      standards: cur.standards?.length ? cur.standards : defaults.standards,
      ownerName: cur.ownerName || actor.name,
      ownerUid: cur.ownerUid || actor.uid,
      roleMap: Object.keys(cur.roleMap || {}).length ? cur.roleMap : { system_owner: { name: actor.name, uid: actor.uid, label: 'Systemansvarlig K-HMS' }, ...suggestRoles(people) },
    }));
  }, [state.system, first, defaults, people, actor.name, actor.uid]);

  const set = (k) => (x) => setV((cur) => ({ ...cur, [k]: x }));
  const scopeChanged = !first && (v.scopeText !== sys.scopeText || v.units !== sys.units || v.locations !== sys.locations || v.activities !== sys.activities || (v.standards || []).join() !== (sys.standards || []).join());
  const rankFor = useMemo(() => {
    const cache = new Map();
    return (u) => {
      if (!cache.has(u)) cache.set(u, aclFor({ family: ctx.family, employees: ctx.accessEmployees, uid: u }).iso);
      return cache.get(u);
    };
  }, [ctx.family, ctx.accessEmployees]);
  const roleCheck = useMemo(() => roleAccessCheck(v.roleMap, rankFor), [v.roleMap, rankFor]);

  async function save() {
    setErr(''); setMsg(''); setLog([]);
    if (!(v.standards || []).length) { setErr('Velg minst én standard.'); return; }
    if (!String(v.scopeText || '').trim()) { setErr('Beskriv omfanget av ledelsessystemet.'); return; }
    if (!String(v.ownerName || '').trim()) { setErr('Velg systemansvarlig.'); return; }
    const t = v.riskMethod?.thresholds || DEFAULT_RISK_METHOD.thresholds;
    if (!(t.medium > 0 && t.high > t.medium && t.critical > t.high && t.critical <= 25)) { setErr('Risikoterskler må være stigende og høyst 25.'); return; }
    setBusy(true);
    const methodChanged = JSON.stringify(v.riskMethod?.thresholds) !== JSON.stringify(sys.riskMethod?.thresholds);
    const next = bump({
      ...v,
      riskMethod: methodChanged && !first ? { ...v.riskMethod, version: bumpVersion(sys.riskMethod?.version) } : (v.riskMethod || DEFAULT_RISK_METHOD),
      roleMap: { ...(v.roleMap || {}), system_owner: { name: v.ownerName, uid: v.ownerUid, label: 'Systemansvarlig K-HMS' } },
      setupAt: sys.setupAt || nowIso(),
      setupBy: sys.setupBy || actor.name,
    }, actor);
    const res = await store.commit('system', 'system', { ok: true, system: next, events: [auditEvent({ entityType: 'system', entityId: 'main', action: first ? 'iso.system.activated' : 'iso.system.updated', actor, before: sys, after: next })] }, { previous: first ? null : sys });
    if (!res.ok) { setErr(res.error); setBusy(false); return; }
    if (scopeChanged) {
      const now = store.current();
      const ids = requirementIdsForArea(now, 'scope').concat(requirementIdsForArea(now, 'context'));
      const flagged = markForReassessment(now, ids, 'Omfanget er endret', { actor });
      if (flagged.events.length) await store.commitLists({ assessments: flagged.assessments }, flagged.events);
    }
    if (first && Object.values(starter).some(Boolean)) {
      const lines = await runStarterKit({ companyId, state: store.current(), store, actor, caps, options: starter });
      sources.reloadAnbud();
      setLog(lines);
    }
    setBusy(false);
    setMsg(first ? 'Ledelsessystemet er aktivert.' : 'Innstillingene er lagret.');
  }

  return (
    <Page wide={wide} title={first ? 'Sett opp ledelsessystemet' : 'Omfang, standarder og roller'} intro={first ? 'Feltene er fylt ut fra selskapsprofilen og ansattregisteret. Sjekk dem, og velg hva som skal opprettes automatisk.' : 'Virksomheten velger selv standarder, omfang og hvem som har rollene.'}>
      {scopeChanged ? <Banner tone="warn" text="Endret omfang: vurderingene av kontekst og omfang flagges for ny vurdering når du lagrer." /> : null}
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
      <Card title="Ledelsessystem" subtitle={sources.company?.navn ? `Hentet fra selskapsprofilen: ${sources.company.navn}${sources.company.organisasjonsnummer ? ` · ${sources.company.organisasjonsnummer}` : ''}` : ''}>
        <Field label="Navn"><TextIn value={v.name} onChangeText={set('name')} /></Field>
        <Field label="Standarder" required>
          {STANDARDS.map((s) => (
            <Check key={s.code} label={`${s.label} – ${s.domain}`} value={(v.standards || []).includes(s.code)} onChange={(on) => set('standards')(on ? [...(v.standards || []), s.code] : (v.standards || []).filter((x) => x !== s.code))} />
          ))}
        </Field>
        <Field label="Omfangserklæring" required><TextIn multiline rows={3} value={v.scopeText} onChangeText={set('scopeText')} /></Field>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Enheter og avdelinger"><TextIn multiline rows={2} value={v.units} onChangeText={set('units')} /></Field></View>
          <View style={{ flex: 1 }}><Field label="Lokasjoner"><TextIn multiline rows={2} value={v.locations} onChangeText={set('locations')} /></Field></View>
        </View>
        <Field label="Aktiviteter og tjenester"><TextIn multiline rows={2} value={v.activities} onChangeText={set('activities')} /></Field>
        <Field label="Avgrensninger og begrunnelse" hint="ISO 9001 kap. 8-krav kan begrunnes som ikke anvendbare. Krav i ISO 14001/45001 kan ikke velges bort."><TextIn multiline rows={2} value={v.exclusions} onChangeText={set('exclusions')} /></Field>
        <Field label="Systemansvarlig" required><PersonPick people={people} value={v.ownerName} onChange={(p) => setV((cur) => ({ ...cur, ownerName: p.name, ownerUid: p.uid }))} /></Field>
      </Card>

      <Card title="Roller" subtitle="Foreslått ut fra stillingstittel i ansattregisteret. Prosesstrinn og nye saker tildeles personen med rollen.">
        <View style={{ flexDirection: wide ? 'row' : 'column', flexWrap: 'wrap', gap: 12 }}>
          {ISO_ROLES.filter((r) => !['employee', 'system_owner'].includes(r.id)).map((r) => (
            <View key={r.id} style={{ flexBasis: wide ? '48%' : '100%', flexGrow: 1 }}>
              <Field label={r.label}>
                <PersonPick people={people} value={v.roleMap?.[r.id]?.name || ''} onChange={(p) => setV((cur) => ({ ...cur, roleMap: { ...(cur.roleMap || {}), [r.id]: p.name ? { name: p.name, uid: p.uid, label: r.label } : null } }))} />
              </Field>
            </View>
          ))}
        </View>
      </Card>

      <Card title="Roller og tilgang" subtitle="Rollene gir ikke tilgang av seg selv. Her ser du om personene har nivået rollen trenger i tilgangsmatrisen.">
        {!roleCheck.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Velg personer til rollene over.</Text> : null}
        {roleCheck.map((r) => (
          <ListRow
            key={r.role}
            icon={r.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}
            tone={r.ok ? 'ok' : 'warn'}
            title={`${r.person.label || r.role}: ${r.person.name}`}
            subtitle={r.ok ? `Har ${r.hasLabel}` : `Trenger ISO · ${r.needLabel}, har ${r.hasLabel}`}
          />
        ))}
        {roleCheck.some((r) => !r.ok) && requestTab ? <Btn small icon="key-outline" label="Gi tilgang i tilgangsstyring" onPress={() => requestTab('selskap', 'tilgang')} /> : null}
      </Card>

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
                <TextIn keyboardType="numeric" value={String(v.riskMethod?.thresholds?.[k] ?? DEFAULT_RISK_METHOD.thresholds[k])} onChangeText={(x) => setV((cur) => ({ ...cur, riskMethod: { ...(cur.riskMethod || DEFAULT_RISK_METHOD), thresholds: { ...(cur.riskMethod?.thresholds || DEFAULT_RISK_METHOD.thresholds), [k]: Number(x) || 0 } } }))} />
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

      <Card title="Tilgang i ProTop">
        <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 20 }}>
          ISO · Lese: se publiserte prosesser og dokumenter, melde avvik, fylle ut skjema.{'\n'}
          ISO · Begrenset redigering: behandle saker, registre og utkast.{'\n'}
          ISO · Admin: godkjenne, publisere, lukke saker og endre innstillingene.
        </Text>
        {requestTab ? <Btn small icon="key-outline" label="Åpne tilgangsstyring" onPress={() => requestTab('selskap', 'tilgang')} /> : null}
      </Card>
      {sys.setupAt ? <KV label="Aktivert" value={`${prettyDate(sys.setupAt)} av ${sys.setupBy}`} /> : null}
      <Row>
        <Btn kind="primary" icon={first ? 'flash-outline' : 'save-outline'} label={first ? 'Aktiver ledelsessystemet' : 'Lagre'} busy={busy} onPress={save} />
        {first ? <Pill label="Ingen eksempeldata legges inn" tone="info" /> : null}
      </Row>
    </Page>
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
