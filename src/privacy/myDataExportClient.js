/**
 * Henter dine egne data med din vanlige lesetilgang og lagrer dem som JSON
 * (nedlasting på web, deling i appen). Feiler en samling på tilgang, hoppes den over.
 */
import { Platform, Share } from 'react-native';
import {
  collection, doc, getDoc, getDocs, limit, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { loadLocalConsents } from '../utils/consents';
import { chatVisibleToUser } from '../utils/chatsLogic';
import { buildMyDataExport, exportCount, exportFileName } from './myDataExport';

const MAX_ROWS = 2000;
const MAX_MESSAGES = 1000;

async function rows(q) {
  try {
    const snap = await getDocs(q);
    return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch {
    return [];
  }
}

function uniqueById(lists) {
  const seen = new Map();
  for (const row of lists.flat()) if (row?.id && !seen.has(row.id)) seen.set(row.id, row);
  return [...seen.values()];
}

async function withMessages(chats, path) {
  return Promise.all(chats.map(async (chat) => ({
    ...chat,
    messages: await rows(query(collection(db, ...path, chat.id, 'messages'), limit(MAX_MESSAGES))),
  })));
}

async function companyData(family, uid) {
  const id = family.id;
  const col = (name) => collection(db, 'families', id, name);
  const employees = await rows(query(col('employees'), where('personUid', '==', uid), limit(5)));
  const employeeIds = employees.map((row) => row.id);
  const byEmployee = async (name) => uniqueById(await Promise.all(
    employeeIds.map((employeeId) => rows(query(col(name), where('employeeId', '==', employeeId), limit(MAX_ROWS)))),
  ));
  const [notes, tasksMine, tasksAssigned, eventsMine, eventsShared, timeEntries, absences, expenses, chatDocs] = await Promise.all([
    rows(query(col('notes'), where('memberIds', 'array-contains', uid), limit(MAX_ROWS))),
    rows(query(col('parentTodos'), where('createdBy', '==', uid), limit(MAX_ROWS))),
    rows(query(col('parentTodos'), where('assignedTo', '==', uid), limit(MAX_ROWS))),
    rows(query(col('events'), where('createdBy', '==', uid), limit(MAX_ROWS))),
    rows(query(col('events'), where('memberIds', 'array-contains', uid), limit(MAX_ROWS))),
    byEmployee('timeEntries'),
    byEmployee('absences'),
    byEmployee('projectExpenses'),
    rows(query(col('chats'), limit(300))),
  ]);
  const chats = await withMessages(
    chatDocs.filter((chat) => chatVisibleToUser(chat.id, chat, uid)),
    ['families', id, 'chats'],
  );
  return {
    id,
    name: family.company?.navn || family.name || '',
    type: family.type || '',
    employees,
    notes,
    tasks: uniqueById([tasksMine, tasksAssigned]),
    events: uniqueById([eventsMine, eventsShared]),
    timeEntries,
    absences,
    expenses,
    chats,
  };
}

/** Bygger hele filen. `families` er gruppene brukeren er med i (fra AppContext). */
export async function collectMyData({ user, families = [] } = {}) {
  const uid = user?.uid;
  if (!uid) throw new Error('Du må være innlogget.');
  const live = (families || []).filter((row) => row?.id && row.deleted !== true && row.hiddenFromApp !== true);
  const userCol = (name) => collection(db, 'users', uid, name);
  const [profileSnap, localConsents, companies, notifications, aiChats, voiceNotes, supportTickets, calendarConnections, friendChatDocs] = await Promise.all([
    getDoc(doc(db, 'users', uid)).catch(() => null),
    loadLocalConsents().catch(() => null),
    Promise.all(live.map((family) => companyData(family, uid))),
    rows(query(userCol('notifications'), limit(500))),
    rows(query(userCol('aiChats'), limit(MAX_ROWS))),
    rows(query(userCol('voiceNotes'), limit(MAX_ROWS))),
    rows(query(userCol('supportTickets'), limit(MAX_ROWS))),
    rows(query(userCol('calendarConnections'), limit(50))),
    rows(query(collection(db, 'friendChats'), where('memberIds', 'array-contains', uid), limit(200))),
  ]);
  const friendChats = await withMessages(friendChatDocs, ['friendChats']);
  return buildMyDataExport({
    uid,
    account: {
      email: user.email || '',
      displayName: user.displayName || '',
      providers: (user.providerData || []).map((row) => row?.providerId).filter(Boolean),
    },
    profile: profileSnap?.exists?.() ? profileSnap.data() : null,
    localConsents,
    companies,
    personal: {
      notifications, aiChats, voiceNotes, supportTickets, calendarConnections,
    },
    friendChats,
  });
}

/** Lagrer filen: nedlasting på web, delingsark på mobil. Svarer med antall rader. */
export async function downloadMyData({ user, families } = {}) {
  const data = await collectMyData({ user, families });
  const json = JSON.stringify(data, null, 2);
  const filename = exportFileName();
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } else {
    await Share.share({ title: filename, message: json });
  }
  return { filename, count: exportCount(data) };
}
