const DB_NAME = "spool_manager_db";
const DB_VERSION = 1;
const STORE = "spools";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("createdAt", "createdAt");
        os.createIndex("material", "material");
        os.createIndex("brand", "brand");
        os.createIndex("color", "color");
        os.createIndex("state", "state");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    fn(store, resolve, reject);
    t.oncomplete = () => db.close();
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

async function dbGetAllSpools() {
  return tx("readonly", (store, resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbUpsertSpool(spool) {
  return tx("readwrite", (store, resolve, reject) => {
    const req = store.put(spool);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function dbDeleteSpool(id) {
  return tx("readwrite", (store, resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
