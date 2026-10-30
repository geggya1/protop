/**
 * Sidespalten på fanene til bedriftssiden (Nyheter, Om oss, Ansatte og kontakt):
 * kort om bedriften, folkene, besøk og kontakt med åpningstider, siste nyheter og jobb.
 * Alt kommer fra det bedriften allerede har lagt inn. Blokker uten innhold vises ikke.
 * Med plass til det legges blokkene i to eller tre kolonner.
 */
import React, { useState } from 'react';
import {
  Image, Linking, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { companyInitials, formatPhone, websiteLabel } from '../../src/project/companyPage';
import { radius, space, type } from '../../src/ui/tokens';
import CompanyNewsWall from './CompanyNewsWall';
import { Card, SectionHead } from './ProfileParts';

const GAP = space.sm;
const TWO_COLS = 640;
const THREE_COLS = 1000;
const PEOPLE_MAX = 8;

function openUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return;
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  Linking.openURL(href).catch(() => {});
}

function Line({ icon, children, colors, onPress }) {
  return (
    <View style={styles.line}>
      <Ionicons name={icon} size={16} color={colors.muted} style={styles.lineIcon} />
      <Text
        style={[type.body, styles.flex, { color: onPress ? colors.brandInk || colors.brand : colors.ink }]}
        onPress={onPress || undefined}
        accessibilityRole={onPress ? 'link' : undefined}
      >
        {children}
      </Text>
    </View>
  );
}

function CompanyBlock({ data, colors, onTab }) {
  return (
    <Card colors={colors} nativeID="company-aside-company">
      <View style={styles.companyTop}>
        <View style={[styles.logo, { borderColor: colors.line, backgroundColor: colors.card }]}>
          {data.logo?.dataUrl ? (
            <Image source={{ uri: data.logo.dataUrl }} style={styles.logoImage} resizeMode="contain" accessibilityLabel={`Logo for ${data.name}`} />
          ) : (
            <Text style={[type.title, { color: colors.brand }]}>{companyInitials(data.name)}</Text>
          )}
        </View>
        <View style={styles.flex}>
          <Text style={[type.title, { color: colors.ink }]} numberOfLines={2}>{data.name}</Text>
          {data.tagline ? <Text style={[type.caption, { color: colors.muted }]} numberOfLines={2}>{data.tagline}</Text> : null}
        </View>
      </View>
      {data.about ? <Text style={[type.body, { color: colors.ink }]} numberOfLines={5}>{data.about}</Text> : null}
      <TouchableOpacity onPress={() => onTab('om-oss')} accessibilityRole="link" style={styles.more}>
        <Text style={[type.label, { color: colors.brandInk || colors.brand }]}>Les mer om oss</Text>
        <Ionicons name="arrow-forward" size={14} color={colors.brandInk || colors.brand} />
      </TouchableOpacity>
    </Card>
  );
}

