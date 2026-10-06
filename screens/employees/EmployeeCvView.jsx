import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

function Block({ title, colors, children }) {
  return (
    <View style={styles.block}>
      <Text style={[styles.blockTitle, { color: colors.brand }]}>{title}</Text>
      {children}
    </View>
  );
}

export default function EmployeeCvView({ cv, colors }) {
  if (!cv) return null;
  return (
    <View nativeID="employee-cv" id="employee-cv" style={[styles.page, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Text style={[styles.kicker, { color: colors.muted }]}>CURRICULUM VITAE</Text>
      <View style={styles.head}>
        <View style={styles.grow}>
          <Text accessibilityRole="header" style={[styles.name, { color: colors.ink }]}>{cv.name}</Text>
          {!!cv.title && <Text style={[styles.title, { color: colors.ink }]}>{cv.title}</Text>}
        </View>
        {cv.photoUrl ? <Image source={{ uri: cv.photoUrl }} style={styles.photo} /> : null}
      </View>
      <Block title="Profil" colors={colors}>
        {cv.facts.map(([label, value]) => (
          <View key={label} style={styles.fact}>
            <Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text>
            <Text style={[styles.factValue, { color: colors.ink }]}>{value}</Text>
          </View>
        ))}
      </Block>
      <Block title="Oppsummering og nøkkelkvalifikasjoner" colors={colors}>
        <Text style={[styles.body, { color: colors.ink }]}>{cv.summary || 'Oppsummering er ikke fylt ut.'}</Text>
      </Block>
      <Block title="Utdanning" colors={colors}>
        {cv.education.length ? cv.education.map((row) => (
          <Text key={row.id} style={[styles.body, { color: colors.ink }]}>
            {[row.when, [row.school, row.program].filter(Boolean).join(' – ')].filter(Boolean).join('  ')}
          </Text>
        )) : <Text style={{ color: colors.muted }}>Ingen utdanning er lagt inn.</Text>}
      </Block>
      <Block title="Sertifiseringer" colors={colors}>
        {cv.certifications.length ? cv.certifications.map((title) => (
          <Text key={title} style={[styles.body, { color: colors.ink }]}>{`• ${title}`}</Text>
        )) : <Text style={{ color: colors.muted }}>Ingen sertifiseringer er lagt inn.</Text>}
      </Block>
      <Block title="Kurs" colors={colors}>
        {cv.courses.length ? cv.courses.map((row) => (
          <Text key={row.id} style={[styles.body, { color: colors.ink }]}>
            {[row.when, row.title].filter(Boolean).join('  ')}
          </Text>
        )) : <Text style={{ color: colors.muted }}>Ingen kurs er lagt inn.</Text>}
      </Block>
      <Block title="Erfaringer" colors={colors}>
        {cv.experience.length ? cv.experience.map((row) => (
          <View key={row.id} style={styles.job}>
            <Text style={[styles.jobTitle, { color: colors.ink }]}>{row.employer || 'Arbeidsgiver'}</Text>
            <Text style={{ color: colors.muted }}>{[row.place, row.when, row.title].filter(Boolean).join(' · ')}</Text>
            {row.tasks.map((task) => (
              <Text key={task} style={[styles.body, { color: colors.ink }]}>{`• ${task}`}</Text>
            ))}
          </View>
        )) : <Text style={{ color: colors.muted }}>Ingen erfaring er lagt inn.</Text>}
      </Block>
      <Block title="Referanseprosjekter" colors={colors}>
        {cv.projects.length ? cv.projects.map((row) => (
          <View key={row.id} style={[styles.project, { borderColor: colors.line }]}>
            <Text style={[styles.jobTitle, { color: colors.ink }]}>{row.title || 'Prosjekt'}</Text>
            {[
              ['Kategori', row.category],
              ['Kunde', row.client],
              ['Objekt', row.object],
              ['Periode', row.period],
              ['Kostnad', row.cost],
              ['Kontakt', row.contact],
              ['Telefon', row.phone],
              ['E-post', row.email],
              ['Arbeidsgiver', row.employer],
            ].filter(([, value]) => String(value || '').trim()).map(([label, value]) => (
              <Text key={label} style={[styles.body, { color: colors.ink }]}>{`${label}: ${value}`}</Text>
            ))}
            {!!row.roles && <Text style={[styles.body, { color: colors.ink }]}>{`Roller: ${row.roles}`}</Text>}
            {!!row.responsibility && <Text style={[styles.body, { color: colors.ink }]}>{row.responsibility}</Text>}
          </View>
        )) : <Text style={{ color: colors.muted }}>Ingen referanseprosjekter er lagt inn.</Text>}
      </Block>
      {cv.custom?.length ? (
        <Block title="Andre opplysninger" colors={colors}>
          {cv.custom.map((field) => (
            <Text key={field.id} style={[styles.body, { color: colors.ink }]}>{`${field.label}: ${field.value}`}</Text>
          ))}
        </Block>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { borderWidth: 1, borderRadius: 16, padding: 18, gap: 16 },
  kicker: { letterSpacing: 1.2, fontSize: 12 },
  head: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  grow: { flex: 1, gap: 4 },
  name: { fontSize: 28, fontWeight: '700' },
  title: { fontSize: 16 },
  photo: { width: 96, height: 112, borderRadius: 8 },
  block: { gap: 6 },
  blockTitle: { fontSize: 16, fontWeight: '700' },
  fact: { flexDirection: 'row', gap: 12 },
  factLabel: { width: 110, fontSize: 14 },
  factValue: { flex: 1, fontSize: 14 },
  body: { fontSize: 15, lineHeight: 22 },
  job: { gap: 2, marginBottom: 8 },
  jobTitle: { fontSize: 16, fontWeight: '600' },
  project: { borderTopWidth: 1, paddingTop: 8, gap: 2 },
});
