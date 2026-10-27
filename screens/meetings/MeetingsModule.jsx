/**
 * Møter: oversikt, oppfølging og maler, og selve møtet når det er åpnet.
 * Alt det modulen trenger kommer inn som props, så appen og /moter-demo
 * bruker samme skjerm med hver sin lagring.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { showSaveToast } from '../../src/ui/saveToast';
import { canSeeMeeting, todayOslo } from '../../src/meetings/model';
import MeetingList from './MeetingList';
import MeetingWorkspace from './MeetingWorkspace';
import NewMeetingDialog from './NewMeetingDialog';
import FollowUpView from './FollowUpView';
import TemplatesView from './TemplatesView';
import * as actions from './meetingActions';
import { Banner, Btn, Spinner } from './meetingUi';

const PAGE_TITLES = {
  oversikt: ['Møter', 'Planlegg, gjennomfør og send referat. Faste møter fører åpne punkter videre til neste møte.'],
  oppfolging: ['Oppfølging', 'Alle oppfølgingspunkter fra møtene, med ansvarlig og frist.'],
  maler: ['Møtemaler', 'Bedriftens egne maler og ProTops ferdige maler for vanlige møter.'],
};

export default function MeetingsModule({
  subView = 'oversikt',
  onNavigate,
  store,
  viewer,
  people = [],
  projects = [],
  company = {},
  logo = null,
  canCreate = false,
  isAdmin = false,
  intent = null,
  onIntentDone,
  onOpenFormBuilder,
  today: todayProp,
}) {
  const colors = useColors();
  const today = todayProp || todayOslo();
  const [meetings, setMeetings] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState('');
  const [openTab, setOpenTab] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newPreset, setNewPreset] = useState(null);
  const [width, setWidth] = useState(1200);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!store) return undefined;
    setLoaded(false);
    const stopMeetings = store.watchMeetings((rows) => {
      setMeetings(rows);
      setLoaded(true);
    }, (cause) => {
      setError(String(cause?.message || 'Klarte ikke hente møtene.'));
      setLoaded(true);
    });
    const stopTemplates = store.watchTemplates((rows) => setTemplates(rows));
    return () => {
      stopMeetings?.();
      stopTemplates?.();
    };
  }, [store]);

  const visible = useMemo(
    () => meetings.filter((m) => canSeeMeeting(m, { ...viewer, admin: isAdmin })),
    [meetings, viewer, isAdmin],
  );
  const open = visible.find((m) => m.id === openId) || null;

  const ctxRef = useRef({});
  ctxRef.current = { ...ctxRef.current, store, company, logo, viewer, meetings };

  const openMeeting = useCallback((id, tab = '') => {
    setOpenId(id);
    setOpenTab(tab);
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, []);

  // Ny underside fra menyen lukker møtet som er åpent.
  useEffect(() => { setOpenId(''); }, [subView]);

  useEffect(() => {
    if (!intent || !loaded) return;
    if (intent.type === 'openMeeting' && intent.meetingId) openMeeting(intent.meetingId);
    if (intent.type === 'newMeeting' && canCreate) {
      setNewPreset({ projectId: intent.projectId || '' });
      setNewOpen(true);
    }
    onIntentDone?.();
  }, [intent, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(draft) {
    const result = await actions.createMeeting(ctxRef.current, draft);
    setNewOpen(false);
    showSaveToast(result.message);
    openMeeting(result.meeting.id, 'agenda');
  }

  async function createNext(previous) {
    try {
      const result = await actions.createNext(ctxRef.current, previous);
      setNewOpen(false);
      showSaveToast(result.message);
      openMeeting(result.meeting.id, 'agenda');
    } catch (cause) {
      setError(String(cause?.message || 'Neste møte ble ikke laget.'));
    }
  }

  function startFromList(id) {
    openMeeting(id, 'live');
  }

  function navigate(sub) {
    setOpenId('');
    onNavigate?.(sub);
  }

  const [pageTitle, pageText] = PAGE_TITLES[subView] || PAGE_TITLES.oversikt;
  const phone = width < 640;

  let body = null;
  if (!loaded) {
    body = <Spinner label="Henter møtene …" />;
  } else if (open) {
    body = (
      <MeetingWorkspace
        key={open.id}
        meeting={open}
        meetings={visible}
        ctxRef={ctxRef}
        viewer={viewer}
        isAdmin={isAdmin}
        people={people}
        projects={projects}
        company={company}
        logo={logo}
        today={today}
        width={width}
        initialTab={openTab}
        onBack={() => setOpenId('')}
        onOpen={(id) => openMeeting(id)}
        onCreateNext={createNext}
        onSaveTemplate={(tpl) => store.saveTemplate(tpl)}
      />
    );
  } else if (subView === 'oppfolging') {
    body = <FollowUpView meetings={visible} today={today} viewer={viewer} onOpen={openMeeting} width={width} />;
  } else if (subView === 'maler') {
    body = (
      <TemplatesView
        templates={templates}
        store={store}
        canEdit={canCreate}
        viewer={viewer}
        width={width}
        onUse={(templateId) => { setNewPreset({ step: 'mal', source: 'mal', templateId }); setNewOpen(true); }}
        onOpenFormBuilder={onOpenFormBuilder}
        companyId={store?.companyId}
      />
    );
  } else {
    body = (
      <MeetingList
        meetings={visible}
        today={today}
        viewer={viewer}
        projects={projects}
        canCreate={canCreate}
        width={width}
        onOpen={openMeeting}
        onStart={startFromList}
        onNew={() => { setNewPreset(null); setNewOpen(true); }}
        onNext={createNext}
        onFollowUp={() => navigate('oppfolging')}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={[styles.scroll, phone && { padding: 12 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          {!open ? (
            <View style={[styles.head, phone && { flexDirection: 'column', alignItems: 'flex-start' }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">{pageTitle}</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>{pageText}</Text>
              </View>
              {canCreate && subView !== 'maler' ? (
                <Btn label="Nytt møte" icon="add" tone="primary" onPress={() => { setNewPreset(null); setNewOpen(true); }} nativeID="meetings-new" />
              ) : null}
            </View>
          ) : null}
          {error ? (
            <Banner tone="danger" icon="alert-circle" action={<Btn small label="Lukk" tone="plain" onPress={() => setError('')} />}>{error}</Banner>
          ) : null}
          {body}
        </View>
      </ScrollView>
      <NewMeetingDialog
        visible={newOpen}
        onClose={() => setNewOpen(false)}
        onCreate={create}
        onNext={canCreate ? createNext : null}
        meetings={visible}
        templates={templates}
        people={people}
        projects={projects}
        viewer={viewer}
        today={today}
        store={store}
        companyId={store?.companyId}
        preset={newPreset}
        onOpenFormBuilder={onOpenFormBuilder}
        width={width}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  scroll: { padding: 20, paddingBottom: 60 },
  inner: { width: '100%', maxWidth: 1240, alignSelf: 'center', gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { fontSize: 13.5, marginTop: 2 },
});
