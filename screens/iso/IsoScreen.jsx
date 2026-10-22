/**
 * ISO / K-HMS — ett integrert ledelsessystem for ISO 9001, 14001 og 45001.
 * Ligger under ISO i bedriftsmenyen; undersidene kommer fra menyen (som HR og Økonomi).
 * Gjenbruker ProTops ansatte, prosjekter, kjørebok, fravær, utstyr, kunder, kontrakter,
 * Skjemabygger, HR-sjekklisten og Oppgaver – ingenting registreres dobbelt.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { defaultIsoSubView } from '../../src/navigation/shellModules';
import { isoCapabilities } from '../../src/iso/access';
import { isSetUp } from '../../src/iso/state';
import { autoTaskEffects } from '../../src/iso/integrations';
import { useIsoStore } from './useIsoStore';
import { useIsoSources } from './useIsoSources';
import IsoDashboard from './IsoDashboard';
import IsoFindings from './IsoFindings';
import IsoProcesses from './IsoProcesses';
import IsoDocuments from './IsoDocuments';
import IsoForms from './IsoForms';
import IsoRequirements from './IsoRequirements';
import IsoSettings from './IsoSettings';
import {
  AuditPage, CertificationPage, CompetencePage, ContextPage, EmergencyPage, EnvironmentPage, HmsPage, ObjectivesPage,
  ProjectQualityPage, ReviewPage, RiskPage, SupplierPage,
} from './IsoRegisters';
import { Banner, Btn, Empty, useWide } from './isoUi';

const PAGES = {
  oversikt: IsoDashboard,
  avvik: IsoFindings,
  prosesser: IsoProcesses,
  dokumenter: IsoDocuments,
  skjema: IsoForms,
  krav: IsoRequirements,
  lovkrav: (props) => <IsoRequirements {...props} legal />,
  kontekst: ContextPage,
  mal: ObjectivesPage,
  risiko: RiskPage,
  miljo: EnvironmentPage,
  hms: HmsPage,
  prosjekt: ProjectQualityPage,
  kompetanse: CompetencePage,
  leverandorer: SupplierPage,
  beredskap: EmergencyPage,
  revisjon: AuditPage,
  ledelse: ReviewPage,
  sertifisering: CertificationPage,
  innstillinger: IsoSettings,
};

/** Automatiske påminnelser kjøres én gang per økt og selskap (idempotente nøkler). */
const AUTO_RAN = new Set();

