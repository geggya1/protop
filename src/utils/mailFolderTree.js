const WELL_ORDER = ['inbox', 'drafts', 'sentitems', 'junkemail', 'deleteditems', 'archive', 'outbox'];

export function sortMailFolderNodes(nodes) {
  return [...(nodes || [])]
    .sort((a, b) => {
      const ai = WELL_ORDER.indexOf(a.wellKnownName);
      const bi = WELL_ORDER.indexOf(b.wellKnownName);
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return String(a.name || '').localeCompare(String(b.name || ''), 'nb');
    })
    .map((n) => ({ ...n, children: sortMailFolderNodes(n.children || []) }));
}

function nestByParentId(flat) {
  const nodes = (flat || []).map((f) => ({ ...f, children: [] }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots = [];
  nodes.forEach((n) => {
    const parent = n.parentFolderId ? byId.get(n.parentFolderId) : null;
    if (parent && parent.id !== n.id) parent.children.push(n);
    else roots.push(n);
  });
  return sortMailFolderNodes(roots);
}

function nestByDepth(flat) {
  const roots = [];
  const stack = [];
  for (const f of flat || []) {
    const node = { ...f, children: [] };
    const depth = Number(f.depth || 0);
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    if (!stack.length) roots.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return sortMailFolderNodes(roots);
}

/** Build a nested folder tree from the flat Graph list. */
export function nestMailFolders(flat) {
  const list = flat || [];
  if (list.some((f) => f.parentFolderId)) return nestByParentId(list);
  return nestByDepth(list);
}

export function flattenMailFolders(nodes, out = []) {
  (nodes || []).forEach((n) => {
    out.push(n);
    flattenMailFolders(n.children, out);
  });
  return out;
}

export function favoriteMailFolders(tree) {
  const all = flattenMailFolders(tree);
  return ['inbox', 'sentitems']
    .map((well) => all.find((f) => f.wellKnownName === well))
    .filter(Boolean);
}

export function expandAncestorIds(tree, folderId) {
  const ids = new Set();
  const walk = (nodes, trail) => {
    for (const n of nodes || []) {
      if (n.id === folderId) {
        trail.forEach((id) => ids.add(id));
        return true;
      }
      if (walk(n.children, [...trail, n.id])) return true;
    }
    return false;
  };
  walk(tree, []);
  return ids;
}

/** Rows currently visible in the Outlook-style folder tree. */
export function visibleMailFolderRows(tree, expandedIds) {
  const open = expandedIds instanceof Set ? expandedIds : new Set(expandedIds || []);
  const rows = [];
  const walk = (nodes, depth) => {
    (nodes || []).forEach((n) => {
      const children = n.children || [];
      const hasKids = children.length > 0 || Number(n.childFolderCount || 0) > 0;
      const expanded = hasKids && open.has(n.id);
      rows.push({
        id: n.id,
        name: n.name,
        unread: n.unread || 0,
        wellKnownName: n.wellKnownName || null,
        depth,
        hasKids,
        expanded,
      });
      if (expanded) walk(children, depth + 1);
    });
  };
  walk(tree, 0);
  return rows;
}

export function mailFolderIcon(well) {
  if (well === 'inbox') return 'file-tray-outline';
  if (well === 'sentitems') return 'send-outline';
  if (well === 'drafts') return 'document-text-outline';
  if (well === 'deleteditems') return 'trash-outline';
  if (well === 'junkemail') return 'alert-circle-outline';
  if (well === 'archive') return 'archive-outline';
  if (well === 'outbox') return 'exit-outline';
  return 'folder-outline';
}
