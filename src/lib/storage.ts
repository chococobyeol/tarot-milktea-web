import type {
  FollowupRecord,
  ReadingPlan,
  ReadingResult,
  SelectedCard,
} from "@/src/lib/tarot";

export interface SavedReading {
  id: string;
  createdAt: string;
  nickname: string;
  question: string;
  plan: ReadingPlan;
  cards: SelectedCard[];
  result: ReadingResult;
  followups: FollowupRecord[];
}

const DATABASE_NAME = "tarot-milktea";
const STORE_NAME = "readings";
const DATABASE_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("로컬 기록 데이터베이스를 열 수 없습니다."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("로컬 기록 작업에 실패했습니다."));
  });
}

export async function saveReading(record: SavedReading): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    await requestResult(transaction.objectStore(STORE_NAME).put(record));
  } finally {
    database.close();
  }
}

export async function listReadings(): Promise<SavedReading[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll());
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } finally {
    database.close();
  }
}

export async function deleteReading(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    await requestResult(transaction.objectStore(STORE_NAME).delete(id));
  } finally {
    database.close();
  }
}

export async function clearReadings(): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    await requestResult(transaction.objectStore(STORE_NAME).clear());
  } finally {
    database.close();
  }
}
