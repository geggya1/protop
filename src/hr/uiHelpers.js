/** Delte presentasjons-hjelpere for HR-skjermer (uten React). */

export function toneColor(tone, colors) {
  if (tone === 'good') return colors.success || '#15803d';
  if (tone === 'warn') return colors.warning || '#b45309';
  if (tone === 'bad') return colors.danger || '#b91c1c';
  return colors.muted;
}

export function shortDateRangeLabel(fromIso, toIso) {
  const from = String(fromIso || '').slice(0, 10);
  const to = String(toIso || '').slice(0, 10);
  if (!from && !to) return '';
  return `${from || '…'} – ${to || '…'}`;
}

export function pctWidth(pct) {
  const n = Math.max(0, Math.min(100, Number(pct) || 0));
  return `${n}%`;
}
