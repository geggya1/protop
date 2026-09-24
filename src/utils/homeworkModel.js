import { addDays, dateKey, startOfWeekMonday } from './dates.js';

export const HOMEWORK_SUBJECTS = [
  { id: 'matematikk', label: 'Matte', icon: 'calculator-outline' },
  { id: 'norsk', label: 'Norsk', icon: 'book-outline' },
  { id: 'engelsk', label: 'Engelsk', icon: 'language-outline' },
  { id: 'naturfag', label: 'Naturfag', icon: 'leaf-outline' },
  { id: 'samfunnsfag', label: 'Samfunn', icon: 'globe-outline' },
  { id: 'rle', label: 'KRLE', icon: 'people-outline' },
  { id: 'kroppsoving', label: 'Gym', icon: 'walk-outline' },
  { id: 'kunst', label: 'Kunst', icon: 'color-palette-outline' },
  { id: 'musikk', label: 'Musikk', icon: 'musical-notes-outline' },
  { id: 'annet', label: 'Annet', icon: 'help-circle-outline' },
];

const SUBJECT_INFER = [
  { id: 'matematikk', match: /regning|matt|matematikk/i },
  { id: 'norsk', match: /lesing|\blese\b|skriving|norsk/i },
  { id: 'engelsk', match: /engelsk/i },
  { id: 'naturfag', match: /natur/i },
  { id: 'samfunnsfag', match: /samfunn/i },
  { id: 'rle', match: /krle|\brle\b|religion/i },
  { id: 'kroppsoving', match: /kroppsøving|kroppsoving|\bgym\b|idrett|svøm/i },
  { id: 'kunst', match: /kunst|håndverk|handverk/i },
  { id: 'musikk', match: /musikk/i },
];

/** Voksne (foresatt/admin) kan importere og administrere lekser, også i barnets mobilvisning. Innlogget barn kan ikke. */
export function canAdultEditHomework({ isParent, isChild, isAdmin } = {}) {
  if (isChild) return false;
  return !!(isParent || isAdmin);
}

/**
 * Barn (eller «se som barn») kan opprette/redigere lekser når Lekser-appen
 * er slått på og homeworkSelfEdit ikke er skrudd av (standard: på).
 */
export function canCreateHomework({
  isParent,
  isChild,
  isActingAsChild,
  isAdmin,
  homeworkSelfEdit,
  lekserAllowed,
} = {}) {
  if (canAdultEditHomework({ isParent, isChild, isAdmin })) return true;
  const asChild = !!(isChild || isActingAsChild);
  if (!asChild) return false;
  if (lekserAllowed === false) return false;
  return homeworkSelfEdit !== false;
}

export function subjectLabel(id) {
  const found = HOMEWORK_SUBJECTS.find((s) => s.id === id);
  return found?.label || '';
}

export function subjectMeta(id) {
  return HOMEWORK_SUBJECTS.find((s) => s.id === id) || HOMEWORK_SUBJECTS[HOMEWORK_SUBJECTS.length - 1];
}

export function inferSubjectId(text) {
  const blob = String(text || '').trim();
  if (!blob) return null;
  const asId = HOMEWORK_SUBJECTS.find((s) => s.id === blob.toLowerCase());
  if (asId) return asId.id;
  const asLabel = HOMEWORK_SUBJECTS.find((s) => s.label.toLowerCase() === blob.toLowerCase());
  if (asLabel) return asLabel.id;
  const found = SUBJECT_INFER.find((s) => s.match.test(blob));
  return found?.id || 'annet';
}

/** Keep an already-chosen fag id; otherwise infer from fag + tittel. */
export function resolveHomeworkSubjectId(subject, title) {
  const sid = String(subject || '').trim().toLowerCase();
  if (HOMEWORK_SUBJECTS.some((s) => s.id === sid)) return sid;
  return inferSubjectId(`${subject || ''} ${title || ''}`) || 'annet';
}

export function weekBoundsKeys(refDate = new Date()) {
  const mon = startOfWeekMonday(refDate);
  return {
    startKey: dateKey(mon),
    endKey: dateKey(addDays(mon, 4)),
    sundayKey: dateKey(addDays(mon, 6)),
  };
}

export function isHomeworkDone(item, todayKey) {
  if (!item) return false;
  if (item.done === true) return true;
  const k = typeof todayKey === 'string' ? todayKey : dateKey(todayKey || new Date());
  const completed = Array.isArray(item.completedDates) ? item.completedDates : [];
  return completed.includes(k);
}

