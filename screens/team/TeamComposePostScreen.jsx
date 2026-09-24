import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  Alert, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { createTeamPost, updateTeamPost, deleteTeamPost } from '../../src/utils/teams';
import { alertPhotoError, pickImages, uploadImage } from '../../src/utils/media';
import { isGroupAdmin, isTeamAdmin } from '../../src/utils/groups';
import { teamColors as c } from '../../src/teamTheme';

const MAX_IMAGES = 8;

function resolveInitialImages(params) {
  const fromList = Array.isArray(params?.imageUrls) ? params.imageUrls.filter(Boolean) : [];
  if (fromList.length) return fromList;
  return params?.imageUrl ? [params.imageUrl] : [];
}

export default function TeamComposePostScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const {
    teamId, postId, title: initialTitle, body: initialBody, imageUrl, imageUrls, team,
  } = route.params || {};
  const { uid, activeProfile } = useApp();
  const editing = !!postId;
  const [title, setTitle] = useState(initialTitle || '');
  const [body, setBody] = useState(initialBody || '');
  const [images, setImages] = useState(() => resolveInitialImages({ imageUrl, imageUrls }));
  const [busy, setBusy] = useState(false);
  const canAddMore = images.length < MAX_IMAGES;
  const isAdmin = isGroupAdmin(team, uid) || isTeamAdmin(team, uid);

  const headerTitle = useMemo(() => (editing ? 'Rediger innlegg' : 'Nytt innlegg'), [editing]);

  const addImages = async () => {
    if (!canAddMore) return;
    try {
      const picked = await pickImages({ max: MAX_IMAGES - images.length });
      if (!picked?.length) return;
      setBusy(true);
      const urls = [];
      for (let i = 0; i < picked.length; i += 1) {
        const url = await uploadImage(
          `families/${teamId}/posts/${uid}-${Date.now()}-${i}.jpg`,
          picked[i],
        );
        if (url) urls.push(url);
      }
      setImages((prev) => [...prev, ...urls].slice(0, MAX_IMAGES));
    } catch (e) {
      alertPhotoError(e);
    } finally {
      setBusy(false);
    }
  };

  const removeImage = (url) => {
    setImages((prev) => prev.filter((u) => u !== url));
  };

  const publish = async () => {
    setBusy(true);
    try {
      if (editing) {
        await updateTeamPost(teamId, postId, {
          title,
          body,
          imageUrls: images,
          editorUid: uid,
          isAdmin,
        });
      } else {
        await createTeamPost({
          teamId,
          authorUid: uid,
          authorName: activeProfile?.name || 'Medlem',
          title,
          body,
          imageUrls: images,
        });
      }
      nav.goBack();
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre innlegget.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Slett innlegg?',
      'Innlegget og kommentarene fjernes permanent.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Slett',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteTeamPost(teamId, postId, { editorUid: uid, isAdmin });
              nav.goBack();
            } catch (e) {
              Alert.alert('Feil', e?.message || 'Klarte ikke å slette.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <TouchableOpacity style={styles.back} onPress={() => nav.goBack()}>
          <Ionicons name="chevron-back" size={22} color={c.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>{headerTitle}</Text>
        <TouchableOpacity
          style={[styles.publish, busy && { opacity: 0.5 }]}
          onPress={publish}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.publishTxt}>{editing ? 'Lagre' : 'Publiser'}</Text>
          )}
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Tittel (valgfritt)"
          placeholderTextColor={c.muted}
        />
        <TextInput
          style={styles.bodyInput}
          value={body}
          onChangeText={setBody}
          placeholder="Hva skjer på laget?"
          placeholderTextColor={c.muted}
          multiline
          textAlignVertical="top"
        />

        {images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gallery}>
            {images.map((url) => (
              <View key={url} style={styles.thumbWrap}>
                <Image source={{ uri: url }} style={styles.thumb} />
                <TouchableOpacity style={styles.remove} onPress={() => removeImage(url)}>
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        <TouchableOpacity
          style={[styles.addImg, (!canAddMore || busy) && { opacity: 0.5 }]}
          onPress={addImages}
          disabled={!canAddMore || busy}
        >
          <Ionicons name="images-outline" size={20} color={c.brand} />
          <Text style={styles.addImgTxt}>
            {images.length ? `Legg til flere bilder (${images.length}/${MAX_IMAGES})` : 'Legg til bilder'}
          </Text>
        </TouchableOpacity>

        {editing && (
          <TouchableOpacity
            style={[styles.deleteBtn, busy && { opacity: 0.5 }]}
            onPress={confirmDelete}
            disabled={busy}
          >
            <Ionicons name="trash-outline" size={18} color="#b91c1c" />
            <Text style={styles.deleteTxt}>Slett innlegg</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line,
  },
  back: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 18, fontWeight: '900', color: c.ink },
  publish: {
    backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
  },
  publishTxt: { color: '#fff', fontWeight: '900' },
  body: { padding: 16, paddingBottom: 40 },
  titleInput: {
    color: c.ink, fontWeight: '800', fontSize: 20, marginBottom: 12,
  },
  bodyInput: {
    minHeight: 140, color: c.ink, fontWeight: '500', fontSize: 16, lineHeight: 24, marginBottom: 16,
  },
  gallery: { marginBottom: 12 },
  thumbWrap: { marginRight: 10, position: 'relative' },
  thumb: { width: 96, height: 96, borderRadius: 12, backgroundColor: c.surface2 },
  remove: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  addImg: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.surface, borderRadius: 14, padding: 14,
  },
  addImgTxt: { color: c.brand, fontWeight: '800', fontSize: 14 },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 24, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
  },
  deleteTxt: { color: '#b91c1c', fontWeight: '800', fontSize: 15 },
});
