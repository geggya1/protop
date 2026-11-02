import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OptionPicker from '../OptionPicker';
import { PROJECT_ROLES } from '../../src/arbeid/roles.js';
import { allocateMembers, listPartnerEmployees } from '../../src/intercompany/client';
import { settingsSummary } from '../../src/intercompany/model';

/**
 * Tildel medarbeidere fra et tilknyttet selskap på prosjektet. Personene blir innleide
 * deltakere her, og hjemmeselskapet får en kopi av prosjektet med samme nummer, der de fører timer.
 * links: aktive avtaler sett fra dette selskapet (useIntercompanyLinks().active).
 * onAllocated({ members, project }): radene serveren skrev hos oss.
 */
export default function AllocatePartnerDialog({ visible, onClose, links = [], familyId, project, colors, onAllocated }) {
  const [linkId, setLinkId] = useState('');
  const [people, setPeople] = useState([]);
  const [picked, setPicked] = useState(() => new Set());
  const [role, setRole] = useState('Prosjektmedlem');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setError('');
    setPicked(new Set());
    if (links.length === 1) setLinkId(links[0].id);
  }, [visible, links]);

  useEffect(() => {
    if (!visible || !linkId) {
      setPeople([]);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    setError('');
    listPartnerEmployees({ companyId: familyId, linkId })
      .then((res) => { if (alive) setPeople(res.employees || []); })
      .catch((cause) => { if (alive) setError(cause?.message || 'Kunne ikke hente medarbeiderne.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [visible, linkId, familyId]);

  const link = links.find((row) => row.id === linkId) || null;

  function toggle(id) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!link || !picked.size) {
      setError('Velg minst én medarbeider.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await allocateMembers({ companyId: familyId, linkId: link.id, projectId: project.id, employeeIds: [...picked], role });
      onAllocated?.(res, link);
      onClose?.();
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke tildele medarbeiderne.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.bg} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]} nativeID="ic-allocate">
          <Text style={[styles.title, { color: colors.ink }]}>Fra tilknyttet selskap</Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 10 }}>
            {`Personene fører timer i sitt eget selskap på en kopi av prosjekt ${project?.number || ''}. Timene godkjennes der først, og kommer så til godkjenning her.`}
          </Text>
          {links.length > 1 ? (
            <View style={styles.chips}>
              {links.map((row) => {
                const on = row.id === linkId;
                return (
                  <TouchableOpacity
                    key={row.id}
                    onPress={() => setLinkId(row.id)}
                    style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
                  >
                    <Text style={{ color: on ? colors.brand : colors.ink }}>{row.partner.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          {link ? <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>{`${link.partner.name} · ${settingsSummary(link.settings)}`}</Text> : null}
          {loading ? <ActivityIndicator color={colors.brand} /> : null}
          <ScrollView style={{ maxHeight: 260 }}>
            {people.map((row) => {
              const on = picked.has(row.id);
              return (
                <TouchableOpacity
                  key={row.id}
                  onPress={() => toggle(row.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={[styles.row, { borderColor: colors.line }]}
                >
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.brand : colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontWeight: on ? '600' : '400' }}>{row.name}</Text>
                    {row.title ? <Text style={{ color: colors.muted, fontSize: 12 }}>{row.title}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
            {link && !loading && !people.length && !error ? (
              <Text style={{ color: colors.muted }}>Ingen aktive ansatte å tildele.</Text>
            ) : null}
          </ScrollView>
          <Text style={{ color: colors.muted, marginTop: 10, marginBottom: 6 }}>Rolle</Text>
          <OptionPicker options={PROJECT_ROLES} value={role} onChange={(r) => { if (r) setRole(r); }} title="Rolle" clearable={false} small />
          {error ? <Text style={{ color: colors.danger, marginTop: 8 }}>{error}</Text> : null}
          <View style={styles.buttons}>
            <TouchableOpacity onPress={onClose} style={[styles.ghost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, textAlign: 'center' }}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              nativeID="ic-allocate-save"
              onPress={save}
              disabled={saving || !picked.size}
              style={[styles.primary, { backgroundColor: colors.brand, opacity: saving || !picked.size ? 0.6 : 1 }]}
            >
              <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>
                {saving ? 'Tildeler…' : `Tildel${picked.size ? ` ${picked.size}` : ''}`}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 460, borderWidth: 1, borderRadius: 12, padding: 16 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 16 },
  ghost: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 10 },
  primary: { flex: 1, borderRadius: 8, paddingVertical: 10 },
});
