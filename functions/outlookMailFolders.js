export const FOLDER_LABELS = {
  inbox: 'Innboks',
  sentitems: 'Sendte elementer',
  drafts: 'Kladd',
  deleteditems: 'Slettede elementer',
  junkemail: 'Søppelpost',
  archive: 'Arkiv',
  outbox: 'Utboks',
};

/** v1.0 mailFolder has no wellKnownName on many tenants — do not $select it. */
export const FOLDER_SELECT = 'id,displayName,parentFolderId,unreadItemCount,totalItemCount,childFolderCount';
export const WELL_KNOWN_FOLDER_IDS = [
  'inbox', 'sentitems', 'drafts', 'deleteditems', 'junkemail', 'archive', 'outbox',
];

const DISPLAY_TO_WELL = {
  inbox: 'inbox',
  innboks: 'inbox',
  'sent items': 'sentitems',
  sentitems: 'sentitems',
  'sendte elementer': 'sentitems',
  drafts: 'drafts',
  kladd: 'drafts',
  utkast: 'drafts',
  'deleted items': 'deleteditems',
  'slettede elementer': 'deleteditems',
  'junk email': 'junkemail',
  'junk e-mail': 'junkemail',
  søppelpost: 'junkemail',
  archive: 'archive',
  arkiv: 'archive',
  outbox: 'outbox',
  utboks: 'outbox',
};

export function inferWellKnownName(raw, idToWell = new Map()) {
  if (raw?.id && idToWell.has(raw.id)) return idToWell.get(raw.id);
  const fromApi = String(raw?.wellKnownName || '').toLowerCase();
  if (fromApi) return fromApi;
  const name = String(raw?.displayName || '').trim().toLowerCase();
  return DISPLAY_TO_WELL[name] || null;
}

export function mapMailFolder(raw, depth = 0, idToWell = new Map()) {
  const well = inferWellKnownName(raw, idToWell);
  return {
    id: raw.id,
    name: FOLDER_LABELS[well] || raw.displayName || 'Mappe',
    wellKnownName: well || null,
    parentFolderId: raw.parentFolderId || null,
    unread: Number(raw.unreadItemCount || 0),
    total: Number(raw.totalItemCount || 0),
    childFolderCount: Number(raw.childFolderCount || 0),
    depth,
  };
}

/** One Graph roundtrip covers top folders + first child level. */
export const FOLDER_CHILD_EXPAND = `childFolders($select=${FOLDER_SELECT};$top=50)`;

export const PRIMARY_WELL_KNOWN = ['inbox', 'sentitems'];

/**
 * Flatten a Graph mailFolders page, including expanded childFolders.
 * Returns folders plus parents that still need extra child fetches.
 */
export function collectExpandedFolders(rawList, idToWell = new Map(), depth = 0) {
  const folders = [];
  const pending = [];

  const walk = (raw, d) => {
    if (!raw?.id) return;
    const folder = mapMailFolder(raw, d, idToWell);
    folders.push(folder);
    const kids = Array.isArray(raw.childFolders) ? raw.childFolders : [];
    if (kids.length) {
      kids.forEach((kid) => walk(kid, d + 1));
      return;
    }
    if (folder.childFolderCount > 0 && d < 4) pending.push(folder);
  };

  (rawList || []).forEach((raw) => walk(raw, depth));
  return { folders, pending };
}

export function missingPrimaryWellKnown(folders) {
  const have = new Set((folders || []).map((f) => f.wellKnownName).filter(Boolean));
  return PRIMARY_WELL_KNOWN.filter((name) => !have.has(name));
}

export function applyWellKnownIds(folders, idToWell) {
  if (!idToWell?.size) return folders || [];
  return (folders || []).map((f) => {
    const well = idToWell.get(f.id);
    if (!well) return f;
    return {
      ...f,
      wellKnownName: well,
      name: FOLDER_LABELS[well] || f.name,
    };
  });
}
