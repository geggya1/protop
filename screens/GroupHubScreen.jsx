import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../src/i18n';
import { useApp } from '../src/context/AppContext';
import { colors, useLayout, appTileWidth } from '../src/theme';
import {
  isGroupAdmin,
  archiveSupersededParentPlaceholders,
  dedupeFamilyParents,
  isPendingMemberInvite,
} from '../src/utils/groups';
import { openPlatformHome } from '../src/utils/platformNav';
import { AvatarBubble } from '../components/AvatarPicker';
import AdminBadge from '../components/AdminBadge';
import { Loader } from '../components/ui';
import AddMemberModal from '../components/AddMemberModal';
import HelpTarget from '../components/HelpTarget';

const COL_GAP = 10;
const COL_MAX = 220;

function memberColumns({ width, isPhone, isTablet, railWidth, pad, count }) {
  if (!count) return 1;
  if (isPhone) return Math.min(2, count);
  const minCol = isTablet ? 180 : 160;
  const chrome = railWidth + pad * 2 + 24;
  const available = Math.max(minCol, width - chrome);
  const fit = Math.max(1, Math.floor((available + COL_GAP) / (minCol + COL_GAP)));
  return Math.min(5, count, fit);
}

function isInactive(person) {
  return person?.active === false || person?.archived === true;
}

function isPendingInvite(person) {
  return isPendingMemberInvite(person);
}

function PersonRow({
  person, superAdmin, admin, inactive, pending, onPress, compact, grouped, last, card,
}) {
  const avatarSize = card ? 40 : compact ? 32 : 40;
  const statusLabel = pending ? 'Venter på svar' : (inactive ? 'Deaktivert' : null);
  if (card) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={[styles.memberCard, compact && styles.memberCardDesk, (inactive || pending) && styles.rowInactive]}
        accessibilityRole="button"
      >
        <AvatarBubble
          avatarId={person.avatarId}
          photoURL={person.photoURL}
          name={person.name}
          size={avatarSize}
        />
        {statusLabel ? <Text style={styles.inactiveLabel}>{statusLabel}</Text> : null}
        <Text
          style={[styles.cardName, compact && styles.cardNameDesk, (inactive || pending) && styles.nameInactive]}
          numberOfLines={1}
        >
          {person.name}
        </Text>
        {person.username ? (
          <Text
            style={[styles.cardSub, compact && styles.cardSubDesk, (inactive || pending) && styles.subInactive]}
            numberOfLines={1}
          >
            @{person.username}
          </Text>
        ) : null}
        {(superAdmin || admin) && !inactive && !pending ? (
          <AdminBadge superAdmin={superAdmin} admin={admin && !superAdmin} />
        ) : null}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        grouped ? styles.groupedRow : styles.row,
        compact && (grouped ? styles.groupedRowDesk : styles.rowDesk),
        last && grouped && styles.groupedRowLast,
        (inactive || pending) && styles.rowInactive,
      ]}
      accessibilityRole="button"
    >
      <AvatarBubble
        avatarId={person.avatarId}
        photoURL={person.photoURL}
        name={person.name}
        size={avatarSize}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        {statusLabel ? (
          <Text style={styles.inactiveLabel}>{statusLabel}</Text>
        ) : null}
        <Text
          style={[styles.name, compact && styles.nameDesk, (inactive || pending) && styles.nameInactive]}
          numberOfLines={1}
        >
          {person.name}
        </Text>
        <View style={styles.metaRow}>
          {person.username ? (
            <Text
              style={[styles.sub, compact && styles.subDesk, (inactive || pending) && styles.subInactive]}
              numberOfLines={1}
            >
              @{person.username}
            </Text>
          ) : null}
          {person.adultRole === 'grandparent' || person.isGrandparent ? (
            <Text style={[styles.sub, compact && styles.subDesk]}>Besteforeldre</Text>
          ) : null}
          {(superAdmin || admin) && !inactive && !pending ? (
            <AdminBadge superAdmin={superAdmin} admin={admin && !superAdmin} />
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={compact ? 14 : 16} color={(inactive || pending) ? '#fca5a5' : colors.muted} />
    </TouchableOpacity>
  );
}

