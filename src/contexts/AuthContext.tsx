import { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from "react";

const AUTH_KEY = "bqa_auth_v1";
const SESSION_TS_KEY = "bqa_session_ts";
const LOCKOUT_KEY = "bqa_lockout_until";
const ATTEMPTS_KEY = "bqa_failed_attempts";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface AuthContextValue {
  isAuthenticated: boolean;
  failedAttempts: number;
  lockoutUntil: number | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readLockout(): number | null {
  try {
    const v = localStorage.getItem(LOCKOUT_KEY);
    if (!v) return null;
    const n = Number(v);
    if (isNaN(n) || Date.now() >= n) {
      localStorage.removeItem(LOCKOUT_KEY);
      localStorage.removeItem(ATTEMPTS_KEY);
      return null;
    }
    return n;
  } catch { return null; }
}

function readAttempts(): number {
  try { return Number(localStorage.getItem(ATTEMPTS_KEY) || 0); } catch { return 0; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      if (localStorage.getItem(AUTH_KEY) !== "true") return false;
      const ts = Number(localStorage.getItem(SESSION_TS_KEY) || 0);
      if (Date.now() - ts > SESSION_TIMEOUT_MS) return false;
      return true;
    } catch { return false; }
  });

  const [failedAttempts, setFailedAttempts] = useState<number>(() => readAttempts());
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(() => readLockout());
  const activityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetSessionTimer = useCallback(() => {
    try { localStorage.setItem(SESSION_TS_KEY, String(Date.now())); } catch {}
    if (activityTimer.current) clearTimeout(activityTimer.current);
    activityTimer.current = setTimeout(() => {
      setIsAuthenticated(false);
      try { localStorage.removeItem(AUTH_KEY); localStorage.removeItem(SESSION_TS_KEY); } catch {}
    }, SESSION_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    resetSessionTimer();
    const events = ["mousemove", "keydown", "touchstart", "click", "scroll"];
    const handler = () => resetSessionTimer();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (activityTimer.current) clearTimeout(activityTimer.current);
    };
  }, [isAuthenticated, resetSessionTimer]);

  useEffect(() => {
    try {
      if (isAuthenticated) {
        localStorage.setItem(AUTH_KEY, "true");
        localStorage.setItem(SESSION_TS_KEY, String(Date.now()));
      } else {
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(SESSION_TS_KEY);
      }
    } catch {}
  }, [isAuthenticated]);

  const login = async (username: string, password: string): Promise<boolean> => {
    if (lockoutUntil && Date.now() < lockoutUntil) return false;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setIsAuthenticated(true);
          setFailedAttempts(0);
          setLockoutUntil(null);
          try {
            localStorage.removeItem(LOCKOUT_KEY);
            localStorage.removeItem(ATTEMPTS_KEY);
          } catch {}
          return true;
        }
      }
    } catch {
      // Network error — still count as failed attempt
    }

    const next = failedAttempts + 1;
    setFailedAttempts(next);
    try { localStorage.setItem(ATTEMPTS_KEY, String(next)); } catch {}

    if (next >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_MS;
      setLockoutUntil(until);
      try { localStorage.setItem(LOCKOUT_KEY, String(until)); } catch {}
    }

    return false;
  };

  const logout = () => {
    try {
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(SESSION_TS_KEY);
    } catch {}
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, failedAttempts, lockoutUntil, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
