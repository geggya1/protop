import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Image, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { companyLogoOf } from '../../src/project/companyLogo';
import { departmentsOf, groupOverview } from '../../src/project/companyUnits';
import { nbDate, nok, registerRows } from '../../src/project/companyPublic';
import { mergeAccountYears } from '../../src/project/accountSeries';
import {
  companyFactGroups, factColumns, roleRows, roleSummary, signatureRows,
} from '../../src/project/companyFacts';
import {
  EDIT_TABS,
  PAGE_TABS,
  articleHasContent,
  companyInitials,
  formatOrgNumber,
  formatPhone,
  normalizeCompanyPage,
  openingStatus,
  serviceSectionsOf,
  shortCompanyName,
  shownAbout,
  shownContact,
  shownTagline,
  videoPreview,
  visibleModules,
  websiteLabel,
} from '../../src/project/companyPage';
import {
  moveStaffOrder, orderStaff, shiftStaffOrder, staffCandidates,
} from '../../src/project/companyStaff';
import AccountHistoryCard from './AccountHistoryCard';
import CompanyArticle from './CompanyArticle';
import CompanyNewsWall from './CompanyNewsWall';
import CompanyPageEditor from './CompanyPageEditor';
import CompanyServices from './CompanyServices';
import CompanyStaff from './CompanyStaff';
import CompanyProfileAside from './CompanyProfileAside';
import CompanySustainability from './CompanySustainability';
import {
  Card, EditBar, EmptyNote, SectionHead,
} from './ProfileParts';
import { useAccountHistory } from './useAccountHistory';
import { useIsoProfile } from './useIsoProfile';
import { useApp } from '../../src/context/AppContext';
import { parentCompanyDisplayName } from '../../src/utils/companyName';
import { BREAKPOINTS } from '../../src/ui/layout.js';
import { useLayout } from '../../src/theme';
import { touchHit } from '../../src/ui/touchTarget';

const TONES = {
  blue: { bg: '#e8f1ff', fg: '#2563eb' },
  violet: { bg: '#f3e8ff', fg: '#7c3aed' },
  green: { bg: '#e7f8ee', fg: '#15915a' },
};