export default function GroupHubScreen({ inShell = false }) {
  const { t } = useI18n();
  const nav = useNavigation();
  const { params } = useRoute();
  const { width, isPhone, isTablet, isDesktop, railWidth, pad } = useLayout();
  const compact = !isPhone;
  const { family, familyId, parents, kids, uid, selectFamily, requestShellTab, shellIntent, clearShellIntent } = useApp();
  const fid = params?.familyId || familyId;
  const owner = family?.ownerUid;
  const adminOk = isGroupAdmin(family, uid);
  const [showArchived, setShowArchived] = useState(!!params?.showArchived);
  const [addOpen, setAddOpen] = useState(false);

  const allLeaders = useMemo(
    () => dedupeFamilyParents(parents || [])
      .sort((a, b) => {
        const ai = isInactive(a) ? 1 : 0;
        const bi = isInactive(b) ? 1 : 0;
        if (ai !== bi) return ai - bi;
        return (a.name || '').localeCompare(b.name || '');
      }),
    [parents],
  );

  const pendingLeaders = useMemo(
    () => allLeaders.filter((p) => isPendingInvite(p)),
    [allLeaders],
  );

  const allMembers = useMemo(
    () => (kids || [])
      .filter((c) => c.deleted !== true)
      .sort((a, b) => {
        const ai = isInactive(a) ? 1 : 0;
        const bi = isInactive(b) ? 1 : 0;
        if (ai !== bi) return ai - bi;
        return (a.name || '').localeCompare(b.name || '');
      }),
    [kids],
  );

  const activeLeaders = useMemo(
    () => allLeaders.filter((p) => (
      !isInactive(p) && !isPendingInvite(p)
      && p.adultRole !== 'grandparent' && p.isGrandparent !== true
    )),
    [allLeaders],
  );

  const activeGrandparents = useMemo(
    () => allLeaders.filter((p) => (
      !isInactive(p) && !isPendingInvite(p)
      && (p.adultRole === 'grandparent' || p.isGrandparent === true)
    )),
    [allLeaders],
  );

  const activeMembers = useMemo(
    () => allMembers.filter((c) => !isInactive(c)),
    [allMembers],
  );

  const archivedLeaders = useMemo(
    () => allLeaders.filter((p) => isInactive(p) && !isPendingInvite(p)),
    [allLeaders],
  );

  const archivedMembers = useMemo(
    () => allMembers.filter((c) => isInactive(c)),
    [allMembers],
  );

  const archivedCount = archivedLeaders.length + archivedMembers.length;

  const childCols = useMemo(
    () => memberColumns({
      width, isPhone, isTablet, railWidth, pad, count: activeMembers.length,
    }),
    [width, isPhone, isTablet, railWidth, pad, activeMembers.length],
  );

  const archivedChildCols = useMemo(
    () => memberColumns({
      width, isPhone, isTablet, railWidth, pad, count: archivedMembers.length,
    }),
    [width, isPhone, isTablet, railWidth, pad, archivedMembers.length],
  );

  // Heal historical invite-claim duplicates (placeholder + uid docs for same person).
  useEffect(() => {
    if (!fid || !adminOk) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await archiveSupersededParentPlaceholders(fid);
      } catch (error) {
        if (!cancelled) console.warn('Could not archive duplicate parent placeholders', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fid, adminOk]);

  useEffect(() => {
    if (params?.showArchived) setShowArchived(true);
  }, [params?.showArchived]);

  useEffect(() => {
    if (shellIntent !== 'showArchived') return;
    setShowArchived(true);
    clearShellIntent?.();
  }, [shellIntent, clearShellIntent]);

  useEffect(() => {
    if (shellIntent !== 'addMember') return;
    setAddOpen(true);
    clearShellIntent?.();
  }, [shellIntent, clearShellIntent]);

  const openMember = (role, person) => {
    nav.navigate('MemberSettings', { familyId: fid, role, memberId: person.id });
  };

  const goHome = async () => {
    await selectFamily(fid);
    if (inShell) {
      requestShellTab?.('home');
      return;
    }
    openPlatformHome(nav, family || { type: 'family' });
  };

  const goBack = () => {
    if (inShell) {
      requestShellTab?.('home');
      return;
    }
    goHome();
  };

  const goAddMember = () => setAddOpen(true);

  const memberGridStyle = (cols) => (
    Platform.OS === 'web'
      ? {
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: COL_GAP,
        maxWidth: cols * COL_MAX + (cols - 1) * COL_GAP,
        alignItems: 'stretch',
      }
      : {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: COL_GAP,
        maxWidth: cols === 1 && compact ? COL_MAX : undefined,
      }
  );

  const nativeColWidth = (cols) => (cols === 1 ? '100%' : appTileWidth(cols, COL_GAP));

  if (!family && fid) {
    return (
      <SafeAreaView style={styles.safe} edges={inShell ? [] : undefined}>
        <Loader />
      </SafeAreaView>
    );
  }

  if (!adminOk) {
    return (
      <SafeAreaView style={styles.safe} edges={inShell ? [] : undefined}>
        {!inShell ? (
          <View style={styles.head}>
            <TouchableOpacity style={styles.backBtn} onPress={() => nav.goBack()}>
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </TouchableOpacity>
            <Text style={styles.headTitle}>{family?.name || 'Familie'}</Text>
          </View>
        ) : null}
        <View style={styles.center}>
          <Text style={styles.empty}>{t('member.noAccess')}</Text>
          <TouchableOpacity style={styles.primary} onPress={goHome}>
            <Text style={styles.primaryTxt}>{t('start.goHome')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={inShell ? [] : undefined}>
      {!inShell ? (
        <View style={styles.head}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={goBack}
            accessibilityLabel={t('start.goHome')}
          >
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.kicker}>{t(`group.${family?.type || 'family'}`)}</Text>
            <Text style={[styles.headTitle, compact && styles.headTitleDesk]} numberOfLines={1}>
              {family?.name || '—'}
            </Text>
          </View>
          <HelpTarget id="add">
            <TouchableOpacity
              style={[styles.plus, compact && styles.plusDesk]}
              onPress={goAddMember}
              accessibilityLabel={t('group.addPeople')}
            >
              <Ionicons name="add" size={compact ? 18 : 22} color="#fff" />
            </TouchableOpacity>
          </HelpTarget>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.body, compact && styles.bodyDesk]}
        showsVerticalScrollIndicator={false}
      >
        {activeLeaders.length + activeMembers.length <= 1 && (
          <Text style={[styles.hint, compact && styles.hintDesk]}>{t('group.onlyYou')}</Text>
        )}

        <TouchableOpacity
          style={[styles.inviteCta, compact && styles.inviteCtaDesk]}
          onPress={goAddMember}
        >
          <View style={[styles.inviteIcon, compact && styles.inviteIconDesk]}>
            <Ionicons name="person-add" size={compact ? 15 : 18} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.inviteTitle, compact && styles.inviteTitleDesk]}>
              {t('group.addPeople')}
            </Text>
            <Text style={[styles.inviteSub, compact && styles.inviteSubDesk]}>
              Inviter foresatt eller legg til barn
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>

        {pendingLeaders.length > 0 ? (
          <>
            <Text style={[styles.section, compact && styles.sectionDesk]}>
              {t('member.pendingInvites')} ({pendingLeaders.length})
            </Text>
            <View style={[styles.listCard, compact && styles.listCardDesk]}>
              {pendingLeaders.map((p, index) => (
                <PersonRow
                  key={`pending-${p.id}`}
                  person={p}
                  grouped
                  last={index === pendingLeaders.length - 1}
                  compact={compact}
                  pending
                  superAdmin={false}
                  admin={false}
                  onPress={() => openMember('parent', p)}
                />
              ))}
            </View>
          </>
        ) : null}

        <Text style={[styles.section, compact && styles.sectionDesk]}>
          {t('group.leaders')} ({activeLeaders.length})
        </Text>
        {activeLeaders.length === 0 ? (
          <Text style={styles.empty}>—</Text>
        ) : (
          <View style={[styles.listCard, compact && styles.listCardDesk]}>
            {activeLeaders.map((p, index) => (
              <PersonRow
                key={p.id}
                person={p}
                grouped
                last={index === activeLeaders.length - 1}
                compact={compact}
                inactive={false}
                superAdmin={p.uid === owner || p.superAdmin}
                admin={p.admin || (family?.adminUids || []).includes(p.uid)}
                onPress={() => openMember('parent', p)}
              />
            ))}
          </View>
        )}

        {activeGrandparents.length > 0 ? (
          <>
            <Text style={[styles.section, styles.sectionSpaced, compact && styles.sectionDesk]}>
              {t('member.roleGrandparent')} ({activeGrandparents.length})
            </Text>
            <View style={[styles.listCard, compact && styles.listCardDesk]}>
              {activeGrandparents.map((p, index) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  grouped
                  last={index === activeGrandparents.length - 1}
                  compact={compact}
                  inactive={false}
                  superAdmin={false}
                  admin={false}
                  onPress={() => openMember('parent', p)}
                />
              ))}
            </View>
          </>
        ) : null}

        <Text style={[styles.section, styles.sectionSpaced, compact && styles.sectionDesk]}>
          {t('group.members')} ({activeMembers.length})
        </Text>
        {activeMembers.length === 0 ? (
          <Text style={styles.empty}>{t('group.addPeople')}</Text>
        ) : (
          <View style={memberGridStyle(childCols)}>
            {activeMembers.map((c) => (
              <View
                key={c.id}
                style={Platform.OS !== 'web' ? { width: nativeColWidth(childCols) } : null}
              >
                <PersonRow
                  person={c}
                  card
                  compact={compact}
                  inactive={false}
                  onPress={() => openMember('child', c)}
                />
              </View>
            ))}
          </View>
        )}

        {archivedCount > 0 ? (
          <>
            <TouchableOpacity
              style={[styles.archiveToggle, compact && styles.archiveToggleDesk]}
              onPress={() => setShowArchived(!showArchived)}
              accessibilityRole="button"
            >
              <Ionicons name="archive-outline" size={16} color={colors.brand} />
              <Text style={[styles.archiveToggleTxt, compact && styles.archiveToggleTxtDesk]}>
                {showArchived
                  ? 'Skjul arkiverte medlemmer'
                  : `Vis arkiverte medlemmer (${archivedCount})`}
              </Text>
            </TouchableOpacity>

            {showArchived ? (
              <View style={styles.archivedBlock}>
                <Text style={[styles.archivedHint, compact && styles.hintDesk]}>
                  {t('member.archiveHint')}
                </Text>
                {archivedLeaders.length > 0 ? (
                  <>
                    <Text style={[styles.section, compact && styles.sectionDesk]}>
                      {t('group.leaders')} — arkiv
                    </Text>
                    <View style={[styles.listCard, compact && styles.listCardDesk]}>
                      {archivedLeaders.map((p, index) => (
                        <PersonRow
                          key={`arch-p-${p.id}`}
                          person={p}
                          grouped
                          last={index === archivedLeaders.length - 1}
                          compact={compact}
                          inactive
                          superAdmin={p.uid === owner || p.superAdmin}
                          admin={p.admin || (family?.adminUids || []).includes(p.uid)}
                          onPress={() => openMember('parent', p)}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
                {archivedMembers.length > 0 ? (
                  <>
                    <Text style={[styles.section, styles.sectionSpaced, compact && styles.sectionDesk]}>
                      {t('group.members')} — arkiv
                    </Text>
                    <View style={memberGridStyle(archivedChildCols)}>
                      {archivedMembers.map((c) => (
                        <View
                          key={`arch-c-${c.id}`}
                          style={Platform.OS !== 'web' ? { width: nativeColWidth(archivedChildCols) } : null}
                        >
                          <PersonRow
                            person={c}
                            card
                            compact={compact}
                            inactive
                            onPress={() => openMember('child', c)}
                          />
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.secondary, compact && styles.secondaryDesk]}
            onPress={() => (inShell
              ? requestShellTab?.('more', 'groupSettings')
              : nav.navigate('GroupSettings', { familyId: fid }))}
          >
            <Ionicons name="settings-outline" size={16} color={colors.ink} />
            <Text style={[styles.secondaryTxt, compact && styles.secondaryTxtDesk]}>
              {t('common.settings')}
            </Text>
          </TouchableOpacity>
          {!inShell ? (
            <TouchableOpacity style={[styles.homeBtn, compact && styles.homeBtnDesk]} onPress={goHome}>
              <Ionicons name="home-outline" size={16} color={colors.brand} />
              <Text style={[styles.homeBtnTxt, compact && styles.homeBtnTxtDesk]}>{t('start.goHome')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
      <AddMemberModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        familyId={fid}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
    backgroundColor: colors.bg,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center',
  },
  kicker: {
    fontWeight: '600', color: colors.muted, letterSpacing: 0.6,
    fontSize: 11, textTransform: 'uppercase',
  },
  headTitle: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 1 },
  headTitleDesk: { fontSize: 16, fontWeight: '600' },
  plus: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.fab,
    alignItems: 'center', justifyContent: 'center',
  },
  plusDesk: { width: 32, height: 32, borderRadius: 8 },
  body: { padding: 16, paddingBottom: 40 },
  bodyDesk: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  hint: { color: colors.muted, fontWeight: '500', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  hintDesk: { fontWeight: '400', fontSize: 12, lineHeight: 17 },
  inviteCta: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.brand, borderRadius: 12, padding: 12, marginBottom: 16,
  },
  inviteCtaDesk: {
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 14,
    alignSelf: 'flex-start', maxWidth: 420, gap: 8,
  },
  inviteIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  inviteIconDesk: { width: 28, height: 28, borderRadius: 6 },
  inviteTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  inviteTitleDesk: { fontWeight: '600', fontSize: 13 },
  inviteSub: { color: 'rgba(255,255,255,0.88)', fontWeight: '500', fontSize: 12, marginTop: 1 },
  inviteSubDesk: { fontWeight: '400', fontSize: 11 },
  section: {
    fontWeight: '700', fontSize: 12, color: colors.muted, marginBottom: 8,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  sectionDesk: { fontWeight: '600', fontSize: 11, letterSpacing: 0.42, marginBottom: 6 },
  sectionSpaced: { marginTop: 16 },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    maxWidth: 520,
  },
  listCardDesk: { borderRadius: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card,
    borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8,
    borderWidth: 1, borderColor: colors.line,
  },
  rowDesk: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  groupedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  groupedRowDesk: { paddingVertical: 8, paddingHorizontal: 10, gap: 8 },
  groupedRowLast: { borderBottomWidth: 0 },
  memberCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 6,
    minHeight: 108,
  },
  memberCardDesk: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    minHeight: 96,
  },
  cardName: { fontWeight: '600', fontSize: 13, color: colors.ink, textAlign: 'center', width: '100%' },
  cardNameDesk: { fontSize: 13, fontWeight: '600' },
  cardSub: { color: colors.muted, fontWeight: '400', fontSize: 11, textAlign: 'center' },
  cardSubDesk: { fontSize: 11, fontWeight: '400' },
  rowInactive: {
    opacity: 0.55,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' },
  inactiveLabel: {
    color: colors.danger, fontWeight: '700', fontSize: 10,
    letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 1,
  },
  name: { fontWeight: '600', fontSize: 14, color: colors.ink },
  nameDesk: { fontSize: 13, fontWeight: '600' },
  nameInactive: { color: '#7f1d1d' },
  sub: { color: colors.muted, fontWeight: '400', fontSize: 12 },
  subDesk: { fontSize: 11 },
  subInactive: { color: '#b91c1c' },
  empty: { color: colors.muted, fontWeight: '500', fontSize: 13, marginBottom: 8 },
  actions: { marginTop: 16, gap: 8, alignItems: 'flex-start' },
  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: colors.line, alignSelf: 'flex-start',
  },
  secondaryDesk: { borderRadius: 7, paddingVertical: 7, paddingHorizontal: 10 },
  secondaryTxt: { color: colors.ink, fontWeight: '600', fontSize: 13 },
  secondaryTxtDesk: { fontWeight: '500', fontSize: 13 },
  homeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.brandSoft, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  homeBtnDesk: { borderRadius: 7, paddingVertical: 7, paddingHorizontal: 10 },
  homeBtnTxt: { color: colors.brand, fontWeight: '600', fontSize: 13 },
  homeBtnTxtDesk: { fontWeight: '500' },
  archiveToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, marginTop: 14, alignSelf: 'flex-start',
  },
  archiveToggleDesk: { paddingVertical: 8, marginTop: 12 },
  archiveToggleTxt: { fontWeight: '600', color: colors.brand, fontSize: 13 },
  archiveToggleTxtDesk: { fontWeight: '500', fontSize: 12 },
  archivedBlock: { marginTop: 4 },
  archivedHint: {
    color: colors.muted, fontWeight: '500', fontSize: 12, lineHeight: 17,
    marginBottom: 12,
  },
  primary: {
    backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20,
  },
  primaryTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
