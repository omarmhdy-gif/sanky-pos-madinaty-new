import type { AppData } from "@/lib/types";

const DATABASE_NAME = "sanky-pos-local";
const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = "posSnapshots";

interface StoredSnapshot {
  branchId: string;
  savedAt: string;
  data: AppData;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Local POS storage is unavailable in this environment."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE, { keyPath: "branchId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local POS storage."));
    request.onblocked = () => reject(new Error("Local POS storage upgrade is blocked by another open window."));
  });
}

export async function savePosSnapshot(branchId: string, data: AppData): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(SNAPSHOT_STORE, "readwrite");
      transaction.objectStore(SNAPSHOT_STORE).put({
        branchId,
        savedAt: new Date().toISOString(),
        data,
      } satisfies StoredSnapshot);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the local POS snapshot."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Saving the local POS snapshot was cancelled."));
    });
  } finally {
    database.close();
  }
}

export async function loadPosSnapshot(branchId: string): Promise<StoredSnapshot | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(SNAPSHOT_STORE, "readonly").objectStore(SNAPSHOT_STORE).get(branchId);
      request.onsuccess = () => resolve((request.result as StoredSnapshot | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Could not read the local POS snapshot."));
    });
  } finally {
    database.close();
  }
}
