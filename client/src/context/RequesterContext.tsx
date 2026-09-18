import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import type { DevRequester } from "../types/index.js";

/**
 * Compatibility surface for the Lab 2 component fixtures.
 *
 * The Lab 3 application does not mount this provider, does not expose the
 * selector route, and does not persist requester identity. Authenticated
 * identity now comes only from AuthProvider and the server session cookie.
 */
interface RequesterContextValue {
  requester: DevRequester | null;
  hydrating: boolean;
  selectRequester: (requester: DevRequester) => void;
  clearRequester: () => void;
}

const RequesterContext = createContext<RequesterContextValue | null>(null);

export function RequesterProvider({ children }: { children: ReactNode }) {
  const value = useMemo<RequesterContextValue>(
    () => ({
      requester: null,
      hydrating: false,
      selectRequester: () => undefined,
      clearRequester: () => undefined,
    }),
    []
  );

  return <RequesterContext.Provider value={value}>{children}</RequesterContext.Provider>;
}

export function useRequester(): RequesterContextValue {
  const context = useContext(RequesterContext);
  if (!context) throw new Error("useRequester must be used inside RequesterProvider.");
  return context;
}
