import React from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { formatNok, formatWhen } from '../../src/anbud/model';

function Btn({ label, onPress, colors, tone = 'brand' }) {
  const bg = tone === 'danger' ? colors.danger : tone === 'quiet' ? colors.sunken : colors.brand;
  const fg = tone === 'quiet' ? colors.ink : '#fff';
  return (
    <TouchableOpacity onPress={onPress} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: bg }} accessibilityRole="button">
      <Text style={{ color: fg, fontWeight: '400', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Line({ label, value, colors }) {
  if (!value) return null;
  return <Text style={{ color: colors.ink }}>{label}: {value}</Text>;
}

function DossierBlock({ dossier, colors }) {
  if (!dossier) return <Text style={{ color: colors.muted }}>Henter konkurransegrunnlag …</Text>;
  return (
    <View style={{ gap: 4 }}>
      <Line label="Prosedyre" value={dossier.procedure} colors={colors} />
      <Line label="Verdi" value={dossier.estimatedValue} colors={colors} />
      <Line label="Varighet" value={dossier.duration} colors={colors} />
      <Line label="Tilbudsfrist" value={dossier.submissionDeadline} colors={colors} />
      <Line label="Frist for spørsmål" value={dossier.questionDeadline} colors={colors} />
      <Line label="ESPD" value={dossier.espd ? 'Egenerklæring (ESPD) brukes i konkurransen' : 'Ikke oppgitt i kunngjøringen'} colors={colors} />
      <Line label="Innlevering" value={dossier.electronicSubmission} colors={colors} />
      <Line label="Språk" value={dossier.languages} colors={colors} />
      <Line label="Kontakt" value={[dossier.contactName, dossier.contactEmail, dossier.contactPhone].filter(Boolean).join(' · ')} colors={colors} />
      {dossier.cpvCodes?.length ? <Line label="CPV" value={dossier.cpvCodes.join(', ')} colors={colors} /> : null}
      {dossier.lots?.length ? (
        <Text style={{ color: colors.ink }}>Delkontrakter: {dossier.lots.map((lot) => lot.title || lot.id).join('; ')}</Text>
      ) : null}
      {dossier.documents?.map((doc) => (
        <TouchableOpacity key={doc.url} onPress={() => Linking.openURL(doc.url)} accessibilityRole="link">
          <Text style={{ color: colors.brand, fontWeight: '400' }}>{doc.title}</Text>
        </TouchableOpacity>
      ))}
      <Text style={{ color: colors.muted }}>
        Spørsmål og svar ligger i anskaffelsesdokumentene. Interesse er meldt i Anbud
        {dossier.fetchedAt ? ` ${formatWhen(dossier.fetchedAt)}` : ''}.
      </Text>
    </View>
  );
}

export default function NoticeBoard({
  notices,
  bids,
  view,
  colors,
  busyId,
  onInterest,
  onReject,
  onBid,
}) {
  if (view === 'tilbud') {
    if (!bids.length) return <Text style={{ color: colors.muted }}>Ingen tilbudsarbeid er opprettet ennå.</Text>;
    return bids.map((bid) => (
      <View key={bid.id} style={{ borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.card, borderRadius: 16, padding: 12, gap: 6 }}>
        <Text style={{ color: colors.brand, fontWeight: '400' }}>Trinn 2 · Tilbudsarbeid</Text>
        <Text style={{ color: colors.ink, fontWeight: '400', fontSize: 16 }}>{bid.title}</Text>
        <Text style={{ color: colors.ink }}>{bid.buyer}</Text>
        <Text style={{ color: colors.muted }}>Opprettet {formatWhen(bid.createdAt)}</Text>
        <DossierBlock dossier={bid.dossier} colors={colors} />
      </View>
    ));
  }

  const rows = notices.filter((row) => {
    if (view === 'forkastet') return row.decision === 'forkastet';
    if (view === 'aktuelle') return row.decision === 'aktuell';
    return !row.decision || row.decision === 'ubestemt';
  });
  if (!rows.length) {
    return <Text style={{ color: colors.muted }}>{view === 'forkastet' ? 'Ingen forkastede konkurranser.' : view === 'aktuelle' ? 'Ingen er merket aktuelle ennå.' : 'Ingen ubehandlede treff.'}</Text>;
  }
  return rows.map((row) => (
    <View key={row.id} style={{ borderWidth: 1, borderColor: row.isNew ? colors.brand : colors.line, backgroundColor: colors.card, borderRadius: 16, padding: 12, gap: 6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {row.isNew ? <Text style={{ color: colors.brand, fontWeight: '400' }}>Ny</Text> : null}
        <Text style={{ color: colors.muted }}>{row.id}</Text>
        {row.interestAt ? <Text style={{ color: colors.brand, fontWeight: '400' }}>Interesse meldt</Text> : null}
      </View>
      <Text style={{ color: colors.ink, fontWeight: '400', fontSize: 16 }}>{row.title}</Text>
      <Text style={{ color: colors.ink }}>{row.buyer || 'Ukjent oppdragsgiver'}</Text>
      <Text style={{ color: colors.muted }}>
        {[
          (row.places || []).join(', ') || 'Sted ikke oppgitt',
          row.deadline ? `Frist ${formatWhen(row.deadline)}` : 'Uten frist',
          formatNok(row.amount),
          row.publishedAt ? `Publisert ${formatWhen(row.publishedAt)}` : '',
        ].filter(Boolean).join(' · ')}
      </Text>
      {row.description ? <Text style={{ color: colors.ink }}>{row.description}</Text> : null}
      {row.decision === 'aktuell' ? <DossierBlock dossier={row.dossier} colors={colors} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {row.decision !== 'aktuell' ? (
          <Btn label={busyId === row.id ? 'Henter grunnlag …' : 'Aktuell'} colors={colors} onPress={() => onInterest(row.id)} />
        ) : (
          <Btn label="Lever tilbud" colors={colors} onPress={() => onBid(row.id)} />
        )}
        <Btn label="Forkast" tone="danger" colors={colors} onPress={() => onReject(row.id)} />
        <TouchableOpacity onPress={() => Linking.openURL(row.url)} accessibilityRole="link">
          <Text style={{ color: colors.brand, fontWeight: '400', paddingVertical: 8 }}>Åpne på Doffin</Text>
        </TouchableOpacity>
      </View>
    </View>
  ));
}
