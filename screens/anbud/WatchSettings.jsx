import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CPV_CODES, CPV_GROUPS, TENDER_AREAS } from '../../src/anbud/catalog';
import { buildTenderAlert } from '../../src/anbud/alertMail';
import { fetchCompanyCpv, sendTenderAlert } from '../../src/anbud/doffinClient';
import { alignDepartmentAreas, emptyAnbudState, normalizeCpvCode, normalizeDepartmentAreas, normalizeKeywords, noticeDeadlineExpired, saveTenderWatch } from '../../src/anbud/model';
import { departmentsOf } from '../../src/project/companyUnits';
import { interpretCompanyProfile } from '../../src/anbud/watchAi';
import { loadAnbudState, persistAnbudState } from '../../src/anbud/storage';
import { updateGroup } from '../../src/utils/groups';
import PortalSettings from './PortalSettings';
import RegionCoverage from './RegionCoverage';

function Chip({ label, on, onPress, colors, hint }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint || label}
      style={[styles.chip, { backgroundColor: on ? colors.brand : colors.sunken }]}
    >
      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function cpvTitle(code, label) {
  const known = CPV_CODES.find((row) => row.code === code)
    || CPV_GROUPS.flatMap((group) => [group, ...group.children]).find((row) => row.code === code);
  return [code, label || known?.label].filter(Boolean).join(' · ');
}

function toggle(setter, value) {
  setter((current) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });
}

