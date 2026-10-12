import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { applyAwardContext, applyNoticeReading, awardContextFromHits, qualifyNotice } from '../../src/anbud/desk.js';
import { askNoticeRemote, qualifyNoticeRemote, readNoticeDocuments } from '../../src/anbud/deskClient';
import { fetchCompetitionFile, fetchTenderHits } from '../../src/anbud/doffinClient';

export default function NoticeInsight({ notice, state, colors, onCommit }) {
  const [busy, setBusy] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState('');
  const brief = notice?.brief;
  const updates = notice?.updates || [];
  const award = notice?.awardContext;

  async function readDocuments() {
    setBusy('leser');
    setError('');
    try {
      let dossier = notice.dossier;
      if (!dossier && /^\d{4}-\d+$/.test(String(notice.id || ''))) {
        const loaded = await fetchCompetitionFile(notice.id);
        dossier = loaded?.dossier || dossier;
      }
      const data = await readNoticeDocuments({ ...notice, dossier });
      const applied = applyNoticeReading(state, notice.id, {
        dossier,
        brief: data.brief,
        excerpts: data.excerpts,
      });
      if (applied.ok) onCommit(applied.state);
    } catch (err) {
      setError(err?.message || 'Kunne ikke lese dokumentene.');
    } finally {
      setBusy('');
    }
  }

  async function qualify() {
    setBusy('vurderer');
    setError('');
    try {
      const data = await qualifyNoticeRemote(notice);
      const answers = data.answers || qualifyNotice(notice);
      onCommit({
        ...state,
        notices: state.notices.map((row) => (row.id === notice.id ? { ...row, qualification: answers } : row)),
      });
    } catch (err) {
      setError(err?.message || 'Kunne ikke vurdere konkurransen.');
    } finally {
      setBusy('');
    }
  }

  async function ask() {
    setBusy('spør');
    setError('');
    try {
      const data = await askNoticeRemote(notice, question);
      setAnswer(data);
    } catch (err) {
      setError(err?.message || 'Kunne ikke svare.');
    } finally {
      setBusy('');
    }
  }

  async function loadAward() {
    setBusy('tildeling');
    setError('');
    try {
      const buyer = String(notice.buyer || '').split(',')[0].trim();
      const data = await fetchTenderHits({
        searchString: (buyer || String(notice.title || '') || 'anbud').slice(0, 80),
        types: ['RESULT'],
        cpvCodes: (notice.cpvCodes || []).slice(0, 3),
        channels: ['doffin'],
      });
      const context = awardContextFromHits(notice, data.hits || []);
      const applied = applyAwardContext(state, notice.id, context);
      if (!applied.ok) setError(applied.error);
      else onCommit(applied.state);
    } catch (err) {
      setError(err?.message || 'Fant ingen tidligere tildeling.');
    } finally {
      setBusy('');
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Sammendrag</Text>
      <Text style={{ color: colors.ink, lineHeight: 20 }}>{brief?.summary || 'Åpne dokumenter er ikke lest ennå.'}</Text>
      {brief?.relevance ? <Text style={{ color: colors.brand }}>{brief.relevance}</Text> : null}
      {(brief?.documents || []).map((row) => (
        <Text key={`${row.title}-${row.url}`} style={{ color: row.access === 'stengt' ? colors.danger : colors.muted }}>
          {row.access === 'stengt' ? 'Stengt' : row.access === 'lest' ? 'Lest' : 'Lenke'} · {row.title}. {row.access === 'stengt' ? 'Last opp filen i tilbudet hvis AI skal lese den.' : ''}
        </Text>
      ))}
      {updates.map((row) => (
        <Text key={row.at} style={{ color: colors.ink }}>
          Endring {String(row.at || '').slice(0, 16)}: {(row.changes || []).map((change) => change.label).join(', ')}
        </Text>
      ))}
      {award ? (
        <Text style={{ color: colors.ink }}>
          Forrige tildeling: {award.winner || award.title} {award.publishedAt ? `· ${award.publishedAt.slice(0, 10)}` : ''}. {award.note}
        </Text>
      ) : null}
      {(notice.qualification || []).map((row) => (
        <Text key={row.id} style={{ color: colors.ink }}>{row.prompt} {row.status === 'funnet' ? row.answer : 'Ikke funnet i åpen tekst.'}</Text>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <TouchableOpacity onPress={readDocuments} accessibilityRole="button" style={{ backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
          <Text style={{ color: '#fff' }}>{busy === 'leser' ? 'Leser…' : 'Les åpne dokumenter'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={qualify} accessibilityRole="button" style={{ backgroundColor: colors.sunken, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
          <Text style={{ color: colors.ink }}>{busy === 'vurderer' ? 'Vurderer…' : 'Go / no-go'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={loadAward} accessibilityRole="button" style={{ backgroundColor: colors.sunken, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
          <Text style={{ color: colors.ink }}>{busy === 'tildeling' ? 'Søker…' : 'Hvem vant sist'}</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        value={question}
        onChangeText={setQuestion}
        placeholder="Spør om det som står i kunngjøringen"
        placeholderTextColor={colors.placeholder}
        style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 8, color: colors.ink }}
      />
      <TouchableOpacity onPress={ask} accessibilityRole="button">
        <Text style={{ color: colors.brand }}>{busy === 'spør' ? 'Leser…' : 'Spør dokumentene'}</Text>
      </TouchableOpacity>
      {answer ? <Text style={{ color: colors.ink }}>{answer.answer}</Text> : null}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    </View>
  );
}
