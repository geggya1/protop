import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { auditEvent, bump, nowIso, prettyDate } from '../../src/iso/core';
import { DEFAULT_RISK_METHOD, ISO_ROLES, STANDARDS } from '../../src/iso/catalog';
import { markForReassessment, requirementIdsForArea } from '../../src/iso/requirements';
import { setupDefaultsFromCompany } from '../../src/iso/integrations';
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
  const restricted = v.restrictedAccess || [];

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

      <Card title="Tilgang til skjermede HMS-saker" subtitle="Personskader og saker med person-/helseopplysninger. HMS-leder og systemansvarlig har alltid tilgang. Den som meldte eller er tildelt en sak, ser den alltid.">
        {restricted.map((p) => (
          <ListRow key={p.uid || p.name} icon="lock-closed-outline" title={p.name} right={<Btn small kind="danger" label="Fjern" onPress={() => set('restrictedAccess')(restricted.filter((x) => x !== p))} />} />
        ))}
        <PersonPick people={people.filter((p) => !restricted.some((x) => x.uid === p.uid && x.name === p.name))} value="" placeholder="Gi en person tilgang" onChange={(p) => p.name && set('restrictedAccess')([...restricted, { name: p.name, uid: p.uid }])} />
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
