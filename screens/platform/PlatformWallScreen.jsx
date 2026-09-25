import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  listenPlatformPosts, reactToPlatformPost,
  listenPlatformPostComments, addPlatformPostComment,
} from '../../src/platform/platformCore';
import { useApp } from '../../src/context/AppContext';
import { isGroupAdmin } from '../../src/utils/groups';

function timeAgo(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if (!d) return '';
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${Math.max(1, mins)} min siden`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} t siden`;
    const days = Math.floor(hrs / 24);
    return days === 1 ? 'I går' : `${days} dager siden`;
  } catch {
    return '';
  }
}

function PostComments({ config, groupId, postId, uid, authorName }) {
  const c = config.theme;
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => listenPlatformPostComments(groupId, postId, setComments), [groupId, postId]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await addPlatformPostComment({ groupId, postId, authorUid: uid, authorName, body: text });
      setDraft('');
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke å kommentere.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.comments}>
      {comments.map((cm) => (
        <View key={cm.id} style={styles.commentRow}>
          <Text style={[styles.commentAuthor, { color: c.ink }]}>{cm.authorName || 'Medlem'}</Text>
          <Text style={[styles.commentBody, { color: c.muted }]}>{cm.body}</Text>
        </View>
      ))}
      <View style={styles.commentInput}>
        <TextInput
          style={[styles.input, { borderColor: c.line, color: c.ink }]}
          placeholder="Skriv en kommentar…"
          placeholderTextColor={c.muted}
          value={draft}
          onChangeText={setDraft}
        />
        <TouchableOpacity style={[styles.sendBtn, { backgroundColor: c.brand }]} onPress={send} disabled={busy}>
          <Ionicons name="send" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function PlatformWallScreen({ config, groupId, group }) {
  const c = config.theme;
  const nav = useNavigation();
  const { uid, activeProfile } = useApp();
  const isAdmin = isGroupAdmin(group, uid);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!groupId) { setLoading(false); return undefined; }
    return listenPlatformPosts(groupId, (list) => {
      setPosts(list || []);
      setLoading(false);
    });
  }, [groupId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.body, { backgroundColor: c.bg }]}>
      {isAdmin && (
        <TouchableOpacity
          style={[styles.composeBar, { backgroundColor: c.surface, borderColor: c.line }]}
          onPress={() => nav.navigate(config.composePostRoute, { groupId, group })}
        >
          <Ionicons name="create-outline" size={20} color={c.brand} />
          <Text style={[styles.composeTxt, { color: c.muted }]}>Del noe med {config.labelShort.toLowerCase()}en…</Text>
        </TouchableOpacity>
      )}

      {posts.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Ionicons name="newspaper-outline" size={28} color={c.muted} />
          <Text style={[styles.emptyTxt, { color: c.muted }]}>
            Ingen innlegg ennå.{isAdmin ? ' Trykk + for å dele.' : ''}
          </Text>
        </View>
      ) : posts.map((post) => {
        const reactions = Object.values(post.reactions || {});
        const open = expanded === post.id;
        return (
          <View key={post.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
            <View style={styles.cardHead}>
              <View style={[styles.avatar, { backgroundColor: c.brandSoft }]}>
                <Text style={[styles.avatarTxt, { color: c.brand }]}>
                  {(post.authorName || '?')[0]}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.author, { color: c.ink }]}>{post.authorName || 'Medlem'}</Text>
                <Text style={[styles.when, { color: c.muted }]}>{timeAgo(post.createdAt)}</Text>
              </View>
            </View>
            {!!post.title && (
              <Text style={[styles.title, { color: c.ink }]}>{post.title}</Text>
            )}
            {!!post.body && (
              <Text style={[styles.bodyTxt, { color: c.ink }]}>{post.body}</Text>
            )}
            {!!post.imageUrl && (
              <Image source={{ uri: post.imageUrl }} style={styles.image} resizeMode="cover" />
            )}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.reactBtn}
                onPress={() => reactToPlatformPost(groupId, post.id, uid, '👍')}
              >
                <Text style={styles.reactEmoji}>👍</Text>
                <Text style={[styles.reactCount, { color: c.muted }]}>{reactions.length || ''}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setExpanded(open ? null : post.id)}>
                <Text style={[styles.commentLink, { color: c.brand }]}>
                  {post.commentCount || 0} kommentarer
                </Text>
              </TouchableOpacity>
            </View>
            {open && (
              <PostComments
                config={config}
                groupId={groupId}
                postId={post.id}
                uid={uid}
                authorName={activeProfile?.name}
              />
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  composeBar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, borderWidth: 1 },
  composeTxt: { fontSize: 14 },
  empty: { borderRadius: 16, padding: 28, alignItems: 'center', gap: 8, borderWidth: 1 },
  emptyTxt: { fontSize: 14, textAlign: 'center' },
  card: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 16, fontWeight: '400' },
  author: { fontSize: 14, fontWeight: '400' },
  when: { fontSize: 11 },
  title: { fontSize: 16, fontWeight: '400' },
  bodyTxt: { fontSize: 14, lineHeight: 20 },
  image: { width: '100%', height: 180, borderRadius: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  reactBtn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 },
  reactEmoji: { fontSize: 16 },
  reactCount: { fontSize: 12 },
  commentLink: { fontSize: 13, fontWeight: '400' },
  comments: { marginTop: 8, gap: 8 },
  commentRow: { gap: 2 },
  commentAuthor: { fontSize: 12, fontWeight: '400' },
  commentBody: { fontSize: 13 },
  commentInput: { flexDirection: 'row', gap: 8, marginTop: 4 },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  sendBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
