import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, Platform, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors, deskType, radius, useLayout } from '../../src/theme';
import { Screen, Title, Mute, ScrollBody } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import BrandToggle from '../../components/BrandToggle';
import CheckBox from '../../components/CheckBox';
import LegalDocumentModal from '../../components/LegalDocumentModal';
import { LEGAL_VERSION } from '../../src/i18n/langs';
import { getTerms, getPrivacy, APP_LICENSES } from '../../src/i18n/legal';
import {
  emptyConsents, loadLocalConsents, saveLocalConsents, persistUserConsents,
} from '../../src/utils/consents';

const PAGES = ['hub', 'marketing', 'terms', 'privacy', 'licenses', 'consent'];

function formatConsentDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('no-NO', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return null;
  }
}

function isLegalHeading(p, i) {
  return i < 2
    || /^\d+\./.test(p)
    || (p === p.toUpperCase() && p.length < 80 && /[A-ZÆØÅ]/.test(p));
}

function HubTile({ icon, title, sub, onPress, compact, status }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tile, compact && styles.tileDesk]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[styles.tileIcon, compact && styles.tileIconDesk]}>
        <Ionicons name={icon} size={compact ? 16 : 18} color={colors.brand} />
      </View>
      <View style={styles.tileBody}>
        <View style={styles.tileTitleRow}>
          <Text style={[styles.tileTitle, compact && styles.tileTitleDesk]} numberOfLines={1}>
            {title}
          </Text>
          {status ? (
            <View style={[styles.status, status.on && styles.statusOn]}>
              <Text style={[styles.statusTxt, status.on && styles.statusTxtOn]}>{status.label}</Text>
            </View>
          ) : null}
        </View>
        {sub ? (
          <Text style={[styles.tileSub, compact && styles.tileSubDesk]} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  );
}

function DocBody({ paragraphs, compact }) {
  return (
    <View style={styles.doc}>
      {paragraphs.map((p, i) => {
        const heading = isLegalHeading(p, i);
        return (
          <Text
            key={`${i}-${p.slice(0, 24)}`}
            style={
              heading
                ? [styles.docH, compact && styles.docHDesk]
                : [styles.docP, compact && styles.docPDesk]
            }
          >
            {p}
          </Text>
        );
      })}
    </View>
  );
}

