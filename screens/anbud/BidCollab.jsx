import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  addBidTask,
  addLibraryItem,
  assignTask,
  commentOnTask,
  markPageRead,
  pageReadSummary,
  setBidTasks,
  tasksFromNotice,
  toggleTask,
} from '../../src/anbud/desk.js';
import { draftAnswerRemote, planTasksRemote } from '../../src/anbud/deskClient';

export default function BidCollab({ bid, state, notice, colors, members = [], onCommit }) {
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [taskId, setTaskId] = useState('');
  const [page, setPage] = useState('1');
  const [fileId, setFileId] = useState(bid?.files?.[0]?.id || '');
  const [libraryTitle, setLibraryTitle] = useState('');
  const [libraryBody, setLibraryBody] = useState('');
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const reads = pageReadSummary(bid);
  const tasks = bid?.tasks || [];
  const openTasks = tasks.filter((task) => task.status !== 'ferdig').length;

  function commit(result) {
    if (!result?.ok) {
      setNote(result?.error || 'Kunne ikke lagre.');
      return;
    }
    setNote('');
    onCommit(result.state);
  }

  return (
    <View style={{ gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12 }}>
      <TouchableOpacity
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ gap: 2 }}
      >
        <Text style={{ color: colors.ink, fontWeight: '600' }}>{open ? '▾' : '▸'} Samarbeid og svarbibliotek</Text>
        <Text style={{ color: colors.muted }}>
          {openTasks
            ? `${openTasks} åpne oppgaver`
            : 'Oppgaver, leste sider og gjenbrukte svar. Trykk for å åpne.'}
        </Text>
      </TouchableOpacity>
      {open ? (
      <View style={{ gap: 8 }}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Samarbeid</Text>
      {(notice?.updates || []).length ? (
        <Text style={{ color: colors.ink }}>
          Kunngjøringen er endret etter at tilbudet ble åpnet: {notice.updates[notice.updates.length - 1].changes.map((row) => row.label).join(', ')}
        </Text>
      ) : null}
      <TouchableOpacity
        onPress={async () => {
          const data = await planTasksRemote(notice || bid);
          commit(setBidTasks(state, bid.id, data.tasks || tasksFromNotice(notice || bid)));
        }}
        accessibilityRole="button"
      >
        <Text style={{ color: colors.brand }}>Lag oppgaveliste fra grunnlaget</Text>
      </TouchableOpacity>
      {tasks.map((task) => (
        <View key={task.id} style={{ gap: 4 }}>
          <TouchableOpacity onPress={() => commit(toggleTask(state, bid.id, task.id))} accessibilityRole="button">
            <Text style={{ color: colors.ink }}>{task.status === 'ferdig' ? 'Ferdig' : 'Åpen'} · {task.title}{task.ownerName ? ` · ${task.ownerName}` : ''}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {members.slice(0, 8).map((person) => (
              <TouchableOpacity key={person.id || person.uid} onPress={() => commit(assignTask(state, bid.id, task.id, person))} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>{person.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {(task.comments || []).map((row) => (
            <Text key={row.id} style={{ color: colors.muted }}>{row.authorName || 'Kommentar'}: {row.text}</Text>
          ))}
        </View>
      ))}
      <TextInput value={title} onChangeText={setTitle} placeholder="Ny oppgave" placeholderTextColor={colors.placeholder} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 8, color: colors.ink }} />
      <TouchableOpacity onPress={() => { commit(addBidTask(state, bid.id, { title })); setTitle(''); }} accessibilityRole="button">
        <Text style={{ color: colors.brand }}>Legg til oppgave</Text>
      </TouchableOpacity>
      <TextInput value={comment} onChangeText={setComment} placeholder="Kommentar til valgt oppgave" placeholderTextColor={colors.placeholder} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 8, color: colors.ink }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {tasks.map((task) => (
          <TouchableOpacity key={task.id} onPress={() => setTaskId(task.id)} accessibilityRole="button">
            <Text style={{ color: taskId === task.id ? colors.brand : colors.ink }}>{task.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        onPress={() => commit(commentOnTask(state, bid.id, taskId || tasks[0]?.id, { text: comment, authorName: members[0]?.name || '' }))}
        accessibilityRole="button"
      >
        <Text style={{ color: colors.brand }}>Lagre kommentar</Text>
      </TouchableOpacity>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Sider som er lest</Text>
      {reads.map((row) => (
        <Text key={row.fileId} style={{ color: colors.muted }}>
          {(bid.files || []).find((file) => file.id === row.fileId)?.name || 'Dokument'} · side {row.pages.join(', ')} · {row.readers.join(', ') || 'lest'}
        </Text>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(bid.files || []).slice(0, 8).map((file) => (
          <TouchableOpacity key={file.id} onPress={() => setFileId(file.id)} accessibilityRole="button">
            <Text style={{ color: fileId === file.id ? colors.brand : colors.ink }}>{file.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput value={page} onChangeText={setPage} placeholder="Sidenummer" placeholderTextColor={colors.placeholder} keyboardType="number-pad" style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 8, color: colors.ink, maxWidth: 120 }} />
      <TouchableOpacity
        onPress={() => commit(markPageRead(state, bid.id, { fileId, page, userId: members[0]?.id || members[0]?.uid || '', userName: members[0]?.name || 'Meg' }))}
        accessibilityRole="button"
      >
        <Text style={{ color: colors.brand }}>Merk siden som lest</Text>
      </TouchableOpacity>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Svarbibliotek</Text>
      <TextInput value={libraryTitle} onChangeText={setLibraryTitle} placeholder="Tittel på svaret" placeholderTextColor={colors.placeholder} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 8, color: colors.ink }} />
      <TextInput value={libraryBody} onChangeText={setLibraryBody} placeholder="Tekst som kan gjenbrukes" placeholderTextColor={colors.placeholder} multiline style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 8, color: colors.ink, minHeight: 80 }} />
      <TouchableOpacity onPress={() => commit(addLibraryItem(state, { title: libraryTitle, body: libraryBody, sourceBidId: bid.id, tags: [bid.buyer] }))} accessibilityRole="button">
        <Text style={{ color: colors.brand }}>Lagre i biblioteket</Text>
      </TouchableOpacity>
      <TextInput value={prompt} onChangeText={setPrompt} placeholder="Hva skal utkastet svare på?" placeholderTextColor={colors.placeholder} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 8, color: colors.ink }} />
      <TouchableOpacity
        onPress={async () => {
          const data = await draftAnswerRemote(state.library, prompt);
          setDraft(data.draft || '');
          setNote(data.note || '');
        }}
        accessibilityRole="button"
      >
        <Text style={{ color: colors.brand }}>Lag utkast fra biblioteket</Text>
      </TouchableOpacity>
      {draft ? <Text style={{ color: colors.ink }}>{draft}</Text> : null}
      {note ? <Text style={{ color: colors.muted }}>{note}</Text> : null}
      </View>
      ) : null}
      {!open && note ? <Text style={{ color: colors.muted }}>{note}</Text> : null}
    </View>
  );
}
