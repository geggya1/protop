import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { teamColors as c } from '../../src/teamTheme';
import {
  listenTeamPosts,
  reactToTeamPost,
  listenTeamPostComments,
  addTeamPostComment,
  updateTeamPostComment,
} from '../../src/utils/teams';
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
    if (days === 1) return 'I går';
    return `${days} dager siden`;
  } catch {
    return '';
  }
}

function postImages(post) {
  const list = Array.isArray(post?.imageUrls) ? post.imageUrls.filter(Boolean) : [];
  if (list.length) return list;
  return post?.imageUrl ? [post.imageUrl] : [];
}

function PostComments({ teamId, postId, uid, authorName }) {
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');

  useEffect(() => listenTeamPostComments(teamId, postId, setComments), [teamId, postId]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await addTeamPostComment({
        teamId,
        postId,
        authorUid: uid,
        authorName: authorName || 'Medlem',
        body: text,
      });
      setDraft('');
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke å kommentere.');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (commentId) => {
    const text = editDraft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await updateTeamPostComment({
        teamId,
        postId,
        commentId,
        editorUid: uid,
        body: text,
      });
      setEditingId(null);
      setEditDraft('');
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke å lagre kommentaren.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.comments}>
      {comments.map((cm) => {
        const mine = cm.authorUid === uid;
        const editing = editingId === cm.id;
        return (
          <View key={cm.id} style={styles.commentRow}>
            <View style={styles.commentAvatar}>
              <Text style={styles.commentAvatarTxt}>{(cm.authorName || '?')[0]}</Text>
            </View>
            <View style={styles.commentBody}>
              <View style={styles.commentMeta}>
                <Text style={styles.commentAuthor}>{cm.authorName || 'Medlem'}</Text>
                <Text style={styles.commentWhen}>{timeAgo(cm.createdAt)}</Text>
                {mine && !editing && (
                  <TouchableOpacity
                    onPress={() => {
                      setEditingId(cm.id);
                      setEditDraft(cm.body || '');
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.editLink}>Rediger</Text>
                  </TouchableOpacity>
                )}
              </View>
              {editing ? (
                <View style={styles.editBox}>
                  <TextInput
                    style={styles.editInput}
                    value={editDraft}
                    onChangeText={setEditDraft}
                    multiline
                    autoFocus
                  />
                  <View style={styles.editActions}>
                    <TouchableOpacity onPress={() => { setEditingId(null); setEditDraft(''); }}>
                      <Text style={styles.cancelLink}>Avbryt</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveBtn, busy && { opacity: 0.5 }]}
                      onPress={() => saveEdit(cm.id)}
                      disabled={busy}
                    >
                      <Text style={styles.saveBtnTxt}>Lagre</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <Text style={styles.commentTxt}>{cm.body}</Text>
              )}
            </View>
          </View>
        );
      })}

      <View style={styles.composer}>
        <TextInput
          style={styles.composerInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="Skriv en kommentar…"
          placeholderTextColor={c.muted}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!draft.trim() || busy) && { opacity: 0.4 }]}
          onPress={send}
          disabled={!draft.trim() || busy}
        >
          {busy ? <ActivityIndicator color="#fff" size="small" /> : (
            <Ionicons name="send" size={16} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PostCard({ post, teamId, team, uid, authorName, isAdmin }) {
  const nav = useNavigation();
  const myReaction = post.reactions?.[uid];
  const images = postImages(post);
  const [showComments, setShowComments] = useState(false);
  const canEdit = isAdmin || post.authorUid === uid;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarTxt}>{(post.authorName || '?')[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.author}>{post.authorName || team?.name || 'Lag'}</Text>
          <Text style={styles.when}>
            {timeAgo(post.createdAt)}
            {team?.name ? ` · ${team.name}` : ''}
          </Text>
        </View>
        {canEdit && (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => nav.navigate('TeamComposePost', {
              teamId,
              postId: post.id,
              title: post.title || '',
              body: post.body || '',
              imageUrls: images,
              team,
            })}
            accessibilityLabel="Rediger innlegg"
          >
            <Ionicons name="pencil-outline" size={18} color={c.muted} />
          </TouchableOpacity>
        )}
      </View>

      {!!post.title && <Text style={styles.title}>{post.title}</Text>}
      {!!post.body && <Text style={styles.bodyTxt}>{post.body}</Text>}

      {images.length === 1 && (
        <Image source={{ uri: images[0] }} style={styles.heroImg} resizeMode="cover" />
      )}
      {images.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imgRow}>
          {images.map((url) => (
            <Image key={url} source={{ uri: url }} style={styles.gridImg} resizeMode="cover" />
          ))}
        </ScrollView>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.reactBtn}
          onPress={() => reactToTeamPost(teamId, post.id, uid, '👍')}
        >
          <Text style={styles.reactEmoji}>{myReaction || '👍'}</Text>
          <Text style={styles.reactCount}>{post.reactionCount || 0}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.reactBtn}
          onPress={() => setShowComments((v) => !v)}
        >
          <Ionicons name="chatbubble-outline" size={15} color={c.ink} />
          <Text style={styles.reactCount}>{post.commentCount || 0}</Text>
        </TouchableOpacity>
      </View>

      {showComments && (
        <PostComments
          teamId={teamId}
          postId={post.id}
          uid={uid}
          authorName={authorName}
        />
      )}
    </View>
  );
}

