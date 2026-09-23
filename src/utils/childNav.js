/** Serializable child fields for web URLs (avoid `child=[object Object]`). */

export function serialChild(child) {
  if (!child || typeof child !== 'object') return null;
  const id = String(child.id || child.childId || '').trim();
  if (!id || id === '[object Object]') return null;
  return {
    id,
    childId: String(child.childId || id),
    name: String(child.name || ''),
  };
}

export function childFromRouteParams(params = {}) {
  const fromChild = serialChild(params.child);
  if (fromChild) return fromChild;
  const id = String(params.childId || params.id || '').trim();
  if (!id || id === '[object Object]') return null;
  return {
    id,
    childId: id,
    name: String(params.childName || ''),
  };
}

export function paramBool(value, fallback = false) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

export function aiImportNavParams({ familyId, child, ...rest } = {}) {
  const c = serialChild(child);
  const params = {
    familyId: familyId || '',
    childId: c?.id || '',
    childName: c?.name || '',
  };
  Object.entries(rest).forEach(([key, val]) => {
    if (val === undefined || val === null || val === false) return;
    params[key] = val;
  });
  return params;
}

export function childScheduleNavParams({ familyId, child, canEdit } = {}) {
  const c = serialChild(child);
  const params = {
    familyId: familyId || '',
    childId: c?.id || '',
    childName: c?.name || '',
  };
  if (canEdit === true || canEdit === 'true') params.canEdit = true;
  if (canEdit === false || canEdit === 'false') params.canEdit = false;
  return params;
}

export function lekserNavParams({ familyId, child, canEdit } = {}) {
  return childScheduleNavParams({ familyId, child, canEdit });
}

export function klassenNavParams({ familyId, child } = {}) {
  const c = serialChild(child);
  return {
    familyId: familyId || '',
    childId: c?.id || '',
    childName: c?.name || '',
    child: c || undefined,
  };
}
