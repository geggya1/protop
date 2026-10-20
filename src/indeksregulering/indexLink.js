/** Dyp lenke til indeksarbeidsflaten. Skallet leser denne på /hjem. */

export function indexLinkFromPath(path) {
  const raw = String(path || '');
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1).split('#')[0] : '';
  if (!query || !/(?:^|&)indeksAvtale=/.test(query)) return null;
  const params = new URLSearchParams(query);
  const contractId = params.get('indeksAvtale') || '';
  if (!contractId) return null;
  return {
    tab: 'okonomi',
    subView: 'indeks',
    intent: {
      type: 'openIndexDraft',
      contractId,
      workspaceCaseId: params.get('indeksSak') || '',
      view: params.get('indeksVis') || '',
    },
  };
}
