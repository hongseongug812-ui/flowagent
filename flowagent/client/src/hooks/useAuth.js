import { useState, useCallback, createContext, useContext } from "react";
import { API_BASE } from "../utils/constants";

export const AuthContext = createContext(null);

export function useAuthProvider() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fa_user")); } catch { return null; }
  });

  const getToken = () => localStorage.getItem("fa_token");

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem("fa_token", data.token);
    localStorage.setItem("fa_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem("fa_token", data.token);
    localStorage.setItem("fa_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("fa_token");
    localStorage.removeItem("fa_user");
    setUser(null);
  }, []);

  return { user, getToken, login, register, logout };
}

export function useAuth() {
  return useContext(AuthContext);
}
