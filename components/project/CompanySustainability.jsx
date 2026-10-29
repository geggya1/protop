/**
 * Bærekraft: bedriftens egen tekst, og det som allerede er beskrevet i bedriften:
 * gyldige sertifikater, publisert policy og miljømål fra ISO, og nyheter om bærekraft.
 * ISO-innholdet oppdateres der det eies; her velger bedriften bare hva som vises.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SUSTAINABILITY_SOURCES } from '../../src/project/companyPage';
import { nbDate } from '../../src/project/companyPublic';
import {
  SUSTAINABILITY_NEWS, hasIsoSustainability, isoSustainability, markdownExcerpt,
} from '../../src/project/companySustainability';
import { radius, space, type } from '../../src/ui/tokens';
import ArticleText from './ArticleText';
import ArticleTextField from './ArticleTextField';
import CompanyNewsWall from './CompanyNewsWall';
import {
  Card, CheckRow, EditBar, EmptyNote, PillButton, SectionHead,
} from './ProfileParts';

function Certificates({ iso, colors }) {
  if (!iso.certificates.length && !iso.standards.length) return null;
  return (
    <Card colors={colors} nativeID="company-sustainability-certificates">
      <SectionHead colors={colors} title={iso.certificates.length ? 'Sertifikater' : 'Styringssystem'} />
      {iso.certificates.map((row) => (
        <View key={row.id} style={styles.line}>
          <View style={[styles.badge, { backgroundColor: colors.successSoft || colors.sunken }]}>
            <Ionicons name="ribbon-outline" size={18} color={colors.successInk || colors.success} />
          </View>
          <View style={styles.flex}>
            <Text style={[type.bodyStrong, { color: colors.ink }]}>{row.title}</Text>
            <Text style={[type.caption, { color: colors.muted }]}>
              {[row.body, row.validTo ? `gyldig til ${nbDate(row.validTo)}` : ''].filter(Boolean).join(' · ')}
            </Text>
            {row.scope ? <Text style={[type.caption, { color: colors.muted }]} numberOfLines={3}>{row.scope}</Text> : null}
          </View>
        </View>
      ))}
      {iso.standards.length ? (
        <Text style={[type.body, { color: colors.ink }]}>
          {iso.certificates.length ? 'Styringssystemet følger ' : 'Bedriften har et styringssystem etter '}
          {iso.standards.join(', ').replace(/, ([^,]*)$/, ' og $1')}.
        </Text>
      ) : null}
    </Card>
  );
}

function Goals({ iso, colors }) {
  if (!iso.goals.length) return null;
  return (
    <Card colors={colors} nativeID="company-sustainability-goals">
      <SectionHead colors={colors} title="Miljømål" />
      {iso.goals.map((goal) => (
        <View key={goal.id} style={styles.goal}>
          <View style={styles.line}>
            <Ionicons name={goal.reached ? 'checkmark-circle' : 'leaf-outline'} size={18} color={goal.reached ? colors.success : colors.brand} />
            <View style={styles.flex}>
              <Text style={[type.body, { color: colors.ink }]}>{goal.title}</Text>
              <Text style={[type.caption, { color: colors.muted }]}>
                {[goal.target, goal.deadline ? `innen ${nbDate(goal.deadline)}` : '', goal.reached ? 'Nådd' : goal.progress]
                  .filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
          {goal.pct != null && !goal.reached ? (
            <View style={[styles.track, { backgroundColor: colors.sunken }]} accessibilityLabel={`${goal.pct} prosent av veien`}>
              <View style={[styles.fill, { width: `${goal.pct}%`, backgroundColor: colors.success }]} />
            </View>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

function Policy({ policy, colors }) {
  const [open, setOpen] = useState(false);
  const excerpt = useMemo(() => markdownExcerpt(policy.content, 900), [policy.content]);
  return (
    <Card colors={colors} nativeID="company-sustainability-policy">
      <SectionHead colors={colors} title={policy.title} />
      <Text style={[type.caption, { color: colors.muted }]}>
        {[policy.revision ? `Revisjon ${policy.revision}` : '', policy.publishedAt ? `publisert ${nbDate(policy.publishedAt)}` : '']
          .filter(Boolean).join(' · ')}
      </Text>
      <ArticleText text={open ? policy.content : excerpt.text} colors={colors} compact />
      {excerpt.clipped ? (
        <View style={styles.row}>
          <PillButton label={open ? 'Vis mindre' : 'Les hele policyen'} icon={open ? 'chevron-up' : 'chevron-down'} onPress={() => setOpen((on) => !on)} colors={colors} />
        </View>
      ) : null}
    </Card>
  );
}

export default function CompanySustainability({
  page,
  iso,
  editing,
  canEdit,
  wide,
  colors,
  fallback = '',
  onEdit,
  onUpdate,
  onOpenNews,
  onOpenIso,
  saving,
  error,
  onSave,
  onCancel,
}) {
  const sources = page?.sustainabilitySources || {};
  const own = String(page?.sustainability || '').trim();
  const data = useMemo(() => (iso?.status === 'ready' ? isoSustainability(iso.parts) : null), [iso]);
  const shownIso = data ? {
    standards: sources.certificates === false ? [] : data.standards,
    certificates: sources.certificates === false ? [] : data.certificates,
    policy: sources.policy === false ? null : data.policy,
    goals: sources.goals === false ? [] : data.goals,
  } : null;
  const hasIso = hasIsoSustainability(shownIso);

  const news = sources.news === false ? null : (
    <CompanyNewsWall
      variant="cards"
      categories={SUSTAINABILITY_NEWS}
      hideWhenEmpty
      onOpenPost={onOpenNews}
      header={<SectionHead colors={colors} title="Nyheter om bærekraft" action="Se alle nyheter" onAction={onOpenNews} />}
    />
  );

  const side = (
    <>
      {shownIso ? <Certificates iso={shownIso} colors={colors} /> : null}
      {shownIso ? <Goals iso={shownIso} colors={colors} /> : null}
      {iso?.status === 'loading' ? <EmptyNote colors={colors}>Henter fra ISO …</EmptyNote> : null}
    </>
  );

  const ownCard = editing ? (
    <Card colors={colors} nativeID="company-sustainability-editor">
      <Text style={[type.body, { color: colors.muted }]}>
        Fortell hvordan bedriften jobber med miljø, samfunn og arbeidsmiljø. Det som allerede står i ISO,
        hentes inn automatisk; velg under hva som skal vises.
      </Text>
      <ArticleTextField
        value={page?.sustainability || ''}
        onChange={(sustainability) => onUpdate((prev) => ({ ...prev, sustainability }))}
        colors={colors}
        maxLength={3000}
        placeholder="Vårt arbeid med bærekraft …"
      />
      <Text style={[type.label, { color: colors.ink }]}>Hent fra bedriften</Text>
      {SUSTAINABILITY_SOURCES.map((row) => (
        <CheckRow
          key={row.id}
          checked={sources[row.id] !== false}
          label={row.label}
          hint={row.hint}
          onPress={() => onUpdate((prev) => ({
            ...prev,
            sustainabilitySources: { ...(prev.sustainabilitySources || {}), [row.id]: (prev.sustainabilitySources || {})[row.id] === false },
          }))}
          colors={colors}
        />
      ))}
      {iso?.status === 'none' ? (
        <Text style={[type.caption, { color: colors.muted }]}>Fant ikke ISO-innhold du har tilgang til. Sertifikater, policy og miljømål legges inn i ISO.</Text>
      ) : null}
      <EditBar colors={colors} saving={saving} error={error} onSave={onSave} onCancel={onCancel} />
    </Card>
  ) : (
    <Card colors={colors} nativeID="company-sustainability">
      {canEdit ? (
        <View style={styles.toolbar}>
          {onOpenIso ? <PillButton label="Åpne ISO" icon="shield-checkmark-outline" onPress={onOpenIso} colors={colors} /> : null}
          <PillButton label="Rediger" icon="pencil-outline" onPress={onEdit} colors={colors} />
        </View>
      ) : null}
      {own ? <ArticleText text={own} colors={colors} /> : null}
      {!own && fallback ? <Text style={[styles.lead, { color: colors.ink }]}>{fallback}</Text> : null}
      {!own && !fallback && !hasIso ? (
        <EmptyNote colors={colors}>
          {canEdit ? 'Skriv om bedriftens arbeid med miljø og samfunn under Rediger. Sertifikater, policy og miljømål fra ISO kommer med automatisk.' : 'Bedriften har ikke publisert noe om bærekraft ennå.'}
        </EmptyNote>
      ) : null}
    </Card>
  );

  return (
    <View style={[styles.columns, wide && styles.columnsWide]}>
      <View style={styles.main}>
        {ownCard}
        {shownIso?.policy ? <Policy policy={shownIso.policy} colors={colors} /> : null}
        {news}
      </View>
      <View style={[styles.side, wide && styles.sideWide]}>{side}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  columns: { gap: space.sm },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  main: { flex: 1.45, gap: space.sm, minWidth: 0 },
  side: { gap: space.sm, minWidth: 0 },
  sideWide: { flex: 0.8, maxWidth: 380 },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.xs },
  lead: { fontSize: type.body.fontSize + 2, lineHeight: 26 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  badge: { width: 32, height: 32, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  goal: { gap: space.xxs },
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden', marginLeft: 26 },
  fill: { height: 6, borderRadius: radius.pill },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
