import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen } from '../../components/ui';
import { colors, radius, useLayout } from '../../src/theme';
import { useApp } from '../../src/context/AppContext';
import CompactBackLink from '../../components/CompactBackLink';
import CalendarLayerList from '../../components/CalendarLayerList';
import EdgeSwipeBack from '../../components/EdgeSwipeBack';
import ConfirmDialog, { InfoDialog } from '../../components/ConfirmDialog';
import { isoWeekKeys } from '../../src/utils/dates';
import { calendarConnectionLayerId, HIDDEN_CALENDAR_LAYERS_KEY, icsDisplayLabel } from '../../src/utils/timeGrid';
import {
  addIcsCalendar,
  connectGoogleCalendar,
  connectMicrosoftCalendar,
  reconnectMicrosoftCalendar,
  fetchExternalCalendarEvents,
  friendlyMicrosoftAuthMessage,
  isMicrosoftAuthExpiredMessage,
  getCalendarOAuthConfig,
  listCalendarConnections,
  removeCalendarConnection,
  OPEN_CALENDAR_SETTINGS_KEY,
  CALENDAR_SOURCE_META,
} from '../../src/utils/calendarIntegration';
import BrandToggle from '../../components/BrandToggle';
import {
  childrenWithCustody,
  custodySummaryLabel,
  resolveCustodyLabels,
} from '../../src/utils/custodySchedule';
import {
  loadCustodyOverlayPrefs,
  saveCustodyOverlayPrefs,
} from '../../src/utils/custodyOverlayPrefs';

const AZURE_AUTH_URL = 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Authentication/appId/d641e51b-4503-43d8-b2f4-332acb296864';
const AZURE_SECRET_URL = 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Credentials/appId/d641e51b-4503-43d8-b2f4-332acb296864';

