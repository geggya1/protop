import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Image, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { companyLogoOf } from '../../src/project/companyLogo';
import { groupOverview } from '../../src/project/companyUnits';
import { nbDate, nok, registerRows } from '../../src/project/companyPublic';
import {
  COVER_ASPECTS,
  PAGE_TABS,
  companyInitials,
  formatOrgNumber,
  formatPhone,
  normalizeCompanyPage,
  openingStatus,
  publicStaff,
  shortCompanyName,
  shownAbout,
  shownContact,
  shownTagline,
  videoPreview,
  visibleModules,
  websiteLabel,
} from '../../src/project/companyPage';
import CompanyNewsWall from './CompanyNewsWall';
import CompanyPageEditor from './CompanyPageEditor';
import { useCroppedUpload } from './useCroppedUpload';

const TONES = {
  blue: { bg: '#e8f1ff', fg: '#2563eb' },
  violet: { bg: '#f3e8ff', fg: '#7c3aed' },
  green: { bg: '#e7f8ee', fg: '#15915a' },
};

const EXPLORE = [
  { id: 'tjenester', icon: 'briefcase-outline', tint: '#e8f1ff', color: '#2563eb', title: 'Tjenester', text: 'Hva vi tilbyr' },
  { id: 'prosjekter', icon: 'folder-open-outline', tint: '#f3e8ff', color: '#7c3aed', title: 'Prosjekter', text: 'Utvalgte prosjekter' },
  { id: 'ansatte', icon: 'people-outline', tint: '#e7f8ee', color: '#15915a', title: 'Ansatte', text: 'Vårt team' },
  { id: 'baerekraft', icon: 'leaf-outline', tint: '#e5f6ef', color: '#15915a', title: 'Bærekraft', text: 'Vårt samfunnsansvar' },
  { id: 'kontakt', icon: 'mail-outline', tint: '#e8f1ff', color: '#2563eb', title: 'Kontakt', text: 'Ta kontakt' },
];

function openUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return;
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  Linking.openURL(href).catch(() => {});
}

function addressLines(value) {
  const parts = String(value || '').split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return String(value || '').trim();
  return `${parts[0]},\n${parts.slice(1).join(' ')}`;
}

function Card({ children, colors, style, nativeID }) {
  return (
    <View nativeID={nativeID} id={nativeID} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }, style]}>
      {children}
    </View>
  );
}

function SectionHead({ title, colors, action, onAction }) {
  return (
    <View style={styles.cardHead}>
      <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.ink }]}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button">
          <Text style={[styles.link, { color: colors.brand }]}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Highlight({ row }) {
  if (!row?.title) return null;
  const tone = TONES[row.tone] || TONES.blue;
  return (
    <View style={[styles.highlight, { backgroundColor: tone.bg }]}>
      <Ionicons name={row.icon || 'ellipse-outline'} size={18} color={tone.fg} />
      <Text style={[styles.highlightTitle, { color: '#1a2744' }]}>{row.title}</Text>
      {row.text ? <Text style={styles.highlightText}>{row.text}</Text> : null}
    </View>
  );
}

function EmptyNote({ colors, children }) {
  return <Text style={[styles.muted, { color: colors.muted }]}>{children}</Text>;
}