function PeopleBlock({ people, colors, onTab }) {
  const shown = people.slice(0, PEOPLE_MAX);
  return (
    <Card colors={colors} nativeID="company-aside-people">
      <SectionHead
        colors={colors}
        title="Folkene"
        action={people.length > shown.length ? `Se alle ${people.length}` : 'Se alle'}
        onAction={() => onTab('ansatte')}
      />
      <View style={styles.people}>
        {shown.map((person) => (
          <TouchableOpacity
            key={person.id}
            onPress={() => onTab('ansatte')}
            accessibilityRole="button"
            accessibilityLabel={[person.name, person.title].filter(Boolean).join(', ')}
            style={styles.person}
          >
            {person.photoUrl ? (
              <Image source={{ uri: person.photoUrl }} style={[styles.avatar, { backgroundColor: colors.sunken }]} />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty, { backgroundColor: colors.brandSoft }]}>
                <Text style={[type.label, { color: colors.brandInk || colors.brand }]}>{companyInitials(person.name)}</Text>
              </View>
            )}
            <Text style={[type.caption, styles.personName, { color: colors.ink }]} numberOfLines={1}>
              {String(person.name || '').split(' ')[0]}
            </Text>
            {person.title ? (
              <Text style={[type.caption, styles.personName, { color: colors.muted }]} numberOfLines={1}>{person.title}</Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );
}

function ContactBlock({ data, colors }) {
  const { contact, hours, hoursNow } = data;
  return (
    <Card colors={colors} nativeID="company-aside-contact">
      <SectionHead colors={colors} title="Besøk og kontakt" />
      <View style={styles.lines}>
        {contact.address ? <Line icon="location-outline" colors={colors}>{contact.address}</Line> : null}
        {contact.phone ? (
          <Line icon="call-outline" colors={colors} onPress={() => Linking.openURL(`tel:${contact.phone}`).catch(() => {})}>
            {formatPhone(contact.phone)}
          </Line>
        ) : null}
        {contact.email ? (
          <Line icon="mail-outline" colors={colors} onPress={() => Linking.openURL(`mailto:${contact.email}`).catch(() => {})}>
            {contact.email}
          </Line>
        ) : null}
        {contact.website ? (
          <Line icon="globe-outline" colors={colors} onPress={() => openUrl(contact.website)}>{websiteLabel(contact.website)}</Line>
        ) : null}
        {!contact.address && !contact.phone && !contact.email && !contact.website ? (
          <Text style={[type.body, { color: colors.muted }]}>Kontaktinformasjon er ikke lagt inn.</Text>
        ) : null}
      </View>
      {hours?.length ? (
        <View style={[styles.hours, { borderTopColor: colors.line }]}>
          <View style={styles.hoursHead}>
            <Text style={[type.bodyStrong, { color: colors.ink }]}>Åpningstider</Text>
            {hoursNow?.label ? (
              <View style={styles.openPill}>
                <View style={[styles.dot, { backgroundColor: hoursNow.open ? colors.success : colors.muted }]} />
                <Text style={[type.caption, { color: hoursNow.open ? colors.success : colors.muted }]}>{hoursNow.label}</Text>
              </View>
            ) : null}
          </View>
          {hours.map((row) => (
            <View key={row.id} style={styles.hourRow}>
              <Text style={[type.body, styles.flex, { color: colors.ink }]}>{row.label}</Text>
              <Text style={[type.body, { color: colors.ink }]}>{row.closed || !row.open ? 'Stengt' : `${row.open} – ${row.close}`}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function NewsBlock({ colors, onTab }) {
  return (
    <Card colors={colors} nativeID="company-aside-news">
      <CompanyNewsWall
        variant="list"
        hideWhenEmpty
        onOpenPost={() => onTab('nyheter')}
        header={<SectionHead colors={colors} title="Siste nyheter" action="Se alle" onAction={() => onTab('nyheter')} />}
      />
    </Card>
  );
}

function JobsBlock({ jobs, colors, onTab }) {
  return (
    <View nativeID="company-aside-jobs" style={[styles.jobs, { backgroundColor: colors.brandSoft, borderColor: colors.line }]}>
      <Text style={[type.title, { color: colors.ink }]}>Vil du jobbe hos oss?</Text>
      <Text style={[type.body, { color: colors.ink }]}>{jobs?.text || 'Ta kontakt om du vil bli en del av laget.'}</Text>
      <TouchableOpacity
        onPress={() => (jobs?.url ? openUrl(jobs.url) : onTab('ansatte'))}
        accessibilityRole="button"
        style={[styles.jobsBtn, { backgroundColor: colors.brand }]}
      >
        <Text style={[type.label, styles.jobsBtnText]}>{jobs?.url ? 'Ledige stillinger →' : 'Ta kontakt →'}</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * blocks: rekkefølgen av 'company', 'people', 'contact', 'news' og 'jobs'.
 * data: { name, logo, tagline, about, contact, hours, hoursNow, people, jobs }.
 */
export default function CompanyProfileAside({
  blocks, data, colors, onTab, nativeID = 'company-profile-aside',
}) {
  const [width, setWidth] = useState(0);
  const items = blocks.map((id) => {
    if (id === 'company') return [id, <CompanyBlock data={data} colors={colors} onTab={onTab} />];
    if (id === 'people' && data.people?.length) return [id, <PeopleBlock people={data.people} colors={colors} onTab={onTab} />];
    if (id === 'contact') return [id, <ContactBlock data={data} colors={colors} />];
    if (id === 'news') return [id, <NewsBlock colors={colors} onTab={onTab} />];
    if (id === 'jobs') return [id, <JobsBlock jobs={data.jobs} colors={colors} onTab={onTab} />];
    return null;
  }).filter(Boolean);
  const count = Math.min(items.length || 1, width >= THREE_COLS ? 3 : width >= TWO_COLS ? 2 : 1);
  const columns = Array.from({ length: count }, (_, col) => items.filter((_, index) => index % count === col));
  return (
    <View
      nativeID={nativeID}
      style={styles.aside}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
    >
      {columns.map((column) => (
        <View key={column.map(([id]) => id).join('-')} style={styles.column}>
          {column.map(([id, node]) => <React.Fragment key={id}>{node}</React.Fragment>)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  aside: { flexDirection: 'row', alignItems: 'flex-start', gap: GAP, width: '100%' },
  column: { flex: 1, minWidth: 0, gap: GAP },
  flex: { flex: 1, minWidth: 0 },
  companyTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  logo: {
    width: 52, height: 52, borderWidth: 1, borderRadius: radius.control,
    alignItems: 'center', justifyContent: 'center',
  },
  logoImage: { width: 42, height: 30 },
  more: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, alignSelf: 'flex-start' },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  person: { width: 72, alignItems: 'center', gap: 2 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  personName: { textAlign: 'center', width: '100%' },
  lines: { gap: space.xs },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  lineIcon: { marginTop: 2 },
  hours: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm, gap: space.xxs + 2 },
  hoursHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  openPill: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  hourRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  jobs: { borderWidth: 1, borderRadius: radius.card, padding: space.md, gap: space.xs },
  jobsBtn: { alignSelf: 'flex-start', borderRadius: radius.control, paddingHorizontal: space.sm, paddingVertical: space.xs },
  jobsBtnText: { color: '#fff' },
});
