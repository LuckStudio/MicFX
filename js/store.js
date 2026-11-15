/* MicFX · almacenamiento: ajustes (localStorage) y grabaciones (IndexedDB) */

const PREFIX = 'micfx2-';

export const store = {
  get(k, d) { try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) {} },
  clear() {
    try { Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  }
};

/* Grabaciones guardadas en el navegador */
const DB = 'micfx', TAKES = 'takes';
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('sin IndexedDB'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(TAKES, {keyPath: 'id'});
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
function tx(mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(TAKES, mode), s = t.objectStore(TAKES), r = fn(s);
    t.oncomplete = () => res(r && r.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}
export const takesDB = {
  all: () => tx('readonly', s => s.getAll()).then(a => (a || []).sort((x, y) => y.id - x.id)).catch(() => []),
  put: t => tx('readwrite', s => s.put(t)).catch(() => {}),
  del: id => tx('readwrite', s => s.delete(id)).catch(() => {})
};
