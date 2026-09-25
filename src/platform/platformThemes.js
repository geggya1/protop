/**
 * Plattformtemaer — samme typografi/radius som familie og idrettslag,
 * men tydelig egen fargeidentitet per plattformtype.
 */

export const friendsColors = {
  bg: '#e8f4fc',
  surface: '#ffffff',
  surface2: '#dbeafe',
  line: '#bae6fd',
  ink: '#1a2744',
  muted: '#5b6b82',
  brand: '#0ea5e9',
  brandSoft: '#e0f2fe',
  accent: '#0284c7',
  accentSoft: 'rgba(14, 165, 233, 0.14)',
  tint: '#0369a1',
  tintSoft: '#7dd3fc',
  success: '#16a34a',
  card: '#ffffff',
  fab: '#0ea5e9',
  stripe: '#38bdf8',
  tabBar: '#f0f9ff',
};

export const congregationColors = {
  bg: '#eef2f6',
  surface: '#ffffff',
  surface2: '#e2e8f0',
  line: '#cbd5e1',
  ink: '#1a2744',
  muted: '#5b6b82',
  brand: '#475569',
  brandSoft: '#e2e8f0',
  accent: '#0f766e',
  accentSoft: 'rgba(15, 118, 110, 0.14)',
  tint: '#334155',
  tintSoft: '#94a3b8',
  success: '#16a34a',
  card: '#ffffff',
  fab: '#475569',
  stripe: '#64748b',
  tabBar: '#f8fafc',
};

export const daycareColors = {
  bg: '#fff1f3',
  surface: '#ffffff',
  surface2: '#ffe4e6',
  line: '#fecdd3',
  ink: '#1a2744',
  muted: '#5b6b82',
  brand: '#e11d48',
  brandSoft: '#ffe4e6',
  accent: '#be123c',
  accentSoft: 'rgba(225, 29, 72, 0.12)',
  tint: '#9f1239',
  tintSoft: '#fda4af',
  success: '#16a34a',
  card: '#ffffff',
  fab: '#e11d48',
  stripe: '#f43f5e',
  tabBar: '#fff5f7',
};

export const flexGroupColors = {
  bg: '#f1f5f9',
  surface: '#ffffff',
  surface2: '#e2e8f0',
  line: '#cbd5e1',
  ink: '#1a2744',
  muted: '#5b6b82',
  brand: '#334155',
  brandSoft: '#e2e8f0',
  accent: '#1099F4',
  accentSoft: 'rgba(16, 153, 244, 0.12)',
  tint: '#1e293b',
  tintSoft: '#94a3b8',
  success: '#16a34a',
  card: '#ffffff',
  fab: '#334155',
  stripe: '#475569',
  tabBar: '#f8fafc',
};

export const companyColors = {
  bg: '#f4f8fc',
  surface: '#ffffff',
  surface2: '#E5F6FE',
  line: '#d7e7f5',
  ink: '#1a2744',
  muted: '#5b6b82',
  brand: '#1099F4',
  brandSoft: '#E5F6FE',
  accent: '#0284c7',
  accentSoft: 'rgba(16, 153, 244, 0.14)',
  tint: '#0369a1',
  tintSoft: '#7dd3fc',
  success: '#16a34a',
  card: '#ffffff',
  fab: '#1099F4',
  stripe: '#38bdf8',
  tabBar: '#f8fbfe',
};

export function themeForType(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'friends') return friendsColors;
  if (t === 'congregation') return congregationColors;
  if (t === 'daycare') return daycareColors;
  if (t === 'group') return flexGroupColors;
  if (t === 'company') return companyColors;
  return friendsColors;
}
