import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

function filled(value) {
  return String(value ?? '').trim();
}

function Pencil({ label, onPress, colors }) {
  if (!onPress) return null;
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.iconButton, { borderColor: colors.line }]}
    >
      <Text style={{ color: colors.ink }}>✎</Text>
    </TouchableOpacity>
  );
}

function Block({ title, colors, onEdit, children }) {
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Text style={[styles.blockTitle, { color: colors.brand }]}>{title}</Text>
        <Pencil label={`Rediger ${title}`} onPress={onEdit} colors={colors} />
      </View>
      {children}
    </View>
  );
}

function projectFacts(row) {
  return [
    ['Oppdragsgiver', row.client],
    ['Periode', row.period],
    ['Areal', row.area],
    ['Prosjektsum', row.cost],
    ['Tiltaksklasse', row.buildingClass],
    ['Kategori', row.category],
    ['Objekt', row.object],
    ['Arbeidsgiver i perioden', row.employer],
  ].filter(([, value]) => filled(value));
}

function projectRoles(row) {
  return filled(row.roles)
    .split(/\n/)
    .map((line) => line.trim().replace(/^[-•]\s*/, ''))
    .filter(Boolean);
}

function projectContacts(row) {
  return [
    ['Kontaktperson hos oppdragsgiver', row.contact],
    ['Firma', row.contactCompany],
    ['Telefon', row.phone],
    ['E-post', row.email],
  ].filter(([, value]) => filled(value));
}

