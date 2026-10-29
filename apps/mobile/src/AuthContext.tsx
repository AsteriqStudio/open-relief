import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import * as SecureStore from './secureStorage';
import { currentUser, signIn, signOut, signUp } from './api';
import type { AuthUser } from './api';

const TOKEN_KEY = 'open_relief_session_token';
const SANDBOX_URL_KEY = 'open_relief_sandbox_url';
const roles = ['recipient', 'donor', 'admin'] as const;
type PersonaRole = typeof roles[number];
const roleTokenKey = (role: PersonaRole) => `open_relief_persona_${role}`;
export async function clearStoredSessions(): Promise<void> {
  await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), ...roles.map((role) => SecureStore.deleteItemAsync(roleTokenKey(role)))]);
}
export async function getRememberedSandboxUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(SANDBOX_URL_KEY);
}
export async function prepareSandboxSession(apiUrl: string): Promise<void> {
  if (await getRememberedSandboxUrl() !== apiUrl) await clearStoredSessions();
  await SecureStore.setItemAsync(SANDBOX_URL_KEY, apiUrl);
}
type AuthContextValue = {
  loading: boolean;
  user: AuthUser | null;
  token: string | null;
  savedPersonas: PersonaRole[];
  signIn(input: { email: string; password: string }): Promise<void>;
  signUp(input: { email: string; password: string; phone: string; role: 'recipient' | 'donor'; legalName?: string; assistanceProgram?: 'SNAP' | 'MEDICAID' | 'LIHEAP' | 'NONE' }): Promise<void>;
  signOut(): Promise<void>;
  switchPersona(role: PersonaRole): Promise<void>;
  addPersona(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [savedPersonas, setSavedPersonas] = useState<PersonaRole[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const saved = await SecureStore.getItemAsync(TOKEN_KEY);
      const savedRoles = await Promise.all(roles.map(async (role) => ({ role, token: await SecureStore.getItemAsync(roleTokenKey(role)) })));
      if (active) setSavedPersonas(savedRoles.filter((item) => item.token !== null).map((item) => item.role));
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
    await SecureStore.setItemAsync(roleTokenKey(session.user.role), session.token);
    setToken(session.token);
    setUser(session.user);
    setSavedPersonas((current) => current.includes(session.user.role) ? current : [...current, session.user.role]);
  }

  const value: AuthContextValue = {
    loading, user, token, savedPersonas,
    async signIn(input) { await acceptSession(await signIn(input)); },
    async signUp(input) { await acceptSession(await signUp(input)); },
    async signOut() {
      const savedTokens = await Promise.all(roles.map((role) => SecureStore.getItemAsync(roleTokenKey(role))));
      await Promise.allSettled([...savedTokens, token].filter((value): value is string => value !== null).map((value) => signOut(value)));
      await clearStoredSessions();
      setSavedPersonas([]); setToken(null); setUser(null);
    },
    async switchPersona(role) {
      const saved = await SecureStore.getItemAsync(roleTokenKey(role));
      if (!saved) throw new Error(`Sign in to a ${role} account first`);
      try {
        const restored = await currentUser(saved);
        if (restored.role !== role) throw new Error('Saved account role changed');
        await SecureStore.setItemAsync(TOKEN_KEY, saved);
        setToken(saved); setUser(restored);
      } catch {
        await SecureStore.deleteItemAsync(roleTokenKey(role));
        setSavedPersonas((current) => current.filter((candidate) => candidate !== role));
        throw new Error('Saved persona expired. Sign in again.');
      }
    },
    async addPersona() {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setToken(null); setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth requires AuthProvider');
  return value;
}
