import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { defaultWorkSettings } from '../../src/arbeid/roles.js';
import { formatMoney } from '../../src/economy/invoices.js';
import { deleteTrip } from '../../src/economy/opsState';
import { addressFieldsFromPlace, projectAddressLabel } from '../../src/mileage/flow';
import { updateProject } from '../../src/project/engine.js';
import { searchPlaces } from '../../src/utils/location';
import { alertPhotoError, pickImage, uploadImage } from '../../src/utils/media';
import { showSaveToast } from '../../src/ui/saveToast';
import MileageWizard from '../../screens/economy/MileageWizard';

/**
 * Prosjektinnstillinger: bilde, datoer, adresse, kjøreturer, timeføring.
 * Holdes utenfor Hovedside slik at landingssiden forblir lesbar.
 */
export default function ProjectSettingsTab({
  state,
  project,
  customers = [],
  contracts = [],
  colors,
  isAdmin,
  // Begrenset redigering: bilde, periode og adresse.
  canEditBasics = false,
  familyId,
  onChangeState,
  onEditForm,
  onOpenAgreement,
}) {
  const canEdit = isAdmin || canEditBasics;
  const settings = defaultWorkSettings(project.workSettings);
  const [street, setStreet] = useState(project.street || '');
  const [postalCode, setPostalCode] = useState(project.postalCode || '');
  const [placeName, setPlaceName] = useState(project.placeName || '');
  const [start, setStart] = useState(project.start || '');
  const [end, setEnd] = useState(project.end || '');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [pendingDelete, setPendingDelete] = useState('');
  const [error, setError] = useState('');

  const trips = useMemo(
    () => (state.mileageTrips || [])
      .filter((row) => row.projectId === project.id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [state.mileageTrips, project.id],
  );

  useEffect(() => {
    setStreet(project.street || '');
    setPostalCode(project.postalCode || '');
    setPlaceName(project.placeName || '');
    setStart(project.start || '');
    setEnd(project.end || '');
  }, [project.id, project.street, project.postalCode, project.placeName, project.start, project.end]);

  useEffect(() => {
    const q = String(query || '').trim();
    if (q.length < 3) {
      setHits([]);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(() => {
      searchPlaces(q, 'nb').then((rows) => {
        if (live) setHits((rows || []).slice(0, 5));
      }).catch(() => {
        if (live) setHits([]);
      });
    }, 280);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  function apply(patch, toast = 'Lagret.') {
    const result = updateProject(state, project.id, patch);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    onChangeState(result.state);
    setError('');
    showSaveToast(toast);
    return true;
  }

  async function uploadCover() {
    if (!canEdit || !familyId || uploading) return;
    try {
      const picked = await pickImage({ edit: true, aspect: [16, 9] });
      if (!picked) return;
      setUploading(true);
      const path = `families/${familyId}/projects/${project.id}/cover_${Date.now()}.jpg`;
      const url = await uploadImage(path, picked);
      apply({ imageUrl: url }, 'Prosjektbildet er lagret.');
    } catch (err) {
      alertPhotoError(err);
    } finally {
      setUploading(false);
    }
  }

  function saveDates() {
    apply({ start, end }, 'Prosjektperioden er lagret.');
  }

  function saveAddress(fields) {
    apply({
      street: fields.street,
      postalCode: fields.postalCode,
      placeName: fields.placeName,
      place: [fields.street, [fields.postalCode, fields.placeName].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    }, 'Prosjektadressen er lagret.');
  }

  function applyHit(hit) {
    const fields = addressFieldsFromPlace(hit, hit.label);
    setStreet(fields.street);
    setPostalCode(fields.postalCode);
    setPlaceName(fields.placeName);
    setQuery('');
    setHits([]);
    saveAddress(fields);
  }

  function patchSettings(key, value) {
    apply({ workSettings: { ...settings, [key]: value } }, 'Innstilling lagret.');
  }

  function removeTrip(id, confirmed = false) {
    if (!confirmed && pendingDelete !== id) {
      setPendingDelete(id);
      return;
    }
    const result = deleteTrip(state, id);
    setPendingDelete('');
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChangeState(result.state);
    if (editingTrip?.id === id) setEditingTrip(null);
    showSaveToast('Turen er slettet.');
  }

  const currentAddress = projectAddressLabel({ street, postalCode, placeName, place: project.place });

  return (
    <View style={styles.wrap} nativeID="project-settings-tab">
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}

      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Text style={[styles.title, { color: colors.ink }]}>Prosjektbilde</Text>
        <TouchableOpacity
          onPress={uploadCover}
          disabled={!canEdit || uploading}
          style={[styles.cover, { borderColor: colors.line, backgroundColor: colors.sunken || colors.line }]}
          accessibilityRole="button"
          accessibilityLabel="Last opp prosjektbilde"
        >
          {project.imageUrl ? (
            <Image source={{ uri: project.imageUrl }} style={styles.coverImg} />
          ) : (
            <View style={styles.coverEmpty}>
              {uploading ? <ActivityIndicator color={colors.brand} /> : (
                <>
                  <Ionicons name="cloud-upload-outline" size={22} color={colors.muted} />
                  <Text style={{ color: colors.muted, fontSize: 12 }}>Klikk for å laste opp</Text>
                </>
              )}
            </View>
          )}
        </TouchableOpacity>
        {project.imageUrl && canEdit ? (
          <TouchableOpacity onPress={() => apply({ imageUrl: '' }, 'Bildet er fjernet.')} style={{ marginTop: 6 }}>
            <Text style={{ color: colors.danger || '#b42318', fontSize: 12 }}>Fjern bilde</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Text style={[styles.title, { color: colors.ink }]}>Prosjektperiode</Text>
        <View style={styles.row}>
          <View style={styles.field}>
            <Text style={{ color: colors.muted, fontSize: 11 }}>Startdato</Text>
            <TextInput
              editable={canEdit}
              value={start}
              onChangeText={setStart}
              placeholder="ÅÅÅÅ-MM-DD"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
              nativeID="project-settings-start"
            />
          </View>
          <View style={styles.field}>
            <Text style={{ color: colors.muted, fontSize: 11 }}>Sluttdato</Text>
            <TextInput
              editable={canEdit}
              value={end}
              onChangeText={setEnd}
              placeholder="ÅÅÅÅ-MM-DD"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
              nativeID="project-settings-end"
            />
          </View>
        </View>
        {canEdit ? (
          <TouchableOpacity onPress={saveDates} style={[styles.btn, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Lagre periode</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {isAdmin ? (
      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Text style={[styles.title, { color: colors.ink }]}>Avtale</Text>
        {project.contractId ? (
          <TouchableOpacity onPress={() => onOpenAgreement?.(project.contractId)} style={styles.linkRow}>
            <Ionicons name="document-text-outline" size={16} color={colors.brand} />
            <Text style={{ color: colors.brand, fontWeight: '600' }}>Åpne koblet avtale</Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ color: colors.danger || '#b45309', fontSize: 13 }}>
            Ingen avtale er koblet. Bruk «Rediger prosjekt» for å knytte avtale.
          </Text>
        )}
        {onEditForm ? (
          <TouchableOpacity onPress={onEditForm} style={[styles.ghost, { borderColor: colors.line, marginTop: 8 }]}>
            <Text style={{ color: colors.ink }}>Rediger prosjektfelt / avtalekobling</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      ) : null}

      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Text style={[styles.title, { color: colors.ink }]}>Prosjektadresse</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>
          {currentAddress || 'Ingen adresse lagret.'}
        </Text>
        <TextInput
          editable={canEdit}
          value={query}
          onChangeText={setQuery}
          placeholder="Søk adresse, minst tre bokstaver"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
        />
        {hits.map((hit) => (
          <TouchableOpacity key={hit.placeId || hit.label} onPress={() => applyHit(hit)}>
            <Text style={{ color: colors.ink, fontSize: 13, paddingVertical: 4 }}>{hit.label}</Text>
          </TouchableOpacity>
        ))}
        <View style={styles.row}>
          <TextInput editable={canEdit} value={street} onChangeText={setStreet} placeholder="Gate" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.ink, borderColor: colors.line, flex: 1 }]} />
          <TextInput editable={canEdit} value={postalCode} onChangeText={setPostalCode} placeholder="Postnr" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.ink, borderColor: colors.line, width: 90 }]} />
          <TextInput editable={canEdit} value={placeName} onChangeText={setPlaceName} placeholder="Poststed" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.ink, borderColor: colors.line, flex: 1 }]} />
        </View>
        {canEdit ? (
          <TouchableOpacity
            onPress={() => saveAddress({ street, postalCode, placeName })}
            style={[styles.btn, { backgroundColor: colors.brand }]}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Lagre adresse</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {isAdmin ? (
      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Text style={[styles.title, { color: colors.ink }]}>Kjøreturer</Text>
        {!trips.length ? (
          <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen kjøreturer på prosjektet.</Text>
        ) : trips.map((row) => (
          <View key={row.id} style={[styles.trip, { borderColor: colors.line }]}>
            <TouchableOpacity onPress={() => setEditingTrip(row)} style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 13 }}>
                {row.date} · {row.from} → {row.to} · {row.km} km · {formatMoney(row.amount)}
              </Text>
            </TouchableOpacity>
            {isAdmin ? (
              <View style={styles.tripActions}>
                <TouchableOpacity onPress={() => setEditingTrip(row)}>
                  <Text style={{ color: colors.brand, fontWeight: '600', fontSize: 12 }}>Rediger</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeTrip(row.id)}>
                  <Text style={{ color: colors.danger || '#b42318', fontWeight: '600', fontSize: 12 }}>
                    {pendingDelete === row.id ? 'Slett nå' : 'Slett'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ))}
      </View>
      ) : null}

      {isAdmin ? (
      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Text style={[styles.title, { color: colors.ink }]}>Innstillinger for timeføring</Text>
        {[
          ['showInAllTimesheets', 'Vis prosjekt i alles timelister'],
          ['allowSelfJoin', 'Ansatte kan legge seg selv inn på prosjektet'],
          ['requireDescription', 'Beskrivelse på timeføring er påkrevd'],
          ['showEstimatedHours', 'Vis estimerte og planlagte timer i timelisten'],
          ['notifyOnOverrun', 'Varsle prosjektleder på e-post ved overskridelse'],
        ].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            disabled={!isAdmin}
            onPress={() => patchSettings(key, !settings[key])}
            style={styles.check}
          >
            <Ionicons
              name={settings[key] ? 'checkbox' : 'square-outline'}
              size={18}
              color={settings[key] ? colors.brand : colors.muted}
            />
            <Text style={{ color: colors.ink, flex: 1, fontSize: 13 }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      ) : null}

      {editingTrip ? (
        <MileageWizard
          key={editingTrip.id}
          colors={colors}
          state={state}
          customers={customers}
          contracts={contracts}
          launch={false}
          editingTrip={editingTrip}
          onDismiss={() => setEditingTrip(null)}
          onDelete={() => removeTrip(editingTrip.id, true)}
          onApply={(result) => {
            if (result?.ok && result.state) onChangeState(result.state);
            return result;
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  panel: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 6 },
  title: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  cover: { height: 120, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  coverImg: { width: '100%', height: '100%' },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { flexGrow: 1, flexBasis: 140, gap: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  btn: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4 },
  ghost: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trip: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8, gap: 4 },
  tripActions: { flexDirection: 'row', gap: 12 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
});
