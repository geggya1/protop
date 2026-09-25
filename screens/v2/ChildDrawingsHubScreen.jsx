/**
 * Barnetegninger — ta vare på barnas tegninger i ramme på stueveggen.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Alert, Modal, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, radius } from '../../src/theme';
import { Screen, Mute } from '../../components/ui';
import { ModulePageFrame, ModuleHubIntro } from '../../components/ModulePageBg';
import ShellAddButton from '../../components/ShellAddButton';
import HelpTarget from '../../components/HelpTarget';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import LivingRoomWall, { RoomThumb } from '../../components/LivingRoomWall';
import DrawingCropModal from '../../components/DrawingCropModal';
import DrawingCameraModal from '../../components/DrawingCameraModal';
import DrawingAlbumViewer from '../../components/DrawingAlbumViewer';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import {
  listenChildDrawings,
  createChildDrawing,
  updateChildDrawing,
  softDeleteChildDrawing,
  uploadChildDrawingImage,
  drawingThumbUrl,
  downloadDrawingOnWall,
  ROOM_SCENES,
  normalizeFrame,
  normalizePlacement,
  ageAtDate,
  defaultSlotForScene,
  getRoomScene,
} from '../../src/utils/childDrawings';
import { alertPhotoError } from '../../src/utils/media';
import { toIsoDate } from '../../src/utils/age';

const PHOTO_ROOMS = ROOM_SCENES.filter((s) => s.kind === 'photo');

function ensurePhotoScene(sceneId) {
  const room = getRoomScene(sceneId);
  return room?.kind === 'photo' ? room.id : 'living';
}

function emptyForm(kids = []) {
  const first = kids[0] || null;
  return {
    title: '',
    note: '',
    place: 'Hjemme',
    drawnAtKey: toIsoDate(new Date()) || '',
    childId: first?.id || first?.docId || null,
    childName: first?.name || '',
    age: first ? ageAtDate(first.birthday, new Date()) : null,
    frame: normalizeFrame({ shape: 'classic', colorId: 'oak' }),
    placement: normalizePlacement({ scene: 'living', ...defaultSlotForScene('living') }),
  };
}

export default function ChildDrawingsHubScreen({ inShell = false }) {
  const { familyId, uid, members, kids, isParent } = useApp();
  const me = members.find((m) => m.uid === uid);
  const myName = me?.name || 'Meg';
  const childMembers = useMemo(
    () => (kids || []).filter((k) => k && (k.id || k.docId)),
    [kids],
  );

  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [scene, setScene] = useState('living');
  const [selectedId, setSelectedId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [form, setForm] = useState(() => emptyForm(childMembers));
  const [filterChildId, setFilterChildId] = useState('all');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cropPick, setCropPick] = useState(null); // { uri, blob }
  const [viewerId, setViewerId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [wallDownloadBusy, setWallDownloadBusy] = useState(false);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenChildDrawings(familyId, (list) => {
      setItems((list || []).filter((d) => d.deleted !== true));
    });
  }, [familyId]);

  const viewerDrawing = useMemo(
    () => items.find((d) => d.id === viewerId) || null,
    [items, viewerId],
  );

  const visible = useMemo(() => {
    if (filterChildId === 'all') return items;
    return items.filter((d) => d.childId === filterChildId);
  }, [items, filterChildId]);

  /** Tegning som vises i rom-forhåndsvisningen (valgt, ellers nyeste). */
  const featuredDrawing = useMemo(() => {
    if (!visible.length) return null;
    return visible.find((d) => d.id === selectedId) || visible[0];
  }, [visible, selectedId]);

  /**
   * Photo-rom har én ramme: vis featured i det rommet som er valgt nå,
   * uavhengig av lagret placement.scene (så Stue → Soverom ikke blir hvit).
   */
  const wallDrawings = useMemo(() => {
    if (!featuredDrawing) return [];
    return [{
      ...featuredDrawing,
      placement: normalizePlacement({
        scene,
        ...defaultSlotForScene(scene),
      }),
    }];
  }, [featuredDrawing, scene]);

  const downloadWall = useCallback(async () => {
    if (!featuredDrawing || wallDownloadBusy) return;
    setWallDownloadBusy(true);
    try {
      await downloadDrawingOnWall(featuredDrawing, scene);
    } finally {
      setWallDownloadBusy(false);
    }
  }, [featuredDrawing, scene, wallDownloadBusy]);

  const openViewer = useCallback((drawing) => {
    if (!drawing?.id) return;
    setSelectedId(drawing.id);
    setViewerId(drawing.id);
  }, []);

  const closeViewer = useCallback(() => {
    setViewerId(null);
  }, []);

  const patchForm = useCallback((partial) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  const selectChild = useCallback((child) => {
    if (!child) {
      patchForm({ childId: null, childName: '', age: null });
      return;
    }
    const id = child.id || child.docId;
    const drawn = form.drawnAtKey ? new Date(form.drawnAtKey) : new Date();
    patchForm({
      childId: id,
      childName: child.name || '',
      age: ageAtDate(child.birthday, drawn),
    });
  }, [form.drawnAtKey, patchForm]);

  const openCreate = useCallback(() => {
    if (!familyId || busy) return;
    setCameraOpen(true);
  }, [familyId, busy]);

  const handleCaptured = useCallback(async (picked) => {
    if (!familyId || !picked) return;
    setCameraOpen(false);
    try {
      let blob = picked?.blob || null;
      const uri = typeof picked === 'string' ? picked : picked?.uri;
      const revoke = !!picked?.revoke;
      if (!blob && uri) {
        const res = await fetch(uri);
        if (!res.ok) throw new Error('Kunne ikke lese bildet');
        blob = await res.blob();
      }
      if (!blob && !uri) return;
      // Vis crop-UI med auto-forslag før opplasting (web). Native uten canvas: last opp med autoCrop.
      if (typeof document !== 'undefined' && blob) {
        setCropPick({
          uri: uri || (typeof URL !== 'undefined' ? URL.createObjectURL(blob) : null),
          blob,
          revoke: revoke || !uri,
        });
        return;
      }
      setBusy(true);
      const image = await uploadChildDrawingImage(familyId, { uri, blob }, { autoCrop: true });
      setPendingImage(image);
      setEditingId(null);
      setForm(emptyForm(childMembers));
      setEditorOpen(true);
    } catch (e) {
      alertPhotoError(e);
    } finally {
      setBusy(false);
    }
  }, [familyId, childMembers]);

  const closeCrop = useCallback(() => {
    if (cropPick?.revoke && cropPick?.uri && typeof URL !== 'undefined') {
      try { URL.revokeObjectURL(cropPick.uri); } catch { /* ignore */ }
    }
    setCropPick(null);
  }, [cropPick]);

  const confirmCrop = useCallback(async ({ cropRect, cropQuad, blob, uri }) => {
    if (!familyId) return;
    const uploadBlob = blob || cropPick?.blob;
    if (!uploadBlob) return;
    setBusy(true);
    try {
      const image = await uploadChildDrawingImage(familyId, {
        blob: uploadBlob,
        uri: uri || cropPick?.uri,
      }, {
        autoCrop: false,
        cropRect: cropRect || null,
        cropQuad: cropQuad || null,
      });
      closeCrop();
      setPendingImage(image);
      setEditingId(null);
      setForm(emptyForm(childMembers));
      setEditorOpen(true);
    } catch (e) {
      alertPhotoError(e);
    } finally {
      setBusy(false);
    }
  }, [familyId, cropPick, childMembers, closeCrop]);

  const openEdit = useCallback((drawing) => {
    if (!drawing) return;
    const sceneId = ensurePhotoScene(drawing.placement?.scene);
    setViewerId(null);
    setEditingId(drawing.id);
    setPendingImage({
      displayUrl: drawing.imageUrl,
      thumbUrl: drawing.thumbUrl,
      width: drawing.width,
      height: drawing.height,
    });
    setForm({
      title: drawing.title || '',
      note: drawing.note || '',
      place: drawing.place || '',
      drawnAtKey: drawing.drawnAtKey || toIsoDate(drawing.drawnAt?.toDate?.() || new Date()) || '',
      childId: drawing.childId || null,
      childName: drawing.childName || '',
      age: drawing.age ?? null,
      frame: normalizeFrame(drawing.frame),
      placement: normalizePlacement({
        ...defaultSlotForScene(sceneId),
        ...(drawing.placement || {}),
        scene: sceneId,
      }),
    });
    setScene(sceneId);
    setSelectedId(drawing.id);
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingId(null);
    setPendingImage(null);
  }, []);

  const save = useCallback(async () => {
    if (!familyId || busy) return;
    if (!pendingImage?.displayUrl && !editingId) return;
    setBusy(true);
    try {
      const payload = {
        title: form.title,
        note: form.note,
        place: form.place,
        drawnAt: form.drawnAtKey || new Date(),
        childId: form.childId,
        childName: form.childName,
        age: form.age,
        frame: form.frame,
        placement: { ...form.placement, scene: form.placement?.scene || scene },
      };
      if (editingId) {
        await updateChildDrawing(familyId, editingId, payload, {
          editorUid: uid,
          isAdmin: !!isParent,
        });
      } else {
        await createChildDrawing({
          familyId,
          createdBy: uid,
          createdByName: myName,
          childBirthday: childMembers.find(
            (c) => (c.id || c.docId) === form.childId,
          )?.birthday,
          image: pendingImage,
          ...payload,
        });
      }
      setScene(payload.placement?.scene || 'living');
      closeEditor();
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre tegningen.');
    } finally {
      setBusy(false);
    }
  }, [
    familyId, busy, pendingImage, editingId, form, scene, uid, isParent,
    myName, childMembers, closeEditor,
  ]);

  const remove = useCallback((drawing) => {
    if (!drawing?.id || !familyId) return;
    setPendingDelete(drawing);
  }, [familyId]);

  const confirmDelete = useCallback(async () => {
    const drawing = pendingDelete;
    if (!drawing?.id || !familyId) return;
    try {
      await softDeleteChildDrawing(familyId, drawing.id);
      if (selectedId === drawing.id) setSelectedId(null);
      if (viewerId === drawing.id) setViewerId(null);
      setPendingDelete(null);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke slette.');
    }
  }, [familyId, pendingDelete, selectedId, viewerId]);

  const shellBtn = useMemo(
    () => (
      <HelpTarget id="add" onAdvance={() => openCreate()}>
        <ShellAddButton
          label={busy ? '…' : 'Ny tegning'}
          onPress={() => openCreate()}
          accessibilityLabel="Last opp barnetegning"
        />
      </HelpTarget>
    ),
    [openCreate, busy],
  );
  useShellTitleRight(shellBtn, { active: true });

  useHelpScene(editorOpen || cameraOpen ? 'inner' : 'hub', {
    onRetreat: () => {
      setEditorOpen(false);
      setCameraOpen(false);
    },
  });

  const previewUrl = pendingImage?.displayUrl || pendingImage?.thumbUrl;
  const aspect = pendingImage?.width && pendingImage?.height
    ? pendingImage.width / pendingImage.height
    : 1;

  return (
    <Screen>
      <ModulePageFrame name="childDrawings">
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <ModuleHubIntro>
            {!inShell && <Text style={styles.title}>Barnetegninger</Text>}
            <Mute>
              Kunstsamling for barnas tegninger — bla i albumet, se detaljer,
              og heng dem i rammen på veggen.
            </Mute>
          </ModuleHubIntro>

          <View style={styles.stats}>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{items.length}</Text>
              <Text style={styles.statLbl}>tegninger lagret</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{childMembers.length}</Text>
              <Text style={styles.statLbl}>barn</Text>
            </View>
          </View>

          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.chip, filterChildId === 'all' && styles.chipOn]}
              onPress={() => setFilterChildId('all')}
            >
              <Text style={[styles.chipTxt, filterChildId === 'all' && styles.chipTxtOn]}>Alle</Text>
            </TouchableOpacity>
            {childMembers.map((c) => {
              const id = c.id || c.docId;
              const on = filterChildId === id;
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setFilterChildId(id)}
                >
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{c.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!inShell ? (
            <TouchableOpacity style={styles.addBtn} onPress={openCreate} disabled={busy}>
              <Ionicons name="camera" size={18} color="#fff" />
              <Text style={styles.addBtnTxt}>{busy ? 'Behandler…' : 'Ta bilde av tegning'}</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={styles.sectionTitle}>Kunstsamling</Text>
          {visible.length === 0 ? (
            <Mute>Ingen tegninger ennå. Ta bilde av en tegning for å legge den i samlingen.</Mute>
          ) : (
            <View style={styles.albumGrid}>
              {visible.map((d) => {
                const uri = drawingThumbUrl(d);
                const on = selectedId === d.id || viewerId === d.id;
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[styles.thumbWrap, on && styles.thumbSelected]}
                    onPress={() => openViewer(d)}
                    onLongPress={() => openEdit(d)}
                    accessibilityLabel={d.title || 'Tegning'}
                    accessibilityHint="Trykk for å åpne. Hold inne for å redigere."
                  >
                    {uri ? (
                      <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.thumb, styles.thumbEmpty]}>
                        <Ionicons name="image-outline" size={22} color="#94a3b8" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <Text style={styles.sectionTitle}>På veggen</Text>
          <Mute>Velg rom for å se tegningen i rammen som henger der.</Mute>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.roomRow}
          >
            {PHOTO_ROOMS.map((s) => (
              <RoomThumb
                key={s.id}
                sceneId={s.id}
                selected={scene === s.id}
                onPress={() => {
                  setScene(s.id);
                  if (!selectedId && featuredDrawing?.id) {
                    setSelectedId(featuredDrawing.id);
                  }
                }}
              />
            ))}
          </ScrollView>

          <LivingRoomWall
            key={`wall-${scene}-${featuredDrawing?.id || 'empty'}`}
            drawings={wallDrawings}
            scene={scene}
            selectedId={featuredDrawing?.id || null}
            onSelect={(d) => openViewer(d)}
            square
          />

          {featuredDrawing ? (
            <TouchableOpacity
              style={[styles.wallDlBtn, wallDownloadBusy && { opacity: 0.6 }]}
              onPress={downloadWall}
              disabled={wallDownloadBusy}
              accessibilityRole="button"
              accessibilityLabel="Last ned tegning på veggen"
            >
              <Ionicons name="download-outline" size={18} color="#5C4033" />
              <Text style={styles.wallDlTxt}>
                {wallDownloadBusy ? 'Lager bilde…' : 'Last ned med vegg'}
              </Text>
            </TouchableOpacity>
          ) : null}

          <View style={{ height: 40 }} />
        </ScrollView>
      </ModulePageFrame>

      <Modal visible={editorOpen} animationType="slide" transparent onRequestClose={closeEditor}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{editingId ? 'Rediger tegning' : 'Ny tegning'}</Text>
              <TouchableOpacity onPress={closeEditor} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              {previewUrl ? (
                <View style={styles.previewWrap}>
                  <LivingRoomWall
                    key={`preview-${form.placement?.scene || 'living'}`}
                    drawings={[]}
                    scene={form.placement?.scene || 'living'}
                    square
                    previewImageUrl={previewUrl}
                    previewAspect={aspect}
                    previewFrame={{
                      frame: form.frame,
                      placement: form.placement,
                    }}
                  />
                  <Mute style={{ marginTop: 8 }}>
                    Tegningen fyller rammen på veggen. Bytt rom under for å forhåndsvise.
                  </Mute>
                </View>
              ) : null}

              <Text style={styles.label}>Tittel</Text>
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={(title) => patchForm({ title })}
                placeholder="F.eks. Dinosaur i rommet"
                placeholderTextColor={colors.placeholder}
              />

              <Text style={styles.label}>Barn</Text>
              <View style={styles.filterRow}>
                {childMembers.map((c) => {
                  const id = c.id || c.docId;
                  const on = form.childId === id;
                  return (
                    <TouchableOpacity
                      key={id}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => selectChild(c)}
                    >
                      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{c.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.row2}>
                <View style={styles.col}>
                  <Text style={styles.label}>Alder</Text>
                  <TextInput
                    style={styles.input}
                    value={form.age == null ? '' : String(form.age)}
                    onChangeText={(v) => {
                      const n = parseInt(v.replace(/[^\d]/g, ''), 10);
                      patchForm({ age: Number.isFinite(n) ? n : null });
                    }}
                    keyboardType="number-pad"
                    placeholder="År"
                    placeholderTextColor={colors.placeholder}
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Dato</Text>
                  <TextInput
                    style={styles.input}
                    value={form.drawnAtKey}
                    onChangeText={(drawnAtKey) => {
                      const child = childMembers.find(
                        (c) => (c.id || c.docId) === form.childId,
                      );
                      const nextAge = child
                        ? ageAtDate(child.birthday, drawnAtKey || new Date())
                        : form.age;
                      patchForm({ drawnAtKey, age: nextAge });
                    }}
                    placeholder="ÅÅÅÅ-MM-DD"
                    placeholderTextColor={colors.placeholder}
                  />
                </View>
              </View>

              <Text style={styles.label}>Sted</Text>
              <TextInput
                style={styles.input}
                value={form.place}
                onChangeText={(place) => patchForm({ place })}
                placeholder="Barnehagen, hjemme, bestemor…"
                placeholderTextColor={colors.placeholder}
              />

              <Text style={styles.label}>Notat</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                value={form.note}
                onChangeText={(note) => patchForm({ note })}
                placeholder="Hva tegnet hen? Historien bak…"
                placeholderTextColor={colors.placeholder}
                multiline
              />

              <Text style={styles.label}>Rom</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.roomRow}
              >
                {PHOTO_ROOMS.map((s) => (
                  <RoomThumb
                    key={s.id}
                    sceneId={s.id}
                    selected={form.placement?.scene === s.id}
                    onPress={() => {
                      const slot = defaultSlotForScene(s.id);
                      patchForm({
                        placement: {
                          ...form.placement,
                          scene: s.id,
                          x: slot.x,
                          y: slot.y,
                          scale: slot.scale,
                        },
                      });
                    }}
                  />
                ))}
              </ScrollView>

              <Mute>Tegningen legges automatisk inn i rammen som henger på veggen.</Mute>

              <TouchableOpacity
                style={[styles.saveBtn, busy && { opacity: 0.6 }]}
                onPress={save}
                disabled={busy}
              >
                <Text style={styles.saveBtnTxt}>{busy ? 'Lagrer…' : 'Lagre minne'}</Text>
              </TouchableOpacity>
              {editingId ? (
                <TouchableOpacity style={styles.deleteLink} onPress={() => {
                  const d = items.find((x) => x.id === editingId);
                  closeEditor();
                  if (d) remove(d);
                }}
                >
                  <Text style={styles.deleteLinkTxt}>Slett tegning</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <DrawingCameraModal
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCaptured={handleCaptured}
      />

      <DrawingCropModal
        visible={!!cropPick}
        imageUri={cropPick?.uri}
        imageBlob={cropPick?.blob}
        onCancel={closeCrop}
        onConfirm={confirmCrop}
      />

      <DrawingAlbumViewer
        visible={!!viewerDrawing}
        drawing={viewerDrawing}
        drawings={visible}
        wallScene={scene}
        canDelete={!!isParent || viewerDrawing?.createdBy === uid}
        canEdit
        onClose={closeViewer}
        onSelect={(d) => {
          setSelectedId(d.id);
          setViewerId(d.id);
        }}
        onEdit={(d) => {
          closeViewer();
          openEdit(d);
        }}
        onDelete={(d) => {
          closeViewer();
          remove(d);
        }}
      />

      <ConfirmActionModal
        visible={!!pendingDelete}
        title="Slette tegning?"
        body={`«${pendingDelete?.title || 'Tegning'}» slettes fra kunstsamlingen.`}
        confirmLabel="Slett"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  body: { padding: 16, paddingBottom: 32, gap: 12 },
  title: { fontSize: 24, fontWeight: '400', color: colors.text, marginBottom: 4 },
  stats: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: radius?.lg || 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(60,40,20,0.08)',
  },
  statNum: { fontSize: 22, fontWeight: '400', color: colors.text },
  statLbl: { fontSize: 12, color: colors.muted, marginTop: 2 },
  sceneTabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  roomRow: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  wallDlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(92,64,51,0.22)',
  },
  wallDlTxt: {
    fontSize: 14,
    fontWeight: '400',
    color: '#5C4033',
  },
  sceneTab: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(60,40,20,0.1)',
  },
  sceneTabOn: { backgroundColor: '#5C4033', borderColor: '#5C4033' },
  sceneTabTxt: { fontSize: 13, color: colors.text, fontWeight: '400' },
  sceneTabTxtOn: { color: '#fff' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(60,40,20,0.1)',
  },
  chipOn: { backgroundColor: '#8B6914', borderColor: '#8B6914' },
  chipTxt: { fontSize: 13, color: colors.text },
  chipTxtOn: { color: '#fff', fontWeight: '400' },
  addBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#5C4033',
    borderRadius: 12,
    paddingVertical: 12,
  },
  addBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 15 },
  detail: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(60,40,20,0.08)',
    gap: 6,
  },
  detailTitle: { fontSize: 18, fontWeight: '400', color: colors.text },
  detailMeta: { fontSize: 13, color: colors.muted },
  detailNote: { fontSize: 14, color: colors.text, marginTop: 4 },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  secondaryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(92,64,51,0.12)',
  },
  secondaryBtnTxt: { color: '#5C4033', fontWeight: '400' },
  dangerBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(180,40,40,0.1)',
  },
  dangerBtnTxt: { color: '#a11', fontWeight: '400' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.text,
    marginTop: 8,
  },
  albumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  thumbWrap: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#e8dfd2',
    position: 'relative',
  },
  thumbSelected: {
    borderWidth: 2,
    borderColor: '#5C4033',
  },
  thumb: { width: '100%', height: '100%' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,14,8,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '92%',
    backgroundColor: '#f7f1e8',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(60,40,20,0.1)',
  },
  modalTitle: { fontSize: 17, fontWeight: '400', color: colors.text },
  modalBody: { padding: 16, gap: 8, paddingBottom: 40 },
  previewWrap: { alignItems: 'center', marginBottom: 8 },
  label: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.muted,
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(60,40,20,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 4 },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotOn: {
    borderColor: '#1a1a1a',
    transform: [{ scale: 1.12 }],
  },
  hint: { fontSize: 12, color: colors.muted, marginBottom: 6 },
  sliderRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  posDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(92,64,51,0.2)',
  },
  posDotOn: { backgroundColor: '#5C4033' },
  saveBtn: {
    alignSelf: 'flex-start',
    marginTop: 14,
    backgroundColor: '#5C4033',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
  deleteLink: { alignItems: 'center', paddingVertical: 12 },
  deleteLinkTxt: { color: '#a11', fontWeight: '400' },
});
