/* db.js — שכבת אחסון מקומית (IndexedDB) לאפליקציית ניהול הכיתה.
   כל הנתונים נשמרים במכשיר בלבד ואינם נשלחים לשום שרת חיצוני. */

const DB_NAME = 'teacherClassAppDB';
const DB_VERSION = 1;
let _dbPromise = null;

const STORE_DEFS = [
  { name: 'students', indexes: [] },
  { name: 'enrollments', indexes: [['studentId', 'studentId']] },
  { name: 'events', indexes: [] },
  { name: 'eventStudents', indexes: [['eventId', 'eventId'], ['studentId', 'studentId']] },
  { name: 'parentConversations', indexes: [['studentId', 'studentId']] },
  { name: 'pedagogicalNeeds', indexes: [['studentId', 'studentId']] },
  { name: 'tasks', indexes: [['studentId', 'studentId']] },
  { name: 'attachments', indexes: [['eventId', 'eventId'], ['studentId', 'studentId']] },
  { name: 'schedule', indexes: [] },
];

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      STORE_DEFS.forEach((def) => {
        if (!db.objectStoreNames.contains(def.name)) {
          const store = db.createObjectStore(def.name, { keyPath: 'id', autoIncrement: true });
          def.indexes.forEach(([idxName, keyPath]) => store.createIndex(idxName, keyPath));
        }
      });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _dbPromise;
}

async function txStore(storeName, mode) {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  return { tx, store: tx.objectStore(storeName) };
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  async add(storeName, obj) {
    const { store } = await txStore(storeName, 'readwrite');
    return reqToPromise(store.add(obj));
  },
  async put(storeName, obj) {
    const { store } = await txStore(storeName, 'readwrite');
    return reqToPromise(store.put(obj));
  },
  async get(storeName, id) {
    const { store } = await txStore(storeName, 'readonly');
    return reqToPromise(store.get(id));
  },
  async getAll(storeName) {
    const { store } = await txStore(storeName, 'readonly');
    return reqToPromise(store.getAll());
  },
  async delete(storeName, id) {
    const { store } = await txStore(storeName, 'readwrite');
    return reqToPromise(store.delete(id));
  },
  async getByIndex(storeName, indexName, value) {
    const { store } = await txStore(storeName, 'readonly');
    const idx = store.index(indexName);
    return reqToPromise(idx.getAll(value));
  },
  async clear(storeName) {
    const { store } = await txStore(storeName, 'readwrite');
    return reqToPromise(store.clear());
  },
  async exportAll() {
    const data = {};
    for (const def of STORE_DEFS) {
      data[def.name] = await DB.getAll(def.name);
    }
    data._exportedAt = new Date().toISOString();
    data._version = DB_VERSION;
    return data;
  },
  async importAll(data, { replace = true } = {}) {
    for (const def of STORE_DEFS) {
      if (!Array.isArray(data[def.name])) continue;
      if (replace) await DB.clear(def.name);
      const { store } = await txStore(def.name, 'readwrite');
      for (const item of data[def.name]) {
        store.put(item);
      }
    }
  },
};
