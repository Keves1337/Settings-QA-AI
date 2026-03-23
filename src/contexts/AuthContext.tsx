import { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from "react";

const AUTH_KEY = "bqa_auth_v1";
const SESSION_TS_KEY = "bqa_session_ts";
const VALID_USERNAME = "Settings";
const VALID_PASSWORD = "Sqi4hjwq";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface AuthContextValue {
  isAuthenticated: boolean;
  failedAttempts: number;
  lockoutUntil: number | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      if (localStorage.getItem(AUTH_KEY) !== "true") return false;
      const ts = Number(localStorage.getItem(SESSION_TS_KEY) || 0);
      if (Date.now() - ts > SESSION_TIMEOUT_MS) return false;
      return true;
    } catch { return false; }
  });

  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const activityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetSessionTimer = useCallback(() => {
    try { localStorage.setItem(SESSION_TS_KEY, String(Date.now())); } catch {}
    if (activityTimer.current) clearTimeout(activityTimer.current);
    activityTimer.current = setTimeout(() => {
      setIsAuthenticated(false);
      try { localStorage.removeItem(AUTH_KEY); localStorage.removeItem(SESSION_TS_KEY); } catch {}
    }, SESSION_TIMEOUT_MS);
  }, []);

  // Track user activity to reset the session timer
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

  // Clear lockout when timer expires
  useEffect(() => {
    if (!lockoutUntil) return;
    const remaining = lockoutUntil - Date.now();
    if (remaining <= 0) { setLockoutUntil(null); setFailedAttempts(0); return; }
    const t = setTimeout(() => { setLockoutUntil(null); setFailedAttempts(0); }, remaining);
    return () => clearTimeout(t);
  }, [lockoutUntil]);

  const login = (username: string, password: string): boolean => {
    if (lockoutUntil && Date.now() < lockoutUntil) return false;

    const trimmedUser = username.trim();
    if (trimmedUser === VALID_USERNAME && password === VALID_PASSWORD) {
      setIsAuthenticated(true);
      setFailedAttempts(0);
      setLockoutUntil(null);
      return true;
    }

    const next = failedAttempts + 1;
    setFailedAttempts(next);
    if (next >= MAX_ATTEMPTS) {
      setLockoutUntil(Date.now() + LOCKOUT_MS);
    }
    return false;
  };

  const logout = () => {
    try { localStorage.removeItem(AUTH_KEY); localStorage.removeItem(SESSION_TS_KEY); } catch {}
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