function ConnectionRow({ item, onRemove, onReconnect, onToggleVisible, hidden, busy, hasClientSecret }) {
  const meta = CALENDAR_SOURCE_META[item.type] || CALENDAR_SOURCE_META.ics;
  const err = item.lastError
    ? (item.type === 'microsoft' ? friendlyMicrosoftAuthMessage(item.lastError) : item.lastError)
    : '';
  const needsReauth = item.type === 'microsoft'
    && (item.needsReauth || !!item.lastError || isMicrosoftAuthExpiredMessage(err)
      || (hasClientSecret && !item.longLived));
  const sessionHint = item.type !== 'microsoft'
    ? null
    : (item.longLived
      ? 'Forblir innlogget — fornyes automatisk'
      : 'Utløper etter 24 timer. Koble til på nytt etter Azure Web-oppsett.');

  return (
    <View style={styles.connRow}>
      <View style={[styles.connIcon, { backgroundColor: `${meta.color}18` }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.connTitle} numberOfLines={1}>
          {item.type === 'ics' ? icsDisplayLabel(item) : (item.email || item.label || meta.label)}
        </Text>
        <Text style={styles.connSub}>
          {item.type === 'ics'
            ? 'ICS · kun synlig for deg'
            : (item.email && item.label && item.label !== meta.label
              ? `${meta.label} · ${item.label} · kun synlig for deg`
              : `${meta.label} · kun synlig for deg`)}
        </Text>
        {typeof item.lastSyncCount === 'number' ? (
          <Text style={styles.connSub}>
            {item.lastSyncCount === 1
              ? '1 hendelse ved siste synk'
              : `${item.lastSyncCount} hendelser ved siste synk`}
          </Text>
        ) : null}
        {item.lastSkippedCount > 0 ? (
          <Text style={styles.connSub}>
            Hoppet over {item.lastSkippedCount} kalendere uten lesetilgang
          </Text>
        ) : null}
        {sessionHint ? (
          <Text style={item.longLived ? styles.connSub : styles.connWarn}>{sessionHint}</Text>
        ) : null}
        {hidden ? (
          <Text style={styles.connWarn}>Skjult i kalenderen — hendelsene vises ikke</Text>
        ) : null}
        {err ? (
          <Text style={styles.connErr} numberOfLines={4}>{err}</Text>
        ) : null}
        <View style={styles.connActions}>
          {onToggleVisible ? (
            <TouchableOpacity
              onPress={() => onToggleVisible(item.id)}
              disabled={busy}
              style={styles.reconnectBtn}
              accessibilityLabel={hidden ? 'Vis kalender i ukeplanen' : 'Skjul kalender i ukeplanen'}
            >
              <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={14} color={colors.brand} />
              <Text style={styles.reconnectTxt}>{hidden ? 'Vis i kalenderen' : 'Skjul i kalenderen'}</Text>
            </TouchableOpacity>
          ) : null}
          {needsReauth ? (
            <TouchableOpacity
              onPress={() => onReconnect(item.id)}
              disabled={busy}
              style={styles.reconnectBtn}
              accessibilityLabel="Koble til Outlook på nytt"
            >
              <Ionicons name="refresh" size={14} color={colors.brand} />
              <Text style={styles.reconnectTxt}>
                {item.longLived ? 'Koble til på nytt' : 'Oppgrader innlogging'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <TouchableOpacity
        onPress={() => onRemove(item.id)}
        disabled={busy}
        style={styles.removeBtn}
        accessibilityLabel="Fjern kalender"
      >
        <Ionicons name="trash-outline" size={16} color={colors.danger} />
        <Text style={styles.removeTxt}>Fjern</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function CalendarSettingsScreen({
  inShell = false, onBack, calendars, hiddenCals: hiddenCalsProp, onToggleCal,
  custodyOverlayPrefs: custodyOverlayPrefsProp, onCustodyOverlayChange,
} = {}) {
  const nav = useNavigation();
  const { isParent, uid, kids, parents, familyId } = useApp();
  const { isDesktop } = useLayout();
  const goBack = useCallback(() => {
    if (typeof onBack === 'function') onBack();
    else nav.goBack();
  }, [onBack, nav]);

  useEffect(() => {
    if (inShell) return undefined;
    if (typeof window === 'undefined') return undefined;
    try {
      window.sessionStorage.setItem(OPEN_CALENDAR_SETTINGS_KEY, '1');
    } catch { /* ignore */ }
    nav.replace('Home', { openShell: { tab: 'plan' } });
    return undefined;
  }, [inShell, nav]);
  const [connections, setConnections] = useState([]);
  const [hiddenLocal, setHiddenLocal] = useState(() => new Set());
  const hiddenCals = hiddenCalsProp || hiddenLocal;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [icsUrl, setIcsUrl] = useState('');
  const [icsLabel, setIcsLabel] = useState('');
  const [oauth, setOauth] = useState({ google: false, microsoft: false, hasClientSecret: false });
  const [removeId, setRemoveId] = useState(null);
  const [info, setInfo] = useState({ visible: false, title: '', message: '' });
  const [custodyPrefsLocal, setCustodyPrefsLocal] = useState({ showOverlay: false, childFilter: 'all' });
  const custodyPrefs = custodyOverlayPrefsProp || custodyPrefsLocal;
  const custodyKids = useMemo(() => childrenWithCustody(kids), [kids]);
  const activeKids = useMemo(
    () => (kids || []).filter((k) => k.active !== false && k.archived !== true),
    [kids],
  );

  const parentNameByUid = useMemo(() => {
    const map = {};
    (parents || []).forEach((p) => {
      const id = p.uid || p.id;
      if (id) map[id] = p.name || 'Foresatt';
    });
    return map;
  }, [parents]);

  const setCustodyPrefs = useCallback(async (patch) => {
    if (typeof onCustodyOverlayChange === 'function') {
      onCustodyOverlayChange(patch);
      return;
    }
    const next = await saveCustodyOverlayPrefs(uid, patch);
    setCustodyPrefsLocal(next);
  }, [onCustodyOverlayChange, uid]);

  const showInfo = (title, message) => setInfo({ visible: true, title, message });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, cfg] = await Promise.all([
        listCalendarConnections(),
        getCalendarOAuthConfig(),
      ]);
      setConnections(list);
      setOauth({
        google: !!cfg?.google?.configured,
        microsoft: !!cfg?.microsoft?.configured,
        microsoftClientId: cfg?.microsoft?.clientId || '',
        hasClientSecret: !!cfg?.microsoft?.hasClientSecret,
      });
    } catch (e) {
      showInfo('Feil', e?.message || 'Klarte ikke laste kalenderinnstillinger.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (custodyOverlayPrefsProp) return undefined;
    if (!uid) {
      setCustodyPrefsLocal({ showOverlay: false, childFilter: 'all' });
      return undefined;
    }
    let alive = true;
    loadCustodyOverlayPrefs(uid).then((prefs) => {
      if (alive) setCustodyPrefsLocal(prefs);
    });
    return () => { alive = false; };
  }, [uid, custodyOverlayPrefsProp]);

  useEffect(() => {
    if (hiddenCalsProp) return undefined;
    if (!uid) {
      setHiddenLocal(new Set());
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`${HIDDEN_CALENDAR_LAYERS_KEY}.${uid}`);
        if (!alive) return;
        const list = raw ? JSON.parse(raw) : [];
        setHiddenLocal(new Set(Array.isArray(list) ? list : []));
      } catch {
        if (alive) setHiddenLocal(new Set());
      }
    })();
    return () => { alive = false; };
  }, [uid, hiddenCalsProp]);

  const toggleLayer = (layerId) => {
    if (!layerId) return;
    if (typeof onToggleCal === 'function') {
      onToggleCal(layerId);
      return;
    }
    setHiddenLocal((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      if (uid) {
        AsyncStorage.setItem(
          `${HIDDEN_CALENDAR_LAYERS_KEY}.${uid}`,
          JSON.stringify([...next]),
        ).catch(() => {});
      }
      return next;
    });
  };

  const toggleVisible = (connectionId) => {
    toggleLayer(calendarConnectionLayerId(connectionId));
  };

  const handleAddIcs = async () => {
    if (!icsUrl.trim()) return;
    setBusy(true);
    try {
      const res = await addIcsCalendar({ url: icsUrl.trim(), label: icsLabel.trim() || 'ICS-kalender' });
      if (!res?.ok) throw new Error(res?.error || 'Kunne ikke legge til ICS');
      setIcsUrl('');
      setIcsLabel('');
      await reload();
      showInfo('Lagt til', 'ICS-kalenderen vises nå i kalenderen din.');
    } catch (e) {
      showInfo('Feil', e?.message || 'Kunne ikke legge til ICS-kalender.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = (id) => setRemoveId(id);

  const confirmRemove = async () => {
    const id = removeId;
    setRemoveId(null);
    if (!id) return;
    setBusy(true);
    try {
      await removeCalendarConnection(id);
      await reload();
    } catch (e) {
      showInfo('Feil', e?.message || 'Klarte ikke fjerne kalenderen.');
    } finally {
      setBusy(false);
    }
  };

  const finishConnectProbe = async () => {
    const week = isoWeekKeys(new Date());
    let probe = { events: [], errors: [] };
    try {
      probe = await fetchExternalCalendarEvents(week[0], week[week.length - 1], { force: true });
    } catch (e) {
      probe = { events: [], errors: [{ message: e?.message || 'Klarte ikke hente hendelser' }] };
    }
    const list = await listCalendarConnections();
    setConnections(list);
    const n = probe.events?.length || 0;
    const errMsg = friendlyMicrosoftAuthMessage(
      probe.errors?.[0]?.message
        || (list || []).find((c) => c.lastError)?.lastError
        || '',
    );
    const diag = probe.diagnostics;
    const diagLine = diag
      ? `\n\nGraph: ${diag.rawCount || 0} råhendelser fra ${diag.calendarCount || 0} kalendere.`
      : '';
    const skippedLine = diag?.skipped?.length
      ? `\nHoppet over: ${diag.skipped.slice(0, 4).join(', ')}`
      : '';
    const outlook = (list || []).filter((c) => c.type === 'microsoft');
    const longLivedCount = outlook.filter((c) => c.longLived).length;
    const sessionLine = !outlook.length
      ? ''
      : (longLivedCount === outlook.length
        ? '\n\nOutlook forblir innlogget og fornyes automatisk (mer enn 24 timer).'
        : '\n\nDenne innloggingen utløper etter 24 timer. Sett Azure til plattform Web + client secret, og trykk «Oppgrader innlogging».');
    if (errMsg && n === 0) {
      showInfo(
        'Tilkoblet, men henting feilet',
        `${errMsg}${diagLine}${skippedLine}${sessionLine}`,
      );
    } else if (errMsg && n > 0) {
      showInfo(
        'Delvis tilkoblet',
        `Fant ${n} hendelse${n === 1 ? '' : 'r'} fra den andre kalenderen, men én konto synkroniserer ikke.\n\n${errMsg}\n\nKoble til den kontoen på nytt under «Tilknyttede kalendere».${diagLine}${skippedLine}${sessionLine}`,
      );
    } else if (n === 0) {
      showInfo(
        'Tilkoblet',
        `Fant ingen hendelser denne uken i Outlook.${diagLine}${skippedLine}\n\nSjekk at du valgte kontoen som har avtalene (ikke en tom jobb-/gjestekonto), og godkjenn kalenderlesing i innloggingsvinduet.${sessionLine}`,
      );
    } else {
      const via = probe.source === 'graph-client' ? ' direkte fra Outlook' : '';
      showInfo(
        longLivedCount === outlook.length ? 'Tilkoblet' : 'Tilkoblet med 24-timers økt',
        `Fant ${n} hendelse${n === 1 ? '' : 'r'} denne uken${via}. De vises i ukeplanen din.${sessionLine}`,
      );
    }
  };

  const handleConnect = async (provider) => {
    if (provider === 'microsoft') {
      connectMicrosoftCalendar({ clientId: oauth.microsoftClientId }).catch((e) => {
        if (e?.message === 'cancelled') return;
        const msg = String(e?.message || e?.code || '');
        if (msg.includes('Popup window') || msg.includes('ERR_WEB_BROWSER')) {
          showInfo(
            'Innlogging',
            'Mobilnettleseren blokkerte et popup. Oppdater siden og prøv igjen — innloggingen skjer i samme vindu.',
          );
          return;
        }
        showInfo('Feil', friendlyMicrosoftAuthMessage(e?.message || 'Innlogging avbrutt.'));
      });
      return;
    }
    setBusy(true);
    try {
      await connectGoogleCalendar();
      await finishConnectProbe();
    } catch (e) {
      if (e?.message === 'cancelled') return;
      showInfo('Feil', friendlyMicrosoftAuthMessage(e?.message || 'Innlogging avbrutt.'));
    } finally {
      setBusy(false);
    }
  };

  const handleReconnect = (connectionId) => {
    reconnectMicrosoftCalendar(connectionId, { clientId: oauth.microsoftClientId }).catch((e) => {
      if (e?.message === 'cancelled') return;
      const msg = String(e?.message || e?.code || '');
      if (msg.includes('Popup window') || msg.includes('ERR_WEB_BROWSER')) {
        showInfo(
          'Innlogging',
          'Mobilnettleseren blokkerte et popup. Oppdater siden og prøv igjen — innloggingen skjer i samme vindu.',
        );
        return;
      }
      showInfo('Feil', friendlyMicrosoftAuthMessage(e?.message || 'Innlogging avbrutt.'));
    });
  };

  if (!isParent) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.infoTitle}>Kun for foreldre</Text>
          <Text style={styles.infoBody}>Eksterne kalendere kan kobles til fra en foreldrekonto.</Text>
        </View>
      </Screen>
    );
  }

  if (!inShell && typeof window !== 'undefined') {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.infoBody}>Åpner kalenderinnstillinger…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <EdgeSwipeBack enabled={!inShell || !isDesktop} onBack={goBack}>
      <ScrollView contentContainerStyle={[styles.body, isDesktop && styles.bodyDesktop]} showsVerticalScrollIndicator={false}>
        <CompactBackLink onPress={goBack} label={inShell ? 'Tilbake til kalenderen' : 'Tilbake'} />

        <Text style={[styles.title, isDesktop && styles.titleDesktop]}>Kalenderinnstillinger</Text>
        <Text style={[styles.lead, isDesktop && styles.leadDesktop]}>
          Koble til ekstern kalender (Outlook, Google, ICS) for å se avtalene dine — kun synlig for deg.
        </Text>

        {isParent ? (
          <>
            <Text style={styles.section}>Delt bosted</Text>
            <View style={styles.card}>
              <Text style={styles.hint}>
                Marker i kalenderen hvilke dager barna er hos deg eller den andre forelderen. Dette er en visuell markering — ikke hendelser.
              </Text>
              <View style={styles.custodyToggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.connTitle}>Vis bosted i kalenderen</Text>
                  <Text style={styles.connSub}>
                    {custodyKids.length
                      ? `${custodyKids.length} barn med delt bosted`
                      : 'Ingen barn med delt bosted ennå'}
                  </Text>
                </View>
                <BrandToggle
                  value={!!custodyPrefs.showOverlay}
                  onValueChange={(showOverlay) => setCustodyPrefs({ showOverlay })}
                />
              </View>
              {custodyPrefs.showOverlay && custodyKids.length > 1 ? (
                <View style={styles.childFilterRow}>
                  <Text style={styles.connSub}>Vis for</Text>
                  <View style={styles.childFilterChips}>
                    <TouchableOpacity
                      style={[styles.filterChip, custodyPrefs.childFilter === 'all' && styles.filterChipOn]}
                      onPress={() => setCustodyPrefs({ childFilter: 'all' })}
                    >
                      <Text style={[styles.filterChipTxt, custodyPrefs.childFilter === 'all' && styles.filterChipTxtOn]}>
                        Alle barn
                      </Text>
                    </TouchableOpacity>
                    {custodyKids.map((kid) => (
                      <TouchableOpacity
                        key={kid.id}
                        style={[styles.filterChip, custodyPrefs.childFilter === kid.id && styles.filterChipOn]}
                        onPress={() => setCustodyPrefs({ childFilter: kid.id })}
                      >
                        <Text style={[styles.filterChipTxt, custodyPrefs.childFilter === kid.id && styles.filterChipTxtOn]}>
                          {kid.name || 'Barn'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
              {activeKids.map((kid) => {
                const names = resolveCustodyLabels(kid.custody, { parents: parents || [] });
                return (
                  <TouchableOpacity
                    key={kid.id}
                    style={styles.custodyChildRow}
                    onPress={() => nav.navigate('CustodySettings', {
                      familyId,
                      childId: kid.id,
                      childName: kid.name || 'Barn',
                    })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.connTitle}>{kid.name || 'Barn'}</Text>
                      <Text style={styles.connSub}>{custodySummaryLabel(kid.custody, names)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        {!loading && oauth.microsoft && !oauth.hasClientSecret ? (
          <View style={styles.setupBox}>
            <Text style={styles.setupTitle}>Outlook utløper etter 24 timer</Text>
            <Text style={styles.setupTxt}>
              Microsoft gir bare langvarig innlogging når appen er Web + client secret. Gjør dette i Azure, deretter lagre secret i GitHub og koble til på nytt:
            </Text>
            <Text style={styles.setupStep}>1. Authentication: flytt https://www.protop.no/oauth/calendar til plattform Web. Fjern den fra SPA.</Text>
            <Text style={styles.setupStep}>2. Certificates & secrets: lag en client secret.</Text>
            <Text style={styles.setupStep}>3. GitHub Actions secret MICROSOFT_CLIENT_SECRET = verdien. Uten den overskriver CI secret med tomt.</Text>
            <Text style={styles.setupStep}>4. Etter deploy: «Oppgrader innlogging» på hver Outlook-konto.</Text>
            <View style={styles.setupLinks}>
              <TouchableOpacity onPress={() => Linking.openURL(AZURE_AUTH_URL)}>
                <Text style={styles.setupLink}>Åpne Azure Authentication</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Linking.openURL(AZURE_SECRET_URL)}>
                <Text style={styles.setupLink}>Åpne Azure client secret</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {!loading && oauth.hasClientSecret && connections.some((c) => c.type === 'microsoft' && !c.longLived) ? (
          <View style={styles.setupOk}>
            <Text style={styles.setupOkTxt}>
              Serveren har client secret. Trykk «Oppgrader innlogging» på hver Outlook-konto for å bytte fra 24-timers SPA-økt til varig innlogging.
            </Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
        ) : (
          <>
            <Text style={styles.section}>Tilknyttede kalendere</Text>
            <View style={styles.card}>
              {connections.length === 0 ? (
                <Text style={styles.empty}>Ingen eksterne kalendere ennå.</Text>
              ) : (
                connections.map((c) => (
                  <ConnectionRow
                    key={c.id}
                    item={c}
                    onRemove={handleRemove}
                    onReconnect={handleReconnect}
                    onToggleVisible={toggleVisible}
                    hidden={hiddenCals.has(calendarConnectionLayerId(c.id))}
                    busy={busy}
                    hasClientSecret={!!oauth.hasClientSecret}
                  />
                ))
              )}
            </View>

            {(calendars || []).length ? (
              <>
                <Text style={styles.section}>Vis i kalenderen</Text>
                <View style={styles.card}>
                  <Text style={styles.hint}>
                    Skru av delte kalendere under samme Outlook-konto, eller hele laget. Gjelder bare visningen din.
                  </Text>
                  <CalendarLayerList
                    calendars={calendars}
                    hiddenCals={hiddenCals}
                    onToggleCal={toggleLayer}
                    defaultExpanded
                  />
                </View>
              </>
            ) : null}

            {connections.some((c) => c.type === 'ics') && connections.some((c) => c.type === 'microsoft') ? (
              <View style={styles.setupOk}>
                <Text style={styles.setupOkTxt}>
                  Outlook-innlogging lager ikke ICS-kalendere. ICS-radene er egne abonnement (ofte gamle «publiser kalender»-lenker) og viser derfor hendelser i tillegg til Outlook. Fjern ICS du ikke trenger, så vises bare Outlook-avtalene.
                </Text>
              </View>
            ) : null}

            <Text style={styles.section}>ICS-lenke</Text>
            <View style={styles.card}>
              <Text style={styles.hint}>
                Lim inn en hemmelig ICS-URL fra Outlook, Google eller annen kalender.
              </Text>
              <TextInput
                value={icsLabel}
                onChangeText={setIcsLabel}
                placeholder="Navn (valgfritt)"
                style={styles.input}
                editable={!busy}
              />
              <TextInput
                value={icsUrl}
                onChangeText={setIcsUrl}
                placeholder="https://..."
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                editable={!busy}
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={handleAddIcs} disabled={busy || !icsUrl.trim()}>
                <Ionicons name="link" size={18} color="#fff" />
                <Text style={styles.primaryBtnTxt}>Legg til ICS-kalender</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.section}>Logg inn</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={[styles.oauthBtn, !oauth.google && styles.oauthDisabled]}
                onPress={() => handleConnect('google')}
                disabled={busy || !oauth.google}
              >
                <Ionicons name="logo-google" size={20} color="#4285f4" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.oauthTitle}>Google Kalender</Text>
                  <Text style={styles.oauthSub}>
                    {oauth.google ? 'Logg inn med Google-kontoen din' : 'Kommer snart — krever oppsett'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={[styles.oauthBtn, !oauth.microsoft && styles.oauthDisabled]}
                onPress={() => handleConnect('microsoft')}
                disabled={busy || !oauth.microsoft}
              >
                <Ionicons name="mail" size={20} color="#0078d4" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.oauthTitle}>Microsoft Outlook</Text>
                  <Text style={styles.oauthSub}>
                    {oauth.microsoft
                      ? (oauth.hasClientSecret
                        ? 'Jobb og privat. Koble til på nytt for varig innlogging (mer enn 24 timer).'
                        : 'Jobb og privat. Uten Azure Web + secret utløper økten etter 24 timer.')
                      : 'Ikke satt opp ennå'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.privacyBox}>
              <Ionicons name="lock-closed" size={16} color={colors.muted} />
              <Text style={styles.privacyTxt}>
                Eksterne kalendere er private og vises bare i din kalender.
              </Text>
            </View>
          </>
        )}

        {busy && <ActivityIndicator color={colors.brand} style={{ marginTop: 16 }} />}
        <View style={{ height: 32 }} />
      </ScrollView>
      </EdgeSwipeBack>
      <ConfirmDialog
        visible={!!removeId}
        title="Fjern kalender"
        message="Kalenderen fjernes fra visningen din. Du kan koble den til igjen senere."
        confirmText="Fjern"
        cancelText="Avbryt"
        danger
        onConfirm={confirmRemove}
        onCancel={() => setRemoveId(null)}
        onClose={() => setRemoveId(null)}
      />
      <InfoDialog
        visible={info.visible}
        title={info.title}
        message={info.message}
        onClose={() => setInfo({ visible: false, title: '', message: '' })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  bodyDesktop: { maxWidth: 720, paddingTop: 4, paddingHorizontal: 8 },
  title: { fontSize: 20, fontWeight: '400', color: colors.ink, marginBottom: 6 },
  titleDesktop: { fontSize: 18, fontWeight: '400', letterSpacing: -0.2 },
  lead: { color: colors.muted, fontWeight: '400', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  leadDesktop: { fontSize: 13, fontWeight: '500', lineHeight: 18, marginBottom: 12 },
  section: {
    fontSize: 12, fontWeight: '400', color: colors.muted, textTransform: 'uppercase',
    letterSpacing: 0.8, marginTop: 18, marginBottom: 8, marginLeft: 2,
  },
  card: {
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.line, overflow: 'hidden', padding: 12, gap: 10,
  },
  empty: { color: colors.muted, fontWeight: '400', fontSize: 14, paddingVertical: 4 },
  connRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  connIcon: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  connTitle: { fontWeight: '400', fontSize: 14, color: colors.ink },
  connSub: { fontSize: 12, color: colors.muted, fontWeight: '400', marginTop: 1 },
  connWarn: { fontSize: 12, color: '#b45309', fontWeight: '400', marginTop: 4 },
  connErr: { fontSize: 12, color: colors.danger, fontWeight: '400', marginTop: 4, lineHeight: 16 },
  connActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  reconnectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginTop: 4,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 8, backgroundColor: colors.brandSoft,
  },
  reconnectTxt: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  removeBtn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 8 },
  removeTxt: { color: colors.danger, fontWeight: '400', fontSize: 13 },
  hint: { color: colors.muted, fontSize: 13, fontWeight: '400', lineHeight: 18 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '400',
    backgroundColor: colors.bg,
  },
  primaryBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12,
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 14 },
  oauthBtn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  oauthDisabled: { opacity: 0.55 },
  oauthTitle: { fontWeight: '400', fontSize: 15, color: colors.ink },
  oauthSub: { fontSize: 12, color: colors.muted, fontWeight: '400', marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 4 },
  privacyBox: {
    flexDirection: 'row', gap: 8, marginTop: 16, padding: 12,
    backgroundColor: colors.card, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line,
  },
  privacyTxt: { flex: 1, color: colors.muted, fontSize: 12, fontWeight: '400', lineHeight: 17 },
  setupBox: {
    marginBottom: 8, padding: 12, borderRadius: radius.md,
    backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74', gap: 6,
  },
  setupTitle: { fontWeight: '400', fontSize: 14, color: '#9a3412' },
  setupTxt: { fontSize: 12, fontWeight: '400', color: '#9a3412', lineHeight: 17 },
  setupStep: { fontSize: 12, fontWeight: '400', color: '#7c2d12', lineHeight: 17 },
  setupLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  setupLink: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  setupOk: {
    marginBottom: 8, padding: 12, borderRadius: radius.md,
    backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe',
  },
  setupOkTxt: { fontSize: 12, fontWeight: '400', color: '#1e40af', lineHeight: 17 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  infoTitle: { fontSize: 18, fontWeight: '400', color: colors.ink, marginBottom: 8 },
  infoBody: { fontSize: 14, fontWeight: '400', color: colors.muted, textAlign: 'center' },
  custodyToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  custodyChildRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line,
  },
  childFilterRow: { gap: 8 },
  childFilterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg,
  },
  filterChipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  filterChipTxt: { fontWeight: '400', fontSize: 12, color: colors.ink },
  filterChipTxtOn: { color: colors.brand },
});
