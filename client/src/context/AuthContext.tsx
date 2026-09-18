import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { changePassword as changePasswordRequest, fetchCurrentUser, login, logout } from "../api/auth.js";
import { ApiError, setAuthFailureHandler, setCsrfToken } from "../lib/http.js";
import type { Role, SafeUser } from "../types/index.js";

export type AuthStatus = "loading" | "unauthenticated" | "password-change-required" | "authenticated" | "forbidden" | "error";

interface AuthContextValue {
  status: AuthStatus;
  user: SafeUser | null;
  error: ApiError | null;
  signIn: (email: string, password: string) => Promise<SafeUser>;
  signOut: () => Promise<void>;
  updatePassword: (currentPassword: string, newPassword: string, confirmation: string) => Promise<SafeUser>;
  refresh: () => Promise<SafeUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function statusForUser(user: SafeUser): AuthStatus {
  return user.mustChangePassword ? "password-change-required" : "authenticated";
}

function safeFailure(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError(0, "UNEXPECTED", "The service is unavailable. Please try again.");
}

export function landingPath(user: Pick<SafeUser, "role" | "mustChangePassword">): string {
  if (user.mustChangePassword) return "/change-password";
  if (user.role === "REQUESTER") return "/tickets";
  if (user.role === "STAFF") return "/staff/tickets";
  return "/admin/users";
}

export function roleLabel(role: Role): string {
  if (role === "ADMIN") return "Administrator";
  if (role === "STAFF") return "IT Staff";
  return "Requester";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<SafeUser | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const applyAuth = useCallback((nextUser: SafeUser, token: string) => {
    setUser(nextUser);
    setCsrfToken(token);
    setError(null);
    setStatus(statusForUser(nextUser));
  }, []);

  const clearAuth = useCallback((nextStatus: AuthStatus = "unauthenticated") => {
    setUser(null);
    setCsrfToken(null);
    setError(null);
    setStatus(nextStatus);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchCurrentUser();
      applyAuth(result.user, result.csrfToken);
      return result.user;
    } catch (caught) {
      const failure = safeFailure(caught);
      if (failure.status === 401) clearAuth();
      else if (failure.status === 403) {
        setUser(null);
        setCsrfToken(null);
        setError(failure);
        setStatus("forbidden");
      } else {
        setError(failure);
        setStatus("error");
      }
      return null;
    }
  }, [applyAuth, clearAuth]);

  useEffect(() => {
    const handleAuthFailure = (failure: ApiError) => {
      if (failure.status === 401) {
        clearAuth();
      } else if (failure.code === "PASSWORD_CHANGE_REQUIRED") {
        setError(failure);
        setStatus("password-change-required");
      }
    };
    setAuthFailureHandler(handleAuthFailure);
    return () => setAuthFailureHandler(null);
  }, [clearAuth]);

  useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then((result) => {
        if (active) applyAuth(result.user, result.csrfToken);
      })
      .catch((caught) => {
        if (!active) return;
        const failure = safeFailure(caught);
        if (failure.status === 401) clearAuth();
        else if (failure.status === 403) {
          setUser(null);
          setCsrfToken(null);
          setError(failure);
          setStatus("forbidden");
        } else {
          setError(failure);
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [applyAuth, clearAuth]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await login(email, password);
    applyAuth(result.user, result.csrfToken);
    return result.user;
  }, [applyAuth]);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      // Clear the in-memory token even if the network is unavailable. The
      // browser can no longer issue another authenticated mutation afterward.
      clearAuth();
    }
  }, [clearAuth]);

  const updatePassword = useCallback(async (currentPassword: string, newPassword: string, confirmation: string) => {
    const result = await changePasswordRequest(currentPassword, newPassword, confirmation);
    applyAuth(result.user, result.csrfToken);
    return result.user;
  }, [applyAuth]);

  const value = useMemo(
    () => ({ status, user, error, signIn, signOut, updatePassword, refresh }),
    [status, user, error, signIn, signOut, updatePassword, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