export default function WatchSettings({ company, colors, onOpenWork, units = [] }) {
  const [state, setState] = useState(emptyAnbudState());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [mailNote, setMailNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [cpvQuery, setCpvQuery] = useState('');
  const [customCpv, setCustomCpv] = useState('');
  const [tradeDraft, setTradeDraft] = useState('');
  const [keywordDraft, setKeywordDraft] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [selectedCpv, setSelectedCpv] = useState(() => new Set());
  const [trades, setTrades] = useState([]);
  const [nationwide, setNationwide] = useState(true);
  const [areas, setAreas] = useState(() => new Set());
  const [departmentAreas, setDepartmentAreas] = useState([]);
  const [channels, setChannels] = useState(() => new Set(['doffin', 'ted']));
  const [notify, setNotify] = useState({ push: true, varsel: true, email: false });
  const [emails, setEmails] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [summary, setSummary] = useState('');
  const [profileKeywords, setProfileKeywords] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [publicCpv, setPublicCpv] = useState([]);
  const [publicNote, setPublicNote] = useState('');

  useEffect(() => {
    let live = true;
    loadAnbudState(company?.id).then((loaded) => {
      if (!live) return;
      const watch = loaded.watch || {};
      const codes = [...(company?.cpvCodes || []), ...(watch.cpvCodes || [])];
      setSelectedCpv(new Set(codes.map((row) => normalizeCpvCode(typeof row === 'string' ? row : row?.code)).filter(Boolean)));
      setTrades([...(company?.naeringskoder || []), ...(watch.naeringskoder || [])].filter((row, index, list) => list.indexOf(row) === index));
      setNationwide(watch.savedAt ? !!watch.nationwide : true);
      setAreas(new Set((watch.areas || []).map((row) => row.id)));
      setDepartmentAreas(normalizeDepartmentAreas(watch.departmentAreas));
      setChannels(new Set(watch.channels?.length ? watch.channels : ['doffin', 'ted']));
      setNotify(watch.notify || { push: true, varsel: true, email: false });
      setEmails(watch.emails || []);
      setKeywords(watch.keywords || []);
      const profile = watch.profile || {};
      setDescription(profile.description || '');
      setWebsite(profile.website || company?.hjemmeside || company?.website || '');
      setSummary(profile.summary || '');
      setProfileKeywords(profile.keywords || []);
      setState(loaded);
      setReady(true);
    });
    return () => { live = false; };
  }, [company?.id]);

  useEffect(() => {
    const orgnr = String(company?.orgnr || '').replace(/\D/g, '');
    if (orgnr.length !== 9) {
      setPublicCpv([]);
      setPublicNote('');
      return undefined;
    }
    let alive = true;
    fetchCompanyCpv(orgnr)
      .then((data) => {
        if (!alive) return;
        const found = Array.isArray(data?.cpvCodes) ? data.cpvCodes : [];
        setPublicCpv(found);
        setPublicNote(found.length ? 'Offentlige tildelinger på Doffin' : 'Ingen CPV-koder er funnet i offentlige tildelinger.');
      })
      .catch(() => {
        if (!alive) return;
        setPublicCpv([]);
        setPublicNote('Kunne ikke hente offentlige CPV-koder.');
      });
    return () => { alive = false; };
  }, [company?.orgnr]);

  const ownLabels = useMemo(
    () => [...selectedCpv].map((code) => cpvTitle(code)),
    [selectedCpv],
  );

  const preview = buildTenderAlert({
    companyName: company?.name || state.watch.companyName,
    cpvCodes: [...selectedCpv].map((code) => ({ code })),
    keywords,
    notices: (state.notices || []).filter((row) => (row.isNew || row.decision === 'ubestemt') && !noticeDeadlineExpired(row)).slice(0, 12),
  });

  function inputFromForm(overrides = {}) {
    const nextKeywords = overrides.keywords ?? keywords;
    const nextProfile = {
      description,
      website,
      summary,
      keywords: profileKeywords,
      updatedAt: description || website || summary ? new Date().toISOString() : '',
      ...(overrides.profile || {}),
    };
    return {
      companyName: company?.name || state.watch.companyName || 'Bedriften',
      orgnr: company?.orgnr || '',
      cpvSource: 'bedrift',
      cpvCodes: [...selectedCpv].map((code) => {
        const known = CPV_CODES.find((row) => row.code === code);
        return { code, label: known?.label || `CPV ${code}` };
      }),
      nationwide,
      areas: [...areas].map((id) => TENDER_AREAS.find((row) => row.id === id)).filter(Boolean),
      departmentAreas: alignDepartmentAreas(
        departmentAreas,
        departmentsOf(units).map((row) => ({ id: row.id, name: row.name })),
      ),
      channels: [...channels],
      notify,
      emails,
      naeringskoder: trades,
      keywords: nextKeywords,
      profile: nextProfile,
    };
  }

  async function persistWatch(overrides = {}) {
    const saved = saveTenderWatch(state, inputFromForm(overrides));
    if (!saved.ok) return saved;
    const next = await persistAnbudState(saved.state, company?.id);
    setState(next);
    if (company?.id) {
      try {
        await updateGroup(company.id, {
          cpvCodes: next.watch.cpvCodes.map((row) => ({ ...row, source: 'bedrift' })),
          cpvSource: 'bedrift',
          tenderWatch: {
            nationwide,
            areas: next.watch.areas,
            departmentAreas: next.watch.departmentAreas,
            channels: next.watch.channels,
            notify,
            emails,
            naeringskoder: trades,
            keywords: next.watch.keywords,
            profile: next.watch.profile,
          },
        });
      } catch (err) {
        return { ok: true, state: next, warning: err?.message || 'Bedriftskortet ble ikke oppdatert.' };
      }
    }
    return { ok: true, state: next };
  }

  async function saveCriteria() {
    if (!ready) return;
    setSaving(true);
    setError('');
    setNote('');
    try {
      const saved = await persistWatch();
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      setNote(saved.warning
        ? `Lagret. ${saved.warning}`
        : 'Lagret. Gå til Anbudsvarsling og trykk Oppdater nå.');
    } catch (err) {
      setError(err?.message || 'Kunne ikke lagre innstillingene.');
    } finally {
      setSaving(false);
    }
  }

  async function interpretProfile() {
    if (!description.trim() && !website.trim() && !company?.name) {
      setAiNote('Skriv en kort beskrivelse eller lim inn hjemmesiden først.');
      return;
    }
    setAiBusy(true);
    setAiNote('');
    setError('');
    try {
      const data = await interpretCompanyProfile({
        companyName: company?.name || state.watch.companyName,
        orgnr: company?.orgnr || state.watch.orgnr,
        description,
        website,
      });
      const nextKeywords = normalizeKeywords([...(data.keywords || []), ...profileKeywords]);
      const nextSearch = normalizeKeywords([...keywords, ...nextKeywords]);
      setSummary(data.summary || '');
      setProfileKeywords(nextKeywords);
      setKeywords(nextSearch);
      try {
        const saved = await persistWatch({
          keywords: nextSearch,
          profile: {
            description,
            website,
            summary: data.summary || '',
            keywords: nextKeywords,
            updatedAt: new Date().toISOString(),
          },
        });
        if (!saved.ok) {
          setAiNote(data.summary
            ? `${data.summary ? 'Tolkingen er klar. ' : ''}${saved.error}`
            : saved.error);
          return;
        }
        setAiNote(data.summary
          ? 'AI har tolket bedriften og lagret profilen. Treff som passer godt blir merket i listen.'
          : 'AI svarte, men fant lite å bruke. Prøv en tydeligere beskrivelse.');
        if (saved.warning) setNote(saved.warning);
      } catch (err) {
        setAiNote(data.summary
          ? `Tolkingen er klar, men lagring feilet: ${err?.message || 'ukjent feil'}`
          : (err?.message || 'Kunne ikke lagre profilen.'));
      }
    } catch (err) {
      setAiNote(err?.message || 'Kunne ikke tolke bedriften.');
    } finally {
      setAiBusy(false);
    }
  }

  async function sendMail() {
    setMailNote('');
    if (!notify.email || !emails.length) {
      setMailNote('Slå på e-post og legg inn minst én mottaker.');
      return;
    }
    try {
      const data = await sendTenderAlert({
        emails,
        companyName: company?.name || state.watch.companyName,
        cpvCodes: [...selectedCpv].map((code) => ({ code })),
        keywords,
        notices: (state.notices || []).filter((row) => row.decision !== 'arkiv' && row.decision !== 'forkastet' && row.decision !== 'ikke' && !noticeDeadlineExpired(row)).slice(0, 20),
      });
      setMailNote(data?.ok ? `Sendt til ${data.sent} mottaker${data.sent === 1 ? '' : 'e'}.` : (data?.error || 'Kunne ikke sende.'));
    } catch (err) {
      setMailNote(err?.message || 'Kunne ikke sende e-posten.');
    }
  }

  return (
    <View style={styles.page}>
      <Text style={[styles.h, { color: colors.ink }]}>Søkekriterier</Text>
      <Text style={{ color: colors.muted }}>
        CPV-koder, næringskoder og område for anbudsvarsling. Listen er lang, derfor står den her og ikke i margen på treffene.
      </Text>

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.h, { color: colors.ink }]}>CPV fra offentlige tildelinger</Text>
        <Text style={{ color: colors.muted }}>{publicNote || 'Søkes i offentlige tildelinger på Doffin.'}</Text>
        {publicCpv.length ? publicCpv.map((row) => (
          <View key={row.code} style={styles.listRow}>
            <Text style={{ color: colors.ink }}>{cpvTitle(row.code, row.label)}</Text>
            <Chip
              label={selectedCpv.has(row.code) ? 'Valgt' : 'Bruk i varsling'}
              colors={colors}
              on={selectedCpv.has(row.code)}
              onPress={() => toggle(setSelectedCpv, row.code)}
            />
          </View>
        )) : null}
      </View>

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.h, { color: colors.ink }]}>Egne koder til anbudsvarsling</Text>
        <Text style={{ color: colors.muted }}>
          {company?.name || 'Bedriften'} · {ownLabels.length} CPV valgt. Utgangspunktet er kodene fra tildelinger og bedriften.
        </Text>
        <View style={{ gap: 4 }}>
          {ownLabels.length
            ? ownLabels.map((row) => <Text key={row} style={{ color: colors.ink }}>{row}</Text>)
            : <Text style={{ color: colors.muted }}>Ingen CPV valgt ennå.</Text>}
        </View>
        <TextInput
          value={cpvQuery}
          onChangeText={setCpvQuery}
          placeholder="Søk i CPV"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        {CPV_GROUPS.map((group) => {
          const q = cpvQuery.trim().toLowerCase();
          const children = group.children.filter((row) => !q || `${row.code} ${row.label}`.toLowerCase().includes(q));
          const opened = openGroups.has(group.code) || !!q;
          return (
            <View key={group.code} style={{ gap: 6 }}>
              <Chip label={`${group.code.slice(0, 4)} ${group.label}`} colors={colors} on={selectedCpv.has(group.code)} onPress={() => toggle(setSelectedCpv, group.code)} />
              <TouchableOpacity
                onPress={() => setOpenGroups((current) => {
                  const next = new Set(current);
                  if (next.has(group.code)) next.delete(group.code);
                  else next.add(group.code);
                  return next;
                })}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.brand }}>{opened ? 'Skjul undernivå' : `Vis ${children.length} undernivå`}</Text>
              </TouchableOpacity>
              {opened ? (
                <View style={styles.row}>
                  {children.map((row) => (
                    <Chip key={row.code} colors={colors} on={selectedCpv.has(row.code)} label={`${row.code.slice(0, 4)} ${row.label}`} onPress={() => toggle(setSelectedCpv, row.code)} />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        <TextInput
          value={customCpv}
          onChangeText={setCustomCpv}
          placeholder="Egen CPV, 8 siffer"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        <Chip
          label="Legg til CPV"
          colors={colors}
          on={false}
          onPress={() => {
            const code = normalizeCpvCode(customCpv);
            if (!code) return;
            setSelectedCpv((current) => new Set(current).add(code));
            setCustomCpv('');
          }}
        />
      </View>

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.h, { color: colors.ink }]}>AI-profil</Text>
        <Text style={{ color: colors.muted }}>
          Skriv søkeord, beskriv hva bedriften driver med, eller lim inn hjemmesiden. AI bruker det til å merke treff dere bør være observante på.
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Hva leverer dere? F.eks. rådgivende ingeniører innen VVS og energi"
          placeholderTextColor={colors.placeholder}
          multiline
          numberOfLines={4}
          style={[styles.input, styles.area, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        <TextInput
          value={website}
          onChangeText={setWebsite}
          placeholder="Hjemmeside, f.eks. https://www.firma.no"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          keyboardType="url"
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        {summary ? <Text style={{ color: colors.ink, lineHeight: 22 }}>{summary}</Text> : null}
        {profileKeywords.length ? (
          <View style={styles.row}>
            {profileKeywords.map((row) => (
              <Chip
                key={row}
                label={`${row} ×`}
                hint={`Fjern AI-søkeord ${row}`}
                colors={colors}
                on
                onPress={() => setProfileKeywords((current) => current.filter((item) => item !== row))}
              />
            ))}
          </View>
        ) : null}
        <View style={styles.row}>
          <TouchableOpacity
            onPress={interpretProfile}
            disabled={aiBusy || saving}
            style={[styles.save, { backgroundColor: colors.brand, opacity: aiBusy || saving ? 0.7 : 1 }]}
            accessibilityRole="button"
          >
            <Text style={{ color: '#fff' }}>{aiBusy ? 'Tolker …' : 'La AI tolke bedriften'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={saveCriteria}
            disabled={aiBusy || saving || !ready}
            style={[styles.save, { backgroundColor: colors.brand, opacity: aiBusy || saving || !ready ? 0.7 : 1 }]}
            accessibilityRole="button"
          >
            <Text style={{ color: '#fff' }}>{saving ? 'Lagrer …' : 'Lagre profil'}</Text>
          </TouchableOpacity>
          {profileKeywords.length ? (
            <Chip
              label="Bruk som søkeord"
              colors={colors}
              on={false}
              onPress={() => setKeywords(normalizeKeywords([...keywords, ...profileKeywords]))}
            />
          ) : null}
        </View>
        {!!aiNote && (
          <Text style={{ color: /feilet|ikke|Kunne ikke|Fant ikke/i.test(aiNote) ? colors.danger : colors.muted }}>
            {aiNote}
          </Text>
        )}
      </View>

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.h, { color: colors.ink }]}>Søkeord</Text>
        <Text style={{ color: colors.muted }}>Ord som skal treffe i tittel, beskrivelse eller oppdragsgiver, i tillegg til CPV-treff.</Text>
        <View style={styles.row}>
          {keywords.map((row) => (
            <Chip key={row} label={`${row} ×`} hint={`Fjern søkeord ${row}`} colors={colors} on onPress={() => setKeywords((current) => current.filter((item) => item !== row))} />
          ))}
        </View>
        <TextInput
          value={keywordDraft}
          onChangeText={setKeywordDraft}
          placeholder="F.eks. sykehus, adgangskontroll"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          onSubmitEditing={() => {
            setKeywords(normalizeKeywords([...keywords, ...keywordDraft.split(/[,;\n]/)]));
            setKeywordDraft('');
          }}
        />
        <Chip
          label="Legg til søkeord"
          colors={colors}
          on={false}
          onPress={() => {
            const next = normalizeKeywords([...keywords, ...keywordDraft.split(/[,;\n]/)]);
            if (next.length === keywords.length) return;
            setKeywords(next);
            setKeywordDraft('');
          }}
        />
        <Text style={[styles.h, { color: colors.ink }]}>Næringskoder</Text>
        {trades.map((row) => <Text key={row} style={{ color: colors.ink }}>{row}</Text>)}
        <TextInput
          value={tradeDraft}
          onChangeText={setTradeDraft}
          placeholder="Kode eller beskrivelse"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        <Chip
          label="Legg til næringskode"
          colors={colors}
          on={false}
          onPress={() => {
            const value = tradeDraft.trim();
            if (!value) return;
            setTrades((current) => (current.includes(value) ? current : [...current, value]));
            setTradeDraft('');
          }}
        />
        <RegionCoverage
          colors={colors}
          departments={alignDepartmentAreas(
            departmentAreas,
            departmentsOf(units).map((row) => ({ id: row.id, name: row.name })),
          )}
          companyNationwide={nationwide}
          companyAreaIds={[...areas]}
          onCompanyChange={({ nationwide: nextNationwide, areaIds }) => {
            setNationwide(nextNationwide);
            setAreas(new Set(areaIds));
          }}
          onDepartmentChange={(id, patch) => {
            const rows = alignDepartmentAreas(
              departmentAreas,
              departmentsOf(units).map((row) => ({ id: row.id, name: row.name })),
            );
            setDepartmentAreas(rows.map((row) => (
              row.id === id
                ? {
                  ...row,
                  nationwide: !!patch.nationwide,
                  areas: patch.nationwide
                    ? []
                    : patch.areaIds.map((areaId) => TENDER_AREAS.find((area) => area.id === areaId)).filter(Boolean),
                }
                : row
            )));
          }}
        />
        <Text style={[styles.h, { color: colors.ink }]}>Kanaler</Text>
        <View style={styles.row}>
          <Chip label="Doffin" colors={colors} on={channels.has('doffin')} onPress={() => toggle(setChannels, 'doffin')} />
          <Chip label="TED" colors={colors} on={channels.has('ted')} onPress={() => toggle(setChannels, 'ted')} />
        </View>
        <Text style={{ color: colors.muted }}>Mercell har ikke et åpent søke-API. Treff derfra kommer ikke inn automatisk.</Text>
        <Text style={[styles.h, { color: colors.ink }]}>Varsling</Text>
        <View style={styles.row}>
          <Chip label="Push" colors={colors} on={notify.push} onPress={() => setNotify((n) => ({ ...n, push: !n.push }))} />
          <Chip label="Varsel" colors={colors} on={notify.varsel} onPress={() => setNotify((n) => ({ ...n, varsel: !n.varsel }))} />
          <Chip label="E-post" colors={colors} on={notify.email} onPress={() => setNotify((n) => ({ ...n, email: !n.email }))} />
        </View>
        {emails.map((row) => <Text key={row} style={{ color: colors.ink }}>{row}</Text>)}
        <TextInput
          value={emailDraft}
          onChangeText={setEmailDraft}
          placeholder="Mottaker, f.eks. nye_prosjekt@firma.no"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        <Chip
          label="Legg til e-post"
          colors={colors}
          on={false}
          onPress={() => {
            const value = emailDraft.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return;
            setEmails((current) => (current.includes(value) ? current : [...current, value]));
            setEmailDraft('');
          }}
        />
        <TouchableOpacity onPress={saveCriteria} style={[styles.save, { backgroundColor: colors.brand }]} accessibilityRole="button">
          <Text style={{ color: '#fff' }}>{saving ? 'Lagrer …' : 'Lagre kriterier'}</Text>
        </TouchableOpacity>
        {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
        {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
        <Text style={{ color: colors.muted }}>E-posten følger samme oppsett som Mercell: treff, frist, oppdragsgiver og hvilken CPV som traff.</Text>
        <Text style={{ color: colors.muted }} numberOfLines={4}>{preview.text}</Text>
        <TouchableOpacity onPress={sendMail} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Send varsel nå</Text>
        </TouchableOpacity>
        {!!mailNote && <Text style={{ color: colors.muted }}>{mailNote}</Text>}
      </View>

      <PortalSettings company={company} colors={colors} onOpenWork={onOpenWork} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16, width: '100%', maxWidth: 860, alignSelf: 'flex-start' },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  h: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  listRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  area: { minHeight: 88, textAlignVertical: 'top' },
  save: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
});
