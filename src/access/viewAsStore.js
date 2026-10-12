import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'protop.viewAs';
const EMPTY = { key: '', employeeId: '', lens: 'all' };

let state = { ...EMPTY };
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

function readStored() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      key: String(parsed.key || ''),
      employeeId: String(parsed.employeeId || ''),
      lens: parsed.lens === 'companySettings' ? 'companySettings' : 'all',
    };
  } catch {
    return null;
  }
}

function persist(next) {
  state = next;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Visningen virker videre i minnet om lagring er stengt.
  }
  emit();
}

const stored = readStored();
if (stored) state = stored;

export function viewAsKey(uid, familyId) {
  return `${uid || ''}:${familyId || ''}`;
}

export function getViewAsSelection() {
  return state;
}

export function setViewAsEmployee(uid, familyId, employeeId) {
  const key = viewAsKey(uid, familyId);
  persist({
    key,
    employeeId: String(employeeId || ''),
    lens: state.key === key ? state.lens : 'all',
  });
}

export function setViewAsLens(uid, familyId, lens) {
  const key = viewAsKey(uid, familyId);
  persist({
    key,
    employeeId: state.key === key ? state.employeeId : '',
    lens: lens === 'companySettings' ? 'companySettings' : 'all',
  });
}

export function clearViewAs() {
  persist({ ...EMPTY });
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useViewAsSelection() {
  return useSyncExternalStore(subscribe, getViewAsSelection, getViewAsSelection);
}
