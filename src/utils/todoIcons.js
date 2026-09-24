import { Platform } from 'react-native';
import { TASK_TEMPLATES } from '../data/taskTemplates.js';

const BY_FILE = Object.fromEntries(TASK_TEMPLATES.map((t) => [t.file, t.icon]));
const BY_TITLE = Object.fromEntries(
  TASK_TEMPLATES.map((t) => [String(t.title || '').toLowerCase(), t.icon]),
);

const KEYWORD_ICONS = [
  [/brett.*klær|legge sammen klær|klær.*brett|fold|vaske klær|skittentøy/, '👔'],
  [/seng|re opp/, '🛏️'],
  [/lekser|homework/, '📚'],
  [/tenner|pusse/, '🦷'],
  [/søppel|søpla|trash/, '🗑️'],
  [/støvsug|vacuum|moppe|gulv|feie/, '🧹'],
  [/leker|toys|etter lek/, '🧸'],
  [/hund|dog|kjæledyr/, '🐕'],
  [/plante|blomst|vanne/, '🌱'],
  [/sekk|skole/, '🎒'],
  [/lese|bok/, '📖'],
  [/oppvask/, '🍽️'],
  [/middag|frokost|matpakke|matlag|kok/, '🍳'],
  [/rydde.*rom|rydde kjøkken/, '🧹'],
  [/dusje|badet/, '🚿'],
  [/trene|instrument/, '🏃'],
  [/posten|post/, '📬'],
  [/handling|handle/, '🛒'],
];

/** Emoji for et gjøremål — fra iconFile, tittel-treff, eller kategori. */
export function todoEmoji(task) {
  if (!task) return '⭐';
  if (task.iconFile && BY_FILE[task.iconFile]) return BY_FILE[task.iconFile];
  const title = String(task.title || '').toLowerCase().trim();
  if (title && BY_TITLE[title]) return BY_TITLE[title];
  if (title.length >= 3) {
    for (const [key, icon] of Object.entries(BY_TITLE)) {
      if (title.includes(key) || (key.length >= 3 && key.includes(title))) return icon;
    }
    for (const [re, icon] of KEYWORD_ICONS) {
      if (re.test(title)) return icon;
    }
  }
  if (String(task.category || '').toLowerCase() === 'lekser') return '📚';
  return '⭐';
}

/**
 * Sti til ikonbilde.
 * Web: statisk /icons/catalog/… (public/) — unngår Storage/CORS-tomme bokser.
 * Native: Firebase Storage-sti.
 */
export function todoIconPath(task) {
  if (!task?.iconFile) return null;
  if (Platform.OS === 'web') {
    return `/icons/catalog/${task.iconFile}`;
  }
  return `icons/catalog/${task.iconFile}`;
}
