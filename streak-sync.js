// VI: Chỉ giữ dấu mốc luyện tập chưa đồng bộ; không lưu mã nguồn hay đáp án.
// EN: Keep pending study marks only; never store source code or test answers here.
const DB_NAME = "onluyencpp-streak-v1";
const STORE_NAME = "pending_days";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("IndexedDB unavailable"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, operation) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
      transaction.oncomplete = () => resolve(result);
    });
  } finally {
    db.close();
  }
}

export const pendingStreakDays = {
  async list(userId) {
    const all = await transact("readonly", (store) => store.getAll());
    return all.filter((entry) => entry.userId === userId).sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  },
  put(entry) {
    return transact("readwrite", (store) => store.put(entry));
  },
  delete(key) {
    return transact("readwrite", (store) => store.delete(key));
  },
};
