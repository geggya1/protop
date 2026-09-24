import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { Screen, Title, Mute } from '../../components/ui';
import { ModulePageFrame, ModuleBgSpacer } from '../../components/ModulePageBg';
import { AvatarBubble } from '../../components/AvatarPicker';
import HelpTarget from '../../components/HelpTarget';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import {
  listenAccessibleFolders, ensureDefaultFolders, ensureChildDocumentFolders,
  groupFolders, getDefaultFolder, getCustomFolders, listenFolderFiles,
  syncFamilyFolderMembers, fetchAccessibleFolders,
} from '../../src/utils/familyDocuments';
import DocumentFolderScreen from './DocumentFolderScreen';
import DocumentFolderSettingsScreen from './DocumentFolderSettingsScreen';
import DocumentsSectionScreen from './DocumentsSectionScreen';


const AREA_META = {
  family: { title: 'Familie', icon: 'heart', color: '#3b82f6' },
  personal: { title: 'Personlig', icon: 'lock-closed', color: '#64748b' },
  shared: { title: 'Delt med deg', icon: 'folder-open', color: '#0ea5e9' },
};

function AreaRow({ title, icon, color, summary, onPress, isDesktop, avatar }) {
  return (
    <TouchableOpacity
      style={[styles.areaRow, isDesktop && styles.areaRowDesk]}
      onPress={onPress}
      accessibilityRole="button"
      activeOpacity={0.75}
    >
      {avatar || (
        <View style={[styles.areaIcon, isDesktop && styles.areaIconDesk, { backgroundColor: `${color}18` }]}>
          <Ionicons name={icon} size={isDesktop ? 15 : 17} color={color} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.areaTitle, isDesktop && styles.areaTitleDesk]}>{title}</Text>
        <Text style={[styles.areaMeta, isDesktop && styles.areaMetaDesk]} numberOfLines={1}>
          {summary}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  );
}

function sectionSummary(section, folders, fileCounts, uid, childId = null) {
  if (section === 'shared') {
    const items = getCustomFolders(folders, section, uid);
    if (!items.length) return 'Ingen mapper';
    const totalFiles = items.reduce((n, f) => n + (fileCounts[f.id] || 0), 0);
    const folderPart = `${items.length} mappe${items.length === 1 ? '' : 'r'}`;
    return totalFiles ? `${folderPart} · ${totalFiles} fil${totalFiles === 1 ? '' : 'er'}` : folderPart;
  }
  const def = getDefaultFolder(folders, section, uid, childId);
  const custom = getCustomFolders(folders, section, uid, childId);
  const directFiles = def ? (fileCounts[def.id] || 0) : 0;
  const parts = [];
  if (directFiles) parts.push(`${directFiles} fil${directFiles === 1 ? '' : 'er'}`);
  if (custom.length) parts.push(`${custom.length} mappe${custom.length === 1 ? '' : 'r'}`);
  return parts.length ? parts.join(' · ') : 'Tom — last opp filer';
}

