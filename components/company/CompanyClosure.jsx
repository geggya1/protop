import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import {
  Banner, Button, Check, Field, Row, Sheet, TextIn, space, type,
} from '../../src/ui';
import {
  CLOSURE_GRACE_DAYS, canCloseCompany, closureConfirmMatches, closureConfirmName, closureNotice, companyClosure,
} from '../../src/privacy/companyClosure';
import {
  COMPANY_EXPORT_WEB_ONLY, closeCompanyAccount, downloadCompanyExport, reopenCompanyAccount,
} from '../../src/privacy/companyExportClient';

function progressLabel(progress) {
  if (!progress) return '';
  if (progress.step === 'data') return 'Henter bedriftens data …';
  if (progress.step === 'files') return `Henter filer: ${progress.done} av ${progress.total}`;
  return 'Lager ZIP-filen …';
}

/**
 * Selskapsinnstillinger → Avslutt bedriften (GRUNN-03): eksport av alle data, avslutning med
 * sletting etter 90 dager, og angring før fristen. Bare eier og administrator kan gjøre noe;
 * de andre ser om bedriften er avsluttet og når dataene slettes.
 */
export default function CompanyClosure({ family, familyId, uid, colors }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [accounting, setAccounting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(null);
  const [exported, setExported] = useState(null);
  const [error, setError] = useState('');
  const closure = companyClosure(family);
  const mayClose = canCloseCompany(family, uid);
  const web = Platform.OS === 'web';
  const name = closureConfirmName(family);
  const ready = closureConfirmMatches(confirm, family) && accounting;

  async function runExport() {
    if (busy) return;
    setBusy('export');
    setError('');
    try {
      const res = await downloadCompanyExport({ familyId, companyName: name, onProgress: setProgress });
      setExported(res);
    } catch (e) {
      setError(e?.message || 'Kunne ikke laste ned eksporten.');
    } finally {
      setBusy('');
      setProgress(null);
    }
  }

  async function runClose() {
    if (busy || !ready) return;
    setBusy('close');
    setError('');
    try {
      await closeCompanyAccount({
        familyId, confirm, accountingConfirmed: accounting, reason,
      });
      setOpen(false);
      setConfirm('');
      setReason('');
    } catch (e) {
      setError(e?.message || 'Kunne ikke avslutte bedriften.');
    } finally {
      setBusy('');
    }
  }

  async function runReopen() {
    if (busy) return;
    setBusy('reopen');
    setError('');
    try {
      await reopenCompanyAccount({ familyId });
    } catch (e) {
      setError(e?.message || 'Kunne ikke angre avslutningen.');
    } finally {
      setBusy('');
    }
  }

  const exportButton = mayClose ? (
    <Button
      label={busy === 'export' ? 'Laster ned …' : 'Last ned bedriftens data'}
      icon="download-outline"
      onPress={web ? runExport : () => setError(COMPANY_EXPORT_WEB_ONLY)}
      busy={busy === 'export'}
      disabled={!!busy && busy !== 'export'}
      nativeID="company-export"
    />
  ) : null;
  const exportStatus = (
    <>
      {progress ? <Text style={[styles.lead, { color: colors.muted }]}>{progressLabel(progress)}</Text> : null}
      {exported ? (
        <Text style={[styles.lead, { color: colors.ink }]}>
          {`Lastet ned ${exported.filename}: ${exported.documents} dokumenter og ${exported.files} filer.${exported.missing.length ? ` ${exported.missing.length} filer kom ikke med (se LESMEG.txt i filen).` : ''}`}
        </Text>
      ) : null}
    </>
  );

  if (closure) {
    return (
      <View style={styles.wrap} nativeID="company-closure">
        <Banner tone="danger" text={closureNotice(family)} />
        {mayClose ? (
          <Row>
            {exportButton}
            <Button label="Angre avslutningen" icon="arrow-undo-outline" onPress={runReopen} busy={busy === 'reopen'} disabled={!!busy && busy !== 'reopen'} />
          </Row>
        ) : (
          <Text style={[styles.lead, { color: colors.muted }]}>Eier eller administrator kan laste ned dataene og angre avslutningen.</Text>
        )}
        {exportStatus}
        {error ? <Text style={{ color: colors.dangerInk || colors.danger }} accessibilityRole="alert">{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap} nativeID="company-closure">
      <Text style={[styles.lead, { color: colors.muted }]}>
        {`Når bedriften avsluttes, stopper abonnementet, og alle bedriftens data og filer slettes etter ${CLOSURE_GRACE_DAYS} dager, slik databehandleravtalen sier. Fram til da virker bedriften som før, og eier eller administrator kan angre. Last ned bedriftens data først. Underenheter avsluttes hver for seg.`}
      </Text>
      {mayClose ? (
        <Row>
          {exportButton}
          <Button label="Avslutt bedriftens abonnement og slett data" icon="trash-outline" variant="danger" onPress={() => { setError(''); setOpen(true); }} disabled={!!busy} nativeID="company-close" />
        </Row>
      ) : (
        <Text style={[styles.lead, { color: colors.muted }]}>Bare eier eller administrator kan avslutte bedriften.</Text>
      )}
      {!open ? exportStatus : null}
      {error && !open ? <Text style={{ color: colors.dangerInk || colors.danger }} accessibilityRole="alert">{error}</Text> : null}
      <Sheet
        visible={open}
        title="Avslutt bedriften og slett data"
        onClose={() => { if (!busy) setOpen(false); }}
        footer={(
          <>
            <Button label="Avbryt" onPress={() => setOpen(false)} disabled={!!busy} />
            <Button
              label={`Avslutt og slett etter ${CLOSURE_GRACE_DAYS} dager`}
              variant="danger"
              onPress={runClose}
              busy={busy === 'close'}
              disabled={!ready || (!!busy && busy !== 'close')}
              nativeID="company-close-confirm"
            />
          </>
        )}
      >
        <Text style={[styles.lead, { color: colors.ink }]}>
          {`Alle data i «${name}» slettes for godt ${CLOSURE_GRACE_DAYS} dager etter avslutningen: ansatte, HR, timer, fravær, prosjekter, kunder, fakturaer, ISO, chat og alle filer. Medlemmene mister tilgangen når dataene slettes.`}
        </Text>
        <Text style={[styles.step, { color: colors.ink }]}>1. Last ned bedriftens data</Text>
        <Text style={[styles.lead, { color: colors.muted }]}>
          {web
            ? 'ZIP-filen har alle dokumentene og filene, også fakturaarkivet (PDF) og kvitteringer.'
            : COMPANY_EXPORT_WEB_ONLY}
        </Text>
        {web ? <Row>{exportButton}</Row> : null}
        {exportStatus}
        <Text style={[styles.step, { color: colors.ink }]}>2. Regnskapsmateriale</Text>
        <Text style={[styles.lead, { color: colors.muted }]}>
          Fakturaer og bilag skal oppbevares i fem år etter regnskapsårets slutt (bokføringsloven § 13). Når dataene er slettet fra ProTop, har bedriften selv ansvaret. Fakturalisten kan også eksporteres til Excel under Økonomi → Faktura, og utleggene under Økonomi → Utlegg.
        </Text>
        <Check
          label="Regnskapsmaterialet er lastet ned eller tatt vare på i regnskapssystemet, og vi oppbevarer det i fem år."
          value={accounting}
          onChange={setAccounting}
          required
        />
        <Text style={[styles.step, { color: colors.ink }]}>3. Bekreft</Text>
        <Field label={`Skriv bedriftens navn: ${name}`} required>
          <TextIn value={confirm} onChangeText={setConfirm} placeholder={name} />
        </Field>
        <Field label="Grunn (valgfritt)">
          <TextIn value={reason} onChangeText={setReason} placeholder="F.eks. bedriften er avviklet" />
        </Field>
        {error ? <Text style={{ color: colors.dangerInk || colors.danger }} accessibilityRole="alert">{error}</Text> : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  lead: { ...type.body },
  step: { ...type.bodyStrong },
});
