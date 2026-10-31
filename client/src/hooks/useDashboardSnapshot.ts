import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../lib/http.js";

interface Snapshot<T> {
  identity: string | null;
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  forbidden: boolean;
}

export function useDashboardSnapshot<T>(identity: string, load: (signal: AbortSignal) => Promise<T>, enabled = true) {
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({
    identity: null,
    data: null,
    loading: true,
    error: null,
    forbidden: false,
  });
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const previousIdentity = useRef(identity);
  const identityGeneration = useRef(0);
  if (previousIdentity.current !== identity) {
    previousIdentity.current = identity;
    identityGeneration.current += 1;
  }
  const scopedIdentity = `${identity}:${identityGeneration.current}`;

  useEffect(() => {
    const currentGeneration = ++generation.current;
    if (!enabled) {
      setSnapshot({ identity: scopedIdentity, data: null, loading: false, error: null, forbidden: false });
      return () => {
        if (generation.current === currentGeneration) generation.current += 1;
      };
    }
    const controller = new AbortController();
    setSnapshot((current) => current.identity === scopedIdentity
      ? { ...current, loading: true, error: null, forbidden: false }
      : { identity: scopedIdentity, data: null, loading: true, error: null, forbidden: false });

    load(controller.signal)
      .then((data) => {
        if (generation.current === currentGeneration) {
          setSnapshot({ identity: scopedIdentity, data, loading: false, error: null, forbidden: false });
        }
      })
      .catch((caught: unknown) => {
        if (generation.current !== currentGeneration || controller.signal.aborted) return;
        const error = caught instanceof ApiError
          ? caught
          : new ApiError(0, "UNEXPECTED", "The service is unavailable. Please try again.");
        if (error.status === 401 || error.status === 403) {
          setSnapshot({ identity: scopedIdentity, data: null, loading: false, error, forbidden: error.status === 403 });
        } else {
          setSnapshot((current) => ({
            identity: scopedIdentity,
            data: current.identity === scopedIdentity ? current.data : null,
            loading: false,
            error,
            forbidden: false,
          }));
        }
      });

    return () => {
      controller.abort();
      if (generation.current === currentGeneration) generation.current += 1;
    };
  }, [scopedIdentity, load, reload, enabled]);

  const current = snapshot.identity === scopedIdentity
    ? snapshot
    : { identity: scopedIdentity, data: null, loading: true, error: null, forbidden: false };

  const refresh = useCallback(() => setReload((value) => value + 1), []);
  return { ...current, refresh };
}
