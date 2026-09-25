// Zustand's persist middleware calls storage.getItem() synchronously during
// store creation. Next.js App Router renders "use client" components on the
// server for the initial HTML pass, where `localStorage` does not exist.
// This wrapper provides a no-op fallback on the server and defers to the
// real localStorage in the browser, preventing SSR crashes.

type StorageLike = {
  getItem: (name: string) => string | null | Promise<string | null>;
  setItem: (name: string, value: string) => void | Promise<void>;
  removeItem: (name: string) => void | Promise<void>;
};

const noopStorage: StorageLike = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export function getSafeStorage(): StorageLike {
  if (typeof window === "undefined") return noopStorage;
  return window.localStorage;
}
