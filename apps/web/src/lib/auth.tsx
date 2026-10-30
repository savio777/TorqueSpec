"use client";

import type { LoginInput, User } from "@torquespec/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, setUnauthorizedHandler, tokenStore } from "./api";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "authenticated"; user: User }
  | { status: "anonymous"; user: null };

interface AuthContextValue {
  state: AuthState;
  login: (input: LoginInput) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });
  const router = useRouter();
  const queryClient = useQueryClient();

  const logout = useCallback(() => {
    tokenStore.clear();
    queryClient.clear();
    setState({ status: "anonymous", user: null });
    router.replace("/login");
  }, [queryClient, router]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(undefined);
  }, [logout]);

  // Restaura a sessão a partir do token salvo.
  useEffect(() => {
    const restore = tokenStore.get() ? api.me() : Promise.reject(new Error("sem token"));
    restore
      .then((user) => {
        if (user.role !== "admin") throw new ApiError(403, "FORBIDDEN", "Acesso restrito a administradores");
        setState({ status: "authenticated", user });
      })
      .catch(() => {
        tokenStore.clear();
        setState({ status: "anonymous", user: null });
      });
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const response = await api.login(input);
    if (response.user.role !== "admin") {
      throw new ApiError(403, "FORBIDDEN", "Este painel é restrito a administradores");
    }
    tokenStore.set(response.accessToken);
    setState({ status: "authenticated", user: response.user });
  }, []);

  const value = useMemo(() => ({ state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return context;
}
