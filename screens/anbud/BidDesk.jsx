import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { attachPortalCatalog, fetchCompetitionFile } from '../../src/anbud/doffinClient';
import { formatWhen, portalFromUrl, registerInterest, setNoticeDecision, workCandidates } from '../../src/anbud/model';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';

export default function BidDesk({ company, colors, bids, onOpenSettings, onOpenAlerts }) {
  const [profile, setProfile] = useState(null);
  const [storedBids, setStoredBids] = useState(bids || []);
  const [candidates, setCandidates] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    loadAnbudState().then((state) => {
      setProfile(state.supplierProfile);
      setStoredBids(state.bids?.length ? state.bids : (bids || []));
      setCandidates(workCandidates(state));
    });
  }, [company?.id, bids]);

  async function bringIn(id) {
    setBusyId(id);
    setNote('');
    let state = await loadAnbudState();
    if (!state.supplierProfile?.username) {
      setNote('Registrer innloggingsportalen under Innstillinger først.');
      setBusyId('');
      onOpenSettings?.();
      return;
    }
    const notice = (state.notices || []).find((row) => row.id === id);
    if (notice && notice.decision !== 'aktuell' && notice.decision !== 'tilbud') {
      const marked = setNoticeDecision(state, id, 'aktuell');
      if (!marked.ok) {
        setNote(marked.error);
        setBusyId('');
        return;
      }
      state = marked.state;
    }
    let dossier = notice?.dossier || null;
    try {
      if (/^\d{4}-\d+$/.test(String(id))) {
        const file = await fetchCompetitionFile(id);
        dossier = file?.dossier ? await attachPortalCatalog(file.dossier) : dossier;
      }
    } catch (err) {
      setNote(err?.message || 'Kunngjøringen svarte ikke. Konkurransen legges inn likevel.');
    }
    const result = registerInterest(state, id, dossier);
    if (!result.ok) setNote(result.error);
    else {
      await saveAnbudState(result.state);
      setProfile(result.state.supplierProfile);
      setStoredBids(result.state.bids);
      setCandidates(workCandidates(result.state));
      const files = dossier?.portalFiles?.length;
      setNote(files
        ? `${notice?.title || 'Konkurransen'} er hentet inn med ${files} dokumenter.`
        : `${notice?.title || 'Konkurransen'} er hentet inn i tilbudsarbeidet.`);
    }
    setBusyId('');
  }

  async function refreshFiles(bid) {
    setBusyId(bid.id);
    setNote('');
    let dossier = bid.dossier || {};
    try {
      if (!dossier.documentsUrl && /^\d{4}-\d+$/.test(String(bid.noticeId || ''))) {
        const file = await fetchCompetitionFile(bid.noticeId);
        dossier = file?.dossier || dossier;
      }
      dossier = await attachPortalCatalog(dossier);
    } catch (err) {
      setNote(err?.message || 'Kunne ikke hente grunnlaget.');
      setBusyId('');
      return;
    }
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
      {candidates.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Treff som kan hentes inn</Text>
          {candidates.slice(0, 12).map((notice) => (
            <View key={notice.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{notice.title}</Text>
              <Text style={{ color: colors.muted }}>{notice.buyer || 'Oppdragsgiver ikke oppgitt'}{notice.decision === 'aktuell' ? ' · markert aktuell' : ''}</Text>
              <TouchableOpacity onPress={() => bringIn(notice.id)} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
                <Text style={{ color: '#fff' }}>{busyId === notice.id ? 'Henter grunnlag …' : 'Hent inn'}</Text>
              </TouchableOpacity>
            </View>
          ))}
          {candidates.length > 12 ? <Text style={{ color: colors.muted }}>{candidates.length - 12} treff til ligger i anbudsvarslingen.</Text> : null}
        </View>
      ) : null}
      {rows.map((bid) => (
        <BidCard key={bid.id} bid={bid} colors={colors} busy={busyId === bid.id} onRefresh={() => refreshFiles(bid)} />
      ))}
      {!rows.length && !candidates.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted }}>Ingen treff er søkt opp ennå. Oppdater listen i anbudsvarslingen, så kan de hentes inn her.</Text>
          <TouchableOpacity onPress={onOpenAlerts} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff' }}>Gå til treffene</Text>
          </TouchableOpacity>
        </View>
      ) : null}
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
      {dossier?.documentsUrl || dossier?.submissionDeadline || dossier?.portalFiles?.length ? <DossierLines dossier={dossier} colors={colors} /> : (
        <Text style={{ color: colors.muted }}>Grunnlaget er ikke lest inn ennå. Bruk Hent filliste.</Text>
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
  save: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
});
