import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, ScrollView,
  Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { Screen, Mute } from '../../components/ui';
import { InfoDialog } from '../../components/ConfirmDialog';
import ShellAddButton from '../../components/ShellAddButton';
import HelpTarget from '../../components/HelpTarget';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import {
  listenAccessibleLists, createList, migrateLegacyShoppingList, repairShoppingLists,
  memberSummary, isPrivateList, filterListsForProfile, scopeFromList,
  listenListItems,
} from '../../src/utils/shoppingLists';
import { useShopFamilyIds } from '../../src/hooks/useShopFamilyIds';
import ShoppingListScreen from './ShoppingListScreen';
import ShoppingListSettingsScreen from './ShoppingListSettingsScreen';
import { ModulePageFrame } from '../../components/ModulePageBg';
import IconBadge from '../../components/IconBadge';

function Frame({ inShell, children }) {
  if (inShell) return <View style={styles.shellFrame}>{children}</View>;
  return <Screen>{children}</Screen>;
}

export default function ShoppingListHubScreen({
  compactHeader = false, profileChildId = null, inShell = false,
}) {
  const {
    familyId, uid, members, families, friendPeople, isParent, shellIntent, clearShellIntent,
  } = useApp();
  const { isDesktop } = useLayout();
  const [lists, setLists] = useState([]);
  const [archivedLists, setArchivedLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [view, setView] = useState('hub');
  const [activeListId, setActiveListId] = useState(null);
  const [activeListMeta, setActiveListMeta] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [openByList, setOpenByList] = useState({});
  useHelpScene(view === 'hub' ? 'hub' : 'inner');

  const memberList = members || [];
  const myName = memberList.find((m) => m.uid === uid)?.name || '';

  const listenIds = useShopFamilyIds(families, familyId);

  const visibleLists = useMemo(
    () => filterListsForProfile(lists, profileChildId),
    [lists, profileChildId],
  );

  const visibleArchivedLists = useMemo(
    () => filterListsForProfile(archivedLists, profileChildId),
    [archivedLists, profileChildId],
  );

  const activeScope = useMemo(() => {
    if (activeListMeta) return scopeFromList(activeListMeta, { familyId, uid });
    if (activeListId && familyId) return { personal: false, familyId, listId: activeListId };
    if (activeListId && uid) return { personal: true, ownerUid: uid, listId: activeListId };
    return null;
  }, [activeListMeta, activeListId, familyId, uid]);

  useEffect(() => {
    if (!uid || !isParent || !listenIds.length) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await repairShoppingLists(listenIds, uid);
        if (!cancelled && familyId) {
          await migrateLegacyShoppingList(familyId, uid, myName);
        }
      } catch (err) {
        console.warn('[ShoppingListHub] repair failed', err?.message || err);
      }
    })();
    return () => { cancelled = true; };
  }, [listenIds, familyId, uid, isParent]);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return undefined;
    }
    return listenAccessibleLists(listenIds, uid, {
      includeArchived: false,
      platforms: families,
    }, (data) => {
      setLists(data);
      setLoading(false);
    });
  }, [listenIds, uid]);

  useEffect(() => {
    if (!uid || !showArchived) return undefined;
    return listenAccessibleLists(listenIds, uid, {
      includeArchived: true,
      platforms: families,
    }, (data) => {
      setArchivedLists(data.filter((l) => l.archived));
    });
  }, [listenIds, uid, showArchived]);

  useEffect(() => {
    if (!uid || !visibleLists.length) {
      setOpenByList({});
      return undefined;
    }
    const unsubs = {};
    const openMap = {};
    visibleLists.forEach((list) => {
      if (list?.id) openMap[list.id] = 0;
    });
    let cancelled = false;
    const publish = () => {
      if (!cancelled) setOpenByList({ ...openMap });
    };
    publish();
    visibleLists.forEach((list) => {
      const scope = scopeFromList(list, { familyId, uid });
      if (!scope || !list?.id) return;
      unsubs[list.id] = listenListItems(scope, (items) => {
        openMap[list.id] = (items || []).filter((i) => !i.done && !i.deleted).length;
        publish();
      });
    });
    return () => {
      cancelled = true;
      Object.values(unsubs).forEach((u) => u?.());
    };
  }, [visibleLists, familyId, uid]);

  const openCreate = useCallback(() => {
    setNewName('');
    setCreateOpen(true);
  }, []);

  const closeCreate = useCallback(() => {
    if (creating) return;
    setCreateOpen(false);
  }, [creating]);

  const createNewList = useCallback(async () => {
    const name = newName.trim();
    if (!name || !uid) return;
    setCreating(true);
    try {
      const ref = await createList(familyId || null, uid, name, myName, profileChildId);
      setNewName('');
      setCreateOpen(false);
      const personal = ref.storage === 'personal' || ref.personal === true;
      const meta = {
        id: ref.id,
        storage: personal ? 'personal' : 'family',
        personal,
        ownerUid: uid,
        familyId: ref.familyId || (!personal ? familyId : null),
        createdBy: uid,
        name,
        memberIds: [uid],
        visibility: 'private',
      };
      setActiveListMeta(meta);
      setActiveListId(ref.id);
      setView('list');
    } catch (e) {
      setDialog({ title: 'Feil', message: e?.message || 'Klarte ikke opprette listen.' });
    } finally {
      setCreating(false);
    }
  }, [newName, familyId, uid, myName, profileChildId]);

  useEffect(() => {
    const openId = shellIntent?.openListId;
    if (openId) {
      const found = lists.find((l) => l.id === openId);
      setActiveListMeta(found || { id: openId, personal: false, familyId });
      setActiveListId(openId);
      setView('list');
      clearShellIntent?.();
      return;
    }
    if (shellIntent !== 'create' || !uid || !isParent) return;
    clearShellIntent?.();
    setCreateOpen(true);
  }, [shellIntent, familyId, uid, isParent, clearShellIntent, lists]);

  const openList = useCallback((item) => {
    setActiveListMeta(item);
    setActiveListId(item.id);
    setView('list');
  }, []);

  const showHubAdd = isParent && !createOpen && view === 'hub';
  const shellListBtn = useMemo(() => {
    if (!showHubAdd) return null;
    return <ShellAddButton label="Ny handleliste" onPress={openCreate} />;
  }, [isDesktop, showHubAdd, openCreate]);
  useShellTitleRight(shellListBtn, { active: view === 'hub' });

  if (!isParent) {
    return (
      <Frame inShell={inShell}>
        <View style={{ padding: 16 }}>
          <Mute>Handlelister er kun tilgjengelig for foresatte.</Mute>
        </View>
      </Frame>
    );
  }

  if (view === 'list' && activeListId && activeScope) {
    return (
      <ShoppingListScreen
        listId={activeListId}
        listScope={activeScope}
        inShell={inShell}
        onBack={() => { setView('hub'); setActiveListId(null); setActiveListMeta(null); }}
        onOpenSettings={() => setView('settings')}
      />
    );
  }

  if (view === 'settings' && activeListId && activeScope) {
    return (
      <ShoppingListSettingsScreen
        listId={activeListId}
        listScope={activeScope}
        inShell={inShell}
        onBack={() => setView('list')}
        onDeleted={() => { setView('hub'); setActiveListId(null); setActiveListMeta(null); }}
        onScopeChanged={(nextList) => {
          if (nextList) {
            setActiveListMeta(nextList);
            setActiveListId(nextList.id);
          }
        }}
      />
    );
  }

  const renderList = (item) => {
    const privateList = isPrivateList(item);
    const fromFriend = !!item.sharedFromFriend;
    const otherFamily = !privateList
      && !fromFriend
      && item.familyId
      && familyId
      && item.familyId !== familyId;
    const shareLabel = privateList
      ? 'Privat · følger deg'
      : (fromFriend ? 'Delt av venn' : 'Delt');
    return (
      <TouchableOpacity
        key={`${item.storage || 'x'}-${item.id}`}
        style={[styles.noteRow, isDesktop && styles.noteRowDesk]}
        onPress={() => openList(item)}
        activeOpacity={0.75}
      >
        <View style={[styles.listIcon, isDesktop && styles.listIconDesk]}>
          <IconBadge count={openByList[item.id] || 0} size={isDesktop ? 13 : 14} offset={-4}>
            <Ionicons name="cart" size={isDesktop ? 16 : 20} color={colors.brand} />
          </IconBadge>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.listName, isDesktop && styles.listNameDesk]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.listMeta, isDesktop && styles.listMetaDesk]} numberOfLines={1}>
            {shareLabel}
            {otherFamily && item.sourcePlatformName
              ? ` · ${item.sourcePlatformName}`
              : (otherFamily ? ' · Annen familie' : '')}
            {item.createdByName ? ` · ${item.createdByName}` : ''}
            {!privateList ? ` · ${memberSummary(item, memberList, friendPeople)}` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </TouchableOpacity>
    );
  };

  return (
    <Frame inShell={inShell}>
      <ModulePageFrame name="shop">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.hub, isDesktop && styles.hubDesk]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
        ) : (
          <View style={[styles.panel, isDesktop && styles.panelDesk]}>
            <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>
              Mine lister
            </Text>
            {visibleLists.length === 0 ? (
              <Text style={styles.emptyInline}>
                {profileChildId
                  ? 'Ingen handlelister for denne profilen ennå.'
                  : 'Ingen handlelister ennå. Opprett en for å komme i gang.'}
              </Text>
            ) : (
              visibleLists.map((item, i) => (
                i === 0 ? (
                  <HelpTarget
                    key={`${item.storage || 'x'}-${item.id}`}
                    id="content"
                    onAdvance={() => openList(item)}
                  >
                    {renderList(item)}
                  </HelpTarget>
                ) : renderList(item)
              ))
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.archiveToggle, isDesktop && styles.archiveToggleDesk]}
          onPress={() => setShowArchived(!showArchived)}
        >
          <Ionicons name="archive-outline" size={16} color={colors.brand} />
          <Text style={[styles.archiveToggleTxt, isDesktop && styles.archiveToggleTxtDesk]}>
            {showArchived ? 'Skjul arkiverte' : 'Vis arkiverte lister'}
          </Text>
        </TouchableOpacity>

        {showArchived && (
          <View style={[styles.panel, isDesktop && styles.panelDesk, { marginTop: 4 }]}>
            <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>
              Arkiverte
            </Text>
            {visibleArchivedLists.length === 0 ? (
              <Text style={styles.emptyInline}>Ingen arkiverte lister.</Text>
            ) : (
              visibleArchivedLists.map((item) => renderList(item))
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={createOpen} animationType={isDesktop ? 'fade' : 'slide'} transparent onRequestClose={closeCreate}>
        <Pressable style={[styles.modalBackdrop, isDesktop && desktopOverlay]} onPress={closeCreate}>
          <Pressable
            style={[styles.modalSheet, isDesktop && [desktopSheet, styles.modalSheetDesk]]}
            onPress={() => {}}
          >
            {!isDesktop ? <View style={styles.sheetHandle} /> : null}
            <Text style={[styles.modalTitle, isDesktop && styles.modalTitleDesk]}>Ny handleliste</Text>
            <TextInput
              style={[styles.modalInput, isDesktop && styles.modalInputDesk]}
              value={newName}
              onChangeText={setNewName}
              placeholder="Navn på listen…"
              onSubmitEditing={createNewList}
              returnKeyType="done"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, isDesktop && styles.modalBtnDesk]}
                onPress={closeCreate}
                disabled={creating}
              >
                <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, isDesktop && styles.modalBtnDesk, (!newName.trim() || creating) && { opacity: 0.5 }]}
                onPress={createNewList}
                disabled={!newName.trim() || creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryBtnTxt}>Opprett</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <InfoDialog
        visible={!!dialog}
        title={dialog?.title}
        message={dialog?.message}
        onClose={() => setDialog(null)}
      />
      </ModulePageFrame>
    </Frame>
  );
}