export default function IsoScreen({ subView = 'oversikt' }) {
  const colors = useColors();
  const wide = useWide();
  const { family, familyId, uid, activeProfile, requestShellTab } = useApp();
  const access = useCompanyAccess();
  const actor = useMemo(() => ({
    uid: uid || '',
    name: String(activeProfile?.name || activeProfile?.displayName || '').trim() || 'Bruker',
  }), [uid, activeProfile?.name, activeProfile?.displayName]);
  const bypass = !access.active || (access.bypass && !access.previewing);
  const baseCaps = useMemo(() => isoCapabilities({ grants: access.active ? access.grants : null, bypass, uid }), [access.active, access.grants, bypass, uid]);
  const store = useIsoStore({ companyId: familyId, caps: baseCaps, actor, bypass });
  // Skjermet tilgang avhenger av ISO-innstillingene (rollene og listen der).
  const caps = useMemo(() => isoCapabilities({ grants: access.active ? access.grants : null, bypass, uid, system: store.state.system }), [access.active, access.grants, bypass, uid, store.state.system]);
  const canSeeHr = bypass || (typeof access.canView === 'function' && access.canView('hrCompliance'));
  const sources = useIsoSources({ familyId, family, canManage: caps.manage, canSeeHr });

  const [page, setPage] = useState(defaultIsoSubView(subView));
  const [params, setParams] = useState({});
  const [autoNote, setAutoNote] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    const next = defaultIsoSubView(subView);
    setPage((cur) => {
      if (cur !== next) setParams({});
      return next;
    });
  }, [subView]);

  // Påminnelser som oppgaver i Oppgaver: forfalte gjennomganger, vurderinger, kompetanse, øvelser, vedtak.
  useEffect(() => {
    if (!familyId || store.loading || !caps.manage || !isSetUp(store.state) || !sources.ready) return;
    const key = `${familyId}:${new Date().toISOString().slice(0, 10)}`;
    if (AUTO_RAN.has(key)) return;
    AUTO_RAN.add(key);
    const effects = autoTaskEffects(store.state, { people: sources.people });
    if (!effects.length) return;
    store.runEffects(effects).then((n) => {
      if (n) setAutoNote(`${effects.length} påminnelser ligger som oppgaver i Oppgaver (forfalte gjennomganger, vurderinger eller kompetanse).`);
    });
  }, [familyId, store.loading, caps.manage, store.state, sources.ready, sources.people, store]);

  const go = useCallback((next, nextParams = {}) => {
    const target = defaultIsoSubView(next);
    setParams({ ...nextParams, _t: Date.now() });
    setPage(target);
    if (target !== page) requestShellTab?.('iso', target);
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [page, requestShellTab]);

  const ctx = {
    state: store.state,
    store,
    caps,
    actor,
    people: sources.people,
    projects: sources.projects,
    sources,
    legacyAudits: sources.legacyAudits,
    wide,
    go,
    params,
    companyId: familyId,
    requestTab: requestShellTab,
    prefill: params?.prefill || null,
  };

  const Current = PAGES[page] || IsoDashboard;
  const needsSetup = !store.loading && !isSetUp(store.state) && page !== 'innstillinger';
  const isSettings = page === 'innstillinger';

  let body;
  if (!familyId) {
    body = <Empty icon="business-outline" title="Velg en bedrift" text="ISO / K-HMS hører til en bedrift. Bytt til bedriftsprofilen." />;
  } else if (!caps.view) {
    body = <Empty icon="lock-closed-outline" title="Ingen tilgang" text="Du har ikke tilgang til ISO / K-HMS. Be en administrator om tilgang under Tilgang." />;
  } else if (isSettings && !caps.admin) {
    body = <Empty icon="lock-closed-outline" title="Bare for administrator" text="Innstillingene for ledelsessystemet kan bare endres av administrator i ISO." />;
  } else if (store.loading && !store.state.system.setupAt) {
    body = <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colors.brand} /><Text style={{ color: colors.muted, marginTop: 8 }}>Henter ledelsessystemet …</Text></View>;
  } else if (needsSetup && page !== 'avvik') {
    body = (
      <Empty
        icon="shield-checkmark-outline"
        title="Ledelsessystemet er ikke satt opp"
        text={caps.admin
          ? 'Oppsettet fylles ut fra selskapsprofilen, og startpakken lager prosesser, skjema, lovkrav og planer automatisk. Ingen eksempeldata legges inn.'
          : 'En administrator må aktivere ledelsessystemet. Du kan likevel melde avvik.'}
        action={(
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {caps.admin ? <Btn kind="primary" icon="flash-outline" label="Sett opp ledelsessystemet" onPress={() => go('innstillinger')} /> : null}
            <Btn icon="add" label="Meld avvik" onPress={() => go('avvik', { create: true })} />
          </View>
        )}
      />
    );
  } else {
    body = <Current ctx={ctx} />;
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 14, maxWidth: wide ? 1280 : 980, width: '100%', alignSelf: 'flex-start' }}
      keyboardShouldPersistTaps="handled"
    >
      {store.loadError ? <Banner tone={store.source === 'cache' ? 'warn' : 'danger'} text={store.loadError} /> : null}
      {store.source === 'cache' ? <Btn small icon="refresh" label="Prøv igjen" onPress={store.reload} /> : null}
      {autoNote && page === 'oversikt' ? <Banner tone="info" icon="notifications-outline" text={autoNote} /> : null}
      {body}
    </ScrollView>
  );
}