export default function CompanyPublicProfile({
  stored,
  profile,
  live,
  loading,
  error,
  address,
  canEdit,
  familyId,
  onSettings,
  onUnits,
  onEmployees,
  onProjects,
  onSavePage,
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const access = useCompanyAccess();
  const wide = width >= 980;
  const stacked = width < 760;
  const page = useMemo(() => normalizeCompanyPage(stored?.publicPage), [stored?.publicPage]);
  const [tab, setTab] = useState('oversikt');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(page);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const cover = useCroppedUpload({
    familyId,
    folder: 'companyPage',
    aspect: COVER_ASPECTS[0].value,
    aspectPair: [21, 8],
    aspects: COVER_ASPECTS,
    title: 'Beskjær banner',
    maxEdge: 2000,
  });

  useEffect(() => {
    if (!editing) setDraft(page);
  }, [page, editing]);

  const view = editing ? draft : page;
  const name = profile?.navn || stored?.navn || 'Bedrift';
  const shortName = shortCompanyName(name);
  const tagline = shownTagline(view, profile);
  const about = shownAbout(view, profile);
  const contact = shownContact(view, profile, stored, address);
  const logo = companyLogoOf(stored);
  const staff = publicStaff(access.employees);
  const hoursNow = openingStatus(view.hours);
  const film = videoPreview(view.videoUrl);
  const registers = registerRows(profile);
  const roles = live?.roles || [];
  const signature = live?.signature || null;
  const parentLabel = [live?.parent?.navn, live?.parent?.organisasjonsnummer].filter(Boolean).join(' · ');
  const overview = useMemo(() => groupOverview({
    konsern: profile?.konsern === true,
    morselskap: live?.accounts?.morselskap === true,
    parentCompanyName: parentLabel || stored?.parentCompanyName,
    publicUnits: live?.units || [],
    registered: stored?.subUnits,
  }), [profile?.konsern, live?.accounts?.morselskap, parentLabel, stored?.parentCompanyName, stored?.subUnits, live?.units]);

  const facts = [
    { icon: 'document-text-outline', label: 'Organisasjonsnummer', value: formatOrgNumber(profile?.organisasjonsnummer || stored?.organisasjonsnummer) },
    { icon: 'calendar-outline', label: 'Stiftet', value: nbDate(profile?.stiftelsesdato) || (profile?.stiftelsesdato ? '' : nbDate(profile?.oppstart)) },
    { icon: 'cash-outline', label: profile?.kapital?.type || 'Aksjekapital', value: profile?.kapital ? nok(profile.kapital.belop) : '' },
    {
      icon: 'briefcase-outline',
      label: 'Bransje',
      value: [profile?.naeringer?.[0]?.kode, profile?.naeringer?.[0]?.beskrivelse].filter(Boolean).join(' '),
    },
    {
      icon: 'people-outline',
      label: 'Antall ansatte',
      value: profile?.ansatte != null ? String(profile.ansatte) : (view.showEmployees && staff.length ? String(staff.length) : ''),
    },
    { icon: 'business-outline', label: 'Hovedkontor', value: addressLines(contact.address) },
  ].filter((row) => row.value);

  async function changeCover() {
    const url = await cover.choose();
    if (!url) return;
    if (editing) {
      setDraft((prev) => ({ ...prev, coverUrl: url }));
      return;
    }
    setSaveError('');
    try {
      await onSavePage({ ...page, coverUrl: url });
    } catch (err) {
      setSaveError(err?.message || 'Kunne ikke lagre banneret.');
    }
  }

  function openEdit() {
    setDraft(page);
    setSaveError('');
    setEditing(true);
    setTab('oversikt');
  }

  function cancelEdit() {
    const dirty = JSON.stringify(normalizeCompanyPage(draft)) !== JSON.stringify(page);
    const close = () => {
      setDraft(page);
      setSaveError('');
      setEditing(false);
    };
    if (!dirty) {
      close();
      return;
    }
    Alert.alert('Forkast endringer?', 'Ulagrede endringer på siden blir borte.', [
      { text: 'Fortsett', style: 'cancel' },
      { text: 'Forkast', style: 'destructive', onPress: close },
    ]);
  }

  async function saveEdit() {
    setSaving(true);
    setSaveError('');
    try {
      await onSavePage(draft);
      setEditing(false);
    } catch (err) {
      setSaveError(err?.message || 'Kunne ikke lagre siden.');
    } finally {
      setSaving(false);
    }
  }

  function contactBits() {
    const bits = [
      contact.address ? { icon: 'location-outline', label: contact.address, onPress: null } : null,
      contact.phone ? { icon: 'call-outline', label: formatPhone(contact.phone), onPress: () => Linking.openURL(`tel:${contact.phone}`).catch(() => {}) } : null,
      contact.email ? { icon: 'mail-outline', label: contact.email, onPress: () => Linking.openURL(`mailto:${contact.email}`).catch(() => {}) } : null,
      contact.website ? { icon: 'globe-outline', label: websiteLabel(contact.website), onPress: () => openUrl(contact.website) } : null,
    ].filter(Boolean);
    return bits;
  }

  function moduleBody(id) {
    if (id === 'about') {
      return (
        <Card colors={colors}>
          <View style={[styles.aboutGrid, wide && film && styles.aboutGridWide]}>
            <View style={styles.aboutCopy}>
              <SectionHead colors={colors} title={`Om ${shortName}`} />
              {about ? <Text style={[styles.body, { color: colors.ink }]}>{about}</Text> : (
                <EmptyNote colors={colors}>
                  {canEdit ? 'Skriv en kort presentasjon under Rediger side.' : 'Bedriften har ikke lagt ut en presentasjon ennå.'}
                </EmptyNote>
              )}
              {view.highlights.some((row) => row.title) ? (
                <View style={styles.highlightRow}>
                  {view.highlights.map((row) => <Highlight key={row.id} row={row} />)}
                </View>
              ) : null}
            </View>
            {film ? (
              <TouchableOpacity onPress={() => openUrl(film.href)} style={[styles.video, wide && styles.videoWide, { backgroundColor: '#0f2744' }]} accessibilityRole="button">
                {film.thumb ? <Image source={{ uri: film.thumb }} style={styles.videoImage} /> : null}
                <View style={styles.videoPlay}>
                  <Ionicons name="play" size={18} color="#fff" />
                </View>
                <Text style={styles.videoLabel}>{view.videoTitle || 'Se vår presentasjon'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Card>
      );
    }
    if (id === 'news') {
      return (
        <View style={styles.newsBlock}>
          <SectionHead colors={colors} title="Siste nyheter" action="Se alle nyheter" onAction={() => setTab('nyheter')} />
          <CompanyNewsWall variant="cards" onOpenPost={() => setTab('nyheter')} />
        </View>
      );
    }
    if (id === 'explore') {
      return (
        <Card colors={colors}>
          <SectionHead colors={colors} title="Utforsk mer av oss" />
          <View style={styles.exploreRow}>
            {EXPLORE.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => setTab(item.id)}
                accessibilityRole="button"
                style={[styles.exploreCard, { borderColor: colors.line, backgroundColor: colors.card }]}
              >
                <View style={[styles.exploreIcon, { backgroundColor: item.tint }]}>
                  <Ionicons name={item.icon} size={18} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.exploreTitle, { color: colors.ink }]}>{item.title}</Text>
                  <Text style={[styles.exploreText, { color: colors.muted }]}>{item.text}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </View>
        </Card>
      );
    }
    if (id === 'facts') {
      return (
        <Card colors={colors}>
          <SectionHead colors={colors} title="Nøkkelinformasjon" action="Se mer" onAction={() => setTab('om-oss')} />
          {facts.map((row) => (
            <View key={row.label} style={styles.factRow}>
              <Ionicons name={row.icon} size={16} color={colors.muted} />
              <Text style={[styles.factLabel, { color: colors.muted }]} numberOfLines={1}>{row.label}</Text>
              <Text style={[styles.factValue, { color: colors.ink }]}>{row.value}</Text>
            </View>
          ))}
          {!facts.length ? (
            <EmptyNote colors={colors}>{loading ? 'Henter offentlige opplysninger…' : 'Ingen nøkkeltall er registrert ennå.'}</EmptyNote>
          ) : null}
        </Card>
      );
    }
    if (id === 'hours') {
      return (
        <Card colors={colors}>
          <View style={styles.cardHead}>
            <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.ink }]}>Åpningstider</Text>
            <View style={styles.openPill}>
              <View style={[styles.dot, { backgroundColor: hoursNow.open ? colors.success : colors.muted }]} />
              <Text style={{ color: hoursNow.open ? colors.success : colors.muted, fontSize: 13 }}>{hoursNow.label}</Text>
            </View>
          </View>
          {view.hours.map((row) => (
            <View key={row.id} style={styles.hourRow}>
              <Text style={{ color: colors.ink, flex: 1 }}>{row.label}</Text>
              <Text style={{ color: colors.ink }}>{row.closed || !row.open ? 'Stengt' : `${row.open} – ${row.close}`}</Text>
            </View>
          ))}
        </Card>
      );
    }
    if (id === 'contact') {
      return (
        <Card colors={colors}>
          <SectionHead
            colors={colors}
            title="Kontakt oss"
            action={view.showEmployees ? 'Se alle kontaktpersoner' : 'Kontakt'}
            onAction={() => setTab(view.showEmployees ? 'ansatte' : 'kontakt')}
          />
          <TouchableOpacity onPress={() => setTab('kontakt')} style={styles.contactLine} accessibilityRole="button">
            <View style={[styles.roundIcon, { backgroundColor: colors.sunken }]}>
              <Ionicons name="person-outline" size={16} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink }}>Generell henvendelse</Text>
              {contact.email ? <Text style={[styles.muted, { color: colors.muted }]}>{contact.email}</Text> : null}
              {contact.phone ? <Text style={[styles.muted, { color: colors.muted }]}>{formatPhone(contact.phone)}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </TouchableOpacity>
        </Card>
      );
    }
    if (id === 'jobs') {
      const label = view.jobs.url ? 'Ledige stillinger' : 'Ta kontakt';
      return (
        <View style={[styles.jobs, { backgroundColor: colors.brandSoft || '#e5f6fe', borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Vil du jobbe hos oss?</Text>
          <Text style={[styles.body, { color: colors.ink }]}>
            {view.jobs.text || 'Ta kontakt om du vil bli en del av laget.'}
          </Text>
          <TouchableOpacity
            onPress={() => (view.jobs.url ? openUrl(view.jobs.url) : setTab('kontakt'))}
            style={[styles.jobsBtn, { backgroundColor: colors.brand }]}
            accessibilityRole="button"
          >
            <Text style={styles.jobsBtnText}>{label} →</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (id === 'registers' && registers.length) {
      return (
        <Card colors={colors}>
          <SectionHead colors={colors} title="Register og status" action="Se mer" onAction={() => setTab('om-oss')} />
          {registers.slice(0, 4).map((row) => (
            <Text key={row.label} style={{ color: colors.ink }}>{row.label}: {row.value}</Text>
          ))}
        </Card>
      );
    }
    if (id === 'roles' && roles.length) {
      return (
        <Card colors={colors}>
          <SectionHead colors={colors} title="Roller" action="Se mer" onAction={() => setTab('om-oss')} />
          {roles.slice(0, 4).map((row) => (
            <Text key={`${row.rolle}-${row.navn}`} style={{ color: colors.ink }}>{row.navn} · {row.rolle}</Text>
          ))}
        </Card>
      );
    }
    if (id === 'units') {
      return (
        <Card colors={colors}>
          <SectionHead colors={colors} title="Underenheter" action={onUnits ? 'Se alle' : null} onAction={onUnits} />
          {overview.summary.map((line) => <Text key={line} style={[styles.muted, { color: colors.muted }]}>{line}</Text>)}
          {overview.preview.map((row) => (
            <Text key={row.organisasjonsnummer || row.name} style={{ color: colors.ink }}>{row.name}</Text>
          ))}
        </Card>
      );
    }
    return null;
  }

  const mainModules = visibleModules(view, 'main').map((row) => moduleBody(row.id)).filter(Boolean);
  const sideModules = visibleModules(view, 'side').map((row) => moduleBody(row.id)).filter(Boolean);

  return (
    <View style={styles.page}>
      <View nativeID="company-profile-hero" id="company-profile-hero" style={styles.heroWrap}>
        <View style={styles.hero}>
          {view.coverUrl ? (
            <Image source={{ uri: view.coverUrl }} style={styles.heroImage} resizeMode="cover" accessibilityLabel="Bannerbilde" />
          ) : (
            <View style={styles.heroFallback}>
              <Text style={styles.heroKicker}>{profile?.organisasjonsform || 'Bedrift'}</Text>
            </View>
          )}
          {canEdit ? (
            <TouchableOpacity
              onPress={changeCover}
              disabled={cover.busy}
              nativeID="company-cover-edit"
              accessibilityRole="button"
              accessibilityLabel="Endre bilde"
              style={styles.coverBtn}
            >
              <Ionicons name="camera-outline" size={15} color="#fff" />
              <Text style={styles.coverBtnText}>{cover.busy ? 'Laster…' : 'Endre bilde'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={[styles.identityRow, stacked && styles.identityStacked]}>
          <View style={[styles.identity, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={styles.identityTop}>
              <View
                nativeID="company-landing-logo"
                id="company-landing-logo"
                style={[styles.logoPlate, { borderColor: colors.line, backgroundColor: colors.card }]}
              >
                {logo?.dataUrl ? (
                  <Image source={{ uri: logo.dataUrl }} style={styles.logo} resizeMode="contain" accessibilityLabel={`Logo for ${name}`} />
                ) : (
                  <Text style={[styles.initials, { color: colors.brand }]}>{companyInitials(name)}</Text>
                )}
                {canEdit ? (
                  <TouchableOpacity onPress={openEdit} style={[styles.pencil, { backgroundColor: colors.sunken }]} accessibilityLabel="Rediger profiltekst">
                    <Ionicons name="pencil" size={12} color={colors.ink} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {profile?.organisasjonsform ? (
                  <View style={styles.badge}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.brand} />
                    <Text style={[styles.badgeText, { color: colors.muted }]}>{profile.organisasjonsform}</Text>
                  </View>
                ) : null}
                <Text accessibilityRole="header" style={[styles.companyName, { color: colors.ink }]}>{name}</Text>
                {tagline ? <Text style={[styles.tagline, { color: colors.muted }]}>{tagline}</Text> : null}
              </View>
            </View>
            <View style={styles.metaRow}>
              {contactBits().map((bit) => (
                <TouchableOpacity key={bit.icon} onPress={bit.onPress || undefined} disabled={!bit.onPress} style={styles.metaBit}>
                  <Ionicons name={bit.icon} size={14} color={colors.muted} />
                  <Text style={[styles.metaText, { color: colors.ink }]} numberOfLines={1}>{bit.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {canEdit ? (
            <TouchableOpacity
              onPress={editing ? cancelEdit : openEdit}
              nativeID="company-profile-edit"
              accessibilityRole="button"
              accessibilityLabel="Rediger side"
              style={[styles.editBtn, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              <Ionicons name="pencil-outline" size={15} color={colors.ink} />
              <Text style={[styles.editBtnText, { color: colors.ink }]}>{editing ? 'Avbryt' : 'Rediger side'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {(cover.error || saveError || error) ? (
        <Text style={{ color: colors.danger }}>{cover.error || saveError || error}</Text>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        nativeID="company-profile-tabs"
        id="company-profile-tabs"
        contentContainerStyle={[styles.tabs, { borderBottomColor: colors.line }]}
      >
        {PAGE_TABS.map((item) => {
          const on = tab === item.id;
          return (
            <TouchableOpacity key={item.id} onPress={() => setTab(item.id)} accessibilityRole="tab" style={styles.tab}>
              <Text style={{ color: on ? colors.brand : colors.muted, fontWeight: on ? '600' : '400', fontSize: 14 }}>{item.label}</Text>
              <View style={[styles.tabLine, { backgroundColor: on ? colors.brand : 'transparent' }]} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {editing && tab === 'oversikt' ? (
        <CompanyPageEditor
          draft={draft}
          colors={colors}
          saving={saving}
          error={saveError}
          coverBusy={cover.busy}
          onChange={setDraft}
          onSave={saveEdit}
          onCancel={cancelEdit}
          onPickCover={changeCover}
          onClearCover={() => setDraft((prev) => ({ ...prev, coverUrl: '' }))}
          onOpenSettings={onSettings}
        />
      ) : null}

      {tab === 'oversikt' ? (
        <View style={[styles.columns, wide && styles.columnsWide]}>
          <View style={styles.mainCol}>{mainModules}</View>
          <View style={[styles.sideCol, wide && styles.sideColWide]}>{sideModules}</View>
        </View>
      ) : null}

      {tab === 'nyheter' ? <CompanyNewsWall /> : null}

      {tab === 'om-oss' ? (
        <RegistryDetails
          colors={colors}
          profile={profile}
          name={name}
          about={about}
          contact={contact}
          registers={registers}
          roles={roles}
          signature={signature}
          overview={overview}
          parentLabel={parentLabel}
          onUnits={onUnits}
          brregUrl={live?.brregUrl}
        />
      ) : null}

      {tab === 'tjenester' ? (
        <Card colors={colors}>
          <SectionHead colors={colors} title="Tjenester" />
          {view.services.length ? view.services.map((row) => (
            <View key={row.id} style={styles.story}>
              {row.imageUrl ? <Image source={{ uri: row.imageUrl }} style={styles.storyImage} /> : null}
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.exploreTitle, { color: colors.ink }]}>{row.title}</Text>
                {row.text ? <Text style={[styles.body, { color: colors.ink }]}>{row.text}</Text> : null}
              </View>
            </View>
          )) : (
            <EmptyNote colors={colors}>
              {canEdit ? 'Legg til tjenestene bedriften vil vise, under Rediger side.' : 'Ingen tjenester er publisert.'}
            </EmptyNote>
          )}
        </Card>
      ) : null}

      {tab === 'prosjekter' ? (
        <Card colors={colors}>
          <SectionHead colors={colors} title="Prosjekter" action={onProjects && canEdit ? 'Åpne prosjektmodulen' : null} onAction={onProjects} />
          {view.projects.length ? view.projects.map((row) => (
            <View key={row.id} style={styles.story}>
              {row.imageUrl ? <Image source={{ uri: row.imageUrl }} style={styles.storyImage} /> : null}
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.exploreTitle, { color: colors.ink }]}>{row.title}</Text>
                {row.text ? <Text style={[styles.body, { color: colors.ink }]}>{row.text}</Text> : null}
              </View>
            </View>
          )) : (
            <EmptyNote colors={colors}>
              {canEdit ? 'Legg utvalgte prosjekter på profilen under Rediger side.' : 'Ingen prosjekter er publisert på profilen.'}
            </EmptyNote>
          )}
        </Card>
      ) : null}

      {tab === 'ansatte' ? (
        <Card colors={colors}>
          <SectionHead colors={colors} title="Ansatte" action={canEdit && onEmployees ? 'Åpne ansattregisteret' : null} onAction={onEmployees} />
          {view.showEmployees && staff.length ? (
            <View style={styles.staffGrid}>
              {staff.map((person) => (
                <View key={person.id} style={[styles.staffCard, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
                  <View style={[styles.roundIcon, { backgroundColor: colors.card }]}>
                    <Text style={{ color: colors.brand, fontWeight: '600' }}>{companyInitials(person.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink }}>{person.name}</Text>
                    {person.title ? <Text style={[styles.muted, { color: colors.muted }]}>{person.title}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyNote colors={colors}>
              {view.showEmployees
                ? 'Ingen aktive ansatte er registrert.'
                : 'Ansatte vises ikke på den offentlige profilen.'}
              {canEdit ? ' Du kan skru visningen på under Rediger side.' : ''}
            </EmptyNote>
          )}
        </Card>
      ) : null}

      {tab === 'baerekraft' ? (
        <Card colors={colors}>
          <SectionHead colors={colors} title="Bærekraft" />
          <Text style={[styles.body, { color: colors.ink }]}>
            {view.sustainability || view.highlights.find((row) => row.id === 'baerekraft')?.text || 'Bedriften har ikke publisert en bærekraftstekst.'}
          </Text>
        </Card>
      ) : null}

      {tab === 'kontakt' ? (
        <Card colors={colors}>
          <SectionHead colors={colors} title="Kontakt" />
          <Text style={{ color: colors.ink }}>{addressLines(contact.address) || 'Adresse er ikke lagt inn.'}</Text>
          {contact.phone ? <Text style={{ color: colors.ink }}>{formatPhone(contact.phone)}</Text> : null}
          {contact.email ? (
            <Text style={{ color: colors.brand }} onPress={() => Linking.openURL(`mailto:${contact.email}`).catch(() => {})}>{contact.email}</Text>
          ) : null}
          {contact.website ? (
            <Text style={{ color: colors.brand }} onPress={() => openUrl(contact.website)}>{websiteLabel(contact.website)}</Text>
          ) : null}
          {view.hours.map((row) => (
            <Text key={row.id} style={[styles.muted, { color: colors.muted }]}>
              {row.label}: {row.closed || !row.open ? 'Stengt' : `${row.open} – ${row.close}`}
            </Text>
          ))}
        </Card>
      ) : null}
      {cover.modal}
    </View>
  );
}

function RegistryDetails({
  colors, profile, name, about, contact, registers, roles, signature, overview, parentLabel, onUnits, brregUrl,
}) {
  return (
    <View style={styles.stack}>
      <Card colors={colors}>
        <SectionHead colors={colors} title="Om bedriften" />
        <Text style={[styles.body, { color: colors.ink }]}>
          {[profile?.organisasjonsnummer, profile?.organisasjonsform].filter(Boolean).join(' · ') || name}
        </Text>
        {parentLabel ? <Text style={[styles.muted, { color: colors.muted }]}>Overordnet enhet: {parentLabel}</Text> : null}
        {about ? <Text style={[styles.body, { color: colors.ink }]}>{about}</Text> : null}
        {profile?.formaal?.length && about !== profile.formaal.join(' ') ? (
          <Text style={[styles.body, { color: colors.ink }]}>{profile.formaal.join(' ')}</Text>
        ) : null}
        <View style={styles.factGrid}>
          <Mini label="Stiftet" value={nbDate(profile?.stiftelsesdato)} colors={colors} />
          <Mini label="Oppstart" value={profile?.stiftelsesdato ? '' : nbDate(profile?.oppstart)} colors={colors} />
          <Mini label="I Enhetsregisteret" value={nbDate(profile?.registrert)} colors={colors} />
          <Mini label="Målform" value={profile?.maalform} colors={colors} />
          <Mini label="Sektor" value={[profile?.sektorKode, profile?.sektor].filter(Boolean).join(' · ')} colors={colors} />
          <Mini label="Ansatte" value={profile?.ansatte != null ? String(profile.ansatte) : ''} colors={colors} />
          <Mini label={profile?.kapital?.type || 'Kapital'} value={profile?.kapital ? nok(profile.kapital.belop) : ''} colors={colors} />
          <Mini label="Siste årsregnskap" value={profile?.sisteRegnskap} colors={colors} />
          <Mini label="Forretningsadresse" value={contact.address} colors={colors} />
          <Mini label="Postadresse" value={profile?.post?.label} colors={colors} />
        </View>
        {(profile?.naeringer || []).map((row) => (
          <Text key={`${row.kode}-${row.beskrivelse}`} style={{ color: colors.ink }}>
            {[row.kode, row.beskrivelse].filter(Boolean).join(' · ')}
          </Text>
        ))}
        {profile?.historiskeNavn?.length ? (
          <Mini label="Tidligere navn" value={profile.historiskeNavn.join(', ')} colors={colors} />
        ) : null}
      </Card>

      {registers.length ? (
        <Card colors={colors}>
          <SectionHead colors={colors} title="Register og status" />
          {registers.map((row) => (
            <View key={row.label} style={styles.factRow}>
              <Ionicons
                name={row.label === 'Konkurs' || row.label === 'Avvikling' || row.label === 'Tvangsavvikling' ? 'warning-outline' : 'checkmark-circle-outline'}
                size={16}
                color={colors.brand}
              />
              <Text style={{ color: colors.ink, flex: 1 }}>{row.label}</Text>
              <Text style={{ color: colors.muted }}>{row.value}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {signature ? (
        <Card colors={colors}>
          <SectionHead colors={colors} title="Signaturrett" />
          {signature.fritekst ? <Text style={[styles.body, { color: colors.ink }]}>{signature.fritekst}</Text> : null}
          {signature.kombinasjoner.map((row) => (
            <Text key={`${row.tekst}-${row.personer.map((person) => person.navn).join('-')}`} style={{ color: colors.ink }}>
              {row.tekst || 'Kan signere'} · {row.personer.map((person) => person.navn).join(', ')}
            </Text>
          ))}
        </Card>
      ) : null}

      {roles.length ? (
        <Card colors={colors}>
          <SectionHead colors={colors} title="Roller" />
          {roles.map((row) => (
            <View key={`${row.rolle}-${row.navn}`}>
              <Text style={{ color: colors.ink }}>{row.navn}</Text>
              <Text style={[styles.muted, { color: colors.muted }]}>{row.rolle}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Card colors={colors} nativeID="company-landing-konsern">
        <SectionHead colors={colors} title="Konsern" />
        {overview.summary.map((line) => (
          <Text key={line} style={[styles.body, { color: colors.ink }]}>{line}</Text>
        ))}
      </Card>

      <Card colors={colors} nativeID="company-landing-units">
        <SectionHead colors={colors} title="Underenheter" action={onUnits ? 'Se alle' : null} onAction={onUnits} />
        <Text style={[styles.muted, { color: colors.muted }]}>
          {overview.publicCount} i Enhetsregisteret · {overview.registeredCount} registrert her
        </Text>
        {overview.preview.length ? overview.preview.map((row) => (
          <Text key={row.organisasjonsnummer || row.name} style={{ color: colors.ink }}>
            {row.name}{row.organisasjonsnummer ? ` · ${row.organisasjonsnummer}` : ''}
          </Text>
        )) : <EmptyNote colors={colors}>Ingen underenheter i Enhetsregisteret.</EmptyNote>}
        {overview.remaining ? (
          <Text style={[styles.muted, { color: colors.muted }]}>
            {overview.remaining === 1 ? 'Og 1 til.' : `Og ${overview.remaining} til.`}
          </Text>
        ) : null}
      </Card>

      {brregUrl ? (
        <Text style={[styles.muted, { color: colors.muted }]} onPress={() => openUrl(brregUrl)}>
          Kilde: Enhetsregisteret, signaturrett og Regnskapsregisteret.
        </Text>
      ) : null}
    </View>
  );
}

function Mini({ label, value, colors }) {
  if (!value) return null;
  return (
    <View style={styles.mini}>
      <Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={{ color: colors.ink }}>{value}</Text>
    </View>
  );
}

const shadow = Platform.OS === 'web' ? { boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)' } : {};

const styles = StyleSheet.create({
  page: { gap: 14, paddingBottom: 28 },
  heroWrap: { gap: 0 },
  hero: {
    height: 228, borderRadius: 18, overflow: 'hidden', backgroundColor: '#0b3a5b',
  },
  heroImage: { width: '100%', height: '100%' },
  heroFallback: { flex: 1, justifyContent: 'flex-start', padding: 22, gap: 4 },
  heroKicker: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  coverBtn: {
    position: 'absolute', top: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(15,23,42,0.72)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  coverBtnText: { color: '#fff', fontSize: 13 },
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: -78, paddingHorizontal: 16 },
  identityStacked: { flexDirection: 'column', alignItems: 'stretch', marginTop: -36, paddingHorizontal: 0 },
  identity: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12, ...shadow },
  identityTop: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  logoPlate: {
    width: 84, height: 84, borderWidth: 1, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  logo: { width: 68, height: 48 },
  initials: { fontSize: 22, fontWeight: '600' },
  pencil: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeText: { fontSize: 12 },
  companyName: { fontSize: 26, fontWeight: '600', letterSpacing: -0.3 },
  tagline: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metaBit: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%' },
  metaText: { fontSize: 13 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 18, ...shadow,
  },
  editBtnText: { fontSize: 14 },
  tabs: { gap: 16, paddingHorizontal: 4, borderBottomWidth: 1 },
  tabScroll: { flexGrow: 0 },
  tab: { paddingTop: 6, gap: 8 },
  aboutGrid: { gap: 12 },
  aboutGridWide: { flexDirection: 'row', alignItems: 'flex-start' },
  aboutCopy: { flex: 1, gap: 10, minWidth: 0 },
  newsBlock: { gap: 10 },
  tabLine: { height: 2, borderRadius: 2 },
  columns: { gap: 12 },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  mainCol: { flex: 1.45, gap: 12, minWidth: 0 },
  sideCol: { gap: 12, minWidth: 0 },
  sideColWide: { flex: 0.8, maxWidth: 380 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10, ...shadow },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: '600' },
  link: { fontSize: 13 },
  body: { fontSize: 14, lineHeight: 21 },
  muted: { fontSize: 13, lineHeight: 18 },
  highlightRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  highlight: { flexGrow: 1, flexBasis: 140, borderRadius: 12, padding: 10, gap: 4 },
  highlightTitle: { fontSize: 14, fontWeight: '600' },
  highlightText: { fontSize: 12, lineHeight: 16, color: '#3d4d63' },
  video: { borderRadius: 14, overflow: 'hidden', minHeight: 150, justifyContent: 'flex-end' },
  videoWide: { width: 280, minHeight: 180 },
  videoImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  videoPlay: {
    position: 'absolute', top: '40%', left: '44%', width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  videoLabel: { color: '#fff', fontWeight: '600', padding: 12 },
  exploreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exploreCard: {
    flexGrow: 1, flexBasis: 160, minWidth: 150, borderWidth: 1, borderRadius: 14,
    padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  exploreIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  exploreTitle: { fontSize: 14, fontWeight: '600' },
  exploreText: { fontSize: 12 },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  factLabel: {
    flexGrow: 1, flexShrink: 1, fontSize: 13,
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' } : {}),
  },
  factValue: { flex: 1, fontSize: 13, textAlign: 'right' },
  hourRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  openPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  contactLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roundIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  jobs: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
  jobsBtn: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  jobsBtnText: { color: '#fff', fontSize: 13 },
  stack: { gap: 12 },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mini: { minWidth: 140, flexGrow: 1, gap: 2 },
  story: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  storyImage: { width: 120, height: 80, borderRadius: 10 },
  staffGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  staffCard: { flexGrow: 1, flexBasis: 220, borderWidth: 1, borderRadius: 12, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center' },
});