const styles = StyleSheet.create({
  shellFrame: { flex: 1, minHeight: 0 },
  bgWrap: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 10,
    zIndex: 0,
  },
  bgArt: {
    width: '100%',
    height: '100%',
    opacity: 0.88,
  },
  scroll: { flex: 1, minHeight: 0, zIndex: 1, backgroundColor: 'transparent' },
  hub: { flexGrow: 1, padding: 16, gap: 12 },
  hubDesk: { padding: 12, gap: 10 },
  panel: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  panelDesk: { borderRadius: 8, padding: 10 },
  listSection: {
    fontWeight: '600',
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  listSectionDesk: { fontWeight: '500', fontSize: 11, marginBottom: 6 },
  emptyInline: {
    color: colors.muted,
    fontWeight: '400',
    fontSize: 13,
    paddingVertical: 10,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  noteRowDesk: { paddingVertical: 8, gap: 8 },
  listIcon: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center', overflow: 'visible',
  },
  listIconDesk: { width: 32, height: 32, borderRadius: 7 },
  listName: { fontWeight: '600', fontSize: 15, color: colors.ink },
  listNameDesk: { fontWeight: '500', fontSize: 14 },
  listMeta: { color: colors.muted, fontWeight: '400', fontSize: 12, marginTop: 2 },
  listMetaDesk: { fontSize: 11 },
  archiveToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10,
  },
  archiveToggleDesk: { justifyContent: 'flex-start', paddingVertical: 6 },
  archiveToggleTxt: { fontWeight: '600', color: colors.brand, fontSize: 13 },
  archiveToggleTxtDesk: { fontWeight: '500', fontSize: 12 },
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
  modalTitle: { fontWeight: '600', fontSize: 17, color: colors.ink, marginBottom: 12 },
  modalTitleDesk: { fontWeight: '500', fontSize: 16, marginBottom: 10 },
  modalInput: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.line,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontWeight: '400', color: colors.ink, marginBottom: 16,
  },
  modalInputDesk: { paddingVertical: 8, fontSize: 14, borderRadius: 8 },
  modalActions: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    flex: 1, backgroundColor: colors.brand, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '600' },
  secondaryBtn: {
    flex: 1, backgroundColor: colors.brandSoft, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '600' },
  modalBtnDesk: { paddingVertical: 10, borderRadius: 8 },
});
