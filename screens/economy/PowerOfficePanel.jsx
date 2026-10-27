import React, { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OptionPicker from '../../components/OptionPicker';
import { showSaveToast } from '../../src/ui/saveToast';
import {
  connectPowerOffice,
  disconnectPowerOffice,
  listPowerOfficeProducts,
  loadPowerOfficeStatus,
  syncPowerOfficeInvoices,
} from '../../src/economy/powerOfficeClient.js';
import {
  envLabel,
  POWEROFFICE_ENV_OPTIONS,
  POWEROFFICE_GUI,
  POWEROFFICE_VAT_ROWS,
} from '../../src/economy/powerOfficeView.js';

/** Synk automatisk når listen åpnes, men ikke oftere enn dette. */
const AUTO_SYNC_MS = 5 * 60 * 1000;

function syncText(status) {
  if (!status?.lastSyncAt) return 'ikke synket ennå';
  const at = new Date(status.lastSyncAt);
  if (Number.isNaN(at.getTime())) return 'ikke synket ennå';
  return `sist synket ${at.toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}`;
}

function countsText(counts) {
  if (!counts) return '';
  const parts = [];
  if (counts.sent) parts.push(`${counts.sent} sendt`);
  if (counts.paid) parts.push(`${counts.paid} betalt`);
  if (counts.merged) parts.push(`${counts.merged} slått sammen`);
  if (counts.missing) parts.push(`${counts.missing} ikke funnet`);
  return parts.length ? parts.join(', ') : 'ingen endringer';
}

/**
 * PowerOffice Go for admin: koble til klienten, velg produkt per MVA-sats og synk
 * fakturanummer, KID, forsendelse og betalingsstatus.
 */
export default function PowerOfficePanel({ familyId, colors, status, onStatus }) {
  const [open, setOpen] = useState(false);
  const [env, setEnv] = useState('demo');
  const [clientKey, setClientKey] = useState('');
  const [codes, setCodes] = useState({});
  const [products, setProducts] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const autoSynced = useRef(false);

  function applyStatus(next) {
    onStatus?.(next);
  }

  useEffect(() => {
    setCodes(status?.productCodes || {});
    if (status?.env) setEnv(status.env);
  }, [status]);

  async function run(label, task) {
    setBusy(label);
    setError('');
    setNote('');
    try {
      return await task();
    } catch (cause) {
      setError(cause?.message || 'Noe gikk galt mot PowerOffice.');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function sync({ quiet = false } = {}) {
    const result = await run('sync', () => syncPowerOfficeInvoices(familyId));
    if (!result) return;
    const next = await loadPowerOfficeStatus(familyId).catch(() => null);
    if (next) applyStatus(next);
    if (!quiet) setNote(`Synket med PowerOffice: ${countsText(result.counts)}.`);
  }

  useEffect(() => {
    if (!status?.connected || autoSynced.current) return;
    const last = new Date(status.lastSyncAt || 0).getTime();
    if (Date.now() - last <= AUTO_SYNC_MS) return;
    autoSynced.current = true;
    void sync({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected]);

  async function connect() {
    const next = await run('connect', () => connectPowerOffice(familyId, { env, clientKey: clientKey.trim() }));
    if (!next) return;
    applyStatus(next);
    setClientKey('');
    setNote(`Koblet til ${next.clientName || 'PowerOffice'} (${envLabel(next.env).toLowerCase()}).`);
    showSaveToast('PowerOffice er koblet til.');
  }

  async function saveCodes() {
    const next = await run('codes', () => connectPowerOffice(familyId, { productCodes: codes }));
    if (!next) return;
    applyStatus(next);
    showSaveToast('Produktene er lagret.');
  }

  async function fetchProducts() {
    const result = await run('products', () => listPowerOfficeProducts(familyId));
    if (result) setProducts(result.products || []);
  }

  async function disconnect() {
    const next = await run('disconnect', () => disconnectPowerOffice(familyId));
    if (!next) return;
    applyStatus(next);
    setNote('PowerOffice er koblet fra. Overførte utkast ligger fortsatt i PowerOffice.');
  }

  const connected = !!status?.connected;
  const keysMissing = status?.keysReady && status.keysReady[env] === false;
  const noCodes = connected && !Object.keys(status.productCodes || {}).length;
  const productOptions = (products || []).map((row) => ({ id: row.code, label: `${row.code} · ${row.name}` }));
  const button = (label, onPress, { key, primary = false, disabled = false } = {}) => (
    <TouchableOpacity
      key={key || label}
      onPress={onPress}
      disabled={!!busy || disabled}
      accessibilityRole="button"
      style={[
        primary ? styles.primary : styles.secondary,
        primary
          ? { backgroundColor: colors.brand }
          : { borderColor: colors.line, backgroundColor: colors.card },
        { opacity: busy || disabled ? 0.6 : 1 },
      ]}
    >
      <Text style={{ color: primary ? '#fff' : colors.ink, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View
      nativeID="poweroffice-panel"
      style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}
    >
      <View style={styles.row}>
        <Ionicons name={connected ? 'link-outline' : 'unlink-outline'} size={18} color={connected ? colors.brand : colors.muted} />
        <Text style={{ color: colors.ink, flex: 1, minWidth: 200 }}>
          {status == null
            ? 'PowerOffice: henter status…'
            : connected
              ? `PowerOffice ${envLabel(status.env).toLowerCase()}: ${status.clientName || 'koblet til'} · ${busy === 'sync' ? 'synker…' : syncText(status)}`
              : 'PowerOffice: ikke koblet til. Fakturautkast sendes da ikke til regnskapet.'}
        </Text>
        {connected ? button(busy === 'sync' ? 'Synker…' : 'Synk nå', () => sync(), { key: 'sync' }) : null}
        {button(open ? 'Lukk' : (connected ? 'Innstillinger' : 'Koble til'), () => setOpen((v) => !v), { key: 'toggle' })}
      </View>

      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
      {!!note && <Text style={{ color: colors.ink }}>{note}</Text>}
      {connected && status.invalidPrivileges?.length ? (
        <Text style={{ color: colors.danger || '#b42318' }}>
          Integrasjonen mangler tilgang i PowerOffice: {status.invalidPrivileges.join(', ')}.
        </Text>
      ) : null}
      {noCodes ? (
        <Text style={{ color: colors.danger || '#b42318' }}>
          Velg produkt per MVA-sats under Innstillinger før du overfører utkast.
        </Text>
      ) : null}

      {open ? (
        <View style={{ gap: 12 }}>
          <View style={{ gap: 6 }}>
            <Text style={[styles.heading, { color: colors.ink }]}>Klient</Text>
            <Text style={{ color: colors.muted }}>
              Klientnøkkelen finner du i PowerOffice Go under Meny → Innstillinger → Utvidelser,
              når ProTop-integrasjonen er aktivert. Demoklienten har nøkkelen i e-posten fra PowerOffice.
            </Text>
            <OptionPicker
              options={POWEROFFICE_ENV_OPTIONS}
              value={env}
              onChange={(id) => setEnv(id || 'demo')}
              title="Miljø"
              clearable={false}
            />
            {keysMissing ? (
              <Text style={{ color: colors.danger || '#b42318' }}>
                Applikasjons- og abonnementsnøkkelen for {envLabel(env).toLowerCase()} er ikke lagt inn på serveren ennå.
              </Text>
            ) : null}
            <View style={styles.row}>
              <TextInput
                value={clientKey}
                onChangeText={setClientKey}
                placeholder="Klientnøkkel"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
              />
              {button(busy === 'connect' ? 'Kobler til…' : (connected ? 'Bytt klient' : 'Koble til'), connect, {
                key: 'connect', primary: true, disabled: !clientKey.trim(),
              })}
            </View>
          </View>

          {connected ? (
            <View style={{ gap: 6 }}>
              <Text style={[styles.heading, { color: colors.ink }]}>Produkt per MVA-sats</Text>
              <Text style={{ color: colors.muted }}>
                Produktet i PowerOffice bestemmer salgskonto og MVA på linjen. Linjene i utkastet får
                produktet for sin MVA-sats.
              </Text>
              {POWEROFFICE_VAT_ROWS.map((row) => (
                <View key={row.id} style={styles.row}>
                  <Text style={{ color: colors.ink, width: 220 }}>{row.label}</Text>
                  {productOptions.length ? (
                    <View style={{ flex: 1, minWidth: 200 }}>
                      <OptionPicker
                        options={productOptions}
                        value={codes[row.id] || ''}
                        onChange={(id) => setCodes((current) => ({ ...current, [row.id]: id || '' }))}
                        placeholder="Ikke valgt"
                        title={row.label}
                      />
                    </View>
                  ) : (
                    <TextInput
                      value={codes[row.id] || ''}
                      onChangeText={(value) => setCodes((current) => ({ ...current, [row.id]: value }))}
                      placeholder="Produktkode"
                      placeholderTextColor={colors.placeholder}
                      autoCapitalize="none"
                      style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
                    />
                  )}
                </View>
              ))}
              <View style={styles.row}>
                {button(busy === 'codes' ? 'Lagrer…' : 'Lagre produkter', saveCodes, { key: 'codes', primary: true })}
                {products == null
                  ? button(busy === 'products' ? 'Henter…' : 'Hent produkter fra PowerOffice', fetchProducts, { key: 'products' })
                  : null}
                {button('Åpne PowerOffice Go', () => Linking.openURL(POWEROFFICE_GUI[status.env] || POWEROFFICE_GUI.prod), { key: 'gui' })}
                {button(busy === 'disconnect' ? 'Kobler fra…' : 'Koble fra', disconnect, { key: 'disconnect' })}
              </View>
              {products && !products.length ? (
                <Text style={{ color: colors.muted }}>Fant ingen produkter i PowerOffice. Opprett dem der først.</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  heading: { fontWeight: '700', fontSize: 14 },
  input: { flex: 1, minWidth: 200, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  primary: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  secondary: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1 },
});
