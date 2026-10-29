import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OptionPicker from '../../components/OptionPicker';
import { showSaveToast } from '../../src/ui/saveToast';
import { type } from '../../src/ui/tokens';
import {
  connectPowerOffice,
  disconnectPowerOffice,
  listPowerOfficeProducts,
  loadPowerOfficeStatus,
  lookupPowerOfficeInvoice,
  syncPowerOfficeInvoices,
} from '../../src/economy/powerOfficeClient.js';
import {
  envTag,
  lookupRows,
  POWEROFFICE_GUI,
  POWEROFFICE_VAT_ROWS,
  productOptionsForRow,
  productVatWarning,
  syncCountsText,
  syncLabel,
} from '../../src/economy/powerOfficeView.js';

/**
 * Økonomi → Innstillinger → Regnskapssystem: kobling til PowerOffice Go.
 * Klientnøkkelen avgjør om det er produksjon eller en testklient. Det velges ikke her.
 */
export default function PowerOfficeSettings({ familyId, colors, canEdit = false }) {
  const [status, setStatus] = useState(null);
  const [clientKey, setClientKey] = useState('');
  const [codes, setCodes] = useState({});
  const [products, setProducts] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [lookupNo, setLookupNo] = useState('');
  const [lookup, setLookup] = useState(null);

  function applyStatus(next) {
    setStatus(next);
    setCodes(next?.productCodes || {});
  }

  useEffect(() => {
    let live = true;
    setStatus(null);
    if (!familyId) return undefined;
    loadPowerOfficeStatus(familyId)
      .then((next) => { if (live) applyStatus(next); })
      .catch((cause) => { if (live) setError(cause?.message || 'Kunne ikke hente status fra PowerOffice.'); });
    return () => { live = false; };
  }, [familyId]);

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

  async function connect() {
    const next = await run('connect', () => connectPowerOffice(familyId, { clientKey: clientKey.trim() }));
    if (!next) return;
    applyStatus(next);
    setClientKey('');
    setNote(`Koblet til ${next.clientName || 'PowerOffice'}${next.env === 'demo' ? ' (testklient)' : ''}.`);
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
    if (!result) return;
    const list = result.products || [];
    setProducts(list);
    if (list.length) setNote(`Hentet ${list.length} produkter fra PowerOffice. Velg produkt for hver MVA-sats under.`);
  }

  // Produktene hentes av seg selv når klienten er koblet til, så valgene er klare.
  useEffect(() => {
    if (!status?.connected || !canEdit || products != null) return;
    void fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected, canEdit]);

  async function sync() {
    const result = await run('sync', () => syncPowerOfficeInvoices(familyId));
    if (!result) return;
    const next = await loadPowerOfficeStatus(familyId).catch(() => null);
    if (next) applyStatus(next);
    setNote(`Synket med PowerOffice: ${syncCountsText(result.counts)}.`);
  }

  // Leser én sendt faktura fra Go slik synken gjør. Lagrer ingenting.
  async function lookupInvoice() {
    setLookup(null);
    const result = await run('lookup', () => lookupPowerOfficeInvoice(familyId, lookupNo));
    if (result) setLookup(result);
  }

  async function toggleAutoSend() {
    const next = await run('autosend', () => connectPowerOffice(familyId, { autoSend: !status?.autoSend }));
    if (!next) return;
    applyStatus(next);
    showSaveToast(next.autoSend ? 'Fakturaer sendes automatisk fra PowerOffice.' : 'Fakturaer sendes fra PowerOffice Go.');
  }

  async function disconnect() {
    const next = await run('disconnect', () => disconnectPowerOffice(familyId));
    if (!next) return;
    applyStatus(next);
    setNote('PowerOffice er koblet fra. Overførte utkast ligger fortsatt i PowerOffice.');
  }

  const connected = !!status?.connected;
  const tag = connected ? envTag(status.env) : '';
  const keysMissing = status?.keysReady && !Object.values(status.keysReady).some(Boolean);
  const hasProducts = !!products?.length;
  const danger = colors.danger || '#b42318';
  const button = (label, onPress, { key, primary = false, disabled = false } = {}) => (
    <TouchableOpacity
      key={key || label}
      onPress={onPress}
      disabled={!!busy || disabled || !canEdit}
      accessibilityRole="button"
      style={[
        primary ? styles.primary : styles.secondary,
        primary ? { backgroundColor: colors.brand } : { borderColor: colors.line, backgroundColor: colors.card },
        { opacity: busy || disabled || !canEdit ? 0.6 : 1 },
      ]}
    >
      <Text style={{ color: primary ? '#fff' : colors.ink, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View nativeID="poweroffice-settings" style={{ gap: 14 }}>
      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.heading, { color: colors.ink }]}>PowerOffice Go</Text>
        <Text style={{ color: colors.muted, lineHeight: 20 }}>
          Fakturautkast fra ProTop overføres til PowerOffice Go. Der kontrolleres og sendes fakturaen,
          og fakturanummer, KID, forsendelse og betaling hentes tilbake til ProTop.
        </Text>
        <View style={styles.row}>
          <Ionicons name={connected ? 'link-outline' : 'unlink-outline'} size={18} color={connected ? colors.brand : colors.muted} />
          <Text style={{ color: colors.ink, fontWeight: '600' }}>
            {status == null
              ? 'Henter status…'
              : connected
                ? `Koblet til ${status.clientName || 'PowerOffice'}`
                : 'Ikke koblet til'}
          </Text>
          {tag ? (
            <View style={[styles.tag, { borderColor: danger }]}>
              <Text style={{ color: danger, fontSize: 12, fontWeight: '700' }}>{tag}</Text>
            </View>
          ) : null}
          {connected ? (
            <Text style={{ color: colors.muted }}>{busy === 'sync' ? 'synker…' : syncLabel(status.lastSyncAt)}</Text>
          ) : null}
        </View>
        {tag ? (
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Dette er en testklient hos PowerOffice. Utkast og fakturaer her er ikke ekte regnskap.
          </Text>
        ) : null}
        {connected ? (
          <View style={styles.row}>
            {button(busy === 'sync' ? 'Synker…' : 'Synk nå', sync, { key: 'sync' })}
            {button('Åpne PowerOffice Go', () => Linking.openURL(POWEROFFICE_GUI[status.env] || POWEROFFICE_GUI.prod), { key: 'gui' })}
            {button(busy === 'disconnect' ? 'Kobler fra…' : 'Koble fra', disconnect, { key: 'disconnect' })}
          </View>
        ) : null}
        {!!error && <Text style={{ color: danger }}>{error}</Text>}
        {!!note && <Text style={{ color: colors.ink }}>{note}</Text>}
        {keysMissing ? (
          <Text style={{ color: danger }}>
            Integrasjonsnøklene er ikke lagt inn på serveren, eller funksjonene har ikke tilgang til dem.
          </Text>
        ) : null}
        {connected && status.invalidPrivileges?.length ? (
          <Text style={{ color: danger }}>
            Integrasjonen mangler tilgang i PowerOffice: {status.invalidPrivileges.join(', ')}.
          </Text>
        ) : null}
      </View>

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.heading, { color: colors.ink }]}>{connected ? 'Bytt klient' : 'Koble til'}</Text>
        <Text style={{ color: colors.muted, lineHeight: 20 }}>
          Aktiver ProTop i PowerOffice Go under Meny → Innstillinger → Utvidelser, og lim inn klientnøkkelen her.
        </Text>
        <View style={styles.row}>
          <TextInput
            value={clientKey}
            onChangeText={setClientKey}
            placeholder="Klientnøkkel"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            editable={canEdit}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          {button(busy === 'connect' ? 'Kobler til…' : (connected ? 'Bytt klient' : 'Koble til'), connect, {
            key: 'connect', primary: true, disabled: !clientKey.trim(),
          })}
        </View>
      </View>

      {connected ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.heading, { color: colors.ink }]}>Produkt per MVA-sats</Text>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            Produktet i PowerOffice bestemmer salgskonto og MVA. Hver linje i utkastet får produktet for sin MVA-sats.
          </Text>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            ProTop bruker Høy sats for timer, kjøring og de fleste utlegg, og Fritatt for utlegg i kategoriene
            Bompenger og Kjøregodtgjørelse. Rader dere ikke fakturerer med, kan stå tomme. Velg et produkt med
            samme sats som raden: de som passer, står øverst i listen.
          </Text>
          {Object.keys(status.productCodes || {}).length ? null : (
            <Text style={{ color: danger }}>Velg minst produktet for høy sats før du overfører utkast.</Text>
          )}
          {POWEROFFICE_VAT_ROWS.map((row) => (
            <View key={row.id} style={{ gap: 4 }}>
            <View style={styles.row}>
              <Text style={{ color: colors.ink, width: 220 }}>{row.label}</Text>
              {hasProducts ? (
                <View style={{ flex: 1, minWidth: 200 }}>
                  <OptionPicker
                    options={productOptionsForRow(row, products)}
                    value={codes[row.id] || ''}
                    onChange={(id) => setCodes((current) => ({ ...current, [row.id]: id || '' }))}
                    placeholder="Ikke valgt"
                    title={row.label}
                    disabled={!canEdit}
                  />
                </View>
              ) : (
                <TextInput
                  value={codes[row.id] || ''}
                  onChangeText={(value) => setCodes((current) => ({ ...current, [row.id]: value }))}
                  placeholder="Produktkode"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  editable={canEdit}
                  style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
                />
              )}
            </View>
            {productVatWarning(row, products, codes[row.id]) ? (
              <Text style={{ color: danger, fontSize: 12, marginLeft: 228 }}>
                {productVatWarning(row, products, codes[row.id])}
              </Text>
            ) : null}
            </View>
          ))}
          <View style={styles.row}>
            {button(busy === 'codes' ? 'Lagrer…' : 'Lagre produkter', saveCodes, { key: 'codes', primary: true })}
            {button(
              busy === 'products' ? 'Henter…' : (products == null ? 'Hent produkter fra PowerOffice' : 'Hent produkter på nytt'),
              fetchProducts,
              { key: 'products' },
            )}
          </View>
          {products && !products.length ? (
            <Text style={{ color: colors.muted }}>Fant ingen produkter i PowerOffice. Opprett dem der først.</Text>
          ) : null}
        </View>
      ) : null}

      {connected ? (
        <View nativeID="poweroffice-autosend" style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.heading, { color: colors.ink }]}>Sending</Text>
          <TouchableOpacity
            onPress={toggleAutoSend}
            disabled={!!busy || !canEdit}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!status.autoSend }}
            style={[styles.row, { opacity: busy || !canEdit ? 0.6 : 1 }]}
          >
            <Ionicons name={status.autoSend ? 'checkbox' : 'square-outline'} size={22} color={status.autoSend ? colors.brand : colors.muted} />
            <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>
              Send fakturaen automatisk fra PowerOffice når den overføres
            </Text>
          </TouchableOpacity>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            {status.autoSend
              ? 'Det som overføres fra ProTop, regnes som godkjent. PowerOffice sender fakturaen med en gang: som EHF, eFaktura eller AvtaleGiro når kunden kan ta imot det, ellers som PDF på e-post til fakturaadressen. Fakturadato og forfall er de som er valgt i ProTop, ellers dagens dato og kundens betalingsbetingelse.'
              : 'Av: utkastet legges i PowerOffice Go, og noen kontrollerer og sender det derfra. Et overført utkast kan også sendes med «Send fra PowerOffice nå» på fakturaen.'}
          </Text>
          <Text style={{ ...type.caption, color: colors.muted }}>
            Krever at integrasjonen har tilgangen til fakturasending (CreateAndSendInvoice) i PowerOffice.
          </Text>
        </View>
      ) : null}

      {connected ? (
        <View nativeID="poweroffice-lookup" style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.heading, { color: colors.ink }]}>Test tilbakehenting</Text>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            Send en faktura fra PowerOffice Go og skriv inn fakturanummeret. ProTop henter fakturaen slik synken gjør,
            og viser fakturanummer, KID, forsendelse og restbeløp. Ingenting lagres i ProTop.
          </Text>
          <View style={styles.row}>
            <TextInput
              value={lookupNo}
              onChangeText={setLookupNo}
              placeholder="Fakturanummer i PowerOffice"
              placeholderTextColor={colors.placeholder}
              keyboardType="number-pad"
              editable={canEdit}
              onSubmitEditing={() => lookupNo.trim() && lookupInvoice()}
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
            />
            {button(busy === 'lookup' ? 'Henter…' : 'Hent faktura', lookupInvoice, {
              key: 'lookup', primary: true, disabled: !lookupNo.trim(),
            })}
          </View>
          {lookup && !lookup.found ? (
            <Text style={{ color: danger }}>
              {`Fant ingen sendt faktura med nummer ${lookup.invoiceNo} i PowerOffice. Utkast får fakturanummer først når de sendes.`}
            </Text>
          ) : null}
          {lookupRows(lookup).map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={{ color: colors.muted, width: 200 }}>{label}</Text>
              <Text style={{ color: colors.ink, flex: 1 }}>{String(value)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  heading: { fontWeight: '700', fontSize: 16 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  input: { flex: 1, minWidth: 200, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  primary: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  secondary: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1 },
});
