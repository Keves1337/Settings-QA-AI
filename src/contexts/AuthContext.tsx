import { createContext, useContext, useState, ReactNode, useEffect } from "react";

const AUTH_KEY = "bqa_auth_v1";
const VALID_USERNAME = "Settings";
const VALID_PASSWORD = "Sqi4hjwq";

interface AuthContextValue {
  isAuthenticated: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTH_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(AUTH_KEY, isAuthenticated ? "true" : "false");
    } catch {}
  }, [isAuthenticated]);

  const login = (username: string, password: string): boolean => {
    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    try { localStorage.removeItem(AUTH_KEY); } catch {}
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
