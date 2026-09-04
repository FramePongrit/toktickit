import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { setRequesterId } from "../lib/http.js";
import { fetchDevRequesters } from "../api/referenceData.js";
import type { DevRequester } from "../types/index.js";

const STORAGE_KEY = "toktickit.requesterId";

interface RequesterContextValue {
  requester: DevRequester | null;
  /** False while the stored selection is being revalidated on first load. */
  hydrating: boolean;
  selectRequester: (requester: DevRequester) => void;
  clearRequester: () => void;
}

const RequesterContext = createContext<RequesterContextValue | null>(null);

function readStoredId(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : Number(raw) || null;
  } catch {
    // Private browsing and blocked site data both throw here.
    return null;
  }
}

function writeStoredId(id: number | null): void {
  try {
    if (id === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, String(id));
    }
  } catch {
    // Losing persistence is survivable; the selection still works this session.
  }
}

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequester] = useState<DevRequester | null>(null);
  const [hydrating, setHydrating] = useState(true);

  // Persistence matters beyond convenience: the E2E run and the screenshot
  // script both reload pages, and a selection that did not survive a reload
  // would send them back to the selector every time.
  useEffect(() => {
    const storedId = readStoredId();
    if (storedId === null) {
      setHydrating(false);
      return;
    }

    let cancelled = false;

    // Revalidated against the server rather than trusted: a requester
    // deactivated between sessions must not stay selected (BR-07).
    fetchDevRequesters()
      .then((active) => {
        if (cancelled) return;
        const match = active.find((candidate) => candidate.id === storedId) ?? null;
        if (match) {
          setRequester(match);
          setRequesterId(match.id);
        } else {
          writeStoredId(null);
        }
      })
      .catch(() => {
        // Leave the selection empty; the guard sends the user to the selector,
        // which shows its own failure state.
        if (!cancelled) writeStoredId(null);
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectRequester = useCallback((next: DevRequester) => {
    setRequester(next);
    setRequesterId(next.id);
    writeStoredId(next.id);
  }, []);

  const clearRequester = useCallback(() => {
    setRequester(null);
    setRequesterId(null);
    writeStoredId(null);
  }, []);

  const value = useMemo(
    () => ({ requester, hydrating, selectRequester, clearRequester }),
    [requester, hydrating, selectRequester, clearRequester]
  );

  return <RequesterContext.Provider value={value}>{children}</RequesterContext.Provider>;
}

export function useRequester(): RequesterContextValue {
  const context = useContext(RequesterContext);
  if (!context) {
    throw new Error("useRequester must be used inside a RequesterProvider.");
  }
  return context;
}
