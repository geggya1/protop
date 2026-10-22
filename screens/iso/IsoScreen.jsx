/**
 * ISO / K-HMS — ett integrert ledelsessystem for ISO 9001, 14001 og 45001.
 * Gjenbruker ProTops ansatte, prosjekter, oppgaver og tilgangsmatrise.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { watchEmployees } from '../../src/employees/storage';
import { displayName, isDeletedEmployee } from '../../src/employees/model';
import { loadProjectState } from '../../src/project/storage';
import { ISO_MENU, defaultIsoSubView } from '../../src/navigation/shellModules';
import { isoCapabilities } from '../../src/iso/access';
import { isSetUp } from '../../src/iso/state';
import { useIsoStore } from './useIsoStore';
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

function SubNav({ page, onPick, caps }) {
  const colors = useColors();
  const items = ISO_MENU.filter((i) => i.id !== 'innstillinger' || caps.admin);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
      {items.map((item) => {
        const on = item.id === page;
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onPick(item.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, minHeight: 38, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }}
          >
            <Ionicons name={item.icon} size={15} color={on ? colors.brand : colors.muted} />
            <Text style={{ color: colors.ink, fontSize: 13, fontWeight: on ? '700' : '400' }}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export default function IsoScreen({ subView = 'oversikt' }) {
  const colors = useColors();
  const wide = useWide();
  const { familyId, uid, activeProfile, requestShellTab } = useApp();
  const access = useCompanyAccess();
  const actor = useMemo(() => ({
    uid: uid || '',
    name: String(activeProfile?.name || activeProfile?.displayName || '').trim() || 'Bruker',
  }), [uid, activeProfile?.name, activeProfile?.displayName]);
  const caps = useMemo(() => isoCapabilities({
    grants: access.active ? access.grants : null,
    bypass: !access.active || (access.bypass && !access.previewing),
    uid,
  }), [access.active, access.grants, access.bypass, access.previewing, uid]);

  const [page, setPage] = useState(defaultIsoSubView(subView));
  const [params, setParams] = useState({});
  const [employees, setEmployees] = useState([]);
  const [projectState, setProjectState] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const next = defaultIsoSubView(subView);
    setPage((cur) => {
      if (cur !== next) setParams({});
      return next;
    });
  }, [subView]);

  useEffect(() => {
    if (!familyId) return undefined;
    return watchEmployees(familyId, (rows) => setEmployees(rows || []));
  }, [familyId]);

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    loadProjectState(familyId).then((s) => { if (live) setProjectState(s); }).catch(() => {});
    return () => { live = false; };
  }, [familyId]);

  const store = useIsoStore({ companyId: familyId, caps, actor });

  const people = useMemo(() => employees
    .filter((e) => !isDeletedEmployee(e))
    .map((e) => ({ id: e.id, name: displayName(e), uid: e.personUid || '' }))
    .filter((p) => p.name && p.name !== 'Uten navn'), [employees]);
  const projects = useMemo(() => (projectState?.projects || []).filter((p) => p.status !== 'arkivert'), [projectState]);
  const legacyAudits = useMemo(() => (projectState?.audits || []).map((a) => ({
    ...a,
    projectName: (projectState?.projects || []).find((p) => p.id === a.projectId)?.name || '',
  })), [projectState]);

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
    people,
    projects,
    legacyAudits,
    wide,
    go,
    params,
    companyId: familyId,
    requestTab: requestShellTab,
    prefill: params?.prefill || null,
  };

  const Current = PAGES[page] || IsoDashboard;
  const needsSetup = !store.loading && !isSetUp(store.state) && !['innstillinger'].includes(page);

  let body;
  if (!familyId) {
    body = <Empty icon="business-outline" title="Velg en bedrift" text="ISO / K-HMS hører til en bedrift. Bytt til bedriftsprofilen øverst." />;
  } else if (!caps.view) {
    body = <Empty icon="lock-closed-outline" title="Ingen tilgang" text="Du har ikke tilgang til ISO / K-HMS. Be en administrator om tilgang under Tilgang." />;
  } else if (store.loading && !store.state.system.setupAt) {
    body = <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colors.brand} /><Text style={{ color: colors.muted, marginTop: 8 }}>Henter ledelsessystemet …</Text></View>;
  } else if (needsSetup && page !== 'avvik') {
    body = (
      <Empty
        icon="shield-checkmark-outline"
        title="Ledelsessystemet er ikke satt opp"
        text={caps.admin ? 'Velg standarder, omfang og roller for å komme i gang. Ingen eksempeldata blir lagt inn.' : 'En administrator må velge standarder og omfang før modulen tas i bruk. Du kan likevel melde avvik.'}
        action={(
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {caps.admin ? <Btn kind="primary" label="Sett opp ledelsessystemet" onPress={() => go('innstillinger')} /> : null}
            <Btn label="Meld avvik" onPress={() => go('avvik', { create: true })} />
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
      contentContainerStyle={{ padding: wide ? 24 : 16, paddingBottom: 120, gap: 16, maxWidth: 1600, width: '100%', alignSelf: 'center' }}
      keyboardShouldPersistTaps="handled"
    >
      {caps.view && familyId ? <SubNav page={page} caps={caps} onPick={(id) => go(id)} /> : null}
      {store.loadError ? <Banner tone={store.source === 'cache' ? 'warn' : 'danger'} text={store.loadError} /> : null}
      {store.source === 'cache' ? <Btn small icon="refresh" label="Prøv igjen" onPress={store.reload} /> : null}
      {body}
    </ScrollView>
  );
}