export default function PrivacyTermsScreen({
  inShell = false,
  onBack,
  initialPage = 'hub',
}) {
  const nav = useNavigation();
  const { t, lang } = useI18n();
  const { isDesktop, hasRail, pad } = useLayout();
  const compact = isDesktop;
  const { uid, userProfile, requestShellTab, shellIntent, clearShellIntent } = useApp();
  const startPage = PAGES.includes(initialPage) ? initialPage : 'hub';
  const [page, setPage] = useState(startPage);
  const [consents, setConsents] = useState(emptyConsents());
  const [docOpen, setDocOpen] = useState(false);
  const [openedDoc, setOpenedDoc] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const local = await loadLocalConsents();
    const remote = userProfile?.consents || {};
    setConsents({ ...emptyConsents(), ...local, ...remote });
  }, [userProfile?.consents]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (inShell || !hasRail) return undefined;
    const intent = startPage !== 'hub' ? `legal-${startPage}` : null;
    requestShellTab('more', 'legal', intent);
    if (nav.canGoBack?.()) nav.goBack();
    return undefined;
  }, [inShell, hasRail, requestShellTab, nav, startPage]);

  useEffect(() => {
    if (typeof shellIntent !== 'string' || !shellIntent.startsWith('legal-')) return;
    const next = shellIntent.slice('legal-'.length);
    if (PAGES.includes(next)) setPage(next);
    clearShellIntent?.();
  }, [shellIntent, clearShellIntent]);

  const termsStamp = formatConsentDate(consents.termsAt || consents.privacyAt);
  const marketingStamp = formatConsentDate(consents.marketingAt);
  const termsParas = useMemo(() => getTerms(lang), [lang]);
  const privacyParas = useMemo(() => getPrivacy(lang), [lang]);

  const goHub = () => {
    setPage('hub');
    setNotice('');
    setOpenedDoc(false);
    setAgreed(false);
  };

  const leave = () => {
    if (page !== 'hub') {
      goHub();
      return;
    }
    if (onBack) onBack();
    else if (nav.canGoBack?.()) nav.goBack();
  };

  const saveMarketing = async (optIn) => {
    const now = new Date().toISOString();
    const next = {
      ...consents,
      marketingOptIn: optIn,
      marketingAt: now,
      version: consents.version || LEGAL_VERSION,
      language: lang,
    };
    setConsents(next);
    await saveLocalConsents(next);
    if (uid) await persistUserConsents(uid, next).catch(() => {});
  };

  const saveConsent = async () => {
    if (!agreed || !openedDoc) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const next = {
        ...consents,
        termsAt: now,
        privacyAt: now,
        gdprAt: now,
        dataAt: now,
        copyrightAt: now,
        language: lang,
        version: LEGAL_VERSION,
      };
      await saveLocalConsents(next);
      if (uid) await persistUserConsents(uid, next).catch(() => {});
      setConsents(next);
      setNotice('Samtykke er lagret.');
      setPage('hub');
    } finally {
      setSaving(false);
    }
  };

  if (!inShell && hasRail) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  const pageTitle = {
    hub: t('more.legal'),
    marketing: 'Markedsføring',
    terms: t('legal.terms'),
    privacy: t('legal.privacy'),
    licenses: 'Lisenser',
    consent: 'Bekreft samtykke',
  }[page];

  const showScreenTitle = !inShell || !compact || page !== 'hub';
  const backLabel = page === 'hub' ? (inShell ? 'Mer' : t('common.back')) : 'Personvern';

  return (
    <Screen>
      <ScrollBody pad={pad}>
        <View style={[styles.wrap, compact && styles.wrapDesk]}>
          {onBack || (!inShell && nav.canGoBack?.()) || page !== 'hub' ? (
            <CompactBackLink onPress={leave} label={backLabel} />
          ) : null}

          {showScreenTitle ? (
            <>
              <Title size={22}>{pageTitle}</Title>
              {page === 'hub' ? (
                <Mute>Vilkår, personvern, lisenser og samtykke — samlet for foresatte.</Mute>
              ) : null}
            </>
          ) : (
            <Mute>Vilkår, personvern, lisenser og samtykke — samlet for foresatte.</Mute>
          )}

          {page === 'hub' ? (
            <>
              <View style={[styles.grid, compact && styles.gridDesk]}>
                <View style={compact ? styles.cellDesk : styles.cell}>
                  <HubTile
                    compact={compact}
                    icon="megaphone-outline"
                    title="Markedsføring"
                    sub={
                      consents.marketingOptIn
                        ? `Produkttips på e-post er på${marketingStamp ? ` · ${marketingStamp}` : ''}`
                        : 'Produkttips på e-post er av'
                    }
                    status={{
                      on: !!consents.marketingOptIn,
                      label: consents.marketingOptIn ? 'På' : 'Av',
                    }}
                    onPress={() => setPage('marketing')}
                  />
                </View>
                <View style={compact ? styles.cellDesk : styles.cell}>
                  <HubTile
                    compact={compact}
                    icon="reader-outline"
                    title={t('legal.terms')}
                    sub={termsStamp ? `Godkjent ${termsStamp}` : `Versjon ${LEGAL_VERSION}`}
                    onPress={() => setPage('terms')}
                  />
                </View>
                <View style={compact ? styles.cellDesk : styles.cell}>
                  <HubTile
                    compact={compact}
                    icon="shield-checkmark-outline"
                    title={t('legal.privacy')}
                    sub="Hvordan ProTop behandler personopplysninger"
                    onPress={() => setPage('privacy')}
                  />
                </View>
                <View style={compact ? styles.cellDesk : styles.cell}>
                  <HubTile
                    compact={compact}
                    icon="code-slash-outline"
                    title="Lisenser"
                    sub="Tredjepartsbiblioteker i appen"
                    onPress={() => setPage('licenses')}
                  />
                </View>
                <View style={compact ? styles.cellDesk : styles.cell}>
                  <HubTile
                    compact={compact}
                    icon="checkmark-circle-outline"
                    title="Bekreft samtykke"
                    sub="For foresatte — ved oppdaterte vilkår"
                    onPress={() => setPage('consent')}
                  />
                </View>
              </View>

              {notice ? <Text style={styles.notice}>{notice}</Text> : null}

              <TouchableOpacity
                style={styles.mailRow}
                onPress={() => Linking.openURL('https://protop.no')}
                accessibilityRole="link"
              >
                <Ionicons name="mail-outline" size={16} color={colors.brand} />
                <Text style={styles.mailTxt}>protop.no</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {page === 'marketing' ? (
            <View style={[styles.panel, compact && styles.panelDesk]}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.panelTitle, compact && styles.panelTitleDesk]}>
                    {consents.marketingOptIn
                      ? 'Samtykke til produkttips er aktivt'
                      : 'Samtykke til produkttips er ikke aktivt'}
                  </Text>
                  {marketingStamp ? (
                    <Text style={[styles.meta, compact && styles.metaDesk]}>
                      Sist oppdatert: {marketingStamp}
                    </Text>
                  ) : null}
                  <Text style={[styles.panelBody, compact && styles.panelBodyDesk]}>
                    Motta tips og produktnyheter på e-post
                  </Text>
                </View>
                <BrandToggle
                  value={!!consents.marketingOptIn}
                  onValueChange={saveMarketing}
                />
              </View>
              <Text style={[styles.fine, compact && styles.fineDesk]}>
                Tips gjelder tjenesten (nye funksjoner). Du kan når som helst slå dette av.{' '}
                <Text style={styles.link} onPress={() => setPage('privacy')}>
                  Les personvernerklæringen
                </Text>
                .
              </Text>
            </View>
          ) : null}

          {page === 'terms' ? <DocBody paragraphs={termsParas} compact={compact} /> : null}
          {page === 'privacy' ? <DocBody paragraphs={privacyParas} compact={compact} /> : null}

          {page === 'licenses' ? (
            <>
              <Text style={[styles.fine, compact && styles.fineDesk, { marginTop: 10 }]}>
                ProTop bruker blant annet følgende tredjepartsbiblioteker og tjenester:
              </Text>
              <View style={[styles.panel, compact && styles.panelDesk, { paddingVertical: 4 }]}>
                {APP_LICENSES.map((lib, idx) => (
                  <View key={lib.name}>
                    {idx > 0 ? <View style={styles.divider} /> : null}
                    <View style={styles.licenseRow}>
                      <Text style={[styles.licenseName, compact && styles.licenseNameDesk]}>{lib.name}</Text>
                      <Text style={[styles.licenseCopy, compact && styles.metaDesk]}>{lib.copyright}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {page === 'consent' ? (
            <View style={[styles.panel, compact && styles.panelDesk]}>
              <Text style={[styles.panelBody, compact && styles.panelBodyDesk]}>
                {t('legal.introShort')}
              </Text>
              <TouchableOpacity
                style={[styles.docBtn, compact && styles.docBtnDesk]}
                onPress={() => {
                  setDocOpen(true);
                  setOpenedDoc(true);
                }}
                accessibilityRole="button"
              >
                <Ionicons name="document-text-outline" size={18} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.docBtnTitle, compact && styles.tileTitleDesk]}>
                    {t('legal.openDoc')}
                  </Text>
                  <Text style={[styles.tileSub, compact && styles.tileSubDesk]}>
                    {t('legal.openDocHint')}
                  </Text>
                </View>
              </TouchableOpacity>
              {openedDoc ? (
                <Text style={styles.openedOk}>{t('legal.docOpened')}</Text>
              ) : (
                <Text style={styles.hint}>{t('legal.openFirst')}</Text>
              )}
              <CheckBox
                checked={agreed}
                onPress={() => setAgreed(!agreed)}
                label={t('legal.agreeRead')}
              />
              <TouchableOpacity
                onPress={saveConsent}
                disabled={!agreed || !openedDoc || saving}
                style={[
                  styles.cta,
                  compact && styles.ctaDesk,
                  (!agreed || !openedDoc || saving) && styles.ctaDisabled,
                ]}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.ctaTxt}>{t('common.save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={{ height: 32 }} />
        </View>
      </ScrollBody>
      <LegalDocumentModal visible={docOpen} onClose={() => setDocOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wrap: { width: '100%' },
  wrapDesk: { maxWidth: 720 },
  grid: { marginTop: 14, gap: 8 },
  gridDesk: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cell: { width: '100%' },
  cellDesk: {
    width: Platform.OS === 'web' ? 'calc(50% - 4px)' : '48%',
    maxWidth: Platform.OS === 'web' ? 'calc(50% - 4px)' : '48%',
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 64,
  },
  tileDesk: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 72,
    gap: 10,
  },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eef6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIconDesk: { width: 32, height: 32, borderRadius: 8 },
  tileBody: { flex: 1, minWidth: 0 },
  tileTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tileTitle: { flex: 1, fontWeight: '800', fontSize: 15, color: colors.ink },
  tileTitleDesk: { ...deskType.label, fontSize: 13, fontWeight: '600' },
  tileSub: { marginTop: 3, fontSize: 12, fontWeight: '600', color: colors.muted, lineHeight: 16 },
  tileSubDesk: { ...deskType.small, marginTop: 2, lineHeight: 16 },
  status: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#e2e8f0',
  },
  statusOn: { backgroundColor: colors.successSoft },
  statusTxt: { fontSize: 10, fontWeight: '800', color: colors.muted },
  statusTxtOn: { color: colors.success },
  panel: {
    marginTop: 14,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  panelDesk: { borderRadius: 8, padding: 14, marginTop: 12 },
  panelTitle: { fontWeight: '800', fontSize: 15, color: colors.ink },
  panelTitleDesk: { ...deskType.label, fontSize: 14, fontWeight: '600' },
  panelBody: { marginTop: 6, fontSize: 13, fontWeight: '600', color: colors.ink, lineHeight: 19 },
  panelBodyDesk: { ...deskType.body, marginTop: 4, lineHeight: 18 },
  meta: { marginTop: 4, fontSize: 12, fontWeight: '600', color: colors.muted },
  metaDesk: { ...deskType.small, marginTop: 3 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  fine: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    fontWeight: '500',
  },
  fineDesk: { ...deskType.small, marginTop: 10, lineHeight: 17 },
  link: { color: colors.brand, fontWeight: '700' },
  doc: { marginTop: 12, gap: 10 },
  docH: { fontWeight: '800', fontSize: 15, color: colors.ink, marginTop: 8 },
  docHDesk: { ...deskType.title, fontSize: 14, marginTop: 6 },
  docP: { fontSize: 14, lineHeight: 22, color: colors.ink, fontWeight: '500' },
  docPDesk: { ...deskType.body, fontSize: 13, lineHeight: 20 },
  licenseRow: { paddingHorizontal: 2, paddingVertical: 10 },
  licenseName: { fontWeight: '800', fontSize: 14, color: colors.ink },
  licenseNameDesk: { ...deskType.label, fontSize: 13 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  docBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.brandSoft,
    backgroundColor: '#f8fbff',
    borderRadius: radius.md,
    padding: 12,
  },
  docBtnDesk: { borderRadius: 8, padding: 10 },
  docBtnTitle: { fontWeight: '800', fontSize: 14, color: colors.brand },
  openedOk: { marginTop: 10, color: colors.success, fontWeight: '700', fontSize: 13 },
  hint: { marginTop: 10, color: colors.warn, fontWeight: '700', fontSize: 13 },
  cta: {
    marginTop: 14,
    alignSelf: 'flex-start',
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  ctaDesk: { borderRadius: 7, paddingVertical: 8, paddingHorizontal: 12, minHeight: 36 },
  ctaDisabled: { opacity: 0.5 },
  ctaTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  mailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  mailTxt: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  notice: { marginTop: 12, color: colors.success, fontWeight: '700', fontSize: 13 },
});
