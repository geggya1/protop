import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, useLayout } from '../../src/theme';
import { Screen, Title, Mute } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import EdgeSwipeBack from '../../components/EdgeSwipeBack';
import { getCustomFolders, isPrivateFolder, isFamilyFolder } from '../../src/utils/familyDocuments';

function FolderRow({ folder, fileCount, onPress, isDesktop }) {
  const shared = isFamilyFolder(folder);
  const privateOnly = isPrivateFolder(folder);
  const badge = shared ? 'Delt' : privateOnly ? 'Privat' : 'Delt';
  return (
    <TouchableOpacity
      style={[styles.folderRow, isDesktop && styles.folderRowDesk]}
      onPress={onPress}
      accessibilityRole="button"
      activeOpacity={0.75}
    >
      <View style={[styles.folderIcon, isDesktop && styles.folderIconDesk, { backgroundColor: `${folder.color || '#0ea5e9'}18` }]}>
        <Text style={styles.folderEmoji}>{folder.emoji || '📁'}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.folderName, isDesktop && styles.folderNameDesk]} numberOfLines={1}>
          {folder.name}
        </Text>
        <Text style={styles.folderMeta}>
          {fileCount == null ? '…' : fileCount === 0 ? 'Tom' : `${fileCount} fil${fileCount === 1 ? '' : 'er'}`}
          {` · ${badge}`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  );
}

/** Shared-with-you section — no default upload root. */
export default function DocumentsSectionScreen({
  section, sectionTitle, folders, fileCounts, uid, onBack, onOpenFolder,
}) {
  const { isDesktop } = useLayout();
  const items = getCustomFolders(folders, section, uid);

  return (
    <Screen>
      <View style={[styles.backWrap, isDesktop && styles.backWrapDesk]}>
        <CompactBackLink onPress={onBack} label="Dokumenter" />
      </View>
      <EdgeSwipeBack onBack={onBack}>
        <ScrollView
          contentContainerStyle={[styles.hub, isDesktop && styles.hubDesk]}
          showsVerticalScrollIndicator={false}
        >
          {!isDesktop ? (
            <>
              <Title size={22}>{sectionTitle}</Title>
              <Mute>Mapper andre familiemedlemmer har delt med deg.</Mute>
            </>
          ) : null}

          <View style={[styles.panel, isDesktop && styles.panelDesk]}>
            <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>Mapper</Text>
            {items.length ? (
              items.map((f) => (
                <FolderRow
                  key={f.id}
                  folder={f}
                  fileCount={fileCounts[f.id]}
                  isDesktop={isDesktop}
                  onPress={() => onOpenFolder(f.id)}
                />
              ))
            ) : (
              <Text style={styles.emptyInline}>Ingen mapper delt med deg ennå.</Text>
            )}
          </View>
        </ScrollView>
      </EdgeSwipeBack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backWrap: { paddingHorizontal: 16, paddingTop: 8, zIndex: 2 },
  backWrapDesk: { paddingHorizontal: 12, paddingTop: 4 },
  hub: { flexGrow: 1, padding: 16, gap: 12, paddingBottom: 28 },
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
    fontWeight: '400',
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  listSectionDesk: { fontWeight: '500', fontSize: 11, marginBottom: 2 },
  emptyInline: {
    color: colors.muted,
    fontWeight: '400',
    fontSize: 13,
    paddingVertical: 10,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  folderRowDesk: { paddingVertical: 8, gap: 8 },
  folderIcon: {
    width: 36, height: 36, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  folderIconDesk: { width: 32, height: 32, borderRadius: 7 },
  folderEmoji: { fontSize: 16 },
  folderName: { fontWeight: '400', fontSize: 14, color: colors.ink },
  folderNameDesk: { fontWeight: '500', fontSize: 13 },
  folderMeta: { fontSize: 12, color: colors.muted, fontWeight: '400', marginTop: 2 },
});
