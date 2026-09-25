import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { searchKartverketAdresser } from '../../src/utils/boligmappaApis';
import { fetchWeatherForecast, roundTemp, searchWeatherPlaces } from '../../src/utils/weather';
import { formatGreetingDate } from '../../src/utils/timeGreeting';
import { lookupCompanyCpv } from '../../src/anbud/companyLookup';
import {
  fetchPublicCompany,
  nbDate,
  nok,
  registerRows,
  storedCompanyProfile,
  weatherQuery,
} from '../../src/project/companyPublic';

function openUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return;
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  Linking.openURL(href).catch(() => {});
}

function Card({ children, colors, style }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }, style]}>
      {children}
    </View>
  );
}

function SectionTitle({ children, colors, action, onAction }) {
  return (
    <View style={styles.cardHead}>
      <Text style={[styles.cardTitle, { color: colors.ink }]}>{children}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button">
          <Text style={[styles.link, { color: colors.brand }]}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Fact({ label, value, colors }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

function Stat({ label, value, colors }) {
  return (
    <View style={[styles.stat, { backgroundColor: colors.sunken }]}>
      <Text style={[styles.statValue, { color: colors.ink }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

export default function CompanyLanding({
  stored,
  projects = [],
  members = [],
  cpvCodes: storedCpv = [],
  onProjects,
  onSettings,
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forecast, setForecast] = useState(null);
  const [placeName, setPlaceName] = useState('');
  const [cpvCodes, setCpvCodes] = useState(storedCpv);
  const [cpvSource, setCpvSource] = useState('');
  const profile = live?.company || storedCompanyProfile(stored);
  const orgnr = stored?.organisasjonsnummer || '';

  useEffect(() => {
    if (String(orgnr).replace(/\D/g, '').length !== 9) return undefined;
    let alive = true;
    setLoading(true);
    setError('');
    fetchPublicCompany(orgnr)
      .then((data) => {
        if (!alive) return;
        if (!data.ok) {
          setError(data.error || 'Kunne ikke hente offentlige opplysninger.');
          return;
        }
        setLive(data);
      })
      .catch((err) => {
        if (alive) setError(err?.message || 'Kunne ikke hente offentlige opplysninger.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [orgnr]);

  const storedCpvKey = (storedCpv || []).map((row) => row.code).filter(Boolean).join(',');
  useEffect(() => {
    const saved = storedCpvKey
      ? storedCpvKey.split(',').map((code) => (storedCpv || []).find((row) => row.code === code) || { code })
      : [];
    const id = String(orgnr || '').replace(/\D/g, '');
    if (id.length !== 9) {
      setCpvCodes(saved);
      setCpvSource(saved.length ? 'Lagret på bedriften' : '');
      return undefined;
    }
    let alive = true;
    lookupCompanyCpv(id)
      .then((data) => {
        if (!alive) return;
        const found = Array.isArray(data?.cpvCodes) ? data.cpvCodes : [];
        if (found.length) {
          setCpvCodes(found);
          setCpvSource('Offentlige tildelinger på Doffin');
          return;
        }
        setCpvCodes(saved);
        setCpvSource(saved.length ? 'Lagret på bedriften' : '');
      })
      .catch(() => {
        if (!alive) return;
        setCpvCodes(saved);
        setCpvSource(saved.length ? 'Lagret på bedriften' : '');
      });
    return () => { alive = false; };
  }, [orgnr, storedCpvKey]);

  const query = weatherQuery(profile);
  useEffect(() => {
    if (!query) return undefined;
    let alive = true;
    (async () => {
      try {
        const found = await searchKartverketAdresser(query, { treffPerSide: 3 });
        const hit = (found.results || []).find((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon));
        let place = null;
        if (hit) {
          place = {
            name: hit.poststed || profile?.forretning?.poststed || 'Bedriften',
            label: hit.label || query,
            lat: hit.lat,
            lng: hit.lon,
            source: 'company',
          };
        } else {
          const hits = await searchWeatherPlaces(profile?.forretning?.poststed || query);
          if (hits[0]) place = { ...hits[0], source: 'company' };
        }
        if (!place || !alive) return;
        setPlaceName(place.name);
        const next = await fetchWeatherForecast(place);
        if (alive) setForecast(next);
      } catch {
        if (alive) setForecast(null);
      }
    })();
    return () => { alive = false; };
  }, [query, profile?.forretning?.poststed]);

  const dateLabel = useMemo(() => formatGreetingDate(new Date()), []);
  const temp = forecast?.current?.temp ?? forecast?.today?.temp;
  const weatherIcon = forecast?.current?.icon || forecast?.today?.icon || 'partly-sunny';
  const weatherBit = Number.isFinite(Number(temp))
    ? `${roundTemp(temp)}° ${placeName || ''}`.trim()
    : placeName;
  const registers = registerRows(profile);
  const roles = live?.roles || [];
  const units = live?.units || [];
  const accounts = live?.accounts || null;
  const signature = live?.signature || null;
  const activeProjects = projects.filter((row) => row?.status !== 'arkivert');
  const phaseCounts = activeProjects.reduce((map, row) => {
    const key = row.phase || 'ukjent';
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});

  const weatherCard = (
    <Card colors={colors}>
      <SectionTitle colors={colors}>Været{placeName ? ` i ${placeName}` : ''}</SectionTitle>
      <View style={styles.weatherNow}>
        <Ionicons name={weatherIcon} size={32} color={colors.brand} />
        <Text style={[styles.weatherTemp, { color: colors.ink }]}>
          {Number.isFinite(Number(temp)) ? `${roundTemp(temp)}°` : '—'}
        </Text>
        <Text style={[styles.weatherLabel, { color: colors.muted }]} numberOfLines={2}>
          {forecast?.current?.label || forecast?.today?.label || (query ? 'Henter vær…' : 'Mangler forretningsadresse')}
          {forecast?.today?.tempRange ? `  ·  ${forecast.today.tempRange}` : ''}
        </Text>
      </View>
      <View style={styles.forecastRow}>
        {(forecast?.days || []).slice(0, 3).map((day, index) => (
          <View key={day.date || index} style={styles.forecastCol}>
            <Text style={[styles.factLabel, { color: colors.muted }]}>{index === 0 ? 'I dag' : (day.weekday || '–')}</Text>
            <Ionicons name={day.icon || 'partly-sunny'} size={16} color={colors.brand} />
            <Text style={[styles.forecastVal, { color: colors.ink }]}>{day.tempRange || '—'}</Text>
          </View>
        ))}
      </View>
      {forecast?.sourceLabel ? (
        <Text
          style={[styles.source, { color: colors.muted }]}
          onPress={() => forecast.yrUrl && openUrl(forecast.yrUrl)}
        >
          {forecast.sourceLabel}
        </Text>
      ) : null}
    </Card>
  );

  const workCard = (
    <Card colors={colors}>
      <SectionTitle colors={colors} action="Åpne prosjekt" onAction={onProjects}>Arbeidsflaten</SectionTitle>
      <View style={styles.statRow}>
        <Stat label="Prosjekt" value={String(activeProjects.length)} colors={colors} />
        <Stat label="Medlemmer" value={String(members.length)} colors={colors} />
      </View>
      {Object.keys(phaseCounts).length ? (
        <Text style={[styles.mutedLine, { color: colors.muted }]}>
          {Object.entries(phaseCounts).map(([phase, count]) => `${count} i ${phase}`).join(' · ')}
        </Text>
      ) : (
        <Text style={[styles.mutedLine, { color: colors.muted }]}>Ingen åpne prosjekt ennå.</Text>
      )}
      {activeProjects.slice(0, 4).map((row) => (
        <TouchableOpacity key={row.id || row.number} style={styles.listRow} onPress={onProjects}>
          <Ionicons name="construct-outline" size={16} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.ink, fontWeight: '400' }} numberOfLines={1}>
              {[row.number, row.name].filter(Boolean).join(' · ') || 'Prosjekt'}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
              {[row.phase, row.place, row.client].filter(Boolean).join(' · ') || 'Uten sted'}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </Card>
  );

  return (
    <View style={styles.page}>
      <View style={styles.hero}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.kicker, { color: colors.muted }]}>Bedrift</Text>
          <Text style={[styles.hello, { color: colors.ink }]} numberOfLines={2}>{profile?.navn || 'Bedrift'}</Text>
          <View style={styles.heroSub}>
            <Text style={[styles.heroMeta, { color: colors.muted }]}>{dateLabel}</Text>
            {weatherBit ? (
              <View style={[styles.weatherPill, { backgroundColor: colors.card, borderColor: colors.line }]}>
                <Ionicons name={weatherIcon} size={14} color={colors.brand} />
                <Text style={[styles.pillTxt, { color: colors.ink }]} numberOfLines={1}>{weatherBit}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.heroActions}>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.brand }]} onPress={onProjects}>
            <Ionicons name="construct-outline" size={15} color="#fff" />
            <Text style={styles.primaryTxt}>Prosjekt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onSettings}
            accessibilityLabel="Innstillinger for bedriften"
            style={[styles.penBtn, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <Ionicons name="pencil" size={16} color={colors.ink} />
          </TouchableOpacity>
        </View>
      </View>

      {!!error && <Text style={{ color: colors.danger, fontWeight: '400' }}>{error}</Text>}
      {loading && !live ? <Text style={{ color: colors.muted }}>Henter offentlige opplysninger…</Text> : null}

      <View style={[styles.columns, wide && styles.columnsWide]}>
        <View style={styles.mainCol}>
          <Card colors={colors}>
            <SectionTitle colors={colors}>Om bedriften</SectionTitle>
            <Text style={[styles.lead, { color: colors.ink }]}>
              {[profile?.organisasjonsnummer, profile?.organisasjonsform].filter(Boolean).join(' · ') || 'Manuell bedrift'}
            </Text>
            {profile?.formaal?.length ? (
              <Text style={[styles.body, { color: colors.ink }]}>{profile.formaal.join(' ')}</Text>
            ) : null}
            {profile?.aktivitet?.length ? (
              <Text style={[styles.mutedLine, { color: colors.muted }]}>{profile.aktivitet.join(' ')}</Text>
            ) : null}
            <View style={styles.factGrid}>
              <Fact label="Stiftet" value={nbDate(profile?.stiftelsesdato)} colors={colors} />
              <Fact label="I Enhetsregisteret" value={nbDate(profile?.registrert)} colors={colors} />
              <Fact label="Målform" value={profile?.maalform} colors={colors} />
              <Fact label="Sektor" value={[profile?.sektorKode, profile?.sektor].filter(Boolean).join(' · ')} colors={colors} />
              <Fact label="Ansatte" value={profile?.ansatte != null ? String(profile.ansatte) : ''} colors={colors} />
              <Fact
                label={profile?.kapital?.type || 'Kapital'}
                value={profile?.kapital ? `${nok(profile.kapital.belop)}${profile.kapital.aksjer ? ` · ${profile.kapital.aksjer} aksjer` : ''}` : ''}
                colors={colors}
              />
              <Fact label="Siste årsregnskap" value={profile?.sisteRegnskap} colors={colors} />
              <Fact label="Vedtekter" value={nbDate(profile?.vedtektsdato)} colors={colors} />
            </View>
            {(profile?.naeringer || []).length ? (
              <View style={styles.fact}>
                <Text style={[styles.factLabel, { color: colors.muted }]}>Næringskoder</Text>
                {profile.naeringer.map((row) => (
                  <Text key={`${row.kode}-${row.beskrivelse}`} style={[styles.factValue, { color: colors.ink, fontWeight: '400' }]}>
                    {[row.kode, row.beskrivelse].filter(Boolean).join(' · ')}
                  </Text>
                ))}
              </View>
            ) : null}
            {(stored?.egneNaeringskoder || []).length ? (
              <View style={styles.fact}>
                <Text style={[styles.factLabel, { color: colors.muted }]}>Egne koder til anbudsvarsling</Text>
                {stored.egneNaeringskoder.map((row) => (
                  <Text key={row} style={[styles.factValue, { color: colors.ink, fontWeight: '400' }]}>{row}</Text>
                ))}
              </View>
            ) : null}
            {profile?.historiskeNavn?.length ? (
              <Fact label="Tidligere navn" value={profile.historiskeNavn.join(', ')} colors={colors} />
            ) : null}
          </Card>

          <Card colors={colors}>
            <SectionTitle colors={colors}>Kontakt og adresse</SectionTitle>
            <Fact label="Forretningsadresse" value={profile?.forretning?.label} colors={colors} />
            <Fact label="Kommune" value={[profile?.forretning?.kommune, profile?.forretning?.kommunenummer].filter(Boolean).join(' · ')} colors={colors} />
            <Fact label="Postadresse" value={profile?.post?.label} colors={colors} />
            <Fact label="Telefon" value={profile?.telefon || stored?.telefon} colors={colors} />
            <Fact label="Mobil" value={profile?.mobil} colors={colors} />
            <Fact label="E-post" value={profile?.epostadresse || stored?.epostadresse} colors={colors} />
            {profile?.hjemmeside ? (
              <TouchableOpacity onPress={() => openUrl(profile.hjemmeside)}>
                <Fact label="Hjemmeside" value={profile.hjemmeside} colors={colors} />
              </TouchableOpacity>
            ) : null}
          </Card>

          {registers.length ? (
            <Card colors={colors}>
              <SectionTitle colors={colors}>Register og status</SectionTitle>
              {registers.map((row) => (
                <View key={row.label} style={styles.listRow}>
                  <Ionicons
                    name={row.label === 'Konkurs' || row.label === 'Avvikling' || row.label === 'Tvangsavvikling' ? 'warning-outline' : 'checkmark-circle-outline'}
                    size={16}
                    color={colors.brand}
                  />
                  <Text style={{ color: colors.ink, fontWeight: '400', flex: 1 }}>{row.label}</Text>
                  <Text style={{ color: colors.muted }}>{row.value}</Text>
                </View>
              ))}
              {!profile?.konkurs && !profile?.avvikling && !profile?.tvang ? (
                <Text style={[styles.mutedLine, { color: colors.muted }]}>Ingen konkurs eller avvikling er registrert.</Text>
              ) : null}
            </Card>
          ) : null}

          {accounts ? (
            <Card colors={colors}>
              <SectionTitle colors={colors}>
                {`Årsregnskap ${accounts.fra ? accounts.fra.slice(0, 4) : profile?.sisteRegnskap || ''}`.trim()}
              </SectionTitle>
              <Text style={[styles.mutedLine, { color: colors.muted }]}>
                {[
                  accounts.revidert ? 'Revidert' : 'Ikke revidert',
                  accounts.smaafortak ? 'Små foretak' : '',
                  accounts.morselskap ? 'Morselskap' : '',
                  nbDate(accounts.fra) && nbDate(accounts.til) ? `${nbDate(accounts.fra)} – ${nbDate(accounts.til)}` : '',
                ].filter(Boolean).join(' · ')}
              </Text>
              <View style={styles.statRow}>
                <Stat label="Driftsinntekter" value={nok(accounts.driftsinntekter) || '—'} colors={colors} />
                <Stat label="Driftsresultat" value={nok(accounts.driftsresultat) || '—'} colors={colors} />
                <Stat label="Årsresultat" value={nok(accounts.aarsresultat) || '—'} colors={colors} />
              </View>
              <View style={styles.statRow}>
                <Stat label="Eiendeler" value={nok(accounts.eiendeler) || '—'} colors={colors} />
                <Stat label="Egenkapital" value={nok(accounts.egenkapital) || '—'} colors={colors} />
                <Stat label="Gjeld" value={nok(accounts.gjeld) || '—'} colors={colors} />
              </View>
            </Card>
          ) : null}

          {signature ? (
            <Card colors={colors}>
              <SectionTitle colors={colors}>Signaturrett</SectionTitle>
              {signature.fritekst ? (
                <Text style={[styles.body, { color: colors.ink }]}>{signature.fritekst}</Text>
              ) : null}
              {signature.kombinasjoner.map((row) => (
                <View key={`${row.tekst}-${row.personer.map((person) => person.navn).join('-')}`} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontWeight: '400' }}>{row.tekst || 'Kan signere'}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {row.personer.map((person) => [person.navn, person.rolle].filter(Boolean).join(', ')).join(' · ')}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}

          <Card colors={colors}>
            <SectionTitle colors={colors}>CPV-koder</SectionTitle>
            <Text style={[styles.mutedLine, { color: colors.muted }]}>
              {cpvSource || 'Søkes i offentlige tildelinger på Doffin.'}
            </Text>
            {cpvCodes.length ? cpvCodes.map((row) => (
              <View key={row.code} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontWeight: '400' }}>{row.code}</Text>
                  {row.label ? <Text style={{ color: colors.muted, fontSize: 12 }}>{row.label}</Text> : null}
                </View>
              </View>
            )) : (
              <Text style={[styles.mutedLine, { color: colors.muted }]}>Ingen CPV-koder er funnet i offentlige tildelinger.</Text>
            )}
          </Card>

          {roles.length ? (
            <Card colors={colors}>
              <SectionTitle colors={colors}>Roller</SectionTitle>
              {roles.map((row) => (
                <View key={`${row.rolle}-${row.navn}`} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontWeight: '400' }}>{row.navn}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{row.rolle}</Text>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}

          {units.length ? (
            <Card colors={colors}>
              <SectionTitle colors={colors}>Underenheter</SectionTitle>
              {units.map((row) => (
                <View key={row.organisasjonsnummer} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontWeight: '400' }}>{row.navn}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {[row.organisasjonsnummer, row.naering, row.adresse].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}

          {live?.brregUrl ? (
            <TouchableOpacity onPress={() => openUrl(live.brregUrl)}>
              <Text style={[styles.source, { color: colors.muted }]}>Kilde: Enhetsregisteret, signaturrett og Regnskapsregisteret. CPV fra Doffin. Registerdetaljene ligger på forsiden inntil videre.</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={[styles.sideCol, wide && styles.sideColWide]}>
          {weatherCard}
          {workCard}
        </View>
      </View>
    </View>
  );
}

const webShadow = Platform.OS === 'web'
  ? { boxShadow: '0 8px 22px rgba(15, 23, 42, 0.05)' }
  : {};

const styles = StyleSheet.create({
  page: { paddingBottom: 28, gap: 14 },
  hero: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  kicker: { fontSize: 12, fontWeight: '400', letterSpacing: 0.4 },
  hello: { fontSize: 28, fontWeight: '400', letterSpacing: -0.4 },
  heroSub: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  heroMeta: { fontSize: 13, fontWeight: '400', textTransform: 'capitalize' },
  weatherPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
  },
  pillTxt: { fontSize: 12, fontWeight: '400' },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 10 },
  primaryTxt: { color: '#fff', fontWeight: '400', fontSize: 13 },
  penBtn: {
    width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  columns: { gap: 12 },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  mainCol: { flex: 1.4, gap: 12, minWidth: 0 },
  sideCol: { gap: 12, minWidth: 0 },
  sideColWide: { flex: 0.9, maxWidth: 420 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8, ...webShadow },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '400' },
  link: { fontWeight: '400', fontSize: 13 },
  lead: { fontSize: 15, fontWeight: '400' },
  body: { fontSize: 15, lineHeight: 21 },
  mutedLine: { fontSize: 13, lineHeight: 18 },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: { minWidth: 140, flexGrow: 1, gap: 2 },
  factLabel: { fontSize: 12, fontWeight: '400' },
  factValue: { fontSize: 14, fontWeight: '400', lineHeight: 19 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  statRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 12, padding: 10, gap: 2, minWidth: 0 },
  statValue: { fontSize: 16, fontWeight: '400' },
  weatherNow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weatherTemp: { fontSize: 28, fontWeight: '400' },
  weatherLabel: { flex: 1, fontSize: 13, lineHeight: 18 },
  forecastRow: { flexDirection: 'row', gap: 8 },
  forecastCol: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  forecastVal: { fontSize: 12, fontWeight: '400' },
  source: { fontSize: 12, fontWeight: '400' },
});
