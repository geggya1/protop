/**
 * Filer per ansatt: mapper og filer i én liste, koblet med parentId.
 * Rene hjelpere uten Firebase, så de kan testes direkte.
 */

function text(value) {
  return String(value ?? '').trim();
}

/** Rader som ikke er slettet, for én mappe. Mapper først, så alfabetisk. */
export function folderChildren(entries = [], parentId = '') {
  const parent = text(parentId);
  return (entries || [])
    .filter((row) => row && row.deleted !== true && text(row.parentId) === parent)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return text(a.name).localeCompare(text(b.name), 'nb');
    });
}

/** Sti fra roten til mappen, for brødsmuler. */
export function folderTrail(entries = [], folderId = '') {
  const byId = new Map((entries || []).filter((row) => row?.kind === 'folder').map((row) => [row.id, row]));
  const trail = [];
  const seen = new Set();
  let cursor = byId.get(text(folderId));
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    trail.unshift({ id: cursor.id, name: text(cursor.name) || 'Mappe' });
    cursor = byId.get(text(cursor.parentId));
  }
  return trail;
}

/** Alle etterkommere av en mappe (for sletting av hele mappen). */
export function descendantIds(entries = [], folderId = '') {
  const out = [];
  const queue = [text(folderId)];
  while (queue.length) {
    const id = queue.shift();
    for (const row of entries || []) {
      if (row && row.deleted !== true && text(row.parentId) === id) {
        out.push(row.id);
        if (row.kind === 'folder') queue.push(row.id);
      }
    }
  }
  return out;
}

export function cleanEntryName(value) {
  return text(value).replace(/[\\/]+/g, '-').replace(/\s+/g, ' ').slice(0, 120);
}

/** Trygt filnavn i lagringsstien. */
export function storageSafeName(value) {
  const name = (cleanEntryName(value) || 'fil')
    .replace(/[æÆ]/g, 'ae').replace(/[øØ]/g, 'o').replace(/[åÅ]/g, 'a');
  return name.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 80) || 'fil';
}

export function formatEntrySize(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
