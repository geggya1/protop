/**
 * Organisasjon og roller (5.3), Kommunikasjon (7.4) og Årshjul.
 * Alt er registerposter – kartet, matrisen, planen og hjulet tegnes av dataene.
 */
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { prettyDate } from '../../src/iso/core';
import { ISO_ROLES } from '../../src/iso/catalog';
import {
  annualTaskEffects, annualWheel, authorityMatrix, communicationGroups, orgTree, pageLabel, roleLinks,
} from '../../src/iso/planning';
import { personsLabel } from '../../src/iso/registers';
import { SimpleRegister, Stat } from './IsoRegisters';
import { postDate, postTitle, useCompanyNews } from './useCompanyNews';
import { Banner, Btn, Card, KV, ListRow, Page, Pill, Row } from './isoUi';

const live = (rows) => (rows || []).filter((r) => r.state !== 'arkivert');
const pointer = Platform.OS === 'web' ? { cursor: 'pointer' } : {};

function Muted({ children }) {
  const colors = useColors();
  return <Text style={{ color: colors.muted, fontSize: 13 }}>{children}</Text>;
}

/* ───────── Organisasjon og roller ───────── */

function OrgBox({ node, root, onOpen }) {
  const colors = useColors();
  const r = node.role;
  return (
    <Pressable
      onPress={() => onOpen(r)}
      accessibilityRole="button"
      accessibilityLabel={`Åpne rolle ${r.title}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 10,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: r.needsReview ? colors.warn : (root ? colors.brand : colors.line),
        backgroundColor: pressed ? colors.brandSoft : (root ? `${colors.brand}10` : colors.card),
        ...pointer,
      })}
    >
      <Ionicons name={root ? 'business-outline' : 'person-outline'} size={16} color={colors.brand} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 14 }}>{r.title}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>
          {[personsLabel(r.holders), node.reportsToText ? `rapporterer til ${node.reportsToText}` : ''].filter(Boolean).join(' · ') || r.category || ' '}
        </Text>
      </View>
      {r.needsReview ? <Ionicons name="alert-circle-outline" size={16} color={colors.warn} /> : null}
    </Pressable>
  );
}

function OrgBranch({ node, onOpen }) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <OrgBox node={node} onOpen={onOpen} />
      {node.children.length ? (
        <View style={{ marginLeft: 14, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.line, gap: 6 }}>
          {node.children.map((c) => <OrgBranch key={c.role.id} node={c} onOpen={onOpen} />)}
        </View>
      ) : null}
    </View>
  );
}

/** Øverste rolle sentrert, nivået under side om side (bred skjerm) eller som tre (mobil). */
function OrgChart({ tree, wide, onOpen }) {
  const colors = useColors();
  return (
    <View style={{ gap: 14 }}>
      {tree.map((root) => (
        <View key={root.role.id} style={{ gap: 8 }}>
          <View style={{ alignSelf: wide ? 'center' : 'stretch', minWidth: wide ? 320 : undefined }}>
            <OrgBox node={root} root onOpen={onOpen} />
          </View>
          {root.children.length ? (
            wide ? (
              <View style={{ borderTopWidth: 2, borderTopColor: colors.line, paddingTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {root.children.map((c) => <View key={c.role.id} style={{ flexGrow: 1, flexBasis: 230, maxWidth: 420 }}><OrgBranch node={c} onOpen={onOpen} /></View>)}
              </View>
            ) : (
              <View style={{ marginLeft: 14, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.line, gap: 6 }}>
                {root.children.map((c) => <OrgBranch key={c.role.id} node={c} onOpen={onOpen} />)}
              </View>
            )
          ) : null}
        </View>
      ))}
    </View>
  );
}

function RoleLinks({ ctx, role }) {
  const colors = useColors();
  const links = useMemo(() => roleLinks(ctx.state, role), [ctx.state, role]);
  const head = (t) => <Text style={{ color: colors.ink, fontWeight: '700', marginTop: 6 }}>{t}</Text>;
  return (
    <View style={{ gap: 4 }}>
      {head('Myndighet i matrisen')}
      {links.authority.length
        ? links.authority.map((m) => <Text key={m.id} style={{ color: colors.ink, fontSize: 13 }}>• {m.title}{m.limit ? ` (${m.limit})` : ''}</Text>)
        : <Muted>Ingen aktiviteter i myndighetsmatrisen.</Muted>}
      {links.reports.length ? (
        <>
          {head('Rapporterer til denne rollen')}
          <Text style={{ color: colors.ink, fontSize: 13 }}>{links.reports.map((r) => r.title).join(', ')}</Text>
        </>
      ) : null}
      {head('Kompetansekrav')}
      {links.competence.length
        ? links.competence.map((k) => <Text key={k.id} style={{ color: colors.ink, fontSize: 13 }}>• {k.title}{k.role && k.role !== role.title ? ` (${k.role})` : ''}</Text>)
        : <Muted>Ingen kompetansekrav for rollen. Legg dem inn under Kompetanse med rollen som «Rolle / funksjon».</Muted>}
      <Row><Btn small icon="school-outline" label="Kompetanse" onPress={() => ctx.go('kompetanse')} /></Row>
      {links.processes.length ? (
        <>
          {head('Deltar i prosessene')}
          {links.processes.map((p) => (
            <ListRow key={p.id} icon="git-network-outline" title={`${p.code ? `${p.code} ` : ''}${p.title}`} onPress={() => ctx.go('prosesser', { open: p.id })} />
          ))}
        </>
      ) : null}
    </View>
  );
}

function AuthorityMatrix({ ctx, rows, onOpen }) {
  const colors = useColors();
  const m = useMemo(() => authorityMatrix(ctx.state.records.rolle, rows), [ctx.state.records.rolle, rows]);
  if (!rows.length) return <Muted>Ingen aktiviteter ennå. «Ny» legger til en aktivitet eller beslutning og hvilke roller som har myndighet.</Muted>;
  if (!m.columns.length) return <Muted>Aktivitetene peker ikke til noen roller. Legg inn roller over og velg dem i aktivitetene.</Muted>;
  const FIRST = 240;
  const COL = 92;
  const cell = { width: COL, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View>
        <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <View style={{ width: FIRST, justifyContent: 'flex-end' }}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>AKTIVITET / BESLUTNING</Text></View>
          {m.columns.map((c) => (
            <View key={c.id} style={cell}>
              <Text style={{ color: colors.ink, fontSize: 11, fontWeight: '700', textAlign: 'center' }} numberOfLines={3}>{c.title}</Text>
            </View>
          ))}
        </View>
        {m.groups.map((g) => (
          <View key={g.category}>
            <View style={{ paddingVertical: 6, paddingHorizontal: 6, backgroundColor: colors.sunken, marginTop: 8, borderRadius: 6 }}>
              <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '800' }}>{g.category}</Text>
            </View>
            {g.rows.map((row) => (
              <Pressable
                key={row.record.id}
                onPress={() => onOpen(row.record)}
                accessibilityRole="button"
                accessibilityLabel={`Åpne ${row.record.title}`}
                style={({ pressed }) => ({ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: pressed ? colors.brandSoft : 'transparent', ...pointer })}
              >
                <View style={{ width: FIRST, paddingRight: 8, gap: 2 }}>
                  <Text style={{ color: colors.ink, fontSize: 13 }}>{row.record.title}</Text>
                  {row.record.limit ? <Text style={{ color: colors.muted, fontSize: 11 }}>{row.record.limit}</Text> : null}
                  {row.record.needsReview ? <Text style={{ color: colors.warn, fontSize: 11 }}>Må gjennomgås</Text> : null}
                </View>
                {row.cells.map((on, i) => (
                  <View key={m.columns[i].id} style={cell}>
                    {on ? <Ionicons name="checkmark-circle" size={18} color={colors.brand} /> : <Text style={{ color: colors.line }}>·</Text>}
                  </View>
                ))}
              </Pressable>
            ))}
          </View>
        ))}
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>Hake = rollen har myndighet. Beløpsgrenser og vilkår står under aktiviteten. Trykk på en linje for å endre.</Text>
      </View>
    </ScrollView>
  );
}

export function OrganizationPage({ ctx }) {
  const colors = useColors();
  const { state, caps, go, wide } = ctx;
  const roleMap = state.system?.roleMap || {};
  const review = [...live(state.records.rolle), ...live(state.records.myndighet)].filter((r) => r.needsReview).length;
  return (
    <Page wide={wide} title="Organisasjon og roller" intro="Roller, ansvar og myndighet (ISO 5.3). Organisasjonskartet tegnes av «Rapporterer til». Myndighetsmatrisen viser hvem som kan beslutte hva.">
      {review ? <Banner tone="warn" icon="alert-circle-outline" text={`${review} roller og aktiviteter er merket «Må gjennomgås». Kontroller dem og trykk «Marker som gjennomgått».`} /> : null}
      <SimpleRegister
        ctx={ctx}
        registerKey="rolle"
        title="Organisasjonskart og roller"
        cardSubtitle="Trykk på en rolle for ansvar, myndighet, fullmakter og kompetansekrav."
        view={({ rows, open }) => (rows.length
          ? <OrgChart tree={orgTree(rows)} wide={wide} onOpen={open} />
          : <Muted>Ingen roller ennå. «Ny» legger til en rolle eller stilling med ansvar og myndighet.</Muted>)}
        detail={(r) => <RoleLinks ctx={ctx} role={r} />}
      />
      <SimpleRegister
        ctx={ctx}
        registerKey="myndighet"
        cardSubtitle="Aktiviteter og beslutninger (rader) mot rollene som har myndighet (kolonner)."
        view={({ rows, open }) => <AuthorityMatrix ctx={ctx} rows={rows} onOpen={open} />}
      />
      <Card title="Roller i ledelsessystemet" subtitle="ISO-rollene styrer hvem som godkjenner, får oppgaver og eskalering. De settes i Innstillinger.">
        {ISO_ROLES.map((r) => (
          <ListRow
            key={r.id}
            icon={roleMap[r.id]?.uid ? 'person-circle-outline' : 'help-circle-outline'}
            tone={roleMap[r.id]?.uid ? 'muted' : 'warn'}
            title={r.label}
            subtitle={roleMap[r.id]?.name || 'Ikke tildelt'}
          />
        ))}
        {caps.admin ? <Row><Btn small icon="settings-outline" label="Endre i Innstillinger" onPress={() => go('innstillinger')} /></Row> : null}
        <Text style={{ color: colors.muted, fontSize: 12 }}>Stillingene over beskriver organisasjonen. ISO-rollene er hvem i ProTop som har ansvaret i systemet.</Text>
      </Card>
    </Page>
  );
}

/* ───────── Kommunikasjon ───────── */

function CommunicationTable({ rows, wide, onOpen }) {
  const colors = useColors();
  const groups = communicationGroups(rows);
  if (!groups.length) return <Muted>Ingen linjer i planen ennå. «Ny» legger til hva som kommuniseres, til hvem, når, hvordan og av hvem.</Muted>;
  const cols = [
    { key: 'title', label: 'Hva', flex: 2.2 },
    { key: 'audience', label: 'Til hvem', flex: 1.6 },
    { key: 'when', label: 'Når', flex: 1.3 },
    { key: 'channel', label: 'Kanal', flex: 1.4 },
    { key: 'responsible', label: 'Hvem', flex: 1.3 },
  ];
  const val = (r, k) => (Array.isArray(r[k]) ? r[k].join(', ') : (r[k] || ''));
  return groups.map((g) => (
    <View key={g.direction} style={{ gap: 4 }}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 6 }}>{`${g.direction} (${g.rows.length})`.toUpperCase()}</Text>
      {wide ? (
        <View>
          <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            {cols.map((c) => <Text key={c.key} style={{ flex: c.flex, color: colors.muted, fontSize: 11, fontWeight: '700' }}>{c.label}</Text>)}
          </View>
          {g.rows.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => onOpen(r)}
              accessibilityRole="button"
              accessibilityLabel={`Åpne ${r.title}`}
              style={({ pressed }) => ({ flexDirection: 'row', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: pressed ? colors.brandSoft : 'transparent', ...pointer })}
            >
              {cols.map((c) => (
                <Text key={c.key} style={{ flex: c.flex, color: c.key === 'title' ? colors.ink : colors.muted, fontSize: 13, fontWeight: c.key === 'title' ? '600' : '400' }} numberOfLines={3}>
                  {val(r, c.key)}{c.key === 'title' && r.needsReview ? ' ⚠' : ''}
                </Text>
              ))}
            </Pressable>
          ))}
        </View>
      ) : g.rows.map((r) => (
        <ListRow
          key={r.id}
          icon="megaphone-outline"
          tone={r.needsReview ? 'warn' : 'muted'}
          title={r.title}
          subtitle={[r.audience, r.when, val(r, 'channel'), r.responsible].filter(Boolean).join(' · ')}
          right={r.needsReview ? <Pill label="Må gjennomgås" tone="warn" /> : null}
          onPress={() => onOpen(r)}
        />
      ))}
    </View>
  ));
}

export function CommunicationPage({ ctx }) {
  const colors = useColors();
  const { state, wide, companyId, requestTab } = ctx;
  const rows = live(state.records.kommunikasjon);
  const { top: news } = useCompanyNews(companyId, { limit: 5 });
  const openNews = () => requestTab?.('selskap', 'nyheter');
  return (
    <Page wide={wide} title="Kommunikasjon" intro="Hva som kommuniseres, til hvem, når, hvordan og av hvem – internt og eksternt (ISO 7.4). Gjelder også miljø- og HMS-informasjon.">
      <Row>
        <Stat label="Intern" value={rows.filter((r) => r.direction !== 'Ekstern').length} />
        <Stat label="Ekstern" value={rows.filter((r) => r.direction !== 'Intern').length} />
        <Stat label="Uten ansvarlig person" value={rows.filter((r) => !r.ownerName).length} tone={rows.some((r) => !r.ownerName) ? 'warn' : undefined} hint="Rollen står i planen. Ansvarlig person gir oppgaver til riktig person." />
      </Row>
      <SimpleRegister
        ctx={ctx}
        registerKey="kommunikasjon"
        cardSubtitle="Trykk på en linje for formål, kanal og hvor det dokumenteres."
        view={({ rows: list, open }) => <CommunicationTable rows={list} wide={wide} onOpen={open} />}
      />
      <Card
        title="Nyheter"
        subtitle="Nyheter publiseres ett sted i ProTop: Selskap → Nyheter. Velg kategorien «Kvalitet, miljø og HMS» for nyheter fra ledelsessystemet."
        right={<Btn small icon="create-outline" label="Skriv nyhet" onPress={openNews} />}
      >
        {news.length
          ? news.map((p) => <ListRow key={p.id} icon="megaphone-outline" title={postTitle(p)} subtitle={[postDate(p) ? prettyDate(postDate(p)) : '', p.authorName].filter(Boolean).join(' · ')} onPress={openNews} />)
          : <Muted>Ingen nyheter ennå.</Muted>}
        {news.length ? <Row><Btn small icon="list-outline" label="Alle nyheter" onPress={openNews} /></Row> : null}
      </Card>
      <Card title="Kanaler i ProTop" subtitle="Bruk kanalene i planen, så finnes alt på ett sted.">
        <KV label="ProTop-nyhet" value="Selskap → Nyheter. Alle ansatte ser dem i appen." />
        <KV label="ProTop-oppgave" value="Oppgaver med frist og ansvarlig. Årshjulet og avvikene lager dem automatisk." />
        <KV label="Styrte dokumenter" value="ISO → Dokumenter. Med lesebekreftelse når de ansatte må bekrefte at de har lest." />
        <KV label="Avvik og forbedring" value="ISO → Avvik og forbedring. Alle ansatte kan melde avvik, forslag og varsling." />
        <Text style={{ color: colors.muted, fontSize: 12 }}>E-post, møter og telefon føres i planen som kanal. Referater lagres som dokumenter eller vedlegg.</Text>
      </Card>
    </Page>
  );
}

/* ───────── Årshjul ───────── */

function WheelItem({ item, planned, onPress }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 6, alignItems: 'flex-start', paddingVertical: 3, borderRadius: 6, backgroundColor: pressed ? colors.brandSoft : 'transparent', ...pointer })}
    >
      <Ionicons name={planned ? 'ellipse' : (item.count ? 'layers-outline' : 'calendar-outline')} size={planned ? 8 : 13} color={planned ? colors.brand : colors.muted} style={{ marginTop: planned ? 5 : 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: planned ? colors.ink : colors.muted, fontSize: 12, fontWeight: planned ? '600' : '400' }}>
          {item.title}{item.count ? ` (${item.count})` : ''}{item.date && !item.count ? ` · ${prettyDate(item.date)}` : ''}
        </Text>
        {planned && (item.responsibleRole || item.ownerName) ? <Text style={{ color: colors.muted, fontSize: 11 }}>{item.ownerName || item.responsibleRole}</Text> : null}
      </View>
    </Pressable>
  );
}

function MonthGrid({ months, current, wide, onOpen, go }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {months.map((m) => {
        const now = m.month === current;
        return (
          <View
            key={m.name}
            style={{
              flexGrow: 1,
              flexBasis: wide ? 260 : '100%',
              maxWidth: wide ? '33%' : undefined,
              padding: 10,
              gap: 4,
              borderRadius: 12,
              borderWidth: now ? 2 : 1,
              borderColor: now ? colors.brand : colors.line,
              backgroundColor: colors.card,
            }}
          >
            <Row gap={6}>
              <Text style={{ color: now ? colors.brand : colors.ink, fontWeight: '800', fontSize: 14 }}>{m.name}</Text>
              {now ? <Pill label="Nå" tone="info" /> : null}
            </Row>
            {m.planned.map((r) => <WheelItem key={r.id} item={r} planned onPress={() => onOpen(r)} />)}
            {m.dated.map((d) => <WheelItem key={d.key} item={d} onPress={() => go(d.page, d.open ? { open: d.open } : {})} />)}
            {!m.planned.length && !m.dated.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>–</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

export function AnnualWheelPage({ ctx }) {
  const colors = useColors();
  const { state, store, caps, go, wide } = ctx;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const months = useMemo(() => annualWheel(state, { year }), [state, year]);
  const thisMonth = useMemo(() => annualWheel(state, { year: now.getFullYear() })[now.getMonth()], [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = annualTaskEffects(state, { now, all: true });
  const auto = live(state.records.aarshjul).filter((r) => r.createTasks).length;

  async function makeTasks() {
    setBusy(true);
    const n = await store.runEffects(pending);
    setBusy(false);
    setMsg(n ? `${n === 1 ? 'Én oppgave' : `${n} oppgaver`} ligger nå i Oppgaver.` : 'Oppgavene for måneden finnes allerede i Oppgaver.');
  }

  return (
    <Page wide={wide} title="Årshjul" intro="Faste aktiviteter i ledelsessystemet gjennom året, sammen med datoene fra registrene: revisjoner, gjennomganger, øvelser, revurderinger og evalueringer.">
      <Card
        title={`Denne måneden – ${thisMonth.name.toLowerCase()} ${now.getFullYear()}`}
        right={caps.manage && pending.length ? <Btn small icon="checkbox-outline" label={`Lag oppgaver for ${thisMonth.name.toLowerCase()}`} busy={busy} onPress={makeTasks} /> : null}
      >
        {msg ? <Banner tone="ok" text={msg} /> : null}
        {thisMonth.planned.map((r) => (
          <ListRow
            key={r.id}
            icon="ellipse-outline"
            title={r.title}
            subtitle={[r.ownerName || r.responsibleRole, r.frequency, pageLabel(r.page) ? `i ${pageLabel(r.page)}` : ''].filter(Boolean).join(' · ')}
            right={r.page ? <Btn small label="Åpne" onPress={() => go(r.page)} /> : null}
            onPress={r.page ? () => go(r.page) : undefined}
          />
        ))}
        {thisMonth.dated.map((d) => (
          <ListRow key={d.key} icon={d.count ? 'layers-outline' : 'calendar-outline'} title={`${d.title}${d.count ? ` (${d.count})` : ''}`} subtitle={d.date ? prettyDate(d.date) : pageLabel(d.page)} onPress={() => go(d.page, d.open ? { open: d.open } : {})} />
        ))}
        {!thisMonth.planned.length && !thisMonth.dated.length ? <Muted>Ingenting planlagt denne måneden.</Muted> : null}
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {auto
            ? `${auto} aktiviteter er merket «Lag oppgave». De blir oppgaver automatisk når måneden starter.`
            : 'Merk aktiviteter med «Lag oppgave i ProTop når måneden starter», så kommer de som oppgaver av seg selv.'}
        </Text>
      </Card>
      <SimpleRegister
        ctx={ctx}
        registerKey="aarshjul"
        title={`Årshjul ${year}`}
        cardSubtitle="Prikk = planlagt aktivitet. Kalender = dato fra registrene. Trykk for detaljer eller for å gå til siden."
        view={({ rows, open }) => (rows.length || months.some((m) => m.dated.length)
          ? <MonthGrid months={months} current={year === now.getFullYear() ? now.getMonth() : -1} wide={wide} onOpen={open} go={go} />
          : <Muted>Ingen aktiviteter ennå. «Ny» legger til en fast aktivitet med måned(er) og ansvarlig.</Muted>)}
        detail={(r) => (r.page ? <Row><Btn icon="arrow-forward-outline" label={`Gå til ${pageLabel(r.page)}`} onPress={() => go(r.page)} /></Row> : null)}
      >
        <Row>
          <Btn small icon="chevron-back" accessibilityLabel="Forrige år" onPress={() => setYear(year - 1)} />
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{year}</Text>
          <Btn small icon="chevron-forward" accessibilityLabel="Neste år" onPress={() => setYear(year + 1)} />
          {year !== now.getFullYear() ? <Btn small label="I år" onPress={() => setYear(now.getFullYear())} /> : null}
        </Row>
      </SimpleRegister>
    </Page>
  );
}
