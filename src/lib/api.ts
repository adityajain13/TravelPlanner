import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export const API = "/travelplanner/api";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "same-origin",
    ...init,
    headers: init.body ? { "Content-Type": "application/json", ...init.headers } : init.headers,
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body;
}

/*
 * Session state. The cookie lasts a year (HttpOnly, so JS can't see it); we cache the email
 * in localStorage so the app opens instantly — and offline — without waiting on /me.
 */

type Status = "loading" | "in" | "out";
interface SessionCtx {
  status: Status;
  email: string | null;
  setEmail: (e: string | null) => void;
  logout: () => Promise<void>;
}

const KEY = "tp-session";
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const write = (e: string | null) => {
  try {
    if (e) localStorage.setItem(KEY, e);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [email, setEmailState] = useState<string | null>(read);
  const [status, setStatus] = useState<Status>(read() ? "in" : "loading");

  const setEmail = useCallback((e: string | null) => {
    write(e);
    setEmailState(e);
    setStatus(e ? "in" : "out");
  }, []);

  useEffect(() => {
    api<{ email: string }>("/auth/me")
      .then((r) => setEmail(r.email))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) setEmail(null);
        // Offline / server unreachable: trust the cached session
        else setStatus(read() ? "in" : "out");
      });
  }, [setEmail]);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setEmail(null);
  }, [setEmail]);

  return createElement(Ctx.Provider, { value: { status, email, setEmail, logout } }, children);
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSession outside SessionProvider");
  return c;
}

export interface ServerTrip {
  id: string;
  title: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  updated_at: number;
  /** Present on trips someone shared with your account. */
  owner?: string;
  role?: "view" | "edit";
}

export const shareUrl = (token: string) => `${location.origin}/travelplanner/s/${token}`;