export default function DocumentsHubScreen({ inShell = false, onBack = null }) {
  const { isDesktop } = useLayout();
  const { familyId, uid, members, kids, isParent, isActingAsChild } = useApp();
  const [folders, setFolders] = useState([]);
  const [fileCounts, setFileCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('hub');
  const [activeSection, setActiveSection] = useState(null);
  const [activeChildId, setActiveChildId] = useState(null);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [folderStack, setFolderStack] = useState([]);
  useHelpScene(view === 'hub' ? 'hub' : 'inner');

  const myName = members.find((m) => m.uid === uid)?.name || '';
  const allMemberUids = useMemo(
    () => [...new Set(members.map((m) => m.uid).filter(Boolean))],
    [members],
  );
  const parentUids = useMemo(
    () => [...new Set(
      (members || [])
        .filter((m) => m.role !== 'child')
        .map((m) => m.uid)
        .filter(Boolean),
    )],
    [members],
  );
  const activeKids = useMemo(
    () => (kids || []).filter((k) => k.active !== false && k.archived !== true),
    [kids],
  );
  const showKids = isParent && !isActingAsChild && activeKids.length > 0;

  useEffect(() => {
    if (!familyId || !uid) return;
    ensureDefaultFolders(familyId, uid, myName, allMemberUids)
      .then(() => syncFamilyFolderMembers(familyId, allMemberUids))
      .then(() => {
        if (!showKids) return null;
        return ensureChildDocumentFolders({
          familyId,
          kids: activeKids,
          createdByUid: uid,
          creatorName: myName,
          parentUids,
        });
      })
      .catch(() => {});
  }, [familyId, uid, myName, allMemberUids, showKids, activeKids, parentUids]);

  useEffect(() => {
    if (!familyId || !uid) return undefined;
    return listenAccessibleFolders(familyId, uid, (data) => {
      setFolders(data);
      setLoading(false);
    });
  }, [familyId, uid]);

  useEffect(() => {
    if (!familyId || !folders.length) return undefined;
    const unsubs = folders.map((f) => listenFolderFiles(familyId, f.id, (files) => {
      setFileCounts((prev) => (
        prev[f.id] === files.length ? prev : { ...prev, [f.id]: files.length }
      ));
    }));
    return () => unsubs.forEach((u) => u());
  }, [familyId, folders]);

  const grouped = useMemo(() => groupFolders(folders, uid), [folders, uid]);

  const sectionMeta = useMemo(() => {
    if (!activeSection) return null;
    if (activeSection === 'child' && activeChildId) {
      const kid = activeKids.find((k) => k.id === activeChildId);
      const name = kid?.name?.split(' ')[0] || 'Barn';
      return { title: name, icon: 'person', color: '#8b5cf6' };
    }
    return AREA_META[activeSection] || null;
  }, [activeSection, activeChildId, activeKids]);

  const openSection = async (section) => {
    setActiveSection(section);
    setActiveChildId(null);
    if (section === 'shared') {
      setView('section');
      setActiveFolderId(null);
      setFolderStack([]);
      return;
    }
    let def = getDefaultFolder(folders, section, uid);
    if (!def && familyId && uid) {
      try {
        await ensureDefaultFolders(familyId, uid, myName, allMemberUids);
        await syncFamilyFolderMembers(familyId, allMemberUids);
        const fresh = await fetchAccessibleFolders(familyId, uid);
        setFolders(fresh);
        def = getDefaultFolder(fresh, section, uid);
      } catch { /* ignore — listener oppdaterer */ }
    }
    if (!def) return;
    setActiveFolderId(def.id);
    setFolderStack([]);
    setView('folder');
  };

  const openChild = async (kid) => {
    let def = getDefaultFolder(folders, 'child', uid, kid.id);
    if (!def && familyId && uid) {
      try {
        await ensureChildDocumentFolders({
          familyId,
          kids: activeKids,
          createdByUid: uid,
          creatorName: myName,
          parentUids,
        });
        const fresh = await fetchAccessibleFolders(familyId, uid);
        setFolders(fresh);
        def = getDefaultFolder(fresh, 'child', uid, kid.id);
      } catch { /* ignore */ }
    }
    if (!def) return;
    setActiveSection('child');
    setActiveChildId(kid.id);
    setActiveFolderId(def.id);
    setFolderStack([]);
    setView('folder');
  };

  const openSubfolder = (folderId) => {
    setFolderStack((prev) => (activeFolderId ? [...prev, activeFolderId] : prev));
    setActiveFolderId(folderId);
  };

  const backFromFolder = useCallback(() => {
    if (folderStack.length) {
      const next = [...folderStack];
      const prevId = next.pop();
      setFolderStack(next);
      setActiveFolderId(prevId);
      return;
    }
    // Fra rotmappe i «Delt med deg» → tilbake til seksjonslisten, ikke hele hubben.
    if (activeSection === 'shared') {
      setView('section');
      setActiveFolderId(null);
      return;
    }
    setView('hub');
    setActiveSection(null);
    setActiveChildId(null);
    setActiveFolderId(null);
  }, [folderStack, activeSection]);

  const openFolderSettings = useCallback(() => setView('settings'), []);

  // Rotmappe skal alltid si «Dokumenter» (ikke barnets/seksjonens navn — det forvirrer og føles som no-op).
  const folderBackLabel = folderStack.length
    ? (folders.find((f) => f.id === folderStack[folderStack.length - 1])?.name || 'Dokumenter')
    : 'Dokumenter';

  if (view === 'folder' && activeFolderId) {
    return (
      <DocumentFolderScreen
        folderId={activeFolderId}
        allFolders={folders}
        section={activeSection}
        childId={activeChildId}
        fileCounts={fileCounts}
        backLabel={folderBackLabel}
        onBack={backFromFolder}
        onOpenSubfolder={openSubfolder}
        onOpenSettings={openFolderSettings}
      />
    );
  }

  if (view === 'settings' && activeFolderId) {
    return (
      <DocumentFolderSettingsScreen
        folderId={activeFolderId}
        onBack={() => setView('folder')}
        onDeleted={backFromFolder}
      />
    );
  }

  if (view === 'section' && activeSection === 'shared' && sectionMeta) {
    return (
      <DocumentsSectionScreen
        section={activeSection}
        sectionTitle={sectionMeta.title}
        folders={folders}
        fileCounts={fileCounts}
        uid={uid}
        onBack={() => { setView('hub'); setActiveSection(null); }}
        onOpenFolder={(folderId) => {
          setFolderStack([]);
          setActiveFolderId(folderId);
          setView('folder');
        }}
      />
    );
  }

  return (
    <Screen style={styles.screenRoot}>
      <ModulePageFrame name="documents">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.hub, isDesktop && styles.hubDesk]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!inShell && !isDesktop ? (
          <>
            <Title size={20}>Dokumenter</Title>
            <Mute>Familie, personlig og barnas mapper.</Mute>
          </>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
        ) : (
          <>
            <View style={[styles.panel, isDesktop && styles.panelDesk]}>
              <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>Områder</Text>
              <HelpTarget id="content" onAdvance={() => openSection('family')}>
                <AreaRow
                  title={AREA_META.family.title}
                  icon={AREA_META.family.icon}
                  color={AREA_META.family.color}
                  summary={sectionSummary('family', folders, fileCounts, uid)}
                  onPress={() => openSection('family')}
                  isDesktop={isDesktop}
                />
              </HelpTarget>
              <AreaRow
                title={AREA_META.personal.title}
                icon={AREA_META.personal.icon}
                color={AREA_META.personal.color}
                summary={sectionSummary('personal', folders, fileCounts, uid)}
                onPress={() => openSection('personal')}
                isDesktop={isDesktop}
              />
              {grouped.shared.length ? (
                <AreaRow
                  title={AREA_META.shared.title}
                  icon={AREA_META.shared.icon}
                  color={AREA_META.shared.color}
                  summary={sectionSummary('shared', folders, fileCounts, uid)}
                  onPress={() => openSection('shared')}
                  isDesktop={isDesktop}
                />
              ) : null}
            </View>

            {showKids ? (
              <View style={[styles.panel, isDesktop && styles.panelDesk, { marginTop: 10 }]}>
                <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>Barn</Text>
                {activeKids.map((kid) => {
                  const first = kid.name?.split(' ')[0] || 'Barn';
                  return (
                    <AreaRow
                      key={kid.id}
                      title={first}
                      icon="person"
                      color="#8b5cf6"
                      summary={sectionSummary('child', folders, fileCounts, uid, kid.id)}
                      onPress={() => openChild(kid)}
                      isDesktop={isDesktop}
                      avatar={(
                        <AvatarBubble
                          avatarId={kid.avatarId}
                          photoURL={kid.photoURL || kid.photoUrl}
                          name={kid.name}
                          size={isDesktop ? 32 : 36}
                        />
                      )}
                    />
                  );
                })}
              </View>
            ) : null}
          </>
        )}
      <ModuleBgSpacer />
      </ScrollView>
      </ModulePageFrame>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenRoot: { zIndex: 1 },
  scroll: { flex: 1, zIndex: 1, backgroundColor: 'transparent' },
  hub: { flexGrow: 1, padding: 16, gap: 10, paddingBottom: 120 },
  hubDesk: { padding: 12, gap: 8 },
  panel: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 12,
  },
  panelDesk: { borderRadius: 8, padding: 10 },
  listSection: {
    fontWeight: '600',
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  listSectionDesk: { fontWeight: '500', fontSize: 11, marginBottom: 2 },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  areaRowDesk: { paddingVertical: 8, gap: 8 },
  areaIcon: {
    width: 36, height: 36, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  areaIconDesk: { width: 32, height: 32, borderRadius: 7 },
  areaTitle: { fontSize: 14, fontWeight: '500', color: colors.ink },
  areaTitleDesk: { fontWeight: '500', fontSize: 13 },
  areaMeta: { fontSize: 12, color: colors.muted, fontWeight: '400', marginTop: 1 },
  areaMetaDesk: { fontSize: 11 },
});
