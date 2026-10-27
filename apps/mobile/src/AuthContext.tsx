import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { currentUser, signIn, signOut, signUp } from './api';
import type { AuthUser } from './api';

const TOKEN_KEY = 'open_relief_session_token';
type AuthContextValue = {
  loading: boolean;
  user: AuthUser | null;
  token: string | null;
  signIn(input: { email: string; password: string }): Promise<void>;
  signUp(input: { email: string; password: string; phone: string; role: 'recipient' | 'donor'; legalName?: string; assistanceProgram?: 'SNAP' | 'MEDICAID' | 'LIHEAP' | 'NONE' }): Promise<void>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const saved = await SecureStore.getItemAsync(TOKEN_KEY);
      if (saved) {
        try {
          const restored = await currentUser(saved);
          if (active) { setToken(saved); setUser(restored); }
        } catch {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
        }
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  async function acceptSession(session: { token: string; user: AuthUser }) {
    await SecureStore.setItemAsync(TOKEN_KEY, session.token);
    setToken(session.token);
    setUser(session.user);
  }

  const value: AuthContextValue = {
    loading, user, token,
    async signIn(input) { await acceptSession(await signIn(input)); },
    async signUp(input) { await acceptSession(await signUp(input)); },
    async signOut() {
      try { if (token) await signOut(token); }
      finally { await SecureStore.deleteItemAsync(TOKEN_KEY); setToken(null); setUser(null); }
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth requires AuthProvider');
  return value;
}
