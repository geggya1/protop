import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator,
  ScrollView, Modal, Image, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { Screen, Title, Mute } from '../../components/ui';
import ShellAddButton from '../../components/ShellAddButton';
import HelpTarget from '../../components/HelpTarget';
import MemberAvatarStack from '../../components/MemberAvatarStack';
import { AvatarBubble } from '../../components/AvatarPicker';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import {
  listenAccessibleWishlists, createWishlist, ensureFamilyWishlist,
  splitWishlists, mergeSharedWishlistsForHub, wishlistOwnerLabel, isFamilySharedWishlist,
  canViewWishlist, resolveWishlistViewers, isWishlistDraft,
} from '../../src/utils/wishlists';
import { listenSharedWishlists } from '../../src/utils/friends';
import { isFamilyType } from '../../src/utils/groupTypes';
import WishlistScreen from './WishlistScreen';
import { ModulePageFrame, ModuleBgSpacer, ModuleHubIntro } from '../../components/ModulePageBg';

function ListRow({ list, onPress, isDesktop, hint, viewers }) {
  const friendShare = !!(list?.sharedByFriend || list?.crossFamily);
  const who = friendShare
    ? (list.sourceFamilyName || viewers?.label || 'Delt med deg')
    : (viewers?.label || wishlistOwnerLabel(list));
  const otherFam = friendShare
    ? null
    : (list.sourceFamilyName || (list.crossFamily ? 'Annen familie' : null));
  const subtitle = [who, otherFam, hint].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
  const count = list.itemCount != null ? Number(list.itemCount) : null;
  const draft = !friendShare && (viewers?.draft || isWishlistDraft(list));

  return (
    <TouchableOpacity
      style={[styles.listRow, isDesktop && styles.listRowDesk]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.listIcon, isDesktop && styles.listIconDesk]}>
        {list.coverImageUrl ? (
          <Image source={{ uri: list.coverImageUrl }} style={styles.listIconImg} />
        ) : (
          <Ionicons name="gift" size={isDesktop ? 16 : 18} color={colors.brand} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.listName, isDesktop && styles.listNameDesk]} numberOfLines={1}>
          {list.name}
        </Text>
        <Text style={[styles.listMeta, isDesktop && styles.listMetaDesk]} numberOfLines={1}>
          {subtitle}
          {count != null ? ` · ${count} ønsker` : ''}
        </Text>
      </View>
      {!friendShare && viewers?.people?.length ? (
        <MemberAvatarStack people={viewers.people} size={isDesktop ? 18 : 20} max={3} />
      ) : draft ? (
        <View style={styles.lockPill}>
          <Ionicons name="lock-closed" size={10} color={colors.muted} />
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  );
}

export default function WishlistsHubScreen({ compactHeader = false, profileChildId = null }) {
  const { isDesktop } = useLayout();
  const {
    familyId, uid, members, kids, isParent, isActingAsChild, isChild, isAdmin, isGrandparent,
    meChild, activeChild, switchToChildProfile, requestShellTab,
    shellIntent, clearShellIntent, liveFamilies, families,
  } = useApp();
  const [lists, setLists] = useState([]);
  const [sharedWishlists, setSharedWishlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('hub');
  const [activeListId, setActiveListId] = useState(null);
  const [activeListFamilyId, setActiveListFamilyId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [forMemberKey, setForMemberKey] = useState('self');
  const [creating, setCreating] = useState(false);
  const [ensuringFamily, setEnsuringFamily] = useState(false);
  const [expandedKids, setExpandedKids] = useState({});
  const familyEnsureTriedRef = React.useRef(false);
  useHelpScene(view === 'hub' ? 'hub' : 'inner');

  const myName = members.find((m) => m.uid === uid)?.name || '';
  const activeKids = useMemo(
    () => (kids || []).filter((k) => k.active !== false && k.archived !== true),
    [kids],
  );
  const asParent = isParent && !isActingAsChild;
  const onChildPage = !!profileChildId;
  const profileChild = isChild
    ? meChild
    : (isActingAsChild ? activeChild : activeKids.find((k) => k.id === profileChildId) || null);

  const memberOptions = useMemo(() => {
    const opts = [];
    if (asParent) {
      opts.push({
        key: 'family',
        role: 'family',
        uid: null,
        docId: null,
        name: 'Familien (felles)',
        isSelf: false,
        isFamily: true,
      });
    }
    for (const m of members || []) {
      if (!m?.uid && !m?.id) continue;
      const key = m.role === 'child'
        ? `child:${m.docId || m.childId || m.id}`
        : `parent:${m.uid}`;
      opts.push({
        key,
        role: m.role,
        uid: m.uid,
        docId: m.docId || m.childId || m.id,
        name: m.name || (m.role === 'child' ? 'Barn' : 'Foresatt'),
        isSelf: m.uid === uid,
        isFamily: false,
      });
    }
    const seen = new Set();
    return opts.filter((o) => {
      if (seen.has(o.key)) return false;
      seen.add(o.key);
      return true;
    });
  }, [members, uid, asParent]);

  useEffect(() => {
    if (!familyId) return undefined;
    const familyIds = [...new Set(
      (liveFamilies || families || [])
        .filter((f) => f?.id && isFamilyType(f.type) && f.archived !== true && f.active !== false)
        .map((f) => f.id)
        .concat(familyId ? [familyId] : []),
    )];
    return listenAccessibleWishlists({
      familyIds,
      activeFamilyId: familyId,
      uid,
      platforms: liveFamilies || families || [],
      onChange: (data) => {
        setLists(data);
        setLoading(false);
      },
    });
  }, [familyId, uid, liveFamilies, families]);

  useEffect(() => {
    if (!uid) {
      setSharedWishlists([]);
      return undefined;
    }
    return listenSharedWishlists(uid, setSharedWishlists);
  }, [uid]);

  // Felles familiønskeliste for alle i familien — inline, ikke fullside-spinner.
  useEffect(() => {
    if (!familyId || !uid || loading || ensuringFamily || onChildPage) return;
    if (!(isParent || isAdmin) || isActingAsChild || isChild) return;
    const has = lists.some((l) => (
      isFamilySharedWishlist(l) && (!l.familyId || l.familyId === familyId)
    ));
    if (has) {
      familyEnsureTriedRef.current = true;
      return;
    }
    if (familyEnsureTriedRef.current) return;
    familyEnsureTriedRef.current = true;
    let cancelled = false;
    setEnsuringFamily(true);
    ensureFamilyWishlist(familyId, { uid, creatorName: myName, members })
      .catch(() => {})
      .finally(() => { if (!cancelled) setEnsuringFamily(false); });
    return () => { cancelled = true; };
  }, [
    familyId, uid, loading, ensuringFamily, onChildPage, lists,
    isParent, isAdmin, isActingAsChild, isChild, myName, members,
  ]);

  const visibleLists = useMemo(() => {
    const actor = {
      uid,
      childId: profileChildId || profileChild?.id || null,
      familyId,
      isParent: isParent && !isGrandparent,
      isAdmin,
      isChild,
      isActingAsChild,
      isGrandparent,
    };
    return (lists || []).filter((list) => canViewWishlist(list, actor));
  }, [lists, uid, profileChildId, profileChild, familyId, isParent, isAdmin, isChild, isActingAsChild, isGrandparent]);

  const { mine, family, familyShared, fromOthers } = useMemo(
    () => splitWishlists(visibleLists, { uid, profileChildId, familyId }),
    [visibleLists, uid, profileChildId, familyId],
  );

  /** Venner-delte + kryss-familie: egen rad med listens navn (ikke blandet inn i egen familie). */
  const sharedWithMe = useMemo(
    () => mergeSharedWishlistsForHub(sharedWishlists, fromOthers),
    [sharedWishlists, fromOthers],
  );

  const viewersFor = useCallback((list) => resolveWishlistViewers(list, {
    members,
    familyId,
    families: liveFamilies || families || [],
  }), [members, familyId, liveFamilies, families]);

  /** Voksen-familie (ikke barn) vs barn gruppert under forChildId. */
  const { adultFamily, kidsGroups } = useMemo(() => {
    if (onChildPage) {
      return { adultFamily: [], kidsGroups: [] };
    }
    const adultFamily = (family || []).filter((l) => !l.forChildId && !isFamilySharedWishlist(l));
    const byChild = new Map();
    for (const l of family || []) {
      if (!l.forChildId) continue;
      if (!byChild.has(l.forChildId)) byChild.set(l.forChildId, []);
      byChild.get(l.forChildId).push(l);
    }
    const groups = activeKids.map((k) => ({
      child: k,
      lists: byChild.get(k.id) || [],
    }));
    // Lister knyttet til barn som ikke lenger er i activeKids
    for (const [childId, childLists] of byChild.entries()) {
      if (groups.some((g) => g.child.id === childId)) continue;
      const name = childLists[0]?.forChildName || 'Barn';
      groups.push({
        child: { id: childId, name },
        lists: childLists,
      });
    }
    return { adultFamily, kidsGroups: groups };
  }, [family, activeKids, onChildPage]);

  const familyPanelLists = useMemo(() => {
    const shared = familyShared || [];
    const others = adultFamily || [];
    return [...shared, ...others];
  }, [familyShared, adultFamily]);

  const firstListId = (
    onChildPage
      ? (mine[0] || familyShared[0])
      : (mine[0] || familyPanelLists[0] || kidsGroups.find((g) => g.lists?.[0])?.lists?.[0])
  )?.id || null;

  const openList = useCallback((item) => {
    const id = typeof item === 'string' ? item : item?.id;
    if (!id) return;
    const hostFamilyId = (typeof item === 'object' && item?.familyId) || null;
    if (typeof item === 'object' && item?.sharedByFriend && !hostFamilyId) {
      Alert.alert('Ønskeliste', 'Delingen mangler familie. Be vennen dele listen på nytt.');
      return;
    }
    setActiveListId(id);
    setActiveListFamilyId(hostFamilyId || familyId);
    setView('list');
  }, [familyId]);

  const openCreate = useCallback((presetKey = null, presetName = '') => {
    if (onChildPage && profileChildId) {
      setForMemberKey(`child:${profileChildId}`);
      setNewName(presetName || `${(profileChild?.name || 'Min').split(' ')[0]} ønskeliste`);
    } else {
      setForMemberKey(presetKey || `parent:${uid}`);
      setNewName(presetName || 'Ønskelisten min');
    }
    setCreateOpen(true);
  }, [onChildPage, profileChildId, profileChild, uid]);

  useEffect(() => {
    if (shellIntent !== 'create') return;
    clearShellIntent?.();
    openCreate();
  }, [shellIntent, clearShellIntent, openCreate]);

  const createNew = useCallback(async () => {
    const name = newName.trim();
    if (!name || !familyId || !uid) return;

    setCreating(true);
    try {
      let forChildId = null;
      let forChildName = null;
      let forMemberUid = null;
      let forMemberName = null;
      let subjectUid = uid;
      let scope = null;

      if (onChildPage && profileChild) {
        forChildId = profileChild.id || profileChildId;
        forChildName = profileChild.name || null;
        subjectUid = profileChild.uid || null;
      } else if (forMemberKey === 'family') {
        scope = 'family';
        subjectUid = null;
      } else {
        const selected = memberOptions.find((o) => o.key === forMemberKey)
          || memberOptions.find((o) => o.isSelf)
          || null;
        if (selected?.role === 'child') {
          forChildId = selected.docId;
          forChildName = selected.name;
          subjectUid = selected.uid || null;
        } else if (selected) {
          forMemberUid = selected.uid;
          forMemberName = selected.name;
          subjectUid = selected.uid;
          if (selected.isSelf) {
            forMemberUid = null;
            forMemberName = null;
          }
        }
      }

      // Unngå duplikat felles liste
      if (scope === 'family') {
        const existingShared = lists.find((l) => isFamilySharedWishlist(l));
        if (existingShared) {
          setCreateOpen(false);
          setActiveListId(existingShared.id);
          setActiveListFamilyId(existingShared.familyId || familyId);
          setView('list');
          return;
        }
      }

      const ref = await createWishlist(familyId, {
        uid,
        creatorName: myName,
        name,
        forChildId,
        forChildName,
        forMemberUid,
        forMemberName,
        subjectUid,
        scope,
        members,
      });
      setNewName('');
      setCreateOpen(false);
      if (forChildId) {
        setExpandedKids((prev) => ({ ...prev, [forChildId]: true }));
      }
      setActiveListId(ref.id);
      setActiveListFamilyId(familyId);
      setView('list');
    } catch (e) {
      console.warn('createWishlist failed', e);
      Alert.alert('Feil', 'Klarte ikke opprette ønskelisten. Prøv igjen.');
    } finally {
      setCreating(false);
    }
  }, [
    newName, familyId, uid, myName, onChildPage, profileChild, profileChildId,
    forMemberKey, memberOptions, lists, members,
  ]);

  const openAsChild = useCallback((childId) => {
    if (!childId) return;
    switchToChildProfile?.(childId);
    requestShellTab?.('more', 'wishes');
  }, [switchToChildProfile, requestShellTab]);

  const toggleKid = useCallback((childId) => {
    setExpandedKids((prev) => ({ ...prev, [childId]: !prev[childId] }));
  }, []);

  const childFirstName = profileChild?.name?.split(' ')[0] || 'Barnet';
  const selectedOption = memberOptions.find((o) => o.key === forMemberKey);

  const canCreateWishlist = !createOpen && (asParent || onChildPage) && view === 'hub';
  const openDefaultCreate = useCallback(() => {
    openCreate(
      onChildPage ? `child:${profileChildId}` : `parent:${uid}`,
      onChildPage ? `${childFirstName} ønskeliste` : 'Ønskelisten min',
    );
  }, [openCreate, onChildPage, profileChildId, uid, childFirstName]);

  const shellWishBtn = useMemo(() => {
    if (!canCreateWishlist) return null;
    return (
      <HelpTarget id="add" onAdvance={openDefaultCreate}>
        <ShellAddButton
          label="Ny ønskeliste"
          onPress={openDefaultCreate}
        />
      </HelpTarget>
    );
  }, [isDesktop, canCreateWishlist, openDefaultCreate]);
  useShellTitleRight(shellWishBtn, { active: view === 'hub' });

  if (view === 'list' && activeListId) {
    return (
      <WishlistScreen
        listId={activeListId}
        listFamilyId={activeListFamilyId || familyId}
        onBack={() => { setView('hub'); setActiveListId(null); setActiveListFamilyId(null); }}
        mode={onChildPage ? 'owner' : 'family'}
      />
    );
  }

  const renderPanel = (title, rows, emptyText, rowHint = null) => (
    <View style={[styles.panel, isDesktop && styles.panelDesk]}>
      <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={styles.emptyInline}>{emptyText}</Text>
      ) : (
        rows.map((item) => {
          const row = (
            <ListRow
              list={item}
              isDesktop={isDesktop}
              onPress={() => openList(item)}
              viewers={viewersFor(item)}
              hint={rowHint}
            />
          );
          if (item.id === firstListId) {
            return (
              <HelpTarget key={item.id} id="content" onAdvance={() => openList(item)}>
                {row}
              </HelpTarget>
            );
          }
          return <React.Fragment key={item.id}>{row}</React.Fragment>;
        })
      )}
    </View>
  );

  return (
    <Screen>
      <ModulePageFrame name="wishes">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.hub, isDesktop && styles.hubDesk]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <ModuleHubIntro>
        {!compactHeader && (
          <>
            <Title size={22}>Gaveønsker</Title>
            <Mute>
              {onChildPage
                ? `Egne lister for ${childFirstName}, og familiens felles ønskeliste.`
                : 'Egne lister, felles liste, barnas lister — og profilbilder som viser hvem som ser hva. Del dine lister når du er ferdig.'}
            </Mute>
          </>
        )}
        </ModuleHubIntro>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
        ) : onChildPage ? (
          <>
            {renderPanel(
              'Mine ønskelister',
              mine,
              'Ingen ønskeliste ennå. Opprett en for å legge inn ønsker.',
            )}
            {familyShared.length > 0 ? (
              <View style={[styles.panel, isDesktop && styles.panelDesk]}>
                <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>
                  Familiens ønskeliste
                </Text>
                <Text style={styles.familyHint}>
                  Felles for hele familien — alle kan legge inn ønsker.
                </Text>
                {familyShared.map((item) => {
                  const row = (
                    <ListRow
                      list={item}
                      isDesktop={isDesktop}
                      onPress={() => openList(item)}
                      viewers={viewersFor(item)}
                    />
                  );
                  if (item.id === firstListId) {
                    return (
                      <HelpTarget key={item.id} id="content" onAdvance={() => openList(item)}>
                        {row}
                      </HelpTarget>
                    );
                  }
                  return <React.Fragment key={item.id}>{row}</React.Fragment>;
                })}
              </View>
            ) : null}
          </>
        ) : (
          <>
            {renderPanel(
              'Mine ønskelister',
              mine,
              'Ingen egen ønskeliste ennå. Opprett en for deg selv. Den er privat til du deler den.',
            )}

            {asParent ? (
              <View style={[styles.panel, isDesktop && styles.panelDesk]}>
                <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>
                  Familiens ønskeliste
                </Text>
                <Text style={styles.familyHint}>
                  Felles for hele familien — alle kan legge inn ønsker.
                </Text>
                {ensuringFamily ? (
                  <Text style={styles.emptyInline}>Oppretter familiens ønskeliste…</Text>
                ) : familyPanelLists.length === 0 ? (
                  <Text style={styles.emptyInline}>Ingen felles ønskeliste ennå.</Text>
                ) : (
                  familyPanelLists.map((item) => {
                    const row = (
                      <ListRow
                        list={item}
                        isDesktop={isDesktop}
                        onPress={() => openList(item)}
                        viewers={viewersFor(item)}
                        hint={isFamilySharedWishlist(item) ? 'Alle kan redigere' : null}
                      />
                    );
                    if (item.id === firstListId) {
                      return (
                        <HelpTarget key={item.id} id="content" onAdvance={() => openList(item)}>
                          {row}
                        </HelpTarget>
                      );
                    }
                    return <React.Fragment key={item.id}>{row}</React.Fragment>;
                  })
                )}
              </View>
            ) : null}

            {asParent && kidsGroups.length > 0 && (
              <View style={[styles.panel, isDesktop && styles.panelDesk]}>
                <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>
                  Barnas ønskelister
                </Text>
                {kidsGroups.map(({ child, lists: childLists }, idx) => {
                  const open = !!expandedKids[child.id];
                  const firstName = child.name?.split(' ')[0] || 'Barn';
                  return (
                    <View
                      key={child.id}
                      style={[styles.kidBlock, idx > 0 && styles.kidBlockBorder]}
                    >
                      <TouchableOpacity
                        style={styles.kidHeader}
                        onPress={() => toggleKid(child.id)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                      >
                        <View style={[
                          styles.listIcon,
                          styles.kidAvatar,
                          isDesktop && styles.listIconDesk,
                          isDesktop && styles.kidAvatarDesk,
                        ]}>
                          <AvatarBubble
                            avatarId={child.avatarId}
                            photoURL={child.photoURL || child.photoUrl}
                            name={child.name}
                            size={isDesktop ? 32 : 36}
                          />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.kidName, isDesktop && styles.kidNameDesk]} numberOfLines={1}>
                            {firstName}
                          </Text>
                          <Text style={styles.kidMeta}>
                            {childLists.length === 0
                              ? 'Ingen lister'
                              : `${childLists.length} ønskeliste${childLists.length === 1 ? '' : 'r'}`}
                          </Text>
                        </View>
                        <Ionicons
                          name={open ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.muted}
                        />
                      </TouchableOpacity>

                      {open && (
                        <View style={styles.kidBody}>
                          {childLists.length === 0 ? (
                            <Text style={styles.emptyInline}>
                              Ingen ønskeliste for {firstName} ennå.
                            </Text>
                          ) : (
                            childLists.map((item) => {
                              const row = (
                                <ListRow
                                  list={item}
                                  isDesktop={isDesktop}
                                  onPress={() => openList(item)}
                                  viewers={viewersFor(item)}
                                />
                              );
                              if (item.id === firstListId) {
                                return (
                                  <HelpTarget key={item.id} id="content" onAdvance={() => openList(item)}>
                                    {row}
                                  </HelpTarget>
                                );
                              }
                              return <React.Fragment key={item.id}>{row}</React.Fragment>;
                            })
                          )}
                          <View style={styles.kidActions}>
                            <TouchableOpacity
                              style={styles.kidActionLink}
                              onPress={() => openCreate(
                                `child:${child.id}`,
                                `${firstName} ønskeliste`,
                              )}
                            >
                              <Ionicons name="add" size={15} color={colors.brand} />
                              <Text style={styles.kidActionTxt}>Ny liste</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.kidActionLink}
                              onPress={() => openAsChild(child.id)}
                            >
                              <Ionicons name="eye-outline" size={15} color={colors.brand} />
                              <Text style={styles.kidActionTxt}>Se som {firstName}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {sharedWithMe.length > 0 && renderPanel(
              'Delt med meg',
              sharedWithMe,
              'Ingen delte lister fra venner eller andre familier.',
            )}
          </>
        )}
        <ModuleBgSpacer />
      </ScrollView>
      </ModulePageFrame>

      <Modal
        visible={createOpen}
        transparent
        animationType={isDesktop ? 'fade' : 'slide'}
        onRequestClose={() => setCreateOpen(false)}
      >
        <Pressable
          style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
          onPress={() => setCreateOpen(false)}
        >
          <Pressable
            style={[styles.modalSheet, isDesktop && [desktopSheet, styles.modalSheetDesk]]}
            onPress={() => {}}
          >
            {!isDesktop ? <View style={styles.sheetHandle} /> : null}
            <Text style={[styles.modalTitle, isDesktop && styles.modalTitleDesk]}>Ny ønskeliste</Text>
            <TextInput
              style={[styles.input, isDesktop && styles.inputDesk]}
              placeholder="Navn på listen…"
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />

            {!onChildPage && memberOptions.length > 0 && (
              <>
                <Text style={styles.fieldLabel}>Hvem er listen for?</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 12, flexGrow: 0 }}
                  contentContainerStyle={styles.chipRow}
                >
                  {memberOptions.map((o) => {
                    const on = forMemberKey === o.key;
                    const label = o.isFamily
                      ? 'Familien'
                      : (o.isSelf ? 'Meg' : (o.name?.split(' ')[0] || o.name));
                    return (
                      <TouchableOpacity
                        key={o.key}
                        style={[styles.chip, on && styles.chipOn]}
                        onPress={() => {
                          setForMemberKey(o.key);
                          if (
                            !newName.trim()
                            || newName === 'Ønskelisten min'
                            || newName === 'Ønskeliste'
                            || newName === 'Familiens ønskeliste'
                          ) {
                            setNewName(o.isFamily
                              ? 'Familiens ønskeliste'
                              : (o.isSelf
                                ? 'Ønskelisten min'
                                : `${(o.name || '').split(' ')[0]} ønskeliste`));
                          }
                        }}
                      >
                        <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {!!selectedOption?.isFamily && (
                  <Text style={styles.fieldHint}>
                    Felles liste for hele familien. Alle kan legge inn og redigere ønsker.
                  </Text>
                )}
                {!!selectedOption?.isSelf && (
                  <Text style={styles.fieldHint}>
                    Listen er privat til du deler den. Eieren ser aldri hvem som reserverer eller kjøper.
                  </Text>
                )}
                {!!selectedOption && !selectedOption.isSelf && !selectedOption.isFamily && (
                  <Text style={styles.fieldHint}>
                    Listen tilhører {selectedOption.name}. Du kan fylle inn ønsker. Deling styres av eieren.
                  </Text>
                )}
              </>
            )}

            {onChildPage && (
              <Text style={styles.fieldHint}>
                Listen tilhører {childFirstName}. Familien kan se og reservere, men ikke endre ønskene uten å være på denne siden.
              </Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, isDesktop && styles.modalBtnDesk]}
                onPress={() => setCreateOpen(false)}
                disabled={creating}
              >
                <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  isDesktop && styles.modalBtnDesk,
                  (!newName.trim() || creating) && { opacity: 0.5 },
                ]}
                onPress={createNew}
                disabled={!newName.trim() || creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnTxt}>Opprett</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, zIndex: 1, backgroundColor: 'transparent' },
  hub: { flexGrow: 1, padding: 16, gap: 12, paddingBottom: 16 },
  hubDesk: { padding: 12, gap: 10, paddingBottom: 12 },

  deskAddWrap: { alignSelf: 'flex-start', marginBottom: 2 },

  panel: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  panelDesk: { borderRadius: 8, padding: 10 },
  listSection: {
    fontWeight: '400',
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  listSectionDesk: { fontWeight: '500', fontSize: 11, marginBottom: 4 },
  familyHint: {
    color: colors.muted,
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 4,
  },
  emptyInline: {
    color: colors.muted,
    fontWeight: '400',
    fontSize: 13,
    paddingVertical: 10,
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  listRowDesk: { paddingVertical: 8, gap: 8 },
  listIcon: {
    width: 36, height: 36, borderRadius: 9, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  listIconDesk: { width: 32, height: 32, borderRadius: 7 },
  kidAvatar: { borderRadius: 18, backgroundColor: 'transparent' },
  kidAvatarDesk: { borderRadius: 16, backgroundColor: 'transparent' },
  listIconImg: { width: '100%', height: '100%' },
  listName: { fontWeight: '400', fontSize: 14, color: colors.ink },
  listNameDesk: { fontWeight: '500', fontSize: 13 },
  listMeta: { color: colors.muted, fontWeight: '400', fontSize: 12, marginTop: 2 },
  listMetaDesk: { fontSize: 11 },
  lockPill: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center',
  },

  kidBlock: { paddingTop: 2 },
  kidBlockBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    marginTop: 2,
  },
  kidHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  kidName: { fontWeight: '400', fontSize: 14, color: colors.ink },
  kidNameDesk: { fontWeight: '500', fontSize: 13 },
  kidMeta: { color: colors.muted, fontWeight: '400', fontSize: 12, marginTop: 1 },
  kidBody: { paddingLeft: 4, paddingBottom: 4 },
  kidActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingTop: 4,
    paddingBottom: 6,
    paddingLeft: 42,
  },
  kidActionLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kidActionTxt: { color: colors.brand, fontWeight: '500', fontSize: 12 },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 28,
  },
  modalSheetDesk: {
    maxWidth: 420, width: '100%',
    borderRadius: 12, marginBottom: 0, padding: 18, paddingBottom: 18,
  },
  sheetHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.line, marginBottom: 14,
  },
  modalTitle: { fontWeight: '400', fontSize: 17, color: colors.ink, marginBottom: 12 },
  modalTitleDesk: { fontWeight: '500', fontSize: 16, marginBottom: 10 },
  input: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.line,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontWeight: '400', color: colors.ink, marginBottom: 12,
  },
  inputDesk: { paddingVertical: 8, fontSize: 14, borderRadius: 8 },
  fieldLabel: { fontWeight: '500', color: colors.muted, fontSize: 12, marginBottom: 8 },
  fieldHint: { color: colors.muted, fontWeight: '400', fontSize: 12, marginBottom: 12, lineHeight: 18 },
  chipRow: { gap: 6, alignItems: 'center', height: 32 },
  chip: {
    height: 28, paddingHorizontal: 12, borderRadius: 7,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontWeight: '500', color: colors.ink, fontSize: 12 },
  chipTxtOn: { color: '#fff' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  primaryBtn: {
    flex: 1, backgroundColor: colors.brand, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '400' },
  secondaryBtn: {
    flex: 1, backgroundColor: colors.brandSoft, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '400' },
  modalBtnDesk: { paddingVertical: 10, borderRadius: 8 },
});