const EXPLORE = [
  { id: 'om-oss', icon: 'book-outline', tint: '#f3e8ff', color: '#7c3aed', title: 'Om oss', text: 'Hvem vi er' },
  { id: 'tjenester', icon: 'briefcase-outline', tint: '#e8f1ff', color: '#2563eb', title: 'Tjenester', text: 'Hva vi tilbyr' },
  { id: 'ansatte', icon: 'people-outline', tint: '#e7f8ee', color: '#15915a', title: 'Ansatte og kontakt', text: 'Folkene og hvor du finner oss' },
  { id: 'baerekraft', icon: 'leaf-outline', tint: '#e5f6ef', color: '#15915a', title: 'Bærekraft', text: 'Vårt samfunnsansvar' },
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
  onOpenIso,
  onSavePage,
  initialTab = '',
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const { isTouch } = useLayout();
  // Blyanten er en sirkel på 22 px; trykkflaten rundt er 44 px på berøringsskjerm (UX-26).
  const pencilHit = touchHit(22, 22, { touch: isTouch, os: Platform.OS });
  const access = useCompanyAccess();
  const { family, families, uid } = useApp();
  // Morselskapet slås opp via parentCompanyId, så et nytt navn der vises her (DS-17).
  const parentName = parentCompanyDisplayName(family, families) || stored?.parentCompanyName;
  const wide = width >= BREAKPOINTS.desktop;
  const stacked = width < BREAKPOINTS.tablet;
  const page = useMemo(() => normalizeCompanyPage(stored?.publicPage), [stored?.publicPage]);
  const [tab, setTab] = useState(initialTab || 'oversikt');
  // Lenker fra andre moduler (f.eks. ISO → «Skriv nyhet») åpner nyhetene direkte.
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(page);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
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
  const departments = useMemo(() => departmentsOf(stored?.subUnits || []), [stored?.subUnits]);
  // Ny rekkefølge vises med en gang, før lagringen er tilbake (flere raske flytt etter hverandre).
  const [pendingOrder, setPendingOrder] = useState(null);
  useEffect(() => { setPendingOrder(null); }, [page]);
  const staffOrder = pendingOrder || view.staff?.order;
  // Alle aktive i registeret i lagret rekkefølge; eksterne filtreres bort når de ikke skal vises.
  const staffAll = useMemo(
    () => orderStaff(staffCandidates(access.employees, departments), staffOrder),
    [access.employees, departments, staffOrder],
  );
  const staff = view.staff?.includeExternal ? staffAll : staffAll.filter((row) => !row.external);
  const iso = useIsoProfile({
    companyId: familyId,
    uid,
    enabled: tab === 'baerekraft',
    family,
    employees: access.employees,
  });
  const accountHistory = useAccountHistory(profile?.organisasjonsnummer || stored?.organisasjonsnummer, { enabled: tab === 'selskapsdata' });
  const accountView = useMemo(
    () => (tab === 'selskapsdata' ? mergeAccountYears(live?.accounts, accountHistory.years || []) : null),
    [tab, live?.accounts, accountHistory.years],
  );
  const hoursNow = openingStatus(view.hours);
  const film = videoPreview(view.videoUrl);
  const registers = registerRows(profile);
  const roles = live?.roles || [];
  const signature = live?.signature || null;
  const parentLabel = [live?.parent?.navn, live?.parent?.organisasjonsnummer].filter(Boolean).join(' · ');
  const overview = useMemo(() => groupOverview({
    konsern: profile?.konsern === true,
    morselskap: live?.accounts?.morselskap === true,
    parentCompanyName: parentLabel || parentName,
    publicUnits: live?.units || [],
    registered: stored?.subUnits,
  }), [profile?.konsern, live?.accounts?.morselskap, parentLabel, parentName, stored?.subUnits, live?.units]);

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

  function openEdit() {
    setDraft(page);
    setSaveError('');
    setEditing(true);
    // Om oss, Tjenester og Bærekraft redigeres der de står; resten fra Oversikt.
    if (!EDIT_TABS.includes(tab)) setTab('oversikt');
  }

  /** Endringer gjort på fanen (rekkefølge, visning): i utkastet under redigering, ellers lagres de med en gang. */
  async function applyPage(fn) {
    if (editing) {
      setDraft((prev) => fn(prev));
      return true;
    }
    setSaveError('');
    try {
      await onSavePage(fn(page));
      return true;
    } catch (err) {
      setSaveError(err?.message || 'Kunne ikke lagre siden.');
      return false;
    }
  }

  function patchStaff(partial) {
    return applyPage((prev) => ({ ...prev, staff: { ...(prev.staff || {}), ...partial } }));
  }

  async function saveStaffOrder(order) {
    setPendingOrder(order);
    if (!(await patchStaff({ order }))) setPendingOrder(null);
  }

  function moveStaff(fromId, toId) {
    saveStaffOrder(moveStaffOrder(staffAll.map((row) => row.id), fromId, toId));
  }

  function shiftStaff(id, direction) {
    saveStaffOrder(shiftStaffOrder(staffAll.map((row) => row.id), staff.map((row) => row.id), id, direction));
  }

  const editProps = {
    editing,
    canEdit,
    colors,
    saving,
    error: saveError,
    onEdit: openEdit,
    onSave: saveEdit,
    onCancel: cancelEdit,
  };

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
              <SectionHead
                colors={colors}
                title={`Om ${shortName}`}
                action={articleHasContent(view) ? 'Les mer' : null}
                onAction={() => setTab('om-oss')}
              />
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
                    <TouchableOpacity
                      onPress={openEdit}
                      style={[styles.pencilHit, pencilHit.style]}
                      hitSlop={pencilHit.hitSlop}
                      accessibilityRole="button"
                      accessibilityLabel="Rediger profiltekst"
                    >
                      <View style={[styles.pencil, { backgroundColor: colors.sunken }]}>
                        <Ionicons name="pencil" size={12} color={colors.ink} />
                      </View>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  {profile?.organisasjonsform ? (
                    <View style={styles.badge}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.brand} />
                      <Text style={[styles.badgeText, { color: colors.muted }]}>{profile.organisasjonsform}</Text>
                    </View>
                  ) : null}
                  {tagline ? <Text style={[styles.tagline, { color: colors.ink }]}>{tagline}</Text> : null}
                </View>
              </View>
              {contactBits().length ? (
                <View style={styles.metaRow}>
                  {contactBits().map((bit) => (
                    <TouchableOpacity key={bit.icon} onPress={bit.onPress || undefined} disabled={!bit.onPress} style={styles.metaBit}>
                      <Ionicons name={bit.icon} size={14} color={colors.muted} />
                      <Text style={[styles.metaText, { color: colors.ink }]} numberOfLines={1}>{bit.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
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
          <SectionHead colors={colors} title="Nøkkelinformasjon" action="Se mer" onAction={() => setTab('selskapsdata')} />
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
            onAction={() => setTab('ansatte')}
          />
          <TouchableOpacity onPress={() => setTab('ansatte')} style={styles.contactLine} accessibilityRole="button">
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
            onPress={() => (view.jobs.url ? openUrl(view.jobs.url) : setTab('ansatte'))}
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
          <SectionHead colors={colors} title="Register og status" action="Se mer" onAction={() => setTab('selskapsdata')} />
          {registers.slice(0, 4).map((row) => (
            <Text key={row.label} style={{ color: colors.ink }}>{row.label}: {row.value}</Text>
          ))}
        </Card>
      );
    }
    if (id === 'roles' && roles.length) {
      return (
        <Card colors={colors}>
          <SectionHead colors={colors} title="Roller" action="Se mer" onAction={() => setTab('selskapsdata')} />
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

  const keyedModules = (column) => visibleModules(view, column)
    .map((row) => {
      const body = moduleBody(row.id);
      return body ? <React.Fragment key={row.id}>{body}</React.Fragment> : null;
    })
    .filter(Boolean);
  const mainModules = keyedModules('main');
  const sideModules = keyedModules('side');

  const asideData = {
    name,
    logo,
    tagline,
    about,
    contact,
    hours: view.hours,
    hoursNow,
    people: view.showEmployees ? staff : [],
    jobs: view.jobs,
  };
  // Fanene får en sidespalte på PC: innholdet til venstre, bedriften, folkene og kontakt til høyre.
  // Ansatte-fanen har kortene i full bredde og en smalere spalte.
  function withAside(main, blocks, { staff: staffTab = false } = {}) {
    if (!blocks.length) return main;
    const aside = <CompanyProfileAside blocks={blocks} data={asideData} colors={colors} onTab={setTab} />;
    if (!wide) {
      return <View style={styles.tabStack}>{main}{aside}</View>;
    }
    return (
      <View style={styles.tabSplit}>
        <View style={[styles.tabMain, staffTab && styles.tabMainWide]}>{main}</View>
        <View style={[styles.tabAside, staffTab && styles.tabAsideNarrow]}>{aside}</View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      {(saveError || error) ? (
        <Text style={{ color: colors.danger }}>{saveError || error}</Text>
      ) : null}

      {/* Sidetittelen («Bedriften – navn») står i modulbåndet; siden har ikke eget banner. */}
      <View style={[styles.tabBar, { borderBottomColor: colors.line }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          nativeID="company-profile-tabs"
          id="company-profile-tabs"
          contentContainerStyle={styles.tabs}
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
        {canEdit ? (
          <TouchableOpacity
            onPress={editing ? cancelEdit : openEdit}
            nativeID="company-profile-edit"
            accessibilityRole="button"
            accessibilityLabel="Rediger side"
            style={[styles.editBtn, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <Ionicons name="pencil-outline" size={15} color={colors.ink} />
            {stacked ? null : <Text style={[styles.editBtnText, { color: colors.ink }]}>{editing ? 'Avbryt' : 'Rediger side'}</Text>}
          </TouchableOpacity>
        ) : null}
      </View>

      {editing && tab === 'oversikt' ? (
        <CompanyPageEditor
          draft={draft}
          colors={colors}
          saving={saving}
          error={saveError}
          onChange={setDraft}
          onSave={saveEdit}
          onCancel={cancelEdit}
          onOpenSettings={onSettings}
        />
      ) : null}

      {editing && !EDIT_TABS.includes(tab) ? (
        <Card colors={colors}>
          <EditBar
            colors={colors}
            saving={saving}
            error={saveError}
            onSave={saveEdit}
            onCancel={cancelEdit}
            note="Du redigerer siden. Oversikt, Om oss, Tjenester og Bærekraft redigeres på fanene sine."
          />
        </Card>
      ) : null}

      {tab === 'oversikt' ? (
        <View style={[styles.columns, wide && styles.columnsWide]}>
          {/* Én sidekolonne med fast bredde. Hovedkolonnen (om oss, nyheter) tar resten av bredden. */}
          <View style={styles.mainCol}>{mainModules}</View>
          <View style={[styles.sideCol, wide && styles.sideColWide]}>{sideModules}</View>
        </View>
      ) : null}

      {tab === 'nyheter' ? withAside(<CompanyNewsWall />, ['company', 'people', 'contact', 'jobs']) : null}

      {tab === 'om-oss' ? withAside(
        <CompanyArticle
          {...editProps}
          article={view.article}
          fallback={about}
          familyId={familyId}
          onUpdate={(fn) => setDraft((prev) => ({ ...prev, article: fn(prev.article) }))}
        />,
        editing ? [] : ['news', 'people', 'contact'],
      ) : null}

      {tab === 'tjenester' ? (
        <CompanyServices
          {...editProps}
          sections={editing ? draft.servicePage?.sections : serviceSectionsOf(page)}
          familyId={familyId}
          onUpdate={(fn) => setDraft((prev) => ({ ...prev, servicePage: { sections: fn(prev.servicePage?.sections) } }))}
        />
      ) : null}

      {tab === 'ansatte' ? withAside(
        <CompanyStaff
          people={staff}
          visible={view.showEmployees}
          includeExternal={view.staff?.includeExternal === true}
          canEdit={canEdit}
          colors={colors}
          onToggleVisible={() => applyPage((prev) => ({ ...prev, showEmployees: !prev.showEmployees }))}
          onToggleExternal={() => patchStaff({ includeExternal: !(view.staff?.includeExternal === true) })}
          onMove={moveStaff}
          onShift={shiftStaff}
          onOpenRegister={onEmployees}
        />,
        // Ansatte og kontakt: besøk, kontakt og åpningstider står ved siden av folkene.
        ['contact', 'company', 'jobs'],
        { staff: true },
      ) : null}

      {tab === 'baerekraft' ? (
        <CompanySustainability
          {...editProps}
          name={shortName}
          page={view}
          iso={iso}
          wide={wide}
          fallback={view.highlights.find((row) => row.id === 'baerekraft')?.text || ''}
          onUpdate={(fn) => setDraft((prev) => fn(prev))}
          onOpenNews={() => setTab('nyheter')}
          onOpenIso={onOpenIso}
        />
      ) : null}

      {tab === 'selskapsdata' ? (
        <RegistryDetails
          colors={colors}
          profile={profile}
          stored={stored}
          name={name}
          contact={contact}
          registers={registers}
          roles={roles}
          signature={signature}
          overview={overview}
          onUnits={onUnits}
          brregUrl={live?.brregUrl}
          accounts={accountView}
          accountsLoading={accountHistory.loading}
          loading={loading}
          stacked={stacked}
          split={wide}
          factCols={width >= SELSKAPSDATA_TWO_FACT_COLS ? 2 : 1}
        />
      ) : null}
    </View>
  );
}

/**
 * Offentlig selskapsdata: Enhetsregisteret, signaturrett, roller, konsern og regnskap.
 * Det samme som Økonomi → Oversikt viser om bedriften, pluss registerdetaljene.
 */
function FactLines({ rows, colors, stacked }) {
  return rows.map((row, index) => (
    <View
      key={`${row.label}-${index}`}
      style={[styles.factLine, index ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line } : null]}
    >
      <Text style={[styles.factLineLabel, stacked && styles.factLineLabelStacked, { color: colors.muted }]}>{row.label}</Text>
      <Text
        style={[
          styles.factLineValue,
          { color: row.link ? colors.brandInk || colors.brand : (row.tone === 'warn' ? colors.dangerInk || colors.danger : colors.ink) },
        ]}
        onPress={row.link === 'mailto'
          ? () => Linking.openURL(`mailto:${row.value}`).catch(() => {})
          : (row.link === 'web' ? () => openUrl(row.value) : undefined)}
        accessibilityRole={row.link ? 'link' : undefined}
      >
        {row.value}
      </Text>
    </View>
  ));
}

/** Skuff: lukket viser den tittel, en kort linje og antallet; åpnet viser radene. */
function FactDrawer({
  title, hint, count, rows, colors, stacked, nativeID,
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card colors={colors} nativeID={nativeID} style={styles.drawer}>
      <TouchableOpacity
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? `Lukk ${title}` : `Åpne ${title}`}
        style={styles.drawerHead}
      >
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.muted} />
        <View style={styles.drawerText}>
          <Text accessibilityRole="header" style={[styles.drawerTitle, { color: colors.ink }]}>{title}</Text>
          {hint ? <Text style={[styles.muted, { color: colors.muted }]} numberOfLines={open ? undefined : 1}>{hint}</Text> : null}
        </View>
        {count ? (
          <View style={[styles.drawerCount, { backgroundColor: colors.sunken, borderColor: colors.line }]}>
            <Text style={[styles.muted, { color: colors.ink }]}>{count}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
      {open ? (
        <View style={styles.drawerBody}>
          <FactLines rows={rows} colors={colors} stacked={stacked} />
        </View>
      ) : null}
    </Card>
  );
}

/**
 * Offentlig selskapsdata: ett kort med Enhetsregisteret (registrering, register og status,
 * nøkkeltall, kontakt, konsern og underenheter, bransje), regnskapet, og signaturrett og
 * roller i skuffer som åpnes ved behov.
 */
function RegistryDetails({
  colors, profile, stored, name, contact, registers, roles, signature, overview, onUnits, brregUrl,
  accounts, accountsLoading, loading, stacked, split = false, factCols = 2,
}) {
  const groups = companyFactGroups(profile, {
    stored, contact, registers, overview,
  });
  const purpose = (profile?.formaal?.length ? profile.formaal : profile?.aktivitet || []).join(' ');
  const signatures = signatureRows(signature);
  const roleList = roleRows(roles);
  const facts = (
      <Card colors={colors} nativeID="company-public-data">
        <SectionHead colors={colors} title="Om bedriften" />
        {purpose ? <Text style={[styles.lead, { color: colors.ink }]}>{purpose}</Text> : null}
        {groups.length ? (
          <View style={[styles.factColumns, stacked && styles.factColumnsStacked]}>
            {factColumns(groups, stacked ? 1 : (split ? factCols : 2)).map((column) => (
              <View key={column.map((group) => group.id).join('-')} style={styles.factColumn}>
                {column.map((group) => (
                  <View
                    key={group.id}
                    nativeID={group.id === 'group' ? 'company-landing-konsern' : undefined}
                    style={styles.factGroup}
                  >
                    <View style={styles.factGroupHead}>
                      <Text accessibilityRole="header" style={[styles.factGroupTitle, { color: colors.muted }]}>{group.title}</Text>
                      {group.action === 'units' && onUnits ? (
                        <Text
                          onPress={onUnits}
                          accessibilityRole="link"
                          style={[styles.muted, { color: colors.brandInk || colors.brand }]}
                        >
                          Se alle
                        </Text>
                      ) : null}
                    </View>
                    <FactLines rows={group.rows} colors={colors} stacked={stacked} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : (
          <EmptyNote colors={colors}>{loading ? 'Henter offentlige opplysninger …' : name}</EmptyNote>
        )}
      </Card>
  );
  const rest = (
    <>
      {accounts ? (
        <Card colors={colors} nativeID="company-public-accounts">
          <AccountHistoryCard
            accounts={accounts}
            founded={profile?.stiftelsesdato}
            loading={accountsLoading}
            colors={colors}
          />
        </Card>
      ) : null}

      {signature && (signature.fritekst || signatures.length) ? (
        <FactDrawer
          title="Signaturrett"
          hint={signature.fritekst || `${signatures.length} måter å signere på`}
          rows={signatures}
          colors={colors}
          stacked={stacked}
          nativeID="company-public-signature"
        />
      ) : null}

      {roleList.length ? (
        <FactDrawer
          title="Roller"
          hint={roleSummary(roles)}
          count={roleList.length}
          rows={roleList}
          colors={colors}
          stacked={stacked}
          nativeID="company-public-roles"
        />
      ) : null}

      {brregUrl ? (
        <Text style={[styles.muted, { color: colors.muted }]} onPress={() => openUrl(brregUrl)}>
          Kilde: Enhetsregisteret, signaturrett og Regnskapsregisteret.
        </Text>
      ) : null}
    </>
  );
  // PC: registeropplysningene til venstre, regnskap, signaturrett og roller til høyre.
  if (split) {
    return (
      <View nativeID="company-public-split" style={styles.registrySplit}>
        <View style={styles.registryCol}>{facts}</View>
        <View style={styles.registryCol}>{rest}</View>
      </View>
    );
  }
  return (
    <View style={styles.stack}>
      {facts}
      {rest}
    </View>
  );
}

/** Vindusbredde der registeropplysningene (venstre halvdel) får to kolonner. */
const SELSKAPSDATA_TWO_FACT_COLS = 1900;

const styles = StyleSheet.create({
  page: { gap: 14, paddingBottom: 28 },
  identityTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  logoPlate: {
    width: 64, height: 64, borderWidth: 1, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  logo: { width: 52, height: 38 },
  initials: { fontSize: 18, fontWeight: '600' },
  pencilHit: { position: 'absolute', top: -6, right: -6, borderRadius: 11 },
  pencil: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeText: { fontSize: 12 },
  tagline: { fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  metaBit: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%' },
  metaText: { fontSize: 13 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7, marginBottom: 6, marginLeft: 'auto',
  },
  editBtnText: { fontSize: 14 },
  tabBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, borderBottomWidth: 1 },
  tabs: { gap: 16, paddingHorizontal: 4 },
  tabScroll: { flexGrow: 0, flexShrink: 1 },
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
  sideColWide: { flex: 0.8, maxWidth: 420 },
  tabStack: { gap: 12 },
  registrySplit: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  registryCol: { flex: 1, minWidth: 0, gap: 12 },
  tabSplit: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  tabMain: { flex: 1.4, minWidth: 0, maxWidth: 960, gap: 12 },
  tabMainWide: { maxWidth: '100%', flex: 1 },
  tabAside: { flex: 1, minWidth: 320 },
  tabAsideNarrow: {
    flexGrow: 0, flexShrink: 0, flexBasis: 380, width: 380, minWidth: 0,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: '600' },
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
  lead: { fontSize: 15, lineHeight: 22 },
  factColumns: { flexDirection: 'row', gap: 32, alignItems: 'flex-start' },
  factColumnsStacked: { flexDirection: 'column', gap: 16 },
  factColumn: { flex: 1, minWidth: 0, gap: 16, alignSelf: 'stretch' },
  factGroup: { gap: 0 },
  factGroupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  factGroupTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  drawer: { paddingVertical: 12, gap: 0 },
  drawerHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  drawerText: { flex: 1, minWidth: 0, gap: 2 },
  drawerTitle: { fontSize: 16, fontWeight: '600' },
  drawerCount: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  drawerBody: { marginTop: 8, paddingLeft: 28, gap: 6 },
  factLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  factLineLabel: { width: '42%', maxWidth: 190, fontSize: 13, lineHeight: 19 },
  // På telefon er 42 % for smalt for «Organisasjonsnummer».
  factLineLabelStacked: { width: 150, maxWidth: '50%' },
  factLineValue: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 19 },
});
