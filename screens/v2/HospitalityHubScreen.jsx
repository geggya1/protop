/**
 * Utleie / hospitality hub — channel sync, Nuki locks, automessages, reviews.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Alert,
  ActivityIndicator, Switch, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, radius, useLayout } from '../../src/theme';
import { Screen, Mute, ScrollBody } from '../../components/ui';
import { ModulePageFrame, ModuleBgSpacer } from '../../components/ModulePageBg';
import {
  listenProperties,
  listenReservations,
  listenMessageTemplates,
  listenReviews,
  listenChannels,
  listenLocks,
  listenMessageLog,
  createProperty,
  updateProperty,
  deleteProperty,
  createReservation,
  updateReservation,
  ensureDefaultTemplates,
  upsertMessageTemplate,
  createReview,
  updateReview,
  saveNukiToken,
  getNukiStatus,
  syncNukiLocks,
  disconnectNuki,
  provisionLockCode,
  revokeLockCode,
  processAutomessages,
  generateReplyDraft,
  getHospitalityLoginChecklist,
  statusLabelNb,
  reviewScoreLabel,
  nextReservationStatus,
  CHANNELS,
  RESERVATION_STATUS,
  MESSAGE_TRIGGERS,
} from '../../src/utils/hospitality';
import { deliveryMethodLabelNb } from '../../src/utils/hospitalityMessaging';
import { healthFromViews, buildChannelViews } from '../../src/utils/hospitalitySetup';
import HospitalityChannelConnect from '../../components/HospitalityChannelConnect';


const TABS = [
  { id: 'overview', label: 'Oversikt', icon: 'grid-outline' },
  { id: 'bookings', label: 'Bookinger', icon: 'calendar-outline' },
  { id: 'properties', label: 'Boliger', icon: 'home-outline' },
  { id: 'messages', label: 'Automelding', icon: 'chatbubbles-outline' },
  { id: 'locks', label: 'Låser', icon: 'key-outline' },
  { id: 'reviews', label: 'Vurderinger', icon: 'star-outline' },
  { id: 'connections', label: 'Tilkoblinger', icon: 'link-outline' },
];

const TRIGGER_LABELS = {
  [MESSAGE_TRIGGERS.booking_confirmed]: 'Ved bekreftelse',
  [MESSAGE_TRIGGERS.hours_before_checkin]: 'Timer før innsjekk',
  [MESSAGE_TRIGGERS.hours_after_checkin]: 'Timer etter innsjekk',
  [MESSAGE_TRIGGERS.hours_before_checkout]: 'Timer før utsjekk',
  [MESSAGE_TRIGGERS.hours_after_checkout]: 'Timer etter utsjekk',
  [MESSAGE_TRIGGERS.on_cancellation]: 'Ved kansellering',
  [MESSAGE_TRIGGERS.review_request]: 'Etterspør vurdering',
};

function fmtDate(v) {
  if (!v) return '—';
  try {
    const d = v?.toDate ? v.toDate() : new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function SectionTitle({ children }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function Pill({ ok, label }) {
  return (
    <View style={[styles.pill, ok ? styles.pillOk : styles.pillWarn]}>
      <View style={[styles.pillDot, { backgroundColor: ok ? '#15803d' : '#b45309' }]} />
      <Text style={[styles.pillTxt, ok ? styles.pillTxtOk : styles.pillTxtWarn]}>{label}</Text>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline, secureTextEntry, keyboardType }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
    </View>
  );
}

export default function HospitalityHubScreen({ inShell = false }) {
  const { familyId, user, isParent } = useApp();
  const { isDesktop } = useLayout();
  const uid = user?.uid;
  const [tab, setTab] = useState('overview');
  const [properties, setProperties] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [channels, setChannels] = useState([]);
  const [locks, setLocks] = useState([]);
  const [messageLog, setMessageLog] = useState([]);
  const [setup, setSetup] = useState(null);
  const [nukiStatus, setNukiStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  // Forms
  const [propForm, setPropForm] = useState({
    name: '', address: '', checkInInstructions: '', checkOutInstructions: '',
    wifiName: '', wifiPassword: '', nukiSmartlockId: '', lockEarlyHours: '0', lockLateHours: '0',
  });
  const [resForm, setResForm] = useState({
    guestName: '', guestEmail: '', propertyId: '', checkIn: '', checkOut: '', channel: CHANNELS.manual,
  });
  const [nukiToken, setNukiToken] = useState('');
  const [reviewForm, setReviewForm] = useState({ guestName: '', score: '5', text: '', propertyId: '', channel: 'airbnb' });
  const [editTpl, setEditTpl] = useState(null);

  useEffect(() => {
    if (!familyId) return undefined;
    const unsubs = [
      listenProperties(familyId, setProperties),
      listenReservations(familyId, setReservations),
      listenMessageTemplates(familyId, setTemplates),
      listenReviews(familyId, setReviews),
      listenChannels(familyId, setChannels),
      listenLocks(familyId, setLocks),
      listenMessageLog(familyId, (rows) => setMessageLog(rows.slice(0, 40))),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, [familyId]);

  useEffect(() => {
    if (!familyId || !uid || !isParent) return;
    ensureDefaultTemplates(familyId, uid).catch(() => {});
    getNukiStatus(familyId).then(setNukiStatus).catch(() => setNukiStatus({ connected: false }));
    getHospitalityLoginChecklist(familyId).then(setSetup).catch(() => {});
  }, [familyId, uid, isParent]);

  const channelViews = useMemo(() => buildChannelViews(channels, setup), [channels, setup]);
  const health = useMemo(() => healthFromViews(channelViews), [channelViews]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return reservations
      .filter((r) => r.status !== RESERVATION_STATUS.cancelled && r.status !== RESERVATION_STATUS.checked_out)
      .filter((r) => {
        const out = r.checkOut?.toDate ? r.checkOut.toDate() : new Date(r.checkOut);
        return out.getTime() >= now - 86400000;
      })
      .slice(0, 8);
  }, [reservations]);

  const run = useCallback(async (key, fn) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (err) {
      const msg = err?.message || String(err);
      setError(msg);
      if (Platform.OS !== 'web') Alert.alert('Feil', msg);
    } finally {
      setBusy('');
    }
  }, []);

  const refreshSetup = useCallback(async () => {
    if (!familyId) return;
    const [data, nuki] = await Promise.all([
      getHospitalityLoginChecklist(familyId),
      getNukiStatus(familyId),
    ]);
    setSetup(data);
    setNukiStatus(nuki);
  }, [familyId]);

  if (!isParent) {
    return (
      <Screen>
        <ScrollBody>
          <Text style={styles.pageTitle}>Utleie</Text>
          <Mute>Kun foreldre/verter har tilgang til utleiemodulen.</Mute>
        </ScrollBody>
      </Screen>
    );
  }

  if (!familyId) {
    return (
      <Screen>
        <ScrollBody>
          <Text style={styles.pageTitle}>Utleie</Text>
          <Mute>Velg en familie først.</Mute>
        </ScrollBody>
      </Screen>
    );
  }

  return (
    <Screen>
      <ModulePageFrame name="hospitality">
      <View style={styles.fg}>
        <ScrollBody pad={isDesktop ? 16 : 14}>
          {!inShell ? <Text style={styles.pageTitle}>Utleie</Text> : null}
          <Mute>Synk Airbnb & Booking.com, Nuki-låsekoder, automeldinger og gjestevurderinger.</Mute>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          <View style={styles.tabs}>
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => setTab(t.id)}
                style={[styles.tab, tab === t.id && styles.tabActive]}
              >
                <Ionicons name={t.icon} size={16} color={tab === t.id ? '#fff' : colors.brand} />
                <Text style={[styles.tabTxt, tab === t.id && styles.tabTxtActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.busyTxt}>Jobber…</Text>
          </View>
        ) : null}

        {tab === 'overview' && (
          <View style={styles.block}>
            <SectionTitle>Logg inn på kanaler</SectionTitle>
            <Mute>
              Sign in kreves for automeldinger til Airbnb-/Booking-innboks. iCal synker kun kalender.
            </Mute>
            <HospitalityChannelConnect
              familyId={familyId}
              channels={channels}
              properties={properties}
              setup={setup}
              onRefresh={refreshSetup}
            />

            <SectionTitle>Tilkoblingsstatus</SectionTitle>
            <View style={styles.pillRow}>
              {health.map((h) => (
                <Pill
                  key={h.type}
                  ok={h.connected}
                  label={h.calendarOnly ? `${h.label} (kun kalender)` : h.label}
                />
              ))}
            </View>

            <SectionTitle>Kommende bookinger</SectionTitle>
            {upcoming.length === 0 ? <Mute>Ingen kommende bookinger.</Mute> : null}
            {upcoming.map((r) => (
              <View key={r.id} style={styles.card}>
                <Text style={styles.cardTitle}>{r.guestName}</Text>
                <Text style={styles.cardMeta}>
                  {statusLabelNb(r.status)} · {r.channel || 'manual'} · {fmtDate(r.checkIn)} → {fmtDate(r.checkOut)}
                </Text>
                {r.lockCode ? <Text style={styles.code}>Kode: {r.lockCode}</Text> : null}
              </View>
            ))}
          </View>
        )}

        {tab === 'bookings' && (
          <View style={styles.block}>
            <SectionTitle>Ny booking (manuell)</SectionTitle>
            <Field label="Gjest" value={resForm.guestName} onChangeText={(v) => setResForm((s) => ({ ...s, guestName: v }))} />
            <Field label="E-post" value={resForm.guestEmail} onChangeText={(v) => setResForm((s) => ({ ...s, guestEmail: v }))} keyboardType="email-address" />
            <Field
              label="Bolig-ID (valg)"
              value={resForm.propertyId}
              onChangeText={(v) => setResForm((s) => ({ ...s, propertyId: v }))}
              placeholder={properties[0]?.id || 'propertyId'}
            />
            <View style={styles.propPick}>
              {properties.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, resForm.propertyId === p.id && styles.chipOn]}
                  onPress={() => setResForm((s) => ({ ...s, propertyId: p.id }))}
                >
                  <Text style={[styles.chipTxt, resForm.propertyId === p.id && styles.chipTxtOn]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Field
              label="Innsjekk (ISO)"
              value={resForm.checkIn}
              onChangeText={(v) => setResForm((s) => ({ ...s, checkIn: v }))}
              placeholder="2026-08-26T15:00:00"
            />
            <Field
              label="Utsjekk (ISO)"
              value={resForm.checkOut}
              onChangeText={(v) => setResForm((s) => ({ ...s, checkOut: v }))}
              placeholder="2026-08-28T11:00:00"
            />
            <TouchableOpacity
              style={styles.btn}
              onPress={() => run('createRes', async () => {
                const prop = properties.find((p) => p.id === resForm.propertyId);
                await createReservation(familyId, uid, {
                  ...resForm,
                  propertyName: prop?.name || '',
                  checkIn: new Date(resForm.checkIn).toISOString(),
                  checkOut: new Date(resForm.checkOut).toISOString(),
                });
                setResForm({
                  guestName: '', guestEmail: '', propertyId: resForm.propertyId,
                  checkIn: '', checkOut: '', channel: CHANNELS.manual,
                });
              })}
            >
              <Text style={styles.btnTxt}>Opprett booking</Text>
            </TouchableOpacity>

            <SectionTitle>Alle bookinger</SectionTitle>
            {reservations.map((r) => (
              <View key={r.id} style={styles.card}>
                <Text style={styles.cardTitle}>{r.guestName}</Text>
                <Text style={styles.cardMeta}>
                  {statusLabelNb(r.status)} · {r.channel} · {fmtDate(r.checkIn)} → {fmtDate(r.checkOut)}
                </Text>
                {r.lockCode ? <Text style={styles.code}>Låsekode: {r.lockCode}</Text> : (
                  <Text style={styles.cardMeta}>Ingen låsekode ennå</Text>
                )}
                <View style={styles.rowActions}>
                  <Action
                    label="Generer Nuki-kode"
                    onPress={() => run(`lock-${r.id}`, async () => {
                      await provisionLockCode(familyId, r.id);
                    })}
                  />
                  {r.lockCode ? (
                    <Action
                      label="Slett kode"
                      danger
                      onPress={() => run(`revoke-${r.id}`, async () => {
                        await revokeLockCode(familyId, r.id);
                      })}
                    />
                  ) : null}
                  {['confirm', 'check_in', 'check_out', 'cancel'].map((action) => {
                    const next = nextReservationStatus(r.status, action);
                    if (!next) return null;
                    return (
                      <Action
                        key={action}
                        label={action}
                        onPress={() => run(`st-${r.id}-${action}`, async () => {
                          const patch = { status: next };
                          if (action === 'cancel') patch.cancelledAt = new Date().toISOString();
                          if (action === 'confirm') patch.confirmedAt = new Date().toISOString();
                          await updateReservation(familyId, r.id, patch);
                        })}
                      />
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}

        {tab === 'properties' && (
          <View style={styles.block}>
            <SectionTitle>Ny bolig</SectionTitle>
            <Field label="Navn" value={propForm.name} onChangeText={(v) => setPropForm((s) => ({ ...s, name: v }))} />
            <Field label="Adresse" value={propForm.address} onChangeText={(v) => setPropForm((s) => ({ ...s, address: v }))} />
            <Field
              label="Innsjekkinstruks"
              value={propForm.checkInInstructions}
              onChangeText={(v) => setPropForm((s) => ({ ...s, checkInInstructions: v }))}
              multiline
            />
            <Field
              label="Utsjekkinstruks"
              value={propForm.checkOutInstructions}
              onChangeText={(v) => setPropForm((s) => ({ ...s, checkOutInstructions: v }))}
              multiline
            />
            <Field label="WiFi-navn" value={propForm.wifiName} onChangeText={(v) => setPropForm((s) => ({ ...s, wifiName: v }))} />
            <Field label="WiFi-passord" value={propForm.wifiPassword} onChangeText={(v) => setPropForm((s) => ({ ...s, wifiPassword: v }))} />
            <Field
              label="Nuki smartlock ID"
              value={propForm.nukiSmartlockId}
              onChangeText={(v) => setPropForm((s) => ({ ...s, nukiSmartlockId: v }))}
              placeholder="Fra Nuki-synk"
            />
            <Field
              label="Kode gyldig X timer før innsjekk"
              value={propForm.lockEarlyHours}
              onChangeText={(v) => setPropForm((s) => ({ ...s, lockEarlyHours: v }))}
              keyboardType="numeric"
            />
            <Field
              label="Kode gyldig X timer etter utsjekk"
              value={propForm.lockLateHours}
              onChangeText={(v) => setPropForm((s) => ({ ...s, lockLateHours: v }))}
              keyboardType="numeric"
            />
            <TouchableOpacity
              style={styles.btn}
              onPress={() => run('prop', async () => {
                await createProperty(familyId, uid, propForm);
                setPropForm({
                  name: '', address: '', checkInInstructions: '', checkOutInstructions: '',
                  wifiName: '', wifiPassword: '', nukiSmartlockId: '', lockEarlyHours: '0', lockLateHours: '0',
                });
              })}
            >
              <Text style={styles.btnTxt}>Lagre bolig</Text>
            </TouchableOpacity>

            {properties.map((p) => (
              <View key={p.id} style={styles.card}>
                <Text style={styles.cardTitle}>{p.name}</Text>
                <Text style={styles.cardMeta}>{p.address || 'Ingen adresse'}</Text>
                <Text style={styles.cardMeta}>Nuki: {p.nukiSmartlockId || 'ikke satt'}</Text>
                <View style={styles.rowActions}>
                  {locks.map((l) => (
                    <Action
                      key={l.id}
                      label={`Knytt ${l.name || l.id}`}
                      onPress={() => run(`link-${p.id}-${l.id}`, async () => {
                        await updateProperty(familyId, p.id, { nukiSmartlockId: String(l.smartlockId || l.id) });
                      })}
                    />
                  ))}
                  <Action
                    label="Slett"
                    danger
                    onPress={() => run(`delp-${p.id}`, async () => {
                      await deleteProperty(familyId, p.id);
                    })}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {tab === 'messages' && (
          <View style={styles.block}>
            <SectionTitle>Automeldinger</SectionTitle>
            <Mute>
              Meldinger til Airbnb-/Booking-gjester sendes inn til plattform-innboksen etter Sign in.
              iCal alene er ikke nok. Manuelle bookinger kan gå på e-post.
            </Mute>
            {(!channelViews.airbnb?.messagingReady || !channelViews.booking?.messagingReady) ? (
              <TouchableOpacity style={styles.setupBanner} onPress={() => setTab('connections')}>
                <Ionicons name="log-in-outline" size={18} color={colors.brand} />
                <Text style={styles.setupBannerTxt}>
                  Logg inn med Airbnb / Booking.com for kanal-automeldinger
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.btn}
              onPress={() => run('auto', async () => { await processAutomessages(familyId); })}
            >
              <Text style={styles.btnTxt}>Kjør automeldinger nå</Text>
            </TouchableOpacity>

            {templates.map((tpl) => (
              <View key={tpl.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>{tpl.name || tpl.id}</Text>
                  <Switch
                    value={!!tpl.enabled}
                    onValueChange={(v) => run(`tpl-${tpl.id}`, async () => {
                      await upsertMessageTemplate(familyId, uid, { ...tpl, enabled: v });
                    })}
                  />
                </View>
                <Text style={styles.cardMeta}>
                  {TRIGGER_LABELS[tpl.trigger] || tpl.trigger} · {tpl.offsetHours || 0} t
                </Text>
                <Text style={styles.preview} numberOfLines={3}>{tpl.body}</Text>
                <Action label="Rediger" onPress={() => setEditTpl({ ...tpl, offsetHours: String(tpl.offsetHours ?? 0) })} />
              </View>
            ))}

            {editTpl ? (
              <View style={styles.card}>
                <SectionTitle>Rediger mal</SectionTitle>
                <Field label="Navn" value={editTpl.name || ''} onChangeText={(v) => setEditTpl((s) => ({ ...s, name: v }))} />
                <Field
                  label="Timer (offset)"
                  value={editTpl.offsetHours}
                  onChangeText={(v) => setEditTpl((s) => ({ ...s, offsetHours: v }))}
                  keyboardType="numeric"
                />
                <Field label="Emne" value={editTpl.subject || ''} onChangeText={(v) => setEditTpl((s) => ({ ...s, subject: v }))} />
                <Field label="Melding" value={editTpl.body || ''} onChangeText={(v) => setEditTpl((s) => ({ ...s, body: v }))} multiline />
                <View style={styles.propPick}>
                  {Object.entries(TRIGGER_LABELS).map(([id, label]) => (
                    <TouchableOpacity
                      key={id}
                      style={[styles.chip, editTpl.trigger === id && styles.chipOn]}
                      onPress={() => setEditTpl((s) => ({ ...s, trigger: id }))}
                    >
                      <Text style={[styles.chipTxt, editTpl.trigger === id && styles.chipTxtOn]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.btn}
                  onPress={() => run('saveTpl', async () => {
                    await upsertMessageTemplate(familyId, uid, {
                      ...editTpl,
                      offsetHours: Number(editTpl.offsetHours) || 0,
                    });
                    setEditTpl(null);
                  })}
                >
                  <Text style={styles.btnTxt}>Lagre mal</Text>
                </TouchableOpacity>
                <Action label="Avbryt" onPress={() => setEditTpl(null)} />
              </View>
            ) : null}

            <SectionTitle>Sendt logg</SectionTitle>
            {messageLog.length === 0 ? <Mute>Ingen meldinger sendt ennå.</Mute> : null}
            {messageLog.map((m) => (
              <View key={m.id} style={styles.card}>
                <Text style={styles.cardTitle}>{m.subject}</Text>
                <Text style={styles.cardMeta}>
                  {m.trigger} · {deliveryMethodLabelNb(m.delivery?.method)}
                  {m.delivery?.ok === false ? ' · feilet' : ''}
                  {' · '}{fmtDate(m.createdAt)}
                </Text>
                {m.delivery?.error ? <Text style={styles.error}>{m.delivery.error}</Text> : null}
              </View>
            ))}
          </View>
        )}

        {tab === 'locks' && (
          <View style={styles.block}>
            <SectionTitle>Nuki</SectionTitle>
            <Pill ok={!!nukiStatus?.connected} label={nukiStatus?.connected ? 'Tilkoblet' : 'Ikke tilkoblet'} />
            <Field
              label="Nuki API-token"
              value={nukiToken}
              onChangeText={setNukiToken}
              secureTextEntry
              placeholder="Fra Nuki Web → API"
            />
            <TouchableOpacity
              style={styles.btn}
              onPress={() => run('nukiSave', async () => {
                await saveNukiToken(familyId, nukiToken);
                setNukiToken('');
                await syncNukiLocks(familyId);
                await refreshSetup();
              })}
            >
              <Text style={styles.btnTxt}>Lagre token og synk låser</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={() => run('nukiSync', async () => { await syncNukiLocks(familyId); })}
            >
              <Text style={[styles.btnTxt, styles.btnTxtSecondary]}>Synk låser på nytt</Text>
            </TouchableOpacity>
            {nukiStatus?.connected ? (
              <Action
                label="Koble fra Nuki"
                danger
                onPress={() => run('nukiOff', async () => {
                  await disconnectNuki(familyId);
                  await refreshSetup();
                })}
              />
            ) : null}

            <SectionTitle>Enheter</SectionTitle>
            {locks.length === 0 ? <Mute>Ingen låser synket ennå.</Mute> : null}
            {locks.map((l) => (
              <View key={l.id} style={styles.card}>
                <Text style={styles.cardTitle}>{l.name || l.smartlockId}</Text>
                <Text style={styles.cardMeta}>
                  ID: {l.smartlockId} · Keypad: {l.keypadPaired ? 'ja' : 'nei'}
                  {l.batteryCritical ? ' · Batteri kritisk' : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'reviews' && (
          <View style={styles.block}>
            <SectionTitle>Registrer vurdering</SectionTitle>
            <Field label="Gjest" value={reviewForm.guestName} onChangeText={(v) => setReviewForm((s) => ({ ...s, guestName: v }))} />
            <Field label="Score (0–5)" value={reviewForm.score} onChangeText={(v) => setReviewForm((s) => ({ ...s, score: v }))} keyboardType="decimal-pad" />
            <Field label="Tekst" value={reviewForm.text} onChangeText={(v) => setReviewForm((s) => ({ ...s, text: v }))} multiline />
            <TouchableOpacity
              style={styles.btn}
              onPress={() => run('rev', async () => {
                await createReview(familyId, uid, reviewForm);
                setReviewForm({ guestName: '', score: '5', text: '', propertyId: '', channel: 'airbnb' });
              })}
            >
              <Text style={styles.btnTxt}>Lagre vurdering</Text>
            </TouchableOpacity>

            {reviews.map((r) => (
              <View key={r.id} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {r.guestName || 'Gjest'} · {Number(r.score).toFixed(1)} ({reviewScoreLabel(r.score)})
                </Text>
                <Text style={styles.preview}>{r.text}</Text>
                {r.replyText ? <Text style={styles.code}>Svar: {r.replyText}</Text> : null}
                <Action
                  label="Autogenerer svar"
                  onPress={() => run(`reply-${r.id}`, async () => {
                    const { draft } = await generateReplyDraft(familyId, { reviewId: r.id });
                    await updateReview(familyId, r.id, { replyText: draft, replied: true });
                  })}
                />
              </View>
            ))}
          </View>
        )}

        {tab === 'connections' && (
          <View style={styles.block}>
            <HospitalityChannelConnect
              familyId={familyId}
              channels={channels}
              properties={properties}
              setup={setup}
              onRefresh={refreshSetup}
            />
          </View>
        )}
        <ModuleBgSpacer />
        </ScrollBody>
      </View>
      </ModulePageFrame>
    </Screen>
  );
}

function Action({ label, onPress, danger }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.actionBtn}>
      <Text style={[styles.actionTxt, danger && styles.actionDanger]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fg: { flex: 1, zIndex: 1, backgroundColor: 'transparent' },
  pageTitle: { fontSize: 20, fontWeight: '500', color: colors.text || '#0f172a', marginBottom: 4 },
  tabScroll: { marginVertical: 10, maxHeight: 48 },
  tabs: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line,
  },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabTxt: { color: colors.brand, fontWeight: '500', fontSize: 13 },
  tabTxtActive: { color: '#fff' },
  block: { gap: 10 },
  sectionTitle: {
    marginTop: 8, fontSize: 16, fontWeight: '500', color: colors.text || '#0f172a',
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  pillOk: { backgroundColor: '#dcfce7' },
  pillWarn: { backgroundColor: '#ffedd5' },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillTxt: { fontSize: 12, fontWeight: '500' },
  pillTxtOk: { color: '#166534' },
  pillTxtWarn: { color: '#9a3412' },
  checkRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 },
  checkTitle: { fontWeight: '500', color: colors.text || '#0f172a' },
  checkHow: { color: colors.muted, fontSize: 13, marginTop: 2 },
  checkNote: { color: colors.muted, fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand, borderRadius: radius.md,
    paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center',
  },
  btnSecondary: { backgroundColor: colors.brandSoft || '#dbeafe' },
  btnTxt: { color: '#fff', fontWeight: '500' },
  btnTxtSecondary: { color: colors.brand },
  card: {
    borderWidth: 1, borderColor: colors.line || '#e2e8f0',
    borderRadius: 14, padding: 14, gap: 6, backgroundColor: colors.card,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontWeight: '500', fontSize: 15, color: colors.text || '#0f172a' },
  cardMeta: { color: colors.muted, fontSize: 13 },
  code: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), color: colors.brand, fontWeight: '500' },
  preview: { color: colors.text || '#334155', fontSize: 13, lineHeight: 18 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '500', color: colors.muted },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text || '#0f172a',
    backgroundColor: colors.card,
  },
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  actionBtn: {
    alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 2 },
  actionTxt: { color: colors.brand, fontWeight: '500', fontSize: 13 },
  actionDanger: { color: '#b91c1c' },
  setupBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: radius.md,
    backgroundColor: colors.brandSoft || '#dbeafe',
  },
  setupBannerTxt: { flex: 1, fontWeight: '500', color: colors.brand, fontSize: 14 },
  propPick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  chipOn: { backgroundColor: colors.brand },
  chipTxt: { fontSize: 12, color: colors.text || '#334155', fontWeight: '500' },
  chipTxtOn: { color: '#fff' },
  error: { color: '#b91c1c', marginBottom: 6 },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  busyTxt: { color: colors.muted },
});
