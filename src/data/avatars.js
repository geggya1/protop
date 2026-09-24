export const PEOPLE_AVATARS = [
  { id: 'fox', emoji: '🦊', color: '#f97316' },
  { id: 'panda', emoji: '🐼', color: '#64748b' },
  { id: 'frog', emoji: '🐸', color: '#22c55e' },
  { id: 'unicorn', emoji: '🦄', color: '#a855f7' },
  { id: 'bear', emoji: '🐻', color: '#b45309' },
  { id: 'bunny', emoji: '🐰', color: '#fb7185' },
  { id: 'cat', emoji: '🐱', color: '#f59e0b' },
  { id: 'dog', emoji: '🐶', color: '#d97706' },
  { id: 'lion', emoji: '🦁', color: '#eab308' },
  { id: 'koala', emoji: '🐨', color: '#94a3b8' },
  { id: 'penguin', emoji: '🐧', color: '#334155' },
  { id: 'owl', emoji: '🦉', color: '#92400e' },
  { id: 'bee', emoji: '🐝', color: '#facc15' },
  { id: 'butterfly', emoji: '🦋', color: '#38bdf8' },
  { id: 'star', emoji: '⭐', color: '#e2a325' },
  { id: 'rainbow', emoji: '🌈', color: '#2563eb' },
];

export const GROUP_AVATARS = [
  { id: 'home', emoji: '🏠', color: '#2563eb' },
  { id: 'hearts', emoji: '💙', color: '#2563eb' },
  { id: 'ball', emoji: '⚽', color: '#2563eb' },
  { id: 'book', emoji: '📚', color: '#7c3aed' },
  { id: 'church', emoji: '⛪', color: '#0f766e' },
  { id: 'star', emoji: '🌟', color: '#e2a325' },
  { id: 'people', emoji: '👪', color: '#2563eb' },
  { id: 'camp', emoji: '⛺', color: '#b45309' },
  { id: 'music', emoji: '🎵', color: '#db2777' },
];

export const GROUP_TYPES = [
  'family', 'friends', 'team', 'class', 'classroom', 'congregation', 'club', 'group', 'daycare', 'company',
];

export function avatarById(id, list = PEOPLE_AVATARS) {
  return list.find((a) => a.id === id) || list[0];
}