export function mapHomework(id, data = {}) {
  const dueDate = data.dueDate || data.endKey || null;
  return {
    id,
    title: data.title || 'Lekse',
    description: data.description || '',
    subject: data.subject || inferSubjectId(`${data.title || ''} ${data.description || ''}`) || 'annet',
    dueDate,
    startKey: data.startKey || null,
    assignedTo: data.assignedTo || null,
    assignedToName: data.assignedToName || null,
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    done: data.done === true,
    completedDates: Array.isArray(data.completedDates) ? data.completedDates : [],
    active: data.active !== false,
    deleted: data.deleted === true,
    source: data.source || 'manual',
    createdBy: data.createdBy || null,
    createdAt: data.createdAt || null,
    childId: data.childId || null,
    sourceTodoId: data.sourceTodoId || null,
  };
}

/** Map an old category=lekser todo so it can still appear in Lekser. */
export function homeworkFromLegacyTodo(todo, { childId } = {}) {
  if (!todo) return null;
  return mapHomework(todo.id, {
    title: todo.title,
    description: todo.description || '',
    subject: inferSubjectId(`${todo.title || ''} ${todo.description || ''}`),
    dueDate: todo.endKey || todo.dueDate || todo.deadline || null,
    startKey: todo.startKey || null,
    assignedTo: todo.assignedTo || childId || null,
    attachments: [],
    done: false,
    completedDates: Array.isArray(todo.completedDates) ? todo.completedDates : [],
    active: todo.active !== false,
    deleted: todo.deleted === true,
    source: 'legacy-todo',
    createdBy: todo.createdBy || null,
    createdAt: todo.createdAt || null,
    childId: childId || todo.childId || null,
    sourceTodoId: todo.id,
  });
}

export function homeworkInWeek(items, refDate = new Date()) {
  const { startKey, sundayKey } = weekBoundsKeys(refDate);
  const current = weekBoundsKeys(new Date());
  const isCurrentWeek = current.startKey === startKey;
  return (items || []).filter((item) => {
    if (!item || item.deleted || item.active === false) return false;
    const due = item.dueDate || item.endKey || null;
    const start = item.startKey || due;
    if (due || start) {
      const from = start || due;
      const to = due || start;
      return from <= sundayKey && to >= startKey;
    }
    return isCurrentWeek;
  });
}

export function formatHomeworkDue(dueDate) {
  if (!dueDate) return null;
  const [y, m, d] = String(dueDate).split('-').map(Number);
  if (!y || !m || !d) return dueDate;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('no-NO', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function homeworkHelpPrompt(item) {
  if (!item) return '';
  const subject = subjectLabel(item.subject);
  const parts = [];
  parts.push(`Hjelp meg med leksen «${item.title}».`);
  if (subject) parts.push(`Fag: ${subject}.`);
  if (item.description) parts.push(String(item.description).trim());
  if (item.dueDate) parts.push(`Frist: ${item.dueDate}.`);
  return parts.join('\n');
}

export function mergeLekserForWeek({ homework = [], legacyTodos = [], refDate, childId } = {}) {
  const hw = homeworkInWeek(homework, refDate);
  const seenTitles = new Set(hw.map((h) => `${h.sourceTodoId || ''}::${String(h.title || '').toLowerCase()}`));
  const legacy = (legacyTodos || [])
    .filter((t) => t && !t.migratedToHomeworkId)
    .map((t) => homeworkFromLegacyTodo(t, { childId }))
    .filter(Boolean)
    .filter((item) => homeworkInWeek([item], refDate).length > 0)
    .filter((item) => !seenTitles.has(`${item.sourceTodoId}::${String(item.title || '').toLowerCase()}`));
  return [...hw, ...legacy];
}

/** Group lekser by canonical subject id, preserving HOMEWORK_SUBJECTS order. */
export function groupHomeworkBySubject(items = []) {
  const buckets = new Map(HOMEWORK_SUBJECTS.map((s) => [s.id, []]));
  (items || []).forEach((item) => {
    const id = HOMEWORK_SUBJECTS.some((s) => s.id === item?.subject)
      ? item.subject
      : (inferSubjectId(`${item?.subject || ''} ${item?.title || ''}`) || 'annet');
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push({ ...item, subject: id });
  });
  return HOMEWORK_SUBJECTS
    .filter((s) => (buckets.get(s.id) || []).length > 0)
    .map((s) => ({
      id: s.id,
      label: s.label,
      icon: s.icon,
      items: buckets.get(s.id),
    }));
}