function ProjectCard({ row, colors, onEditProject }) {
  const facts = projectFacts(row);
  const roles = projectRoles(row);
  const contacts = projectContacts(row);
  const images = row.images || [];
  const referenceName = filled(row.referenceName);
  const hasBody = images.length || facts.length || filled(row.address) || filled(row.description)
    || referenceName || filled(row.responsibility) || roles.length || contacts.length;

  return (
    <View style={[styles.project, { borderColor: colors.line }]}>
      <View style={styles.projectHead}>
        <Text style={[styles.jobTitle, { color: colors.ink, flex: 1 }]}>{row.title || 'Prosjekt'}</Text>
        <Pencil
          label={`Rediger ${row.title || 'prosjekt'}`}
          onPress={onEditProject ? () => onEditProject(row) : undefined}
          colors={colors}
        />
      </View>
      {hasBody ? (
        <View style={styles.projectBody}>
          {images.length ? (
            <View style={styles.projectImages}>
              {images.map((url, imageIndex) => (
                <Image
                  key={`${imageIndex}-${String(url).slice(0, 24)}`}
                  source={{ uri: url }}
                  style={styles.projectImage}
                  resizeMode="cover"
                  accessibilityLabel={`Bilde ${imageIndex + 1} for ${row.title || 'prosjektet'}`}
                />
              ))}
            </View>
          ) : null}
          <View style={styles.projectMeta}>
            {filled(row.address) ? (
              <Text style={[styles.projectText, { color: colors.ink }]}>{filled(row.address)}</Text>
            ) : null}
            {facts.length ? (
              <View style={styles.factGrid}>
                {facts.map(([label, value]) => (
                  <Text key={label} style={styles.factLine}>
                    <Text style={[styles.factInlineLabel, { color: colors.muted }]}>{`${label}: `}</Text>
                    <Text style={[styles.factInlineValue, { color: colors.ink }]}>{filled(value)}</Text>
                  </Text>
                ))}
              </View>
            ) : null}
            {filled(row.description) ? (
              <Text style={[styles.projectText, { color: colors.ink }]}>{filled(row.description)}</Text>
            ) : null}
            {referenceName ? (
              <Text style={[styles.projectTextStrong, { color: colors.ink }]}>{referenceName}</Text>
            ) : null}
            {filled(row.responsibility) ? (
              <Text style={[styles.projectText, { color: colors.ink }]}>{filled(row.responsibility)}</Text>
            ) : null}
            {roles.length ? (
              <View style={styles.stackTight}>
                <Text style={[styles.subhead, { color: colors.muted }]}>Roller i prosjektet</Text>
                {roles.map((role) => (
                  <Text key={role} style={[styles.projectText, { color: colors.ink }]}>{`• ${role}`}</Text>
                ))}
              </View>
            ) : null}
            {contacts.length ? (
              <View style={styles.factGrid}>
                {contacts.map(([label, value]) => (
                  <Text key={label} style={styles.factLine}>
                    <Text style={[styles.factInlineLabel, { color: colors.muted }]}>{`${label}: `}</Text>
                    <Text style={[styles.factInlineValue, { color: colors.ink }]}>{filled(value)}</Text>
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <Text style={{ color: colors.muted }}>Ingen flere opplysninger er fylt ut.</Text>
      )}
    </View>
  );
}

export default function EmployeeCvView({ cv, colors, onEdit, onEditProject }) {
  if (!cv) return null;
  return (
    <View nativeID="employee-cv" id="employee-cv" style={[styles.page, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Text style={[styles.kicker, { color: colors.muted }]}>CURRICULUM VITAE</Text>
      <View style={styles.head}>
        <View style={styles.grow}>
          <View style={styles.blockHead}>
            <Text accessibilityRole="header" style={[styles.name, { color: colors.ink, flex: 1 }]}>{cv.name}</Text>
            <Pencil label="Rediger CV-profil" onPress={onEdit ? () => onEdit('cvProfile') : undefined} colors={colors} />
          </View>
          {!!cv.title && <Text style={[styles.title, { color: colors.ink }]}>{cv.title}</Text>}
        </View>
        <View style={styles.photoWrap}>
          {cv.photoUrl ? <Image source={{ uri: cv.photoUrl }} style={styles.photo} accessibilityLabel="Profilbilde" /> : null}
          <Pencil label="Rediger profilbilde" onPress={onEdit ? () => onEdit('personal') : undefined} colors={colors} />
        </View>
      </View>
      <Block title="Profil" colors={colors} onEdit={onEdit ? () => onEdit('personal') : undefined}>
        {cv.facts.map(([label, value]) => (
          <View key={label} style={styles.fact}>
            <Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text>
            <Text style={[styles.factValue, { color: colors.ink }]}>{value}</Text>
          </View>
        ))}
      </Block>
      <Block title="Oppsummering og nøkkelkvalifikasjoner" colors={colors} onEdit={onEdit ? () => onEdit('cvProfile') : undefined}>
        <Text style={[styles.body, { color: colors.ink }]}>{cv.summary || 'Oppsummering er ikke fylt ut.'}</Text>
      </Block>
      <Block title="Utdanning" colors={colors} onEdit={onEdit ? () => onEdit('education') : undefined}>
        {cv.education.length ? cv.education.map((row) => (
          <Text key={row.id} style={[styles.body, { color: colors.ink }]}>
            {[row.when, [row.school, row.program].filter(Boolean).join(' – ')].filter(Boolean).join('  ')}
          </Text>
        )) : <Text style={{ color: colors.muted }}>Ingen utdanning er lagt inn.</Text>}
      </Block>
      <Block title="Sertifiseringer" colors={colors} onEdit={onEdit ? () => onEdit('certifications') : undefined}>
        {cv.certifications.length ? cv.certifications.map((title) => (
          <Text key={title} style={[styles.body, { color: colors.ink }]}>{`• ${title}`}</Text>
        )) : <Text style={{ color: colors.muted }}>Ingen sertifiseringer er lagt inn.</Text>}
      </Block>
      <Block title="Kurs" colors={colors} onEdit={onEdit ? () => onEdit('courses') : undefined}>
        {cv.courses.length ? cv.courses.map((row) => (
          <Text key={row.id} style={[styles.body, { color: colors.ink }]}>
            {[row.when, row.title].filter(Boolean).join('  ')}
          </Text>
        )) : <Text style={{ color: colors.muted }}>Ingen kurs er lagt inn.</Text>}
      </Block>
      <Block title="Erfaringer" colors={colors} onEdit={onEdit ? () => onEdit('experience') : undefined}>
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
      <Block title="Referanseprosjekter" colors={colors} onEdit={onEdit ? () => onEdit('projects') : undefined}>
        {cv.projects.length ? cv.projects.map((row) => (
          <ProjectCard key={row.id} row={row} colors={colors} onEditProject={onEditProject} />
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
  photoWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  photo: { width: 96, height: 112, borderRadius: 8 },
  block: { gap: 6 },
  blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  blockTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
  iconButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  fact: { flexDirection: 'row', gap: 12 },
  factLabel: { width: 110, fontSize: 14 },
  factValue: { flex: 1, fontSize: 14 },
  body: { fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  subhead: { fontSize: 13, fontWeight: '600' },
  stackTight: { gap: 2 },
  job: { gap: 2, marginBottom: 8 },
  jobTitle: { fontSize: 16, fontWeight: '600' },
  project: { borderTopWidth: 1, paddingTop: 12, gap: 8 },
  projectHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  projectBody: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' },
  projectImages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: 220 },
  projectImage: { width: 220, height: 146, borderRadius: 8 },
  projectMeta: { flexGrow: 1, flexShrink: 1, flexBasis: 280, gap: 5 },
  projectText: { fontSize: 13, lineHeight: 18 },
  projectTextStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 3 },
  factLine: { flexGrow: 1, flexBasis: 160, maxWidth: '100%' },
  factInlineLabel: { fontSize: 12, lineHeight: 17 },
  factInlineValue: { fontSize: 13, lineHeight: 17 },
});
