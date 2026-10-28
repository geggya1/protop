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
import { isSuperAdmin } from '../../src/utils/groups';
import { defaultIsoSubView } from '../../src/navigation/shellModules';
import { approverUidsFromRoles, isoCapabilities } from '../../src/iso/access';
import { isSetUp } from '../../src/iso/state';
import { markRanToday, runIsoAutomation } from './isoAutoRun';
import { replaceIn } from '../../src/iso/state';
import QuickReportButton, { MyReports } from './QuickReport';
import { externalFormControls, mergeForms } from '../../src/iso/docControlLink';
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
import { AnnualWheelPage, CommunicationPage, OrganizationPage } from './IsoPlanning';
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
  organisasjon: OrganizationPage,
  kommunikasjon: CommunicationPage,
  mal: ObjectivesPage,
  arshjul: AnnualWheelPage,
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
  const windowWide = useWide();
  // Tipsfeltet til høyre tar plass på desktop: bred layout krever at plassen ISO faktisk får er bred nok.
  const [boxWidth, setBoxWidth] = useState(0);
  const wide = windowWide && (!boxWidth || boxWidth >= 760);
  const { family, familyId, uid, activeProfile, requestShellTab } = useApp();
  const access = useCompanyAccess();
  const actor = useMemo(() => ({
    uid: uid || '',
    name: String(activeProfile?.name || activeProfile?.displayName || '').trim() || 'Bruker',
  }), [uid, activeProfile?.name, activeProfile?.displayName]);
  // Eier = full ISO-tilgang (som i resten av ProTop). Ellers tilgangsmatrisen; mangler den, ingen tilgang.
  const owner = isSuperAdmin(family, uid);
  const bypass = owner && !access.previewing;
  const store = useIsoStore({ companyId: familyId, actor, family, employees: access.employees, ready: !!access.ready || owner });
  // Skjermet tilgang: bare personer på listen i ISO-innstillingene. Serverens nivå begrenser klienten.
  const caps = useMemo(() => isoCapabilities({
    grants: access.active && access.ready ? access.grants : null,
    bypass,
    uid,
    restricted: store.state.restrictedGrants,
    serverIso: store.serverIso,
    // Godkjennere: lagret liste (som Firestore-reglene leser), ellers utledet av rollene.
    approverUids: Array.isArray(store.state.system?.approverUids)
      ? store.state.system.approverUids
      : approverUidsFromRoles(store.state.system?.roleMap, store.state.system?.ownerUid),
  }), [access.active, access.ready, access.grants, bypass, uid, store.state.restrictedGrants, store.serverIso, store.state.system?.approverUids, store.state.system?.roleMap, store.state.system?.ownerUid]);
  const canSeeHr = bypass || (typeof access.canView === 'function' && access.canView('hrCompliance'));
  // Prosjekter og utstyr følger Prosjekt og Utstyr i tilgangsstyringen. Den som behandler ISO-saker
  // trenger alle prosjektene (avvik og prosjektkvalitet); ellers bare egne prosjekter.
  const isoViewer = access.previewing && access.viewingAs ? access.viewingAs : access.employee;
  const sources = useIsoSources({
    familyId,
    family,
    canManage: caps.manage,
    canSeeHr,
    allProjects: bypass || caps.manage || (access.ready && access.canAdmin('projects')),
    allGear: bypass || caps.manage || (access.ready && access.canAdmin('equipment')),
    viewer: isoViewer,
  });

  const [page, setPage] = useState(defaultIsoSubView(subView));
  const [params, setParams] = useState({});
  const [autoNote, setAutoNote] = useState('');
  const [reportStamp, setReportStamp] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    const next = defaultIsoSubView(subView);
    setPage((cur) => {
      if (cur !== next) setParams({});
      return next;
    });
  }, [subView]);

  // Automatikk: kvalitetsplan for nye prosjekter, påminnelser og eskalering av forfalte frister
  // (tiltak, triage, saker, prosesstrinn, gjennomganger, vurderinger, kompetanse, øvelser, vedtak).
  // Nøklene er idempotente, så gjentatt kjøring gir ingen duplikater.
  useEffect(() => {
    if (!familyId || store.loading || !caps.manage || !isSetUp(store.state) || !sources.ready) return;
    const key = `${familyId}:${uid}:${new Date().toISOString().slice(0, 10)}:${sources.projects.length}`;
    if (AUTO_RAN.has(key)) return;
    AUTO_RAN.add(key);
    (async () => {
      const res = await runIsoAutomation({
        companyId: familyId,
        actor,
        state: store.current(),
        people: sources.people,
        projects: sources.projects,
        contracts: sources.contracts,
        equipment: sources.equipment,
        // Nye prosjekter får kvalitetsplan automatisk (utkast fylt ut fra prosjekt og kontrakt).
        saveRecord: (result, effects) => store.commit('records', 'record', result, { createOnly: true, effects }),
        runEffects: store.runEffects,
      });
      // Skallet (IsoAutomation) trenger ikke kjøre det samme igjen i dag.
      await markRanToday(familyId, uid);
      if (res.notes.length) setAutoNote(`${res.notes.join('. ')}.`);
    })();
  }, [familyId, store.loading, caps.manage, store.state, sources.ready, sources.people, sources.projects, sources.contracts, sources.equipment, store, actor, uid]);

  const go = useCallback((next, nextParams = {}) => {
    const target = defaultIsoSubView(next);
    setParams({ ...nextParams, _t: Date.now() });
    setPage(target);
    if (target !== page) requestShellTab?.('iso', target);
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [page, requestShellTab]);

  // Maler fra KS-biblioteket godkjennes i Skjemabygger → Dokumentstyring. ISO bruker den godkjente versjonen.
  const viewState = useMemo(() => {
    const external = externalFormControls(sources.docControls, sources.formTemplates);
    return external.length ? { ...store.state, forms: mergeForms(store.state.forms, external) } : store.state;
  }, [store.state, sources.docControls, sources.formTemplates]);

  const ctx = {
    state: viewState,
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
    family,
    accessEmployees: access.employees || [],
    // Anbefalt tilgang for rollene (Innstillinger): samme tak som i tilgangsstyringen.
    accessActor: { uid: uid || '', grants: access.actorGrants || access.grants || {}, bypass },
    accessPolicy: family?.company?.accessPolicy || null,
    canGrantAccess: bypass || (!!access.ready && !access.previewing && access.canEdit('accessControl')),
    requestTab: requestShellTab,
    prefill: params?.prefill || null,
    // Hurtigmelding (Meld RUH): saken vises med en gang, uten å laste ISO på nytt.
    onQuickSent: (list) => store.setState((cur) => (list || []).reduce((acc, f) => (f?.id ? replaceIn(acc, 'findings', f) : acc), cur)),
  };

  const Current = PAGES[page] || IsoDashboard;
  // Prosesslandskapet og prosesskartene bruker hele bredden; de andre sidene leses best smalere.
  const fullWidth = wide && page === 'prosesser';
  const needsSetup = !store.loading && !isSetUp(store.state) && page !== 'innstillinger';
  const isSettings = page === 'innstillinger';

  let body;
  if (!familyId) {
    body = <Empty icon="business-outline" title="Velg en bedrift" text="ISO / K-HMS hører til en bedrift. Bytt til bedriftsprofilen." />;
  } else if (store.loading && store.serverIso == null) {
    body = <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colors.brand} /><Text style={{ color: colors.muted, marginTop: 8 }}>Kontrollerer tilgang …</Text></View>;
  } else if (!caps.view) {
    // Meldetilgang (ISO-04): alle i selskapet, også innleide og eksterne, kan melde RUH og se egne meldinger.
    body = (
      <View style={{ gap: 14 }}>
        <QuickReportButton onSent={() => setReportStamp(Date.now())} />
        <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, backgroundColor: colors.card }}>
          <MyReports companyId={familyId} uid={uid} stamp={reportStamp} />
        </View>
        <Empty
          icon="lock-closed-outline"
          title="Resten av ISO krever tilgang"
          text={store.serverIso === 0 && access.grants?.iso && access.grants.iso !== 'none'
            ? 'Tilgangen din er ikke bekreftet av serveren ennå. Prøv igjen om litt, eller be eieren av selskapet åpne ISO.'
            : 'Du kan melde avvik og se dine egne meldinger. For prosesser, dokumenter og registre: be en administrator om tilgang under Tilgang.'}
          action={<Btn icon="refresh" label="Prøv igjen" onPress={store.reload} />}
        />
      </View>
    );
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
            <QuickReportButton variant="button" />
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
      onLayout={(e) => setBoxWidth(Math.round(e.nativeEvent.layout.width))}
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 14, maxWidth: fullWidth ? undefined : (wide ? 1280 : 980), width: '100%', alignSelf: 'flex-start' }}
      keyboardShouldPersistTaps="handled"
    >
      {store.loadError ? <Banner tone={store.source === 'cache' ? 'warn' : 'danger'} text={store.loadError} /> : null}
      {store.source === 'cache' ? <Btn small icon="refresh" label="Prøv igjen" onPress={store.reload} /> : null}
      {autoNote && page === 'oversikt' ? <Banner tone="info" icon="notifications-outline" text={autoNote} /> : null}
      {body}
    </ScrollView>
  );
}
