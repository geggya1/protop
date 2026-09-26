import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { attachPortalCatalog } from '../../src/anbud/doffinClient';
import { formatWhen, portalFromUrl } from '../../src/anbud/model';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';

export default function BidDesk({ company, colors, bids, onOpenSettings }) {
  const [profile, setProfile] = useState(null);
  const [storedBids, setStoredBids] = useState(bids || []);
  const [busyId, setBusyId] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    loadAnbudState().then((state) => {
      setProfile(state.supplierProfile);
      setStoredBids(state.bids?.length ? state.bids : (bids || []));
    });
  }, [company?.id, bids]);

  async function refreshFiles(bid) {
    setBusyId(bid.id);
    setNote('');
    const dossier = await attachPortalCatalog(bid.dossier || {});
    const loaded = await loadAnbudState();
    const next = {
      ...loaded,
      bids: (loaded.bids || []).map((row) => (row.id === bid.id ? { ...row, dossier: { ...(row.dossier || {}), ...dossier } } : row)),
      notices: (loaded.notices || []).map((row) => (row.id === bid.noticeId ? { ...row, dossier: { ...(row.dossier || {}), ...dossier } } : row)),
    };
    await saveAnbudState(next);
    setStoredBids(next.bids);
    setNote(dossier.portalFiles?.length
      ? `${dossier.portalFiles.length} dokumenter er lagt i konkurransen. Filene åpnes på portalen.`
      : (dossier.portalNote || 'Fillisten er oppdatert.'));
    setBusyId('');
  }

  const rows = storedBids.length ? storedBids : (bids || []);

  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.h, { color: colors.ink }]}>Tilbudsarbeid</Text>
      <Text style={{ color: colors.muted }}>
        Kunngjøring, frister og dokumentliste ligger her. Interesse og filnedlasting fullføres på portalen konkurransen bruker.
      </Text>
      {profile ? (
        <Text style={{ color: colors.muted }}>
          Innlogging: {profile.username} · {profile.portal}. Endres under Innstillinger.
        </Text>
      ) : (
        <TouchableOpacity onPress={onOpenSettings} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Registrer innloggingsportalen under Innstillinger.</Text>
        </TouchableOpacity>
      )}
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {rows.map((bid) => (
        <BidCard key={bid.id} bid={bid} colors={colors} busy={busyId === bid.id} onRefresh={() => refreshFiles(bid)} />
      ))}
      {!rows.length ? <Text style={{ color: colors.muted }}>Ingen konkurranser er flyttet hit ennå. Merk et treff som aktuelt og meld interesse.</Text> : null}
    </View>
  );
}

function BidCard({ bid, colors, busy, onRefresh }) {
  const dossier = bid.dossier;
  const interest = bid.interest;
  const portalName = portalFromUrl(dossier?.interestUrl || dossier?.documentsUrl).name || 'portalen';
  const interestUrl = dossier?.interestUrl || dossier?.documentsUrl || '';
  return (
    <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>{bid.title}</Text>
      <Text style={{ color: colors.ink }}>{bid.buyer || 'Oppdragsgiver ikke oppgitt'}</Text>
      {interest ? (
        <Text style={{ color: colors.ink }}>
          Interesse meldt i ProTop som {interest.username} {interest.registeredAt ? formatWhen(interest.registeredAt) : ''}
        </Text>
      ) : (
        <Text style={{ color: colors.muted }}>Interesse er ikke registrert i ProTop ennå.</Text>
      )}
      {interestUrl ? (
        <Text style={{ color: colors.brand }} onPress={() => Linking.openURL(interestUrl)}>
          Meld interesse og åpne filene på {portalName}
        </Text>
      ) : null}
      <TouchableOpacity onPress={onRefresh} accessibilityRole="button">
        <Text style={{ color: colors.brand }}>{busy ? 'Henter filliste …' : 'Hent filliste'}</Text>
      </TouchableOpacity>
      {dossier ? <DossierLines dossier={dossier} colors={colors} /> : (
        <Text style={{ color: colors.muted }}>Konkurransegrunnlaget hentes når interessen meldes.</Text>
      )}
    </View>
  );
}

function Line({ label, value, colors }) {
  if (!value) return null;
  return <Text style={{ color: colors.ink }}>{label}: {value}</Text>;
}

function DossierLines({ dossier, colors }) {
  const files = dossier.portalFiles || [];
  return (
    <View style={{ gap: 4 }}>
      <Line label="Tilbudsfrist" value={dossier.submissionDeadline} colors={colors} />
      <Line label="Frist for spørsmål" value={dossier.questionDeadline} colors={colors} />
      <Line label="Prosedyre" value={dossier.procedure} colors={colors} />
      <Line label="ESPD" value={dossier.espd ? 'Egenerklæring brukes' : ''} colors={colors} />
      {dossier.description ? <Text style={{ color: colors.ink }}>{dossier.description}</Text> : null}
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Dokumenter</Text>
      {files.length ? files.map((file) => (
        <Text key={file.name} style={{ color: colors.ink }}>{file.name}{file.size ? ` · ${file.size}` : ''} · åpnes på portalen</Text>
      )) : null}
      {dossier.documents?.length ? dossier.documents.map((doc) => (
        <Text key={doc.url} style={{ color: colors.brand }} onPress={() => Linking.openURL(doc.url)}>{doc.title}</Text>
      )) : null}
      {!files.length && !dossier.documents?.length ? <Text style={{ color: colors.muted }}>Ingen dokumenter er lest inn ennå.</Text> : null}
      {!!dossier.portalNote && !files.length ? <Text style={{ color: colors.muted }}>{dossier.portalNote}</Text> : null}
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Spørsmål og svar</Text>
      {dossier.qa?.length ? dossier.qa.map((row) => (
        <Text key={`${row.question}-${row.answer}`} style={{ color: colors.ink }}>{row.question}: {row.answer}</Text>
      )) : <Text style={{ color: colors.muted }}>Ingen spørsmål og svar er publisert i kunngjøringen ennå.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
});