export default function TeamWallScreen({ teamId, team }) {
  const nav = useNavigation();
  const { uid, activeProfile } = useApp();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = isGroupAdmin(team, uid);
  const authorName = activeProfile?.name || 'Medlem';

  useEffect(() => {
    if (!teamId) { setLoading(false); return undefined; }
    return listenTeamPosts(teamId, (list) => {
      setPosts(list || []);
      setLoading(false);
    });
  }, [teamId]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <TouchableOpacity
        style={styles.compose}
        onPress={() => nav.navigate('TeamComposePost', { teamId, team })}
      >
        <Ionicons name="create-outline" size={18} color={c.brand} />
        <Text style={styles.composeTxt}>Skriv et innlegg til laget…</Text>
      </TouchableOpacity>

      {posts.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="newspaper-outline" size={36} color={c.muted} />
          <Text style={styles.emptyTitle}>Veggen er tom</Text>
          <Text style={styles.emptySub}>Nyheter og oppdateringer fra laget dukker opp her.</Text>
        </View>
      ) : posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          teamId={teamId}
          team={team}
          uid={uid}
          authorName={authorName}
          isAdmin={isAdmin}
        />
      ))}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  compose: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 12,
  },
  composeTxt: { color: c.muted, fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: c.surface, borderRadius: 16, padding: 14, marginBottom: 10,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { color: c.ink, fontWeight: '900' },
  author: { color: c.ink, fontWeight: '800', fontSize: 14 },
  when: { color: c.muted, fontWeight: '600', fontSize: 12, marginTop: 1 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: c.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: c.ink, fontWeight: '900', fontSize: 16, marginBottom: 6 },
  bodyTxt: { color: c.ink, fontWeight: '500', fontSize: 14, lineHeight: 21 },
  heroImg: {
    width: '100%', height: 220, borderRadius: 12, marginTop: 12, backgroundColor: c.surface2,
  },
  imgRow: { marginTop: 12 },
  gridImg: {
    width: 160, height: 160, borderRadius: 12, marginRight: 8, backgroundColor: c.surface2,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  reactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.surface2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
  },
  reactEmoji: { fontSize: 14 },
  reactCount: { color: c.ink, fontWeight: '800', fontSize: 13 },
  comments: {
    marginTop: 12, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, gap: 10,
  },
  commentRow: { flexDirection: 'row', gap: 8 },
  commentAvatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: c.surface2,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  commentAvatarTxt: { color: c.ink, fontWeight: '800', fontSize: 12 },
  commentBody: { flex: 1 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' },
  commentAuthor: { color: c.ink, fontWeight: '800', fontSize: 13 },
  commentWhen: { color: c.muted, fontWeight: '600', fontSize: 11 },
  editLink: { color: c.brand, fontWeight: '800', fontSize: 12 },
  commentTxt: { color: c.ink, fontWeight: '500', fontSize: 13, lineHeight: 19 },
  editBox: { gap: 8 },
  editInput: {
    backgroundColor: c.surface2, borderRadius: 10, padding: 10,
    color: c.ink, fontWeight: '500', fontSize: 13, minHeight: 44,
  },
  editActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 },
  cancelLink: { color: c.muted, fontWeight: '700', fontSize: 13 },
  saveBtn: {
    backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
  },
  saveBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  composerInput: {
    flex: 1, backgroundColor: c.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    color: c.ink, fontWeight: '500', fontSize: 14, maxHeight: 100,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: c.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { color: c.ink, fontWeight: '800', fontSize: 16 },
  emptySub: { color: c.muted, textAlign: 'center', fontWeight: '600', fontSize: 13 },
});
