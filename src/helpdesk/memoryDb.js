/**
 * Liten Firestore i minnet med akkurat det service.js bruker
 * (collection/doc/get/set/update/where '=='/runTransaction).
 * Brukes av testene og av den lokale demoen (/helpdesk-demo, /hjelp-demo).
 */

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function createMemoryDb(seed = null) {
  const store = new Map(seed ? Object.entries(seed) : []);
  let auto = 0;
  const nextId = () => {
    auto += 1;
    return `m${Date.now().toString(36)}${String(auto).padStart(4, '0')}`;
  };
  const snap = (path) => ({
    id: path.split('/').pop(),
    exists: store.has(path),
    ref: docRef(path),
    data: () => clone(store.get(path)),
  });
  function docRef(path) {
    return {
      id: path.split('/').pop(),
      path,
      async get() { return snap(path); },
      async set(data, opts) {
        const prev = store.get(path);
        store.set(path, opts?.merge && prev ? { ...prev, ...clone(data) } : clone(data));
      },
      async update(data) {
        if (!store.has(path)) throw new Error(`Dokumentet finnes ikke: ${path}`);
        store.set(path, { ...store.get(path), ...clone(data) });
      },
      async delete() { store.delete(path); },
      collection(name) { return colRef(`${path}/${name}`); },
    };
  }
  function colRef(path, filters = []) {
    return {
      doc(id) { return docRef(`${path}/${id || nextId()}`); },
      async add(data) {
        const ref = docRef(`${path}/${nextId()}`);
        await ref.set(data);
        return ref;
      },
      where(field, op, value) { return colRef(path, [...filters, [field, op, value]]); },
      async get() {
        const depth = path.split('/').length + 1;
        const docs = [...store.keys()]
          .filter((k) => k.startsWith(`${path}/`) && k.split('/').length === depth)
          .map((k) => snap(k))
          .filter((s) => filters.every(([f, , v]) => s.data()?.[f] === v));
        return { docs, size: docs.length, empty: !docs.length };
      },
    };
  }
  return {
    store,
    collection: (name) => colRef(name),
    async runTransaction(fn) {
      return fn({
        get: (ref) => ref.get(),
        set: (ref, data, opts) => ref.set(data, opts),
        update: (ref, data) => ref.update(data),
        delete: (ref) => ref.delete(),
      });
    },
    dump: () => Object.fromEntries(store),
  };
}
