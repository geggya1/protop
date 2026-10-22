import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { auditEvent, bump, nowIso, prettyDate } from '../../src/iso/core';
import { DEFAULT_RISK_METHOD, ISO_ROLES, STANDARDS } from '../../src/iso/catalog';
import { markForReassessment, requirementIdsForArea } from '../../src/iso/requirements';
import {
  Banner, Btn, Card, Check, Choice, Field, KV, Page, PersonPick, Row, TextIn,
} from './isoUi';

export default function IsoSettings({ ctx }) {
  const colors = useColors();
  const { state, caps, actor, store, wide, people, requestTab } = ctx;
  const sys = state.system;
  const [v, setV] = useState(sys);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { setV(state.system); }, [state.system]);
  const set = (k) => (x) => setV((cur) => ({ ...cur, [k]: x }));
  const editable = caps.admin;
  const first = !sys.setupAt;
  const scopeChanged = !first && (v.scopeText !== sys.scopeText || v.units !== sys.units || v.locations !== sys.locations || v.activities !== sys.activities || (v.standards || []).join() !== (sys.standards || []).join());

  async function save() {
    setErr(''); setMsg('');
    if (!(v.standards || []).length) { setErr('Velg minst én standard.'); return; }
    if (!String(v.scopeText || '').trim()) { setErr('Beskriv omfanget av ledelsessystemet.'); return; }
    if (!String(v.ownerName || '').trim()) { setErr('Velg systemansvarlig.'); return; }
    const t = Number(v.riskMethod?.thresholds?.medium);
    const h = Number(v.riskMethod?.thresholds?.high);
    const c = Number(v.riskMethod?.thresholds?.critical);
    if (!(t > 0 && h > t && c > h && c <= 25)) { setErr('Risikoterskler må være stigende og høyst 25.'); return; }
    const methodChanged = JSON.stringify(v.riskMethod?.thresholds) !== JSON.stringify(sys.riskMethod?.thresholds);
    const next = bump({
      ...v,
      riskMethod: methodChanged ? { ...v.riskMethod, version: bumpVersion(sys.riskMethod?.version) } : v.riskMethod,
      setupAt: sys.setupAt || nowIso(),
      setupBy: sys.setupBy || actor.name,
    }, actor);
    const res = await store.commit('system', 'system', { ok: true, system: next, events: [auditEvent({ entityType: 'system', entityId: 'main', action: first ? 'iso.system.activated' : 'iso.system.updated', actor, before: sys, after: next })] }, { previous: first ? null : sys });
    if (!res.ok) { setErr(res.error); return; }
    if (scopeChanged) {
      const ids = requirementIdsForArea(state, 'scope').concat(requirementIdsForArea(state, 'context'));
      const flagged = markForReassessment(state, ids, 'Omfanget er endret', { actor });
      if (flagged.events.length) await store.commitLists({ assessments: flagged.assessments }, flagged.events);
    }
    setMsg(first ? 'Ledelsessystemet er aktivert. Ingen eksempeldata er lagt inn.' : 'Innstillingene er lagret.');
  }

  return (
    <Page wide={wide} crumb={['Innstillinger']} title="Omfang, standarder og roller" intro="Virksomheten velger selv standarder, omfang og hvem som har rollene. Tilgang styres i ProTops tilgangsmatrise (ISO og Skjermede HMS-saker).">
      {!editable ? <Banner tone="info" text="Bare administrator i ISO kan endre innstillingene." /> : null}
      {scopeChanged ? <Banner tone="warn" text="Endret omfang: vurderingene av kontekst og omfang flagges for ny vurdering når du lagrer." /> : null}
      {msg ? <Banner tone="ok" text={msg} /> : null}
      {err ? <Banner tone="danger" text={err} /> : null}
      <Card title="Ledelsessystem">
        <Field label="Navn"><TextIn value={v.name} onChangeText={set('name')} placeholder="F.eks. Integrert ledelsessystem – Konsern AS" editable={editable} /></Field>
        <Field label="Standarder" required>
          {STANDARDS.map((s) => (
            <Check key={s.code} label={`${s.label} – ${s.domain}`} value={(v.standards || []).includes(s.code)} onChange={(on) => editable && set('standards')(on ? [...(v.standards || []), s.code] : (v.standards || []).filter((x) => x !== s.code))} />
          ))}
        </Field>
        <Field label="Omfangserklæring" required><TextIn multiline rows={3} value={v.scopeText} onChangeText={set('scopeText')} placeholder="Hvilke tjenester og aktiviteter systemet omfatter" editable={editable} /></Field>
        <Field label="Juridiske enheter og avdelinger"><TextIn multiline rows={2} value={v.units} onChangeText={set('units')} editable={editable} /></Field>
        <Field label="Lokasjoner"><TextIn multiline rows={2} value={v.locations} onChangeText={set('locations')} editable={editable} /></Field>
        <Field label="Aktiviteter og tjenester"><TextIn multiline rows={2} value={v.activities} onChangeText={set('activities')} editable={editable} /></Field>
        <Field label="Avgrensninger og begrunnelse" hint="ISO 9001 kap. 8-krav kan begrunnes som ikke anvendbare. Krav i ISO 14001/45001 kan ikke velges bort."><TextIn multiline rows={2} value={v.exclusions} onChangeText={set('exclusions')} editable={editable} /></Field>
        <Field label="Systemansvarlig" required><PersonPick people={people} value={v.ownerName} onChange={(p) => setV((cur) => ({ ...cur, ownerName: p.name, ownerUid: p.uid }))} /></Field>
      </Card>
      <Card title="Roller" subtitle="Prosesstrinn med en rolle gir oppgave til personen som har rollen.">
        {ISO_ROLES.filter((r) => r.id !== 'employee').map((r) => (
          <Field key={r.id} label={r.label}>
            <PersonPick people={people} value={v.roleMap?.[r.id]?.name || ''} onChange={(p) => setV((cur) => ({ ...cur, roleMap: { ...(cur.roleMap || {}), [r.id]: p.name ? { name: p.name, uid: p.uid, label: r.label } : null } }))} />
          </Field>
        ))}
      </Card>
      <Card title="Risikometode" subtitle={`${v.riskMethod?.name || DEFAULT_RISK_METHOD.name} · versjon ${v.riskMethod?.version || '1.0'}. Endring gir ny metodeversjon; eldre vurderinger beholder sin.`}>
        <Row>
          {['medium', 'high', 'critical'].map((k) => (
            <Field key={k} label={{ medium: 'Middels fra', high: 'Høy fra', critical: 'Kritisk fra' }[k]}>
              <TextIn keyboardType="numeric" value={String(v.riskMethod?.thresholds?.[k] ?? '')} onChangeText={(x) => setV((cur) => ({ ...cur, riskMethod: { ...(cur.riskMethod || DEFAULT_RISK_METHOD), thresholds: { ...(cur.riskMethod?.thresholds || DEFAULT_RISK_METHOD.thresholds), [k]: Number(x) || 0 } } }))} editable={editable} />
            </Field>
          ))}
        </Row>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Risikotall = sannsynlighet (1–5) × konsekvens (1–5).</Text>
      </Card>
      <Card title="Tilgang">
        <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 20 }}>
          ISO · Lese: se publiserte prosesser og dokumenter, melde avvik, fylle ut skjema.{'\n'}
          ISO · Begrenset redigering: behandle saker, registre og utkast.{'\n'}
          ISO · Admin: godkjenne, publisere, lukke saker og endre innstillinger.{'\n'}
          Skjermede HMS-saker: egen rettighet. Den som meldte eller er tildelt en sak ser den alltid.
        </Text>
        {requestTab ? <Btn small icon="key-outline" label="Åpne tilgangsstyring" onPress={() => requestTab('selskap', 'tilgang')} /> : null}
      </Card>
      {sys.setupAt ? <KV label="Aktivert" value={`${prettyDate(sys.setupAt)} av ${sys.setupBy}`} /> : null}
      {editable ? <Btn kind="primary" icon="save-outline" label={first ? 'Aktiver ledelsessystemet' : 'Lagre'} onPress={save} /> : null}
    </Page>
  );
}

function bumpVersion(v) {
  const [a, b] = String(v || '1.0').split('.').map((n) => Number(n) || 0);
  return `${a}.${b + 1}`;
}
