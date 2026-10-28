import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { pickDocument } from '../../src/utils/media';
import { confirmUser, notifyUser } from '../../src/utils/dialog';
import {
  createEmployeeFolder,
  deleteEmployeeFileEntry,
  listenEmployeeFiles,
  renameEmployeeFileEntry,
  uploadEmployeeFile,
} from '../../src/employees/employeeFiles';
import { folderChildren, folderTrail, formatEntrySize } from '../../src/employees/employeeFilesModel';
import { formatDate } from '../../src/format/nb';

/**
 * Filer på ansattsiden. Mapper, opplasting og navneendring for den som kan
 * redigere; sletting bare for Admin. Kvitteringer fra utlegg vises under.
 */
export default function EmployeeFilesView({
  companyId,
  employee,
  colors,
  uid = '',
  canEdit = false,
  canDelete = false,
  expenses = [],
}) {
  const employeeId = employee?.id || '';
  const [entries, setEntries] = useState([]);
  const [folderId, setFolderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newFolder, setNewFolder] = useState(null);
  const [renaming, setRenaming] = useState(null);

  useEffect(() => {
    setFolderId('');
    setNewFolder(null);
    setRenaming(null);
    return listenEmployeeFiles(companyId, employeeId, setEntries, () => setError('Kunne ikke hente filene.'));
  }, [companyId, employeeId]);

  const rows = useMemo(() => folderChildren(entries, folderId), [entries, folderId]);
  const trail = useMemo(() => folderTrail(entries, folderId), [entries, folderId]);
  const receipts = (expenses || []).filter((row) => row.employeeId === employeeId && (row.receiptName || row.description));

  async function run(task, fallback) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(e?.message || fallback);
    } finally {
      setBusy(false);
    }
  }

  function upload() {
    run(async () => {
      const picked = await pickDocument({ multiple: true });
      const list = Array.isArray(picked) ? picked : (picked ? [picked] : []);
      for (const file of list) {
        await uploadEmployeeFile(companyId, employeeId, file, { parentId: folderId, uid });
      }
    }, 'Kunne ikke laste opp filen.');
  }

  function saveFolder() {
    run(async () => {
      await createEmployeeFolder(companyId, employeeId, { name: newFolder, parentId: folderId, uid });
      setNewFolder(null);
    }, 'Kunne ikke opprette mappen.');
  }

  function saveRename() {
    run(async () => {
      await renameEmployeeFileEntry(companyId, renaming.id, renaming.name);
      setRenaming(null);
    }, 'Kunne ikke endre navnet.');
  }

  async function remove(entry) {
    const what = entry.kind === 'folder' ? `mappen «${entry.name}» med alt innhold` : `«${entry.name}»`;
    const ok = await confirmUser('Slett', `Vil du slette ${what}?`, { ok: 'Slett' });
    if (!ok) return;
    run(() => deleteEmployeeFileEntry(companyId, entries, entry, { uid }), 'Kunne ikke slette.');
  }

  function open(entry) {
    if (entry.kind === 'folder') {
      setFolderId(entry.id);
      setRenaming(null);
      return;
    }
    if (entry.url) Linking.openURL(entry.url).catch(() => notifyUser('Filer', 'Kunne ikke åpne filen.'));
  }

  return (
    <View nativeID="employee-files" style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.ink }]}>Filer</Text>
        {canEdit ? (
          <View style={styles.actions}>
            <TouchableOpacity
              nativeID="employee-files-new-folder"
              onPress={() => setNewFolder('')}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.ghostBtn, { borderColor: colors.line }]}
            >
              <Ionicons name="folder-outline" size={16} color={colors.ink} />
              <Text style={{ color: colors.ink, fontSize: 13 }}>Ny mappe</Text>
            </TouchableOpacity>
            <TouchableOpacity
              nativeID="employee-files-upload"
              onPress={upload}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.primaryBtn, { backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]}
            >
              <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13 }}>{busy ? 'Jobber…' : 'Last opp'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View style={styles.trail}>
        <TouchableOpacity onPress={() => setFolderId('')} accessibilityRole="button">
          <Text style={{ color: folderId ? colors.brand : colors.ink, fontSize: 13 }}>Alle filer</Text>
        </TouchableOpacity>
        {trail.map((step) => (
          <React.Fragment key={step.id}>
            <Text style={{ color: colors.muted, fontSize: 13 }}> / </Text>
            <TouchableOpacity onPress={() => setFolderId(step.id)} accessibilityRole="button">
              <Text style={{ color: step.id === folderId ? colors.ink : colors.brand, fontSize: 13 }}>{step.name}</Text>
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </View>

      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}

      {newFolder !== null ? (
        <View style={[styles.inlineRow, { borderColor: colors.line }]}>
          <Ionicons name="folder-outline" size={18} color={colors.brand} />
          <TextInput
            autoFocus
            value={newFolder}
            onChangeText={setNewFolder}
            onSubmitEditing={saveFolder}
            placeholder="Navn på mappen"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
          />
          <TouchableOpacity onPress={saveFolder} disabled={busy} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Opprett</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setNewFolder(null)} accessibilityRole="button">
            <Text style={{ color: colors.muted }}>Avbryt</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={[styles.list, { borderColor: colors.line, backgroundColor: colors.card }]}>
        {rows.map((entry, i) => (
          <View
            key={entry.id}
            style={[styles.row, i < rows.length - 1 && { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth }]}
          >
            <Ionicons
              name={entry.kind === 'folder' ? 'folder' : 'document-outline'}
              size={18}
              color={entry.kind === 'folder' ? colors.brand : colors.muted}
            />
            {renaming?.id === entry.id ? (
              <TextInput
                autoFocus
                value={renaming.name}
                onChangeText={(name) => setRenaming({ ...renaming, name })}
                onSubmitEditing={saveRename}
                onBlur={saveRename}
                style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
              />
            ) : (
              <TouchableOpacity onPress={() => open(entry)} accessibilityRole="button" style={styles.rowMain}>
                <Text style={{ color: colors.ink, fontSize: 14 }} numberOfLines={1}>{entry.name}</Text>
                {entry.kind === 'file' && formatEntrySize(entry.size) ? (
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{formatEntrySize(entry.size)}</Text>
                ) : null}
              </TouchableOpacity>
            )}
            {canEdit && renaming?.id !== entry.id ? (
              <TouchableOpacity
                onPress={() => setRenaming({ id: entry.id, name: entry.name })}
                hitSlop={8}
                accessibilityLabel={`Endre navn på ${entry.name}`}
              >
                <Ionicons name="pencil-outline" size={16} color={colors.muted} />
              </TouchableOpacity>
            ) : null}
            {canDelete ? (
              <TouchableOpacity onPress={() => remove(entry)} hitSlop={8} accessibilityLabel={`Slett ${entry.name}`}>
                <Ionicons name="trash-outline" size={16} color="#b91c1c" />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        {!rows.length ? (
          <Text style={{ color: colors.muted, padding: 12 }}>
            {folderId ? 'Mappen er tom.' : 'Ingen filer er lastet opp ennå.'}
          </Text>
        ) : null}
      </View>

      {receipts.length ? (
        <>
          <Text style={[styles.sub, { color: colors.ink }]}>Kvitteringer fra utlegg</Text>
          {receipts.map((row) => (
            <Text key={row.id} style={{ color: colors.ink, paddingVertical: 4 }}>
              {formatDate(row.date)} · {row.receiptName || row.description}
            </Text>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, width: '100%', maxWidth: 900 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  sub: { fontSize: 14, fontWeight: '600', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  trail: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  list: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14 },
});
